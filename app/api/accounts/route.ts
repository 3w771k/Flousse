import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const db = getDb();
    const accounts = db.prepare("SELECT * FROM accounts ORDER BY bank, name").all();
    return NextResponse.json(accounts);
  } catch (err) {
    console.error("[accounts GET]", err);
    return NextResponse.json({ error: "Erreur lecture comptes" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = getDb();
    let body: { id?: string; name?: string; bank?: string; icon?: string; type?: string; balance?: number };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
    }

    const { id, name, bank, icon, type, balance } = body;
    if (!id || !name || !bank || !type) {
      return NextResponse.json({ error: "id, name, bank, type required" }, { status: 400 });
    }

    db.prepare("INSERT INTO accounts (id, name, bank, icon, type, balance) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, name, bank, icon || "\uD83D\uDCB3", type, balance || 0);

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error("[accounts POST]", err);
    const message = err instanceof Error ? err.message : "";
    if (message.includes("UNIQUE constraint")) {
      return NextResponse.json({ error: "Ce compte existe déjà" }, { status: 409 });
    }
    return NextResponse.json({ error: "Erreur création compte" }, { status: 500 });
  }
}
