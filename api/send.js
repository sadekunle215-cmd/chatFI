// api/send.js — Vercel serverless function (ESM)
//
// CHANGES FROM ORIGINAL:
//  1. Server no longer generates or re-derives the invite code/keypair for SEND.
//     Client now sends `inviteSigner` (pubkey string) directly — server just
//     passes it to Jupiter craft-send and returns the raw unsigned tx.
//  2. Server returns { tx, blockhash, lastValidBlockHeight } instead of
//     { partiallySignedTx, inviteCode } — client signs both slots itself.
//  3. generateInviteCode + inviteCodeToKeypair removed from server (send path).
//     Still kept for CLAWBACK since client sends raw inviteCode for that.
//  4. partialSignWithInviteKeypair removed (client handles all signing now).
//  5. tweetnacl import removed (no longer needed for send path).

import { Connection, VersionedTransaction } from "@solana/web3.js";

const JUP_SEND_API = "https://api.jup.ag/send/v1";
const RPC_URL      = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";

function b64ToBytes(b64) {
  return Uint8Array.from(Buffer.from(b64, "base64"));
}
function bytesToB64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

// Still needed for CLAWBACK — client sends raw inviteCode so server can derive
// the inviteSigner pubkey to pass to craft-clawback.
const { createHash } = await import("node:crypto");
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import nacl from "tweetnacl";
import { Keypair } from "@solana/web3.js";

// Configure ed25519 sync hash (required by @noble/ed25519)
ed.etc.sha512Sync = (...msgs) => sha512(ed.etc.concatBytes(...msgs));

async function inviteCodeToKeypair(code) {
  const priv_key = createHash("sha256").update("invite:" + code).digest();
  const pub_key  = ed.getPublicKey(new Uint8Array(priv_key));
  const secretKey = new Uint8Array(64);
  secretKey.set(priv_key);
  secretKey.set(pub_key, 32);
  return Keypair.fromSecretKey(secretKey);
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

  const { action = "send", sender, amount, mint, inviteSigner, inviteCode } = body;
  const jupHeaders = {
    "Content-Type": "application/json",
    ...(process.env.JUPITER_API_KEY ? { "x-api-key": process.env.JUPITER_API_KEY } : {}),
  };

  try {
    // ── CLAWBACK ────────────────────────────────────────────────────────────────
    // Client sends raw inviteCode for clawback so server can derive the signer.
    // This path is unchanged from the original.
    if (action === "clawback") {
      if (!inviteCode || !sender) {
        return res.status(400).json({ error: "Missing required fields: inviteCode, sender" });
      }
      const inviteKeypair    = await inviteCodeToKeypair(inviteCode);
      const inviteSignerAddr = inviteKeypair.publicKey.toBase58();

      const craftRes  = await fetch(`${JUP_SEND_API}/craft-clawback`, {
        method: "POST", headers: jupHeaders,
        body: JSON.stringify({ inviteSigner: inviteSignerAddr, sender }),
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

    // ── SEND ────────────────────────────────────────────────────────────────────
    // Client derives keypair locally and sends only the pubkey (inviteSigner).
    // Server never sees the invite code — just calls craft-send with the pubkey,
    // returns the raw unsigned tx + blockhash for the client to sign and broadcast.
    if (!sender || !amount || !mint || !inviteSigner) {
      return res.status(400).json({ error: "Missing required fields: sender, amount, mint, inviteSigner" });
    }

    const craftRes  = await fetch(`${JUP_SEND_API}/craft-send`, {
      method: "POST", headers: jupHeaders,
      body: JSON.stringify({ inviteSigner, sender, amount, mint }),
    });
    const craftData = await craftRes.json();
    if (craftData.error) return res.status(502).json({
      error: typeof craftData.error === "object" ? JSON.stringify(craftData.error) : craftData.error,
    });
    if (!craftData.tx) return res.status(502).json({ error: "No transaction returned from Jupiter Send." });

    // Fetch a fresh blockhash and patch it into the tx so both server response
    // and the tx itself share the same blockhash — client uses this for confirmTransaction.
    const connection = new Connection(RPC_URL, "confirmed");
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");

    const tx = VersionedTransaction.deserialize(b64ToBytes(craftData.tx));
    tx.message.recentBlockhash = blockhash;

    return res.status(200).json({
      tx:                  bytesToB64(tx.serialize()),
      blockhash,
      lastValidBlockHeight,
    });

  } catch (err) {
    console.error("[api/send] error:", err);
    return res.status(500).json({ error: err?.message || "Internal server error" });
  }
}
