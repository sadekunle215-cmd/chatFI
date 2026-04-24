// pages/api/lock.js
// Real Jupiter Lock transactions using @coral-xyz/anchor + on-chain program
// Program: LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn
// IDL: https://github.com/jup-ag/jup-lock/blob/main/target/idl/locker.json

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let web3, anchor, splToken;
  try {
    web3     = await import("@solana/web3.js");
    anchor   = await import("@coral-xyz/anchor");
    splToken = await import("@solana/spl-token");
  } catch (e) {
    return res.status(500).json({ error: `SDK missing: ${e.message}` });
  }

  const { Connection, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } = web3;
  const { BN, AnchorProvider, Program, Wallet } = anchor;
  const { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } = splToken;

  const { action } = req.body || {};
  if (!action) return res.status(400).json({ error: "Missing action" });

  const SOLANA_RPC     = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";
  const LOCK_PROGRAM   = new PublicKey("LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn");
  const WSOL_MINT      = new PublicKey("So11111111111111111111111111111111111111112");

  // Minimal locker IDL — only the instructions we need
  const LOCKER_IDL = {
    version: "0.1.0",
    name: "locker",
    instructions: [
      {
        name: "createVestingEscrow",
        accounts: [
          { name: "base",            isMut: false, isSigner: true  },
          { name: "escrow",          isMut: true,  isSigner: false },
          { name: "escrowToken",     isMut: true,  isSigner: false },
          { name: "sender",          isMut: true,  isSigner: true  },
          { name: "senderToken",     isMut: true,  isSigner: false },
          { name: "recipient",       isMut: false, isSigner: false },
          { name: "mint",            isMut: false, isSigner: false },
          { name: "tokenProgram",    isMut: false, isSigner: false },
          { name: "systemProgram",   isMut: false, isSigner: false },
          { name: "rent",            isMut: false, isSigner: false },
        ],
        args: [
          { name: "params", type: {
            defined: "CreateVestingEscrowParameters"
          }}
        ]
      },
      {
        name: "claim",
        accounts: [
          { name: "escrow",          isMut: true,  isSigner: false },
          { name: "escrowToken",     isMut: true,  isSigner: false },
          { name: "recipient",       isMut: false, isSigner: true  },
          { name: "recipientToken",  isMut: true,  isSigner: false },
          { name: "mint",            isMut: false, isSigner: false },
          { name: "tokenProgram",    isMut: false, isSigner: false },
          { name: "systemProgram",   isMut: false, isSigner: false },
        ],
        args: [
          { name: "maxAmount", type: "u64" }
        ]
      }
    ],
    accounts: [
      {
        name: "VestingEscrow",
        type: {
          kind: "struct",
          fields: [
            { name: "base",               type: "publicKey" },
            { name: "mint",               type: "publicKey" },
            { name: "sender",             type: "publicKey" },
            { name: "recipient",          type: "publicKey" },
            { name: "startTime",          type: "u64" },
            { name: "frequency",          type: "u64" },
            { name: "cliffUnlockAmount",  type: "u64" },
            { name: "amountPerPeriod",    type: "u64" },
            { name: "numberOfPeriod",     type: "u64" },
            { name: "totalClaimedAmount", type: "u64" },
            { name: "cliffTime",          type: "u64" },
            { name: "updateRecipientMode",type: "u8"  },
            { name: "padding",            type: { array: ["u8", 7] } },
          ]
        }
      }
    ],
    types: [
      {
        name: "CreateVestingEscrowParameters",
        type: {
          kind: "struct",
          fields: [
            { name: "vestingStartTime",  type: "u64" },
            { name: "cliffTime",         type: "u64" },
            { name: "frequency",         type: "u64" },
            { name: "cliffUnlockAmount", type: "u64" },
            { name: "amountPerPeriod",   type: "u64" },
            { name: "numberOfPeriod",    type: "u64" },
            { name: "updateRecipientMode", type: "u8" },
          ]
        }
      }
    ],
    errors: []
  };

  try {
    const connection = new Connection(SOLANA_RPC, "confirmed");

    // ── Derive escrow PDA ──────────────────────────────────────────────────
    function deriveEscrow(base, programId) {
      return PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), base.toBuffer()],
        programId
      );
    }

    // ── BUILD ANCHOR PROGRAM (read-only, no wallet needed for tx building) ──
    function buildProgram(connection) {
      const dummyKeypair = web3.Keypair.generate();
      const dummyWallet  = new Wallet(dummyKeypair);
      const provider     = new AnchorProvider(connection, dummyWallet, { commitment: "confirmed" });
      return new Program(LOCKER_IDL, LOCK_PROGRAM, provider);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CREATE — real Jupiter Lock createVestingEscrow tx
    // ─────────────────────────────────────────────────────────────────────────
    if (action === "create") {
      const { funder, recipient, mint, amount, cliffSecs, vestingSecs } = req.body;
      if (!funder) return res.status(400).json({ error: "Missing: funder" });
      if (!amount) return res.status(400).json({ error: "Missing: amount" });
      if (!mint)   return res.status(400).json({ error: "Missing: mint" });

      const funderKey    = new PublicKey(funder);
      const recipientKey = recipient ? new PublicKey(recipient) : funderKey;
      const mintKey      = new PublicKey(mint);

      const cliff   = Math.max(parseInt(cliffSecs)  || 0, 0);
      const vesting = Math.max(parseInt(vestingSecs) || 86400, 1);
      const periods = Math.max(Math.floor(vesting / 86400), 1);
      const amtBig  = BigInt(amount);
      const perPeriod = amtBig / BigInt(periods);

      const now = Math.floor(Date.now() / 1000);

      // Each lock needs a unique base keypair — this is how Jupiter Lock derives escrow PDA
      const baseKeypair = web3.Keypair.generate();
      const [escrowPDA] = deriveEscrow(baseKeypair.publicKey, LOCK_PROGRAM);

      const senderToken    = await getAssociatedTokenAddress(mintKey, funderKey,    false, TOKEN_PROGRAM_ID);
      const escrowToken    = await getAssociatedTokenAddress(mintKey, escrowPDA,    true,  TOKEN_PROGRAM_ID);

      const program = buildProgram(connection);

      const ix = await program.methods
        .createVestingEscrow({
          vestingStartTime:  new BN(now + cliff),
          cliffTime:         new BN(cliff),
          frequency:         new BN(86400),
          cliffUnlockAmount: new BN(0),
          amountPerPeriod:   new BN(perPeriod.toString()),
          numberOfPeriod:    new BN(periods),
          updateRecipientMode: 0,
        })
        .accounts({
          base:          baseKeypair.publicKey,
          escrow:        escrowPDA,
          escrowToken:   escrowToken,
          sender:        funderKey,
          senderToken:   senderToken,
          recipient:     recipientKey,
          mint:          mintKey,
          tokenProgram:  TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent:          SYSVAR_RENT_PUBKEY,
        })
        .instruction();

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      const tx = new web3.Transaction();
      tx.add(ix);
      tx.recentBlockhash = blockhash;
      tx.feePayer        = funderKey;
      // base keypair must co-sign — partial sign server-side
      tx.partialSign(baseKeypair);

      const serialized = Buffer.from(
        tx.serialize({ requireAllSignatures: false })
      ).toString("base64");

      return res.status(200).json({
        transaction:          serialized,
        escrow:               escrowPDA.toBase58(),
        baseKey:              baseKeypair.publicKey.toBase58(),
        blockhash,
        lastValidBlockHeight,
        cliffDays:            cliff   / 86400,
        vestingDays:          vesting / 86400,
        mint,
        amount,
        recipient:            recipientKey.toBase58(),
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CLAIM — real claim instruction
    // ─────────────────────────────────────────────────────────────────────────
    if (action === "claim") {
      const { escrow, recipient } = req.body;
      if (!escrow)    return res.status(400).json({ error: "Missing: escrow" });
      if (!recipient) return res.status(400).json({ error: "Missing: recipient" });

      const recipientKey = new PublicKey(recipient);
      const escrowKey    = new PublicKey(escrow);

      // Fetch the escrow account to get the mint
      const program      = buildProgram(connection);
      const escrowData   = await program.account.vestingEscrow.fetch(escrowKey);
      const mintKey      = escrowData.mint;

      const escrowToken    = await getAssociatedTokenAddress(mintKey, escrowKey,    true,  TOKEN_PROGRAM_ID);
      const recipientToken = await getAssociatedTokenAddress(mintKey, recipientKey, false, TOKEN_PROGRAM_ID);

      const ix = await program.methods
        .claim(new BN("18446744073709551615")) // u64::MAX — claim all available
        .accounts({
          escrow:         escrowKey,
          escrowToken,
          recipient:      recipientKey,
          recipientToken,
          mint:           mintKey,
          tokenProgram:   TOKEN_PROGRAM_ID,
          systemProgram:  SystemProgram.programId,
        })
        .instruction();

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      const tx = new web3.Transaction();
      tx.add(ix);
      tx.recentBlockhash = blockhash;
      tx.feePayer        = recipientKey;

      const serialized = Buffer.from(
        tx.serialize({ requireAllSignatures: false })
      ).toString("base64");

      return res.status(200).json({ transaction: serialized, blockhash, lastValidBlockHeight });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ACCOUNTS — fetch real on-chain escrows for wallet
    // ─────────────────────────────────────────────────────────────────────────
    if (action === "accounts") {
      const { wallet } = req.body;
      if (!wallet) return res.status(400).json({ error: "Missing: wallet" });

      const program   = buildProgram(connection);
      const walletPk  = new PublicKey(wallet);

      // Filter by sender (offset 72) or recipient (offset 104) — 8 discriminator + 32 base + 32 mint = 72
      const [asSender, asRecipient] = await Promise.all([
        program.account.vestingEscrow.all([{ memcmp: { offset: 72, bytes: walletPk.toBase58() } }]).catch(() => []),
        program.account.vestingEscrow.all([{ memcmp: { offset: 104, bytes: walletPk.toBase58() } }]).catch(() => []),
      ]);

      const seen = new Set();
      const accounts = [];
      for (const item of [...asSender, ...asRecipient]) {
        const key = item.publicKey.toBase58();
        if (!seen.has(key)) {
          seen.add(key);
          accounts.push({ pubkey: key, data: item.account });
        }
      }

      return res.status(200).json({ accounts });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });

  } catch (err) {
    console.error("[api/lock]", err);
    return res.status(500).json({ error: err?.message || "Lock API error" });
  }
}
