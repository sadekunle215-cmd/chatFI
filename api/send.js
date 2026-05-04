// api/send.js — Vercel serverless function (ESM)
//
// CHANGES FROM ORIGINAL:
//  1. Server still derives invite keypair from inviteCode and partially signs
//     using nacl.sign.detached (writes only the invite slot, no other slots reset).
//  2. Response now includes blockhash + lastValidBlockHeight alongside
//     partiallySignedTx — client uses these for confirmTransaction instead of
//     making a second getLatestBlockhash call that could return a different value.
//  3. Everything else unchanged from original.

import { Connection, Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";
import nacl from "tweetnacl";
import crypto from "crypto";

const JUP_SEND_API = "https://api.jup.ag/send/v1";
const RPC_URL      = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";

function b64ToBytes(b64) {
  return Uint8Array.from(Buffer.from(b64, "base64"));
}
function bytesToB64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

// Jupiter spec: SHA-256("invite:" + code) → 32-byte seed → 64-byte Solana secret key
function inviteCodeToKeypair(code) {
  const priv_key = crypto.createHash("sha256").update("invite:" + code).digest();
  // Keypair.fromSeed derives ed25519 pubkey from the seed
  return Keypair.fromSeed(new Uint8Array(priv_key));
}

// Jupiter Send program — used to derive invitePDA for clawback
const JUPITER_SEND_PROGRAM = new PublicKey("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4");

function deriveInvitePDA(invitePubkey) {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("invite"), invitePubkey.toBuffer()],
    JUPITER_SEND_PROGRAM
  );
  return pda;
}

// Write the invite keypair signature into its slot only — does not touch other slots
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
  const jupHeaders = {
    "Content-Type": "application/json",
    ...(process.env.JUPITER_API_KEY ? { "x-api-key": process.env.JUPITER_API_KEY } : {}),
  };

  // ── GET — pending invites or invite history ──────────────────────────────
  if (req.method === "GET") {
    const { wallet, type = "pending" } = req.query;
    if (!wallet) return res.status(400).json({ error: "Missing wallet query param" });
    try {
      const endpoint = type === "history" ? "invite-history" : "pending-invites";
      console.log(`[api/send] GET ${endpoint} wallet=${wallet}`);
      const jupRes = await fetch(`${JUP_SEND_API}/${endpoint}?wallet=${wallet}`, { headers: jupHeaders });
      const raw    = await jupRes.text();
      console.log(`[api/send] GET ${endpoint} response:`, raw.slice(0, 500));
      let data;
      try { data = JSON.parse(raw); } catch { data = []; }
      return res.status(200).json(data);
    } catch (err) {
      console.error("[api/send] GET error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const { action = "send", sender, amount, mint, inviteCode } = body;

  try {
    // ── CLAWBACK ────────────────────────────────────────────────────────────────
    if (action === "clawback") {
      if (!inviteCode || !sender) {
        return res.status(400).json({ error: "Missing required fields: inviteCode, sender" });
      }
      const inviteKeypair = inviteCodeToKeypair(inviteCode);
      const invitePDA     = deriveInvitePDA(inviteKeypair.publicKey).toBase58();

      const craftRes  = await fetch(`${JUP_SEND_API}/craft-clawback`, {
        method: "POST", headers: jupHeaders,
        body: JSON.stringify({ invitePDA, sender }),
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
    if (!sender || !amount || !mint || !inviteCode) {
      return res.status(400).json({ error: "Missing required fields: sender, amount, mint, inviteCode" });
    }

    const inviteKeypair = inviteCodeToKeypair(inviteCode);
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

    // Partially sign with invite keypair (writes only invite slot, no reset)
    const tx = VersionedTransaction.deserialize(b64ToBytes(craftData.tx));
    partialSignWithInviteKeypair(tx, inviteKeypair);

    // Fetch blockhash and return it alongside the tx so the client can use it
    // for confirmTransaction without making a second getLatestBlockhash call
    const connection = new Connection(RPC_URL, "confirmed");
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");

    return res.status(200).json({
      partiallySignedTx:   bytesToB64(tx.serialize()),
      blockhash,
      lastValidBlockHeight,
    });

  } catch (err) {
    console.error("[api/send] error:", err);
    return res.status(500).json({ error: err?.message || "Internal server error" });
  }
}
