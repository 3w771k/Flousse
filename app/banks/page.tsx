"use client";
import { useState, useEffect } from "react";
import AIPanel from "@/components/AIPanel";

const fe = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

type Account = {
  id: string; name: string; bank: string; icon: string;
  type: string; balance: number;
};

const TYPE_LABELS: Record<string, string> = {
  liquidites: "Liquidités", epargne: "Épargne", credit: "Crédit", carte: "Carte différée", bourse: "Bourse",
};

export default function BanksPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiContent, setAiContent] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => { setAccounts(data); setLoading(false); })
      .catch((err) => { console.error("Banks: load error", err); setLoading(false); });
  }, []);

  const refreshAI = async () => {
    setAiLoading(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "optimisations" }),
      });
      const d = await res.json();
      setAiContent(res.ok ? (d.content || "Aucun contenu") : (d.message || d.error || "Erreur API"));
    } catch {
      setAiContent("Erreur de connexion");
    }
    setAiLoading(false);
  };

  const banks = [...new Set(accounts.map((a) => a.bank))];
  const totalAll = accounts.reduce((s, a) => s + a.balance, 0);

  return (
    <div style={{ padding: "28px 36px", maxWidth: 1100 }}>
      <div className="mb-8">
        <div style={{ fontSize: 12, color: "#86868B", marginBottom: 4 }}>
          {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
          <h1 style={{ fontSize: 32, fontWeight: 600, color: "#1D1D1F", letterSpacing: "-0.5px", lineHeight: 1 }}>Banques</h1>
          <span style={{ fontSize: 20, fontWeight: 300, color: totalAll >= 0 ? "#34C759" : "#FF3B30", letterSpacing: "-0.5px" }}>
            Total {fe(totalAll)}
          </span>
        </div>
      </div>

      {loading ? (
        <div style={{ color: "#AEAEB2", fontSize: 13 }}>Chargement\u2026</div>
      ) : (
        <>
          {/* Bank totals */}
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${banks.length}, 1fr)`, gap: 12, marginBottom: 24 }}>
            {banks.map((bank) => {
              const accts = accounts.filter((a) => a.bank === bank);
              const total = accts.reduce((s, a) => s + a.balance, 0);
              return (
                <div key={bank} className="rounded-apple" style={{ background: "#F5F5F7", padding: "16px 20px" }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "#86868B", marginBottom: 6 }}>{bank}</div>
                  <div style={{ fontSize: 24, fontWeight: 300, color: total >= 0 ? "#1D1D1F" : "#FF3B30", letterSpacing: "-0.8px", lineHeight: 1 }}>{fe(total)}</div>
                  <div style={{ fontSize: 11, color: "#AEAEB2", marginTop: 4 }}>{accts.length} compte{accts.length > 1 ? "s" : ""}</div>
                </div>
              );
            })}
          </div>

          {/* AI Panel */}
          <div className="mb-6">
            <AIPanel
              title="Optimiser mes comptes"
              content={aiContent || "<p>Cliquez sur Analyser pour une analyse IA de vos comptes.</p>"}
              timestamp="données en temps réel"
              onRefresh={refreshAI}
              refreshLoading={aiLoading}
            />
          </div>

          {/* Per bank */}
          {banks.map((bank) => {
            const accts = accounts.filter((a) => a.bank === bank);
            return (
              <div key={bank} style={{ marginBottom: 24 }}>
                <div className="section-label mb-3">{bank}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                  {accts.map((acct) => (
                    <div key={acct.id} className="rounded-apple" style={{ background: "#F5F5F7", padding: "16px 18px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500, color: "#1D1D1F" }}>{acct.name}</div>
                          <div style={{ fontSize: 11, color: "#AEAEB2", marginTop: 2 }}>{TYPE_LABELS[acct.type]}</div>
                        </div>
                        <span style={{ fontSize: 18 }}>{acct.icon}</span>
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 300, color: acct.balance < 0 ? "#FF3B30" : "#1D1D1F", letterSpacing: "-0.6px", lineHeight: 1 }}>
                        {fe(acct.balance)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </>
      )}

    </div>
  );
}
