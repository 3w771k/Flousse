"use client";
import { useChatContext } from "./ChatContext";

export default function ChatButton() {
  const { openChat } = useChatContext();
  return (
    <button
      onClick={openChat}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "6px 14px", borderRadius: 10,
        background: "rgba(175,82,222,0.08)", border: "none",
        fontSize: 12, fontWeight: 500, color: "#AF52DE",
        cursor: "pointer", transition: "background 0.15s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(175,82,222,0.14)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(175,82,222,0.08)")}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 6.5C2 4.01 4.69 2 8 2s6 2.01 6 4.5-2.69 4.5-6 4.5c-.59 0-1.16-.06-1.7-.18L3.5 12.5V9.6C2.56 8.77 2 7.68 2 6.5z"/>
        <circle cx="5.5" cy="6.5" r="0.5" fill="currentColor" stroke="none"/>
        <circle cx="8" cy="6.5" r="0.5" fill="currentColor" stroke="none"/>
        <circle cx="10.5" cy="6.5" r="0.5" fill="currentColor" stroke="none"/>
      </svg>
      Chat IA
    </button>
  );
}
