import Anthropic from "@anthropic-ai/sdk";
import type { Database } from "better-sqlite3";

export interface TxToClassify {
  id: string;
  label: string;
  amount: number;
}

export interface ClassifyResult {
  id: string;
  categoryId: string;
  confidence: number;
}

// ── Built-in rules for common merchants (applied before DB rules) ──────────
const BUILTIN_RULES: [string, string][] = [
  // Shopping
  ["AMAZON", "shopping"],
  ["FNAC", "shopping"],
  ["DARTY", "shopping"],
  ["IKEA", "shopping"],
  ["ZARA", "shopping"],
  ["H&M", "shopping"],
  ["UNIQLO", "shopping"],
  ["DECATHLON", "shopping"],
  ["LEROY MERLIN", "shopping"],
  ["CASTORAMA", "shopping"],
  ["MONOPRIX", "courses"],
  ["AUCHAN", "courses"],
  ["LECLERC", "courses"],
  ["LIDL", "courses"],
  ["INTERMARCHE", "courses"],
  ["CASINO", "courses"],
  ["BIOCOOP", "courses"],
  ["NATURALIA", "courses"],
  ["GRAND FRAIS", "courses"],
  ["BOULANGERIE", "courses"],
  // Abonnements
  ["NETFLIX", "abonnements"],
  ["SPOTIFY", "abonnements"],
  ["DISNEY PLUS", "abonnements"],
  ["CANAL+", "abonnements"],
  ["CANAL PLUS", "abonnements"],
  ["APPLE.COM/BILL", "abonnements"],
  ["ADOBE", "abonnements"],
  ["MICROSOFT", "abonnements"],
  ["GOOGLE STORAGE", "abonnements"],
  ["AMAZON PRIME", "abonnements"],
  // Restaurants
  ["RESTAURANT", "resto"],
  ["BRASSERIE", "resto"],
  ["SUSHI", "resto"],
  ["MCDONALDS", "resto"],
  ["BURGER KING", "resto"],
  ["STARBUCKS", "resto"],
  // Livraison
  ["DELIVEROO", "livraison"],
  ["UBER EATS", "livraison"],
  ["JUST EAT", "livraison"],
  // Transport
  ["NAVIGO", "transport-commun"],
  ["RATP", "transport-commun"],
  ["SNCF", "transport-commun"],
  ["UBER ", "taxi"],
  ["G7 TAXI", "taxi"],
  ["BOLT", "taxi"],
  ["KAPTEN", "taxi"],
  ["TOTAL ENERGIES", "voiture"],
  ["SHELL", "voiture"],
  ["IZIVIA", "voiture"],
  ["SAEMES", "voiture"],
  ["PARKING", "voiture"],
  ["AUTOROUTE", "voiture"],
  // Telecom
  ["BOUYGUES TELECOM", "telecom"],
  ["SFR", "telecom"],
  ["FREE MOBILE", "telecom"],
  ["ORANGE", "telecom"],
  // Santé
  ["PHARMACIE", "sante"],
  ["DOCTEUR", "sante"],
  ["CPAM", "sante"],
  ["AMELI", "sante"],
  // Logement
  ["VERISURE", "securite"],
  ["EDF", "logement"],
  ["ENGIE", "logement"],
  // Crédits
  ["ECHEANCE PRET", "credit-immo"],
  ["AMERICAN EXPRESS", "amex-prlv"],
  // Revenus
  ["SALAIRE", "salaire"],
  ["CAF ", "allocations"],
  ["POLE EMPLOI", "allocations"],
  ["FRANCE TRAVAIL", "allocations"],
];

// Apply rules from DB — returns categoryId or null
export function applyRules(db: Database, label: string): string | null {
  const upper = label.toUpperCase();

  // 1. Check built-in rules first
  for (const [pattern, catId] of BUILTIN_RULES) {
    if (upper.includes(pattern)) {
      return catId;
    }
  }

  // 2. Check DB rules
  const rules = db.prepare("SELECT pattern, category_id FROM rules ORDER BY use_count DESC").all() as {
    pattern: string;
    category_id: string;
  }[];
  for (const rule of rules) {
    if (upper.includes(rule.pattern.toUpperCase())) {
      db.prepare("UPDATE rules SET use_count = use_count + 1 WHERE pattern = ?").run(rule.pattern);
      return rule.category_id;
    }
  }
  return null;
}

// Get API key from settings table
function getApiKey(db: Database): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'claude_api_key'").get() as { value: string } | undefined;
  return row?.value || process.env.ANTHROPIC_API_KEY || null;
}

// Slugify a category name into an ID
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

const BATCH_SIZE = 25;

// Classify a batch of transactions with Claude
export async function classifyWithClaude(
  db: Database,
  transactions: TxToClassify[]
): Promise<ClassifyResult[]> {
  if (transactions.length === 0) return [];

  const apiKey = getApiKey(db);
  if (!apiKey) {
    console.warn("[classify] No API key configured — all transactions classified as 'divers'");
    return transactions.map((t) => ({ id: t.id, categoryId: "divers", confidence: 0.1 }));
  }

  // Get categories for context
  const categories = db.prepare(
    "SELECT id, name, type, parent_id, sort_order FROM categories ORDER BY sort_order"
  ).all() as { id: string; name: string; type: string; parent_id: string | null; sort_order: number }[];

  const parents = categories.filter((c) => !c.parent_id);
  const children = categories.filter((c) => c.parent_id);

  // Build a tree-like list for the prompt
  const catTree = parents.map((p) => {
    const kids = children.filter((c) => c.parent_id === p.id);
    const kidsList = kids.map((k) => `    - ${k.id}: ${k.name}`).join("\n");
    return `  ${p.id}: ${p.name} (${p.type})${kidsList ? "\n" + kidsList : ""}`;
  }).join("\n");

  // Split into batches to avoid token limit issues
  const allResults: ClassifyResult[] = [];

  for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
    const batch = transactions.slice(i, i + BATCH_SIZE);
    const batchResults = await classifyBatch(db, batch, catTree, categories, parents, apiKey);
    allResults.push(...batchResults);
  }

  // Auto-create rules for high-confidence classifications
  for (const r of allResults) {
    if (r.confidence >= 0.8 && r.categoryId !== "divers") {
      const tx = transactions.find((t) => t.id === r.id);
      if (tx) {
        const pattern = tx.label.toUpperCase().replace(/\s+/g, " ").slice(0, 30).trim();
        if (pattern.length >= 4) {
          db.prepare(
            `INSERT OR IGNORE INTO rules (pattern, category_id, use_count) VALUES (?, ?, 1)`
          ).run(pattern, r.categoryId);
        }
      }
    }
  }

  return allResults;
}

async function classifyBatch(
  db: Database,
  transactions: TxToClassify[],
  catTree: string,
  categories: { id: string; name: string; type: string; parent_id: string | null; sort_order: number }[],
  parents: { id: string; name: string; type: string; parent_id: string | null; sort_order: number }[],
  apiKey: string,
): Promise<ClassifyResult[]> {
  const txList = transactions
    .map((t) => `${t.id} | ${t.label} | ${t.amount > 0 ? "+" : ""}${t.amount}€`)
    .join("\n");

  try {
    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: `Catégorise ces transactions bancaires françaises.

Catégories :
${catTree}

RÈGLES STRICTES :
- AMAZON/FNAC/DARTY/IKEA → shopping
- NETFLIX/SPOTIFY/ADOBE/CANAL+ → abonnements
- CARREFOUR/MONOPRIX/FRANPRIX/PICARD → courses
- DELIVEROO/UBER EATS → livraison
- Montant positif = revenu (sous "revenus")
- Montant négatif = dépense
- Si aucune sous-cat existante ne convient, crée-en une via "newCategory"
- "divers" = DERNIER RECOURS ABSOLU (retrait DAB inconnu uniquement)

Transactions :
${txList}

JSON uniquement, tableau :
[{"id":"...","categoryId":"...","confidence":0.9}]
Si nouvelle catégorie : ajoute "newCategory":{"name":"...","parentId":"..."}`,
        },
      ],
    });

    const text = message.content[0]?.type === "text" ? message.content[0].text : "[]";

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error("[classify] Could not parse JSON from response:", text.slice(0, 300));
      return transactions.map((t) => ({ id: t.id, categoryId: "divers", confidence: 0.1 }));
    }

    let results: {
      id: string;
      categoryId: string;
      confidence: number;
      newCategory?: { name: string; parentId: string };
    }[];

    try {
      results = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.error("[classify] JSON parse error:", parseErr);
      return transactions.map((t) => ({ id: t.id, categoryId: "divers", confidence: 0.1 }));
    }

    const validIds = new Set(categories.map((c) => c.id));
    const parentIds = new Set(parents.map((p) => p.id));

    const finalResults: ClassifyResult[] = [];
    const resultMap = new Map(results.map((r) => [r.id, r]));

    // Process each transaction — handle missing results (truncated response)
    for (const tx of transactions) {
      const r = resultMap.get(tx.id);
      if (!r) {
        finalResults.push({ id: tx.id, categoryId: "divers", confidence: 0.1 });
        continue;
      }

      if (r.newCategory && r.newCategory.name && r.newCategory.parentId && parentIds.has(r.newCategory.parentId)) {
        const newId = slugify(r.newCategory.name);
        if (!validIds.has(newId)) {
          const parent = categories.find((c) => c.id === r.newCategory!.parentId)!;
          const maxSort = db.prepare(
            "SELECT MAX(sort_order) as m FROM categories WHERE parent_id = ?"
          ).get(r.newCategory.parentId) as { m: number | null };
          const sortOrder = (maxSort?.m ?? parent.sort_order ?? 0) + 1;

          db.prepare(
            `INSERT OR IGNORE INTO categories (id, name, type, icon, parent_id, budget, sort_order)
             VALUES (?, ?, ?, '📋', ?, NULL, ?)`
          ).run(newId, r.newCategory.name, parent.type, r.newCategory.parentId, sortOrder);

          validIds.add(newId);
          console.log(`[classify] New subcategory: ${newId} (${r.newCategory.name}) under ${r.newCategory.parentId}`);
        }
        finalResults.push({ id: r.id, categoryId: newId, confidence: Math.max(0, Math.min(1, r.confidence)) });
      } else {
        finalResults.push({
          id: r.id,
          categoryId: validIds.has(r.categoryId) ? r.categoryId : "divers",
          confidence: Math.max(0, Math.min(1, r.confidence)),
        });
      }
    }

    return finalResults;
  } catch (err) {
    console.error("[classify] Claude API error:", err instanceof Error ? err.message : err);
    return transactions.map((t) => ({ id: t.id, categoryId: "divers", confidence: 0.1 }));
  }
}

// Learn a new rule from a user correction
export function learnRule(db: Database, pattern: string, categoryId: string) {
  const normalized = pattern.toUpperCase().slice(0, 40).trim();
  db.prepare(`
    INSERT INTO rules (pattern, category_id, use_count) VALUES (?, ?, 1)
    ON CONFLICT(pattern) DO UPDATE SET category_id = excluded.category_id, use_count = use_count + 1
  `).run(normalized, categoryId);
}
