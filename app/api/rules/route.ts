import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const db = getDb();
    const rules = db.prepare(`
      SELECT r.id, r.pattern, r.category_id, r.use_count, c.name as category_name
      FROM rules r
      JOIN categories c ON c.id = r.category_id
      ORDER BY r.use_count DESC
    `).all();
    return NextResponse.json(rules);
  } catch (err) {
    console.error("[rules GET]", err);
    return NextResponse.json({ error: "Erreur lecture règles" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = getDb();
    let body: { pattern?: string; categoryId?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
    }
    const { pattern, categoryId } = body;
    if (!pattern || !categoryId) return NextResponse.json({ error: "pattern and categoryId required" }, { status: 400 });

    db.prepare(`
      INSERT INTO rules (pattern, category_id) VALUES (?, ?)
      ON CONFLICT(pattern) DO UPDATE SET category_id = excluded.category_id
    `).run(pattern.toUpperCase(), categoryId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[rules POST]", err);
    return NextResponse.json({ error: "Erreur création règle" }, { status: 500 });
  }
}
