"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import InsightsBanner from "@/components/InsightsBanner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, ReferenceLine, ComposedChart, Line,
} from "recharts";

const fe = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

const VIEWS = ["Barres", "Courbe", "Tableau", "Prévisionnel"];
const tooltipStyle = { background: "#1D1D1F", border: "none", borderRadius: 8, color: "white", fontSize: 12 };

type CashflowRow = {
  month: string; raw_month: string;
  revenus: number; depenses: number; credits: number; transferts: number;
  sorties: number; solde: number;
};
type CumulRow = { month: string; raw_month: string; solde: number };

export default function CashflowPage() {
  const [view, setView] = useState("Barres");
  const [withRent, setWithRent] = useState(false);
  const [simplified, setSimplified] = useState(true); // C1: simplified = revenus vs sorties
  const [data, setData] = useState<CashflowRow[]>([]);
  const [cumulData, setCumulData] = useState<CumulRow[]>([]);
  const [projection, setProjection] = useState<CashflowRow[]>([]);
  const [projectionCumul, setProjectionCumul] = useState<CumulRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/cashflow?months=12");
      if (!res.ok) {
        console.error("Cashflow: API error", res.status);
        setLoading(false);
        return;
      }
      const json = await res.json();
      setData(json.data || []);
      setCumulData(json.cumul || []);
      setProjection(json.projection || []);
      setProjectionCumul(json.projectionCumul || []);
    } catch (err) {
      console.error("Cashflow: load error", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // InsightsBanner period: last 12 months
  const { insightsFrom, insightsTo } = useMemo(() => {
    const now = new Date();
    const to = now.toISOString().slice(0, 10);
    const from = new Date(now.getFullYear() - 1, now.getMonth(), 1).toISOString().slice(0, 10);
    return { insightsFrom: from, insightsTo: to };
  }, []);

  // Apply loyers toggle to historical data
  const displayData = withRent
    ? data.map((d) => ({
        ...d,
        revenus: d.revenus + 1300,
        solde: d.solde + 1300,
        sorties: d.sorties, // sorties unchanged
      }))
    : data;

  // Apply loyers to cumul
  const displayCumul = useMemo(() => {
    if (!withRent) return cumulData;
    let cumul = 0;
    return data.map((d, i) => {
      cumul += d.solde + 1300;
      return { ...cumulData[i], solde: cumul };
    });
  }, [withRent, data, cumulData]);

  // C2: Apply loyers to projection
  const displayProjection = withRent
    ? projection.map((p) => ({ ...p, revenus: p.revenus + 1300, solde: p.solde + 1300 }))
    : projection;

  const displayProjectionCumul = useMemo(() => {
    if (!withRent) return projectionCumul;
    const baseCumul = displayCumul[displayCumul.length - 1]?.solde || 0;
    let cumul = baseCumul;
    return projection.map((p) => {
      cumul += p.solde + 1300;
      return { month: p.month, raw_month: p.raw_month, solde: cumul };
    });
  }, [withRent, projection, displayCumul]);

  // C2: Combined data for projection chart (historical solid + projected dashed)
  const previsionData = useMemo(() => {
    const hist = displayCumul.map((d) => ({ ...d, historique: d.solde, projection: null as number | null }));
    // Bridge: last historical point + projection
    const bridge = hist.length > 0 ? [{ ...hist[hist.length - 1], projection: hist[hist.length - 1].historique }] : [];
    const proj = displayProjectionCumul.map((d) => ({ ...d, historique: null as number | null, projection: d.solde }));
    return [...hist, ...proj];
  }, [displayCumul, displayProjectionCumul]);

  return (
    <div style={{ padding: "28px 36px", maxWidth: 1100 }}>
      <div className="flex items-end justify-between mb-8">
        <div>
          <div style={{ fontSize: 12, color: "#86868B", marginBottom: 4 }}>
            {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 600, color: "#1D1D1F", letterSpacing: "-0.5px", lineHeight: 1 }}>Cash-flow</h1>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <span style={{ fontSize: 12, color: "#86868B" }}>Avec loyers</span>
          <div
            onClick={() => setWithRent(!withRent)}
            style={{ width: 36, height: 20, borderRadius: 10, background: withRent ? "#34C759" : "rgba(0,0,0,0.12)", position: "relative", cursor: "pointer", transition: "background 150ms ease" }}
          >
            <div style={{ position: "absolute", width: 16, height: 16, borderRadius: "50%", background: "white", top: 2, left: withRent ? 18 : 2, transition: "left 150ms ease", boxShadow: "0 1px 2px rgba(0,0,0,0.2)" }} />
          </div>
          {withRent && <span style={{ fontSize: 11, fontWeight: 500, color: "#34C759" }}>+1 300 €</span>}
        </label>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div className="pill-group">
          {VIEWS.map((v) => (
            <button key={v} onClick={() => setView(v)} className={`pill-item ${view === v ? "active" : ""}`}>{v}</button>
          ))}
        </div>
        {view === "Barres" && (
          <div className="pill-group" style={{ marginLeft: 8 }}>
            <button onClick={() => setSimplified(true)} className={`pill-item ${simplified ? "active" : ""}`}>Simplifiée</button>
            <button onClick={() => setSimplified(false)} className={`pill-item ${!simplified ? "active" : ""}`}>Détaillée</button>
          </div>
        )}
      </div>

      {/* InsightsBanner between pills and chart */}
      <InsightsBanner tab="cashflow" from={insightsFrom} to={insightsTo} />

      {loading ? (
        <div className="rounded-apple" style={{ background: "#F5F5F7", height: 300, display: "flex", alignItems: "center", justifyContent: "center", color: "#AEAEB2", fontSize: 13 }}>
          Chargement…
        </div>
      ) : (
        <div className="rounded-apple" style={{ background: "#F5F5F7", padding: "20px 24px" }}>
          {view === "Barres" && (
            <>
              <div className="section-label mb-1">
                {simplified ? "Revenus vs Sorties totales" : "Détail revenus / dépenses / crédits / transferts"}
              </div>
              {simplified && (
                <div style={{ fontSize: 11, color: "#AEAEB2", marginBottom: 12 }}>
                  Sorties = dépenses + crédits + transferts sortants
                </div>
              )}
              <div style={{ overflowX: "auto" }}>
                <div style={{ minWidth: 600 }}>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={displayData} margin={{ top: 5, right: 5, left: 0, bottom: 20 }} barGap={2}>
                      <CartesianGrid strokeDasharray="0" stroke="rgba(0,0,0,0.04)" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#86868B" }} angle={-45} textAnchor="end" axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: "#86868B" }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v) => fe(v as number)} />
                      <Bar dataKey="revenus" name="Revenus" fill="#34C759" radius={[4, 4, 0, 0]} maxBarSize={28} />
                      {simplified ? (
                        <Bar dataKey="sorties" name="Sorties totales" fill="#FF3B30" radius={[4, 4, 0, 0]} maxBarSize={28} />
                      ) : (
                        <>
                          <Bar dataKey="depenses" name="Dépenses" fill="#FF3B30" radius={[4, 4, 0, 0]} maxBarSize={20} />
                          <Bar dataKey="credits" name="Crédits" fill="#FF9500" radius={[4, 4, 0, 0]} maxBarSize={20} />
                          <Bar dataKey="transferts" name="Transferts" fill="#AF52DE" radius={[4, 4, 0, 0]} maxBarSize={20} />
                        </>
                      )}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}

          {view === "Courbe" && (
            <>
              <div className="section-label mb-4">Solde cumulé</div>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={displayCumul} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="0" stroke="rgba(0,0,0,0.04)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#86868B" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#86868B" }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => fe(v as number)} />
                  <ReferenceLine y={0} stroke="#FF3B30" strokeDasharray="4 4" strokeWidth={1} />
                  <Area type="monotone" dataKey="solde" stroke="#007AFF" fill="rgba(0,122,255,0.06)" strokeWidth={2} name="Solde cumulé" />
                </AreaChart>
              </ResponsiveContainer>
            </>
          )}

          {view === "Tableau" && (
            <>
              <div className="section-label mb-4">Détail mensuel</div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Mois", "Revenus", "Dépenses", "Crédits", "Transferts", "Sorties", "Solde"].map((h) => (
                      <th key={h} style={{ textAlign: h === "Mois" ? "left" : "right", padding: "8px 0", fontSize: 11, fontWeight: 500, color: "#86868B", textTransform: "uppercase", letterSpacing: "0.4px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayData.map((row, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                      <td style={{ padding: "10px 0", fontSize: 13, color: "#1D1D1F", fontWeight: 500 }}>{row.month}</td>
                      <td style={{ padding: "10px 0", fontSize: 13, color: "#34C759", textAlign: "right" }}>{fe(row.revenus)}</td>
                      <td style={{ padding: "10px 0", fontSize: 13, color: "#FF3B30", textAlign: "right" }}>{fe(row.depenses)}</td>
                      <td style={{ padding: "10px 0", fontSize: 13, color: "#FF9500", textAlign: "right" }}>{fe(row.credits)}</td>
                      <td style={{ padding: "10px 0", fontSize: 13, color: "#AF52DE", textAlign: "right" }}>{fe(row.transferts)}</td>
                      <td style={{ padding: "10px 0", fontSize: 13, color: "#FF3B30", textAlign: "right", fontWeight: 500 }}>{fe(row.sorties)}</td>
                      <td style={{ padding: "10px 0", fontSize: 13, fontWeight: 500, color: row.solde >= 0 ? "#34C759" : "#FF3B30", textAlign: "right" }}>{fe(row.solde)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {/* C2 — Proper projection starting after last real data month */}
          {view === "Prévisionnel" && (
            <>
              <div className="section-label mb-1">Projection à 6 mois</div>
              <div style={{ fontSize: 11, color: "#AEAEB2", marginBottom: 16 }}>
                Historique (trait plein) + projection basée sur la moyenne des 3 derniers mois (pointillés)
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={previsionData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="0" stroke="rgba(0,0,0,0.04)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#86868B" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#86868B" }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => v != null ? fe(Number(v)) : "-"} />
                  <ReferenceLine y={0} stroke="#FF3B30" strokeDasharray="4 4" strokeWidth={1} />
                  {/* Historical — solid blue */}
                  <Area
                    type="monotone"
                    dataKey="historique"
                    stroke="#007AFF"
                    fill="rgba(0,122,255,0.06)"
                    strokeWidth={2}
                    name="Historique"
                    connectNulls={false}
                    dot={false}
                  />
                  {/* Projection — dashed green/orange */}
                  <Line
                    type="monotone"
                    dataKey="projection"
                    stroke={withRent ? "#34C759" : "#FF9500"}
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    name={withRent ? "Projection (avec loyers)" : "Projection (sans loyers)"}
                    connectNulls={false}
                    dot={{ fill: withRent ? "#34C759" : "#FF9500", r: 3 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
              {/* Projection summary table */}
              {displayProjection.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: "#86868B", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.4px" }}>
                    Détail prévisionnel
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        {["Mois", "Revenus estimés", "Sorties estimées", "Solde mensuel"].map((h) => (
                          <th key={h} style={{ textAlign: h === "Mois" ? "left" : "right", padding: "6px 0", fontSize: 10, fontWeight: 500, color: "#AEAEB2", textTransform: "uppercase", letterSpacing: "0.4px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {displayProjection.map((row, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid rgba(0,0,0,0.03)", opacity: 0.85 }}>
                          <td style={{ padding: "8px 0", fontSize: 12, color: "#86868B", fontStyle: "italic" }}>{row.month} ›</td>
                          <td style={{ padding: "8px 0", fontSize: 12, color: "#34C759", textAlign: "right" }}>{fe(row.revenus)}</td>
                          <td style={{ padding: "8px 0", fontSize: 12, color: "#FF3B30", textAlign: "right" }}>{fe(row.sorties)}</td>
                          <td style={{ padding: "8px 0", fontSize: 12, fontWeight: 500, color: row.solde >= 0 ? "#34C759" : "#FF3B30", textAlign: "right" }}>{fe(row.solde)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
