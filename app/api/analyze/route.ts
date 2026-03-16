import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 120;

type ThinkingBlock = { type: "thinking"; thinking: string };
type TextBlock = { type: "text"; text: string };
type ContentBlock = ThinkingBlock | TextBlock;

function getApiKey(): string | null {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = 'claude_api_key'").get() as { value: string } | undefined;
  return row?.value || process.env.ANTHROPIC_API_KEY || null;
}

// ─── Context builders ──────────────────────────────────────────────────────────

function buildDashboardContext(from: string, to: string): string {
  const db = getDb();

  // Period transactions
  const txs = db.prepare(`
    SELECT t.label, t.amount, t.date, t.category_id,
           c.name as cat_name, c.type as cat_type, c.parent_id,
           p.name as parent_name
    FROM transactions t
    JOIN categories c ON c.id = t.category_id
    LEFT JOIN categories p ON p.id = c.parent_id
    WHERE t.date BETWEEN ? AND ?
    ORDER BY t.amount ASC
  `).all(from, to) as {
    label: string; amount: number; date: string; category_id: string;
    cat_name: string; cat_type: string; parent_id: string | null; parent_name: string | null;
  }[];

  // Totals
  const income = txs.filter(t => t.cat_type === "income").reduce((s, t) => s + t.amount, 0);
  const expense = txs.filter(t => t.cat_type === "expense").reduce((s, t) => s + Math.abs(t.amount), 0);
  const debt = txs.filter(t => t.cat_type === "dette").reduce((s, t) => s + Math.abs(t.amount), 0);
  const net = income - expense - debt;

  // Expenses by parent category
  const byParent: Record<string, { name: string; total: number; subs: Record<string, number> }> = {};
  for (const t of txs) {
    if (t.cat_type !== "expense") continue;
    const pId = t.parent_id || t.category_id;
    const pName = t.parent_name || t.cat_name;
    if (!byParent[pId]) byParent[pId] = { name: pName, total: 0, subs: {} };
    byParent[pId].total += Math.abs(t.amount);
    byParent[pId].subs[t.cat_name] = (byParent[pId].subs[t.cat_name] || 0) + Math.abs(t.amount);
  }

  const catBreakdown = Object.values(byParent)
    .sort((a, b) => b.total - a.total)
    .map(({ name, total, subs }) => {
      const subStr = Object.entries(subs)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([s, v]) => `    · ${s}: ${v.toFixed(0)}€`)
        .join("\n");
      return `  ${name}: ${total.toFixed(0)}€\n${subStr}`;
    }).join("\n");

  // Top 8 biggest expenses
  const topExpenses = txs
    .filter(t => t.cat_type === "expense" && t.amount < 0)
    .sort((a, b) => a.amount - b.amount)
    .slice(0, 8)
    .map(t => `  ${t.date} | ${t.label} | ${t.amount.toFixed(0)}€ | ${t.cat_name}`)
    .join("\n");

  // Account balances
  const accounts = db.prepare("SELECT name, bank, balance FROM accounts ORDER BY balance DESC").all() as {
    name: string; bank: string; balance: number;
  }[];
  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);
  const balanceStr = accounts
    .map(a => `  ${a.name} (${a.bank}): ${a.balance.toFixed(0)}€`)
    .join("\n");

  // Budget comparison
  const budgets = db.prepare(`
    SELECT c.id, c.name, c.budget
    FROM categories c
    WHERE c.budget IS NOT NULL AND c.parent_id IS NULL
  `).all() as { id: string; name: string; budget: number }[];

  const budgetStr = budgets.map(b => {
    const actual = byParent[b.id]?.total || 0;
    const diff = actual - b.budget;
    const status = diff > 0 ? `⚠️ +${diff.toFixed(0)}€ dépassement` : `✓ -${Math.abs(diff).toFixed(0)}€ sous budget`;
    return `  ${b.name}: ${actual.toFixed(0)}€ / ${b.budget}€ budget → ${status}`;
  }).join("\n");

  // Previous period (same duration)
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const durationMs = toDate.getTime() - fromDate.getTime();
  const prevTo = new Date(fromDate.getTime() - 86400000);
  const prevFrom = new Date(prevTo.getTime() - durationMs);
  const prevFromStr = prevFrom.toISOString().slice(0, 10);
  const prevToStr = prevTo.toISOString().slice(0, 10);

  const prevTxs = db.prepare(`
    SELECT t.amount, c.type as cat_type
    FROM transactions t
    JOIN categories c ON c.id = t.category_id
    WHERE t.date BETWEEN ? AND ?
  `).all(prevFromStr, prevToStr) as { amount: number; cat_type: string }[];

  const prevIncome = prevTxs.filter(t => t.cat_type === "income").reduce((s, t) => s + t.amount, 0);
  const prevExpense = prevTxs.filter(t => t.cat_type === "expense").reduce((s, t) => s + Math.abs(t.amount), 0);

  const compareStr = prevTxs.length > 0
    ? `Revenus: ${prevIncome.toFixed(0)}€ (${income > prevIncome ? "+" : ""}${(income - prevIncome).toFixed(0)}€ vs période actuelle)\nDépenses: ${prevExpense.toFixed(0)}€ (${expense > prevExpense ? "+" : ""}${(expense - prevExpense).toFixed(0)}€ vs période actuelle)`
    : "Pas de données pour la période précédente";

  return `PÉRIODE : ${from} au ${to}
Transactions analysées : ${txs.length}

RÉSUMÉ FINANCIER :
  Revenus     : ${income.toFixed(0)}€
  Dépenses    : ${expense.toFixed(0)}€
  Crédits     : ${debt.toFixed(0)}€
  Solde net   : ${net.toFixed(0)}€

SOLDES COMPTES (total : ${totalBalance.toFixed(0)}€) :
${balanceStr}

DÉPENSES PAR CATÉGORIE :
${catBreakdown}

BUDGET VS RÉEL :
${budgetStr || "  Aucun budget défini"}

PLUS GROSSES DÉPENSES :
${topExpenses || "  Aucune transaction"}

PÉRIODE PRÉCÉDENTE (${prevFromStr} → ${prevToStr}) :
${compareStr}

CONTEXTE FOYER :
  - 16 comptes bancaires (Hello Bank, CCF, Amex)
  - 2 immeubles locatifs à Lille (procédure mise en péril — loyers non perçus ~1 300€/mois)
  - Crédits immo : 906€/mois + 562€/mois
  - Prêt personnel : 185€/mois (fin juillet 2028)
  - 2 filles : Adèle et Gabrielle`;
}

// ─── Prompt par onglet ─────────────────────────────────────────────────────────

const TAB_PROMPTS: Record<string, (context: string) => string> = {
  dashboard: (ctx) => `Tu es un conseiller financier expert analysant les finances du foyer Wazen.

DONNÉES :
${ctx}

---

Génère une analyse financière structurée en HTML avec EXACTEMENT ces 4 sections. Sois direct, précis, cite les chiffres réels. 350-450 mots.

<div class="ai-section">
<div class="ai-section-title">📊 Ce qui s'est passé</div>
[Synthèse factuelle : revenus, dépenses, solde net. Catégories les plus importantes. Dépassements de budget identifiés. Évolution vs période précédente.]
</div>

<div class="ai-section">
<div class="ai-section-title">⚠️ Ce que ça implique</div>
[Lecture financière : tension de trésorerie éventuelle, impact des loyers non perçus sur l'équilibre, risques identifiés, points de vigilance concrets.]
</div>

<div class="ai-section">
<div class="ai-section-title">🎯 Optimisations pour les prochains mois</div>
[3-4 actions concrètes et actionnables avec montants chiffrés. Priorise les plus impactantes.]
</div>

<div class="ai-section">
<div class="ai-section-title">💰 Capital & ajustements</div>
[Recommandations : comment utiliser le solde disponible, quels crédits prioriser, constitution d'une réserve de trésorerie, arbitrages à faire.]
</div>

Règles strictes :
- Utilise <ul><li> pour toutes les listes
- Mets les montants clés en <strong>
- Pas de Markdown, uniquement HTML dans les balises ci-dessus
- Cite les noms de catégories et de comptes réels du contexte`,
};

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const apiKey = getApiKey();
    if (!apiKey) return NextResponse.json({ error: "no_api_key" }, { status: 422 });

    let body: { tab: string; from?: string; to?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
    }

    const { tab, from, to } = body;

    if (!TAB_PROMPTS[tab]) {
      return NextResponse.json({ error: `Onglet inconnu : ${tab}` }, { status: 400 });
    }

    // Default to current month if no period given
    const now = new Date();
    const defaultFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

    const periodFrom = from || defaultFrom;
    const periodTo = to || defaultTo;

    // Build context
    let context: string;
    if (tab === "dashboard") context = buildDashboardContext(periodFrom, periodTo);
    else context = buildDashboardContext(periodFrom, periodTo); // autres onglets à venir

    const prompt = TAB_PROMPTS[tab](context);

    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: "claude-sonnet-4-5-20251001",
      max_tokens: 16000,
      thinking: {
        type: "enabled",
        budget_tokens: 8000,
      },
      messages: [{ role: "user", content: prompt }],
    });

    // Extract only text blocks (skip thinking blocks)
    const html = (message.content as ContentBlock[])
      .filter((b): b is TextBlock => b.type === "text")
      .map(b => b.text)
      .join("")
      .trim();

    return NextResponse.json({ content: html });

  } catch (err) {
    console.error("[analyze] Error:", err);
    const msg = err instanceof Error ? err.message : "Erreur inconnue";

    if (msg.includes("401") || msg.includes("authentication") || msg.includes("invalid x-api-key")) {
      return NextResponse.json({ error: "api_key_invalid", message: "Clé API invalide. Vérifiez votre clé dans Paramètres." }, { status: 401 });
    }
    if (msg.includes("429") || msg.includes("rate")) {
      return NextResponse.json({ error: "rate_limit", message: "Limite de requêtes atteinte. Réessayez dans quelques secondes." }, { status: 429 });
    }
    if (msg.includes("insufficient") || msg.includes("credit") || msg.includes("billing")) {
      return NextResponse.json({ error: "billing", message: "Crédit API insuffisant. Rechargez votre compte Anthropic." }, { status: 402 });
    }
    return NextResponse.json({ error: "api_error", message: `Erreur API : ${msg}` }, { status: 500 });
  }
}
