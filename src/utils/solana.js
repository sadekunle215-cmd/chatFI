import { TOKEN_MINTS, JUP_BASE, JUP_TOKEN_SEARCH, JUP_TOKENS_API } from "../constants";

// ── Proxy helper ──────────────────────────────────────────────────────────────
// All Jupiter API calls go through /api/jupiter (Vercel serverless) which injects the API key
export const jupFetch = async (url, options = {}) => {
  const payload = { url, method: (options.method || "GET").toUpperCase() };
  if (options.body !== undefined) {
    payload.body = typeof options.body === "string" ? JSON.parse(options.body) : options.body;
  }
  if (url.includes("/lend/v1/") || url.includes("/studio/v1/")) payload.apiKey = options.apiKey || "";
  const res = await fetch("/api/jupiter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  try { return JSON.parse(text); }
  catch { throw new Error(`Proxy error (${res.status}): ${text.slice(0, 200)}`); }
};

// Direct browser fetch — bypasses proxy (used for prediction endpoints to avoid geo-blocks)
export const predFetch = async (url, options = {}) => {
  const method = (options.method || "GET").toUpperCase();
  const fetchOptions = { method, headers: { "Content-Type": "application/json" } };
  if (options.body && method !== "GET") {
    fetchOptions.body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
  }
  const res = await fetch(url, fetchOptions);
  return res.json();
};

// ── Token Resolver ────────────────────────────────────────────────────────────
// Resolves any token symbol or mint address to { mint, decimals }
// Tries V2 first (verified tokens), then V1 fallback for any Jupiter-listed token
export const resolveToken = async (symbolOrName, tokenCacheRef, tokenDecimalsRef) => {
  if (!symbolOrName) return null;
  const upper = symbolOrName.toUpperCase().trim();

  if (tokenCacheRef.current[upper]) {
    return { mint: tokenCacheRef.current[upper], decimals: tokenDecimalsRef.current[upper] ?? 6 };
  }

  const isMintAddr = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(symbolOrName.trim());
  if (isMintAddr) {
    tokenCacheRef.current[upper] = symbolOrName.trim();
    return { mint: symbolOrName.trim(), decimals: 6 };
  }

  const tryParse = (data, sym) => {
    const list = Array.isArray(data) ? data : (data?.tokens || data?.data || []);
    const match = list.find(t => t.symbol?.toUpperCase() === sym);
    const mint = match?.id || match?.address;
    return mint ? { mint, decimals: match.decimals ?? 6 } : null;
  };

  try {
    const data = await jupFetch(`${JUP_TOKEN_SEARCH}?query=${encodeURIComponent(symbolOrName)}`);
    const r = tryParse(data, upper);
    if (r) { tokenCacheRef.current[upper] = r.mint; tokenDecimalsRef.current[upper] = r.decimals; return r; }
  } catch {}

  try {
    const data = await jupFetch(`${JUP_BASE}/tokens/v1/search?query=${encodeURIComponent(symbolOrName)}&limit=20`);
    const r = tryParse(data, upper);
    if (r) { tokenCacheRef.current[upper] = r.mint; tokenDecimalsRef.current[upper] = r.decimals; return r; }
  } catch {}

  return null;
};

// ── Number Formatter ──────────────────────────────────────────────────────────
export const fmtNum = (n) => {
  if (n == null) return "—";
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6)  return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3)  return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString();
};

export const fmtPrice = (p) => {
  if (p == null) return "—";
  if (p >= 1000) return `$${p.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (p >= 1)    return `$${p.toFixed(2)}`;
  if (p >= 0.01) return `$${p.toFixed(4)}`;
  return `$${p.toExponential(2)}`;
};

// ── Markdown → HTML Renderer ──────────────────────────────────────────────────
// Converts AI response markdown to styled HTML (used in message bubbles)
export const fmt = (text = "") => {
  const inlineMd = (s) =>
    s.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
     .replace(/\*(.*?)\*/g, "<em>$1</em>")
     .replace(/`(.*?)`/g, "<code>$1</code>")
     .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer" style="color:#c7f284;text-decoration:underline">$1</a>');

  const lines = text.split("\n");
  let html = "";
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const numMatch = line.match(/^(\d+)\.\s+(.+)/);

    if (numMatch) {
      const items = [];
      while (i < lines.length) {
        const m = lines[i].match(/^(\d+)\.\s+(.+)/);
        if (!m) break;
        items.push({ num: m[1], content: m[2] });
        i++;
      }
      html += `<ol style="padding-left:0;margin:8px 0;list-style:none">${items.map(item =>
        `<li style="margin:4px 0;padding:6px 10px;background:#161e27;border:1px solid #1e2d3d;border-radius:8px;font-size:13px">
          <span style="color:#c7f284;font-weight:700;margin-right:8px">${item.num}.</span>${inlineMd(item.content)}
        </li>`
      ).join("")}</ol>`;
      continue;
    }

    const ulMatch = line.match(/^[-•]\s+(.+)/);
    if (ulMatch) {
      const items = [];
      while (i < lines.length) {
        const m = lines[i].match(/^[-•]\s+(.+)/);
        if (!m) break;
        items.push(m[1]);
        i++;
      }
      html += `<ul style="padding-left:0;margin:8px 0;list-style:none">${items.map(item =>
        `<li style="margin:3px 0;padding:4px 0 4px 14px;border-left:2px solid #1e2d3d;font-size:13px">${inlineMd(item)}</li>`
      ).join("")}</ul>`;
      continue;
    }

    const h3Match = line.match(/^###\s+(.+)/);
    if (h3Match) { html += `<div style="font-size:14px;font-weight:700;color:#e8f4f0;margin:12px 0 4px">${inlineMd(h3Match[1])}</div>`; i++; continue; }

    const h2Match = line.match(/^##\s+(.+)/);
    if (h2Match) { html += `<div style="font-size:15px;font-weight:700;color:#e8f4f0;margin:14px 0 4px">${inlineMd(h2Match[1])}</div>`; i++; continue; }

    if (line.trim() === "") { html += "<br/>"; i++; continue; }

    html += `<p style="margin:3px 0;font-size:13px;line-height:1.55">${inlineMd(line)}</p>`;
    i++;
  }

  return html;
};
