import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = getDb();
    const { id } = await params;
    db.prepare("DELETE FROM accounts WHERE id = ?").run(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[accounts DELETE]", err);
    return NextResponse.json({ error: "Erreur suppression compte" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = getDb();
    const { id } = await params;
    let body: { actual_balance?: number };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
    }

    const { actual_balance } = body;
    if (actual_balance !== undefined) {
      // seed_balance = actual_balance - SUM(transactions)
      // so that balance = seed_balance + SUM(transactions) = actual_balance
      const sumRow = db.prepare(
        "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE account_id = ?"
      ).get(id) as { total: number };
      const seedBalance = actual_balance - sumRow.total;

      db.prepare("UPDATE accounts SET balance = ?, seed_balance = ? WHERE id = ?")
        .run(actual_balance, seedBalance, id);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[accounts PATCH]", err);
    return NextResponse.json({ error: "Erreur mise à jour compte" }, { status: 500 });
  }
}
