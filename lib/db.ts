import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = path.join(process.cwd(), "flousse.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  initSchema(_db);
  return _db;
}

export function resetDb(): void {
  const db = getDb();
  // Save API key
  const apiKey = db.prepare("SELECT value FROM settings WHERE key = 'claude_api_key'").get() as { value: string } | undefined;

  // Clear all data and re-seed in one go (same connection, no close/reopen)
  db.pragma("foreign_keys = OFF");
  db.transaction(() => {
    db.prepare("DELETE FROM transactions").run();
    db.prepare("DELETE FROM rules").run();
    db.prepare("DELETE FROM settings").run();
    db.prepare("DELETE FROM accounts").run();
    db.prepare("DELETE FROM categories").run();
  })();
  db.pragma("foreign_keys = ON");

  // Re-seed directly on this connection
  seedDb(db);

  // Restore API key
  if (apiKey?.value) {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('claude_api_key', ?)").run(apiKey.value);
  }
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      bank TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT '💳',
      type TEXT NOT NULL CHECK(type IN ('liquidites','epargne','credit','carte','bourse')),
      balance REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('income','expense','transfer','dette')),
      icon TEXT NOT NULL DEFAULT '📋',
      parent_id TEXT REFERENCES categories(id),
      budget INTEGER,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id),
      date TEXT NOT NULL,
      label TEXT NOT NULL,
      amount REAL NOT NULL,
      category_id TEXT NOT NULL REFERENCES categories(id),
      confidence REAL NOT NULL DEFAULT 1.0,
      source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('rule','llm','manual')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_tx_account ON transactions(account_id);
    CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category_id);

    CREATE TABLE IF NOT EXISTS rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pattern TEXT NOT NULL UNIQUE,
      category_id TEXT NOT NULL REFERENCES categories(id),
      use_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS analyses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tab TEXT NOT NULL,
      period_from TEXT NOT NULL,
      period_to TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tab, period_from, period_to)
    );
    CREATE INDEX IF NOT EXISTS idx_analyses_tab_period ON analyses(tab, period_from, period_to);
  `);

  // Seed if empty
  const count = (db.prepare("SELECT COUNT(*) as n FROM categories").get() as { n: number }).n;
  if (count === 0) seedDb(db);
}

function seedDb(db: Database.Database) {
  // Import seed data inline (cannot import from mockData due to edge/node boundary)
  const categories = [
    // REVENUS
    { id: "revenus", name: "Revenus", type: "income", icon: "💰", parent_id: null, budget: null, sort_order: 1 },
    { id: "salaire", name: "Salaire", type: "income", icon: "💼", parent_id: "revenus", budget: null, sort_order: 2 },
    { id: "loyers", name: "Loyers", type: "income", icon: "🏠", parent_id: "revenus", budget: null, sort_order: 3 },
    { id: "allocations", name: "Allocations & aides", type: "income", icon: "👶", parent_id: "revenus", budget: null, sort_order: 4 },
    { id: "autre-revenu", name: "Autres revenus", type: "income", icon: "📥", parent_id: "revenus", budget: null, sort_order: 5 },
    // TRANSFERTS
    { id: "transferts", name: "Transferts", type: "transfer", icon: "🔄", parent_id: null, budget: null, sort_order: 10 },
    { id: "vir-joint", name: "→ Compte Joint", type: "transfer", icon: "🔄", parent_id: "transferts", budget: null, sort_order: 11 },
    { id: "vir-immo", name: "→ Compte Immo", type: "transfer", icon: "🔄", parent_id: "transferts", budget: null, sort_order: 12 },
    { id: "vir-interne", name: "Transfert interne", type: "transfer", icon: "🔄", parent_id: "transferts", budget: null, sort_order: 13 },
    // CRÉDITS
    { id: "credits", name: "Crédits", type: "dette", icon: "🏦", parent_id: null, budget: null, sort_order: 20 },
    { id: "credit-immo", name: "Crédit immobilier", type: "dette", icon: "🏦", parent_id: "credits", budget: null, sort_order: 21 },
    { id: "pret-perso", name: "Prêt personnel", type: "dette", icon: "🏦", parent_id: "credits", budget: null, sort_order: 22 },
    { id: "amex-prlv", name: "Prélèvement Amex", type: "dette", icon: "💎", parent_id: "credits", budget: null, sort_order: 23 },
    // ALIMENTATION
    { id: "alimentation", name: "Alimentation", type: "expense", icon: "🛒", parent_id: null, budget: 1100, sort_order: 30 },
    { id: "courses", name: "Courses & supermarché", type: "expense", icon: "🛒", parent_id: "alimentation", budget: 800, sort_order: 31 },
    { id: "resto", name: "Restaurants & sorties", type: "expense", icon: "🍽️", parent_id: "alimentation", budget: 400, sort_order: 32 },
    { id: "livraison", name: "Livraison repas", type: "expense", icon: "🛵", parent_id: "alimentation", budget: 150, sort_order: 33 },
    // ENFANTS
    { id: "enfants", name: "Enfants", type: "expense", icon: "👨‍👩‍👧‍👦", parent_id: null, budget: 1500, sort_order: 40 },
    { id: "garde", name: "Garde d'enfants", type: "expense", icon: "👶", parent_id: "enfants", budget: 1200, sort_order: 41 },
    { id: "enfants-activites", name: "Activités & école", type: "expense", icon: "🎒", parent_id: "enfants", budget: 150, sort_order: 42 },
    { id: "enfants-shopping", name: "Shopping enfants", type: "expense", icon: "🧸", parent_id: "enfants", budget: 150, sort_order: 43 },
    // BIEN-ÊTRE
    { id: "bien-etre", name: "Bien-être & santé", type: "expense", icon: "🌿", parent_id: null, budget: 300, sort_order: 50 },
    { id: "sante", name: "Santé & pharmacie", type: "expense", icon: "🏥", parent_id: "bien-etre", budget: 150, sort_order: 51 },
    { id: "coiffeur", name: "Coiffeur & soins", type: "expense", icon: "✂️", parent_id: "bien-etre", budget: 100, sort_order: 52 },
    { id: "sport", name: "Sport & fitness", type: "expense", icon: "🏃", parent_id: "bien-etre", budget: 50, sort_order: 53 },
    // TRANSPORTS
    { id: "transports", name: "Transports", type: "expense", icon: "🚀", parent_id: null, budget: 400, sort_order: 60 },
    { id: "transport-commun", name: "Transport en commun", type: "expense", icon: "🚇", parent_id: "transports", budget: 200, sort_order: 61 },
    { id: "taxi", name: "Taxi & VTC", type: "expense", icon: "🚕", parent_id: "transports", budget: 100, sort_order: 62 },
    { id: "voiture", name: "Voiture", type: "expense", icon: "🚗", parent_id: "transports", budget: 100, sort_order: 63 },
    // VOYAGES
    { id: "voyages", name: "Voyages & vacances", type: "expense", icon: "✈️", parent_id: null, budget: 5000, sort_order: 70 },
    { id: "transport-voyage", name: "Billets & transports", type: "expense", icon: "🛫", parent_id: "voyages", budget: null, sort_order: 71 },
    { id: "hebergement", name: "Hébergement", type: "expense", icon: "🏨", parent_id: "voyages", budget: null, sort_order: 72 },
    { id: "activites-voyage", name: "Activités & sorties", type: "expense", icon: "🗺️", parent_id: "voyages", budget: null, sort_order: 73 },
    // SHOPPING
    { id: "shopping-loisirs", name: "Shopping & loisirs", type: "expense", icon: "🛍️", parent_id: null, budget: 400, sort_order: 80 },
    { id: "shopping", name: "Shopping & maison", type: "expense", icon: "🛍️", parent_id: "shopping-loisirs", budget: 250, sort_order: 81 },
    { id: "loisirs", name: "Loisirs & culture", type: "expense", icon: "🎯", parent_id: "shopping-loisirs", budget: 150, sort_order: 82 },
    // ABONNEMENTS
    { id: "abonnements-telecom", name: "Abonnements & télécom", type: "expense", icon: "📱", parent_id: null, budget: 180, sort_order: 90 },
    { id: "telecom", name: "Télécom", type: "expense", icon: "📡", parent_id: "abonnements-telecom", budget: 80, sort_order: 91 },
    { id: "abonnements", name: "Abonnements numériques", type: "expense", icon: "📦", parent_id: "abonnements-telecom", budget: 100, sort_order: 92 },
    // LOGEMENT
    { id: "logement", name: "Logement & charges", type: "expense", icon: "🏠", parent_id: null, budget: 300, sort_order: 100 },
    { id: "copro", name: "Copro & syndic", type: "expense", icon: "🏢", parent_id: "logement", budget: 150, sort_order: 101 },
    { id: "securite", name: "Sécurité (Verisure)", type: "expense", icon: "🔐", parent_id: "logement", budget: 50, sort_order: 102 },
    { id: "assurance", name: "Assurance", type: "expense", icon: "🛡️", parent_id: "logement", budget: 100, sort_order: 103 },
    // FINANCES
    { id: "finances-admin", name: "Finances & admin", type: "expense", icon: "📋", parent_id: null, budget: 100, sort_order: 110 },
    { id: "impots", name: "Impôts & taxes", type: "expense", icon: "🏛️", parent_id: "finances-admin", budget: null, sort_order: 111 },
    { id: "frais-bancaires", name: "Frais bancaires", type: "expense", icon: "🏧", parent_id: "finances-admin", budget: 20, sort_order: 112 },
    { id: "comptable-avocat", name: "Comptable & juridique", type: "expense", icon: "⚖️", parent_id: "finances-admin", budget: null, sort_order: 113 },
    // DIVERS
    { id: "divers", name: "Divers / Non classé", type: "expense", icon: "❓", parent_id: null, budget: null, sort_order: 999 },
  ];

  const accounts = [
    { id: "hb-perso", name: "Compte Courant", bank: "Hello Bank", icon: "💳", type: "liquidites", balance: 1585 },
    { id: "hb-immo", name: "Compte Immo", bank: "Hello Bank", icon: "🏠", type: "liquidites", balance: 454 },
    { id: "hb-adele", name: "Adèle", bank: "Hello Bank", icon: "👧", type: "liquidites", balance: 13100 },
    { id: "hb-gabrielle", name: "Gabrielle", bank: "Hello Bank", icon: "👶", type: "liquidites", balance: 5230 },
    { id: "hb-cautions", name: "Cautions Immo", bank: "Hello Bank", icon: "🔒", type: "epargne", balance: 634 },
    { id: "hb-impots", name: "Impôts", bank: "Hello Bank", icon: "📋", type: "epargne", balance: 1954 },
    { id: "hb-livretA-adele", name: "Livret A Adèle", bank: "Hello Bank", icon: "🐷", type: "epargne", balance: 24682 },
    { id: "hb-livretA-gabrielle", name: "Livret A Gabrielle", bank: "Hello Bank", icon: "🐷", type: "epargne", balance: 18170 },
    { id: "hb-credit1", name: "Crédit Lille 40m²", bank: "Hello Bank", icon: "🏦", type: "credit", balance: -112945 },
    { id: "hb-credit2", name: "Crédit Lille 19m²", bank: "Hello Bank", icon: "🏦", type: "credit", balance: -76552 },
    { id: "hb-pretperso", name: "Prêt personnel", bank: "Hello Bank", icon: "🏦", type: "credit", balance: -4862 },
    { id: "ccf-perso", name: "Compte Chèques", bank: "CCF", icon: "💳", type: "liquidites", balance: 1442 },
    { id: "ccf-joint", name: "Compte Joint", bank: "CCF", icon: "👫", type: "liquidites", balance: 3804 },
    { id: "ccf-ldds", name: "LDDS", bank: "CCF", icon: "📈", type: "epargne", balance: 208 },
    { id: "ccf-pea", name: "PEA", bank: "CCF", icon: "📊", type: "bourse", balance: 1202 },
    { id: "amex", name: "Amex Gold AF-KLM", bank: "Amex", icon: "💎", type: "carte", balance: -22 },
  ];

  const transactions = [
    { id: "t1", account_id: "hb-perso", date: "2026-03-05", label: "VIREMENT SINEQUA SALAIRE MARS", amount: 4850, category_id: "salaire", confidence: 1.0, source: "rule" },
    { id: "t2", account_id: "ccf-joint", date: "2026-03-06", label: "CAF DES HAUTS DE SEINE", amount: 310, category_id: "allocations", confidence: 1.0, source: "rule" },
    { id: "t3", account_id: "hb-perso", date: "2026-03-08", label: "ECHEANCE PRET 61123486 CREDIT IMMO", amount: -906.92, category_id: "credit-immo", confidence: 1.0, source: "rule" },
    { id: "t4", account_id: "hb-perso", date: "2026-03-08", label: "ECHEANCE PRET 60837505 CREDIT IMMO 2", amount: -562.39, category_id: "credit-immo", confidence: 1.0, source: "rule" },
    { id: "t5", account_id: "hb-perso", date: "2026-03-08", label: "ECHEANCE PRET 62043046 PRET PERSO", amount: -184.52, category_id: "pret-perso", confidence: 1.0, source: "rule" },
    { id: "t6", account_id: "hb-perso", date: "2026-03-07", label: "VIR SEPA COMPTE JOINT MARS", amount: -1200, category_id: "vir-joint", confidence: 1.0, source: "rule" },
    { id: "t7", account_id: "ccf-joint", date: "2026-03-03", label: "CARTE 03/03 CARREFOUR MARKET NEUILLY", amount: -87.40, category_id: "courses", confidence: 1.0, source: "rule" },
    { id: "t8", account_id: "ccf-joint", date: "2026-03-05", label: "CARTE 05/03 DELIVEROO PARIS", amount: -34.90, category_id: "livraison", confidence: 1.0, source: "rule" },
    { id: "t9", account_id: "ccf-joint", date: "2026-03-06", label: "CARTE 06/03 FRANPRIX RUE AMPERE", amount: -52.20, category_id: "courses", confidence: 1.0, source: "rule" },
    { id: "t10", account_id: "ccf-joint", date: "2026-03-08", label: "PRELEVEMENT LPCR GARDE ENFANTS FEV", amount: -1180, category_id: "garde", confidence: 1.0, source: "rule" },
    { id: "t11", account_id: "ccf-joint", date: "2026-03-10", label: "CARTE 10/03 WAZI RESTAURANT PARIS 8", amount: -67.50, category_id: "resto", confidence: 1.0, source: "rule" },
    { id: "t12", account_id: "ccf-joint", date: "2026-03-11", label: "CARTE 11/03 PICARD SURGELÉS NEUILLY", amount: -44.10, category_id: "courses", confidence: 1.0, source: "rule" },
    { id: "t13", account_id: "ccf-joint", date: "2026-03-12", label: "CARTE 12/03 UBER EATS PARIS", amount: -28.50, category_id: "livraison", confidence: 1.0, source: "rule" },
    { id: "t14", account_id: "ccf-joint", date: "2026-03-13", label: "CARTE 13/03 MON-MARCHE.FR", amount: -119.80, category_id: "courses", confidence: 1.0, source: "rule" },
    { id: "t15", account_id: "hb-perso", date: "2026-03-10", label: "CARTE 10/03 SERVICE NAVIGO RATP", amount: -86.40, category_id: "transport-commun", confidence: 1.0, source: "rule" },
    { id: "t16", account_id: "hb-perso", date: "2026-03-12", label: "CARTE 12/03 IZIVIA RECHARGE VE", amount: -24.60, category_id: "voiture", confidence: 1.0, source: "rule" },
    { id: "t17", account_id: "hb-perso", date: "2026-03-01", label: "PRELEVEMENT BOUYGUES TELECOM", amount: -29.99, category_id: "telecom", confidence: 1.0, source: "rule" },
    { id: "t18", account_id: "hb-perso", date: "2026-03-01", label: "PRELEVEMENT VERISURE SECURITE", amount: -49.90, category_id: "securite", confidence: 1.0, source: "rule" },
    { id: "t19", account_id: "hb-perso", date: "2026-03-02", label: "PRELEVEMENT APPLE.COM/BILL", amount: -14.99, category_id: "abonnements", confidence: 1.0, source: "rule" },
    { id: "t20", account_id: "hb-perso", date: "2026-03-02", label: "PRELEVEMENT AMERICAN EXPRESS", amount: -380, category_id: "amex-prlv", confidence: 1.0, source: "rule" },
    { id: "t21", account_id: "hb-perso", date: "2026-03-11", label: "VIREMENT VACHERAND SYNDIC COPRO", amount: -280, category_id: "copro", confidence: 1.0, source: "rule" },
    { id: "t22", account_id: "hb-perso", date: "2026-03-14", label: "CARTE 14/03 G7 TAXI PARIS", amount: -22.80, category_id: "taxi", confidence: 0.95, source: "rule" },
    { id: "t23", account_id: "hb-perso", date: "2026-03-13", label: "CARTE 13/03 SAEMES PARKING TERNES", amount: -18.00, category_id: "voiture", confidence: 0.95, source: "rule" },
    { id: "t24", account_id: "ccf-joint", date: "2026-03-14", label: "CARTE 14/03 SAS JADE PARIS 17", amount: -156.00, category_id: "divers", confidence: 0.3, source: "llm" },
    { id: "t25", account_id: "hb-perso", date: "2026-03-14", label: "PRELEVEMENT LEETCHI MGP", amount: -25.00, category_id: "divers", confidence: 0.4, source: "llm" },
    { id: "t26", account_id: "amex", date: "2026-03-04", label: "RESTAURANT BAAN LAO PARIS 8", amount: -89.00, category_id: "resto", confidence: 1.0, source: "rule" },
    { id: "t27", account_id: "amex", date: "2026-03-07", label: "AMAZON PRIME", amount: -6.99, category_id: "abonnements", confidence: 1.0, source: "rule" },
    { id: "t28", account_id: "amex", date: "2026-03-09", label: "ZARA HOME PARIS", amount: -124.00, category_id: "shopping", confidence: 1.0, source: "rule" },
    { id: "t29", account_id: "amex", date: "2026-03-11", label: "ADOBE CREATIVE CLOUD", amount: -54.99, category_id: "abonnements", confidence: 1.0, source: "rule" },
  ];

  const rules = [
    { pattern: "CARREFOUR MARKET", category_id: "courses" },
    { pattern: "DELIVEROO", category_id: "livraison" },
    { pattern: "UBER EATS", category_id: "livraison" },
    { pattern: "LPCR", category_id: "garde" },
    { pattern: "VACHERAND SYNDIC", category_id: "copro" },
    { pattern: "SAEMES PARKING", category_id: "voiture" },
    { pattern: "IZIVIA RECHARGE", category_id: "voiture" },
    { pattern: "G7 TAXI", category_id: "taxi" },
    { pattern: "NAVIGO RATP", category_id: "transport-commun" },
    { pattern: "BOUYGUES TELECOM", category_id: "telecom" },
    { pattern: "VERISURE", category_id: "securite" },
    { pattern: "APPLE.COM/BILL", category_id: "abonnements" },
    { pattern: "AMERICAN EXPRESS", category_id: "amex-prlv" },
    { pattern: "SINEQUA SALAIRE", category_id: "salaire" },
    { pattern: "CAF DES HAUTS", category_id: "allocations" },
    { pattern: "ECHEANCE PRET 61123486", category_id: "credit-immo" },
    { pattern: "ECHEANCE PRET 60837505", category_id: "credit-immo" },
    { pattern: "ECHEANCE PRET 62043046", category_id: "pret-perso" },
    { pattern: "COMPTE JOINT", category_id: "vir-joint" },
    { pattern: "FRANPRIX", category_id: "courses" },
    { pattern: "PICARD SURGELES", category_id: "courses" },
    { pattern: "MON-MARCHE.FR", category_id: "courses" },
    { pattern: "AMAZON PRIME", category_id: "abonnements" },
    { pattern: "ADOBE CREATIVE", category_id: "abonnements" },
  ];

  const insertCat = db.prepare(`INSERT OR IGNORE INTO categories (id, name, type, icon, parent_id, budget, sort_order) VALUES (@id, @name, @type, @icon, @parent_id, @budget, @sort_order)`);
  const insertAcc = db.prepare(`INSERT OR IGNORE INTO accounts (id, name, bank, icon, type, balance) VALUES (@id, @name, @bank, @icon, @type, @balance)`);
  const insertTx = db.prepare(`INSERT OR IGNORE INTO transactions (id, account_id, date, label, amount, category_id, confidence, source) VALUES (@id, @account_id, @date, @label, @amount, @category_id, @confidence, @source)`);
  const insertRule = db.prepare(`INSERT OR IGNORE INTO rules (pattern, category_id) VALUES (@pattern, @category_id)`);

  db.transaction(() => {
    for (const c of categories) insertCat.run(c);
    for (const a of accounts) insertAcc.run(a);
    for (const t of transactions) insertTx.run(t);
    for (const r of rules) insertRule.run(r);
  })();
}
