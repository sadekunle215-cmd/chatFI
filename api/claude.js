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
      const useModel = model || "claude-sonnet-4-5";

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: useModel,
          max_tokens: max_tokens || 1024,
          system,
          messages,
        }),
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

        let cleanText = textContent.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

        // If response is a JSON action object, extract just the text field
        try {
          const parsed = JSON.parse(cleanText);
          if (parsed && typeof parsed.text === "string" && "action" in parsed) {
            cleanText = parsed.text;
          }
        } catch {}

        return res.status(200).json({
          content: [{ type: "text", text: cleanText }],
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
    // Strict JSON-only enforcement so OpenAI follows the same action format
    const jsonEnforcement = `CRITICAL: You MUST respond with a single valid JSON object only. No markdown, no code fences, no plain text outside the JSON. Your entire response must be parseable by JSON.parse(). The format is always: {"text":"...","action":"ACTION_NAME_OR_NULL","actionData":{...}}`;

    const openaiMessages = [
      {
        role: "system",
        content: `${jsonEnforcement}\n\n${system || ""}`,
      },
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
        model: "gpt-4o",               // upgraded from gpt-4o-mini — better JSON instruction following
        max_tokens: max_tokens || 1024,
        messages: openaiMessages,
        response_format: { type: "json_object" }, // forces OpenAI to always return valid JSON
      }),
    });

    const data = await response.json();

    if (data.error) {
      console.error("OpenAI error:", data.error.message);
      return res.status(500).json({ error: data.error.message });
    }

    const text = data.choices?.[0]?.message?.content || "";

    // Strip any accidental fences just in case
    const cleanText = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

    return res.status(200).json({
      content: [{ type: "text", text: cleanText }],
      role: "assistant",
    });

  } catch (err) {
    console.error("OpenAI exception:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
