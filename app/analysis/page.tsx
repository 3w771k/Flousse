"use client";
import { useState } from "react";

const CARDS = [
  { id: "synthese", title: "Synthèse du mois" },
  { id: "anomalies", title: "Anomalies détectées" },
  { id: "optimisations", title: "Optimisations" },
  { id: "projections", title: "Projections 6 mois" },
];

const DEFAULT_CONTENT: Record<string, string> = {
  synthese: `<p>Cliquez sur <em>Générer</em> pour obtenir une synthèse IA de vos finances du mois.</p>`,
  anomalies: `<p>Cliquez sur <em>Générer</em> pour détecter les anomalies dans vos transactions.</p>`,
  optimisations: `<p>Cliquez sur <em>Générer</em> pour recevoir des recommandations d'optimisation.</p>`,
  projections: `<p>Cliquez sur <em>Générer</em> pour voir les projections sur 6 mois.</p>`,
};

const SparkleIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#007AFF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 1l1.5 3 3.5.5-2.5 2.5.5 3.5L8 9l-3 1.5.5-3.5L3 4.5l3.5-.5z"/>
  </svg>
);

export default function AnalysisPage() {
  const [contents, setContents] = useState<Record<string, string>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [timestamps, setTimestamps] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const generate = async (id: string) => {
    setLoadingId(id);
    setError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: id }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "no_api_key") {
          setError("Clé API Claude non configurée. Allez dans Paramètres \u2192 Clé API Claude.");
        } else if (data.error === "api_key_invalid") {
          setError("Clé API invalide. Vérifiez votre clé dans Paramètres \u2192 Clé API Claude.");
        } else if (data.error === "billing") {
          setError("Crédit API insuffisant. Rechargez votre compte Anthropic.");
        } else {
          setError(data.message || data.error || "Erreur lors de la génération");
        }
        return;
      }
      setContents((prev) => ({ ...prev, [id]: data.content || "Erreur de génération" }));
      setTimestamps((prev) => ({ ...prev, [id]: "maintenant" }));
    } catch {
      setError("Erreur de connexion au serveur");
    } finally {
      setLoadingId(null);
    }
  };

  const generateAll = async () => {
    for (const card of CARDS) {
      await generate(card.id);
    }
  };

  return (
    <div style={{ padding: "28px 36px", maxWidth: 1100 }}>
      <div className="flex items-end justify-between mb-8">
        <div>
          <div style={{ fontSize: 12, color: "#86868B", marginBottom: 4 }}>
            {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h1 style={{ fontSize: 32, fontWeight: 600, color: "#1D1D1F", letterSpacing: "-0.5px", lineHeight: 1 }}>Analyse IA</h1>
            <SparkleIcon />
          </div>
        </div>
        <button
          onClick={generateAll}
          disabled={loadingId !== null}
          style={{ padding: "8px 18px", borderRadius: 10, border: "none", background: "#007AFF", color: "white", fontSize: 13, fontWeight: 500, cursor: loadingId ? "default" : "pointer", opacity: loadingId ? 0.6 : 1 }}
        >
          {loadingId ? "Génération\u2026" : "Tout générer"}
        </button>
      </div>

      {error && (
        <div style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(255,59,48,0.06)", border: "1px solid rgba(255,59,48,0.12)", color: "#FF3B30", fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {CARDS.map((card) => (
          <div key={card.id} className="rounded-apple" style={{ background: "#F5F5F7", padding: "20px 24px", border: "1px solid rgba(0,122,255,0.06)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <SparkleIcon />
                <span style={{ fontSize: 14, fontWeight: 500, color: "#1D1D1F" }}>{card.title}</span>
              </div>
              <button
                onClick={() => generate(card.id)}
                disabled={loadingId !== null}
                style={{ fontSize: 11, color: loadingId === card.id ? "#AEAEB2" : "#007AFF", background: "none", border: "none", cursor: loadingId ? "default" : "pointer" }}
              >
                {loadingId === card.id ? "\u2026" : "Générer"}
              </button>
            </div>
            {timestamps[card.id] && (
              <div style={{ fontSize: 11, color: "#AEAEB2", marginBottom: 10 }}>Généré {timestamps[card.id]}</div>
            )}
            <div
              className="ai-content"
              style={{ fontSize: 13, color: "#86868B", lineHeight: 1.6 }}
              dangerouslySetInnerHTML={{ __html: contents[card.id] || DEFAULT_CONTENT[card.id] }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
