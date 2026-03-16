import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

type TxPayload = {
  id: string;
  date: string;
  label: string;
  amount: number;
  categoryId: string;
  confidence: number;
  source: string;
};

export async function POST(req: NextRequest) {
  try {
    const db = getDb();
    const body = await req.json() as { accountId: string; transactions: TxPayload[] };

    if (!body.accountId || !body.transactions?.length) {
      return NextResponse.json({ error: "accountId and transactions required" }, { status: 400 });
    }

    const account = db.prepare("SELECT id FROM accounts WHERE id = ?").get(body.accountId);
    if (!account) return NextResponse.json({ error: "account not found" }, { status: 404 });

    const insert = db.prepare(`
      INSERT OR IGNORE INTO transactions (id, account_id, date, label, amount, category_id, confidence, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let inserted = 0;
    db.transaction(() => {
      for (const t of body.transactions) {
        const result = insert.run(t.id, body.accountId, t.date, t.label, t.amount, t.categoryId, t.confidence, t.source);
        if (result.changes > 0) inserted++;
      }

      // Recalculate account balance from all its transactions
      // Balance = seed balance (from accounts table initial value) gets replaced by
      // sum of all transactions for this account
      const sumRow = db.prepare(
        "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE account_id = ?"
      ).get(body.accountId) as { total: number };
      db.prepare("UPDATE accounts SET balance = ? WHERE id = ?").run(sumRow.total, body.accountId);
    })();

    return NextResponse.json({ ok: true, inserted });
  } catch (err) {
    console.error("[import/confirm POST]", err);
    return NextResponse.json({ error: "Erreur lors de la confirmation" }, { status: 500 });
  }
}
