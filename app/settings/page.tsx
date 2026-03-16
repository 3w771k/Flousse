"use client";
import { useState, useEffect, useCallback } from "react";

type Account = { id: string; name: string; bank: string; icon: string; type: string; balance: number };
type Category = { id: string; name: string; type: string; icon: string; parent_id: string | null; budget: number | null };
type Rule = { id: number; pattern: string; category_id: string; category_name: string; use_count: number };

type Section = "accounts" | "categories" | "rules" | "api" | "export" | "reset";
const SECTIONS: { id: Section; label: string }[] = [
  { id: "accounts", label: "Comptes" },
  { id: "categories", label: "Catégories" },
  { id: "rules", label: "Règles apprises" },
  { id: "api", label: "Clé API Claude" },
  { id: "export", label: "Export" },
  { id: "reset", label: "Reset" },
];

export default function SettingsPage() {
  const [section, setSection] = useState<Section>("accounts");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [savedBudgets, setSavedBudgets] = useState<Record<string, number>>({});
  const [apiSaved, setApiSaved] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [budgetSaved, setBudgetSaved] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [accRes, catRes, ruleRes, settingsRes] = await Promise.all([
        fetch("/api/accounts"),
        fetch("/api/categories"),
        fetch("/api/rules"),
        fetch("/api/settings"),
      ]);
      if (!accRes.ok || !catRes.ok || !ruleRes.ok || !settingsRes.ok) {
        console.error("Settings: failed to load data");
        return;
      }
      const [accData, catData, ruleData, settingsData] = await Promise.all([
        accRes.json(), catRes.json(), ruleRes.json(), settingsRes.json(),
      ]);
      setAccounts(accData);
      setCategories(catData);
      setRules(ruleData);
      setApiKey(settingsData.claude_api_key || "");
      // Init budget state
      const budgets: Record<string, number> = {};
      for (const c of catData as Category[]) {
        if (c.budget != null) budgets[c.id] = c.budget;
      }
      setSavedBudgets(budgets);
    } catch (err) {
      console.error("Settings: load error", err);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const deleteAccount = async (id: string) => {
    const prev = accounts;
    setAccounts((a) => a.filter((x) => x.id !== id));
    const res = await fetch(`/api/accounts/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setAccounts(prev); // rollback
    }
  };

  const deleteRule = async (id: number) => {
    const prev = rules;
    setRules((r) => r.filter((x) => x.id !== id));
    const res = await fetch(`/api/rules/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setRules(prev); // rollback
    }
  };

  const saveBudgets = async () => {
    const updates = Object.entries(savedBudgets).map(([id, budget]) => ({ id, budget }));
    const res = await fetch("/api/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      setBudgetSaved(true);
      setTimeout(() => setBudgetSaved(false), 2000);
    }
  };

  const saveApiKey = async () => {
    setApiError(null);
    if (apiKey && !apiKey.startsWith("sk-ant-")) {
      setApiError("La clé doit commencer par sk-ant-");
      return;
    }
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claude_api_key: apiKey }),
    });
    if (res.ok) {
      setApiSaved(true);
      setTimeout(() => setApiSaved(false), 2000);
    } else {
      setApiError("Erreur lors de la sauvegarde");
    }
  };

  const exportCsv = async () => {
    const res = await fetch("/api/transactions");
    if (!res.ok) return;
    const txs = await res.json();
    const header = "date,label,amount,category_id,account_id,source\n";
    const rows = txs.map((t: { date: string; label: string; amount: number; category_id: string; account_id: string; source: string }) =>
      `${t.date},"${t.label.replace(/"/g, '""')}",${t.amount},${t.category_id},${t.account_id},${t.source}`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `flousse-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportJson = async () => {
    const [txRes, ruleRes, settRes, catRes, accRes] = await Promise.all([
      fetch("/api/transactions"), fetch("/api/rules"), fetch("/api/settings"),
      fetch("/api/categories"), fetch("/api/accounts"),
    ]);
    if (!txRes.ok || !ruleRes.ok || !settRes.ok || !catRes.ok || !accRes.ok) return;
    const backup = {
      exportDate: new Date().toISOString(),
      transactions: await txRes.json(),
      rules: await ruleRes.json(),
      settings: await settRes.json(),
      categories: await catRes.json(),
      accounts: await accRes.json(),
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `flousse-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const resetData = async () => {
    const res = await fetch("/api/transactions", { method: "DELETE" });
    if (res.ok) {
      setResetDone(true);
      setConfirmReset(false);
      setTimeout(() => setResetDone(false), 3000);
    }
  };

  const parents = categories.filter((c) => !c.parent_id);
  const childrenOf = (pid: string) => categories.filter((c) => c.parent_id === pid);

  return (
    <div style={{ padding: "28px 36px", maxWidth: 1100 }}>
      <div className="mb-8">
        <div style={{ fontSize: 12, color: "#86868B", marginBottom: 4 }}>
          {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </div>
        <h1 style={{ fontSize: 32, fontWeight: 600, color: "#1D1D1F", letterSpacing: "-0.5px", lineHeight: 1 }}>Paramètres</h1>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 16 }}>
        {/* Sidebar */}
        <div className="rounded-apple" style={{ background: "#F5F5F7", padding: "8px", alignSelf: "start" }}>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              style={{ width: "100%", textAlign: "left", padding: "8px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: section === s.id ? 500 : 400, color: section === s.id ? "#1D1D1F" : "#86868B", background: section === s.id ? "rgba(0,0,0,0.05)" : "transparent" }}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="rounded-apple" style={{ background: "#F5F5F7", padding: "20px 24px" }}>

          {section === "accounts" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div className="section-label">Comptes bancaires ({accounts.length})</div>
              </div>
              {accounts.map((a) => (
                <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                  <span style={{ fontSize: 16 }}>{a.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#1D1D1F" }}>{a.name}</div>
                    <div style={{ fontSize: 11, color: "#86868B" }}>{a.bank}</div>
                  </div>
                  <button onClick={() => deleteAccount(a.id)} style={{ fontSize: 11, color: "#FF3B30", background: "none", border: "none", cursor: "pointer" }}>Supprimer</button>
                </div>
              ))}
            </div>
          )}

          {section === "categories" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div className="section-label">Catégories ({parents.filter((p) => p.type === "expense").length} groupes)</div>
                <button onClick={saveBudgets} style={{ fontSize: 12, color: budgetSaved ? "#34C759" : "#007AFF", background: "none", border: "none", cursor: "pointer", fontWeight: 500 }}>
                  {budgetSaved ? "Enregistré \u2713" : "Enregistrer"}
                </button>
              </div>
              {parents.filter((p) => p.type === "expense").map((parent) => {
                const children = childrenOf(parent.id);
                return (
                  <div key={parent.id} style={{ marginBottom: 16, borderRadius: 10, overflow: "hidden", border: "1px solid rgba(0,0,0,0.06)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "rgba(0,0,0,0.02)" }}>
                      <span style={{ fontSize: 14 }}>{parent.icon}</span>
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "#1D1D1F" }}>{parent.name}</span>
                      {parent.budget != null && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 11, color: "#86868B" }}>Budget :</span>
                          <input
                            type="number"
                            value={savedBudgets[parent.id] ?? parent.budget ?? ""}
                            onChange={(e) => setSavedBudgets((prev) => ({ ...prev, [parent.id]: parseInt(e.target.value) || 0 }))}
                            style={{ width: 60, padding: "3px 8px", borderRadius: 6, border: "1px solid rgba(0,0,0,0.1)", fontSize: 12, textAlign: "right" }}
                          />
                          <span style={{ fontSize: 11, color: "#86868B" }}>\u20AC/mois</span>
                        </div>
                      )}
                    </div>
                    {children.map((sub) => (
                      <div key={sub.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px 8px 28px", borderTop: "1px solid rgba(0,0,0,0.04)" }}>
                        <span style={{ fontSize: 12 }}>{sub.icon}</span>
                        <span style={{ flex: 1, fontSize: 12, color: "#86868B" }}>{sub.name}</span>
                        {sub.budget != null && (
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <input
                              type="number"
                              value={savedBudgets[sub.id] ?? sub.budget ?? ""}
                              onChange={(e) => setSavedBudgets((prev) => ({ ...prev, [sub.id]: parseInt(e.target.value) || 0 }))}
                              style={{ width: 60, padding: "3px 8px", borderRadius: 6, border: "1px solid rgba(0,0,0,0.1)", fontSize: 12, textAlign: "right" }}
                            />
                            <span style={{ fontSize: 11, color: "#AEAEB2" }}>\u20AC/mois</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {section === "rules" && (
            <div>
              <div className="section-label mb-5">Règles apprises ({rules.length})</div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Libellé normalisé", "Catégorie", "Util.", ""].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "6px 0", fontSize: 11, fontWeight: 500, color: "#86868B", textTransform: "uppercase", letterSpacing: "0.4px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r) => (
                    <tr key={r.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                      <td style={{ padding: "10px 0", fontSize: 12, color: "#1D1D1F", fontFamily: "monospace" }}>{r.pattern}</td>
                      <td style={{ padding: "10px 8px", fontSize: 12, color: "#86868B" }}>{r.category_name}</td>
                      <td style={{ padding: "10px 0", fontSize: 12, color: "#AEAEB2" }}>{r.use_count}</td>
                      <td style={{ padding: "10px 0" }}>
                        <button onClick={() => deleteRule(r.id)} style={{ fontSize: 11, color: "#FF3B30", background: "none", border: "none", cursor: "pointer" }}>\u2715</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {section === "api" && (
            <div>
              <div className="section-label mb-2">Clé API Claude</div>
              <p style={{ fontSize: 12, color: "#86868B", marginBottom: 16 }}>Stockée localement dans SQLite. Jamais envoyée à un serveur tiers.</p>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => { setApiKey(e.target.value); setApiError(null); }}
                  placeholder="sk-ant-api03-…"
                  style={{ flex: 1, padding: "10px 14px", borderRadius: 10, border: `1px solid ${apiError ? "rgba(255,59,48,0.3)" : "rgba(0,0,0,0.1)"}`, fontSize: 13, fontFamily: "monospace", background: "white", outline: "none" }}
                />
                <button onClick={() => setShowKey(!showKey)}
                  style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.1)", background: "white", fontSize: 12, color: "#86868B", cursor: "pointer" }}>
                  {showKey ? "Masquer" : "Afficher"}
                </button>
              </div>
              {apiError && (
                <div style={{ fontSize: 12, color: "#FF3B30", marginBottom: 8 }}>{apiError}</div>
              )}
              <button
                onClick={saveApiKey}
                style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: apiSaved ? "#34C759" : "#007AFF", color: "white", fontSize: 13, fontWeight: 500, cursor: "pointer", transition: "background 200ms" }}
              >
                {apiSaved ? "Enregistré \u2713" : "Enregistrer"}
              </button>
            </div>
          )}

          {section === "export" && (
            <div>
              <div className="section-label mb-5">Exporter les données</div>
              {[
                { label: "Toutes les transactions", sub: "CSV", action: exportCsv },
                { label: "Backup complet", sub: "JSON — transactions + règles + paramètres", action: exportJson },
              ].map((e, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#1D1D1F" }}>{e.label}</div>
                    <div style={{ fontSize: 11, color: "#86868B", marginTop: 2 }}>{e.sub}</div>
                  </div>
                  <button onClick={e.action} style={{ fontSize: 12, color: "#007AFF", background: "none", border: "none", cursor: "pointer", fontWeight: 500 }}>Télécharger</button>
                </div>
              ))}
            </div>
          )}

          {section === "reset" && (
            <div>
              <div className="section-label mb-2">Reset complet</div>
              <p style={{ fontSize: 13, color: "#86868B", marginBottom: 20 }}>Supprime toutes les transactions. Cette action est irréversible.</p>
              {resetDone && (
                <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(52,199,89,0.08)", color: "#34C759", fontSize: 13, marginBottom: 12 }}>
                  Transactions supprimées avec succès.
                </div>
              )}
              {!confirmReset ? (
                <button onClick={() => setConfirmReset(true)} style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "rgba(255,59,48,0.08)", color: "#FF3B30", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
                  Réinitialiser les données
                </button>
              ) : (
                <div style={{ padding: 16, borderRadius: 12, background: "rgba(255,59,48,0.06)", border: "1px solid rgba(255,59,48,0.12)" }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "#FF3B30", marginBottom: 12 }}>Êtes-vous sûr ? Action irréversible.</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setConfirmReset(false)} style={{ flex: 1, padding: 10, borderRadius: 10, border: "none", background: "rgba(0,0,0,0.06)", color: "#86868B", fontSize: 13, cursor: "pointer" }}>Annuler</button>
                    <button onClick={resetData} style={{ flex: 1, padding: 10, borderRadius: 10, border: "none", background: "#FF3B30", color: "white", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Confirmer</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
