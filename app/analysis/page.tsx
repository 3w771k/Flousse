"use client";
import { useState, useEffect, useRef } from "react";

// ─── Cards displayed on this page ────────────────────────────────────────────

const CARDS = [
  { id: "synthese",       tab: "analysis-synthese",       title: "Synthèse du mois" },
  { id: "anomalies",      tab: "analysis-anomalies",      title: "Anomalies détectées" },
  { id: "optimisations",  tab: "analysis-optimisations",  title: "Optimisations" },
  { id: "projections",    tab: "analysis-projections",    title: "Projections 6 mois" },
];

// "Tout analyser" steps: 4 insights + 4 analysis cards
const TOUT_ANALYSER_STEPS: { tab: string; label: string }[] = [
  { tab: "insights-dashboard",    label: "Insights Dashboard" },
  { tab: "insights-transactions", label: "Insights Opérations" },
  { tab: "insights-cashflow",     label: "Insights Cashflow" },
  { tab: "insights-banks",        label: "Insights Comptes" },
  { tab: "analysis-synthese",     label: "Synthèse" },
  { tab: "analysis-anomalies",    label: "Anomalies" },
  { tab: "analysis-optimisations",label: "Optimisations" },
  { tab: "analysis-projections",  label: "Projections" },
];

// ─── Error code → French message ─────────────────────────────────────────────

const ERROR_MESSAGES: Record<string, string> = {
  no_api_key:      "Aucune clé API configurée. Allez dans Paramètres.",
  api_key_invalid: "Clé API invalide. Vérifiez vos paramètres.",
  rate_limit:      "Limite de requêtes atteinte. Réessayez dans quelques secondes.",
  billing:         "Crédit API insuffisant. Rechargez votre compte Anthropic.",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getRange() {
  const now = new Date();
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  return { from, to };
}

function formatDate(createdAt: string): string {
  return new Date(createdAt + "Z").toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const SparkleIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#007AFF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 1l1.5 3 3.5.5-2.5 2.5.5 3.5L8 9l-3 1.5.5-3.5L3 4.5l3.5-.5z"/>
  </svg>
);

function SkeletonLines() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {[100, 85, 70].map((w, i) => (
        <div
          key={i}
          className="skeleton-pulse"
          style={{
            height: 16,
            width: `${w}%`,
            background: "rgba(0,0,0,0.06)",
            borderRadius: 6,
          }}
        />
      ))}
    </div>
  );
}

function useElapsedTimer(active: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (active) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setElapsed(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [active]);

  return elapsed;
}

// ─── Chat message type ───────────────────────────────────────────────────────

type ChatMessage = { role: "user" | "assistant"; content: string };

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AnalysisPage() {
  const [contents, setContents]     = useState<Record<string, string>>({});
  const [timestamps, setTimestamps] = useState<Record<string, string>>({});
  const [loadingId, setLoadingId]   = useState<string | null>(null);
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});

  // "Tout analyser" state
  const [toutAnalyserRunning, setToutAnalyserRunning] = useState(false);
  const [toutProgress, setToutProgress] = useState<{ step: number; label: string } | null>(null);

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const { from, to } = getRange();

  // ── A1: Load cached analyses on mount ──────────────────────────────────────
  useEffect(() => {
    const { from, to } = getRange();
    for (const card of CARDS) {
      fetch(`/api/analyze?tab=${card.tab}&from=${from}&to=${to}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.cached && d.content) {
            setContents((prev) => ({ ...prev, [card.id]: d.content }));
            setTimestamps((prev) => ({ ...prev, [card.id]: formatDate(d.created_at) }));
          }
        })
        .catch(() => {});
    }
  }, []);

  // ── Single-card generation ──────────────────────────────────────────────────
  const generate = async (id: string, tab: string, force = false) => {
    setLoadingId(id);
    setCardErrors((prev) => ({ ...prev, [id]: "" }));
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tab, from, to, force }),
      });
      const data = await res.json();
      if (!res.ok) {
        const errCode: string = data.error || "api_error";
        const errMsg = ERROR_MESSAGES[errCode] ?? (data.message || data.error || "Erreur lors de la génération");
        setCardErrors((prev) => ({ ...prev, [id]: errMsg }));
        return;
      }
      setContents((prev) => ({ ...prev, [id]: data.content || "" }));
      setTimestamps((prev) => ({
        ...prev,
        [id]: data.created_at ? formatDate(data.created_at) : "maintenant",
      }));
    } catch {
      setCardErrors((prev) => ({ ...prev, [id]: "Erreur de connexion au serveur" }));
    } finally {
      setLoadingId(null);
    }
  };

  // ── A2: "Tout analyser" — 8 steps sequentially ─────────────────────────────
  const toutAnalyser = async () => {
    setToutAnalyserRunning(true);
    for (let i = 0; i < TOUT_ANALYSER_STEPS.length; i++) {
      const step = TOUT_ANALYSER_STEPS[i];
      setToutProgress({ step: i + 1, label: step.label });
      try {
        await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tab: step.tab, from, to, force: false }),
        });
      } catch {
        // Continue even if one step fails
      }
    }
    // After all steps, reload card caches
    const { from: f, to: t } = getRange();
    for (const card of CARDS) {
      fetch(`/api/analyze?tab=${card.tab}&from=${f}&to=${t}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.cached && d.content) {
            setContents((prev) => ({ ...prev, [card.id]: d.content }));
            setTimestamps((prev) => ({ ...prev, [card.id]: formatDate(d.created_at) }));
          }
        })
        .catch(() => {});
    }
    setToutProgress(null);
    setToutAnalyserRunning(false);
  };

  // ── A3: Chat IA ─────────────────────────────────────────────────────────────
  const sendChat = async () => {
    const msg = chatInput.trim();
    if (!msg || chatLoading) return;

    const newMessages: ChatMessage[] = [...chatMessages, { role: "user", content: msg }];
    setChatMessages(newMessages);
    setChatInput("");
    setChatLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, from, to }),
      });
      const data = await res.json();
      if (res.ok && data.content) {
        setChatMessages([...newMessages, { role: "assistant", content: data.content }]);
      } else {
        const errCode = data.error || "api_error";
        const errMsg = ERROR_MESSAGES[errCode] ?? (data.message || "Erreur");
        setChatMessages([...newMessages, { role: "assistant", content: `<p style="color:#FF3B30">${errMsg}</p>` }]);
      }
    } catch {
      setChatMessages([...newMessages, { role: "assistant", content: '<p style="color:#FF3B30">Erreur de connexion au serveur</p>' }]);
    } finally {
      setChatLoading(false);
    }
  };

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, chatLoading]);

  const anyLoading = loadingId !== null || toutAnalyserRunning;

  return (
    <div style={{ padding: "28px 36px", maxWidth: 1100 }}>

      {/* Header */}
      <div className="flex items-end justify-between mb-8">
        <div>
          <div style={{ fontSize: 12, color: "#86868B", marginBottom: 4 }}>
            {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h1 style={{ fontSize: 32, fontWeight: 600, color: "#1D1D1F", letterSpacing: "-0.5px", lineHeight: 1 }}>
              Analyse IA
            </h1>
            <SparkleIcon />
          </div>
        </div>

        {/* Tout analyser button */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <button
            onClick={toutAnalyser}
            disabled={anyLoading}
            style={{
              padding: "10px 20px",
              borderRadius: 10,
              border: "none",
              background: "#007AFF",
              color: "white",
              fontSize: 14,
              fontWeight: 500,
              cursor: anyLoading ? "default" : "pointer",
              opacity: anyLoading ? 0.6 : 1,
              transition: "opacity 150ms ease",
            }}
          >
            {toutAnalyserRunning ? "Génération…" : "Tout analyser"}
          </button>

          {toutProgress && (
            <div style={{ fontSize: 12, color: "#86868B", textAlign: "right" }}>
              Génération {toutProgress.step}/{TOUT_ANALYSER_STEPS.length} — {toutProgress.label}…
            </div>
          )}
        </div>
      </div>

      {/* Cards grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
        {CARDS.map((card) => (
          <AnalysisCard
            key={card.id}
            card={card}
            content={contents[card.id]}
            timestamp={timestamps[card.id]}
            isLoading={loadingId === card.id}
            anyLoading={anyLoading}
            error={cardErrors[card.id] || ""}
            onGenerate={(force) => generate(card.id, card.tab, force)}
          />
        ))}
      </div>

      {/* Chat IA section */}
      <div className="rounded-apple" style={{ background: "#F5F5F7", overflow: "hidden" }}>
        {/* Chat header — click to toggle */}
        <button
          onClick={() => setChatOpen(!chatOpen)}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: 10,
            padding: "16px 24px", background: "none", border: "none", cursor: "pointer",
          }}
        >
          <SparkleIcon />
          <span style={{ fontSize: 14, fontWeight: 500, color: "#1D1D1F", flex: 1, textAlign: "left" }}>
            Chat IA — Posez vos questions
          </span>
          <span style={{ fontSize: 12, color: "#AEAEB2" }}>
            {chatMessages.length > 0 ? `${Math.floor(chatMessages.length / 2)} échange${Math.floor(chatMessages.length / 2) !== 1 ? "s" : ""}` : ""}
          </span>
          <span style={{ fontSize: 12, color: "#86868B", transition: "transform 150ms", transform: chatOpen ? "rotate(180deg)" : "none" }}>▼</span>
        </button>

        {chatOpen && (
          <div style={{ borderTop: "1px solid rgba(0,0,0,0.04)" }}>
            {/* Messages area */}
            <div style={{ maxHeight: 450, overflowY: "auto", padding: "16px 24px" }}>
              {chatMessages.length === 0 && !chatLoading && (
                <div style={{ textAlign: "center", padding: "24px 0" }}>
                  <div style={{ fontSize: 13, color: "#AEAEB2", marginBottom: 12 }}>
                    Posez une question sur vos finances.
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                    {[
                      "Comment réduire mes dépenses alimentation ?",
                      "Quand est-ce que mon prêt perso se termine ?",
                      "Combien je dépense en abonnements ?",
                      "Quelle est ma capacité d'épargne réelle ?",
                    ].map((q) => (
                      <button
                        key={q}
                        onClick={() => { setChatInput(q); }}
                        style={{
                          padding: "6px 12px", borderRadius: 8, fontSize: 12,
                          background: "rgba(0,122,255,0.06)", color: "#007AFF",
                          border: "1px solid rgba(0,122,255,0.12)", cursor: "pointer",
                        }}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {chatMessages.map((msg, i) => (
                <div
                  key={i}
                  style={{
                    marginBottom: 12,
                    display: "flex",
                    justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                  }}
                >
                  <div
                    style={{
                      maxWidth: "85%",
                      padding: "10px 14px",
                      borderRadius: msg.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                      background: msg.role === "user" ? "#007AFF" : "white",
                      color: msg.role === "user" ? "white" : "#1D1D1F",
                      fontSize: 13,
                      lineHeight: 1.5,
                      border: msg.role === "assistant" ? "1px solid rgba(0,0,0,0.06)" : "none",
                    }}
                  >
                    {msg.role === "user" ? (
                      msg.content
                    ) : (
                      <div
                        className="ai-content"
                        style={{ fontSize: 13, lineHeight: 1.6 }}
                        dangerouslySetInnerHTML={{ __html: msg.content }}
                      />
                    )}
                  </div>
                </div>
              ))}

              {chatLoading && (
                <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 12 }}>
                  <div style={{
                    padding: "12px 16px", borderRadius: "14px 14px 14px 4px",
                    background: "white", border: "1px solid rgba(0,0,0,0.06)",
                  }}>
                    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="skeleton-pulse"
                          style={{
                            width: 6, height: 6, borderRadius: "50%",
                            background: "#AEAEB2",
                            animationDelay: `${i * 0.2}s`,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input area */}
            <div style={{
              display: "flex", gap: 8, padding: "12px 24px 16px",
              borderTop: "1px solid rgba(0,0,0,0.04)",
              background: "rgba(0,0,0,0.01)",
            }}>
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                placeholder="Posez une question sur vos finances…"
                disabled={chatLoading}
                style={{
                  flex: 1, padding: "10px 14px", borderRadius: 10,
                  border: "1px solid rgba(0,0,0,0.08)", background: "white",
                  fontSize: 13, color: "#1D1D1F", outline: "none",
                }}
              />
              <button
                onClick={sendChat}
                disabled={chatLoading || !chatInput.trim()}
                style={{
                  padding: "10px 16px", borderRadius: 10, border: "none",
                  background: chatLoading || !chatInput.trim() ? "rgba(0,122,255,0.3)" : "#007AFF",
                  color: "white", fontSize: 13, fontWeight: 500,
                  cursor: chatLoading || !chatInput.trim() ? "default" : "pointer",
                }}
              >
                Envoyer
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Analysis Card component ──────────────────────────────────────────────────

type CardDef = { id: string; tab: string; title: string };

interface AnalysisCardProps {
  card: CardDef;
  content: string | undefined;
  timestamp: string | undefined;
  isLoading: boolean;
  anyLoading: boolean;
  error: string;
  onGenerate: (force?: boolean) => void;
}

function AnalysisCard({ card, content, timestamp, isLoading, anyLoading, error, onGenerate }: AnalysisCardProps) {
  const elapsed = useElapsedTimer(isLoading);
  const showTimer = isLoading && elapsed >= 5;

  return (
    <div
      style={{
        background: "#F5F5F7",
        borderRadius: 12,
        padding: "20px 24px",
        border: "1px solid rgba(0,122,255,0.06)",
      }}
    >
      {/* Card header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <SparkleIcon />
          <span style={{ fontSize: 14, fontWeight: 500, color: "#1D1D1F" }}>{card.title}</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {showTimer && (
            <span style={{ fontSize: 11, color: "#86868B" }}>
              {elapsed} secondes…
            </span>
          )}

          {timestamp && !isLoading && (
            <button
              onClick={() => onGenerate(true)}
              disabled={anyLoading}
              style={{
                fontSize: 11,
                color: "#AEAEB2",
                background: "none",
                border: "none",
                cursor: anyLoading ? "default" : "pointer",
              }}
            >
              Regénérer
            </button>
          )}

          {!timestamp && !isLoading && (
            <button
              onClick={() => onGenerate(false)}
              disabled={anyLoading}
              style={{
                fontSize: 11,
                color: anyLoading ? "#AEAEB2" : "#007AFF",
                background: "none",
                border: "none",
                cursor: anyLoading ? "default" : "pointer",
              }}
            >
              Générer
            </button>
          )}
        </div>
      </div>

      {/* Timestamp */}
      {timestamp && !isLoading && (
        <div style={{ fontSize: 11, color: "#AEAEB2", marginBottom: 10 }}>
          Généré le {timestamp}
        </div>
      )}

      {/* Error message */}
      {error && !isLoading && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            background: "rgba(255,59,48,0.06)",
            border: "1px solid rgba(255,59,48,0.12)",
            color: "#FF3B30",
            fontSize: 13,
            marginBottom: 12,
          }}
        >
          {error}
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div style={{ paddingTop: 4 }}>
          <SkeletonLines />
        </div>
      ) : content ? (
        <div
          className="ai-content"
          style={{ fontSize: 13, color: "#86868B", lineHeight: 1.6, maxHeight: 400, overflowY: "auto" }}
          dangerouslySetInnerHTML={{ __html: content }}
        />
      ) : (
        <p style={{ fontSize: 13, color: "#AEAEB2", margin: 0 }}>
          Pas encore d&apos;analyse pour cette période — cliquez Générer.
        </p>
      )}
    </div>
  );
}
