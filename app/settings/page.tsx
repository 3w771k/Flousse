"use client";
import { useState, useEffect, useCallback } from "react";

type Account = { id: string; name: string; bank: string; icon: string; type: string; balance: number; owner?: string };
type Category = { id: string; name: string; type: string; icon: string; parent_id: string | null; budget: number | null };
type Rule = { id: number; pattern: string; category_id: string; category_name: string; use_count: number };

type Section = "accounts" | "balances" | "categories" | "rules" | "patrimoine" | "context" | "api" | "export" | "reclassify" | "reset";
const SECTIONS: { id: Section; label: string }[] = [
  { id: "accounts", label: "Comptes" },
  { id: "balances", label: "Soldes" },
  { id: "categories", label: "Catégories" },
  { id: "rules", label: "Règles apprises" },
  { id: "patrimoine", label: "Patrimoine immobilier" },
  { id: "context", label: "Contexte IA" },
  { id: "api", label: "Clé API Claude" },
  { id: "export", label: "Export" },
  { id: "reclassify", label: "Reclassifier" },
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
  const [reclassifyStats, setReclassifyStats] = useState<{ total: number; unclassified: number } | null>(null);
  const [reclassifying, setReclassifying] = useState(false);
  const [reclassifyResult, setReclassifyResult] = useState<{ total: number; reclassifiedByRules: number; reclassifiedByAI: number; stillUnclassified: number } | null>(null);
  const [reclassifyError, setReclassifyError] = useState<string | null>(null);
  const [immoSci, setImmoSci] = useState("");
  const [immoLille40, setImmoLille40] = useState("");
  const [immoLille19, setImmoLille19] = useState("");
  const [immoSaved, setImmoSaved] = useState(false);
  const [userContext, setUserContext] = useState("");
  const [contextSaved, setContextSaved] = useState(false);
  const [budgetSuggestions, setBudgetSuggestions] = useState<{ category_id: string; suggested_budget: number; reasoning: string }[]>([]);
  const [budgetAILoading, setBudgetAILoading] = useState(false);
  const [budgetAIError, setBudgetAIError] = useState<string | null>(null);

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
      setImmoSci(settingsData.immo_sci || "300000");
      setImmoLille40(settingsData.immo_lille40 || "200000");
      setImmoLille19(settingsData.immo_lille19 || "100000");
      setUserContext(settingsData.user_context || "");
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

  const loadReclassifyStats = useCallback(async () => {
    const res = await fetch("/api/reclassify");
    if (res.ok) setReclassifyStats(await res.json());
  }, []);

  useEffect(() => {
    if (section === "reclassify") loadReclassifyStats();
  }, [section, loadReclassifyStats]);

  const runReclassify = async (mode: "unclassified" | "all") => {
    setReclassifying(true);
    setReclassifyResult(null);
    setReclassifyError(null);
    try {
      const res = await fetch("/api/reclassify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setReclassifyError(data.error || "Erreur");
      } else {
        setReclassifyResult(data);
        loadReclassifyStats();
      }
    } catch {
      setReclassifyError("Erreur réseau");
    } finally {
      setReclassifying(false);
    }
  };

  const [showAddAccount, setShowAddAccount] = useState(false);
  const [newAccount, setNewAccount] = useState({ name: "", bank: "", type: "liquidites", icon: "💳", owner: "commun" });
  const [addAccountError, setAddAccountError] = useState("");

  const addAccount = async () => {
    setAddAccountError("");
    const id = newAccount.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 50);
    if (!id || !newAccount.name || !newAccount.bank) {
      setAddAccountError("Nom et banque requis");
      return;
    }
    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name: newAccount.name, bank: newAccount.bank, type: newAccount.type, icon: newAccount.icon, balance: 0 }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setAddAccountError(data.error || "Erreur création");
      return;
    }
    // Set owner
    await fetch(`/api/accounts/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner: newAccount.owner }),
    });
    setNewAccount({ name: "", bank: "", type: "liquidites", icon: "💳", owner: "commun" });
    setShowAddAccount(false);
    loadData();
  };

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
    // Build updates: children budgets + computed parent sums
    const expenseParents = categories.filter((c) => !c.parent_id && c.type === "expense");
    const updates: { id: string; budget: number }[] = [];
    for (const parent of expenseParents) {
      const children = categories.filter((c) => c.parent_id === parent.id);
      let parentSum = 0;
      for (const child of children) {
        const b = savedBudgets[child.id] ?? child.budget ?? 0;
        updates.push({ id: child.id, budget: b });
        parentSum += b;
      }
      updates.push({ id: parent.id, budget: parentSum });
    }
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

  const saveImmo = async () => {
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        immo_sci: immoSci,
        immo_lille40: immoLille40,
        immo_lille19: immoLille19,
      }),
    });
    if (res.ok) {
      setImmoSaved(true);
      setTimeout(() => setImmoSaved(false), 2000);
    }
  };

  const saveContext = async () => {
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_context: userContext }),
    });
    if (res.ok) {
      setContextSaved(true);
      setTimeout(() => setContextSaved(false), 2000);
    }
  };

  const fetchBudgetSuggestions = async () => {
    setBudgetAILoading(true);
    setBudgetAIError(null);
    setBudgetSuggestions([]);
    try {
      const now = new Date();
      const to = now.toISOString().slice(0, 10);
      const fromDate = new Date(now.getFullYear(), now.getMonth() - 6, 1);
      const from = fromDate.toISOString().slice(0, 10);
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tab: "budget-suggestions", from, to, force: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBudgetAIError(data.message || data.error || "Erreur");
        return;
      }
      const parsed = JSON.parse(data.content);
      setBudgetSuggestions(parsed);
    } catch (err) {
      setBudgetAIError("Erreur lors de l'appel IA");
      console.error(err);
    } finally {
      setBudgetAILoading(false);
    }
  };

  const applySuggestion = async (catId: string, budget: number) => {
    setSavedBudgets((prev) => ({ ...prev, [catId]: budget }));
    await fetch("/api/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{ id: catId, budget }]),
    });
    setBudgetSuggestions((prev) => prev.filter((s) => s.category_id !== catId));
  };

  const applyAllSuggestions = async () => {
    const updates = budgetSuggestions.map((s) => ({ id: s.category_id, budget: s.suggested_budget }));
    const newBudgets = { ...savedBudgets };
    for (const s of budgetSuggestions) newBudgets[s.category_id] = s.suggested_budget;
    setSavedBudgets(newBudgets);
    await fetch("/api/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    setBudgetSuggestions([]);
  };

  const feImmo = (n: string) => {
    const v = parseInt(n);
    if (isNaN(v)) return "";
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
  };

  const totalImmo = (parseInt(immoSci) || 0) + (parseInt(immoLille40) || 0) + (parseInt(immoLille19) || 0);

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
                <button
                  onClick={() => setShowAddAccount(!showAddAccount)}
                  style={{ fontSize: 12, fontWeight: 500, color: "#007AFF", background: "none", border: "none", cursor: "pointer" }}
                >
                  {showAddAccount ? "Annuler" : "+ Ajouter un compte"}
                </button>
              </div>
              {showAddAccount && (
                <div className="rounded-apple" style={{ background: "#F5F5F7", padding: "16px 18px", marginBottom: 16 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                    <input
                      placeholder="Nom du compte"
                      value={newAccount.name}
                      onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
                      style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.1)", background: "white", fontSize: 13, outline: "none" }}
                    />
                    <input
                      placeholder="Banque"
                      value={newAccount.bank}
                      onChange={(e) => setNewAccount({ ...newAccount, bank: e.target.value })}
                      style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.1)", background: "white", fontSize: 13, outline: "none" }}
                    />
                    <select
                      value={newAccount.type}
                      onChange={(e) => setNewAccount({ ...newAccount, type: e.target.value })}
                      style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.1)", background: "white", fontSize: 13, outline: "none" }}
                    >
                      <option value="liquidites">Liquidités</option>
                      <option value="epargne">Épargne</option>
                      <option value="credit">Crédit</option>
                      <option value="carte">Carte différée</option>
                      <option value="bourse">Bourse</option>
                    </select>
                    <select
                      value={newAccount.owner}
                      onChange={(e) => setNewAccount({ ...newAccount, owner: e.target.value })}
                      style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.1)", background: "white", fontSize: 13, outline: "none" }}
                    >
                      <option value="moi">Moi</option>
                      <option value="elle">Elle</option>
                      <option value="commun">Commun</option>
                      <option value="enfant">Enfant</option>
                    </select>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input
                      placeholder="Icône (emoji)"
                      value={newAccount.icon}
                      onChange={(e) => setNewAccount({ ...newAccount, icon: e.target.value })}
                      style={{ width: 80, padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.1)", background: "white", fontSize: 13, outline: "none", textAlign: "center" }}
                    />
                    <button
                      onClick={addAccount}
                      style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#007AFF", color: "white", fontSize: 13, fontWeight: 500, cursor: "pointer" }}
                    >
                      Créer
                    </button>
                    {addAccountError && <span style={{ fontSize: 12, color: "#FF3B30" }}>{addAccountError}</span>}
                  </div>
                </div>
              )}
              {accounts.map((a) => (
                <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                  <span style={{ fontSize: 16 }}>{a.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#1D1D1F" }}>{a.name}</div>
                    <div style={{ fontSize: 11, color: "#86868B" }}>{a.bank}</div>
                  </div>
                  <select
                    value={a.owner || "commun"}
                    onChange={async (e) => {
                      await fetch(`/api/accounts/${a.id}`, {
                        method: "PATCH", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ owner: e.target.value }),
                      });
                      loadData();
                    }}
                    style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "1px solid rgba(0,0,0,0.1)", background: "white", color: "#86868B" }}
                  >
                    <option value="moi">Moi</option>
                    <option value="elle">Elle</option>
                    <option value="commun">Commun</option>
                    <option value="enfant">Enfant</option>
                  </select>
                  <button onClick={() => deleteAccount(a.id)} style={{ fontSize: 11, color: "#FF3B30", background: "none", border: "none", cursor: "pointer" }}>Supprimer</button>
                </div>
              ))}
            </div>
          )}

          {section === "balances" && (
            <div>
              <div className="section-label" style={{ marginBottom: 8 }}>Soldes des comptes</div>
              <div style={{ fontSize: 12, color: "#86868B", marginBottom: 20 }}>Cliquez sur un solde pour le corriger manuellement.</div>
              {accounts.map((a) => {
                const fe2 = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(n);
                return (
                  <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                    <span style={{ fontSize: 16 }}>{a.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "#1D1D1F" }}>{a.name}</div>
                      <div style={{ fontSize: 11, color: "#86868B" }}>{a.bank}</div>
                    </div>
                    <input
                      type="text"
                      inputMode="decimal"
                      defaultValue={a.balance.toFixed(2)}
                      onBlur={async (e) => {
                        const val = parseFloat(e.target.value.replace(/[^\d.,-]/g, "").replace(",", "."));
                        if (isNaN(val) || val === a.balance) return;
                        await fetch(`/api/accounts/${a.id}`, {
                          method: "PATCH", headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ actual_balance: val }),
                        });
                        loadData();
                      }}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      style={{
                        fontSize: 14, fontWeight: 500, width: 120, textAlign: "right",
                        padding: "4px 8px", borderRadius: 6, border: "1px solid rgba(0,0,0,0.1)",
                        background: "white", color: a.balance < 0 ? "#FF3B30" : "#1D1D1F", outline: "none",
                      }}
                    />
                    <span style={{ fontSize: 12, color: "#86868B", width: 16 }}>€</span>
                  </div>
                );
              })}
            </div>
          )}

          {section === "categories" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div className="section-label">Catégories ({parents.filter((p) => p.type === "expense").length} groupes)</div>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <button
                    onClick={fetchBudgetSuggestions}
                    disabled={budgetAILoading}
                    style={{ fontSize: 12, color: budgetAILoading ? "#AEAEB2" : "#AF52DE", background: "none", border: "none", cursor: budgetAILoading ? "default" : "pointer", fontWeight: 500 }}
                  >
                    {budgetAILoading ? "Calcul IA…" : "Calculer les budgets par IA"}
                  </button>
                  <button onClick={saveBudgets} style={{ fontSize: 12, color: budgetSaved ? "#34C759" : "#007AFF", background: "none", border: "none", cursor: "pointer", fontWeight: 500 }}>
                    {budgetSaved ? "Enregistré ✓" : "Enregistrer"}
                  </button>
                </div>
              </div>
              {budgetAIError && (
                <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(255,59,48,0.06)", color: "#FF3B30", fontSize: 12, marginBottom: 16 }}>
                  {budgetAIError}
                </div>
              )}

              {budgetSuggestions.length > 0 && (
                <div style={{ marginBottom: 20, borderRadius: 12, border: "1px solid rgba(175,82,222,0.15)", background: "rgba(175,82,222,0.04)", overflow: "hidden" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderBottom: "1px solid rgba(175,82,222,0.1)" }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: "#AF52DE" }}>Suggestions IA ({budgetSuggestions.length})</span>
                    <button onClick={applyAllSuggestions} style={{ fontSize: 12, color: "#AF52DE", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>
                      Appliquer tout
                    </button>
                  </div>
                  {budgetSuggestions.map((s) => {
                    const cat = categories.find((c) => c.id === s.category_id);
                    const current = savedBudgets[s.category_id];
                    return (
                      <div key={s.category_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 500, color: "#1D1D1F" }}>{cat?.name || s.category_id}</div>
                          <div style={{ fontSize: 11, color: "#86868B", marginTop: 2 }}>{s.reasoning}</div>
                        </div>
                        <div style={{ textAlign: "right", minWidth: 70 }}>
                          {current != null && <div style={{ fontSize: 10, color: "#AEAEB2", textDecoration: "line-through" }}>{current} €</div>}
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#AF52DE" }}>{s.suggested_budget} €</div>
                        </div>
                        <button onClick={() => applySuggestion(s.category_id, s.suggested_budget)} style={{ fontSize: 11, color: "#AF52DE", background: "none", border: "1px solid rgba(175,82,222,0.2)", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>
                          Appliquer
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {parents.filter((p) => p.type === "expense").map((parent) => {
                const children = childrenOf(parent.id);
                // Parent budget = sum of children budgets (auto-computed)
                const parentSum = children.reduce((sum, c) => {
                  const b = savedBudgets[c.id] ?? c.budget;
                  return sum + (b ?? 0);
                }, 0);
                return (
                  <div key={parent.id} style={{ marginBottom: 16, borderRadius: 10, overflow: "hidden", border: "1px solid rgba(0,0,0,0.06)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "rgba(0,0,0,0.02)" }}>
                      <span style={{ fontSize: 14 }}>{parent.icon}</span>
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "#1D1D1F" }}>{parent.name}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 11, color: "#86868B" }}>Budget :</span>
                        <span style={{ fontSize: 12, fontWeight: 500, color: "#1D1D1F", minWidth: 50, textAlign: "right" }}>{parentSum}</span>
                        <span style={{ fontSize: 11, color: "#86868B" }}>€/mois</span>
                      </div>
                    </div>
                    {children.map((sub) => (
                      <div key={sub.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px 8px 28px", borderTop: "1px solid rgba(0,0,0,0.04)" }}>
                        <span style={{ fontSize: 12 }}>{sub.icon}</span>
                        <span style={{ flex: 1, fontSize: 12, color: "#86868B" }}>{sub.name}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={savedBudgets[sub.id] ?? sub.budget ?? ""}
                            onChange={(e) => {
                              const v = parseInt(e.target.value) || 0;
                              setSavedBudgets((prev) => ({ ...prev, [sub.id]: v }));
                            }}
                            style={{ width: 60, padding: "3px 8px", borderRadius: 6, border: "1px solid rgba(0,0,0,0.1)", fontSize: 12, textAlign: "right" }}
                          />
                          <span style={{ fontSize: 11, color: "#AEAEB2" }}>€/mois</span>
                        </div>
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
                        <button onClick={() => deleteRule(r.id)} style={{ fontSize: 11, color: "#FF3B30", background: "none", border: "none", cursor: "pointer" }}>✕</button>
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
                {apiSaved ? "Enregistré ✓" : "Enregistrer"}
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

          {section === "reclassify" && (
            <div>
              <div className="section-label mb-2">Reclassifier les transactions</div>
              <p style={{ fontSize: 12, color: "#86868B", marginBottom: 16 }}>
                Ré-applique les règles et l&apos;IA sur les transactions existantes, sans avoir à réimporter les fichiers CSV.
              </p>

              {reclassifyStats && (
                <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
                  <div style={{ flex: 1, padding: "12px 16px", borderRadius: 10, background: "rgba(0,0,0,0.03)", border: "1px solid rgba(0,0,0,0.06)" }}>
                    <div style={{ fontSize: 22, fontWeight: 600, color: "#1D1D1F" }}>{reclassifyStats.total.toLocaleString("fr-FR")}</div>
                    <div style={{ fontSize: 11, color: "#86868B", marginTop: 2 }}>transactions au total</div>
                  </div>
                  <div style={{ flex: 1, padding: "12px 16px", borderRadius: 10, background: reclassifyStats.unclassified > 0 ? "rgba(255,149,0,0.06)" : "rgba(52,199,89,0.06)", border: `1px solid ${reclassifyStats.unclassified > 0 ? "rgba(255,149,0,0.15)" : "rgba(52,199,89,0.15)"}` }}>
                    <div style={{ fontSize: 22, fontWeight: 600, color: reclassifyStats.unclassified > 0 ? "#FF9500" : "#34C759" }}>{reclassifyStats.unclassified.toLocaleString("fr-FR")}</div>
                    <div style={{ fontSize: 11, color: "#86868B", marginTop: 2 }}>non classées</div>
                  </div>
                </div>
              )}

              {reclassifyResult && (
                <div style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(52,199,89,0.06)", border: "1px solid rgba(52,199,89,0.15)", marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "#34C759", marginBottom: 8 }}>Reclassification terminée</div>
                  <div style={{ fontSize: 12, color: "#86868B", display: "flex", flexDirection: "column", gap: 4 }}>
                    <span>{reclassifyResult.total.toLocaleString("fr-FR")} transactions traitées</span>
                    <span>{reclassifyResult.reclassifiedByRules.toLocaleString("fr-FR")} classées par règles</span>
                    <span>{reclassifyResult.reclassifiedByAI.toLocaleString("fr-FR")} classées par IA</span>
                    {reclassifyResult.stillUnclassified > 0 && (
                      <span style={{ color: "#FF9500" }}>{reclassifyResult.stillUnclassified.toLocaleString("fr-FR")} encore non classées</span>
                    )}
                  </div>
                </div>
              )}

              {reclassifyError && (
                <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(255,59,48,0.06)", color: "#FF3B30", fontSize: 12, marginBottom: 16 }}>
                  {reclassifyError}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button
                  onClick={() => runReclassify("unclassified")}
                  disabled={reclassifying || reclassifyStats?.unclassified === 0}
                  style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: reclassifying || reclassifyStats?.unclassified === 0 ? "rgba(0,122,255,0.3)" : "#007AFF", color: "white", fontSize: 13, fontWeight: 500, cursor: reclassifying || reclassifyStats?.unclassified === 0 ? "default" : "pointer", textAlign: "left" }}
                >
                  {reclassifying ? "Reclassification en cours…" : `Reclassifier les non classées${reclassifyStats ? ` (${reclassifyStats.unclassified})` : ""}`}
                </button>
                <button
                  onClick={() => runReclassify("all")}
                  disabled={reclassifying || reclassifyStats?.total === 0}
                  style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.1)", background: "transparent", color: reclassifying ? "#AEAEB2" : "#1D1D1F", fontSize: 13, fontWeight: 400, cursor: reclassifying ? "default" : "pointer", textAlign: "left" }}
                >
                  Tout reclassifier{reclassifyStats ? ` (${reclassifyStats.total.toLocaleString("fr-FR")} transactions)` : ""}
                </button>
              </div>
              <p style={{ fontSize: 11, color: "#AEAEB2", marginTop: 12 }}>
                "Tout reclassifier" écrase les catégories existantes. Utile après avoir ajouté de nouvelles règles.
              </p>
            </div>
          )}

          {section === "context" && (
            <div>
              <div className="section-label mb-2">Contexte IA</div>
              <p style={{ fontSize: 12, color: "#86868B", marginBottom: 16 }}>
                Décrivez votre situation personnelle pour affiner les analyses IA.
                Par exemple : objectifs financiers, événements récents, projets à venir.
              </p>
              <textarea
                value={userContext}
                onChange={(e) => setUserContext(e.target.value)}
                placeholder={"Ex: Couple avec 2 enfants (6 et 3 ans). Revenus locatifs suspendus depuis janvier 2025 (travaux). Prêt perso se termine en juillet 2028. Objectif : reconstituer l'épargne de précaution et remettre les appartements en location."}
                style={{
                  width: "100%", minHeight: 140, padding: "12px 14px", borderRadius: 10,
                  border: "1px solid rgba(0,0,0,0.1)", fontSize: 13, color: "#1D1D1F",
                  background: "white", resize: "vertical", fontFamily: "inherit",
                  lineHeight: 1.5, outline: "none",
                }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
                <button
                  onClick={saveContext}
                  style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: contextSaved ? "#34C759" : "#007AFF", color: "white", fontSize: 13, fontWeight: 500, cursor: "pointer", transition: "background 200ms" }}
                >
                  {contextSaved ? "Enregistré ✓" : "Enregistrer"}
                </button>
                <span style={{ fontSize: 11, color: "#AEAEB2" }}>
                  {userContext.length > 0 ? `${userContext.length} caractères` : "Aucun contexte défini"}
                </span>
              </div>
              <p style={{ fontSize: 11, color: "#AEAEB2", marginTop: 10 }}>
                Ce texte est injecté dans les prompts d'analyse et dans le chat IA. Il permet de personnaliser les recommandations.
              </p>
            </div>
          )}

          {section === "patrimoine" && (
            <div>
              <div className="section-label mb-2">Patrimoine immobilier</div>
              <p style={{ fontSize: 12, color: "#86868B", marginBottom: 20 }}>
                Valeur estimée de chaque bien immobilier. Utilisées pour le calcul du patrimoine net.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
                {[
                  { label: "SCI Paris (25%)", sublabel: "Quote-part de la SCI familiale", value: immoSci, setValue: setImmoSci },
                  { label: "Appartement Lille 40m²", sublabel: "Valeur estimée du bien", value: immoLille40, setValue: setImmoLille40 },
                  { label: "Appartement Lille 19m²", sublabel: "Valeur estimée du bien", value: immoLille19, setValue: setImmoLille19 },
                ].map((field) => (
                  <div key={field.label} style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 16px", borderRadius: 10, background: "white", border: "1px solid rgba(0,0,0,0.06)" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "#1D1D1F" }}>{field.label}</div>
                      <div style={{ fontSize: 11, color: "#86868B", marginTop: 2 }}>{field.sublabel}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="number"
                        value={field.value}
                        onChange={(e) => field.setValue(e.target.value)}
                        step={5000}
                        style={{ width: 110, padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.12)", fontSize: 13, textAlign: "right", fontFamily: "monospace" }}
                      />
                      <span style={{ fontSize: 12, color: "#86868B", minWidth: 14 }}>€</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#86868B", minWidth: 90, textAlign: "right" }}>
                      {feImmo(field.value)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Total */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderRadius: 10, background: "rgba(0,122,255,0.05)", border: "1px solid rgba(0,122,255,0.12)", marginBottom: 16 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: "#007AFF" }}>Total immobilier</span>
                <span style={{ fontSize: 16, fontWeight: 600, color: "#007AFF" }}>
                  {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(totalImmo)}
                </span>
              </div>

              <button
                onClick={saveImmo}
                style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: immoSaved ? "#34C759" : "#007AFF", color: "white", fontSize: 13, fontWeight: 500, cursor: "pointer", transition: "background 200ms" }}
              >
                {immoSaved ? "Enregistré ✓" : "Enregistrer"}
              </button>
              <p style={{ fontSize: 11, color: "#AEAEB2", marginTop: 10 }}>
                Ces valeurs sont utilisées dans le Sidebar (patrimoine net) et dans les analyses IA.
              </p>
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
