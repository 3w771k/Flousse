"use client";
import { useState, useRef, useEffect } from "react";

type Account = { id: string; name: string; bank: string };
type Step = 1 | 2 | 3 | 4 | 5;

type CategorySummaryItem = { id: string; name: string; count: number; unclassified: boolean };

type TxPayload = {
  id: string; date: string; label: string; amount: number;
  categoryId: string; confidence: number; source: string;
};

type ImportResult = {
  imported: number;
  duplicates: number;
  rulesApplied: number;
  aiClassified: number;
  unclassified: number;
  categorySummary: CategorySummaryItem[];
  preview: { label: string; amount: number; category: string; unclassified: boolean }[];
  transactions: TxPayload[];
  accountId: string;
};

const fe = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);

const STEP_LABELS = ["Upload", "Compte", "Analyse", "Aperçu", "Confirmation"];

export default function ImportPage() {
  const [step, setStep] = useState<Step>(1);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [account, setAccount] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/accounts").then((r) => r.json()).then(setAccounts);
  }, []);

  const handleFile = (f: File) => {
    setFile(f);
    setStep(2);
  };

  const stopTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const handleImport = async () => {
    if (!file || !account) return;
    setStep(3);
    setError(null);
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("accountId", account);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 600_000); // 10 min max

      const res = await fetch("/api/import", { method: "POST", body: formData, signal: controller.signal });
      clearTimeout(timeout);
      stopTimer();

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erreur lors de l'import");
        setStep(2);
        return;
      }
      setResult(data);
      setStep(4);
    } catch (err) {
      stopTimer();
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("L'analyse a pris trop de temps (>10 min). Essayez avec un fichier plus petit ou vérifiez votre clé API.");
      } else {
        setError("Erreur réseau — vérifiez que le serveur est démarré.");
      }
      setStep(2);
    }
  };

  const reset = () => {
    setStep(1); setFile(null); setAccount(""); setResult(null); setError(null); setConfirming(false);
  };

  const handleConfirm = async () => {
    if (!result?.transactions?.length || !result.accountId) return;
    setConfirming(true);
    try {
      const res = await fetch("/api/import/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: result.accountId, transactions: result.transactions }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Erreur lors de la confirmation");
        setConfirming(false);
        return;
      }
      setStep(5);
    } catch {
      setError("Erreur réseau");
    }
    setConfirming(false);
  };

  const detectedFormat = file
    ? file.name.toLowerCase().includes("activity") ? "Amex CSV"
    : file.name.toLowerCase().startsWith("releve") ? "CCF CSV"
    : file.name.match(/^e\d{7}/i) ? "Hello Bank CSV"
    : "CSV"
    : null;

  return (
    <div style={{ padding: "28px 36px", maxWidth: 960 }}>
      <div className="mb-8">
        <div style={{ fontSize: 12, color: "#86868B", marginBottom: 4 }}>
          {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </div>
        <h1 style={{ fontSize: 32, fontWeight: 600, color: "#1D1D1F", letterSpacing: "-0.5px", lineHeight: 1 }}>Import</h1>
      </div>

      {/* Step indicator */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 32, maxWidth: 480 }}>
        {STEP_LABELS.map((label, i) => {
          const s = i + 1;
          const done = step > s;
          const active = step === s;
          return (
            <div key={s} style={{ display: "flex", alignItems: "center", flex: s < 5 ? 1 : undefined }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ width: 26, height: 26, borderRadius: "50%", background: done ? "#34C759" : active ? "#007AFF" : "rgba(0,0,0,0.06)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: done || active ? "white" : "#AEAEB2" }}>
                  {done ? "✓" : s}
                </div>
                <span style={{ fontSize: 10, color: active ? "#007AFF" : "#AEAEB2", whiteSpace: "nowrap" }}>{label}</span>
              </div>
              {s < 5 && <div style={{ flex: 1, height: 1, background: done ? "#34C759" : "rgba(0,0,0,0.06)", margin: "0 6px 14px" }} />}
            </div>
          );
        })}
      </div>

      {error && (
        <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(255,59,48,0.06)", border: "1px solid rgba(255,59,48,0.12)", color: "#FF3B30", fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Step 1 */}
      {step === 1 && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          onClick={() => inputRef.current?.click()}
          className="rounded-apple"
          style={{ padding: "48px 24px", textAlign: "center", cursor: "pointer", border: `1.5px dashed ${dragging ? "#007AFF" : "rgba(0,0,0,0.1)"}`, background: dragging ? "rgba(0,122,255,0.03)" : "#F5F5F7", maxWidth: 480 }}
        >
          <div style={{ fontSize: 40, marginBottom: 12 }}>📂</div>
          <div style={{ fontSize: 15, fontWeight: 500, color: "#1D1D1F", marginBottom: 6 }}>Déposez votre fichier ici</div>
          <div style={{ fontSize: 13, color: "#86868B", marginBottom: 16 }}>ou cliquez pour sélectionner</div>
          <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
            {["Hello Bank CSV", "CCF CSV", "Amex CSV"].map((f) => (
              <span key={f} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, background: "rgba(0,122,255,0.08)", color: "#007AFF" }}>{f}</span>
            ))}
          </div>
          <input ref={inputRef} type="file" className="hidden" accept=".csv,.ofx" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        </div>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div className="rounded-apple" style={{ background: "#F5F5F7", padding: 24, maxWidth: 480 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, padding: "12px 16px", borderRadius: 10, background: "rgba(52,199,89,0.06)", border: "1px solid rgba(52,199,89,0.12)" }}>
            <span style={{ fontSize: 20 }}>📄</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: "#1D1D1F" }}>{file?.name}</div>
              {detectedFormat && <div style={{ fontSize: 11, color: "#34C759", marginTop: 2 }}>Format détecté : {detectedFormat}</div>}
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <div className="section-label mb-2">COMPTE CIBLE</div>
            <select value={account} onChange={(e) => setAccount(e.target.value)}
              style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: `1.5px solid ${account ? "#007AFF" : "rgba(0,0,0,0.1)"}`, background: "white", fontSize: 13, color: account ? "#1D1D1F" : "#86868B", outline: "none" }}>
              <option value="">Sélectionner un compte…</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.bank} — {a.name}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={reset} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "rgba(0,0,0,0.06)", color: "#86868B", fontSize: 13, cursor: "pointer" }}>Annuler</button>
            <button onClick={handleImport} disabled={!account} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: account ? "#007AFF" : "rgba(0,0,0,0.08)", color: account ? "white" : "#AEAEB2", fontSize: 13, fontWeight: 500, cursor: account ? "pointer" : "default" }}>
              Analyser & importer
            </button>
          </div>
        </div>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <div className="rounded-apple" style={{ background: "#F5F5F7", padding: "40px 24px", maxWidth: 480, textAlign: "center" }}>
          <div style={{ width: 40, height: 40, border: "3px solid rgba(0,122,255,0.15)", borderTopColor: "#007AFF", borderRadius: "50%", margin: "0 auto 20px", animation: "spin 0.8s linear infinite" }} />
          <div style={{ fontSize: 15, fontWeight: 500, color: "#1D1D1F", marginBottom: 8 }}>Analyse en cours…</div>
          <div style={{ fontSize: 13, color: "#86868B", marginBottom: 4 }}>
            Parsing, règles, classification IA
          </div>
          <div style={{ fontSize: 24, fontWeight: 300, color: "#007AFF", marginTop: 16, fontVariantNumeric: "tabular-nums" }}>
            {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
          </div>
          <div style={{ fontSize: 11, color: "#AEAEB2", marginTop: 8 }}>
            {elapsed < 10 ? "Parsing du fichier…" : elapsed < 30 ? "Classification IA des transactions…" : "Gros fichier — l'IA travaille, patience…"}
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )}

      {/* Step 4 — Preview with category summary */}
      {step === 4 && result && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 16, alignItems: "start" }}>
          {/* Left: transaction preview */}
          <div className="rounded-apple" style={{ background: "#F5F5F7", overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: "#1D1D1F" }}>Aperçu — {result.imported} transaction{result.imported > 1 ? "s" : ""}</div>
              <div style={{ fontSize: 12, color: "#86868B", marginTop: 2 }}>
                {result.duplicates > 0 && `${result.duplicates} doublon${result.duplicates > 1 ? "s" : ""} ignoré${result.duplicates > 1 ? "s" : ""} · `}
                {result.rulesApplied} règle{result.rulesApplied > 1 ? "s" : ""} · {result.aiClassified ?? 0} IA
                {(result.unclassified ?? 0) > 0 && <span style={{ color: "#FF9500" }}> · {result.unclassified} non classée{(result.unclassified ?? 0) > 1 ? "s" : ""}</span>}
              </div>
            </div>
            <div style={{ maxHeight: 400, overflowY: "auto" }}>
              {result.preview.map((t, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px", borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: t.unclassified ? "#FF9500" : "#34C759", flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: "#1D1D1F", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.label}</div>
                    <div style={{ fontSize: 11, color: t.unclassified ? "#FF9500" : "#86868B", marginTop: 1 }}>{t.category}</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: t.amount > 0 ? "#34C759" : "#1D1D1F" }}>{t.amount > 0 ? "+" : ""}{fe(t.amount)}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, padding: 16 }}>
              <button onClick={reset} disabled={confirming} style={{ flex: 1, padding: 10, borderRadius: 10, border: "none", background: "rgba(0,0,0,0.06)", color: "#86868B", fontSize: 13, cursor: confirming ? "default" : "pointer" }}>Annuler</button>
              <button onClick={handleConfirm} disabled={confirming} style={{ flex: 1, padding: 10, borderRadius: 10, border: "none", background: confirming ? "#AEAEB2" : "#007AFF", color: "white", fontSize: 13, fontWeight: 500, cursor: confirming ? "default" : "pointer" }}>
                {confirming ? "Import en cours…" : "Confirmer"}
              </button>
            </div>
          </div>

          {/* Right: category summary */}
          <div className="rounded-apple" style={{ background: "#F5F5F7", padding: "16px 20px" }}>
            <div className="section-label mb-3">Classification</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {result.categorySummary?.map((cat) => (
                <div key={cat.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: cat.unclassified ? "#FF9500" : "#34C759", flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 12, color: cat.unclassified ? "#FF9500" : "#1D1D1F" }}>{cat.name}</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "#86868B", minWidth: 20, textAlign: "right" }}>{cat.count}</span>
                </div>
              ))}
            </div>
            {result.categorySummary && result.categorySummary.length > 0 && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(0,0,0,0.06)", display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: "#1D1D1F" }}>Total</span>
                <span style={{ fontSize: 12, fontWeight: 500, color: "#1D1D1F" }}>{result.imported}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 5 */}
      {step === 5 && result && (
        <div className="rounded-apple" style={{ background: "#F5F5F7", padding: "40px 24px", textAlign: "center", maxWidth: 480 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 17, fontWeight: 600, color: "#1D1D1F", marginBottom: 20 }}>Import réussi</div>
          <div style={{ display: "flex", justifyContent: "center", gap: 32, marginBottom: 28 }}>
            {[
              { n: result.imported, label: "importées", color: "#34C759" },
              { n: result.duplicates, label: "doublons", color: "#AEAEB2" },
              { n: result.rulesApplied, label: "règles", color: "#007AFF" },
              { n: result.aiClassified ?? 0, label: "IA", color: "#5856D6" },
              { n: result.unclassified ?? 0, label: "non classées", color: "#FF9500" },
            ].map((s) => (
              <div key={s.label}>
                <div style={{ fontSize: 28, fontWeight: 300, color: s.color, letterSpacing: "-1px" }}>{s.n}</div>
                <div style={{ fontSize: 11, color: "#86868B" }}>{s.label}</div>
              </div>
            ))}
          </div>
          <button onClick={reset} style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: "#007AFF", color: "white", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Nouvel import</button>
        </div>
      )}
    </div>
  );
}
