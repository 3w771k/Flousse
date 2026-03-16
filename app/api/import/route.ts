import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { parseCsv } from "@/lib/parsers";
import { applyRules, classifyWithClaude } from "@/lib/classify";
import { randomUUID } from "crypto";

// Phase 1: Analyze only — parse, classify, return preview WITHOUT inserting
export async function POST(req: NextRequest) {
  try {
    const db = getDb();
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const accountId = formData.get("accountId") as string | null;

    if (!file || !accountId) {
      return NextResponse.json({ error: "file and accountId required" }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      return NextResponse.json({ error: "Seuls les fichiers CSV sont acceptés" }, { status: 400 });
    }

    const account = db.prepare("SELECT id FROM accounts WHERE id = ?").get(accountId);
    if (!account) return NextResponse.json({ error: "account not found" }, { status: 404 });

    const content = await file.text();
    const rawTxs = parseCsv(file.name, content);

    if (rawTxs.length === 0) {
      return NextResponse.json({ error: "no transactions parsed" }, { status: 422 });
    }

    // Deduplicate against existing transactions
    const existingLabels = new Set(
      (db.prepare("SELECT date || '|' || label || '|' || amount as key FROM transactions WHERE account_id = ?")
        .all(accountId) as { key: string }[]).map((r) => r.key)
    );

    const newTxs = rawTxs.filter(
      (t) => !existingLabels.has(`${t.date}|${t.label}|${t.amount}`)
    );

    if (newTxs.length === 0) {
      return NextResponse.json({ imported: 0, duplicates: rawTxs.length, preview: [], categorySummary: [], transactions: [] });
    }

    // Apply rules first
    const toClassify: { id: string; label: string; amount: number }[] = [];
    const withRules = newTxs.map((t) => {
      const id = randomUUID();
      const ruleMatch = applyRules(db, t.label);
      if (ruleMatch) {
        return { id, ...t, categoryId: ruleMatch, confidence: 1.0, source: "rule" as const };
      }
      toClassify.push({ id, label: t.label, amount: t.amount });
      return { id, ...t, categoryId: "divers", confidence: 0.1, source: "llm" as const };
    });

    // Classify remaining with Claude (batched)
    const classified = await classifyWithClaude(db, toClassify);
    const classifiedMap = new Map(classified.map((c) => [c.id, c]));

    const finalTxs = withRules.map((t) => {
      const cls = classifiedMap.get(t.id);
      if (cls) return { ...t, categoryId: cls.categoryId, confidence: cls.confidence };
      return t;
    });

    // Build category summary
    const catCounts: Record<string, { name: string; count: number; unclassified: boolean }> = {};
    for (const t of finalTxs) {
      if (!catCounts[t.categoryId]) {
        const cat = db.prepare("SELECT name FROM categories WHERE id = ?").get(t.categoryId) as { name: string } | undefined;
        catCounts[t.categoryId] = { name: cat?.name || "Non classé", count: 0, unclassified: t.categoryId === "divers" };
      }
      catCounts[t.categoryId].count++;
    }
    const categorySummary = Object.entries(catCounts)
      .map(([id, v]) => ({ id, name: v.name, count: v.count, unclassified: v.unclassified }))
      .sort((a, b) => b.count - a.count);

    // Preview (first 20)
    const preview = finalTxs.slice(0, 20).map((t) => {
      const cat = db.prepare("SELECT name FROM categories WHERE id = ?").get(t.categoryId) as { name: string } | undefined;
      return {
        label: t.label,
        amount: t.amount,
        category: cat?.name || "Non classé",
        unclassified: t.categoryId === "divers",
      };
    });

    // Return everything INCLUDING full transaction data for phase 2 confirmation
    return NextResponse.json({
      imported: finalTxs.length,
      duplicates: rawTxs.length - newTxs.length,
      rulesApplied: finalTxs.filter((t) => t.source === "rule").length,
      aiClassified: finalTxs.filter((t) => t.source === "llm" && t.categoryId !== "divers").length,
      unclassified: finalTxs.filter((t) => t.categoryId === "divers").length,
      categorySummary,
      preview,
      // Full data for confirmation step
      transactions: finalTxs.map((t) => ({
        id: t.id, date: t.date, label: t.label, amount: t.amount,
        categoryId: t.categoryId, confidence: t.confidence, source: t.source,
      })),
      accountId,
    });
  } catch (err) {
    console.error("[import POST]", err);
    return NextResponse.json({ error: "Erreur lors de l'import" }, { status: 500 });
  }
}
