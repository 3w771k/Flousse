import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// Returns monthly cashflow aggregated from transactions
export async function GET(req: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(req.url);
    const months = Math.max(1, Math.min(120, parseInt(searchParams.get("months") || "12") || 12));

    const rows = db.prepare(`
      SELECT
        substr(date, 1, 7) as month,
        SUM(CASE WHEN c.type = 'income' THEN t.amount ELSE 0 END) as revenus,
        SUM(CASE WHEN c.type = 'expense' THEN ABS(t.amount) ELSE 0 END) as depenses,
        SUM(CASE WHEN c.type = 'dette' THEN ABS(t.amount) ELSE 0 END) as credits
      FROM transactions t
      JOIN categories c ON c.id = t.category_id
      WHERE c.type != 'transfer'
      GROUP BY month
      ORDER BY month DESC
      LIMIT ?
    `).all(months) as { month: string; revenus: number; depenses: number; credits: number }[];

    const data = rows.reverse().map((r) => ({
      month: formatMonth(r.month),
      revenus: Math.round(r.revenus),
      depenses: Math.round(r.depenses),
      credits: Math.round(r.credits),
      solde: Math.round(r.revenus - r.depenses - r.credits),
    }));

    // Cumulative
    let cumul = 0;
    const cumulData = data.map((d) => {
      cumul += d.solde;
      return { month: d.month, solde: cumul };
    });

    return NextResponse.json({ data, cumul: cumulData });
  } catch (err) {
    console.error("[cashflow GET]", err);
    return NextResponse.json({ error: "Erreur lecture cashflow" }, { status: 500 });
  }
}

function formatMonth(yyyymm: string): string {
  const [y, m] = yyyymm.split("-");
  const months = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];
  const idx = parseInt(m) - 1;
  return `${months[idx]} ${y.slice(2)}`;
}
