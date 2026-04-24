// api/send.js — Vercel serverless function (ESM)
// Uses Keypair.sign() from @solana/web3.js instead of Web Crypto Ed25519
// (Web Crypto Ed25519 "sign" usage is not supported in all Node.js runtimes)

import { Keypair, VersionedTransaction } from "@solana/web3.js";

const JUP_SEND_API = "https://api.jup.ag/send/v1";

function b64ToBytes(b64) {
  return Uint8Array.from(Buffer.from(b64, "base64"));
}
function bytesToB64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

function generateInviteCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const arr = new Uint8Array(12);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => chars[b % chars.length]).join("");
}

async function inviteCodeToKeypair(code) {
  const data = new TextEncoder().encode(code);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Keypair.fromSeed(new Uint8Array(hashBuffer));
}

function partialSignWithInviteKeypair(tx, inviteKeypair) {
  // Find the invite keypair's slot in the signatures array
  const inviteIdx = tx.message.staticAccountKeys.findIndex(
    key => key.equals(inviteKeypair.publicKey)
  );
  if (inviteIdx < 0) throw new Error("inviteSigner not found in transaction accounts.");

  // Use nacl-based signing built into @solana/web3.js via tx.sign()
  // partialSign signs only the slots belonging to the provided signers
  tx.sign([inviteKeypair]);
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

  const { action = "send", sender, amount, mint, inviteCode } = body;
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
      const inviteKeypair = await inviteCodeToKeypair(inviteCode);
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

    // ── SEND (default) ────────────────────────────────────────────────────────
    if (!sender || !amount || !mint) {
      return res.status(400).json({ error: "Missing required fields: sender, amount, mint" });
    }

    const newInviteCode = generateInviteCode();
    const inviteKeypair = await inviteCodeToKeypair(newInviteCode);
    const inviteSigner  = inviteKeypair.publicKey.toBase58();

    const craftRes  = await fetch(`${JUP_SEND_API}/craft-send`, {
      method: "POST", headers: jupHeaders,
      body: JSON.stringify({ inviteSigner, sender, amount, mint }),
    });
    const craftData = await craftRes.json();
    if (craftData.error) return res.status(502).json({
      error: typeof craftData.error === "object" ? JSON.stringify(craftData.error) : craftData.error,
    });
    if (!craftData.tx) return res.status(502).json({ error: "No transaction returned from Jupiter Send." });

    const tx = VersionedTransaction.deserialize(b64ToBytes(craftData.tx));
    partialSignWithInviteKeypair(tx, inviteKeypair);
    return res.status(200).json({
      partiallySignedTx: bytesToB64(tx.serialize()),
      inviteCode: newInviteCode,
    });

  } catch (err) {
    console.error("[api/send] error:", err);
    return res.status(500).json({ error: err?.message || "Internal server error" });
  }
}
