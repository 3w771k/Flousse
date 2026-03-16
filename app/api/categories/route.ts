import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const db = getDb();
    const categories = db.prepare("SELECT * FROM categories ORDER BY sort_order").all();
    return NextResponse.json(categories);
  } catch (err) {
    console.error("[categories GET]", err);
    return NextResponse.json({ error: "Erreur lecture catégories" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const db = getDb();
    let body: { id: string; budget: number }[] | { id: string; budget: number };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
    }
    const updates: { id: string; budget: number }[] = Array.isArray(body) ? body : [body];
    const stmt = db.prepare("UPDATE categories SET budget = ? WHERE id = ?");
    db.transaction(() => {
      for (const u of updates) stmt.run(u.budget, u.id);
    })();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[categories PATCH]", err);
    return NextResponse.json({ error: "Erreur mise à jour budgets" }, { status: 500 });
  }
}
