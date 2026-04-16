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
      // Use sonnet for sports analysis + web_search support
      const useModel = model || "claude-sonnet-4-5";
      const supportsWebSearch = useModel.includes("sonnet") || useModel.includes("opus");

      const requestBody = {
        model: useModel,
        max_tokens: max_tokens || 1024,
        system,
        messages,
      };

      if (supportsWebSearch) {
        requestBody.tools = [{ type: "web_search_20250305", name: "web_search" }];
      }

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        console.error("Claude error:", JSON.stringify(data.error));
        // Fall through to OpenAI
      } else {
        const textContent = (data.content || [])
          .filter(b => b.type === "text")
          .map(b => b.text)
          .join("");

        return res.status(200).json({
          content: [{ type: "text", text: textContent }],
          role: "assistant",
        });
      }
    } catch (err) {
      console.error("Claude exception, falling back to OpenAI:", err.message);
    }
  }

  // ── Fallback: OpenAI ──────────────────────────────────────────────────────
  if (!OPENAI_KEY) {
    return res.status(500).json({ error: "Both ANTHROPIC_API_KEY and OPENAI_API_KEY are missing or failed." });
  }

  try {
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
        max_tokens: max_tokens || 1024,
        messages: openaiMessages,
      }),
    });

    const data = await response.json();

    if (data.error) {
      console.error("OpenAI error:", data.error.message);
      return res.status(500).json({ error: data.error.message });
    }

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
