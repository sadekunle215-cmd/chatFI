// api/lock.js — Jupiter Lock on-chain transaction builder
//
// Jupiter Lock has NO REST API — it is a pure on-chain Anchor program.
// Program ID: LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn
//
// This route handles:
//   action:"create"   → build a createVestingEscrow transaction for the user to sign
//   action:"accounts" → fetch existing locks via Jupiter Lock public index API
//
// Drop into /api alongside jupiter.js, send.js, etc.

import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  Keypair,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

const LOCK_PROGRAM_ID = new PublicKey("LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn");
const RPC_URL         = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";

// Anchor discriminator for createVestingEscrow
// = first 8 bytes of sha256("global:create_vesting_escrow")
// Verified against jup-lock source (programs/locker/src/instructions/)
const CREATE_DISC = Buffer.from([185, 131, 167, 212, 173, 21, 238, 76]);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { action, ...body } = req.body || {};

  // ── Action: fetch existing lock accounts for a wallet ─────────────────────
  if (action === "accounts") {
    const { wallet } = body;
    if (!wallet) return res.status(400).json({ error: "Missing wallet" });

    try {
      // Jupiter's public lock index endpoints (no API key needed, read-only)
      const endpoints = [
        `https://lock-api.jup.ag/v1/locks?funder=${wallet}&limit=50`,
        `https://lock-api.jup.ag/v1/locks?recipient=${wallet}&limit=50`,
        // Fallback to the lock.jup.ag public API
        `https://api.jup.ag/lock/v1/locks?wallet=${wallet}`,
        `https://api.jup.ag/lock/v1/locks?recipient=${wallet}`,
      ];

      const seen     = new Set();
      const accounts = [];

      const results = await Promise.allSettled(
        endpoints.map(url => fetch(url).then(r => r.ok ? r.json() : null))
      );

      for (const result of results) {
        if (result.status !== "fulfilled" || !result.value) continue;
        const locks = result.value?.locks || result.value?.data || result.value || [];
        if (!Array.isArray(locks)) continue;
        for (const lock of locks) {
          const key = lock.pubkey || lock.address || lock.id || JSON.stringify(lock);
          if (seen.has(key)) continue;
          seen.add(key);
          accounts.push(lock);
        }
      }

      return res.status(200).json({ accounts });
    } catch (err) {
      console.error("[api/lock] accounts:", err);
      return res.status(500).json({ error: err?.message || "Failed to fetch lock accounts" });
    }
  }

  // ── Action: build createVestingEscrow transaction ─────────────────────────
  if (action === "create") {
    const { funder, recipient, mint, amount, cliffSecs, vestingSecs } = body;

    if (!funder) return res.status(400).json({ error: "Missing: funder" });
    if (!mint)   return res.status(400).json({ error: "Missing: mint" });
    if (!amount || amount === "0") return res.status(400).json({ error: "Missing or zero: amount" });

    try {
      const connection   = new Connection(RPC_URL, "confirmed");
      const funderKey    = new PublicKey(funder);
      const recipientKey = new PublicKey(recipient?.trim() || funder);
      const mintKey      = new PublicKey(mint);

      // ── Random base keypair — used as seed for escrow PDA ─────────────────
      // This is how Jupiter Lock derives a unique escrow address per lock.
      const base = Keypair.generate();

      const [escrowPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("vesting_escrow"), base.publicKey.toBuffer()],
        LOCK_PROGRAM_ID
      );

      // ── Token accounts ────────────────────────────────────────────────────
      const funderATA = await getAssociatedTokenAddress(
        mintKey, funderKey, false, TOKEN_PROGRAM_ID
      );
      const escrowATA = await getAssociatedTokenAddress(
        mintKey, escrowPDA, true /* allowOwnerOffCurve */, TOKEN_PROGRAM_ID
      );

      // ── Anchor event authority (required by all Jupiter Lock instructions) ─
      const [eventAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from("__event_authority")],
        LOCK_PROGRAM_ID
      );

      // ── Vesting parameter calculation ─────────────────────────────────────
      //
      // Jupiter Lock's createVestingEscrow parameters:
      //   vestingStartTime  = unix ts: when vesting clock starts
      //   cliffTime         = unix ts: no tokens claimable before this
      //   frequency         = seconds per period (we use 86400 = 1 day)
      //   cliffUnlockAmount = tokens released instantly at cliffTime
      //   amountPerPeriod   = tokens released per frequency interval after cliff
      //   numberOfPeriod    = total number of vesting periods
      //
      // We map frontend (cliffSecs, vestingSecs):
      //   - "1 year lock" → cliff=365d, vesting=365d
      //     → cliffUnlockAmount = 0, all tokens vest linearly daily after cliff
      //   - Total = cliffUnlockAmount + (amountPerPeriod * numberOfPeriod)
      //     We set cliffUnlockAmount = remainder so sum is exact.

      const nowSecs        = BigInt(Math.floor(Date.now() / 1000));
      const cliffSec       = BigInt(Math.max(parseInt(cliffSecs)   || 0,     0));
      const vestingSec     = BigInt(Math.max(parseInt(vestingSecs)  || 86400, 86400));
      const totalAmount    = BigInt(amount);
      const FREQUENCY      = BigInt(86400); // daily

      const vestingStartTime  = nowSecs;
      const cliffTime         = nowSecs + cliffSec;
      const numberOfPeriod    = vestingSec / FREQUENCY || BigInt(1);
      const amountPerPeriod   = totalAmount / numberOfPeriod;
      // Any remainder from integer division goes to cliffUnlockAmount
      const cliffUnlockAmount = totalAmount - (amountPerPeriod * numberOfPeriod);
      const updateRecipientMode = 0; // 0 = only creator can update recipient

      // ── Encode instruction data ───────────────────────────────────────────
      // [8 disc][8 vestingStartTime][8 cliffTime][8 frequency]
      // [8 cliffUnlockAmount][8 amountPerPeriod][8 numberOfPeriod][1 updateRecipientMode]
      const data   = Buffer.alloc(8 + 6 * 8 + 8 + 1); // 65 bytes total
      let   offset = 0;

      CREATE_DISC.copy(data, offset);                        offset += 8;
      data.writeBigUInt64LE(vestingStartTime,  offset);      offset += 8;
      data.writeBigUInt64LE(cliffTime,         offset);      offset += 8;
      data.writeBigUInt64LE(FREQUENCY,         offset);      offset += 8;
      data.writeBigUInt64LE(cliffUnlockAmount, offset);      offset += 8;
      data.writeBigUInt64LE(amountPerPeriod,   offset);      offset += 8;
      data.writeBigUInt64LE(numberOfPeriod,    offset);      offset += 8;
      data.writeUInt8(updateRecipientMode,     offset);

      // ── Account metas (matches create_vesting_escrow context in Rust) ─────
      const keys = [
        { pubkey: base.publicKey,             isSigner: true,  isWritable: false }, // base seed keypair
        { pubkey: escrowPDA,                  isSigner: false, isWritable: true  }, // escrow state account
        { pubkey: escrowATA,                  isSigner: false, isWritable: true  }, // escrow token vault
        { pubkey: funderKey,                  isSigner: true,  isWritable: true  }, // funder (fee payer + token source)
        { pubkey: funderATA,                  isSigner: false, isWritable: true  }, // funder token account
        { pubkey: recipientKey,               isSigner: false, isWritable: false }, // recipient
        { pubkey: mintKey,                    isSigner: false, isWritable: false }, // SPL token mint
        { pubkey: TOKEN_PROGRAM_ID,           isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId,    isSigner: false, isWritable: false },
        { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID,isSigner: false, isWritable: false },
        { pubkey: eventAuthority,             isSigner: false, isWritable: false }, // Anchor CPI events
        { pubkey: LOCK_PROGRAM_ID,            isSigner: false, isWritable: false }, // self (CPI emit)
      ];

      const createEscrowIx = new TransactionInstruction({
        programId: LOCK_PROGRAM_ID,
        keys,
        data,
      });

      // ── ATA creation instruction (for escrow vault) ───────────────────────
      const createEscrowAtaIx = createAssociatedTokenAccountInstruction(
        funderKey,   // payer
        escrowATA,   // new ATA address
        escrowPDA,   // owner (the escrow PDA)
        mintKey,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      // ── Assemble transaction ──────────────────────────────────────────────
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");

      const tx          = new Transaction();
      tx.recentBlockhash = blockhash;
      tx.feePayer        = funderKey;

      // Only add the ATA creation ix if it doesn't exist yet
      const escrowAtaInfo = await connection.getAccountInfo(escrowATA);
      if (!escrowAtaInfo) {
        tx.add(createEscrowAtaIx);
      }
      tx.add(createEscrowIx);

      // Partially sign with base keypair (server-side, before sending to client)
      tx.partialSign(base);

      // Serialize without requiring all signatures — client (funder) signs next
      const txBase64 = tx.serialize({ requireAllSignatures: false }).toString("base64");

      return res.status(200).json({
        transaction:         txBase64,
        escrow:              escrowPDA.toBase58(),
        blockhash,
        lastValidBlockHeight,
      });

    } catch (err) {
      console.error("[api/lock] create:", err);
      return res.status(500).json({ error: err?.message || "Failed to build lock transaction" });
    }
  }

  return res.status(400).json({ error: `Unknown action: "${action}"` });
}
