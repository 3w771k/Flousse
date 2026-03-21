"use client";
import { useState, useEffect, useCallback } from "react";
import { useChatContext } from "@/components/ChatContext";
import ChatButton from "@/components/ChatButton";

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
type Account = { id: string; name: string; bank: string; owner?: string };

const OWNER_LABELS: Record<string, string> = { all: "Tous propriétaires", moi: "Moi", elle: "Elle", commun: "Commun", enfant: "Enfants" };

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
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedMonth, setSelectedMonth] = useState<string | null>(new Date().toISOString().slice(0, 7));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [cats, setCats] = useState<Map<string, Category>>(new Map());
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const { setPageContext } = useChatContext();

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

  useEffect(() => {
    setPageContext({ page: "transactions", filters: { ...(selectedMonth ? { month: selectedMonth } : {}), accountId: accountFilter, categoryId: categoryFilter } });
  }, [setPageContext, selectedMonth, accountFilter, categoryFilter]);

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

  const expenseParents = Array.from(cats.values()).filter((c) => !c.parent_id);
  const expenseCatParents = expenseParents.filter((c) => ["expense", "income", "transfer", "dette"].includes(c.type));
  const availableOwners = [...new Set(accounts.map((a) => a.owner).filter((o): o is string => !!o))];
  const ownerAccountIds = ownerFilter === "all" ? null : new Set(accounts.filter((a) => a.owner === ownerFilter).map((a) => a.id));
  const filteredTxs = ownerAccountIds ? txs.filter((t) => ownerAccountIds.has(t.account_id)) : txs;
  const unclassified = filteredTxs.filter((t) => t.category_id === "divers").length;

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
        <ChatButton />
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
      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
        <div style={{ flex: 1 }}>
          {/* O1 — use actual ellipsis character, not escaped unicode */}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher…"
            style={{ width: "100%", padding: "8px 14px", borderRadius: 8, border: "none", background: "#F5F5F7", fontSize: 13, color: "#1D1D1F", outline: "none" }}
          />
        </div>
        {availableOwners.length > 1 && (
          <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
            <select
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
              style={{
                appearance: "none", WebkitAppearance: "none",
                padding: "8px 32px 8px 12px",
                borderRadius: 8, border: "none",
                background: ownerFilter !== "all" ? "rgba(175,82,222,0.08)" : "rgba(0,0,0,0.04)",
                fontSize: 12, cursor: "pointer",
                color: ownerFilter === "all" ? "#86868B" : "#AF52DE",
                fontWeight: ownerFilter === "all" ? 400 : 500,
                outline: "none",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = ownerFilter !== "all" ? "rgba(175,82,222,0.12)" : "rgba(0,0,0,0.07)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = ownerFilter !== "all" ? "rgba(175,82,222,0.08)" : "rgba(0,0,0,0.04)")}
            >
              {["all", ...availableOwners].map((o) => (
                <option key={o} value={o}>{OWNER_LABELS[o] || o}</option>
              ))}
            </select>
            <span style={{ position: "absolute", right: 10, pointerEvents: "none", color: ownerFilter === "all" ? "#86868B" : "#AF52DE", fontSize: 10 }}>▾</span>
          </div>
        )}
        <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
          <select
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            style={{
              appearance: "none", WebkitAppearance: "none",
              padding: "8px 32px 8px 12px",
              borderRadius: 8, border: "none",
              background: "rgba(0,0,0,0.04)",
              fontSize: 12, cursor: "pointer",
              color: accountFilter === "all" ? "#86868B" : "#1D1D1F",
              outline: "none",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.07)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.04)")}
          >
            <option value="all">Tous les comptes</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.bank} — {a.name}</option>)}
          </select>
          <span style={{ position: "absolute", right: 10, pointerEvents: "none", color: "#86868B", fontSize: 10 }}>▾</span>
        </div>
        <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{
              appearance: "none", WebkitAppearance: "none",
              padding: "8px 32px 8px 12px",
              borderRadius: 8, border: "none",
              background: "rgba(0,0,0,0.04)",
              fontSize: 12, cursor: "pointer",
              color: categoryFilter === "all" ? "#86868B" : "#1D1D1F",
              outline: "none",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.07)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.04)")}
          >
            <option value="all">Toutes catégories</option>
            {expenseParents.filter((p) => p.type === "expense").map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <span style={{ position: "absolute", right: 10, pointerEvents: "none", color: "#86868B", fontSize: 10 }}>▾</span>
        </div>
        <span style={{ fontSize: 12, color: "#AEAEB2", whiteSpace: "nowrap" }}>{filteredTxs.length} opérations</span>
      </div>

      {/* List */}
      {loading ? (
        <div className="rounded-apple" style={{ background: "#F5F5F7", padding: "20px 24px", color: "#AEAEB2", textAlign: "center", fontSize: 13 }}>
          Chargement…
        </div>
      ) : (
        <div className="rounded-apple" style={{ background: "#F5F5F7", padding: "4px 20px" }}>
          {filteredTxs.map((t) => {
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
                    {parentCat ? `${parentCat.name} › ${cat?.name}` : cat?.name}
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
          {filteredTxs.length === 0 && (
            <div style={{ padding: "24px 0", textAlign: "center", fontSize: 13, color: "#AEAEB2" }}>
              Aucune transaction trouvée
            </div>
          )}
        </div>
      )}
    </div>
  );
}
