import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// Keys that are never returned in GET (sensitive)
const SENSITIVE_KEYS = new Set(["claude_api_key"]);

// Keys allowed to be written via PUT
const ALLOWED_KEYS = new Set([
  "claude_api_key",
  "immo_sci", "immo_lille40", "immo_lille19",
  "user_context",
  // Credit metadata
  "credit_hb-credit1_mensualite", "credit_hb-credit1_taux", "credit_hb-credit1_fin", "credit_hb-credit1_montant_initial",
  "credit_hb-credit2_mensualite", "credit_hb-credit2_taux", "credit_hb-credit2_fin", "credit_hb-credit2_montant_initial",
  "credit_hb-pretperso_mensualite", "credit_hb-pretperso_taux", "credit_hb-pretperso_fin", "credit_hb-pretperso_montant_initial",
]);

const MAX_VALUE_LENGTH = 10000;

export async function GET() {
  try {
    const db = getDb();
    const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
    const settings: Record<string, string> = {};
    for (const r of rows) {
      if (SENSITIVE_KEYS.has(r.key)) {
        // Mask: return whether key is set, not the value
        settings[r.key] = r.value ? "sk-ant-***" : "";
      } else {
        settings[r.key] = r.value;
      }
    }
    return NextResponse.json(settings);
  } catch (err) {
    console.error("[settings GET]", err);
    return NextResponse.json({ error: "Erreur lecture paramètres" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const db = getDb();
    let body: Record<string, string>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
    }
    const stmt = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
    db.transaction(() => {
      for (const [key, value] of Object.entries(body)) {
        if (!ALLOWED_KEYS.has(key)) continue;
        if (typeof value !== "string" || value.length > MAX_VALUE_LENGTH) continue;
        stmt.run(key, value);
      }
    })();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[settings PUT]", err);
    return NextResponse.json({ error: "Erreur sauvegarde paramètres" }, { status: 500 });
  }
}
