import { NextResponse } from "next/server";
import { resetDb } from "@/lib/db";

export async function POST() {
  try {
    resetDb();
    return NextResponse.json({ ok: true, message: "Base de données réinitialisée (clé API conservée)" });
  } catch (err) {
    console.error("[reset POST]", err);
    return NextResponse.json({ error: "Erreur lors du reset" }, { status: 500 });
  }
}
