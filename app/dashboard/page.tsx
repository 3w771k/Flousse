"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import InsightsBanner from "@/components/InsightsBanner";
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
    from: fromDate.toISOString().slice(0, 10),
    to: toDate.toISOString().slice(0, 10),
    label,
  };
}

export default function DashboardPage() {
  const [periodIdx, setPeriodIdx] = useState(0);
  const [offset, setOffset] = useState(0);
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [cats, setCats] = useState<Map<string, Category>>(new Map());
  const [loading, setLoading] = useState(true);

  const range = useMemo(() => getDateRange(PERIODS[periodIdx].months, offset), [periodIdx, offset]);

  // Reset offset when period type changes
  const handlePeriodChange = (idx: number) => {
    setPeriodIdx(idx);
    setOffset(0);
  };

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
  }, [loadData]);

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
        </div>
      </div>

      {/* Hero cards */}
      <div className="rounded-apple-lg mb-4" style={{ background: "#F5F5F7", display: "grid", gridTemplateColumns: "1fr 1px 1fr 1px 1fr" }}>
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

      {/* D4 — InsightsBanner between hero cards and categories */}
      <InsightsBanner tab="dashboard" from={range.from} to={range.to} />

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
