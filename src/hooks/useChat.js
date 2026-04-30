import { useState, useRef, useCallback, useEffect } from "react";
import { SUGGESTION_GROUPS } from "../constants";

// ── useChat ───────────────────────────────────────────────────────────────────
// Manages chat messages state, input, AI response dispatching,
// and the global window.__chatfiSend bridge.
export default function useChat({ onAction }) {
  const [messages, setMessages] = useState([
    {
      id: 1,
      role: "ai",
      content: "Welcome to **ChatFi** — your AI trading copilot on Solana.\n\nConnect your wallet, then type what you'd like to do. Try **swap SOL to JUP**, **show my portfolio**, or **top trending tokens**.",
      ts: Date.now(),
    },
  ]);
  const [input, setInput]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [activeSuggGroup, setActiveSuggGroup] = useState(null);
  const historyRef = useRef([]);
  const bottomRef  = useRef(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── push — add a message to chat ────────────────────────────────────────────
  const push = useCallback((role, content, extra = {}) => {
    const msg = { id: Date.now() + Math.random(), role, content, ts: Date.now(), ...extra };
    setMessages(prev => [...prev, msg]);
    if (role === "ai") {
      historyRef.current = [...historyRef.current, { role: "assistant", content }];
    }
    return msg;
  }, []);

  // ── send — main entry point for all user messages ────────────────────────────
  const send = useCallback(async (rawText) => {
    const text = (rawText || input).trim();
    if (!text || loading) return;
    setInput("");
    push("user", text);
    historyRef.current = [...historyRef.current, { role: "user", content: text }];
    setLoading(true);

    // Built-in commands (no AI needed)
    if (text.toLowerCase() === "refresh") {
      onAction({ action: "REFRESH" });
      setLoading(false);
      return;
    }
    if (text.toLowerCase() === "delete messages") {
      setMessages([]);
      historyRef.current = [];
      setLoading(false);
      return;
    }

    // Send to AI
    try {
      await onAction({ action: "AI_CHAT", text, history: historyRef.current });
    } catch (err) {
      push("ai", `Error: ${err?.message || "Something went wrong."}`);
    }
    setLoading(false);
  }, [input, loading, push, onAction]);

  // ── Global window bridge (used by inline token card HTML onclick) ────────────
  useEffect(() => {
    window.__chatfiSend = (query) => { setInput(""); send(query); };
    return () => { delete window.__chatfiSend; };
  });

  const clearMessages = () => {
    setMessages([]);
    historyRef.current = [];
  };

  return {
    messages, input, setInput,
    loading, send, push,
    activeSuggGroup, setActiveSuggGroup,
    bottomRef, historyRef,
    clearMessages,
    SUGGESTION_GROUPS,
  };
}
