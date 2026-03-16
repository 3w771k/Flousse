"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import AIPanel from "@/components/AIPanel";
import DonutChart from "@/components/DonutChart";

const fe = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
const fek = (n: number) =>
  Math.abs(n) >= 1000
    ? new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(n / 1000) + " k\u20AC"
    : fe(n);

const PERIODS: { label: string; months: number }[] = [
  { label: "Mois", months: 1 },
  { label: "Trim.", months: 3 },
  { label: "Sem.", months: 6 },
  { label: "Année", months: 12 },
];

const CAT_COLORS: Record<string, string> = {
  alimentation: "#34C759", enfants: "#FF9500", "bien-etre": "#5AC8FA",
  transports: "#AF52DE", voyages: "#007AFF", "shopping-loisirs": "#5856D6",
  "abonnements-telecom": "#86868B", logement: "#FF9500", "finances-admin": "#AEAEB2", divers: "#AEAEB2",
};

type Transaction = {
  id: string; account_id: string; date: string; label: string;
  amount: number; category_id: string; confidence: number; source: string;
};
type Category = { id: string; name: string; type: string; parent_id: string | null; budget: number | null };

function getDateRange(months: number): { from: string; to: string; label: string } {
  const now = new Date();
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0); // end of current month
  const from = new Date(now.getFullYear(), now.getMonth() - months + 1, 1); // start of range
  const toStr = to.toISOString().slice(0, 10);
  const fromStr = from.toISOString().slice(0, 10);

  if (months === 1) {
    return { from: fromStr, to: toStr, label: now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) };
  }
  const fromLabel = from.toLocaleDateString("fr-FR", { month: "short", year: "numeric" });
  const toLabel = now.toLocaleDateString("fr-FR", { month: "short", year: "numeric" });
  return { from: fromStr, to: toStr, label: `${fromLabel} — ${toLabel}` };
}

export default function DashboardPage() {
  const [periodIdx, setPeriodIdx] = useState(0);
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [cats, setCats] = useState<Map<string, Category>>(new Map());
  const [loading, setLoading] = useState(true);
  const [aiContent, setAiContent] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiDate, setAiDate] = useState<string | null>(null);
  const [cacheChecked, setCacheChecked] = useState(false);
  const autoTriggeredRef = useRef<string | null>(null);

  const range = useMemo(() => getDateRange(PERIODS[periodIdx].months), [periodIdx]);

  // Load cached analysis when period changes
  const loadCachedAnalysis = useCallback(async (from: string, to: string) => {
    setCacheChecked(false);
    try {
      const res = await fetch(`/api/analyze?tab=dashboard&from=${from}&to=${to}`);
      if (res.ok) {
        const data = await res.json();
        if (data.cached && data.content) {
          setAiContent(data.content);
          setAiDate(data.created_at);
        }
      }
    } catch { /* silent */ }
    setCacheChecked(true);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [txRes, catRes] = await Promise.all([
        fetch(`/api/transactions?from=${range.from}&to=${range.to}`),
        fetch("/api/categories"),
      ]);
      if (!txRes.ok || !catRes.ok) {
        console.error("Dashboard: API error", txRes.status, catRes.status);
        setLoading(false);
        return;
      }
      const [txData, catData]: [Transaction[], Category[]] = await Promise.all([txRes.json(), catRes.json()]);
      setTxs(txData);
      setCats(new Map(catData.map((c) => [c.id, c])));
    } catch (err) {
      console.error("Dashboard: load error", err);
    }
    setLoading(false);
  }, [range]);

  useEffect(() => {
    loadData();
    setAiContent(null);
    setAiDate(null);
    setCacheChecked(false);
    loadCachedAnalysis(range.from, range.to);
  }, [loadData, loadCachedAnalysis, range]);

  const refreshAI = useCallback(async (force = false) => {
    setAiLoading(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tab: "dashboard", from: range.from, to: range.to, force }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAiContent(`<p>${data.message || data.error || "Erreur API"}</p>`);
        setAiDate(null);
      } else {
        setAiContent(data.content || "<p>Aucun contenu généré.</p>");
        setAiDate(data.created_at || null);
      }
    } catch {
      setAiContent("<p>Erreur de connexion à l'API.</p>");
    }
    setAiLoading(false);
  }, [range]);

  // Auto-trigger analysis when no cached analysis exists and transactions are available
  const rangeKey = `${range.from}_${range.to}`;
  useEffect(() => {
    if (!loading && cacheChecked && !aiContent && !aiLoading && txs.length > 0 && autoTriggeredRef.current !== rangeKey) {
      autoTriggeredRef.current = rangeKey;
      refreshAI(false);
    }
  }, [loading, cacheChecked, aiContent, aiLoading, txs.length, rangeKey, refreshAI]);

  // Compute stats
  let income = 0, expense = 0, debt = 0;
  const byParent: Record<string, number> = {};
  const bySub: Record<string, Record<string, number>> = {};
  const months = PERIODS[periodIdx].months;

  txs.forEach((t) => {
    const cat = cats.get(t.category_id);
    if (!cat) return;
    const abs = Math.abs(t.amount);
    if (cat.type === "income") income += abs;
    else if (cat.type === "dette") debt += abs;
    else if (cat.type === "expense") {
      expense += abs;
      const pId = cat.parent_id || cat.id;
      byParent[pId] = (byParent[pId] || 0) + abs;
      if (!bySub[pId]) bySub[pId] = {};
      bySub[pId][t.category_id] = (bySub[pId][t.category_id] || 0) + abs;
    }
  });

  const net = income - expense - debt;
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
          <h1 style={{ fontSize: 32, fontWeight: 600, color: "#1D1D1F", letterSpacing: "-0.5px", lineHeight: 1 }}>
            {range.label}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="pill-group">
            {PERIODS.map((p, i) => (
              <button key={p.label} onClick={() => setPeriodIdx(i)} className={`pill-item ${periodIdx === i ? "active" : ""}`}>{p.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Hero cards */}
      <div className="rounded-apple-lg mb-6" style={{ background: "#F5F5F7", display: "grid", gridTemplateColumns: "1fr 1px 1fr 1px 1fr" }}>
        {[
          { label: months > 1 ? "Revenus (total)" : "Revenus", value: income, color: "#34C759", sub: months > 1 ? `${months} mois · moy. ${fek(income / months)}/mois` : "Salaires + allocations" },
          { label: months > 1 ? "Dépensé (total)" : "Dépensé", value: expense, color: "#FF3B30", sub: months > 1 ? `moy. ${fek(expense / months)}/mois` : "Hors crédits" },
          { label: "Reste à vivre", value: net, color: net >= 0 ? "#34C759" : "#FF3B30", sub: months > 1 ? `moy. ${fek(net / months)}/mois · crédits ${fe(debt)}` : `après crédits ${fe(debt)}` },
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

      {/* AI Panel */}
      <div className="mb-6">
        <AIPanel
          title="Analyse IA — Dashboard"
          content={aiContent || (aiLoading ? `<p style="color:#AEAEB2">Analyse en cours de génération\u2026</p>` : `<p style="color:#AEAEB2">Cliquez sur "Générer" pour lancer une analyse complète de la période.</p>`)}
          timestamp={aiDate ? new Date(aiDate + "Z").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
          onRefresh={() => refreshAI(false)}
          onForceRefresh={() => refreshAI(true)}
          refreshLoading={aiLoading}
          hasCachedAnalysis={!!aiDate}
        />
      </div>

      {/* Main grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 16 }}>
        {/* Category breakdown */}
        <div className="rounded-apple" style={{ background: "#F5F5F7", padding: "20px 24px" }}>
          <div className="section-label mb-4">Dépenses par catégorie</div>
          {topParents.map(({ cat, total, subs }) => {
            const budget = cat!.budget ? cat!.budget * months : null;
            const pct = budget ? Math.min((total / budget) * 100, 120) : null;
            const color = CAT_COLORS[cat!.id] || "#AEAEB2";
            const overBudget = pct != null && pct > 100;
            const isExpanded = expandedCat === cat!.id;
            const subEntries = Object.entries(subs).sort((a, b) => b[1] - a[1]);

            return (
              <div key={cat!.id}>
                <button
                  onClick={() => setExpandedCat(isExpanded ? null : cat!.id)}
                  className="cat-row w-full text-left"
                >
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 14, color: "#1D1D1F" }}>{cat!.name}</span>
                  {subEntries.length > 0 && (
                    <span style={{ fontSize: 10, color: "#AEAEB2" }}>{isExpanded ? "\u25B2" : "\u25BC"}</span>
                  )}
                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: 16, fontWeight: 500, color: overBudget ? "#FF3B30" : "#1D1D1F" }}>{fe(total)}</span>
                    {budget != null && <span style={{ fontSize: 11, color: overBudget ? "#FF3B30" : "#86868B", display: "block" }}>/{fe(budget)}</span>}
                  </div>
                </button>

                {budget != null && (
                  <div style={{ height: 3, background: "rgba(0,0,0,0.04)", borderRadius: 2, margin: "0 0 4px 20px" }}>
                    <div style={{
                      height: 3, borderRadius: 2, width: `${Math.min(pct || 0, 100)}%`,
                      background: overBudget ? "#FF3B30" : (pct || 0) > 80 ? "#FF9500" : "#34C759",
                      transition: "width 400ms ease-out",
                    }} />
                  </div>
                )}

                {isExpanded && subEntries.map(([subId, subTotal]) => {
                  const sub = cats.get(subId);
                  if (!sub) return null;
                  return (
                    <div key={subId} style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0 6px 20px", borderBottom: "1px solid rgba(0,0,0,0.03)" }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: color, opacity: 0.5, flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 12, color: "#86868B" }}>{sub.name}</span>
                      <span style={{ fontSize: 13, fontWeight: 500, color: "#1D1D1F" }}>{fe(subTotal)}</span>
                      <span style={{ fontSize: 11, color: "#AEAEB2", minWidth: 32, textAlign: "right" }}>
                        {Math.round((subTotal / total) * 100)} %
                      </span>
                    </div>
                  );
                })}
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
              <DonutChart segments={donutSegments} size={140} strokeWidth={10} centerLabel={fek(expense)} centerSub="dépenses" />
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
    </div>
  );
}
