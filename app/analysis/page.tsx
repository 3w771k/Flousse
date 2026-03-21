"use client";
import { useState, useEffect } from "react";

const CARDS = [
  { id: "synthese", tab: "analysis-synthese", title: "Synthèse du mois" },
  { id: "anomalies", tab: "analysis-anomalies", title: "Anomalies détectées" },
  { id: "optimisations", tab: "analysis-optimisations", title: "Optimisations" },
  { id: "projections", tab: "analysis-projections", title: "Projections 6 mois" },
];

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

export default function AnalysisHistoryPage() {
  const [contents, setContents] = useState<Record<string, string>>({});
  const [timestamps, setTimestamps] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadCached = async () => {
      const now = new Date();
      const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

      const results = await Promise.allSettled(
        CARDS.map((c) =>
          fetch(`/api/analyze?tab=${c.tab}&from=${from}&to=${to}`)
            .then((r) => r.json())
            .then((d) => ({ id: c.id, content: d.cached ? d.content : null, created_at: d.created_at }))
        )
      );

      const newContents: Record<string, string> = {};
      const newTimestamps: Record<string, string> = {};
      for (const r of results) {
        if (r.status === "fulfilled" && r.value.content) {
          newContents[r.value.id] = r.value.content;
          if (r.value.created_at) newTimestamps[r.value.id] = `Généré le ${formatDate(r.value.created_at)}`;
        }
      }
      setContents(newContents);
      setTimestamps(newTimestamps);
      setLoading(false);
    };
    loadCached();
  }, []);

  return (
    <div style={{ padding: "28px 36px", maxWidth: 1100 }}>
      <div className="mb-8">
        <div style={{ fontSize: 12, color: "#86868B", marginBottom: 4 }}>
          {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h1 style={{ fontSize: 32, fontWeight: 600, color: "#1D1D1F", letterSpacing: "-0.5px", lineHeight: 1 }}>
            Historique IA
          </h1>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#AF52DE" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="8" cy="8" r="6"/>
            <path d="M8 4v4l2.5 2.5"/>
          </svg>
        </div>
        <div style={{ fontSize: 12, color: "#86868B", marginTop: 6 }}>
          Analyses précédemment générées. Utilisez le Chat IA pour lancer de nouvelles analyses.
        </div>
      </div>

      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-apple" style={{ background: "#F5F5F7", padding: "20px 24px", minHeight: 200 }}>
              <div style={{ height: 14, width: 120, background: "rgba(0,0,0,0.06)", borderRadius: 4, marginBottom: 16 }} />
              <div style={{ height: 10, width: "80%", background: "rgba(0,0,0,0.04)", borderRadius: 3, marginBottom: 8 }} />
              <div style={{ height: 10, width: "60%", background: "rgba(0,0,0,0.04)", borderRadius: 3 }} />
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {CARDS.map((card) => {
            const content = contents[card.id];
            const ts = timestamps[card.id];

            return (
              <div key={card.id} className="rounded-apple" style={{ background: "#F5F5F7", padding: "20px 24px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#1D1D1F" }}>{card.title}</span>
                </div>

                {ts && (
                  <div style={{ fontSize: 10, color: "#AEAEB2", marginBottom: 10 }}>{ts}</div>
                )}

                {content ? (
                  <div
                    className="ai-content"
                    style={{ fontSize: 13, color: "#1D1D1F", lineHeight: 1.5, maxHeight: 400, overflowY: "auto" }}
                    dangerouslySetInnerHTML={{ __html: content }}
                  />
                ) : (
                  <div style={{ fontSize: 13, color: "#AEAEB2", fontStyle: "italic", padding: "20px 0" }}>
                    Pas encore d'analyse. Utilisez le Chat IA pour en générer une.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
