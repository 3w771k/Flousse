export interface RawTransaction {
  date: string; // YYYY-MM-DD
  label: string;
  amount: number;
}

// ── Hello Bank CSV ─────────────────────────────────────────────────────────
// Line 1: account header (COMPTE COURANT;...;****2088;13/03/2026;;1 584,67)
// Data lines: DD/MM/YYYY;type;category;description;amount
export function parseHelloBank(csv: string): RawTransaction[] {
  const lines = csv.trim().split("\n").slice(1); // skip header
  return lines.flatMap((line) => {
    const parts = line.split(";");
    if (parts.length < 5) return [];
    const dateStr = parts[0]?.trim();
    const label = parts[3]?.trim().replace(/\s+/g, " ") || parts[2]?.trim() || "";
    const amountStr = parts[4]?.trim().replace(/\s/g, "").replace(",", ".");
    const amount = parseFloat(amountStr);
    if (!dateStr || isNaN(amount)) return [];
    return [{ date: parseFrDate(dateStr), label: cleanLabel(label), amount }];
  });
}

// ── CCF CSV ────────────────────────────────────────────────────────────────
// Header: "Date operation";"Date valeur";"Libelle";"Debit";"Credit"
// Data: "DD/MM/YYYY";"DD/MM/YYYY";"description";"1 234,56";""
export function parseCCF(csv: string): RawTransaction[] {
  const lines = csv.trim().split("\n").slice(1); // skip header
  return lines.flatMap((line) => {
    // Remove surrounding quotes from each field
    const parts = line.split(";").map((p) => p.replace(/^"|"$/g, "").trim());
    if (parts.length < 5) return [];
    const dateStr = parts[0];
    const label = parts[2] || "";
    const debitStr = parts[3]?.replace(/\s/g, "").replace(",", ".") || "0";
    const creditStr = parts[4]?.replace(/\s/g, "").replace(",", ".") || "0";
    const debit = parseFloat(debitStr) || 0;
    const credit = parseFloat(creditStr) || 0;
    if (!dateStr || (debit === 0 && credit === 0)) return [];
    const amount = credit > 0 ? credit : -debit;
    return [{ date: parseFrDate(dateStr), label: cleanLabel(label), amount }];
  });
}

// ── Amex CSV ───────────────────────────────────────────────────────────────
// Header: Date,Description,Montant,Détails,...
// Data: MM/DD/YYYY,description,"-10,00",...
export function parseAmex(csv: string): RawTransaction[] {
  const lines = csv.trim().split("\n").slice(1);
  return lines.flatMap((line) => {
    // Handle quoted fields with commas inside (address fields)
    const parts = parseCSVLine(line);
    if (parts.length < 3) return [];
    const dateStr = parts[0]?.trim();
    const label = parts[1]?.trim() || "";
    const amountStr = parts[2]?.trim().replace(/\s/g, "").replace(",", ".");
    const rawAmount = parseFloat(amountStr);
    if (!dateStr || isNaN(rawAmount)) return [];
    // Amex: positive = charge (you owe), negative = payment — invert for Flousse convention
    const amount = -rawAmount;
    return [{ date: parseUsDate(dateStr), label: cleanLabel(label), amount }];
  });
}

// ── Auto-detect format ─────────────────────────────────────────────────────
export function detectFormat(filename: string, firstLine: string): "hellobank" | "ccf" | "amex" | null {
  const fn = filename.toLowerCase();
  if (fn.includes("activity") || firstLine.toLowerCase().includes("description,montant")) return "amex";
  if (firstLine.startsWith('"Date operation"') || firstLine.startsWith("\"Date operation\"")) return "ccf";
  if (firstLine.includes("COMPTE") || firstLine.match(/^[A-Z\s]+;/)) return "hellobank";
  if (firstLine.startsWith("RELEVE") || fn.startsWith("releve")) return "ccf";
  return null;
}

export function parseCsv(filename: string, content: string): RawTransaction[] {
  const firstLine = content.split("\n")[0] || "";
  const fmt = detectFormat(filename, firstLine);
  if (fmt === "amex") return parseAmex(content);
  if (fmt === "ccf") return parseCCF(content);
  if (fmt === "hellobank") return parseHelloBank(content);
  // Fallback: try CCF (most common)
  return parseCCF(content);
}

// ── Helpers ────────────────────────────────────────────────────────────────
function parseFrDate(d: string): string {
  // DD/MM/YYYY → YYYY-MM-DD
  const [dd, mm, yyyy] = d.split("/");
  if (!dd || !mm || !yyyy) return d;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

function parseUsDate(d: string): string {
  // MM/DD/YYYY → YYYY-MM-DD
  const [mm, dd, yyyy] = d.split("/");
  if (!mm || !dd || !yyyy) return d;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

function cleanLabel(s: string): string {
  return s
    .replace(/CARTE \d{2}\/\d{2} /, "CARTE ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .toUpperCase()
    .slice(0, 120);
}

// Parse a single CSV line respecting quoted fields
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === "," && !inQuote) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}
