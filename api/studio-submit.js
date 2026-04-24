// api/studio-submit.js
// Proxies multipart/form-data to Jupiter Studio /dbc-pool/submit
// Needed because FormData can't go through the JSON-based /api/jupiter proxy,
// and the browser can't hit api.jup.ag directly due to CORS.

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Collect raw body chunks
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks);

    const contentType = req.headers["content-type"] || "";

    const jupRes = await fetch("https://api.jup.ag/studio/v1/dbc-pool/submit", {
      method: "POST",
      headers: {
        "content-type": contentType, // preserve multipart boundary
        "x-api-key": process.env.JUP_API_KEY || "",
      },
      body: rawBody,
    });

    const data = await jupRes.json();
    return res.status(jupRes.status).json(data);
  } catch (err) {
    console.error("studio-submit proxy error:", err);
    return res.status(500).json({ error: err.message || "Proxy error" });
  }
}
