"use client";
import { useState, useEffect, useCallback } from "react";
import AIPanel from "@/components/AIPanel";

const fe = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);
const fd = (d: string) => { const [y, m, dd] = d.split("-"); return `${dd}/${m}/${y}`; };

const CAT_COLORS: Record<string, string> = {
  alimentation: "#34C759", courses: "#34C759", resto: "#34C759", livraison: "#34C759",
  enfants: "#FF9500", garde: "#FF9500", "enfants-activites": "#FF9500", "enfants-shopping": "#FF9500",
  "bien-etre": "#5AC8FA", sante: "#5AC8FA", coiffeur: "#5AC8FA", sport: "#5AC8FA",
  transports: "#AF52DE", "transport-commun": "#AF52DE", taxi: "#AF52DE", voiture: "#AF52DE",
  voyages: "#007AFF", "shopping-loisirs": "#5856D6", shopping: "#5856D6", loisirs: "#5856D6",
  "abonnements-telecom": "#86868B", telecom: "#86868B", abonnements: "#86868B",
  logement: "#FF9500", copro: "#FF9500", securite: "#FF9500", assurance: "#FF9500",
  "finances-admin": "#AEAEB2", salaire: "#34C759", loyers: "#34C759", allocations: "#34C759",
  "credit-immo": "#FF3B30", "pret-perso": "#FF3B30", "amex-prlv": "#FF3B30",
  divers: "#FF9500",
};

type Transaction = {
  id: string; account_id: string; date: string; real_date?: string | null; label: string;
  amount: number; category_id: string; confidence: number;
};
type Category = { id: string; name: string; type: string; parent_id: string | null };
type Account = { id: string; name: string; bank: string };

function CategoryDot({ id }: { id: string }) {
  const color = CAT_COLORS[id] || "#AEAEB2";
  return <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />;
}

function GroupedDropdown({
  cats, parents, onSelect,
}: {
  cats: Map<string, Category>;
  parents: Category[];
  onSelect: (id: string) => void;
}) {
  const childrenOf = (pid: string) => Array.from(cats.values()).filter((c) => c.parent_id === pid);
  return (
    <div style={{ position: "absolute", right: 0, top: 28, zIndex: 30, background: "white", borderRadius: 12, boxShadow: "0 4px 24px rgba(0,0,0,0.12)", minWidth: 220, maxHeight: 360, overflowY: "auto", border: "1px solid rgba(0,0,0,0.06)" }}>
      {parents.map((parent) => {
        const children = childrenOf(parent.id);
        return (
          <div key={parent.id}>
            <div style={{ padding: "8px 14px 4px", fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.5px", color: "#AEAEB2", background: "#FBFBFD", position: "sticky", top: 0 }}>
              {parent.name}
            </div>
            {(children.length > 0 ? children : [parent]).map((item) => (
              <button
                key={item.id}
                onClick={() => onSelect(item.id)}
                style={{ width: "100%", textAlign: "left", padding: "7px 14px 7px 20px", fontSize: 13, color: "#1D1D1F", display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.03)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              >
                <CategoryDot id={item.id} />
                {item.name}
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function formatMonthLabel(month: string): string {
  const [y, m] = month.split("-");
  const d = new Date(parseInt(y), parseInt(m) - 1);
  return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta);
  return d.toISOString().slice(0, 7);
}

export default function TransactionsPage() {
  const [search, setSearch] = useState("");
  const [accountFilter, setAccountFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedMonth, setSelectedMonth] = useState<string | null>(new Date().toISOString().slice(0, 7));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [cats, setCats] = useState<Map<string, Category>>(new Map());
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiContent, setAiContent] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (selectedMonth) params.set("month", selectedMonth);
    if (accountFilter !== "all") params.set("accountId", accountFilter);
    if (categoryFilter !== "all") params.set("categoryId", categoryFilter);
    if (search) params.set("search", search);

    try {
      const [txRes, catRes, accRes] = await Promise.all([
        fetch(`/api/transactions?${params}`),
        fetch("/api/categories"),
        fetch("/api/accounts"),
      ]);
      if (!txRes.ok || !catRes.ok || !accRes.ok) {
        console.error("Transactions: API error");
        setLoading(false);
        return;
      }
      const [txData, catData, accData]: [Transaction[], Category[], Account[]] = await Promise.all([
        txRes.json(), catRes.json(), accRes.json(),
      ]);
      setTxs(txData);
      setCats(new Map(catData.map((c) => [c.id, c])));
      setAccounts(accData);
    } catch (err) {
      console.error("Transactions: load error", err);
    }
    setLoading(false);
  }, [selectedMonth, accountFilter, categoryFilter, search]);

  useEffect(() => { loadData(); }, [loadData]);

  const updateCategory = async (txId: string, categoryId: string, label: string) => {
    const prevTxs = txs;
    setTxs((prev) => prev.map((t) => t.id === txId ? { ...t, category_id: categoryId, confidence: 1.0 } : t));
    setEditingId(null);
    const res = await fetch(`/api/transactions/${txId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId, learnPattern: label.slice(0, 40) }),
    });
    if (!res.ok) {
      setTxs(prevTxs);
    }
  };

  const [aiDate, setAiDate] = useState<string | null>(null);

  // Load cached analysis when month changes
  useEffect(() => {
    if (!selectedMonth) return;
    const [y, m] = selectedMonth.split("-").map(Number);
    const from = `${y}-${String(m).padStart(2, "0")}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const to = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    fetch(`/api/analyze?tab=transactions&from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((d) => { if (d.cached && d.content) { setAiContent(d.content); setAiDate(d.created_at); } else { setAiContent(null); setAiDate(null); } })
      .catch(() => {});
  }, [selectedMonth]);

  const refreshAI = async (force = false) => {
    setAiLoading(true);
    const month = selectedMonth || new Date().toISOString().slice(0, 7);
    const [y, m] = month.split("-").map(Number);
    const from = `${y}-${String(m).padStart(2, "0")}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const to = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    try {
      const res = await fetch("/api/analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tab: "transactions", from, to, force }),
      });
      const data = await res.json();
      if (res.ok) {
        setAiContent(data.content || "Aucun contenu");
        setAiDate(data.created_at || null);
      } else {
        setAiContent(data.message || data.error || "Erreur API");
      }
    } catch {
      setAiContent("Erreur de connexion");
    }
    setAiLoading(false);
  };

  const expenseParents = Array.from(cats.values()).filter((c) => !c.parent_id);
  const expenseCatParents = expenseParents.filter((c) => ["expense", "income", "transfer", "dette"].includes(c.type));
  const unclassified = txs.filter((t) => t.category_id === "divers").length;

  const AM = new Map(accounts.map((a) => [a.id, a]));

  return (
    <div style={{ padding: "28px 36px", maxWidth: 1100 }}>
      <div className="flex items-end justify-between mb-8">
        <div>
          <div style={{ fontSize: 12, color: "#86868B", marginBottom: 4 }}>
            {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <h1 style={{ fontSize: 32, fontWeight: 600, color: "#1D1D1F", letterSpacing: "-0.5px", lineHeight: 1 }}>Opérations</h1>
            {unclassified > 0 && (
              <span style={{ fontSize: 11, fontWeight: 500, padding: "3px 10px", borderRadius: 8, background: "rgba(255,149,0,0.08)", color: "#FF9500" }}>
                {unclassified} non classée{unclassified > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Month picker */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <div className="pill-group">
          <button
            onClick={() => setSelectedMonth(null)}
            className={`pill-item ${selectedMonth === null ? "active" : ""}`}
          >
            Tous
          </button>
        </div>
        {selectedMonth !== null && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSelectedMonth(shiftMonth(selectedMonth, -1))}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#86868B", padding: "4px 8px", borderRadius: 6 }}
            >
              ‹
            </button>
            <span style={{ fontSize: 14, fontWeight: 500, color: "#1D1D1F", minWidth: 160, textAlign: "center" }}>
              {formatMonthLabel(selectedMonth)}
            </span>
            <button
              onClick={() => setSelectedMonth(shiftMonth(selectedMonth, 1))}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#86868B", padding: "4px 8px", borderRadius: 6 }}
            >
              ›
            </button>
          </div>
        )}
        {selectedMonth === null && (
          <button
            onClick={() => setSelectedMonth(new Date().toISOString().slice(0, 7))}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#007AFF" }}
          >
            Mois en cours
          </button>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, alignItems: "center" }}>
        <div style={{ flex: 1 }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher\u2026"
            style={{ width: "100%", padding: "8px 14px", borderRadius: 8, border: "none", background: "#F5F5F7", fontSize: 13, color: "#1D1D1F", outline: "none" }}
          />
        </div>
        <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: 8, border: "none", background: "#F5F5F7", fontSize: 12, color: "#86868B", cursor: "pointer" }}>
          <option value="all">Tous les comptes</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.bank} — {a.name}</option>)}
        </select>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: 8, border: "none", background: "#F5F5F7", fontSize: 12, color: "#86868B", cursor: "pointer" }}>
          <option value="all">Toutes catégories</option>
          {expenseParents.filter((p) => p.type === "expense").map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <span style={{ fontSize: 12, color: "#AEAEB2", whiteSpace: "nowrap" }}>{txs.length} opérations</span>
      </div>

      {/* AI Panel */}
      <div className="mb-5">
        <AIPanel
          title="Vérifier les classifications"
          content={aiContent || `<p>${unclassified > 0 ? `<strong style="color:#FF9500">${unclassified} transaction${unclassified > 1 ? "s" : ""} non classée${unclassified > 1 ? "s" : ""}</strong> à corriger.` : "Toutes les transactions sont classées."}</p>`}
          timestamp={aiDate ? new Date(aiDate + "Z").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
          onRefresh={() => refreshAI(false)}
          onForceRefresh={aiDate ? () => refreshAI(true) : undefined}
          refreshLoading={aiLoading}
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="rounded-apple" style={{ background: "#F5F5F7", padding: "20px 24px", color: "#AEAEB2", textAlign: "center", fontSize: 13 }}>
          Chargement\u2026
        </div>
      ) : (
        <div className="rounded-apple" style={{ background: "#F5F5F7", padding: "4px 20px" }}>
          {txs.map((t) => {
            const cat = cats.get(t.category_id);
            const parentCat = cat?.parent_id ? cats.get(cat.parent_id) : null;
            const acct = AM.get(t.account_id);
            const isUnclassified = t.category_id === "divers";
            const isEditing = editingId === t.id;

            return (
              <div key={t.id} className="tx-row" style={{ position: "relative" }}>
                <CategoryDot id={t.category_id} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: "#1D1D1F", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.label.slice(0, 55)}
                  </div>
                  <div style={{ fontSize: 11, color: "#86868B", marginTop: 2 }}>
                    {fd(t.real_date || t.date)} · {acct?.bank} — {acct?.name}
                  </div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 500, color: t.amount > 0 ? "#34C759" : "#1D1D1F", minWidth: 80, textAlign: "right" }}>
                  {t.amount > 0 ? "+" : ""}{fe(t.amount)}
                </div>
                <div style={{ position: "relative" }}>
                  <button
                    onClick={() => setEditingId(isEditing ? null : t.id)}
                    style={{ fontSize: 11, color: isUnclassified ? "#FF9500" : "#86868B", background: "none", border: "none", cursor: "pointer", padding: "2px 0" }}
                  >
                    {parentCat ? `${parentCat.name} \u203A ${cat?.name}` : cat?.name}
                  </button>
                  {isEditing && (
                    <GroupedDropdown
                      cats={cats}
                      parents={expenseCatParents}
                      onSelect={(id) => updateCategory(t.id, id, t.label)}
                    />
                  )}
                </div>
                {t.confidence < 0.8 && (
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#FF9500", flexShrink: 0 }} title="Confiance faible" />
                )}
              </div>
            );
          })}
          {txs.length === 0 && (
            <div style={{ padding: "24px 0", textAlign: "center", fontSize: 13, color: "#AEAEB2" }}>
              Aucune transaction trouvée
            </div>
          )}
        </div>
      )}
    </div>
  );
}
