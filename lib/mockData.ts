export const ACCOUNTS = [
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

// ─── CATEGORY HIERARCHY ──────────────────────────────────────────────────────
// parentId = undefined → parent category (shown aggregated on dashboard)
// parentId = "xxx"    → sub-category (shown in transaction detail)

export interface Category {
  id: string;
  name: string;
  type: "income" | "expense" | "transfer" | "dette";
  icon: string;
  parentId?: string;
  budget?: number; // monthly budget target (on parent OR sub)
}

export const CATEGORIES: Category[] = [
  // ── REVENUS ──────────────────────────────────────────────────────────────
  { id: "revenus", name: "Revenus", type: "income", icon: "💰" },
  { id: "salaire", name: "Salaire", type: "income", icon: "💼", parentId: "revenus" },
  { id: "loyers", name: "Loyers", type: "income", icon: "🏠", parentId: "revenus" },
  { id: "allocations", name: "Allocations & aides", type: "income", icon: "👶", parentId: "revenus" },
  { id: "autre-revenu", name: "Autres revenus", type: "income", icon: "📥", parentId: "revenus" },

  // ── TRANSFERTS ───────────────────────────────────────────────────────────
  { id: "transferts", name: "Transferts", type: "transfer", icon: "🔄" },
  { id: "vir-joint", name: "→ Compte Joint", type: "transfer", icon: "🔄", parentId: "transferts" },
  { id: "vir-immo", name: "→ Compte Immo", type: "transfer", icon: "🔄", parentId: "transferts" },
  { id: "vir-interne", name: "Transfert interne", type: "transfer", icon: "🔄", parentId: "transferts" },

  // ── CRÉDITS ──────────────────────────────────────────────────────────────
  { id: "credits", name: "Crédits", type: "dette", icon: "🏦" },
  { id: "credit-immo", name: "Crédit immobilier", type: "dette", icon: "🏦", parentId: "credits" },
  { id: "pret-perso", name: "Prêt personnel", type: "dette", icon: "🏦", parentId: "credits" },
  { id: "amex-prlv", name: "Prélèvement Amex", type: "dette", icon: "💎", parentId: "credits" },

  // ── ALIMENTATION ─────────────────────────────────────────────────────────
  { id: "alimentation", name: "Alimentation", type: "expense", icon: "🛒", budget: 1100 },
  { id: "courses", name: "Courses & supermarché", type: "expense", icon: "🛒", parentId: "alimentation", budget: 800 },
  { id: "resto", name: "Restaurants & sorties", type: "expense", icon: "🍽️", parentId: "alimentation", budget: 400 },
  { id: "livraison", name: "Livraison repas", type: "expense", icon: "🛵", parentId: "alimentation", budget: 150 },

  // ── ENFANTS ──────────────────────────────────────────────────────────────
  { id: "enfants", name: "Enfants", type: "expense", icon: "👨‍👩‍👧‍👦", budget: 1500 },
  { id: "garde", name: "Garde d'enfants", type: "expense", icon: "👶", parentId: "enfants", budget: 1200 },
  { id: "enfants-activites", name: "Activités & école", type: "expense", icon: "🎒", parentId: "enfants", budget: 150 },
  { id: "enfants-shopping", name: "Shopping enfants", type: "expense", icon: "🧸", parentId: "enfants", budget: 150 },

  // ── BIEN-ÊTRE & SANTÉ ────────────────────────────────────────────────────
  { id: "bien-etre", name: "Bien-être & santé", type: "expense", icon: "🌿", budget: 300 },
  { id: "sante", name: "Santé & pharmacie", type: "expense", icon: "🏥", parentId: "bien-etre", budget: 150 },
  { id: "coiffeur", name: "Coiffeur & soins", type: "expense", icon: "✂️", parentId: "bien-etre", budget: 100 },
  { id: "sport", name: "Sport & fitness", type: "expense", icon: "🏃", parentId: "bien-etre", budget: 50 },

  // ── TRANSPORTS ───────────────────────────────────────────────────────────
  { id: "transports", name: "Transports", type: "expense", icon: "🚀", budget: 400 },
  { id: "transport-commun", name: "Transport en commun", type: "expense", icon: "🚇", parentId: "transports", budget: 200 },
  { id: "taxi", name: "Taxi & VTC", type: "expense", icon: "🚕", parentId: "transports", budget: 100 },
  { id: "voiture", name: "Voiture", type: "expense", icon: "🚗", parentId: "transports", budget: 100 },

  // ── VOYAGES & VACANCES ───────────────────────────────────────────────────
  { id: "voyages", name: "Voyages & vacances", type: "expense", icon: "✈️", budget: 5000 },
  { id: "transport-voyage", name: "Billets & transports", type: "expense", icon: "🛫", parentId: "voyages" },
  { id: "hebergement", name: "Hébergement", type: "expense", icon: "🏨", parentId: "voyages" },
  { id: "activites-voyage", name: "Activités & sorties", type: "expense", icon: "🗺️", parentId: "voyages" },

  // ── SHOPPING & LOISIRS ───────────────────────────────────────────────────
  { id: "shopping-loisirs", name: "Shopping & loisirs", type: "expense", icon: "🛍️", budget: 400 },
  { id: "shopping", name: "Shopping & maison", type: "expense", icon: "🛍️", parentId: "shopping-loisirs", budget: 250 },
  { id: "loisirs", name: "Loisirs & culture", type: "expense", icon: "🎯", parentId: "shopping-loisirs", budget: 150 },

  // ── ABONNEMENTS & TÉLÉCOM ────────────────────────────────────────────────
  { id: "abonnements-telecom", name: "Abonnements & télécom", type: "expense", icon: "📱", budget: 180 },
  { id: "telecom", name: "Télécom", type: "expense", icon: "📡", parentId: "abonnements-telecom", budget: 80 },
  { id: "abonnements", name: "Abonnements numériques", type: "expense", icon: "📦", parentId: "abonnements-telecom", budget: 100 },

  // ── LOGEMENT & CHARGES ───────────────────────────────────────────────────
  { id: "logement", name: "Logement & charges", type: "expense", icon: "🏠", budget: 300 },
  { id: "copro", name: "Copro & syndic", type: "expense", icon: "🏢", parentId: "logement", budget: 150 },
  { id: "securite", name: "Sécurité (Verisure)", type: "expense", icon: "🔐", parentId: "logement", budget: 50 },
  { id: "assurance", name: "Assurance", type: "expense", icon: "🛡️", parentId: "logement", budget: 100 },

  // ── FINANCES & ADMIN ─────────────────────────────────────────────────────
  { id: "finances-admin", name: "Finances & admin", type: "expense", icon: "📋", budget: 100 },
  { id: "impots", name: "Impôts & taxes", type: "expense", icon: "🏛️", parentId: "finances-admin" },
  { id: "frais-bancaires", name: "Frais bancaires", type: "expense", icon: "🏧", parentId: "finances-admin", budget: 20 },
  { id: "comptable-avocat", name: "Comptable & juridique", type: "expense", icon: "⚖️", parentId: "finances-admin" },

  // ── DIVERS ───────────────────────────────────────────────────────────────
  { id: "divers", name: "Divers / Non classé", type: "expense", icon: "❓" },
];

// Helpers
export const CM = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
export const PARENT_CATS = CATEGORIES.filter((c) => !c.parentId);
export const SUB_CATS = CATEGORIES.filter((c) => !!c.parentId);
export const childrenOf = (parentId: string) => CATEGORIES.filter((c) => c.parentId === parentId);

export const TRANSACTIONS = [
  // Revenus
  { id: "t1", accountId: "hb-perso", date: "2026-03-05", label: "VIREMENT SINEQUA SALAIRE MARS", amount: 4850, categoryId: "salaire", confidence: 1.0, source: "rule" },
  { id: "t2", accountId: "ccf-joint", date: "2026-03-06", label: "CAF DES HAUTS DE SEINE", amount: 310, categoryId: "allocations", confidence: 1.0, source: "rule" },
  // Crédits
  { id: "t3", accountId: "hb-perso", date: "2026-03-08", label: "ECHEANCE PRET 61123486 CREDIT IMMO", amount: -906.92, categoryId: "credit-immo", confidence: 1.0, source: "rule" },
  { id: "t4", accountId: "hb-perso", date: "2026-03-08", label: "ECHEANCE PRET 60837505 CREDIT IMMO 2", amount: -562.39, categoryId: "credit-immo", confidence: 1.0, source: "rule" },
  { id: "t5", accountId: "hb-perso", date: "2026-03-08", label: "ECHEANCE PRET 62043046 PRET PERSO", amount: -184.52, categoryId: "pret-perso", confidence: 1.0, source: "rule" },
  // Transferts
  { id: "t6", accountId: "hb-perso", date: "2026-03-07", label: "VIR SEPA COMPTE JOINT MARS", amount: -1200, categoryId: "vir-joint", confidence: 1.0, source: "rule" },
  // Dépenses CCF Joint
  { id: "t7", accountId: "ccf-joint", date: "2026-03-03", label: "CARTE 03/03 CARREFOUR MARKET NEUILLY", amount: -87.40, categoryId: "courses", confidence: 1.0, source: "rule" },
  { id: "t8", accountId: "ccf-joint", date: "2026-03-05", label: "CARTE 05/03 DELIVEROO PARIS", amount: -34.90, categoryId: "livraison", confidence: 1.0, source: "rule" },
  { id: "t9", accountId: "ccf-joint", date: "2026-03-06", label: "CARTE 06/03 FRANPRIX RUE AMPERE", amount: -52.20, categoryId: "courses", confidence: 1.0, source: "rule" },
  { id: "t10", accountId: "ccf-joint", date: "2026-03-08", label: "PRELEVEMENT LPCR GARDE ENFANTS FEV", amount: -1180, categoryId: "garde", confidence: 1.0, source: "rule" },
  { id: "t11", accountId: "ccf-joint", date: "2026-03-10", label: "CARTE 10/03 WAZI RESTAURANT PARIS 8", amount: -67.50, categoryId: "resto", confidence: 1.0, source: "rule" },
  { id: "t12", accountId: "ccf-joint", date: "2026-03-11", label: "CARTE 11/03 PICARD SURGELÉS NEUILLY", amount: -44.10, categoryId: "courses", confidence: 1.0, source: "rule" },
  { id: "t13", accountId: "ccf-joint", date: "2026-03-12", label: "CARTE 12/03 UBER EATS PARIS", amount: -28.50, categoryId: "livraison", confidence: 1.0, source: "rule" },
  { id: "t14", accountId: "ccf-joint", date: "2026-03-13", label: "CARTE 13/03 MON-MARCHE.FR", amount: -119.80, categoryId: "courses", confidence: 1.0, source: "rule" },
  { id: "t15", accountId: "hb-perso", date: "2026-03-10", label: "CARTE 10/03 SERVICE NAVIGO RATP", amount: -86.40, categoryId: "transport-commun", confidence: 1.0, source: "rule" },
  { id: "t16", accountId: "hb-perso", date: "2026-03-12", label: "CARTE 12/03 IZIVIA RECHARGE VE", amount: -24.60, categoryId: "voiture", confidence: 1.0, source: "rule" },
  { id: "t17", accountId: "hb-perso", date: "2026-03-01", label: "PRELEVEMENT BOUYGUES TELECOM", amount: -29.99, categoryId: "telecom", confidence: 1.0, source: "rule" },
  { id: "t18", accountId: "hb-perso", date: "2026-03-01", label: "PRELEVEMENT VERISURE SECURITE", amount: -49.90, categoryId: "securite", confidence: 1.0, source: "rule" },
  { id: "t19", accountId: "hb-perso", date: "2026-03-02", label: "PRELEVEMENT APPLE.COM/BILL", amount: -14.99, categoryId: "abonnements", confidence: 1.0, source: "rule" },
  { id: "t20", accountId: "hb-perso", date: "2026-03-02", label: "PRELEVEMENT AMERICAN EXPRESS", amount: -380, categoryId: "amex-prlv", confidence: 1.0, source: "rule" },
  { id: "t21", accountId: "hb-perso", date: "2026-03-11", label: "VIREMENT VACHERAND SYNDIC COPRO", amount: -280, categoryId: "copro", confidence: 1.0, source: "rule" },
  { id: "t22", accountId: "hb-perso", date: "2026-03-14", label: "CARTE 14/03 G7 TAXI PARIS", amount: -22.80, categoryId: "taxi", confidence: 0.95, source: "rule" },
  { id: "t23", accountId: "hb-perso", date: "2026-03-13", label: "CARTE 13/03 SAEMES PARKING TERNES", amount: -18.00, categoryId: "voiture", confidence: 0.95, source: "rule" },
  // Non classées
  { id: "t24", accountId: "ccf-joint", date: "2026-03-14", label: "CARTE 14/03 SAS JADE PARIS 17", amount: -156.00, categoryId: "divers", confidence: 0.3, source: "llm" },
  { id: "t25", accountId: "hb-perso", date: "2026-03-14", label: "PRELEVEMENT LEETCHI MGP", amount: -25.00, categoryId: "divers", confidence: 0.4, source: "llm" },
  // Amex
  { id: "t26", accountId: "amex", date: "2026-03-04", label: "RESTAURANT BAAN LAO PARIS 8", amount: -89.00, categoryId: "resto", confidence: 1.0, source: "rule" },
  { id: "t27", accountId: "amex", date: "2026-03-07", label: "AMAZON PRIME", amount: -6.99, categoryId: "abonnements", confidence: 1.0, source: "rule" },
  { id: "t28", accountId: "amex", date: "2026-03-09", label: "ZARA HOME PARIS", amount: -124.00, categoryId: "shopping", confidence: 1.0, source: "rule" },
  { id: "t29", accountId: "amex", date: "2026-03-11", label: "ADOBE CREATIVE CLOUD", amount: -54.99, categoryId: "abonnements", confidence: 1.0, source: "rule" },
];

export const CASHFLOW_DATA = [
  { month: "Sep 25", revenus: 5160, depenses: 2340, credits: 1654, solde: 1166 },
  { month: "Oct 25", revenus: 5160, depenses: 2680, credits: 1654, solde: 826 },
  { month: "Nov 25", revenus: 5160, depenses: 3120, credits: 1654, solde: 386 },
  { month: "Déc 25", revenus: 5470, depenses: 3840, credits: 1654, solde: -24 },
  { month: "Jan 26", revenus: 5160, depenses: 2290, credits: 1654, solde: 1216 },
  { month: "Fév 26", revenus: 5160, depenses: 2580, credits: 1654, solde: 926 },
  { month: "Mar 26", revenus: 5160, depenses: 2890, credits: 1654, solde: 616 },
  { month: "Avr 26*", revenus: 5160, depenses: 2600, credits: 1654, solde: 906 },
  { month: "Mai 26*", revenus: 5160, depenses: 2600, credits: 1654, solde: 906 },
  { month: "Jun 26*", revenus: 5160, depenses: 2600, credits: 1654, solde: 906 },
];

export const CASHFLOW_CUMUL = [
  { month: "Sep 25", solde: 4820 },
  { month: "Oct 25", solde: 5646 },
  { month: "Nov 25", solde: 6032 },
  { month: "Déc 25", solde: 6008 },
  { month: "Jan 26", solde: 7224 },
  { month: "Fév 26", solde: 8150 },
  { month: "Mar 26", solde: 8766 },
  { month: "Avr 26*", solde: 9672 },
  { month: "Mai 26*", solde: 10578 },
  { month: "Jun 26*", solde: 11484 },
];
