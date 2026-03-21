import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { learnRule } from "@/lib/classify";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = getDb();
    const { id } = await params;

    let body: { categoryId?: string; learnPattern?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
    }

    const { categoryId, learnPattern } = body;
    if (!categoryId || typeof categoryId !== "string") {
      return NextResponse.json({ error: "categoryId required" }, { status: 400 });
    }

    // Validate category exists
    const cat = db.prepare("SELECT id FROM categories WHERE id = ?").get(categoryId);
    if (!cat) return NextResponse.json({ error: "Catégorie inexistante" }, { status: 400 });

    // Update transaction
    db.prepare("UPDATE transactions SET category_id = ?, confidence = 1.0, source = 'manual' WHERE id = ?")
      .run(categoryId, id);

    // Optionally learn a rule
    if (learnPattern) {
      learnRule(db, learnPattern, categoryId);
    }

    const updated = db.prepare("SELECT * FROM transactions WHERE id = ?").get(id);
    return NextResponse.json(updated);
  } catch (err) {
    console.error("[transactions PATCH]", err);
    return NextResponse.json({ error: "Erreur mise à jour transaction" }, { status: 500 });
  }
}
