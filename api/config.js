// api/config.js — Exposes public config to browser (API key only, no secrets)
// Used so browser can call Jupiter prediction API directly with the API key
// (bypassing proxy to avoid geo-blocking)

export default function handler(req, res) {
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.status(200).json({
    jupApiKey: process.env.JUPITER_API_KEY || "",
  });
}
