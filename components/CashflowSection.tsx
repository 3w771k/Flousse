"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
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

export default function CashflowSection() {
  const [view, setView] = useState("Barres");
  const [simplified, setSimplified] = useState(true);
  const [data, setData] = useState<CashflowRow[]>([]);
  const [cumulData, setCumulData] = useState<CumulRow[]>([]);
  const [projection, setProjection] = useState<CashflowRow[]>([]);
  const [projectionCumul, setProjectionCumul] = useState<CumulRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/cashflow?months=12");
      if (!res.ok) { setLoading(false); return; }
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

  const previsionData = useMemo(() => {
    const hist = cumulData.map((d) => ({ ...d, historique: d.solde, projection: null as number | null }));
    const bridge = hist.length > 0 ? [{ ...hist[hist.length - 1], projection: hist[hist.length - 1].historique }] : [];
    const proj = projectionCumul.map((d) => ({ ...d, historique: null as number | null, projection: d.solde }));
    return [...hist, ...bridge, ...proj];
  }, [cumulData, projectionCumul]);

  return (
    <div className="rounded-apple" style={{ background: "#F5F5F7", padding: "20px 24px", marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div className="section-label">Cash-flow</div>
        <div className="pill-group" style={{ marginLeft: "auto" }}>
          {VIEWS.map((v) => (
            <button key={v} onClick={() => setView(v)} className={`pill-item ${view === v ? "active" : ""}`}>{v}</button>
          ))}
        </div>
        {view === "Barres" && (
          <div className="pill-group">
            <button onClick={() => setSimplified(true)} className={`pill-item ${simplified ? "active" : ""}`}>Simplifiée</button>
            <button onClick={() => setSimplified(false)} className={`pill-item ${!simplified ? "active" : ""}`}>Détaillée</button>
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ height: 260, display: "flex", alignItems: "center", justifyContent: "center", color: "#AEAEB2", fontSize: 13 }}>
          Chargement…
        </div>
      ) : (
        <>
          {view === "Barres" && (
            <>
              <div style={{ fontSize: 11, color: "#AEAEB2", marginBottom: 12 }}>
                {simplified ? "Sorties = dépenses + crédits + transferts sortants" : "Détail revenus / dépenses / crédits / transferts"}
              </div>
              <div style={{ overflowX: "auto" }}>
                <div style={{ minWidth: 600 }}>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 20 }} barGap={2}>
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
              <div style={{ fontSize: 11, color: "#AEAEB2", marginBottom: 12 }}>Solde cumulé</div>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={cumulData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
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
              <div style={{ fontSize: 11, color: "#AEAEB2", marginBottom: 12 }}>Détail mensuel</div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Mois", "Revenus", "Dépenses", "Crédits", "Transferts", "Sorties", "Solde"].map((h) => (
                      <th key={h} style={{ textAlign: h === "Mois" ? "left" : "right", padding: "8px 0", fontSize: 11, fontWeight: 500, color: "#86868B", textTransform: "uppercase", letterSpacing: "0.4px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, i) => (
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

          {view === "Prévisionnel" && (
            <>
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
                  <Area type="monotone" dataKey="historique" stroke="#007AFF" fill="rgba(0,122,255,0.06)" strokeWidth={2} name="Historique" connectNulls={false} dot={false} />
                  <Line type="monotone" dataKey="projection" stroke="#FF9500" strokeWidth={2} strokeDasharray="6 4" name="Projection" connectNulls={false} dot={{ fill: "#FF9500", r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
              {projection.length > 0 && (
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
                      {projection.map((row, i) => (
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
        </>
      )}
    </div>
  );
}
