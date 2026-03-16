import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { applyRules, classifyWithClaude } from "@/lib/classify";

export const maxDuration = 300;

// GET — stats on unclassified transactions
export async function GET() {
  try {
    const db = getDb();
    const total = (db.prepare("SELECT COUNT(*) as count FROM transactions").get() as { count: number }).count;
    const unclassified = (db.prepare("SELECT COUNT(*) as count FROM transactions WHERE category_id = 'divers'").get() as { count: number }).count;
    return NextResponse.json({ total, unclassified });
  } catch (err) {
    console.error("[reclassify GET]", err);
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}

// POST — reclassify transactions
// body: { mode: "unclassified" | "all" }
export async function POST(req: NextRequest) {
  try {
    const { mode } = await req.json() as { mode: "unclassified" | "all" };
    const db = getDb();

    const rows = (mode === "all"
      ? db.prepare("SELECT id, label, amount FROM transactions").all()
      : db.prepare("SELECT id, label, amount FROM transactions WHERE category_id = 'divers'").all()
    ) as { id: string; label: string; amount: number }[];

    if (rows.length === 0) {
      return NextResponse.json({ total: 0, reclassifiedByRules: 0, reclassifiedByAI: 0, stillUnclassified: 0 });
    }

    // 1. Apply rules first
    const ruleUpdates: { id: string; categoryId: string }[] = [];
    const toClassify: { id: string; label: string; amount: number }[] = [];

    for (const tx of rows) {
      const match = applyRules(db, tx.label, tx.amount);
      if (match) {
        ruleUpdates.push({ id: tx.id, categoryId: match });
      } else {
        toClassify.push(tx);
      }
    }

    // Apply rule updates in a transaction
    const updateRule = db.prepare("UPDATE transactions SET category_id = ?, source = 'rule', confidence = 1.0 WHERE id = ?");
    db.transaction(() => {
      for (const u of ruleUpdates) updateRule.run(u.categoryId, u.id);
    })();

    // 2. Classify remaining with Claude (parallel batches)
    const classified = await classifyWithClaude(db, toClassify);

    // Apply Claude results
    const updateAI = db.prepare("UPDATE transactions SET category_id = ?, source = 'llm', confidence = ? WHERE id = ?");
    db.transaction(() => {
      for (const r of classified) updateAI.run(r.categoryId, r.confidence, r.id);
    })();

    const reclassifiedByAI = classified.filter((r) => r.categoryId !== "divers").length;
    const stillUnclassified = classified.filter((r) => r.categoryId === "divers").length;

    return NextResponse.json({
      total: rows.length,
      reclassifiedByRules: ruleUpdates.length,
      reclassifiedByAI,
      stillUnclassified,
    });
  } catch (err) {
    console.error("[reclassify POST]", err);
    return NextResponse.json({ error: "Erreur lors de la reclassification" }, { status: 500 });
  }
}
