import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const db = getDb();

    // Totals by account type
    const rows = db.prepare(`
      SELECT type, COALESCE(SUM(balance), 0) as total
      FROM accounts
      GROUP BY type
    `).all() as { type: string; total: number }[];

    const byType: Record<string, number> = {};
    for (const r of rows) byType[r.type] = r.total;

    const totalLiquidites = byType["liquidites"] ?? 0;
    const totalEpargne = byType["epargne"] ?? 0;
    const totalCredits = byType["credit"] ?? 0;
    const totalBourse = byType["bourse"] ?? 0;
    const totalCarte = byType["carte"] ?? 0;

    // Immobilier values from settings
    const getImmo = (key: string, fallback: number) => {
      const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
      return row ? parseFloat(row.value) : fallback;
    };
    const immoSci = getImmo("immo_sci", 300000);
    const immoLille40 = getImmo("immo_lille40", 200000);
    const immoLille19 = getImmo("immo_lille19", 100000);
    const totalImmo = immoSci + immoLille40 + immoLille19;

    // Patrimoine net = all account balances + immobilier
    // Credits are already negative in balances
    const totalComptes = totalLiquidites + totalEpargne + totalCredits + totalBourse + totalCarte;
    const patrimoineNet = totalComptes + totalImmo;

    return NextResponse.json({
      totalLiquidites,
      totalEpargne,
      totalCredits,
      totalBourse,
      totalCarte,
      totalComptes,
      totalImmo,
      immoSci,
      immoLille40,
      immoLille19,
      patrimoineNet,
    });
  } catch (err) {
    console.error("[patrimoine GET]", err);
    return NextResponse.json({ error: "Erreur calcul patrimoine" }, { status: 500 });
  }
}
