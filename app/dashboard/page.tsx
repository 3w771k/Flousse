"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import DonutChart from "@/components/DonutChart";
import CashflowSection from "@/components/CashflowSection";
import { useChatContext } from "@/components/ChatContext";
import ChatButton from "@/components/ChatButton";

const fe = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
const fek = (n: number) =>
  Math.abs(n) >= 1000
    ? new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(n / 1000) + " k€"
    : fe(n);

const PERIODS: { label: string; months: number }[] = [
  { label: "Mois", months: 1 },
  { label: "Trim.", months: 3 },
  { label: "Sem.", months: 6 },
  { label: "Année", months: 12 },
];

const CAT_COLORS: Record<string, string> = {
  alimentation: "#34C759", enfants: "#FF9500", sante: "#5AC8FA",
  transports: "#AF52DE", voyages: "#007AFF", "shopping-loisirs": "#5856D6",
  "abonnements-telecom": "#86868B", logement: "#FF9500", "cadeaux-dons": "#FF6482",
  "finances-admin": "#AEAEB2", divers: "#AEAEB2",
  revenus: "#34C759", salaire: "#007AFF", loyers: "#FF9500",
  allocations: "#5AC8FA", remboursements: "#AF52DE", "autre-revenu": "#5856D6",
  transferts: "#AF52DE", "vir-interne": "#AF52DE", "vir-joint": "#9B59B6", "vir-immo": "#8E44AD",
};

type Transaction = {
  id: string; account_id: string; date: string; label: string;
  amount: number; category_id: string; confidence: number; source: string;
};
type Category = { id: string; name: string; type: string; parent_id: string | null; budget: number | null; icon?: string };
type Account = { id: string; name: string; bank: string; owner?: string };

const OWNER_LABELS: Record<string, string> = { all: "Tous", moi: "Moi", elle: "Elle", commun: "Commun", enfant: "Enfants" };

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// D1 — offset-aware date range: offset=0 → current period, offset=1 → previous, etc.
function getDateRange(months: number, offset: number): { from: string; to: string; label: string } {
  const now = new Date();
  let fromDate: Date, toDate: Date, label: string;

  if (months === 1) {
    // Navigate month by month
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    fromDate = d;
    toDate = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    label = d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  } else if (months === 3) {
    // Navigate quarter by quarter (T1=Jan-Mar, T2=Apr-Jun, T3=Jul-Sep, T4=Oct-Dec)
    const currentQSeq = now.getFullYear() * 4 + Math.floor(now.getMonth() / 3);
    const targetQSeq = currentQSeq - offset;
    const targetYear = Math.floor(targetQSeq / 4);
    const targetQ = targetQSeq - targetYear * 4; // 0–3
    const targetMonth = targetQ * 3;
    fromDate = new Date(targetYear, targetMonth, 1);
    toDate = new Date(targetYear, targetMonth + 3, 0);
    label = `T${targetQ + 1} ${targetYear}`;
  } else if (months === 6) {
    // Navigate half-year by half-year (S1=Jan-Jun, S2=Jul-Dec)
    const currentSSeq = now.getFullYear() * 2 + (now.getMonth() < 6 ? 0 : 1);
    const targetSSeq = currentSSeq - offset;
    const targetYear = Math.floor(targetSSeq / 2);
    const targetS = targetSSeq - targetYear * 2; // 0 or 1
    const targetMonth = targetS * 6;
    fromDate = new Date(targetYear, targetMonth, 1);
    toDate = new Date(targetYear, targetMonth + 6, 0);
    label = `S${targetS + 1} ${targetYear}`;
  } else {
    // Navigate year by year
    const targetYear = now.getFullYear() - offset;
    fromDate = new Date(targetYear, 0, 1);
    toDate = new Date(targetYear, 11, 31);
    label = `${targetYear}`;
  }

  return {
    from: localDateStr(fromDate),
    to: localDateStr(toDate),
    label,
  };
}

export default function DashboardPage() {
  const [periodIdx, setPeriodIdx] = useState(0);
  const [offset, setOffset] = useState(0);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [cats, setCats] = useState<Map<string, Category>>(new Map());
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [budgetSuggestions, setBudgetSuggestions] = useState<{ category_id: string; suggested_budget: number; reasoning: string }[]>([]);
  const [budgetAILoading, setBudgetAILoading] = useState(false);
  // Task 3 — Category explorer
  const [explorerCatId, setExplorerCatId] = useState<string | null>(null);
  const [explorerTxs, setExplorerTxs] = useState<Transaction[]>([]);
  const [explorerHistory, setExplorerHistory] = useState<{ month: string; total: number }[]>([]);
  const [explorerInsight, setExplorerInsight] = useState<{ type: string; title: string; body: string; metric: string | null }[] | null>(null);
  const [explorerLoading, setExplorerLoading] = useState(false);
  const [reclassifyingId, setReclassifyingId] = useState<string | null>(null);
  const [reclassifyOpenId, setReclassifyOpenId] = useState<string | null>(null);

  const { setPageContext } = useChatContext();
  const range = useMemo(() => getDateRange(PERIODS[periodIdx].months, offset), [periodIdx, offset]);

  // Reset offset when period type changes
  const handlePeriodChange = (idx: number) => {
    setPeriodIdx(idx);
    setOffset(0);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [txRes, catRes, accRes] = await Promise.all([
        fetch(`/api/transactions?from=${range.from}&to=${range.to}`),
        fetch("/api/categories"),
        fetch("/api/accounts"),
      ]);
      if (!txRes.ok || !catRes.ok || !accRes.ok) {
        console.error("Dashboard: API error", txRes.status, catRes.status);
        setLoading(false);
        return;
      }
      const [txData, catData, accData]: [Transaction[], Category[], Account[]] = await Promise.all([txRes.json(), catRes.json(), accRes.json()]);
      setTxs(txData);
      setCats(new Map(catData.map((c) => [c.id, c])));
      setAccounts(accData);
    } catch (err) {
      console.error("Dashboard: load error", err);
    }
    setLoading(false);
  }, [range]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setPageContext({ page: "dashboard", period: { from: range.from, to: range.to }, explorerCatId: explorerCatId ?? undefined });
  }, [setPageContext, range, explorerCatId]);

  const fetchBudgetSuggestions = useCallback(async () => {
    setBudgetAILoading(true);
    try {
      const now = new Date();
      const to = localDateStr(now);
      const fromDate = new Date(now.getFullYear(), now.getMonth() - 6, 1);
      const from = localDateStr(fromDate);
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tab: "budget-suggestions", from, to, force: true }),
      });
      const data = await res.json();
      if (res.ok) setBudgetSuggestions(JSON.parse(data.content));
    } catch (err) {
      console.error("Budget AI error", err);
    } finally {
      setBudgetAILoading(false);
    }
  }, []);

  const applySuggestion = async (catId: string, budget: number) => {
    await fetch("/api/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{ id: catId, budget }]),
    });
    setBudgetSuggestions((prev) => prev.filter((s) => s.category_id !== catId));
    loadData();
  };

  const applyAllSuggestions = async () => {
    const updates = budgetSuggestions.map((s) => ({ id: s.category_id, budget: s.suggested_budget }));
    await fetch("/api/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    setBudgetSuggestions([]);
    loadData();
  };

  const openExplorer = useCallback(async (catId: string) => {
    setExplorerCatId(catId);
    setExplorerLoading(true);
    setExplorerInsight(null);
    setExplorerTxs([]);
    setExplorerHistory([]);

    // Build owner account IDs for filtering
    const oIds = ownerFilter !== "all"
      ? new Set(accounts.filter((a) => a.owner === ownerFilter).map((a) => a.id))
      : null;
    const filterByOwner = (txList: Transaction[]) => oIds ? txList.filter((t) => oIds.has(t.account_id)) : txList;

    // Fetch transactions for this category in current period
    const txRes = await fetch(`/api/transactions?from=${range.from}&to=${range.to}&categoryId=${catId}`);
    if (txRes.ok) setExplorerTxs(filterByOwner(await txRes.json()));

    // Fetch 6-month history
    const now = new Date();
    const historyData: { month: string; total: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mFrom = localDateStr(d);
      const mTo = localDateStr(new Date(d.getFullYear(), d.getMonth() + 1, 0));
      const mRes = await fetch(`/api/transactions?from=${mFrom}&to=${mTo}&categoryId=${catId}`);
      if (mRes.ok) {
        const mTxs: Transaction[] = filterByOwner(await mRes.json());
        const total = mTxs.reduce((s, t) => s + Math.abs(t.amount), 0);
        historyData.push({ month: d.toLocaleDateString("fr-FR", { month: "short" }), total });
      }
    }
    setExplorerHistory(historyData);
    setExplorerLoading(false);

    // Fetch AI insight (non-blocking)
    try {
      const insRes = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tab: `category-insight-${catId}`, from: range.from, to: range.to }),
      });
      if (insRes.ok) {
        const insData = await insRes.json();
        setExplorerInsight(JSON.parse(insData.content));
      }
    } catch { /* ignore */ }
  }, [range, ownerFilter, accounts]);

  const reclassifyTransaction = async (txId: string, newCatId: string) => {
    setReclassifyingId(txId);
    await fetch(`/api/transactions/${txId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId: newCatId }),
    });
    setExplorerTxs((prev) => prev.filter((t) => t.id !== txId));
    setReclassifyingId(null);
    loadData();
  };

  // Filter by owner
  const ownerAccountIds = useMemo(() => {
    if (ownerFilter === "all") return null;
    return new Set(accounts.filter((a) => a.owner === ownerFilter).map((a) => a.id));
  }, [ownerFilter, accounts]);
  const filteredTxs = useMemo(() => ownerAccountIds ? txs.filter((t) => ownerAccountIds.has(t.account_id)) : txs, [txs, ownerAccountIds]);
  const availableOwners = useMemo(() => [...new Set(accounts.map((a) => a.owner).filter((o): o is string => !!o))], [accounts]);

  const [viewMode, setViewMode] = useState<"depenses" | "revenus" | "transferts">("depenses");

  // Compute stats
  let income = 0, expense = 0, debt = 0, transfers = 0;
  const byParentExp: Record<string, number> = {};
  const bySubExp: Record<string, Record<string, number>> = {};
  const byParentInc: Record<string, number> = {};
  const bySubInc: Record<string, Record<string, number>> = {};
  const byParentTrf: Record<string, number> = {};
  const bySubTrf: Record<string, Record<string, number>> = {};
  const months = PERIODS[periodIdx].months;
  // Same rule as cashflow: vir-interne excluded for "Tous", included for per-person
  const includeVirInterne = ownerFilter !== "all";

  filteredTxs.forEach((t) => {
    const cat = cats.get(t.category_id);
    if (!cat) return;
    // Skip vir-interne when viewing "Tous"
    if (!includeVirInterne && t.category_id === "vir-interne") return;
    const abs = Math.abs(t.amount);
    if (cat.type === "income") {
      income += abs;
      const pId = cat.parent_id || cat.id;
      byParentInc[pId] = (byParentInc[pId] || 0) + abs;
      if (!bySubInc[pId]) bySubInc[pId] = {};
      bySubInc[pId][t.category_id] = (bySubInc[pId][t.category_id] || 0) + abs;
    } else if (cat.type === "dette") debt += abs;
    else if (cat.type === "transfer" && t.amount < 0) {
      transfers += abs;
      const pId = cat.parent_id || cat.id;
      byParentTrf[pId] = (byParentTrf[pId] || 0) + abs;
      if (!bySubTrf[pId]) bySubTrf[pId] = {};
      bySubTrf[pId][t.category_id] = (bySubTrf[pId][t.category_id] || 0) + abs;
    } else if (cat.type === "expense") {
      expense += abs;
      const pId = cat.parent_id || cat.id;
      byParentExp[pId] = (byParentExp[pId] || 0) + abs;
      if (!bySubExp[pId]) bySubExp[pId] = {};
      bySubExp[pId][t.category_id] = (bySubExp[pId][t.category_id] || 0) + abs;
    }
  });

  const net = income - expense - debt - transfers;
  const byParent = viewMode === "depenses" ? byParentExp : viewMode === "revenus" ? byParentInc : byParentTrf;
  const bySub = viewMode === "depenses" ? bySubExp : viewMode === "revenus" ? bySubInc : bySubTrf;
  const topParents = Object.entries(byParent)
    .sort((a, b) => b[1] - a[1])
    .map(([id, total]) => ({ cat: cats.get(id), total, subs: bySub[id] || {} }))
    .filter(({ cat }) => cat);

  const donutSegments = topParents.slice(0, 6).map(({ cat, total }) => ({
    value: total, color: CAT_COLORS[cat!.id] || "#AEAEB2", label: cat!.name,
  }));

  if (loading) return (
    <div style={{ padding: "28px 36px" }}>
      <div style={{ height: 32, width: 180, background: "rgba(0,0,0,0.06)", borderRadius: 8, marginBottom: 32 }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 1, background: "#F5F5F7", borderRadius: 14 }}>
        {[0, 1, 2].map((i) => <div key={i} style={{ height: 100, padding: 24 }}><div style={{ height: 40, width: 100, background: "rgba(0,0,0,0.06)", borderRadius: 6 }} /></div>)}
      </div>
    </div>
  );

  return (
    <div style={{ padding: "28px 36px", maxWidth: 1100 }}>
      {/* Top bar */}
      <div className="flex items-end justify-between mb-8">
        <div>
          <div style={{ fontSize: 12, color: "#86868B", marginBottom: 4 }}>
            {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </div>
          {/* D1 — Period title + nav arrows */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={() => setOffset((o) => o + 1)}
              title="Période précédente"
              style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: 18, color: "#86868B", padding: "0 4px", lineHeight: 1,
              }}
            >
              ◀
            </button>
            <h1 style={{ fontSize: 32, fontWeight: 600, color: "#1D1D1F", letterSpacing: "-0.5px", lineHeight: 1, margin: 0 }}>
              {range.label}
            </h1>
            <button
              onClick={() => setOffset((o) => Math.max(0, o - 1))}
              title="Période suivante"
              disabled={offset === 0}
              style={{
                background: "none", border: "none",
                cursor: offset === 0 ? "default" : "pointer",
                fontSize: 18,
                color: offset === 0 ? "#AEAEB2" : "#86868B",
                padding: "0 4px", lineHeight: 1,
              }}
            >
              ▶
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="pill-group">
            {PERIODS.map((p, i) => (
              <button key={p.label} onClick={() => handlePeriodChange(i)} className={`pill-item ${periodIdx === i ? "active" : ""}`}>{p.label}</button>
            ))}
          </div>
          {availableOwners.length > 1 && (
            <div className="pill-group">
              {["all", ...availableOwners].map((o) => (
                <button key={o} onClick={() => setOwnerFilter(o)} className={`pill-item ${ownerFilter === o ? "active" : ""}`}>
                  {OWNER_LABELS[o] || o}
                </button>
              ))}
            </div>
          )}
          <ChatButton />
        </div>
      </div>

      {/* Hero cards */}
      <div className="rounded-apple-lg mb-4" style={{ background: "#F5F5F7", display: "grid", gridTemplateColumns: "1fr 1px 1fr 1px 1fr" }}>
        {[
          { label: months > 1 ? "Revenus (total)" : "Revenus", value: income, color: "#34C759", sub: months > 1 ? `${months} mois · moy. ${fek(income / months)}/mois` : "Salaires + allocations" },
          { label: months > 1 ? "Dépensé (total)" : "Dépensé", value: expense, color: "#FF3B30", sub: months > 1 ? `moy. ${fek(expense / months)}/mois` : "Hors crédits" },
          { label: "Reste à vivre", value: net, color: net >= 0 ? "#34C759" : "#FF3B30", sub: months > 1
            ? `moy. ${fek(net / months)}/mois · crédits ${fe(debt)}${transfers > 0 ? ` · virements ${fe(transfers)}` : ""}`
            : `après crédits ${fe(debt)}${transfers > 0 ? ` + virements ${fe(transfers)}` : ""}` },
        ].map((item, i) => (
          <div key={item.label} style={{ display: "contents" }}>
            {i > 0 && <div style={{ background: "rgba(0,0,0,0.04)", width: 1 }} />}
            <div style={{ padding: "20px 24px" }}>
              <div style={{ fontSize: 12, fontWeight: 400, color: "#86868B", marginBottom: 8 }}>{item.label}</div>
              <div className="hero-amount" style={{ color: item.color, marginBottom: 6 }}>{fek(item.value)}</div>
              <div style={{ fontSize: 11, color: "#86868B" }}>{item.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 16 }}>
        {/* Category breakdown */}
        <div className="rounded-apple" style={{ background: "#F5F5F7", padding: "20px 24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }} className="mb-4">
            <div className="pill-group">
              <button onClick={() => setViewMode("depenses")} className={`pill-item ${viewMode === "depenses" ? "active" : ""}`}>Dépenses</button>
              <button onClick={() => setViewMode("revenus")} className={`pill-item ${viewMode === "revenus" ? "active" : ""}`}>Revenus</button>
              {transfers > 0 && (
                <button onClick={() => setViewMode("transferts")} className={`pill-item ${viewMode === "transferts" ? "active" : ""}`}>Transferts</button>
              )}
            </div>
            {viewMode === "depenses" && (
              <button
                onClick={fetchBudgetSuggestions}
                disabled={budgetAILoading}
                style={{ fontSize: 11, color: budgetAILoading ? "#AEAEB2" : "#AF52DE", background: "none", border: "none", cursor: budgetAILoading ? "default" : "pointer", fontWeight: 500 }}
              >
                {budgetAILoading ? "Calcul IA…" : "Budgets par IA"}
              </button>
            )}
          </div>

          {viewMode === "depenses" && budgetSuggestions.length > 0 && (
            <div style={{ marginBottom: 16, borderRadius: 10, border: "1px solid rgba(175,82,222,0.15)", background: "rgba(175,82,222,0.04)", overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid rgba(175,82,222,0.1)" }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: "#AF52DE" }}>Suggestions IA</span>
                <button onClick={applyAllSuggestions} style={{ fontSize: 11, color: "#AF52DE", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>
                  Appliquer tout
                </button>
              </div>
              {budgetSuggestions.map((s) => {
                const cat = cats.get(s.category_id);
                return (
                  <div key={s.category_id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 14px", borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 12, color: "#1D1D1F" }}>{cat?.name || s.category_id}</span>
                      <span style={{ fontSize: 10, color: "#86868B", marginLeft: 6 }}>{s.reasoning}</span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#AF52DE" }}>{s.suggested_budget} €</span>
                    <button onClick={() => applySuggestion(s.category_id, s.suggested_budget)} style={{ fontSize: 10, color: "#AF52DE", background: "none", border: "1px solid rgba(175,82,222,0.2)", borderRadius: 5, padding: "2px 8px", cursor: "pointer" }}>
                      OK
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {topParents.map(({ cat, total, subs }) => {
            // Parent budget = sum of children budgets
            const children = Array.from(cats.values()).filter(c => c.parent_id === cat!.id);
            const childBudgetSum = children.reduce((s, c) => s + (c.budget || 0), 0);
            const budget = childBudgetSum > 0 ? childBudgetSum * months : null;
            const pct = budget ? Math.min((total / budget) * 100, 120) : null;
            const color = CAT_COLORS[cat!.id] || "#AEAEB2";
            const overBudget = pct != null && pct > 100;
            return (
              <div key={cat!.id}>
                <button
                  onClick={() => openExplorer(cat!.id)}
                  className="cat-row w-full text-left"
                >
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 14, color: "#1D1D1F" }}>{cat!.name}</span>
                  <span style={{ fontSize: 10, color: "#AEAEB2" }}>›</span>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: 16, fontWeight: 500, color: viewMode === "depenses" && overBudget ? "#FF3B30" : "#1D1D1F" }}>{fe(total)}</span>
                    {viewMode === "depenses" && budget != null && <span style={{ fontSize: 11, color: overBudget ? "#FF3B30" : "#86868B", display: "block" }}>/{fe(budget)}</span>}
                  </div>
                </button>

                {viewMode === "depenses" && budget != null && (
                  <div style={{ height: 3, background: "rgba(0,0,0,0.04)", borderRadius: 2, margin: "0 0 4px 20px" }}>
                    <div style={{
                      height: 3, borderRadius: 2, width: `${Math.min(pct || 0, 100)}%`,
                      background: overBudget ? "#FF3B30" : (pct || 0) > 80 ? "#FF9500" : "#34C759",
                      transition: "width 400ms ease-out",
                    }} />
                  </div>
                )}

                {/* Subcategory details now shown in explorer slide-over */}
              </div>
            );
          })}
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Donut */}
          <div className="rounded-apple" style={{ background: "#F5F5F7", padding: "20px 24px" }}>
            <div className="section-label mb-4">Répartition</div>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <DonutChart segments={donutSegments} size={140} strokeWidth={10} centerLabel={fek(viewMode === "depenses" ? expense : viewMode === "revenus" ? income : transfers)} centerSub={viewMode === "depenses" ? "dépenses" : viewMode === "revenus" ? "revenus" : "transferts"} />
            </div>
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 6 }}>
              {donutSegments.map((seg, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: seg.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 11, color: "#86868B" }}>{seg.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "#1D1D1F" }}>{fe(seg.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Cashflow section */}
      <CashflowSection owner={ownerFilter} />

      {/* Task 3 — Category Explorer slide-over */}
      {explorerCatId && (() => {
        const eCat = cats.get(explorerCatId);
        const color = CAT_COLORS[explorerCatId] || "#AEAEB2";
        const eSubEntries = Object.entries(bySub[explorerCatId] || {}).sort((a, b) => b[1] - a[1]);
        const eTotal = byParent[explorerCatId] || 0;
        const histMax = Math.max(...explorerHistory.map(h => h.total), 1);
        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", justifyContent: "flex-end" }}>
            <div onClick={() => setExplorerCatId(null)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.3)", backdropFilter: "blur(2px)" }} />
            <div style={{ position: "relative", width: 440, maxWidth: "90vw", background: "#F5F5F7", overflowY: "auto", boxShadow: "-4px 0 24px rgba(0,0,0,0.12)" }}>
              <div style={{ padding: "20px 24px" }}>
                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                  <button onClick={() => setExplorerCatId(null)} style={{ background: "none", border: "none", fontSize: 18, color: "#86868B", cursor: "pointer", padding: 0 }}>✕</button>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: color }} />
                  <h2 style={{ fontSize: 20, fontWeight: 600, color: "#1D1D1F", margin: 0 }}>{eCat?.name || explorerCatId}</h2>
                  <span style={{ fontSize: 18, fontWeight: 600, color: "#1D1D1F", marginLeft: "auto" }}>{fe(eTotal)}</span>
                </div>

                {explorerLoading && <div style={{ padding: 20, textAlign: "center", color: "#86868B", fontSize: 13 }}>Chargement…</div>}

                {/* Subcategory breakdown */}
                {eSubEntries.length > 0 && (
                  <div style={{ marginBottom: 20, borderRadius: 12, background: "white", padding: "16px 18px", border: "1px solid rgba(0,0,0,0.06)" }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "#86868B", marginBottom: 12 }}>Sous-catégories</div>
                    {eSubEntries.map(([subId, subTotal]) => {
                      const sub = cats.get(subId);
                      const pct = eTotal > 0 ? (subTotal / eTotal) * 100 : 0;
                      return (
                        <div key={subId} style={{ marginBottom: 8 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                            <span style={{ fontSize: 12, color: "#1D1D1F" }}>{sub?.name || subId}</span>
                            <span style={{ fontSize: 12, fontWeight: 500, color: "#1D1D1F" }}>{fe(subTotal)} <span style={{ color: "#AEAEB2", fontWeight: 400 }}>{Math.round(pct)}%</span></span>
                          </div>
                          <div style={{ height: 4, background: "rgba(0,0,0,0.04)", borderRadius: 2 }}>
                            <div style={{ height: 4, borderRadius: 2, width: `${pct}%`, background: color, opacity: 0.7, transition: "width 300ms" }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 6-month evolution */}
                {explorerHistory.length > 0 && (
                  <div style={{ marginBottom: 20, borderRadius: 12, background: "white", padding: "16px 18px", border: "1px solid rgba(0,0,0,0.06)" }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "#86868B", marginBottom: 12 }}>Évolution 6 mois</div>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80 }}>
                      {explorerHistory.map((h, i) => (
                        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                          <span style={{ fontSize: 9, color: "#86868B" }}>{h.total > 0 ? fe(h.total) : ""}</span>
                          <div style={{
                            width: "100%", borderRadius: 3, background: color, opacity: 0.6,
                            height: `${Math.max((h.total / histMax) * 60, 2)}px`,
                            transition: "height 300ms",
                          }} />
                          <span style={{ fontSize: 9, color: "#AEAEB2" }}>{h.month}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* AI Insight */}
                {explorerInsight && explorerInsight.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    {explorerInsight.map((ins, i) => {
                      const insColor = ins.type === "alert" ? "#FF3B30" : ins.type === "warning" ? "#FF9500" : ins.type === "positive" ? "#34C759" : "#007AFF";
                      return (
                        <div key={i} style={{ borderRadius: 12, background: "white", padding: "12px 16px", border: `1px solid ${insColor}22`, marginBottom: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: insColor }}>{ins.title}</span>
                            {ins.metric && <span style={{ fontSize: 10, background: `${insColor}15`, color: insColor, padding: "1px 6px", borderRadius: 4 }}>{ins.metric}</span>}
                          </div>
                          <div style={{ fontSize: 12, color: "#86868B", lineHeight: 1.4 }} dangerouslySetInnerHTML={{ __html: ins.body }} />
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Transaction list — grouped by subcategory, sorted by date desc */}
                {explorerTxs.length > 0 && (() => {
                  // Build grouped category picker
                  const expenseParents = Array.from(cats.values()).filter(c => !c.parent_id && c.type === "expense");
                  const groupedCats = expenseParents.map(p => ({
                    parent: p,
                    children: Array.from(cats.values()).filter(c => c.parent_id === p.id),
                  }));

                  // Group transactions by subcategory
                  const txBySubcat: Record<string, Transaction[]> = {};
                  for (const t of explorerTxs) {
                    const key = t.category_id;
                    if (!txBySubcat[key]) txBySubcat[key] = [];
                    txBySubcat[key].push(t);
                  }
                  // Sort transactions within each group by date desc
                  for (const key of Object.keys(txBySubcat)) {
                    txBySubcat[key].sort((a, b) => b.date.localeCompare(a.date));
                  }
                  // Sort groups by total amount desc
                  const sortedGroups = Object.entries(txBySubcat)
                    .map(([catId, txList]) => ({
                      catId,
                      cat: cats.get(catId),
                      txList,
                      total: txList.reduce((s, t) => s + Math.abs(t.amount), 0),
                    }))
                    .sort((a, b) => b.total - a.total);

                  return (
                    <div style={{ borderRadius: 12, background: "white", padding: "16px 18px", border: "1px solid rgba(0,0,0,0.06)" }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: "#86868B", marginBottom: 12 }}>Transactions ({explorerTxs.length})</div>
                      {sortedGroups.map(({ catId, cat: grpCat, txList }) => (
                        <div key={catId} style={{ marginBottom: 12 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, padding: "4px 0" }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: "#86868B" }}>{grpCat?.icon || "📋"} {grpCat?.name || catId}</span>
                            <span style={{ fontSize: 10, color: "#AEAEB2" }}>({txList.length})</span>
                            <span style={{ fontSize: 11, fontWeight: 500, color: "#1D1D1F", marginLeft: "auto" }}>{fe(txList.reduce((s, t) => s + Math.abs(t.amount), 0))}</span>
                          </div>
                          {txList.map((t) => {
                            const txCat = cats.get(t.category_id);
                            const isOpen = reclassifyOpenId === t.id;
                            return (
                              <div key={t.id} style={{ position: "relative", padding: "6px 0 6px 12px", borderBottom: "1px solid rgba(0,0,0,0.03)" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 12, color: "#1D1D1F", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.label}</div>
                                    <div style={{ fontSize: 10, color: "#AEAEB2", marginTop: 1 }}>{t.date}</div>
                                  </div>
                                  <span style={{ fontSize: 13, fontWeight: 500, color: "#1D1D1F", flexShrink: 0 }}>{fe(Math.abs(t.amount))}</span>
                                  <button
                                    onClick={() => setReclassifyOpenId(isOpen ? null : t.id)}
                                    disabled={reclassifyingId === t.id}
                                    style={{
                                      fontSize: 10, padding: "2px 8px", borderRadius: 6,
                                      border: "1px solid rgba(0,0,0,0.08)", background: isOpen ? "#F5F5F7" : "white",
                                      color: "#86868B", cursor: "pointer", flexShrink: 0, maxWidth: 100,
                                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                                    }}
                                  >
                                    {reclassifyingId === t.id ? "…" : "Changer"}
                                  </button>
                                </div>
                                {isOpen && (
                                  <div style={{
                                    position: "absolute", right: 0, top: "100%", zIndex: 10,
                                    width: 260, maxHeight: 320, overflowY: "auto",
                                    background: "white", borderRadius: 10, boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
                                    border: "1px solid rgba(0,0,0,0.08)", padding: "6px 0",
                                  }}>
                                    {groupedCats.map(({ parent: gp, children: gc }) => (
                                      <div key={gp.id}>
                                        <div style={{ fontSize: 10, fontWeight: 600, color: "#86868B", textTransform: "uppercase", letterSpacing: "0.5px", padding: "8px 12px 4px" }}>
                                          {gp.icon} {gp.name}
                                        </div>
                                        {gc.map(c => (
                                          <button
                                            key={c.id}
                                            onClick={() => { setReclassifyOpenId(null); reclassifyTransaction(t.id, c.id); }}
                                            style={{
                                              display: "block", width: "100%", textAlign: "left",
                                              fontSize: 12, padding: "6px 12px 6px 24px", border: "none",
                                              background: c.id === t.category_id ? "rgba(0,122,255,0.08)" : "transparent",
                                              color: c.id === t.category_id ? "#007AFF" : "#1D1D1F",
                                              cursor: "pointer", fontWeight: c.id === t.category_id ? 500 : 400,
                                            }}
                                            onMouseEnter={e => { if (c.id !== t.category_id) (e.target as HTMLElement).style.background = "rgba(0,0,0,0.03)"; }}
                                            onMouseLeave={e => { if (c.id !== t.category_id) (e.target as HTMLElement).style.background = "transparent"; }}
                                          >
                                            {c.icon} {c.name}
                                          </button>
                                        ))}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
