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

// ── Built-in rule types ─────────────────────────────────────────────────────
interface BuiltinRule {
  /** Pattern to match against the label — plain substring or regex (use .* for wildcards) */
  pattern: string;
  /** Target category when the rule matches */
  categoryId: string;
  /** If set, the amount must be > this value for the rule to match (exclusive) */
  minAmount?: number;
  /** If set, the amount must be < this value for the rule to match (exclusive) */
  maxAmount?: number;
  /** If true, pattern is treated as a regex; otherwise as a plain substring */
  regex?: boolean;
  /** Extra label condition: label must also contain this substring (case-insensitive) */
  labelContains?: string;
}

// ── Built-in rules for common merchants (applied before DB rules) ──────────
// Rules are evaluated top-to-bottom; first match wins.
// More specific rules (with amount/regex conditions) should come before generic ones.
const BUILTIN_RULES: BuiltinRule[] = [
  // ── Boulangerie (before generic courses) ──
  { pattern: "FOURNIL", categoryId: "boulangerie" },
  { pattern: "BOULANGERIE", categoryId: "boulangerie" },
  { pattern: "GRAIN D.OR", categoryId: "boulangerie", regex: true },

  // ── Courses (groceries) ──
  { pattern: "CARREFOURMARKET", categoryId: "courses" },
  { pattern: "MON-MARCHE", categoryId: "courses" },
  { pattern: "PICARD", categoryId: "courses" },
  { pattern: "FABLES.*FROMAGE", categoryId: "courses", regex: true },
  { pattern: "POINT CENTRAL", categoryId: "courses" },
  { pattern: "BOUCHERIE BAGATE", categoryId: "courses" },
  { pattern: "FERME DE WIND", categoryId: "courses" },
  { pattern: "HELLOFRESH", categoryId: "courses" },
  { pattern: "INTERCAVES", categoryId: "courses" },
  { pattern: "GOURMAND CROQUANT", categoryId: "courses" },
  { pattern: "MONOPRIX", categoryId: "courses" },
  { pattern: "AUCHAN", categoryId: "courses" },
  { pattern: "LECLERC", categoryId: "courses" },
  { pattern: "LIDL", categoryId: "courses" },
  { pattern: "INTERMARCHE", categoryId: "courses" },
  { pattern: "CASINO", categoryId: "courses" },
  { pattern: "BIOCOOP", categoryId: "courses" },
  { pattern: "NATURALIA", categoryId: "courses" },
  { pattern: "GRAND FRAIS", categoryId: "courses" },
  { pattern: "FRANPRIX", categoryId: "courses" },

  // ── Snacking & distributeurs ──
  { pattern: "DISTRIBUTEUR", categoryId: "snacking" },
  { pattern: "AUTOMATE", categoryId: "snacking" },

  // ── Restaurants ──
  { pattern: "WAZI", categoryId: "resto" },
  { pattern: "MOUSQUETAIRE", categoryId: "resto" },
  { pattern: "RELAIS ST CLOUD", categoryId: "resto" },
  { pattern: "CHEZ PAPA", categoryId: "resto" },
  { pattern: "BAAN LAO", categoryId: "resto" },
  { pattern: "DAMMANN", categoryId: "resto" },
  { pattern: "PPGMICHALAK", categoryId: "resto" },
  { pattern: "RESTAURANT", categoryId: "resto" },
  { pattern: "BRASSERIE", categoryId: "resto" },
  { pattern: "SUSHI", categoryId: "resto" },
  { pattern: "MCDONALDS", categoryId: "resto" },
  { pattern: "BURGER KING", categoryId: "resto" },
  { pattern: "STARBUCKS", categoryId: "resto" },

  // ── Garde d'enfants ──
  { pattern: "LPCR", categoryId: "garde" },
  { pattern: "KINOUGARDE", categoryId: "garde" },
  { pattern: "URSSAF.*CNCESU", categoryId: "garde", regex: true },
  { pattern: "CNCESU", categoryId: "garde" },

  // ── Voiture : recharge électrique (SHELL EV before generic SHELL) ──
  { pattern: "IZIVIA", categoryId: "voiture-recharge" },
  { pattern: "CHARGEMAP", categoryId: "voiture-recharge" },
  { pattern: "SHELL EV", categoryId: "voiture-recharge" },
  { pattern: "TESLA", categoryId: "voiture-recharge" },
  { pattern: "FASTNED", categoryId: "voiture-recharge" },
  { pattern: "IONITY", categoryId: "voiture-recharge" },

  // ── Voiture : péage ──
  { pattern: "BIPANDGO", categoryId: "voiture-peage" },
  { pattern: "AUTOROUTE", categoryId: "voiture-peage" },

  // ── Voiture : parking ──
  { pattern: "INDIGO", categoryId: "voiture-parking" },
  { pattern: "SAEMES", categoryId: "voiture-parking" },
  { pattern: "EASYPARK", categoryId: "voiture-parking" },
  { pattern: "STATTELPAYBYPHO", categoryId: "voiture-parking" },
  { pattern: "PARKING", categoryId: "voiture-parking" },

  // ── Voiture : carburant & entretien ──
  { pattern: "TOTAL ENERGIES", categoryId: "voiture-carburant" },
  { pattern: "TOTAL", categoryId: "voiture-carburant" },
  { pattern: "SHELL", categoryId: "voiture-carburant" },
  { pattern: "ESSO", categoryId: "voiture-carburant" },

  // ── Taxi ──
  { pattern: "G7", categoryId: "taxi" },
  { pattern: "UBER ", categoryId: "taxi" },
  { pattern: "BOLT", categoryId: "taxi" },
  { pattern: "KAPTEN", categoryId: "taxi" },

  // ── Sécurité / copro / conseil ──
  { pattern: "VERISURE", categoryId: "securite" },
  { pattern: "VACHERAND", categoryId: "copro" },
  { pattern: "AJM CONSEIL", categoryId: "comptable-avocat" },
  { pattern: "VDOUBLEV", categoryId: "comptable-avocat" },

  // ── Salaire (amount-conditional: only if amount > 1000) ──
  { pattern: "SINEQUA", categoryId: "salaire", minAmount: 1000 },
  { pattern: "CHAPSVISION", categoryId: "salaire", minAmount: 1000 },
  { pattern: "CIC.*CHAPSVISION", categoryId: "salaire", minAmount: 1000, regex: true },

  // ── Allocations / impôts (sign-dependent: positive = revenu, negative = impots) ──
  { pattern: "CAF DES HAUTS", categoryId: "allocations", minAmount: 0 },
  { pattern: "D.G.F.I.P.*IMPOT", categoryId: "autre-revenu", minAmount: 0, regex: true },
  { pattern: "D.G.F.I.P.*IMPOT", categoryId: "impots-ir", maxAmount: 0, regex: true },

  // ── Crédits / prêts (specific loan numbers before generic ECHEANCE PRET) ──
  { pattern: "ECHEANCE PRET.*61123486", categoryId: "credit-immo", regex: true },
  { pattern: "ECHEANCE PRET.*60837505", categoryId: "credit-immo", regex: true },
  { pattern: "ECHEANCE PRET.*62043046", categoryId: "pret-perso", regex: true },
  { pattern: "ECHEANCE PRET", categoryId: "credit-immo" },

  // ── Virements internes ──
  { pattern: "COMPTE JOINT", categoryId: "vir-joint", maxAmount: 0 },
  { pattern: "EFFORT PRET IMMOBILIER", categoryId: "vir-immo" },
  { pattern: "REMISE A FLOT", categoryId: "vir-immo" },
  { pattern: "MISE SECURITE", categoryId: "vir-immo" },
  { pattern: "AIDE MANQUE", categoryId: "vir-immo" },
  { pattern: "GABRIELLE", categoryId: "vir-interne", maxAmount: 0, labelContains: "VIR" },

  // ── Carte AMEX ──
  { pattern: "AMERICAN EXPRESS", categoryId: "amex-prlv" },

  // ── Frais bancaires ──
  { pattern: "FRAIS DE NON.*EXECUTION", categoryId: "frais-bancaires", regex: true },
  { pattern: "FRAIS DE LETTRE", categoryId: "frais-bancaires" },
  { pattern: "COMMISSIONS", categoryId: "frais-bancaires" },
  { pattern: "INTERETS.*DEBITEURS", categoryId: "frais-bancaires", regex: true },
  { pattern: "MINIMUM FORFAITAIRE", categoryId: "frais-bancaires" },

  // ── Streaming & apps ──
  { pattern: "SEONI", categoryId: "streaming" },
  { pattern: "NETFLIX", categoryId: "streaming" },
  { pattern: "SPOTIFY", categoryId: "streaming" },
  { pattern: "DISNEY PLUS", categoryId: "streaming" },
  { pattern: "CANAL+", categoryId: "streaming" },
  { pattern: "CANAL PLUS", categoryId: "streaming" },
  { pattern: "APPLE.COM/BILL", categoryId: "streaming" },
  { pattern: "ADOBE", categoryId: "streaming" },
  { pattern: "MICROSOFT", categoryId: "streaming" },
  { pattern: "GOOGLE STORAGE", categoryId: "streaming" },
  { pattern: "AMAZON PRIME", categoryId: "streaming" },

  // ── Assurances ──
  { pattern: "CARDIF IARD", categoryId: "assurance" },
  { pattern: "SPB.*ASSURANCE", categoryId: "assurance", regex: true },

  // ── Amendes & PV ──
  { pattern: "WEB AMENDE", categoryId: "amendes" },
  { pattern: "AMENDE", categoryId: "amendes" },

  // ── Taxes ──
  { pattern: "TAXE FONCIERE", categoryId: "taxe-fonciere" },
  { pattern: "TIMBRE FISCAL", categoryId: "autres-taxes" },

  // ── Santé : médecin ──
  { pattern: "DR STRUK", categoryId: "medecin" },
  { pattern: "DR VILLAIN", categoryId: "medecin" },
  { pattern: "MEDECIN", categoryId: "medecin" },
  { pattern: "DOCTEUR", categoryId: "medecin" },
  { pattern: "LABO", categoryId: "medecin" },

  // ── Santé : pharmacie ──
  { pattern: "MY PHARMA", categoryId: "pharmacie" },
  { pattern: "PHARMACIE", categoryId: "pharmacie" },

  // ── Santé : spa ──
  { pattern: "SPA", categoryId: "spa" },
  { pattern: "HAMMAM", categoryId: "spa" },
  { pattern: "MASSAGE", categoryId: "spa" },

  // ── Remboursements santé ──
  { pattern: "CPAM", categoryId: "remboursements" },
  { pattern: "AMELI", categoryId: "remboursements" },

  // ── Cadeaux & dons ──
  { pattern: "CADEAU", categoryId: "cadeaux" },
  { pattern: "LEETCHI", categoryId: "cadeaux" },
  { pattern: "MGP", categoryId: "cadeaux" },
  { pattern: "EGLISE", categoryId: "dons" },
  { pattern: "CHARITE", categoryId: "dons" },

  // ── Vêtements ──
  { pattern: "ZARA", categoryId: "vetements" },
  { pattern: "H&M", categoryId: "vetements" },
  { pattern: "UNIQLO", categoryId: "vetements" },

  // ── Maison & déco (AMAZON PRIME already matched above) ──
  { pattern: "AMAZON", categoryId: "maison-deco" },
  { pattern: "FNAC", categoryId: "maison-deco" },
  { pattern: "DARTY", categoryId: "maison-deco" },
  { pattern: "IKEA", categoryId: "maison-deco" },
  { pattern: "LEROY MERLIN", categoryId: "maison-deco" },
  { pattern: "CASTORAMA", categoryId: "maison-deco" },

  // ── Sport ──
  { pattern: "DECATHLON", categoryId: "sport" },

  // ── Livraison ──
  { pattern: "DELIVEROO", categoryId: "livraison" },
  { pattern: "UBER EATS", categoryId: "livraison" },
  { pattern: "JUST EAT", categoryId: "livraison" },

  // ── Transport en commun ──
  { pattern: "NAVIGO", categoryId: "transport-commun" },
  { pattern: "RATP", categoryId: "transport-commun" },
  { pattern: "SNCF", categoryId: "transport-commun" },

  // ── Telecom ──
  { pattern: "BOUYGUES TELECOM", categoryId: "telecom" },
  { pattern: "SFR", categoryId: "telecom" },
  { pattern: "FREE MOBILE", categoryId: "telecom" },
  { pattern: "ORANGE", categoryId: "telecom" },

  // ── Logement (énergie) ──
  { pattern: "EDF", categoryId: "logement" },
  { pattern: "ENGIE", categoryId: "logement" },

  // ── Retraits DAB ──
  { pattern: "RETRAIT DAB", categoryId: "retraits" },
  { pattern: "RET DAB", categoryId: "retraits" },

  // ── Revenus (generic, after specific salary/allocation rules) ──
  { pattern: "SALAIRE", categoryId: "salaire" },
  { pattern: "CAF ", categoryId: "allocations" },
  { pattern: "POLE EMPLOI", categoryId: "allocations" },
  { pattern: "FRANCE TRAVAIL", categoryId: "allocations" },
];

// Pre-compile regex rules at module load time for performance
const _compiledRegexCache = new Map<string, RegExp>();
function getCompiledRegex(pattern: string): RegExp {
  let re = _compiledRegexCache.get(pattern);
  if (!re) {
    re = new RegExp(pattern, "i");
    _compiledRegexCache.set(pattern, re);
  }
  return re;
}

/** Check if a single builtin rule matches the given label and amount */
function matchesRule(rule: BuiltinRule, upper: string, amount: number): boolean {
  // 1. Check pattern (substring or regex)
  if (rule.regex) {
    if (!getCompiledRegex(rule.pattern).test(upper)) return false;
  } else {
    if (!upper.includes(rule.pattern)) return false;
  }

  // 2. Check amount conditions (minAmount = exclusive lower bound, maxAmount = exclusive upper bound)
  if (rule.minAmount !== undefined && amount <= rule.minAmount) return false;
  if (rule.maxAmount !== undefined && amount >= rule.maxAmount) return false;

  // 3. Check extra label-contains condition
  if (rule.labelContains && !upper.includes(rule.labelContains.toUpperCase())) return false;

  return true;
}

// Apply rules from DB — returns categoryId or null
export function applyRules(db: Database, label: string, amount: number = 0): string | null {
  const upper = label.toUpperCase();

  // 1. Check built-in rules first (top-to-bottom, first match wins)
  for (const rule of BUILTIN_RULES) {
    if (matchesRule(rule, upper, amount)) {
      return rule.categoryId;
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
const CONCURRENCY = 5;

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

  // Split into batches
  const batches: TxToClassify[][] = [];
  for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
    batches.push(transactions.slice(i, i + BATCH_SIZE));
  }

  // Run batches in parallel with a concurrency limit
  const allResults: ClassifyResult[][] = new Array(batches.length);
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const chunk = batches.slice(i, i + CONCURRENCY);
    const chunkResults = await Promise.all(
      chunk.map((batch) => classifyBatch(db, batch, catTree, categories, parents, apiKey))
    );
    chunkResults.forEach((r, j) => { allResults[i + j] = r; });
  }
  const flatResults = allResults.flat();

  // Auto-create rules for high-confidence classifications
  for (const r of flatResults) {
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

  return flatResults;
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
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: `Catégorise ces transactions bancaires françaises.

Catégories :
${catTree}

RÈGLES STRICTES :
- AMAZON/FNAC/DARTY/IKEA → maison-deco
- ZARA/H&M/UNIQLO → vetements
- NETFLIX/SPOTIFY/ADOBE/CANAL+ → streaming
- CARREFOUR/MONOPRIX/FRANPRIX/PICARD → courses
- BOULANGERIE/FOURNIL → boulangerie
- DELIVEROO/UBER EATS → livraison
- IZIVIA/SHELL EV/TESLA/IONITY → voiture-recharge
- SAEMES/INDIGO/EASYPARK/PARKING → voiture-parking
- BIPANDGO/AUTOROUTE → voiture-peage
- SHELL/TOTAL/ESSO → voiture-carburant
- PHARMACIE → pharmacie, DOCTEUR/MEDECIN → medecin
- CPAM/AMELI → remboursements (revenu)
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
