"use client";
import { useState, useEffect, useCallback } from "react";
import AIPanel from "@/components/AIPanel";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, ReferenceLine } from "recharts";

const fe = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

const VIEWS = ["Barres", "Courbe", "Tableau", "Prévisionnel"];
const tooltipStyle = { background: "#1D1D1F", border: "none", borderRadius: 8, color: "white", fontSize: 12 };

type CashflowRow = { month: string; revenus: number; depenses: number; credits: number; solde: number };
type CumulRow = { month: string; solde: number };

export default function CashflowPage() {
  const [view, setView] = useState("Barres");
  const [withRent, setWithRent] = useState(false);
  const [data, setData] = useState<CashflowRow[]>([]);
  const [cumulData, setCumulData] = useState<CumulRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiContent, setAiContent] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

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
    } catch (err) {
      console.error("Cashflow: load error", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const refreshAI = async () => {
    setAiLoading(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "projections" }),
      });
      const d = await res.json();
      setAiContent(res.ok ? (d.content || "Aucun contenu") : (d.message || d.error || "Erreur API"));
    } catch {
      setAiContent("Erreur de connexion");
    }
    setAiLoading(false);
  };

  const displayData = withRent
    ? data.map((d) => ({ ...d, revenus: d.revenus + 1300, solde: d.solde + 1300 }))
    : data;

  const displayCumul = withRent
    ? (() => {
        let cumul = 0;
        return cumulData.map((d, i) => { cumul += (data[i]?.solde ?? 0) + 1300; return { ...d, solde: cumul }; });
      })()
    : cumulData;

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
          {withRent && <span style={{ fontSize: 11, fontWeight: 500, color: "#34C759" }}>+1 300 \u20AC</span>}
        </label>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div className="pill-group">
          {VIEWS.map((v) => (
            <button key={v} onClick={() => setView(v)} className={`pill-item ${view === v ? "active" : ""}`}>{v}</button>
          ))}
        </div>
      </div>

      {/* AI Panel */}
      <div className="mb-5">
        <AIPanel
          title="Analyser mon cash-flow"
          content={aiContent || "<p>Chargement de l'analyse cash-flow…</p>"}
          timestamp="données en temps réel"
          onRefresh={refreshAI}
          refreshLoading={aiLoading}
        />
      </div>

      {loading ? (
        <div className="rounded-apple" style={{ background: "#F5F5F7", height: 300, display: "flex", alignItems: "center", justifyContent: "center", color: "#AEAEB2", fontSize: 13 }}>
          Chargement\u2026
        </div>
      ) : (
        <div className="rounded-apple" style={{ background: "#F5F5F7", padding: "20px 24px" }}>
          {view === "Barres" && (
            <>
              <div className="section-label mb-4">Revenus / Dépenses / Crédits par mois</div>
              <div style={{ overflowX: "auto" }}>
                <div style={{ minWidth: 600 }}>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={displayData} margin={{ top: 5, right: 5, left: 0, bottom: 20 }} barGap={2}>
                      <CartesianGrid strokeDasharray="0" stroke="rgba(0,0,0,0.04)" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#86868B" }} angle={-45} textAnchor="end" axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: "#86868B" }} tickFormatter={(v) => `${v / 1000}k`} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v) => fe(v as number)} />
                      <Bar dataKey="revenus" name="Revenus" fill="#34C759" radius={[4, 4, 0, 0]} maxBarSize={24} />
                      <Bar dataKey="depenses" name="Dépenses" fill="#FF3B30" radius={[4, 4, 0, 0]} maxBarSize={24} />
                      <Bar dataKey="credits" name="Crédits" fill="#FF9500" radius={[4, 4, 0, 0]} maxBarSize={24} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}

          {view === "Courbe" && (
            <>
              <div className="section-label mb-4">Solde cumulé disponible</div>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={displayCumul} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="0" stroke="rgba(0,0,0,0.04)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#86868B" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#86868B" }} tickFormatter={(v) => `${v / 1000}k`} axisLine={false} tickLine={false} />
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
                    {["Mois", "Revenus", "Dépenses", "Crédits", "Solde"].map((h) => (
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
                      <td style={{ padding: "10px 0", fontSize: 13, fontWeight: 500, color: row.solde >= 0 ? "#34C759" : "#FF3B30", textAlign: "right" }}>{fe(row.solde)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {view === "Prévisionnel" && (
            <>
              <div className="section-label mb-1">Projection à 6 mois</div>
              <div style={{ fontSize: 11, color: "#AEAEB2", marginBottom: 16 }}>Basé sur les moyennes des mois précédents</div>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={displayCumul} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="0" stroke="rgba(0,0,0,0.04)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#86868B" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#86868B" }} tickFormatter={(v) => `${v / 1000}k`} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => fe(v as number)} />
                  <Area type="monotone" dataKey="solde" stroke="#007AFF" fill="rgba(0,0,0,0.04)" strokeWidth={2} strokeDasharray="5 4" name="Projection" />
                </AreaChart>
              </ResponsiveContainer>
            </>
          )}
        </div>
      )}

    </div>
  );
}
