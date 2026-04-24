// api/studio-submit.js
// Proxies multipart/form-data POST to Jupiter Studio /dbc-pool/submit
// Uses Node's built-in https module to avoid any fetch/node-fetch issues

const https = require("https");
const url = require("url");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Collect raw body
    const rawBody = await new Promise((resolve, reject) => {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks)));
      req.on("error", reject);
    });

    const contentType = req.headers["content-type"] || "";
    const target = url.parse("https://api.jup.ag/studio/v1/dbc-pool/submit");

    // Proxy using Node https directly
    const result = await new Promise((resolve, reject) => {
      const options = {
        hostname: target.hostname,
        path: target.path,
        method: "POST",
        headers: {
          "content-type": contentType,
          "content-length": rawBody.length,
          "x-api-key": process.env.JUP_API_KEY || "",
        },
      };

      const jupReq = https.request(options, (jupRes) => {
        const chunks = [];
        jupRes.on("data", (c) => chunks.push(c));
        jupRes.on("end", () => resolve({ status: jupRes.statusCode, body: Buffer.concat(chunks).toString() }));
      });

      jupReq.on("error", reject);
      jupReq.write(rawBody);
      jupReq.end();
    });

    let data;
    try { data = JSON.parse(result.body); }
    catch { data = { error: result.body }; }

    return res.status(result.status).json(data);
  } catch (err) {
    console.error("studio-submit error:", err);
    return res.status(500).json({ error: err.message || "Proxy error" });
  }
};

module.exports.config = { api: { bodyParser: false } };
