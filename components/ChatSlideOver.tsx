"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { useChatContext, type ChatPageContext } from "./ChatContext";

type ChatMessage = { role: "user" | "assistant"; content: string };

const ERROR_MESSAGES: Record<string, string> = {
  no_api_key: "Clé API non configurée. Ajoutez-la dans Paramètres.",
  api_key_invalid: "Clé API invalide. Vérifiez dans Paramètres.",
  rate_limit: "Trop de requêtes. Réessayez dans quelques secondes.",
  billing: "Crédit API insuffisant.",
};

// Quick actions per page
function getQuickActions(ctx: ChatPageContext): { label: string; prompt: string; isAnalysis?: boolean; tab?: string }[] {
  const generic = [
    { label: "Comment réduire mes dépenses ?", prompt: "Comment puis-je réduire mes dépenses ce mois-ci ? Analyse mes postes principaux et donne des recommandations concrètes." },
  ];

  if (ctx.explorerCatId) {
    return [
      { label: "Analyser cette catégorie", prompt: "", isAnalysis: true, tab: `category-insight-${ctx.explorerCatId}` },
      ...generic,
    ];
  }

  switch (ctx.page) {
    case "dashboard":
      return [
        { label: "Synthèse du mois", prompt: "", isAnalysis: true, tab: "analysis-synthese" },
        { label: "Anomalies", prompt: "", isAnalysis: true, tab: "analysis-anomalies" },
        { label: "Optimisations", prompt: "", isAnalysis: true, tab: "analysis-optimisations" },
        { label: "Projections", prompt: "", isAnalysis: true, tab: "analysis-projections" },
        ...generic,
      ];
    case "transactions":
      return [
        { label: "Transactions suspectes", prompt: "Identifie les transactions suspectes ou inhabituelles dans mes opérations récentes. Y a-t-il des doublons, des montants anormaux ou des marchands inconnus ?" },
        { label: "Reclassifier les divers", prompt: "Aide-moi à reclassifier mes transactions en catégorie 'divers'. Pour chacune, propose une catégorie plus appropriée." },
        ...generic,
      ];
    case "patrimoine":
      return [
        { label: "Analyser mes comptes", prompt: "", isAnalysis: true, tab: "insights-banks" },
        { label: "Projection patrimoine", prompt: "Fais une projection de mon patrimoine sur les 12 prochains mois en prenant en compte mes revenus, dépenses, crédits et épargne actuelle." },
        ...generic,
      ];
    default:
      return generic;
  }
}

export default function ChatSlideOver() {
  const { isOpen, closeChat, pageContext } = useChatContext();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 200);
  }, [isOpen]);

  // Elapsed timer
  useEffect(() => {
    if (loading) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setElapsed(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [loading]);

  const getPeriod = useCallback(() => {
    if (pageContext.period) return pageContext.period;
    const now = new Date();
    const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const to = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
    return { from, to };
  }, [pageContext.period]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    const newMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const { from, to } = getPeriod();
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, from, to }),
      });
      const data = await res.json();
      if (res.ok && data.content) {
        setMessages([...newMessages, { role: "assistant", content: data.content }]);
      } else {
        const errCode = data.error || "api_error";
        const errMsg = ERROR_MESSAGES[errCode] ?? (data.message || "Erreur");
        setMessages([...newMessages, { role: "assistant", content: `<p style="color:#FF3B30">${errMsg}</p>` }]);
      }
    } catch {
      setMessages([...newMessages, { role: "assistant", content: '<p style="color:#FF3B30">Erreur de connexion</p>' }]);
    } finally {
      setLoading(false);
    }
  }, [messages, loading, getPeriod]);

  const runAnalysis = useCallback(async (tab: string, label: string) => {
    if (loading) return;

    const newMessages: ChatMessage[] = [...messages, { role: "user", content: label }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const { from, to } = getPeriod();
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tab, from, to, force: true }),
      });
      const data = await res.json();
      if (res.ok && data.content) {
        // For JSON responses (insights, category-insight), format them
        let content = data.content;
        try {
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) {
            content = parsed.map((ins: { title?: string; body?: string; metric?: string }) =>
              `<div style="margin-bottom:8px"><strong>${ins.title || ""}</strong>${ins.metric ? ` <span style="color:#007AFF;font-size:11px">${ins.metric}</span>` : ""}<br/><span style="color:#86868B">${ins.body || ""}</span></div>`
            ).join("");
          }
        } catch {
          // Already HTML, use as-is
        }
        setMessages([...newMessages, { role: "assistant", content }]);
      } else {
        const errCode = data.error || "api_error";
        const errMsg = ERROR_MESSAGES[errCode] ?? (data.message || "Erreur lors de l'analyse");
        setMessages([...newMessages, { role: "assistant", content: `<p style="color:#FF3B30">${errMsg}</p>` }]);
      }
    } catch {
      setMessages([...newMessages, { role: "assistant", content: '<p style="color:#FF3B30">Erreur de connexion</p>' }]);
    } finally {
      setLoading(false);
    }
  }, [messages, loading, getPeriod]);

  const handleQuickAction = (action: ReturnType<typeof getQuickActions>[0]) => {
    if (action.isAnalysis && action.tab) {
      runAnalysis(action.tab, action.label);
    } else {
      sendMessage(action.prompt);
    }
  };

  const quickActions = getQuickActions(pageContext);

  if (!isOpen) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", justifyContent: "flex-end" }}>
      {/* Backdrop */}
      <div onClick={closeChat} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.3)", backdropFilter: "blur(2px)" }} />

      {/* Panel */}
      <div style={{
        position: "relative", width: 440, maxWidth: "90vw", background: "#FBFBFD",
        display: "flex", flexDirection: "column", boxShadow: "-4px 0 24px rgba(0,0,0,0.12)",
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 20px", borderBottom: "1px solid rgba(0,0,0,0.06)",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <button onClick={closeChat} style={{ background: "none", border: "none", fontSize: 18, color: "#86868B", cursor: "pointer", padding: 0 }}>✕</button>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#AF52DE" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 1l1.5 3 3.5.5-2.5 2.5.5 3.5L8 9l-3 1.5.5-3.5L3 4.5l3.5-.5z"/>
          </svg>
          <span style={{ fontSize: 15, fontWeight: 600, color: "#1D1D1F" }}>Chat IA</span>
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              style={{ marginLeft: "auto", fontSize: 11, color: "#86868B", background: "none", border: "none", cursor: "pointer" }}
            >
              Effacer
            </button>
          )}
        </div>

        {/* Quick actions */}
        <div style={{ padding: "12px 20px 8px", display: "flex", flexWrap: "wrap", gap: 6, borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
          {quickActions.map((a) => (
            <button
              key={a.label}
              onClick={() => handleQuickAction(a)}
              disabled={loading}
              style={{
                fontSize: 11, padding: "5px 10px", borderRadius: 14,
                border: "1px solid rgba(0,0,0,0.08)", background: "white",
                color: loading ? "#AEAEB2" : "#1D1D1F", cursor: loading ? "default" : "pointer",
                fontWeight: 400, transition: "background 150ms",
              }}
              onMouseEnter={(e) => { if (!loading) (e.target as HTMLElement).style.background = "#F5F5F7"; }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.background = "white"; }}
            >
              {a.isAnalysis ? "✨ " : ""}{a.label}
            </button>
          ))}
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {messages.length === 0 && !loading && (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "#AEAEB2" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>✨</div>
              <div style={{ fontSize: 13, marginBottom: 4 }}>Assistant financier</div>
              <div style={{ fontSize: 11 }}>Posez une question ou utilisez les actions rapides ci-dessus</div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} style={{ marginBottom: 12, display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
              <div style={{
                maxWidth: "85%", padding: "10px 14px", borderRadius: 14,
                background: m.role === "user" ? "#007AFF" : "white",
                color: m.role === "user" ? "white" : "#1D1D1F",
                border: m.role === "assistant" ? "1px solid rgba(0,0,0,0.06)" : "none",
                fontSize: 13, lineHeight: 1.5,
              }}>
                {m.role === "user" ? (
                  <span>{m.content}</span>
                ) : (
                  <div className="ai-content" dangerouslySetInnerHTML={{ __html: m.content }} />
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div style={{ marginBottom: 12, display: "flex", justifyContent: "flex-start" }}>
              <div style={{
                padding: "10px 14px", borderRadius: 14, background: "white",
                border: "1px solid rgba(0,0,0,0.06)", display: "flex", alignItems: "center", gap: 8,
              }}>
                <div style={{ display: "flex", gap: 4 }}>
                  {[0, 1, 2].map((j) => (
                    <div key={j} style={{
                      width: 6, height: 6, borderRadius: "50%", background: "#AF52DE",
                      animation: `pulse 1s ease-in-out ${j * 0.15}s infinite`,
                    }} />
                  ))}
                </div>
                {elapsed >= 5 && <span style={{ fontSize: 10, color: "#AEAEB2" }}>{elapsed}s</span>}
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div style={{ padding: "12px 20px", borderTop: "1px solid rgba(0,0,0,0.06)", display: "flex", gap: 8 }}>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
            placeholder="Posez une question..."
            disabled={loading}
            style={{
              flex: 1, fontSize: 13, padding: "10px 14px", borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.08)", background: "white", outline: "none",
              color: "#1D1D1F",
            }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={loading || !input.trim()}
            style={{
              width: 36, height: 36, borderRadius: 10, border: "none",
              background: loading || !input.trim() ? "#F5F5F7" : "#007AFF",
              color: loading || !input.trim() ? "#AEAEB2" : "white",
              cursor: loading || !input.trim() ? "default" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, flexShrink: 0,
            }}
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}
