import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 120;

// ─── API key ──────────────────────────────────────────────────────────────────

function getApiKey(): string | null {
  const db = getDb();
  const row = db
    .prepare("SELECT value FROM settings WHERE key = 'claude_api_key'")
    .get() as { value: string } | undefined;
  return row?.value || process.env.ANTHROPIC_API_KEY || null;
}

// ─── Financial context builder ────────────────────────────────────────────────

function buildFinancialContext(from: string, to: string): string {
  const db = getDb();

  const txs = db
    .prepare(
      `
    SELECT t.id, t.label, t.amount, t.date, t.category_id,
           c.name AS cat_name, c.type AS cat_type, c.parent_id,
           p.name AS parent_name,
           a.name AS account_name, a.bank AS account_bank
    FROM transactions t
    JOIN categories c ON c.id = t.category_id
    LEFT JOIN categories p ON p.id = c.parent_id
    LEFT JOIN accounts a ON a.id = t.account_id
    WHERE t.date BETWEEN ? AND ?
    ORDER BY t.date ASC, t.amount ASC
  `
    )
    .all(from, to) as {
    id: string;
    label: string;
    amount: number;
    date: string;
    category_id: string;
    cat_name: string;
    cat_type: string;
    parent_id: string | null;
    parent_name: string | null;
    account_name: string;
    account_bank: string;
  }[];

  const accounts = db
    .prepare(
      "SELECT id, name, bank, type, balance FROM accounts ORDER BY balance DESC"
    )
    .all() as {
    id: string;
    name: string;
    bank: string;
    type: string;
    balance: number;
  }[];

  const budgets = db
    .prepare(
      `SELECT c.id, c.name, c.budget FROM categories c
       WHERE c.budget IS NOT NULL AND c.parent_id IS NULL`
    )
    .all() as { id: string; name: string; budget: number }[];

  // Compute aggregates
  const income = txs
    .filter((t) => t.cat_type === "income")
    .reduce((s, t) => s + t.amount, 0);
  const expense = txs
    .filter((t) => t.cat_type === "expense")
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const debt = txs
    .filter((t) => t.cat_type === "dette")
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const savings = income - expense - debt;

  const fromDate = new Date(from);
  const toDate = new Date(to);
  const monthsDiff = Math.max(
    1,
    (toDate.getFullYear() - fromDate.getFullYear()) * 12 +
      toDate.getMonth() -
      fromDate.getMonth() +
      1
  );

  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);

  const accountsList = accounts
    .map((a) => `- ${a.name} (${a.bank}, ${a.type}): ${a.balance.toFixed(2)}${"€"}`)
    .join("\n");

  // Budget vs actual by parent category
  const byParent: Record<string, number> = {};
  for (const t of txs) {
    if (t.cat_type !== "expense") continue;
    const pId = t.parent_id || t.category_id;
    byParent[pId] = (byParent[pId] || 0) + Math.abs(t.amount);
  }

  const budgetComparison =
    budgets
      .map((b) => {
        const actual = byParent[b.id] || 0;
        return `- ${b.name}: ${actual.toFixed(0)}€ / ${b.budget}€ budget (${
          b.budget > 0 ? ((actual / b.budget) * 100).toFixed(0) : "N/A"
        }%)`;
      })
      .join("\n") || "Aucun budget défini";

  // Transaction summary (compact JSON)
  const txJson = txs.map((t) => ({
    date: t.date,
    label: t.label,
    amount: t.amount,
    category: t.cat_name,
    parent_category: t.parent_name || t.cat_name,
    type: t.cat_type,
    account: t.account_name,
    bank: t.account_bank,
  }));

  return `FINANCIAL SUMMARY
monthly_income_average: ${(income / monthsDiff).toFixed(0)}€
monthly_expenses_average: ${(expense / monthsDiff).toFixed(0)}€
monthly_savings_average: ${(savings / monthsDiff).toFixed(0)}€
total_income: ${income.toFixed(0)}€
total_expenses: ${expense.toFixed(0)}€
total_debt_payments: ${debt.toFixed(0)}€
net_savings: ${savings.toFixed(0)}€
analysis_period: ${from} to ${to} (${monthsDiff} months)

ACCOUNTS (total: ${totalBalance.toFixed(0)}€)
${accountsList}

BUDGET VS ACTUAL
${budgetComparison}

TRANSACTIONS (${txs.length})
${JSON.stringify(txJson, null, 0)}`;
}

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(financialContext: string, userContext: string | null): string {
  return `Tu es un assistant financier personnel intelligent et bienveillant.
Tu aides l'utilisateur à comprendre et optimiser ses finances personnelles en te basant sur ses données bancaires réelles.

RÈGLES :
- Réponds toujours en français.
- Sois précis : cite des montants, des dates, des noms de marchands quand c'est pertinent.
- Sois concis mais complet.
- Utilise le format HTML pour structurer tes réponses (pas de Markdown).
- Utilise <p> pour les paragraphes, <strong> pour les montants importants, <ul><li> pour les listes.
- Si tu ne peux pas répondre à une question avec les données disponibles, dis-le clairement.
- Ne donne jamais de conseils juridiques ou fiscaux formels — précise que l'utilisateur devrait consulter un professionnel si nécessaire.

PROFIL UTILISATEUR :
- Pays : France
- Devise : EUR
- Foyer : 2 adultes, 2 enfants

${userContext ? `CONTEXTE PERSONNEL :\n${userContext}\n` : ""}
DONNÉES FINANCIÈRES ACTUELLES :
${financialContext}`;
}

// ─── Route POST ───────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const apiKey = getApiKey();
    if (!apiKey) {
      return NextResponse.json({ error: "no_api_key" }, { status: 422 });
    }

    let body: {
      messages: { role: "user" | "assistant"; content: string }[];
      from?: string;
      to?: string;
    };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Corps de requête invalide" },
        { status: 400 }
      );
    }

    const { messages, from, to } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "Le champ messages est requis et doit être un tableau non vide." },
        { status: 400 }
      );
    }

    // Default period: current month
    const now = new Date();
    const defaultFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      .toISOString()
      .slice(0, 10);

    const periodFrom = from || defaultFrom;
    const periodTo = to || defaultTo;

    // Build financial context
    const financialContext = buildFinancialContext(periodFrom, periodTo);

    // Get user_context from settings
    const db = getDb();
    const userContextRow = db
      .prepare("SELECT value FROM settings WHERE key = 'user_context'")
      .get() as { value: string } | undefined;
    const userContext = userContextRow?.value || null;

    // Build system prompt
    const systemPrompt = buildSystemPrompt(financialContext, userContext);

    // Call Claude
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      system: systemPrompt,
      messages,
    });

    const content = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("")
      .trim();

    return NextResponse.json({ content });
  } catch (err) {
    console.error("[chat] Error:", err);
    const msg = err instanceof Error ? err.message : "Erreur inconnue";

    if (
      msg.includes("401") ||
      msg.includes("authentication") ||
      msg.includes("invalid x-api-key")
    ) {
      return NextResponse.json(
        { error: "api_key_invalid", message: "Clé API invalide." },
        { status: 401 }
      );
    }
    if (msg.includes("429") || msg.includes("rate")) {
      return NextResponse.json(
        { error: "rate_limit", message: "Limite de requêtes. Réessayez dans quelques secondes." },
        { status: 429 }
      );
    }
    if (
      msg.includes("insufficient") ||
      msg.includes("credit") ||
      msg.includes("billing")
    ) {
      return NextResponse.json(
        { error: "billing", message: "Crédit API insuffisant." },
        { status: 402 }
      );
    }
    return NextResponse.json(
      { error: "api_error", message: `Erreur API : ${msg}` },
      { status: 500 }
    );
  }
}
