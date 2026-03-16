"use client";
import { useState, useEffect, useRef } from "react";
import InsightsBanner from "@/components/InsightsBanner";

const fe = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

const fe2 = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(n);

const fek = (n: number) =>
  Math.abs(n) >= 1000
    ? new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(n / 1000) + " k€"
    : fe(n);

type Account = {
  id: string; name: string; bank: string; icon: string;
  type: string; balance: number;
};

type Settings = Record<string, string>;

const TYPE_LABELS: Record<string, string> = {
  liquidites: "Liquidités", epargne: "Épargne", credit: "Crédit",
  carte: "Carte différée", bourse: "Bourse",
};

// Helper: get credit metadata for an account from settings
function getCreditMeta(id: string, settings: Settings) {
  const prefix = `credit_${id}_`;
  return {
    mensualite: parseFloat(settings[`${prefix}mensualite`] || "0") || null,
    taux: parseFloat(settings[`${prefix}taux`] || "0") || null,
    fin: settings[`${prefix}fin`] || null,
    montant_initial: parseFloat(settings[`${prefix}montant_initial`] || "0") || null,
  };
}

// Progress bar component for credit repayment
function RepaymentBar({ paid, total }: { paid: number; total: number }) {
  const pct = total > 0 ? Math.min((paid / total) * 100, 100) : 0;
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: "#86868B" }}>Remboursé</span>
        <span style={{ fontSize: 11, color: "#86868B" }}>{pct.toFixed(1)}%</span>
      </div>
      <div
        style={{
          height: 5, borderRadius: 3, background: "rgba(0,0,0,0.06)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%", width: `${pct}%`, borderRadius: 3,
            background: pct >= 80 ? "#34C759" : pct >= 40 ? "#FF9500" : "#007AFF",
            transition: "width 0.4s ease",
          }}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
        <span style={{ fontSize: 10, color: "#AEAEB2" }}>{fek(paid)} remb.</span>
        <span style={{ fontSize: 10, color: "#AEAEB2" }}>{fek(total)} initial</span>
      </div>
    </div>
  );
}

export default function BanksPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const now = new Date();
  const insightsTo = now.toISOString().slice(0, 10);
  const insightsFrom = new Date(now.getFullYear() - 1, now.getMonth(), 1).toISOString().slice(0, 10);

  const loadAccounts = () => {
    fetch("/api/accounts")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => { setAccounts(data); })
      .catch((err) => { console.error("Banks: load error", err); })
      .finally(() => setLoading(false));
  };

  const loadSettings = () => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => setSettings(data))
      .catch((err) => console.error("Banks: settings error", err));
  };

  useEffect(() => {
    loadAccounts();
    loadSettings();
  }, []);

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

  // Compute patrimoine figures
  const liquidites = accounts
    .filter((a) => a.type === "liquidites")
    .reduce((s, a) => s + a.balance, 0);

  const epargne = accounts
    .filter((a) => a.type === "epargne" || a.type === "bourse")
    .reduce((s, a) => s + a.balance, 0);

  const creditsTotal = accounts
    .filter((a) => a.type === "credit")
    .reduce((s, a) => s + Math.abs(a.balance), 0);

  const immoSci = parseFloat(settings["immo_sci"] || "0");
  const immoLille40 = parseFloat(settings["immo_lille40"] || "0");
  const immoLille19 = parseFloat(settings["immo_lille19"] || "0");
  const immobilier = immoSci + immoLille40 + immoLille19;

  const patrimoineNet = liquidites + epargne + immobilier - creditsTotal;

  const banks = [...new Set(accounts.map((a) => a.bank))];
  const totalAll = accounts.reduce((s, a) => s + a.balance, 0);

  return (
    <div style={{ padding: "28px 36px", maxWidth: 1100 }}>
      {/* Page header */}
      <div className="mb-8">
        <div style={{ fontSize: 12, color: "#86868B", marginBottom: 4 }}>
          {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
          <h1 style={{ fontSize: 32, fontWeight: 600, color: "#1D1D1F", letterSpacing: "-0.5px", lineHeight: 1 }}>Banques</h1>
          <span style={{ fontSize: 20, fontWeight: 300, color: totalAll >= 0 ? "#34C759" : "#FF3B30", letterSpacing: "-0.5px" }}>
            Solde net {fe2(totalAll)}
          </span>
        </div>
      </div>

      {loading ? (
        <div style={{ color: "#AEAEB2", fontSize: 13 }}>Chargement…</div>
      ) : (
        <>
          {/* B3 — Patrimoine section */}
          <div className="rounded-apple-lg mb-6" style={{ background: "#F5F5F7", display: "grid", gridTemplateColumns: "1fr 1px 1fr 1px 1fr 1px 1fr 1px 1fr" }}>
            {[
              {
                label: "Liquidités",
                value: liquidites,
                color: "#34C759",
                sub: "Comptes courants",
              },
              {
                label: "Épargne & Bourse",
                value: epargne,
                color: "#34C759",
                sub: "Livrets, PEA",
              },
              {
                label: "Immobilier",
                value: immobilier,
                color: "#34C759",
                sub: `SCI ${fek(immoSci)} · 40m² ${fek(immoLille40)} · 19m² ${fek(immoLille19)}`,
              },
              {
                label: "Crédits restants",
                value: creditsTotal,
                color: "#FF3B30",
                sub: "Capital restant dû total",
                negate: true,
              },
              {
                label: "Patrimoine net",
                value: patrimoineNet,
                color: patrimoineNet >= 0 ? "#34C759" : "#FF3B30",
                sub: "Actifs − dettes",
                bold: true,
              },
            ].map((item, i) => (
              <div key={item.label} style={{ display: "contents" }}>
                {i > 0 && <div style={{ background: "rgba(0,0,0,0.04)", width: 1 }} />}
                <div style={{ padding: "18px 20px" }}>
                  <div style={{ fontSize: 11, fontWeight: 400, color: "#86868B", marginBottom: 6 }}>{item.label}</div>
                  <div
                    style={{
                      fontSize: item.bold ? 22 : 20,
                      fontWeight: item.bold ? 500 : 300,
                      color: item.color,
                      letterSpacing: "-0.6px",
                      lineHeight: 1,
                      marginBottom: 5,
                    }}
                  >
                    {item.negate ? `−\u202F${fek(item.value)}` : fek(item.value)}
                  </div>
                  <div style={{ fontSize: 10, color: "#AEAEB2", lineHeight: 1.4 }}>{item.sub}</div>
                </div>
              </div>
            ))}
          </div>

          {/* InsightsBanner */}
          <InsightsBanner tab="banks" from={insightsFrom} to={insightsTo} />

          {/* Bank totals summary row */}
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

          {/* Per bank — account cards */}
          {banks.map((bank) => {
            const accts = accounts.filter((a) => a.bank === bank);
            return (
              <div key={bank} style={{ marginBottom: 24 }}>
                <div className="section-label mb-3">{bank}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                  {accts.map((acct) => {
                    const isCredit = acct.type === "credit";
                    const meta = isCredit ? getCreditMeta(acct.id, settings) : null;
                    const capitalRestant = isCredit ? Math.abs(acct.balance) : null;
                    const paid = (meta && meta.montant_initial && capitalRestant != null)
                      ? meta.montant_initial - capitalRestant
                      : null;

                    return (
                      <div
                        key={acct.id}
                        className="rounded-apple"
                        style={{ background: "#F5F5F7", padding: "16px 18px" }}
                      >
                        {/* Header row */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 500, color: "#1D1D1F" }}>{acct.name}</div>
                            <div style={{ fontSize: 11, color: "#AEAEB2", marginTop: 2 }}>{TYPE_LABELS[acct.type]}</div>
                          </div>
                          <span style={{ fontSize: 18 }}>{acct.icon}</span>
                        </div>

                        {/* Balance / edit */}
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
                              fontSize: isCredit ? 22 : 20,
                              fontWeight: 300,
                              letterSpacing: "-0.6px",
                              lineHeight: 1,
                              color: isCredit ? "#FF3B30" : acct.balance < 0 ? "#FF3B30" : "#1D1D1F",
                              cursor: "pointer",
                              borderBottom: "1px dashed #AEAEB2",
                              display: "inline-block",
                            }}
                          >
                            {isCredit && capitalRestant != null ? fe2(capitalRestant) : fe2(acct.balance)}
                          </div>
                        )}

                        {/* B2 — Credit metadata */}
                        {isCredit && meta && capitalRestant != null && (
                          <div style={{ marginTop: 10 }}>
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr",
                                gap: "4px 12px",
                                marginBottom: 6,
                              }}
                            >
                              {meta.mensualite != null && (
                                <div>
                                  <div style={{ fontSize: 10, color: "#86868B" }}>Mensualité</div>
                                  <div style={{ fontSize: 12, fontWeight: 500, color: "#1D1D1F" }}>
                                    {fe2(meta.mensualite)}
                                  </div>
                                </div>
                              )}
                              {meta.taux != null && (
                                <div>
                                  <div style={{ fontSize: 10, color: "#86868B" }}>Taux</div>
                                  <div style={{ fontSize: 12, fontWeight: 500, color: "#1D1D1F" }}>
                                    {meta.taux.toFixed(2)}{"\u202F"}%
                                  </div>
                                </div>
                              )}
                              {meta.fin && (
                                <div>
                                  <div style={{ fontSize: 10, color: "#86868B" }}>Fin</div>
                                  <div style={{ fontSize: 12, fontWeight: 500, color: "#1D1D1F" }}>
                                    {meta.fin}
                                  </div>
                                </div>
                              )}
                              {meta.montant_initial != null && (
                                <div>
                                  <div style={{ fontSize: 10, color: "#86868B" }}>Montant initial</div>
                                  <div style={{ fontSize: 12, fontWeight: 500, color: "#1D1D1F" }}>
                                    {fek(meta.montant_initial)}
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Repayment progress bar */}
                            {paid != null && meta.montant_initial != null && (
                              <RepaymentBar paid={paid} total={meta.montant_initial} />
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
