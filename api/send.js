import { Connection, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { createTransferCheckedInstruction, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, getMint } from "@solana/spl-token";

const RPC = "https://api.mainnet-beta.solana.com";
const SOL_MINT = "So11111111111111111111111111111111111111112";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const { sender, recipient, amount, mint } = body;
  if (!sender || !recipient || !amount) return res.status(400).json({ error: "Missing fields: sender, recipient, amount" });
  try {
    const conn = new Connection(RPC, "confirmed");
    const senderPk = new PublicKey(sender);
    const recipientPk = new PublicKey(recipient);
    const tx = new Transaction();
    const isSOL = !mint || mint === "SOL" || mint === SOL_MINT;
    if (isSOL) {
      tx.add(SystemProgram.transfer({ fromPubkey: senderPk, toPubkey: recipientPk, lamports: BigInt(amount) }));
    } else {
      const mintPk = new PublicKey(mint);
      const mintInfo = await getMint(conn, mintPk);
      const senderAta = await getAssociatedTokenAddress(mintPk, senderPk);
      const recipientAta = await getAssociatedTokenAddress(mintPk, recipientPk);
      const recipientAtaInfo = await conn.getAccountInfo(recipientAta);
      if (!recipientAtaInfo) tx.add(createAssociatedTokenAccountInstruction(senderPk, recipientAta, recipientPk, mintPk));
      tx.add(createTransferCheckedInstruction(senderAta, mintPk, recipientAta, senderPk, BigInt(amount), mintInfo.decimals));
    }
    tx.feePayer = senderPk;
    const { blockhash } = await conn.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    const serialized = tx.serialize({ requireAllSignatures: false });
    return res.status(200).json({ tx: serialized.toString("base64") });
  } catch (err) {
    console.error("[api/send] error:", err);
    return res.status(500).json({ error: err?.message || "Internal server error" });
  }
}
