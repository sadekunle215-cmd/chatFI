// /api/send.js — Vercel serverless function
// Handles Jupiter Send: craft-send, craft-clawback, pending-invites, invite-history
//
// POST action:send       → craft invite-based send tx (partially signed by invite keypair)
// POST action:clawback   → craft clawback tx to reclaim unclaimed tokens
// GET  type:pending      → fetch pending (unclaimed) invites for a wallet
// GET  type:history      → fetch full invite history for a wallet

import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";

const JUP_SEND_API = "https://api.jup.ag/send/v1";
const RPC_URL      = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

// Jupiter Send program ID — used to derive invitePDA
const JUPITER_SEND_PROGRAM = new PublicKey("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4");

// ── Derive invite keypair from code (must match client-side logic) ──────────
// Client uses: SHA-256("invite:" + code) as the 32-byte seed
async function inviteCodeToKeypair(code) {
  const data     = new TextEncoder().encode("invite:" + code);
  const hashBuf  = await crypto.subtle.digest("SHA-256", data);
  const seed32   = new Uint8Array(hashBuf);
  return Keypair.fromSeed(seed32);
}

// ── Derive the invitePDA from the invite keypair's pubkey ────────────────────
// Jupiter's craft-clawback requires the PDA, not the raw keypair pubkey.
// Seeds: ["invite", inviteKeypair.publicKey]
function deriveInvitePDA(invitePubkey) {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("invite"), invitePubkey.toBuffer()],
    JUPITER_SEND_PROGRAM
  );
  return pda;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  // ── GET — pending invites or invite history ──────────────────────────────
  if (req.method === "GET") {
    const { wallet, type = "pending" } = req.query;
    if (!wallet) return res.status(400).json({ error: "Missing wallet query param" });

    try {
      const endpoint = type === "history" ? "invite-history" : "pending-invites";
      const jupRes  = await fetch(`${JUP_SEND_API}/${endpoint}?wallet=${wallet}`);
      const data    = await jupRes.json();
      return res.status(200).json(data);
    } catch (err) {
      console.error("[/api/send] GET error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── POST — send or clawback ──────────────────────────────────────────────
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { action, inviteCode, sender, amount, mint } = req.body || {};

  if (!action) return res.status(400).json({ error: "Missing action" });
  if (!inviteCode) return res.status(400).json({ error: "Missing inviteCode" });
  if (!sender) return res.status(400).json({ error: "Missing sender" });

  try {
    // ── Derive invite keypair from code ──────────────────────────────────
    const inviteKeypair = await inviteCodeToKeypair(inviteCode);
    const invitePubkey  = inviteKeypair.publicKey;

    // ── CLAWBACK ─────────────────────────────────────────────────────────
    if (action === "clawback") {
      // Derive the invitePDA — this is what Jupiter's craft-clawback requires
      let invitePDA;
      try {
        invitePDA = deriveInvitePDA(invitePubkey);
      } catch (pdaErr) {
        console.error("[/api/send] invitePDA derivation failed:", pdaErr.message);
        return res.status(500).json({ error: `Failed to derive invitePDA: ${pdaErr.message}` });
      }

      console.log(`[clawback] sender=${sender} invitePubkey=${invitePubkey.toBase58()} invitePDA=${invitePDA.toBase58()}`);

      // Call Jupiter craft-clawback with all required fields
      const jupRes = await fetch(`${JUP_SEND_API}/craft-clawback`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          sender:     sender,
          invitePDA:  invitePDA.toBase58(),
        }),
      });

      const jupData = await jupRes.json();
      if (!jupRes.ok || jupData.error || jupData.issues) {
        const errMsg = jupData.error || JSON.stringify(jupData);
        console.error("[/api/send] craft-clawback Jupiter error:", errMsg);
        return res.status(400).json({ error: errMsg });
      }

      if (!jupData.transaction) {
        return res.status(500).json({ error: "Jupiter returned no transaction for clawback" });
      }

      // Partially sign the tx with the invite keypair so the clawback is authorized
      const { VersionedTransaction } = await import("@solana/web3.js");
      const txBytes = Buffer.from(jupData.transaction, "base64");
      const tx      = VersionedTransaction.deserialize(txBytes);

      // Sign with invite keypair
      const msgBytes   = tx.message.serialize();
      const inviteSig  = nacl.sign.detached(msgBytes, inviteKeypair.secretKey);
      const inviteIdx  = tx.message.staticAccountKeys
        .findIndex(k => k.toBase58() === invitePubkey.toBase58());

      if (inviteIdx >= 0) {
        tx.signatures[inviteIdx] = inviteSig;
      } else {
        console.warn("[/api/send] invite keypair not found in tx signers — proceeding without partial sig");
      }

      const partiallySignedTx = Buffer.from(tx.serialize()).toString("base64");
      return res.status(200).json({ partiallySignedTx });
    }

    // ── SEND ─────────────────────────────────────────────────────────────
    if (action === "send") {
      if (!amount) return res.status(400).json({ error: "Missing amount" });
      if (!mint)   return res.status(400).json({ error: "Missing mint" });

      console.log(`[send] sender=${sender} mint=${mint} amount=${amount} invitePubkey=${invitePubkey.toBase58()}`);

      const jupRes = await fetch(`${JUP_SEND_API}/craft-send`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          sender:        sender,
          inviteKeypair: invitePubkey.toBase58(),
          amount:        amount,
          mint:          mint,
        }),
      });

      const jupData = await jupRes.json();
      if (!jupRes.ok || jupData.error || jupData.issues) {
        const errMsg = jupData.error || JSON.stringify(jupData);
        console.error("[/api/send] craft-send Jupiter error:", errMsg);
        return res.status(400).json({ error: errMsg });
      }

      if (!jupData.transaction) {
        return res.status(500).json({ error: "Jupiter returned no transaction for send" });
      }

      // Partially sign with invite keypair
      const { VersionedTransaction } = await import("@solana/web3.js");
      const txBytes = Buffer.from(jupData.transaction, "base64");
      const tx      = VersionedTransaction.deserialize(txBytes);

      const msgBytes  = tx.message.serialize();
      const inviteSig = nacl.sign.detached(msgBytes, inviteKeypair.secretKey);
      const inviteIdx = tx.message.staticAccountKeys
        .findIndex(k => k.toBase58() === invitePubkey.toBase58());

      if (inviteIdx >= 0) {
        tx.signatures[inviteIdx] = inviteSig;
      }

      const partiallySignedTx = Buffer.from(tx.serialize()).toString("base64");
      return res.status(200).json({ partiallySignedTx, inviteCode });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });

  } catch (err) {
    console.error(`[/api/send] ${action} error:`, err.message, err.stack?.slice(0, 500));
    return res.status(500).json({ error: err.message });
  }
}
