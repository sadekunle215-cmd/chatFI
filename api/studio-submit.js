// api/studio-submit.js
// Proxies multipart/form-data POST to Jupiter Studio /dbc-pool/submit
// Uses CommonJS (module.exports) to match typical Vercel Next.js API route style

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Collect raw body from stream
    const rawBody = await new Promise((resolve, reject) => {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks)));
      req.on("error", reject);
    });

    const contentType = req.headers["content-type"] || "";

    const jupRes = await fetch("https://api.jup.ag/studio/v1/dbc-pool/submit", {
      method: "POST",
      headers: {
        "content-type": contentType,
        "x-api-key": process.env.JUP_API_KEY || "",
      },
      body: rawBody,
    });

    // Safe parse — return whatever Jupiter sends back
    const text = await jupRes.text();
    let data;
    try { data = JSON.parse(text); }
    catch { data = { error: text }; }

    return res.status(jupRes.status).json(data);
  } catch (err) {
    console.error("studio-submit proxy error:", err);
    return res.status(500).json({ error: err.message || "Proxy error" });
  }
};

// Disable Vercel's default body parser so we get the raw stream
module.exports.config = { api: { bodyParser: false } };
