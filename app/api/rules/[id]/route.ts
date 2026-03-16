import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = getDb();
    const { id } = await params;
    db.prepare("DELETE FROM rules WHERE id = ?").run(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[rules DELETE]", err);
    return NextResponse.json({ error: "Erreur suppression règle" }, { status: 500 });
  }
}
