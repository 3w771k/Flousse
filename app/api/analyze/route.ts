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

  const accounts = db.prepare("SELECT id, name, bank, type, balance, seed_balance FROM accounts ORDER BY balance DESC").all() as {
    id: string; name: string; bank: string; type: string; balance: number; seed_balance: number;
  }[];

  const budgets = db.prepare(`
    SELECT c.id, c.name, c.budget FROM categories c
    WHERE c.budget IS NOT NULL AND c.parent_id IS NULL
  `).all() as { id: string; name: string; budget: number }[];

  // Financial facts from settings
  const getSetting = (key: string) => {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value || null;
  };

  const income = txs.filter(t => t.cat_type === "income").reduce((s, t) => s + t.amount, 0);
  const expense = txs.filter(t => t.cat_type === "expense").reduce((s, t) => s + Math.abs(t.amount), 0);
  const debt = txs.filter(t => t.cat_type === "dette").reduce((s, t) => s + Math.abs(t.amount), 0);
  const savings = income - expense - debt;

  const fromDate = new Date(from);
  const toDate = new Date(to);
  const monthsDiff = Math.max(1, (toDate.getFullYear() - fromDate.getFullYear()) * 12 + toDate.getMonth() - fromDate.getMonth() + 1);

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

  const accountsList = accounts.map(a =>
    `- ${a.name} (${a.bank}, ${a.type}): ${a.balance.toFixed(2)}€`
  ).join("\n");

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

  // Immobilier values
  const immoSci = getSetting("immo_sci") || "300000";
  const immoLille40 = getSetting("immo_lille40") || "200000";
  const immoLille19 = getSetting("immo_lille19") || "100000";

  const userContext = getSetting("user_context") || "";

  return {
    from, to, monthsDiff,
    income, expense, debt, savings,
    totalBalance: accounts.reduce((s, a) => s + a.balance, 0),
    accountsList,
    accounts,
    budgetComparison: budgetComparison || "Aucun budget défini",
    txJson,
    txCount: txs.length,
    immoSci, immoLille40, immoLille19,
    userContext,
  };
}

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(userContext?: string): string {
  let prompt = `You are a financial analysis AI specialized in personal banking transaction analysis.
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
- identify spending patterns`;

  if (userContext && userContext.trim().length > 0) {
    prompt += `\n\nUSER CONTEXT (personal notes from the user):\n${userContext.trim()}`;
  }

  prompt += `\n\nOUTPUT FORMAT: HTML only (no Markdown). Use <div class="ai-section"> for each section, <div class="ai-section-title"> for section titles, <ul><li> for lists, <strong> for key amounts, <p> for paragraphs.

STYLE GUIDELINES
- Use precise numbers when possible.
- Quantify insights and optimization potential.
- Explain patterns detected in the data.
- Avoid vague statements.
- Keep explanations clear and structured.
- Write in French.`;

  return prompt;
}

// ─── Prompts spécifiques par onglet ──────────────────────────────────────────

function buildDataHeader(ctx: ReturnType<typeof buildFullContext>): string {
  return `FINANCIAL SUMMARY
monthly_income_average: ${(ctx.income / ctx.monthsDiff).toFixed(0)}€
monthly_expenses_average: ${(ctx.expense / ctx.monthsDiff).toFixed(0)}€
monthly_savings_average: ${(ctx.savings / ctx.monthsDiff).toFixed(0)}€
total_income: ${ctx.income.toFixed(0)}€
total_expenses: ${ctx.expense.toFixed(0)}€
total_debt_payments: ${ctx.debt.toFixed(0)}€
net_savings: ${ctx.savings.toFixed(0)}€
analysis_period: ${ctx.from} to ${ctx.to} (${ctx.monthsDiff} months)

ACCOUNTS (total: ${ctx.totalBalance.toFixed(0)}€)
${ctx.accountsList}

BUDGET VS ACTUAL
${ctx.budgetComparison}

TRANSACTIONS (${ctx.txCount})
${JSON.stringify(ctx.txJson, null, 0)}`;
}

function buildDashboardPrompt(ctx: ReturnType<typeof buildFullContext>): string {
  return `${buildDataHeader(ctx)}

TASK: Full financial analysis for the dashboard.
Include ALL 11 sections, each as a <div class="ai-section">:

1. 📋 Synthèse — Executive summary with key numbers and overall health.
2. 💵 Analyse des revenus — Income sources, reliability, regularity.
3. 📊 Ventilation des dépenses — Spending by category with percentages, amounts, budget comparison.
4. 🔄 Comportements de dépense — Recurring habits, frequent merchants, micro-transactions, weekday/weekend patterns.
5. 📱 Audit des abonnements — All recurring subscriptions, total monthly cost, unused or redundant.
6. 📅 Patterns saisonniers — Periods with unusually high spending, week-by-week patterns.
7. 🔍 Anomalies détectées — Unusual transactions deviating from normal patterns, suspicious amounts.
8. 🎯 Opportunités d'optimisation — Savings potential per category: current → target → savings.
9. 📈 Projection d'épargne — 6-month and 1-year savings with current vs optimized behavior.
10. 🏥 Score de santé financière — Score 1-10 with sub-scores for discipline, savings capacity, stability, predictability.
11. ✅ Recommandations prioritaires — Actionable recommendations with expected savings in euros.

Be thorough and detailed. Minimum 1000 words.`;
}

function buildTransactionsPrompt(ctx: ReturnType<typeof buildFullContext>): string {
  return `${buildDataHeader(ctx)}

TASK: Analyze the transactions to help classify and detect anomalies.
Include ALL 5 sections, each as a <div class="ai-section">:

1. <div class="ai-section-title">🔍 Transactions suspectes</div>
Identify transactions with unusual amounts compared to the merchant's average, potential duplicates, or unexpected timing (weekend transactions on professional accounts).

2. <div class="ai-section-title">❓ Classifications douteuses</div>
List all transactions classified as "Divers / Non classé" or with low confidence. For each, propose the most likely category and explain why.

3. <div class="ai-section-title">🔄 Marchands récurrents</div>
Identify merchants that appear every month or regularly. For each, state their most probable category and average amount.

4. <div class="ai-section-title">💸 Micro-transactions</div>
Identify accumulation of small amounts (<5€) that go unnoticed. Calculate the total impact over the period.

5. <div class="ai-section-title">✅ Recommandations de reclassification</div>
For each misclassified transaction, recommend the correct category. Format: "MERCHANT is classified as X but should be Y because Z."

Be specific — reference actual transaction labels and amounts from the data.`;
}

function buildCashflowPrompt(ctx: ReturnType<typeof buildFullContext>): string {
  return `${buildDataHeader(ctx)}

TASK: Analyze cash-flow trends and project the future.
Include ALL 6 sections, each as a <div class="ai-section">:

1. <div class="ai-section-title">💵 Évolution des revenus</div>
Analyze salary stability over the period. Identify any income that appeared or disappeared (e.g., rental income, bonuses). Quantify the impact of any changes.

2. <div class="ai-section-title">📊 Évolution des dépenses</div>
Identify which expense categories are increasing or decreasing month-over-month. Show trends with numbers.

3. <div class="ai-section-title">⚖️ Taux d'effort crédits</div>
Calculate the ratio of credit payments to income. Show how it evolves. Flag if it exceeds 33%.

4. <div class="ai-section-title">📈 Projection 6 mois</div>
Based on trends, project the monthly balance for the next 6 months. Include TWO scenarios:
- Scenario 1: Current situation (without rental income)
- Scenario 2: With rental income restored (+1300€/month)
Present as an HTML table.

5. <div class="ai-section-title">📅 Dates clés</div>
Identify important financial milestones from the data (e.g., loans ending, seasonal expenses). Project their impact on cash-flow.

6. <div class="ai-section-title">🚨 Alerte trésorerie</div>
If projections show any month where the current account risks going to zero or negative, flag it clearly with the projected date and deficit amount.

Be data-driven — use actual monthly figures from the transactions.`;
}

function buildBanksPrompt(ctx: ReturnType<typeof buildFullContext>): string {
  return `${buildDataHeader(ctx)}

ADDITIONAL CONTEXT:
Real estate assets: SCI (25%) = ${ctx.immoSci}€, Lille 40m² = ${ctx.immoLille40}€, Lille 19m² = ${ctx.immoLille19}€

TASK: Analyze account structure and optimize banking allocation.
Include ALL 5 sections, each as a <div class="ai-section">:

1. <div class="ai-section-title">💤 Comptes dormants</div>
Identify accounts with little or no activity. Quantify their balance and the opportunity cost of idle money. Suggest what to do with each.

2. <div class="ai-section-title">🏠 Compte immo sous perfusion</div>
Quantify how much has been transferred from the main checking account to the real estate account over the period. Alert on sustainability. Calculate the monthly burn rate.

3. <div class="ai-section-title">👧 Répartition épargne enfants</div>
Compare savings allocated to each child (checking accounts + savings accounts). Signal any imbalance. Project the gap over time based on current contributions.

4. <div class="ai-section-title">📊 PEA / Bourse</div>
Analyze the PEA account performance based on its current balance relative to invested capital (if derivable from transactions). Comment on the strategy.

5. <div class="ai-section-title">🏧 Frais bancaires</div>
Accumulate all bank fees detected in transactions (non-execution fees, letters, commissions, overdraft interest). Quantify the total cost and suggest how to avoid them.

Be specific — reference actual account names, balances, and transaction amounts.`;
}

function buildAnalysisSynthesePrompt(ctx: ReturnType<typeof buildFullContext>): string {
  return `${buildDataHeader(ctx)}

TASK: Concise monthly synthesis.
Include exactly 4 sections, each as a <div class="ai-section">:

1. <div class="ai-section-title">📋 Situation globale</div>
Brief overview of the financial situation this period: income, expenses, savings rate, overall trend.

2. <div class="ai-section-title">🚨 Top 3 alertes</div>
The 3 most concerning financial issues detected. Each must include a specific amount.

3. <div class="ai-section-title">✅ Top 3 points positifs</div>
The 3 best financial behaviors or improvements. Each must include a specific amount.

4. <div class="ai-section-title">🎯 Recommandation n°1</div>
The single most impactful action the user should take. Quantify the expected benefit.

Keep it concise — maximum 400 words. Focus on the most important insights.`;
}

function buildAnalysisAnomaliesPrompt(ctx: ReturnType<typeof buildFullContext>): string {
  return `${buildDataHeader(ctx)}

TASK: Detect all anomalies in transactions.
Include exactly 3 sections, each as a <div class="ai-section">:

1. <div class="ai-section-title">⚠️ Écarts significatifs</div>
List each transaction that deviates by >50% from the historical average for that merchant or category. Show: merchant, amount, average, deviation %.

2. <div class="ai-section-title">🆕 Nouveaux marchands</div>
List merchants that appear for the first time in this period (never seen in previous months). Flag the amounts.

3. <div class="ai-section-title">💰 Transactions > 200€</div>
List all transactions above 200€ (attention threshold). For each, indicate if it's expected/recurring or exceptional.

Format each anomaly clearly with the date, amount, merchant, and reason for flagging.`;
}

function buildAnalysisOptimisationsPrompt(ctx: ReturnType<typeof buildFullContext>): string {
  return `${buildDataHeader(ctx)}

TASK: Identify optimization opportunities.
Include exactly 4 sections, each as a <div class="ai-section">:

1. <div class="ai-section-title">📊 Budget vs Réel par catégorie</div>
Compare each parent category's actual spending to its budget. Flag categories significantly over budget. Show the overshoot in euros and percentage.

2. <div class="ai-section-title">🎯 Top 3 postes à réduire</div>
Identify the 3 expense categories with the most reduction potential. For each: current spending, realistic target, monthly savings potential.

3. <div class="ai-section-title">💰 Économie potentielle totale</div>
Sum up all identified savings. Present monthly and annual projections.

4. <div class="ai-section-title">📱 Audit abonnements récurrents</div>
List all detected monthly recurring payments (subscriptions, insurances, telecoms). Show the total monthly cost. Identify potential redundancies or unused services.

Be concrete — use actual amounts from the data.`;
}

function buildAnalysisProjectionsPrompt(ctx: ReturnType<typeof buildFullContext>): string {
  return `${buildDataHeader(ctx)}

ADDITIONAL CONTEXT:
Real estate assets: SCI (25%) = ${ctx.immoSci}€, Lille 40m² = ${ctx.immoLille40}€, Lille 19m² = ${ctx.immoLille19}€

TASK: Project finances 6 months forward.
Include exactly 2 sections, each as a <div class="ai-section">:

1. <div class="ai-section-title">📈 Projections à 6 mois</div>
Create an HTML table projecting monthly finances for the next 6 months, with 3 scenarios:
- Scenario 1: Current situation (no rental income)
- Scenario 2: Rental income restored (+1300€/month)
- Scenario 3: Rental income restored + after personal loan ends (frees ~185€/month)

Table columns: Month | Revenus | Dépenses | Crédits | Solde | Épargne cumulée
Use <table>, <thead>, <tbody>, <tr>, <th>, <td> tags.

2. <div class="ai-section-title">🔮 Analyse des scénarios</div>
Explain each scenario's implications. When does the user break even? When do they start accumulating savings significantly? What's the patrimonial impact at 1 year?

Base all numbers on actual averages from the transaction data.`;
}

// ─── Insights prompts (JSON, no HTML, no extended thinking) ──────────────────

function buildInsightsPrompt(ctx: ReturnType<typeof buildFullContext>, tab: string): string {
  const header = `FINANCIAL DATA
period: ${ctx.from} → ${ctx.to}
income: ${(ctx.income / ctx.monthsDiff).toFixed(0)}€/month
expenses: ${(ctx.expense / ctx.monthsDiff).toFixed(0)}€/month
savings: ${(ctx.savings / ctx.monthsDiff).toFixed(0)}€/month
accounts:
${ctx.accountsList}
budget_comparison:
${ctx.budgetComparison}
transactions_count: ${ctx.txCount}
transactions: ${JSON.stringify(ctx.txJson.slice(0, 150), null, 0)}`;

  const tabInstructions: Record<string, string> = {
    "insights-dashboard": `Focus on:
- Reste à vivre (what's left after income minus all expenses and credits)
- Budget overruns: categories significantly over budget (cite exact amounts)
- Good trends or positive behaviors observed
- Unclassified transactions ("Divers"/"Non classé"): count and total amount`,
    "insights-transactions": `Focus on:
- Unclassified transactions (category "Divers" or "Non classé"): count and total amount
- New merchants appearing for the first time this period
- Transactions with unusually high amounts for that merchant or category`,
    "insights-cashflow": `Focus on:
- Monthly structural deficit or surplus (income vs total outflows including transfers)
- 6-month projection based on current trends
- Key upcoming financial dates (e.g., loan end dates, seasonal expenses)`,
    "insights-banks": `Focus on:
- Dormant accounts (little or no activity this period)
- Total amount injected into real estate / immo account this period
- Children savings imbalance between their respective accounts`,
  };

  const instructions = tabInstructions[tab] || tabInstructions["insights-dashboard"];

  const contextBlock = ctx.userContext && ctx.userContext.trim().length > 0
    ? `\nUSER CONTEXT: ${ctx.userContext.trim()}\n`
    : "";

  return `${header}
${contextBlock}
TASK: Generate 2–4 concise financial insights for the "${tab.replace("insights-", "")}" view.

${instructions}

CRITICAL: Respond ONLY with a raw JSON array. No text before, no text after, no markdown, no backticks, no code fences.
Format exactly:
[{"type":"alert","title":"...","body":"...","metric":"..."},{"type":"positive","title":"...","body":"...","metric":null}]

Rules:
- type must be exactly one of: "alert" | "warning" | "positive" | "info"
  - "alert" = urgent problem (shown in red)
  - "warning" = thing to watch (shown in orange)
  - "positive" = good news (shown in green)
  - "info" = neutral information (shown in blue)
- title: max 50 chars, punchy and specific
- body: 1–2 sentences, cite actual numbers from data, use <b>amount</b> tags for key figures
- metric: optional short badge like "+340 €", "-12%", "3 txns" — or null
- Generate exactly 2–4 insights total
- Write in French`;
}

// ─── Route GET — cached analysis ─────────────────────────────────────────────

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

// ─── Route POST — generate analysis ─────────────────────────────────────────

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

    const now = new Date();
    const defaultFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

    const periodFrom = from || defaultFrom;
    const periodTo = to || defaultTo;

    // Check cache
    if (!force) {
      const cached = db.prepare(
        "SELECT content, created_at FROM analyses WHERE tab = ? AND period_from = ? AND period_to = ? ORDER BY created_at DESC LIMIT 1"
      ).get(tab, periodFrom, periodTo) as { content: string; created_at: string } | undefined;

      if (cached) {
        return NextResponse.json({ content: cached.content, created_at: cached.created_at, cached: true });
      }
    }

    // Build context
    const ctx = buildFullContext(periodFrom, periodTo);
    const client = new Anthropic({ apiKey });

    // ── Insights tabs: fast, no thinking, JSON output ─────────────────────────
    if (tab.startsWith("insights-")) {
      const insightsPrompt = buildInsightsPrompt(ctx, tab);

      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        system: "You are a financial analysis AI. You always respond with a raw JSON array only — no markdown, no code fences, no prose whatsoever.",
        messages: [{ role: "user", content: insightsPrompt }],
      });

      let jsonContent = ((response.content[0] as TextBlock).text || "").trim();
      // Strip any accidental code fences
      jsonContent = jsonContent
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/, "")
        .replace(/```\s*$/, "")
        .trim();

      // Validate JSON — wrap in fallback insight if broken
      try {
        JSON.parse(jsonContent);
      } catch {
        jsonContent = JSON.stringify([{
          type: "info",
          title: "Analyse disponible",
          body: jsonContent.slice(0, 300),
          metric: null,
        }]);
      }

      db.prepare(`
        INSERT INTO analyses (tab, period_from, period_to, content, created_at)
        VALUES (?, ?, ?, ?, datetime('now'))
        ON CONFLICT(tab, period_from, period_to) DO UPDATE SET
          content = excluded.content,
          created_at = excluded.created_at
      `).run(tab, periodFrom, periodTo, jsonContent);

      return NextResponse.json({ content: jsonContent, cached: false });
    }

    // ── Full analysis tabs: extended thinking, HTML output ────────────────────

    const promptMap: Record<string, (ctx: ReturnType<typeof buildFullContext>) => string> = {
      dashboard: buildDashboardPrompt,
      transactions: buildTransactionsPrompt,
      cashflow: buildCashflowPrompt,
      banks: buildBanksPrompt,
      "analysis-synthese": buildAnalysisSynthesePrompt,
      "analysis-anomalies": buildAnalysisAnomaliesPrompt,
      "analysis-optimisations": buildAnalysisOptimisationsPrompt,
      "analysis-projections": buildAnalysisProjectionsPrompt,
    };

    const buildPrompt = promptMap[tab] || buildDashboardPrompt;
    const userPrompt = buildPrompt(ctx);

    // Fetch previous period analysis for context continuity
    const fromDate = new Date(periodFrom);
    const prevMonth = new Date(fromDate.getFullYear(), fromDate.getMonth() - 1, 1);
    const prevFrom = prevMonth.toISOString().slice(0, 10);
    const prevTo = new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0).toISOString().slice(0, 10);

    const prevAnalysis = db.prepare(
      "SELECT content, period_from, period_to FROM analyses WHERE tab = ? AND period_from = ? AND period_to = ? ORDER BY created_at DESC LIMIT 1"
    ).get(tab, prevFrom, prevTo) as { content: string; period_from: string; period_to: string } | undefined;

    const messages: { role: "user" | "assistant"; content: string }[] = [];

    if (prevAnalysis) {
      messages.push({
        role: "user",
        content: `Previous period analysis (${prevAnalysis.period_from} to ${prevAnalysis.period_to}) for trend comparison:\n\n${prevAnalysis.content}`,
      });
      messages.push({
        role: "assistant",
        content: "Noted. I will reference changes and trends compared to the previous period.",
      });
    }

    messages.push({ role: "user", content: userPrompt });

    if (prevAnalysis) {
      messages[messages.length - 1].content += `\n\nIMPORTANT: Reference specific changes and trends compared to last period.`;
    }

    // Adjust thinking budget based on prompt complexity
    const isLightPrompt = tab.startsWith("analysis-") && tab !== "analysis-projections";
    const thinkingBudget = isLightPrompt ? 8000 : 16000;
    const maxTokens = isLightPrompt ? 16000 : 32000;

    const stream = client.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      thinking: {
        type: "enabled",
        budget_tokens: thinkingBudget,
      },
      system: buildSystemPrompt(ctx.userContext),
      messages,
    });

    const message = await stream.finalMessage();

    let html = (message.content as ContentBlock[])
      .filter((b): b is TextBlock => b.type === "text")
      .map(b => b.text)
      .join("")
      .trim();

    // D2: Strip code fences the LLM may accidentally return
    html = html
      .replace(/^```html\s*/i, "")
      .replace(/^```\s*/, "")
      .replace(/```\s*$/, "")
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
      return NextResponse.json({ error: "api_key_invalid", message: "Clé API invalide." }, { status: 401 });
    }
    if (msg.includes("429") || msg.includes("rate")) {
      return NextResponse.json({ error: "rate_limit", message: "Limite de requêtes. Réessayez dans quelques secondes." }, { status: 429 });
    }
    if (msg.includes("insufficient") || msg.includes("credit") || msg.includes("billing")) {
      return NextResponse.json({ error: "billing", message: "Crédit API insuffisant." }, { status: 402 });
    }
    return NextResponse.json({ error: "api_error", message: `Erreur API : ${msg}` }, { status: 500 });
  }
}
