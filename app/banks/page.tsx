"use client";
import { useState, useEffect, useRef } from "react";
import AIPanel from "@/components/AIPanel";

const fe = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

const fe2 = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(n);

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const loadAccounts = () => {
    fetch("/api/accounts")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => { setAccounts(data); setLoading(false); })
      .catch((err) => { console.error("Banks: load error", err); setLoading(false); });
  };

  useEffect(() => { loadAccounts(); }, []);

  const startEdit = (acct: Account) => {
    setEditingId(acct.id);
    setEditValue(String(acct.balance));
    setTimeout(() => inputRef.current?.select(), 50);
  };

  const saveBalance = async (id: string) => {
    const val = parseFloat(editValue.replace(/[^\d.,-]/g, "").replace(",", "."));
    if (isNaN(val)) { setEditingId(null); return; }
    await fetch(`/api/accounts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actual_balance: val }),
    });
    setEditingId(null);
    loadAccounts();
  };

  const [aiDate, setAiDate] = useState<string | null>(null);

  // Load cached analysis on mount
  useEffect(() => {
    const now = new Date();
    const to = now.toISOString().slice(0, 10);
    const from = new Date(now.getFullYear() - 1, now.getMonth(), 1).toISOString().slice(0, 10);
    fetch(`/api/analyze?tab=banks&from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((d) => { if (d.cached && d.content) { setAiContent(d.content); setAiDate(d.created_at); } })
      .catch(() => {});
  }, []);

  const refreshAI = async (force = false) => {
    setAiLoading(true);
    const now = new Date();
    const to = now.toISOString().slice(0, 10);
    const from = new Date(now.getFullYear() - 1, now.getMonth(), 1).toISOString().slice(0, 10);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tab: "banks", from, to, force }),
      });
      const d = await res.json();
      if (res.ok) {
        setAiContent(d.content || "Aucun contenu");
        setAiDate(d.created_at || null);
      } else {
        setAiContent(d.message || d.error || "Erreur API");
      }
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
              content={aiContent || `<p style="color:#AEAEB2">Cliquez sur "Générer" pour analyser vos comptes.</p>`}
              timestamp={aiDate ? new Date(aiDate + "Z").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
              onRefresh={() => refreshAI(false)}
              onForceRefresh={aiDate ? () => refreshAI(true) : undefined}
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
                      {editingId === acct.id ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <input
                            ref={inputRef}
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveBalance(acct.id);
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            onBlur={() => saveBalance(acct.id)}
                            style={{
                              fontSize: 18, fontWeight: 300, width: "100%", padding: "2px 6px",
                              border: "1px solid #007AFF", borderRadius: 6, outline: "none",
                              background: "white", color: "#1D1D1F",
                            }}
                            autoFocus
                          />
                        </div>
                      ) : (
                        <div
                          onClick={() => startEdit(acct)}
                          title="Cliquez pour ajuster le solde réel"
                          style={{
                            fontSize: 20, fontWeight: 300, letterSpacing: "-0.6px", lineHeight: 1,
                            color: acct.balance < 0 ? "#FF3B30" : "#1D1D1F",
                            cursor: "pointer", borderBottom: "1px dashed #AEAEB2", display: "inline-block",
                          }}
                        >
                          {fe2(acct.balance)}
                        </div>
                      )}
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
