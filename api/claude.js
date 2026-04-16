export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  const OPENAI_KEY    = process.env.OPENAI_API_KEY;

  const { model, max_tokens, system, messages } = req.body;

  // ── Try Claude first ──────────────────────────────────────────────────────
  if (ANTHROPIC_KEY) {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: model || "claude-haiku-4-5-20251001",
          max_tokens: max_tokens || 1000,
          system,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages,
        }),
      });

      const data = await response.json();

      if (!data.error) {
        return res.status(200).json(data);
      }
      console.error("Claude error, falling back to OpenAI:", data.error?.message);
    } catch (err) {
      console.error("Claude exception, falling back to OpenAI:", err.message);
    }
  }

  // ── Fallback: OpenAI ──────────────────────────────────────────────────────
  if (!OPENAI_KEY) {
    return res.status(500).json({ error: "Both ANTHROPIC_API_KEY and OPENAI_API_KEY are missing or failed." });
  }

  try {
    // Convert Anthropic message format to OpenAI format
    const openaiMessages = [
      { role: "system", content: system || "" },
      ...messages.map(m => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: typeof m.content === "string"
          ? m.content
          : (m.content || []).filter(b => b.type === "text").map(b => b.text).join(""),
      })),
    ];

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: max_tokens || 1000,
        messages: openaiMessages,
      }),
    });

    const data = await response.json();

    if (data.error) {
      console.error("OpenAI error:", data.error.message);
      return res.status(500).json({ error: data.error.message });
    }

    // Convert OpenAI response back to Anthropic format so JupChat.jsx needs no changes
    const text = data.choices?.[0]?.message?.content || "";
    return res.status(200).json({
      content: [{ type: "text", text }],
      role: "assistant",
    });

  } catch (err) {
    console.error("OpenAI exception:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
