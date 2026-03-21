import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// Returns monthly cashflow aggregated from transactions
// C1: transferts sortants are now counted as sorties (not excluded)
export async function GET(req: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(req.url);
    const months = Math.max(1, Math.min(120, parseInt(searchParams.get("months") || "12") || 12));
    const owner = searchParams.get("owner");

    // Build optional owner filter (join accounts to filter by owner)
    const ownerJoin = owner ? " JOIN accounts a ON a.id = t.account_id" : "";
    const ownerWhere = owner ? " AND a.owner = ?" : "";
    const ownerParams = owner ? [owner] : [];

    // C1: Include ALL transaction types — transfers counted as outflows
    const rows = db.prepare(`
      SELECT
        substr(t.date, 1, 7) as month,
        SUM(CASE WHEN c.type = 'income' THEN t.amount ELSE 0 END) as revenus,
        SUM(CASE WHEN c.type = 'expense' THEN ABS(t.amount) ELSE 0 END) as depenses,
        SUM(CASE WHEN c.type = 'dette' THEN ABS(t.amount) ELSE 0 END) as credits,
        SUM(CASE WHEN c.type = 'transfer' AND t.amount < 0 THEN ABS(t.amount) ELSE 0 END) as transferts
      FROM transactions t
      JOIN categories c ON c.id = t.category_id
      ${ownerJoin}
      WHERE 1=1 ${ownerWhere}
      GROUP BY month
      ORDER BY month DESC
      LIMIT ?
    `).all(...ownerParams, months) as {
      month: string; revenus: number; depenses: number; credits: number; transferts: number;
    }[];

    const data = rows.reverse().map((r) => ({
      month: formatMonth(r.month),
      raw_month: r.month,
      revenus: Math.round(r.revenus),
      depenses: Math.round(r.depenses),
      credits: Math.round(r.credits),
      transferts: Math.round(r.transferts),
      // C1: total sorties = expenses + credits + outgoing transfers
      sorties: Math.round(r.depenses + r.credits + r.transferts),
      solde: Math.round(r.revenus - r.depenses - r.credits - r.transferts),
    }));

    // Cumulative balance
    let cumul = 0;
    const cumulData = data.map((d) => {
      cumul += d.solde;
      return { month: d.month, raw_month: d.raw_month, solde: cumul };
    });

    // C2: 6-month projection from last 3 months average
    const lastN = Math.min(3, data.length);
    const recentData = data.slice(-lastN);

    let projection: typeof data[0][] = [];
    if (recentData.length > 0) {
      const avgRevenus = recentData.reduce((s, r) => s + r.revenus, 0) / lastN;
      const avgDepenses = recentData.reduce((s, r) => s + r.depenses, 0) / lastN;
      const avgCredits = recentData.reduce((s, r) => s + r.credits, 0) / lastN;
      const avgTransferts = recentData.reduce((s, r) => s + r.transferts, 0) / lastN;
      const avgSorties = avgDepenses + avgCredits + avgTransferts;
      const avgSolde = avgRevenus - avgSorties;

      const lastRaw = data[data.length - 1].raw_month;
      const [ly, lm] = lastRaw.split("-").map(Number);

      let projCumul = cumulData[cumulData.length - 1]?.solde || 0;
      for (let i = 1; i <= 6; i++) {
        const d = new Date(ly, lm - 1 + i, 1);
        const rawMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        projCumul += Math.round(avgSolde);
        projection.push({
          month: formatMonth(rawMonth),
          raw_month: rawMonth,
          revenus: Math.round(avgRevenus),
          depenses: Math.round(avgDepenses),
          credits: Math.round(avgCredits),
          transferts: Math.round(avgTransferts),
          sorties: Math.round(avgSorties),
          solde: Math.round(avgSolde),
        });
      }

      // Projection cumul (separate array for the projection chart)
      projCumul = cumulData[cumulData.length - 1]?.solde || 0;
      const projectionCumul = projection.map((p) => {
        projCumul += p.solde;
        return { month: p.month, raw_month: p.raw_month, solde: projCumul };
      });

      return NextResponse.json({ data, cumul: cumulData, projection, projectionCumul });
    }

    return NextResponse.json({ data, cumul: cumulData, projection: [], projectionCumul: [] });
  } catch (err) {
    console.error("[cashflow GET]", err);
    return NextResponse.json({ error: "Erreur lecture cashflow" }, { status: 500 });
  }
}

function formatMonth(yyyymm: string): string {
  const [y, m] = yyyymm.split("-");
  const monthNames = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];
  const idx = parseInt(m) - 1;
  return `${monthNames[idx]} ${y.slice(2)}`;
}
