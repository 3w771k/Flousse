import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = path.join(process.cwd(), "flousse.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initSchema(db);
  _db = db;
  return _db;
}

export function resetDb(): void {
  const db = getDb();
  // Save API key and immo settings
  const savedSettings = db.prepare("SELECT key, value FROM settings WHERE key IN ('claude_api_key', 'immo_sci', 'immo_lille40', 'immo_lille19')").all() as { key: string; value: string }[];

  // Clear all data and re-seed in one go (same connection, no close/reopen)
  db.pragma("foreign_keys = OFF");
  db.transaction(() => {
    db.prepare("DELETE FROM transactions").run();
    db.prepare("DELETE FROM rules").run();
    db.prepare("DELETE FROM settings").run();
    db.prepare("DELETE FROM accounts").run();
    db.prepare("DELETE FROM categories").run();
    db.prepare("DELETE FROM analyses").run();
  })();
  db.pragma("foreign_keys = ON");

  // Re-seed directly on this connection
  seedDb(db);

  // Restore saved settings
  for (const s of savedSettings) {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(s.key, s.value);
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
      seed_balance REAL NOT NULL DEFAULT 0,
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
      real_date TEXT,
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

  // Migrations for existing databases
  const txCols = db.prepare("PRAGMA table_info(transactions)").all() as { name: string }[];
  if (!txCols.some((c) => c.name === "real_date")) {
    db.exec("ALTER TABLE transactions ADD COLUMN real_date TEXT");
  }

  const accCols = db.prepare("PRAGMA table_info(accounts)").all() as { name: string }[];
  if (!accCols.some((c) => c.name === "seed_balance")) {
    db.exec("ALTER TABLE accounts ADD COLUMN seed_balance REAL NOT NULL DEFAULT 0");
    // Infer seed_balance = actual balance - SUM(transactions) for each account
    db.exec(`
      UPDATE accounts SET seed_balance = (
        SELECT balance - COALESCE(SUM(t.amount), 0)
        FROM transactions t WHERE t.account_id = accounts.id
      )
    `);
  }

  // Seed credit metadata for existing DBs (INSERT OR IGNORE is safe)
  const creditSettings = [
    { key: "credit_hb-credit1_mensualite", value: "906.92" },
    { key: "credit_hb-credit1_taux", value: "1.72" },
    { key: "credit_hb-credit1_fin", value: "2037-11" },
    { key: "credit_hb-credit1_montant_initial", value: "181000" },
    { key: "credit_hb-credit2_mensualite", value: "562.39" },
    { key: "credit_hb-credit2_taux", value: "1.40" },
    { key: "credit_hb-credit2_fin", value: "2039-01" },
    { key: "credit_hb-credit2_montant_initial", value: "113700" },
    { key: "credit_hb-pretperso_mensualite", value: "184.52" },
    { key: "credit_hb-pretperso_taux", value: "5.08" },
    { key: "credit_hb-pretperso_fin", value: "2028-07" },
    { key: "credit_hb-pretperso_montant_initial", value: "8000" },
  ];
  const insertCreditSetting = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
  for (const s of creditSettings) insertCreditSetting.run(s.key, s.value);

  // ── Category arborescence v2 migration ──
  const oldCatV1 = db.prepare("SELECT id FROM categories WHERE id = 'bien-etre'").get();
  if (oldCatV1) {
    db.pragma("foreign_keys = OFF");
    db.transaction(() => {
      // Voiture split (specific labels first, then default to recharge)
      db.exec(`UPDATE transactions SET category_id = 'voiture-parking' WHERE category_id = 'voiture' AND (UPPER(label) LIKE '%PARKING%' OR UPPER(label) LIKE '%SAEMES%' OR UPPER(label) LIKE '%INDIGO%' OR UPPER(label) LIKE '%EASYPARK%' OR UPPER(label) LIKE '%STATIONNEMENT%')`);
      db.exec(`UPDATE transactions SET category_id = 'voiture-peage' WHERE category_id = 'voiture' AND (UPPER(label) LIKE '%BIPANDGO%' OR UPPER(label) LIKE '%PEAGE%' OR UPPER(label) LIKE '%AUTOROUTE%')`);
      db.exec(`UPDATE transactions SET category_id = 'voiture-carburant' WHERE category_id = 'voiture' AND (UPPER(label) LIKE '%ESSO%' OR UPPER(label) LIKE '%CARBURANT%' OR UPPER(label) LIKE '%TOTAL%' OR (UPPER(label) LIKE '%SHELL%' AND UPPER(label) NOT LIKE '%SHELL EV%'))`);
      db.exec("UPDATE transactions SET category_id = 'voiture-recharge' WHERE category_id = 'voiture'");
      // Renamed category IDs
      db.exec("UPDATE transactions SET category_id = 'esthetique' WHERE category_id = 'coiffeur'");
      db.exec("UPDATE transactions SET category_id = 'pharmacie' WHERE category_id = 'sante'");
      db.exec("UPDATE transactions SET category_id = 'streaming' WHERE category_id = 'abonnements'");
      db.exec("UPDATE transactions SET category_id = 'maison-deco' WHERE category_id = 'shopping'");
      db.exec("UPDATE transactions SET category_id = 'impots-ir' WHERE category_id = 'impots'");
      // Rules table
      db.exec("UPDATE rules SET category_id = 'esthetique' WHERE category_id = 'coiffeur'");
      db.exec("UPDATE rules SET category_id = 'pharmacie' WHERE category_id = 'sante'");
      db.exec("UPDATE rules SET category_id = 'streaming' WHERE category_id = 'abonnements'");
      db.exec("UPDATE rules SET category_id = 'maison-deco' WHERE category_id = 'shopping'");
      db.exec("UPDATE rules SET category_id = 'impots-ir' WHERE category_id = 'impots'");
      db.exec("UPDATE rules SET category_id = 'voiture-recharge' WHERE category_id = 'voiture'");
      // Rebuild categories from scratch
      db.exec("DELETE FROM categories");
    })();
    seedDb(db);
    // Fix any orphaned references (e.g. Claude-created subcategories)
    db.exec("UPDATE transactions SET category_id = 'divers' WHERE category_id NOT IN (SELECT id FROM categories)");
    db.exec("DELETE FROM rules WHERE category_id NOT IN (SELECT id FROM categories)");
    db.pragma("foreign_keys = ON");
  }

  // ── v3: Clean up ghost categories created by LLM classification ──
  // The classify prompt used to allow Claude to create new subcategories.
  // This migration removes those ghost categories and reassigns their transactions to "divers".
  const ghostCount = (db.prepare(`
    SELECT COUNT(*) as n FROM categories WHERE icon = '📋' AND id != 'finances-admin'
  `).get() as { n: number }).n;
  if (ghostCount > 0) {
    db.pragma("foreign_keys = OFF");
    db.transaction(() => {
      // Reassign transactions pointing to ghost categories → divers
      db.exec(`
        UPDATE transactions SET category_id = 'divers'
        WHERE category_id IN (
          SELECT id FROM categories WHERE icon = '📋' AND id != 'finances-admin'
        )
      `);
      // Remove rules pointing to ghost categories
      db.exec(`
        DELETE FROM rules WHERE category_id IN (
          SELECT id FROM categories WHERE icon = '📋' AND id != 'finances-admin'
        )
      `);
      // Delete the ghost categories themselves
      db.exec("DELETE FROM categories WHERE icon = '📋' AND id != 'finances-admin'");
    })();
    db.pragma("foreign_keys = ON");
    console.log(`[db] v3 migration: removed ${ghostCount} ghost categories`);
  }

  // ── v4: Add "energie" subcategory under logement ──
  const hasEnergie = db.prepare("SELECT id FROM categories WHERE id = 'energie'").get();
  if (!hasEnergie) {
    db.prepare(
      `INSERT OR IGNORE INTO categories (id, name, type, icon, parent_id, budget, sort_order)
       VALUES ('energie', 'Énergie (EDF, Engie)', 'expense', '⚡', 'logement', 150, 54)`
    ).run();
    // Move transactions assigned directly to parent "logement" → "energie"
    const moved = db.prepare("UPDATE transactions SET category_id = 'energie' WHERE category_id = 'logement'").run();
    db.prepare("UPDATE rules SET category_id = 'energie' WHERE category_id = 'logement'").run();
    console.log(`[db] v4 migration: created "energie" category, moved ${moved.changes} transactions`);
  }

  // Seed if empty
  const count = (db.prepare("SELECT COUNT(*) as n FROM categories").get() as { n: number }).n;
  if (count === 0) seedDb(db);
}

function seedDb(db: Database.Database) {
  const categories = [
    // REVENUS
    { id: "revenus", name: "Revenus", type: "income", icon: "💰", parent_id: null, budget: null, sort_order: 1 },
    { id: "salaire", name: "Salaire", type: "income", icon: "💼", parent_id: "revenus", budget: null, sort_order: 2 },
    { id: "loyers", name: "Loyers", type: "income", icon: "🏠", parent_id: "revenus", budget: null, sort_order: 3 },
    { id: "allocations", name: "Allocations & aides (CAF)", type: "income", icon: "👶", parent_id: "revenus", budget: null, sort_order: 4 },
    { id: "remboursements", name: "Remboursements & crédits d'impôt", type: "income", icon: "💸", parent_id: "revenus", budget: null, sort_order: 5 },
    { id: "autre-revenu", name: "Autres revenus", type: "income", icon: "📥", parent_id: "revenus", budget: null, sort_order: 6 },
    // TRANSFERTS
    { id: "transferts", name: "Transferts", type: "transfer", icon: "🔄", parent_id: null, budget: null, sort_order: 10 },
    { id: "vir-joint", name: "Virement → Compte Joint", type: "transfer", icon: "🔄", parent_id: "transferts", budget: null, sort_order: 11 },
    { id: "vir-immo", name: "Virement → Compte Immo", type: "transfer", icon: "🔄", parent_id: "transferts", budget: null, sort_order: 12 },
    { id: "vir-interne", name: "Transfert interne (autres)", type: "transfer", icon: "🔄", parent_id: "transferts", budget: null, sort_order: 13 },
    // CREDITS
    { id: "credits", name: "Crédits", type: "dette", icon: "🏦", parent_id: null, budget: null, sort_order: 20 },
    { id: "credit-immo", name: "Crédit immobilier (échéances)", type: "dette", icon: "🏦", parent_id: "credits", budget: null, sort_order: 21 },
    { id: "pret-perso", name: "Prêt personnel (échéances)", type: "dette", icon: "🏦", parent_id: "credits", budget: null, sort_order: 22 },
    { id: "amex-prlv", name: "Prélèvement Amex", type: "dette", icon: "💎", parent_id: "credits", budget: null, sort_order: 23 },
    // ALIMENTATION
    { id: "alimentation", name: "Alimentation", type: "expense", icon: "🛒", parent_id: null, budget: null, sort_order: 30 },
    { id: "courses", name: "Courses & supermarché", type: "expense", icon: "🛒", parent_id: "alimentation", budget: 600, sort_order: 31 },
    { id: "boulangerie", name: "Boulangerie", type: "expense", icon: "🥖", parent_id: "alimentation", budget: 50, sort_order: 32 },
    { id: "resto", name: "Restaurants & sorties", type: "expense", icon: "🍽️", parent_id: "alimentation", budget: 300, sort_order: 33 },
    { id: "livraison", name: "Livraison repas", type: "expense", icon: "🛵", parent_id: "alimentation", budget: 100, sort_order: 34 },
    { id: "snacking", name: "Snacking & distributeurs", type: "expense", icon: "🍫", parent_id: "alimentation", budget: 50, sort_order: 35 },
    // ENFANTS
    { id: "enfants", name: "Enfants", type: "expense", icon: "👨‍👩‍👧‍👦", parent_id: null, budget: null, sort_order: 40 },
    { id: "garde", name: "Garde (crèche, Kinougarde, CESU)", type: "expense", icon: "👶", parent_id: "enfants", budget: 1200, sort_order: 41 },
    { id: "enfants-activites", name: "Activités & école", type: "expense", icon: "🎒", parent_id: "enfants", budget: 300, sort_order: 42 },
    // LOGEMENT
    { id: "logement", name: "Logement", type: "expense", icon: "🏠", parent_id: null, budget: null, sort_order: 50 },
    { id: "copro", name: "Copropriété & syndic", type: "expense", icon: "🏢", parent_id: "logement", budget: 150, sort_order: 51 },
    { id: "securite", name: "Sécurité (Verisure)", type: "expense", icon: "🔐", parent_id: "logement", budget: 50, sort_order: 52 },
    { id: "assurance", name: "Assurance habitation", type: "expense", icon: "🛡️", parent_id: "logement", budget: 100, sort_order: 53 },
    { id: "energie", name: "Énergie (EDF, Engie)", type: "expense", icon: "⚡", parent_id: "logement", budget: 150, sort_order: 54 },
    // TRANSPORTS
    { id: "transports", name: "Transports", type: "expense", icon: "🚀", parent_id: null, budget: null, sort_order: 60 },
    { id: "transport-commun", name: "Transport en commun (Navigo)", type: "expense", icon: "🚇", parent_id: "transports", budget: 100, sort_order: 61 },
    { id: "taxi", name: "Taxi & VTC", type: "expense", icon: "🚕", parent_id: "transports", budget: 100, sort_order: 62 },
    { id: "voiture-recharge", name: "Voiture : recharge électrique", type: "expense", icon: "⚡", parent_id: "transports", budget: 100, sort_order: 63 },
    { id: "voiture-peage", name: "Voiture : péage", type: "expense", icon: "🛣️", parent_id: "transports", budget: 50, sort_order: 64 },
    { id: "voiture-parking", name: "Voiture : parking", type: "expense", icon: "🅿️", parent_id: "transports", budget: 50, sort_order: 65 },
    { id: "voiture-carburant", name: "Voiture : carburant & entretien", type: "expense", icon: "⛽", parent_id: "transports", budget: 100, sort_order: 66 },
    // SANTE
    { id: "sante", name: "Santé", type: "expense", icon: "🏥", parent_id: null, budget: null, sort_order: 70 },
    { id: "pharmacie", name: "Pharmacie", type: "expense", icon: "💊", parent_id: "sante", budget: 100, sort_order: 71 },
    { id: "medecin", name: "Médecin & soins médicaux", type: "expense", icon: "🩺", parent_id: "sante", budget: 150, sort_order: 72 },
    { id: "esthetique", name: "Esthétique (coiffeur, esthéticienne)", type: "expense", icon: "✂️", parent_id: "sante", budget: 80, sort_order: 73 },
    { id: "spa", name: "Spa & détente", type: "expense", icon: "🧖", parent_id: "sante", budget: 70, sort_order: 74 },
    // ABONNEMENTS & TELECOM
    { id: "abonnements-telecom", name: "Abonnements & télécom", type: "expense", icon: "📱", parent_id: null, budget: null, sort_order: 80 },
    { id: "telecom", name: "Télécom (Bouygues, Free)", type: "expense", icon: "📡", parent_id: "abonnements-telecom", budget: 80, sort_order: 81 },
    { id: "streaming", name: "Streaming & apps", type: "expense", icon: "📺", parent_id: "abonnements-telecom", budget: 60, sort_order: 82 },
    { id: "autres-abonnements", name: "Autres abonnements", type: "expense", icon: "📦", parent_id: "abonnements-telecom", budget: 40, sort_order: 83 },
    // SHOPPING & LOISIRS
    { id: "shopping-loisirs", name: "Shopping & loisirs", type: "expense", icon: "🛍️", parent_id: null, budget: null, sort_order: 90 },
    { id: "vetements", name: "Vêtements & chaussures", type: "expense", icon: "👗", parent_id: "shopping-loisirs", budget: 150, sort_order: 91 },
    { id: "accessoires", name: "Accessoires", type: "expense", icon: "👜", parent_id: "shopping-loisirs", budget: 50, sort_order: 92 },
    { id: "maison-deco", name: "Maison & déco", type: "expense", icon: "🏡", parent_id: "shopping-loisirs", budget: 100, sort_order: 93 },
    { id: "enfants-shopping", name: "Shopping enfants", type: "expense", icon: "🧸", parent_id: "shopping-loisirs", budget: 100, sort_order: 94 },
    { id: "sport", name: "Sport & fitness", type: "expense", icon: "🏃", parent_id: "shopping-loisirs", budget: 50, sort_order: 95 },
    { id: "loisirs", name: "Loisirs & culture", type: "expense", icon: "🎯", parent_id: "shopping-loisirs", budget: 150, sort_order: 96 },
    // VOYAGES
    { id: "voyages", name: "Voyages & vacances", type: "expense", icon: "✈️", parent_id: null, budget: null, sort_order: 100 },
    { id: "transport-voyage", name: "Billets & transport voyage", type: "expense", icon: "🛫", parent_id: "voyages", budget: 2000, sort_order: 101 },
    { id: "hebergement", name: "Hébergement", type: "expense", icon: "🏨", parent_id: "voyages", budget: 2000, sort_order: 102 },
    { id: "activites-voyage", name: "Activités & sorties sur place", type: "expense", icon: "🗺️", parent_id: "voyages", budget: 1000, sort_order: 103 },
    // CADEAUX & DONS
    { id: "cadeaux-dons", name: "Cadeaux & dons", type: "expense", icon: "🎁", parent_id: null, budget: null, sort_order: 110 },
    { id: "cadeaux", name: "Cadeaux", type: "expense", icon: "🎁", parent_id: "cadeaux-dons", budget: 150, sort_order: 111 },
    { id: "dons", name: "Dons & église", type: "expense", icon: "🙏", parent_id: "cadeaux-dons", budget: 50, sort_order: 112 },
    // FINANCES & ADMIN
    { id: "finances-admin", name: "Finances & admin", type: "expense", icon: "📋", parent_id: null, budget: null, sort_order: 120 },
    { id: "impots-ir", name: "Impôt sur le revenu", type: "expense", icon: "🏛️", parent_id: "finances-admin", budget: null, sort_order: 121 },
    { id: "taxe-fonciere", name: "Taxe foncière", type: "expense", icon: "🏠", parent_id: "finances-admin", budget: null, sort_order: 122 },
    { id: "amendes", name: "Amendes & PV", type: "expense", icon: "🚨", parent_id: "finances-admin", budget: null, sort_order: 123 },
    { id: "autres-taxes", name: "Autres taxes", type: "expense", icon: "📄", parent_id: "finances-admin", budget: null, sort_order: 124 },
    { id: "frais-bancaires", name: "Frais bancaires", type: "expense", icon: "🏧", parent_id: "finances-admin", budget: 20, sort_order: 125 },
    { id: "comptable-avocat", name: "Comptable & juridique", type: "expense", icon: "⚖️", parent_id: "finances-admin", budget: null, sort_order: 126 },
    { id: "retraits", name: "Retraits espèces (DAB)", type: "expense", icon: "💵", parent_id: "finances-admin", budget: null, sort_order: 127 },
    // DIVERS
    { id: "divers", name: "Divers / Non classé", type: "expense", icon: "❓", parent_id: null, budget: null, sort_order: 999 },
  ];

  // Vrais soldes des comptes — seed_balance = balance au seed (pas encore de transactions)
  const accounts = [
    { id: "hb-perso", name: "Compte Courant", bank: "Hello Bank", icon: "💳", type: "liquidites", balance: 1584.67 },
    { id: "hb-immo", name: "Compte Immo", bank: "Hello Bank", icon: "🏠", type: "liquidites", balance: 453.64 },
    { id: "hb-adele", name: "Adèle", bank: "Hello Bank", icon: "👧", type: "liquidites", balance: 13100 },
    { id: "hb-gabrielle", name: "Gabrielle", bank: "Hello Bank", icon: "👶", type: "liquidites", balance: 5230 },
    { id: "hb-cautions", name: "Cautions Immo", bank: "Hello Bank", icon: "🔒", type: "epargne", balance: 634.14 },
    { id: "hb-impots", name: "Impôts", bank: "Hello Bank", icon: "📋", type: "epargne", balance: 1953.98 },
    { id: "hb-livretA-adele", name: "Livret A Adèle", bank: "Hello Bank", icon: "🐷", type: "epargne", balance: 24681.63 },
    { id: "hb-livretA-gabrielle", name: "Livret A Gabrielle", bank: "Hello Bank", icon: "🐷", type: "epargne", balance: 18170.14 },
    { id: "hb-credit1", name: "Crédit Lille 40m²", bank: "Hello Bank", icon: "🏦", type: "credit", balance: -112945.23 },
    { id: "hb-credit2", name: "Crédit Lille 19m²", bank: "Hello Bank", icon: "🏦", type: "credit", balance: -76552.31 },
    { id: "hb-pretperso", name: "Prêt personnel", bank: "Hello Bank", icon: "🏦", type: "credit", balance: -4862.49 },
    { id: "ccf-perso", name: "Compte Chèques", bank: "CCF", icon: "💳", type: "liquidites", balance: 1441.91 },
    { id: "ccf-joint", name: "Compte Joint", bank: "CCF", icon: "👫", type: "liquidites", balance: 3804.28 },
    { id: "ccf-ldds", name: "LDDS", bank: "CCF", icon: "📈", type: "epargne", balance: 208.35 },
    { id: "ccf-pea", name: "PEA", bank: "CCF", icon: "📊", type: "bourse", balance: 1202.47 },
    { id: "amex", name: "Amex Gold AF-KLM", bank: "Amex", icon: "💎", type: "carte", balance: -22.51 },
  ];

  const rules = [
    { pattern: "CARREFOUR MARKET", category_id: "courses" },
    { pattern: "DELIVEROO", category_id: "livraison" },
    { pattern: "UBER EATS", category_id: "livraison" },
    { pattern: "LPCR", category_id: "garde" },
    { pattern: "VACHERAND SYNDIC", category_id: "copro" },
    { pattern: "SAEMES PARKING", category_id: "voiture-parking" },
    { pattern: "IZIVIA RECHARGE", category_id: "voiture-recharge" },
    { pattern: "G7 TAXI", category_id: "taxi" },
    { pattern: "NAVIGO RATP", category_id: "transport-commun" },
    { pattern: "BOUYGUES TELECOM", category_id: "telecom" },
    { pattern: "VERISURE", category_id: "securite" },
    { pattern: "APPLE.COM/BILL", category_id: "streaming" },
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
    { pattern: "AMAZON PRIME", category_id: "streaming" },
    { pattern: "ADOBE CREATIVE", category_id: "streaming" },
  ];

  // Valeurs immobilières et crédits metadata par défaut (éditables dans Paramètres)
  const settings = [
    { key: "immo_sci", value: "300000" },
    { key: "immo_lille40", value: "200000" },
    { key: "immo_lille19", value: "100000" },
    // Crédits metadata
    { key: "credit_hb-credit1_mensualite", value: "906.92" },
    { key: "credit_hb-credit1_taux", value: "1.72" },
    { key: "credit_hb-credit1_fin", value: "2037-11" },
    { key: "credit_hb-credit1_montant_initial", value: "181000" },
    { key: "credit_hb-credit2_mensualite", value: "562.39" },
    { key: "credit_hb-credit2_taux", value: "1.40" },
    { key: "credit_hb-credit2_fin", value: "2039-01" },
    { key: "credit_hb-credit2_montant_initial", value: "113700" },
    { key: "credit_hb-pretperso_mensualite", value: "184.52" },
    { key: "credit_hb-pretperso_taux", value: "5.08" },
    { key: "credit_hb-pretperso_fin", value: "2028-07" },
    { key: "credit_hb-pretperso_montant_initial", value: "8000" },
  ];

  const insertCat = db.prepare(`INSERT OR IGNORE INTO categories (id, name, type, icon, parent_id, budget, sort_order) VALUES (@id, @name, @type, @icon, @parent_id, @budget, @sort_order)`);
  const insertAcc = db.prepare(`INSERT OR IGNORE INTO accounts (id, name, bank, icon, type, balance, seed_balance) VALUES (@id, @name, @bank, @icon, @type, @balance, @balance)`);
  const insertRule = db.prepare(`INSERT OR IGNORE INTO rules (pattern, category_id) VALUES (@pattern, @category_id)`);
  const insertSetting = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (@key, @value)`);

  db.transaction(() => {
    for (const c of categories) insertCat.run(c);
    for (const a of accounts) insertAcc.run(a);
    for (const r of rules) insertRule.run(r);
    for (const s of settings) insertSetting.run(s);
  })();
}
