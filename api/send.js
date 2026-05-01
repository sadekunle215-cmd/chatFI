// api/send.js — Vercel serverless function (ESM)
// Per Jupiter Send API docs (https://developers.jup.ag/docs/send/invite-code):
//   - Server's only job is to call Jupiter's craft-send and return the raw UNSIGNED tx
//   - ALL signing happens client-side: invite keypair first, then sender wallet
//   - Server never touches private keys or signs for the send flow

import { Keypair, VersionedTransaction } from "@solana/web3.js";
import nacl from "tweetnacl";

const JUP_SEND_API = "https://api.jup.ag/send/v1";

function b64ToBytes(b64) {
  return Uint8Array.from(Buffer.from(b64, "base64"));
}
function bytesToB64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

// ── Clawback-only: server re-derives keypair and partially signs ──────────────
// Clawback still needs server-side signing because the client won't have stored
// the ephemeral invite keypair after the session ended.
async function inviteCodeToKeypairForClawback(code) {
  const data      = new TextEncoder().encode("invite:" + code);
  const hashBuf   = await crypto.subtle.digest("SHA-256", data);
  const privKey32 = new Uint8Array(hashBuf);

  // Build full 64-byte Solana secret key: [32-byte privkey | 32-byte pubkey]
  const tempKeypair = Keypair.fromSeed(privKey32);
  const pubKey32    = tempKeypair.publicKey.toBytes();
  const secretKey64 = new Uint8Array(64);
  secretKey64.set(privKey32, 0);
  secretKey64.set(pubKey32, 32);

  return Keypair.fromSecretKey(secretKey64);
}

function partialSignWithInviteKeypair(tx, inviteKeypair) {
  const inviteIdx = tx.message.staticAccountKeys.findIndex(
    key => key.equals(inviteKeypair.publicKey)
  );
  if (inviteIdx < 0) throw new Error("inviteSigner not found in transaction accounts.");
  const msgBytes = tx.message.serialize();
  const sig = nacl.sign.detached(msgBytes, inviteKeypair.secretKey);
  tx.signatures[inviteIdx] = sig;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const { action = "send", sender, amount, mint, inviteCode, inviteSignerPubkey } = body;
  const jupHeaders = {
    "Content-Type": "application/json",
    ...(process.env.JUPITER_API_KEY ? { "x-api-key": process.env.JUPITER_API_KEY } : {}),
  };

  try {
    // ── CLAWBACK ──────────────────────────────────────────────────────────────
    if (action === "clawback") {
      if (!inviteCode || !sender) {
        return res.status(400).json({ error: "Missing required fields: inviteCode, sender" });
      }
      const inviteKeypair = await inviteCodeToKeypairForClawback(inviteCode);
      const inviteSigner  = inviteKeypair.publicKey.toBase58();

      const craftRes  = await fetch(`${JUP_SEND_API}/craft-clawback`, {
        method: "POST", headers: jupHeaders,
        body: JSON.stringify({ inviteSigner, sender }),
      });
      const craftData = await craftRes.json();
      if (craftData.error) return res.status(502).json({
        error: typeof craftData.error === "object" ? JSON.stringify(craftData.error) : craftData.error,
      });
      if (!craftData.tx) return res.status(502).json({ error: "No transaction returned from Jupiter clawback." });

      const tx = VersionedTransaction.deserialize(b64ToBytes(craftData.tx));
      partialSignWithInviteKeypair(tx, inviteKeypair);
      return res.status(200).json({ partiallySignedTx: bytesToB64(tx.serialize()) });
    }

    // ── SEND ──────────────────────────────────────────────────────────────────
    // Client derives invite keypair and passes inviteSignerPubkey.
    // Server calls craft-send and returns the raw UNSIGNED tx.
    // Client then signs with: 1) invite keypair, 2) sender wallet — then broadcasts.
    if (!sender || !amount || !mint) {
      return res.status(400).json({ error: "Missing required fields: sender, amount, mint" });
    }
    if (!inviteSignerPubkey) {
      return res.status(400).json({ error: "Missing inviteSignerPubkey — must be derived client-side." });
    }

    const craftRes  = await fetch(`${JUP_SEND_API}/craft-send`, {
      method: "POST", headers: jupHeaders,
      body: JSON.stringify({ inviteSigner: inviteSignerPubkey, sender, amount, mint }),
    });
    const craftData = await craftRes.json();
    if (craftData.error) return res.status(502).json({
      error: typeof craftData.error === "object" ? JSON.stringify(craftData.error) : craftData.error,
    });
    if (!craftData.tx) return res.status(502).json({ error: "No transaction returned from Jupiter Send." });

    // Return raw unsigned tx — client signs with both invite keypair and sender wallet
    return res.status(200).json({
      tx:     craftData.tx,
      expiry: craftData.expiry,
    });

  } catch (err) {
    console.error("[api/send] error:", err);
    return res.status(500).json({ error: err?.message || "Internal server error" });
  }
}
