// pages/api/lock.js  (or api/lock.js — place next to your jupiter.js)
// Builds Jupiter/Meteora Lock vesting escrow transactions server-side.
// Uses @meteora-ag/met-lock-sdk — install with: npm install @meteora-ag/met-lock-sdk

import { LockClient } from "@meteora-ag/met-lock-sdk";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import BN from "bn.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { action } = req.body;
  if (!action) return res.status(400).json({ error: "Missing action" });

  const SOLANA_RPC = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";
  const connection = new Connection(SOLANA_RPC, "confirmed");
  const client = new LockClient(connection, "confirmed");

  try {
    // ── CREATE VESTING ESCROW ─────────────────────────────────────────────────
    if (action === "create") {
      const { funder, recipient, mint, amount, cliffSecs, vestingSecs } = req.body;

      if (!funder || !mint || !amount) {
        return res.status(400).json({ error: "Missing required fields: funder, mint, amount" });
      }

      const now = Math.floor(Date.now() / 1000);

      // Generate a random base keypair — used for PDA derivation, must sign the tx
      const base = Keypair.generate();

      const amountBN       = new BN(String(amount));
      const vestingSecsInt = Math.max(parseInt(vestingSecs) || 86400, 1);
      const cliffSecsInt   = Math.max(parseInt(cliffSecs)  || 0,     0);

      // Linear vesting: 1 unlock per second for smooth distribution
      const frequency      = new BN(1);
      const numberOfPeriod = new BN(vestingSecsInt);
      const amountPerPeriod = amountBN.divn(vestingSecsInt);
      // Any remainder from integer division is released at the cliff
      const cliffUnlockAmount = amountBN.sub(amountPerPeriod.muln(vestingSecsInt));

      const tx = await client.createVestingEscrowV2({
        base:               base.publicKey,
        sender:             new PublicKey(funder),
        isSenderMultiSig:   false,
        payer:              new PublicKey(funder),
        tokenMint:          new PublicKey(mint),
        vestingStartTime:   new BN(now),
        cliffTime:          new BN(now + cliffSecsInt),
        frequency,
        cliffUnlockAmount,
        amountPerPeriod,
        numberOfPeriod,
        recipient:          new PublicKey(recipient || funder),
        updateRecipientMode: 0, // neither can update recipient
        cancelMode:          0, // irrevocable (matches Jupiter Lock UI default)
      });

      // Partially sign with the base keypair (required signer for PDA derivation)
      tx.partialSign(base);

      const serialized = Buffer.from(
        tx.serialize({ requireAllSignatures: false })
      ).toString("base64");

      return res.status(200).json({
        transaction: serialized,
        baseKey: base.publicKey.toBase58(), // return so frontend can display lock address
      });

    // ── CLAIM VESTED TOKENS ───────────────────────────────────────────────────
    } else if (action === "claim") {
      const { escrow, recipient } = req.body;

      if (!escrow || !recipient) {
        return res.status(400).json({ error: "Missing required fields: escrow, recipient" });
      }

      const tx = await client.claimV2({
        escrow:    new PublicKey(escrow),
        recipient: new PublicKey(recipient),
        payer:     new PublicKey(recipient),
      });

      const serialized = Buffer.from(
        tx.serialize({ requireAllSignatures: false })
      ).toString("base64");

      return res.status(200).json({ transaction: serialized });

    // ── FETCH LOCKS FOR WALLET ────────────────────────────────────────────────
    } else if (action === "accounts") {
      const { wallet } = req.body;
      if (!wallet) return res.status(400).json({ error: "Missing wallet" });

      const LOCK_PROGRAM = new PublicKey("LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn");

      // Fetch escrows where wallet is sender (offset 8 = after discriminator)
      const [asSender, asRecipient] = await Promise.all([
        connection.getProgramAccounts(LOCK_PROGRAM, {
          filters: [{ memcmp: { offset: 8, bytes: wallet } }],
        }),
        connection.getProgramAccounts(LOCK_PROGRAM, {
          filters: [{ memcmp: { offset: 40, bytes: wallet } }], // recipient field offset
        }),
      ]);

      const all = [...asSender, ...asRecipient];
      const seen = new Set();
      const unique = all.filter(a => {
        const k = a.pubkey.toBase58();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });

      return res.status(200).json({
        accounts: unique.map(a => ({
          pubkey: a.pubkey.toBase58(),
          data: Buffer.from(a.account.data).toString("base64"),
        })),
      });

    } else {
      return res.status(400).json({ error: `Unknown action: ${action}` });
    }

  } catch (err) {
    console.error("[api/lock] error:", err);
    return res.status(500).json({ error: err?.message || "Lock API error" });
  }
}
