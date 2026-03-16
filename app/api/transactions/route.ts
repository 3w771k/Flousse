import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month"); // YYYY-MM
    const from = searchParams.get("from"); // YYYY-MM-DD
    const to = searchParams.get("to"); // YYYY-MM-DD
    const accountId = searchParams.get("accountId");
    const categoryId = searchParams.get("categoryId");
    const search = searchParams.get("search");

    let sql = "SELECT * FROM transactions WHERE 1=1";
    const params: (string | number)[] = [];

    if (month) {
      sql += " AND date LIKE ?";
      params.push(`${month}%`);
    } else if (from || to) {
      if (from) {
        sql += " AND date >= ?";
        params.push(from);
      }
      if (to) {
        sql += " AND date <= ?";
        params.push(to);
      }
    }
    if (accountId) {
      sql += " AND account_id = ?";
      params.push(accountId);
    }
    if (categoryId) {
      // Match category OR its parent
      sql += " AND (category_id = ? OR category_id IN (SELECT id FROM categories WHERE parent_id = ?))";
      params.push(categoryId, categoryId);
    }
    if (search) {
      sql += " AND label LIKE ?";
      params.push(`%${search}%`);
    }
    sql += " ORDER BY date DESC, rowid DESC";

    const rows = db.prepare(sql).all(...params);
    return NextResponse.json(rows);
  } catch (err) {
    console.error("[transactions GET]", err);
    return NextResponse.json({ error: "Erreur lecture transactions" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const db = getDb();
    db.transaction(() => {
      db.prepare("DELETE FROM transactions").run();
      db.prepare("UPDATE accounts SET balance = 0").run();
      db.prepare("UPDATE rules SET use_count = 0").run();
    })();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[transactions DELETE]", err);
    return NextResponse.json({ error: "Erreur suppression transactions" }, { status: 500 });
  }
}
