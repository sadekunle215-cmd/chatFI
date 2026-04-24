// api/send.js  — Vercel serverless function
// Handles Jupiter Send invite keypair generation + partial signing server-side.
// This avoids the Reown adapter crash ("Cannot read properties of undefined
// (reading 'includes')") that happens when the client passes a VersionedTransaction
// that already has a partial signature slot filled.
//
// Actions:
//   action: "send"     (default) — craft + partially sign a new invite send tx
//   action: "clawback"           — craft + partially sign a clawback tx for an existing invite

import { Keypair, VersionedTransaction } from "@solana/web3.js";

const JUP_SEND_API = "https://api.jup.ag/send/v1";

// ── helpers ──────────────────────────────────────────────────────────────────
function b64ToBytes(b64) {
  return Uint8Array.from(Buffer.from(b64, "base64"));
}
function bytesToB64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

async function inviteCodeToKeypair(code) {
  const data       = new TextEncoder().encode(code);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Keypair.fromSeed(new Uint8Array(hashBuffer));
}

function generateInviteCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const arr   = new Uint8Array(12);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => chars[b % chars.length]).join("");
}

// ── partial-sign helper (shared by send + clawback) ──────────────────────────
async function partialSignWithInviteKeypair(tx, inviteKeypair) {
  const msgBytes  = tx.message.serialize();
  const inviteIdx = tx.message.staticAccountKeys.findIndex(
    key => key.equals(inviteKeypair.publicKey)
  );
  if (inviteIdx < 0) throw new Error("inviteSigner not found in transaction accounts.");
  const cryptoPrivKey = await crypto.subtle.importKey(
    "raw",
    inviteKeypair.secretKey.slice(0, 32),
    { name: "Ed25519" },
    false,
    ["sign"]
  );
  tx.signatures[inviteIdx] = new Uint8Array(
    await crypto.subtle.sign("Ed25519", cryptoPrivKey, msgBytes)
  );
}

// ── handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { action = "send", sender, amount, mint, inviteCode } = req.body || {};
  const jupHeaders = {
    "Content-Type": "application/json",
    ...(process.env.JUPITER_API_KEY ? { "x-api-key": process.env.JUPITER_API_KEY } : {}),
  };

  try {
    // ── CLAWBACK ────────────────────────────────────────────────────────────
    if (action === "clawback") {
      if (!inviteCode || !sender) {
        return res.status(400).json({ error: "Missing required fields: inviteCode, sender" });
      }

      // Derive the same keypair from the invite code
      const inviteKeypair = await inviteCodeToKeypair(inviteCode);
      const inviteSigner  = inviteKeypair.publicKey.toBase58();

      const craftRes = await fetch(`${JUP_SEND_API}/craft-clawback`, {
        method:  "POST",
        headers: jupHeaders,
        body:    JSON.stringify({ inviteSigner, sender }),
      });
      const craftData = await craftRes.json();
      if (craftData.error) {
        return res.status(502).json({
          error: typeof craftData.error === "object"
            ? JSON.stringify(craftData.error)
            : craftData.error,
        });
      }
      if (!craftData.tx) {
        return res.status(502).json({ error: "No transaction returned from Jupiter clawback." });
      }

      const tx = VersionedTransaction.deserialize(b64ToBytes(craftData.tx));
      await partialSignWithInviteKeypair(tx, inviteKeypair);

      return res.status(200).json({ partiallySignedTx: bytesToB64(tx.serialize()) });
    }

    // ── SEND (default) ──────────────────────────────────────────────────────
    if (!sender || !amount || !mint) {
      return res.status(400).json({ error: "Missing required fields: sender, amount, mint" });
    }

    // 1. Generate invite code + keypair on the server
    const newInviteCode = generateInviteCode();
    const inviteKeypair = await inviteCodeToKeypair(newInviteCode);
    const inviteSigner  = inviteKeypair.publicKey.toBase58();

    // 2. Fetch partially-constructed tx from Jupiter
    const craftRes = await fetch(`${JUP_SEND_API}/craft-send`, {
      method:  "POST",
      headers: jupHeaders,
      body:    JSON.stringify({ inviteSigner, sender, amount, mint }),
    });
    const craftData = await craftRes.json();
    if (craftData.error) {
      return res.status(502).json({
        error: typeof craftData.error === "object"
          ? JSON.stringify(craftData.error)
          : craftData.error,
      });
    }
    if (!craftData.tx) {
      return res.status(502).json({ error: "No transaction returned from Jupiter Send." });
    }

    // 3. Partially sign with invite keypair
    const tx = VersionedTransaction.deserialize(b64ToBytes(craftData.tx));
    await partialSignWithInviteKeypair(tx, inviteKeypair);

    // 4. Return partially-signed tx + invite code to the client
    return res.status(200).json({
      partiallySignedTx: bytesToB64(tx.serialize()),
      inviteCode:        newInviteCode,
    });

  } catch (err) {
    console.error("[api/send] error:", err);
    return res.status(500).json({ error: err?.message || "Internal server error" });
  }
}

// Handles Jupiter Send invite keypair generation + partial signing server-side.
// This avoids the Reown adapter crash ("Cannot read properties of undefined
// (reading 'includes')") that happens when the client passes a VersionedTransaction
// that already has a partial signature slot filled.
//
// Flow:
//   Client                          Server (/api/send)
//   ──────                          ──────────────────
//   POST { sender, amount, mint } → generate inviteCode + inviteKeypair
//                                   POST Jupiter /send/v1/craft-send
//                                   partial-sign tx with inviteKeypair
//                                ← return { partiallySignedTx (base64), inviteCode }
//   wallet.signTransaction(tx)      (only adds wallet sig — no prior slot confusion)
//   broadcast via RPC

import { Keypair, VersionedTransaction } from "@solana/web3.js";

const JUP_SEND_API = "https://api.jup.ag/send/v1";

// ── helpers ──────────────────────────────────────────────────────────────────
function b64ToBytes(b64) {
  return Uint8Array.from(Buffer.from(b64, "base64"));
}
function bytesToB64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

async function inviteCodeToKeypair(code) {
  const data       = new TextEncoder().encode(code);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Keypair.fromSeed(new Uint8Array(hashBuffer));
}

function generateInviteCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const arr   = new Uint8Array(12);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => chars[b % chars.length]).join("");
}

// ── handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { sender, amount, mint } = req.body || {};

  if (!sender || !amount || !mint) {
    return res.status(400).json({ error: "Missing required fields: sender, amount, mint" });
  }

  try {
    // 1. Generate invite code + keypair on the server
    const inviteCode    = generateInviteCode();
    const inviteKeypair = await inviteCodeToKeypair(inviteCode);
    const inviteSigner  = inviteKeypair.publicKey.toBase58();

    // 2. Fetch partially-constructed tx from Jupiter
    const craftRes = await fetch(`${JUP_SEND_API}/craft-send`, {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.JUPITER_API_KEY
          ? { "x-api-key": process.env.JUPITER_API_KEY }
          : {}),
      },
      body: JSON.stringify({ inviteSigner, sender, amount, mint }),
    });

    const craftData = await craftRes.json();
    if (craftData.error) {
      return res.status(502).json({
        error: typeof craftData.error === "object"
          ? JSON.stringify(craftData.error)
          : craftData.error,
      });
    }
    if (!craftData.tx) {
      return res.status(502).json({ error: "No transaction returned from Jupiter Send." });
    }

    // 3. Deserialize and partially sign with the invite keypair
    const tx      = VersionedTransaction.deserialize(b64ToBytes(craftData.tx));
    const msgBytes = tx.message.serialize();

    const inviteIdx = tx.message.staticAccountKeys.findIndex(
      key => key.equals(inviteKeypair.publicKey)
    );
    if (inviteIdx < 0) {
      return res.status(502).json({ error: "inviteSigner not found in transaction accounts." });
    }

    // Sign with invite keypair using Web Crypto Ed25519
    const cryptoPrivKey = await crypto.subtle.importKey(
      "raw",
      inviteKeypair.secretKey.slice(0, 32), // first 32 bytes = seed
      { name: "Ed25519" },
      false,
      ["sign"]
    );
    tx.signatures[inviteIdx] = new Uint8Array(
      await crypto.subtle.sign("Ed25519", cryptoPrivKey, msgBytes)
    );

    // 4. Return partially-signed tx (base64) + invite code to the client
    return res.status(200).json({
      partiallySignedTx: bytesToB64(tx.serialize()),
      inviteCode,
    });

  } catch (err) {
    console.error("[api/send] error:", err);
    return res.status(500).json({ error: err?.message || "Internal server error" });
  }
}
