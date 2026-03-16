import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 180;

type ThinkingBlock = { type: "thinking"; thinking: string };
type TextBlock = { type: "text"; text: string };
type ContentBlock = ThinkingBlock | TextBlock;

function getApiKey(): string | null {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = 'claude_api_key'").get() as { value: string } | undefined;
  return row?.value || process.env.ANTHROPIC_API_KEY || null;
}

// ─── Data extraction ───────────────────────────────────────────────────────────

function buildFullContext(from: string, to: string) {
  const db = getDb();

  // All transactions for the period
  const txs = db.prepare(`
    SELECT t.id, t.label, t.amount, t.date, t.category_id, t.account_id,
           c.name as cat_name, c.type as cat_type, c.parent_id,
           p.name as parent_name,
           a.name as account_name, a.bank as account_bank
    FROM transactions t
    JOIN categories c ON c.id = t.category_id
    LEFT JOIN categories p ON p.id = c.parent_id
    LEFT JOIN accounts a ON a.id = t.account_id
    WHERE t.date BETWEEN ? AND ?
    ORDER BY t.date ASC, t.amount ASC
  `).all(from, to) as {
    id: string; label: string; amount: number; date: string; category_id: string; account_id: string;
    cat_name: string; cat_type: string; parent_id: string | null; parent_name: string | null;
    account_name: string; account_bank: string;
  }[];

  // Accounts
  const accounts = db.prepare("SELECT id, name, bank, type, balance FROM accounts ORDER BY balance DESC").all() as {
    id: string; name: string; bank: string; type: string; balance: number;
  }[];

  // Budgets
  const budgets = db.prepare(`
    SELECT c.id, c.name, c.budget FROM categories c
    WHERE c.budget IS NOT NULL AND c.parent_id IS NULL
  `).all() as { id: string; name: string; budget: number }[];

  // Compute summary
  const income = txs.filter(t => t.cat_type === "income").reduce((s, t) => s + t.amount, 0);
  const expense = txs.filter(t => t.cat_type === "expense").reduce((s, t) => s + Math.abs(t.amount), 0);
  const debt = txs.filter(t => t.cat_type === "dette").reduce((s, t) => s + Math.abs(t.amount), 0);
  const savings = income - expense - debt;

  // Number of months in period
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const monthsDiff = Math.max(1, (toDate.getFullYear() - fromDate.getFullYear()) * 12 + toDate.getMonth() - fromDate.getMonth() + 1);

  // Format transactions as compact JSON
  const txJson = txs.map(t => ({
    date: t.date,
    label: t.label,
    amount: t.amount,
    category: t.cat_name,
    parent_category: t.parent_name || t.cat_name,
    type: t.cat_type,
    account: t.account_name,
    bank: t.account_bank,
  }));

  // Format accounts
  const accountsList = accounts.map(a =>
    `- ${a.name} (${a.bank}, ${a.type}): ${a.balance.toFixed(0)}€`
  ).join("\n");

  // Budget vs actual
  const byParent: Record<string, number> = {};
  for (const t of txs) {
    if (t.cat_type !== "expense") continue;
    const pId = t.parent_id || t.category_id;
    byParent[pId] = (byParent[pId] || 0) + Math.abs(t.amount);
  }

  const budgetComparison = budgets.map(b => {
    const actual = byParent[b.id] || 0;
    return `- ${b.name}: ${actual.toFixed(0)}€ dépensé / ${b.budget}€ budget (${b.budget > 0 ? ((actual / b.budget) * 100).toFixed(0) : "N/A"}%)`;
  }).join("\n");

  return {
    from, to, monthsDiff,
    income, expense, debt, savings,
    totalBalance: accounts.reduce((s, a) => s + a.balance, 0),
    accountsList,
    budgetComparison: budgetComparison || "Aucun budget défini",
    txJson,
    txCount: txs.length,
  };
}

// ─── System prompt (shared across all tabs) ────────────────────────────────────

const SYSTEM_PROMPT = `You are a financial analysis AI specialized in personal banking transaction analysis.
Your role is to analyze a user's complete financial situation based on their financial summary and raw banking transactions.
Your analysis must be data-driven, precise, and structured. Avoid generic advice and base every insight strictly on the data provided.
The goal is to help the user better understand their financial behavior, identify inefficiencies, detect anomalies, and suggest actionable optimizations.

USER PROFILE
Country: France
Currency: EUR
Household: 2 adults, 2 children
Income type: salary
Risk tolerance: moderate
Financial goals:
- increase savings
- reduce unnecessary expenses
- improve financial visibility
- identify spending patterns

OUTPUT FORMAT: HTML only (no Markdown). Use <div class="ai-section"> for each section, <div class="ai-section-title"> for section titles, <ul><li> for lists, <strong> for key amounts, <p> for paragraphs.

STYLE GUIDELINES
- Use precise numbers when possible.
- Quantify insights and optimization potential.
- Explain patterns detected in the data.
- Avoid vague statements.
- Keep explanations clear and structured.
- Write in French.`;

// ─── Prompts par onglet ────────────────────────────────────────────────────────

function buildDashboardPrompt(ctx: ReturnType<typeof buildFullContext>): string {
  return `FINANCIAL SUMMARY
monthly_income_average: ${(ctx.income / ctx.monthsDiff).toFixed(0)}€
monthly_expenses_average: ${(ctx.expense / ctx.monthsDiff).toFixed(0)}€
monthly_savings_average: ${(ctx.savings / ctx.monthsDiff).toFixed(0)}€
total_income: ${ctx.income.toFixed(0)}€
total_expenses: ${ctx.expense.toFixed(0)}€
total_debt_payments: ${ctx.debt.toFixed(0)}€
net_savings: ${ctx.savings.toFixed(0)}€
analysis_period_start: ${ctx.from}
analysis_period_end: ${ctx.to}
period_months: ${ctx.monthsDiff}

ACCOUNTS (total balance: ${ctx.totalBalance.toFixed(0)}€)
${ctx.accountsList}

BUDGET VS ACTUAL
${ctx.budgetComparison}

TRANSACTIONS (${ctx.txCount} transactions)
${JSON.stringify(ctx.txJson, null, 0)}

TASK
Analyze the user's financial situation using the provided data.
Your analysis must include ALL of the following sections, each as a <div class="ai-section">:

1. <div class="ai-section-title">📋 Synthèse</div>
Provide a concise executive summary of the user's financial situation for this period. Key numbers, overall health, main takeaway.

2. <div class="ai-section-title">💵 Analyse des revenus</div>
Identify income sources, reliability, regularity, and any irregular income patterns.

3. <div class="ai-section-title">📊 Ventilation des dépenses</div>
Analyze spending distribution by category and sub-category. Identify the most significant cost centers. Give percentages and amounts for each. Compare to budget when available.

4. <div class="ai-section-title">🔄 Comportements de dépense</div>
Detect recurring habits: frequent restaurant spending, impulsive purchases, micro-transactions patterns, weekend vs weekday spending, recurring merchants.

5. <div class="ai-section-title">📱 Audit des abonnements</div>
Identify all recurring subscriptions and estimate potential unused or redundant services. Quantify total monthly subscription cost.

6. <div class="ai-section-title">📅 Patterns saisonniers</div>
Identify periods with unusually high spending and possible causes. Week-by-week or day-by-day patterns if visible.

7. <div class="ai-section-title">🔍 Anomalies détectées</div>
Highlight unusual or exceptional transactions that deviate significantly from normal spending patterns. Flag any suspicious or unexpected amounts.

8. <div class="ai-section-title">🎯 Opportunités d'optimisation</div>
Estimate how much the user could realistically save by adjusting specific categories. Give concrete numbers: current amount → target → savings potential.

9. <div class="ai-section-title">📈 Projection d'épargne</div>
Estimate future savings over 6 months and 1 year based on current behavior AND based on optimized behavior.

10. <div class="ai-section-title">🏥 Score de santé financière</div>
Give a score from 1 to 10 based on:
- spending discipline
- savings capacity
- financial stability
- predictability of finances
Explain each sub-score briefly.

11. <div class="ai-section-title">✅ Recommandations prioritaires</div>
Provide clear and practical recommendations prioritized by financial impact. Each recommendation must include the expected savings or benefit in euros.

IMPORTANT: Be thorough and detailed. Each section must contain substantive analysis based on the actual data. Minimum 1000 words total.`;
}

// ─── Route GET — récupérer l'analyse en cache ────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(req.url);
    const tab = searchParams.get("tab");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!tab || !from || !to) {
      return NextResponse.json({ error: "tab, from, to required" }, { status: 400 });
    }

    const cached = db.prepare(
      "SELECT content, created_at FROM analyses WHERE tab = ? AND period_from = ? AND period_to = ? ORDER BY created_at DESC LIMIT 1"
    ).get(tab, from, to) as { content: string; created_at: string } | undefined;

    if (cached) {
      return NextResponse.json({ content: cached.content, created_at: cached.created_at, cached: true });
    }

    return NextResponse.json({ content: null, cached: false });
  } catch (err) {
    console.error("[analyze GET]", err);
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}

// ─── Route POST — générer (ou regénérer) une analyse ─────────────────────────

export async function POST(req: NextRequest) {
  try {
    const apiKey = getApiKey();
    if (!apiKey) return NextResponse.json({ error: "no_api_key" }, { status: 422 });

    let body: { tab: string; from?: string; to?: string; force?: boolean };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
    }

    const { tab, from, to, force } = body;
    const db = getDb();

    // Default to current month if no period given
    const now = new Date();
    const defaultFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

    const periodFrom = from || defaultFrom;
    const periodTo = to || defaultTo;

    // Check cache (unless force refresh)
    if (!force) {
      const cached = db.prepare(
        "SELECT content, created_at FROM analyses WHERE tab = ? AND period_from = ? AND period_to = ? ORDER BY created_at DESC LIMIT 1"
      ).get(tab, periodFrom, periodTo) as { content: string; created_at: string } | undefined;

      if (cached) {
        return NextResponse.json({ content: cached.content, created_at: cached.created_at, cached: true });
      }
    }

    // Build context and prompt
    const ctx = buildFullContext(periodFrom, periodTo);
    let userPrompt: string;

    if (tab === "dashboard") {
      userPrompt = buildDashboardPrompt(ctx);
    } else {
      userPrompt = buildDashboardPrompt(ctx);
    }

    // Fetch previous period analysis for context continuity
    const fromDate = new Date(periodFrom);
    const prevMonth = new Date(fromDate.getFullYear(), fromDate.getMonth() - 1, 1);
    const prevFrom = prevMonth.toISOString().slice(0, 10);
    const prevTo = new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0).toISOString().slice(0, 10);

    const prevAnalysis = db.prepare(
      "SELECT content, period_from, period_to FROM analyses WHERE tab = ? AND period_from = ? AND period_to = ? ORDER BY created_at DESC LIMIT 1"
    ).get(tab, prevFrom, prevTo) as { content: string; period_from: string; period_to: string } | undefined;

    // Build messages with optional previous analysis context
    const messages: { role: "user" | "assistant"; content: string }[] = [];

    if (prevAnalysis) {
      messages.push({
        role: "user",
        content: `Here is the previous period analysis (${prevAnalysis.period_from} to ${prevAnalysis.period_to}) for context and comparison:\n\n${prevAnalysis.content}`,
      });
      messages.push({
        role: "assistant",
        content: "J'ai bien noté l'analyse de la période précédente. Je vais l'utiliser pour comparer les tendances et identifier les évolutions.",
      });
    }

    messages.push({ role: "user", content: userPrompt });

    if (prevAnalysis) {
      messages[messages.length - 1].content += `\n\nIMPORTANT: You have the previous period analysis above. Reference specific changes and trends compared to last period. Highlight improvements AND regressions.`;
    }

    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: "claude-sonnet-4-6-20250514",
      max_tokens: 32000,
      thinking: {
        type: "enabled",
        budget_tokens: 16000,
      },
      system: SYSTEM_PROMPT,
      messages,
    });

    // Extract only text blocks (skip thinking blocks)
    const html = (message.content as ContentBlock[])
      .filter((b): b is TextBlock => b.type === "text")
      .map(b => b.text)
      .join("")
      .trim();

    // Store in DB (upsert)
    db.prepare(`
      INSERT INTO analyses (tab, period_from, period_to, content, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(tab, period_from, period_to) DO UPDATE SET
        content = excluded.content,
        created_at = excluded.created_at
    `).run(tab, periodFrom, periodTo, html);

    const created = db.prepare(
      "SELECT created_at FROM analyses WHERE tab = ? AND period_from = ? AND period_to = ?"
    ).get(tab, periodFrom, periodTo) as { created_at: string };

    return NextResponse.json({ content: html, created_at: created.created_at, cached: false });

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
