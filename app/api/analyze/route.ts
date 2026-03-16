import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import Anthropic from "@anthropic-ai/sdk";

const PROMPTS: Record<string, string> = {
  synthese: "Fais une synthèse concise du mois en cours : revenus, dépenses, crédits, solde net, observations clés. 3-4 phrases max.",
  anomalies: "Identifie les anomalies : transactions inhabituelles, montants anormaux vs moyenne, doublons potentiels, transactions non classées. Sois précis.",
  optimisations: "Propose 3-4 optimisations concrètes basées sur les dépenses : abonnements à revoir, catégories en dépassement, habitudes à changer.",
  projections: "Projette les 6 prochains mois : solde cumulé estimé, impacts des crédits immobiliers, effet des loyers lillois si reçus, jalons importants.",
};

export async function POST(req: NextRequest) {
  try {
    const db = getDb();

    let body: { type: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
    }

    const { type } = body;
    if (!PROMPTS[type]) return NextResponse.json({ error: "invalid type" }, { status: 400 });

    const apiKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'claude_api_key'").get() as { value: string } | undefined;
    const apiKey = apiKeyRow?.value || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "no_api_key" }, { status: 422 });

    // Build financial context
    const currentMonth = new Date().toISOString().slice(0, 7);
    const txs = db.prepare(`
      SELECT t.label, t.amount, t.date, c.name as category, c.type as cat_type
      FROM transactions t
      JOIN categories c ON c.id = t.category_id
      WHERE t.date LIKE ?
      ORDER BY t.date DESC
    `).all(`${currentMonth}%`) as { label: string; amount: number; date: string; category: string; cat_type: string }[];

    const totals = txs.reduce((acc, t) => {
      if (t.cat_type === "income") acc.income += t.amount;
      else if (t.cat_type === "expense") acc.expense += Math.abs(t.amount);
      else if (t.cat_type === "dette") acc.credits += Math.abs(t.amount);
      return acc;
    }, { income: 0, expense: 0, credits: 0 });

    const context = `
Mois : ${currentMonth}
Revenus : ${totals.income.toFixed(0)}€
Dépenses courantes : ${totals.expense.toFixed(0)}€
Crédits : ${totals.credits.toFixed(0)}€
Solde net : ${(totals.income - totals.expense - totals.credits).toFixed(0)}€

Transactions du mois :
${txs.map((t) => `${t.date} | ${t.label} | ${t.amount > 0 ? "+" : ""}${t.amount}€ | ${t.category}`).join("\n")}

Contexte famille :
- 2 immeubles locatifs Lille (mise en péril — loyers non perçus ~1300€/mois)
- Crédits immo : 906€ + 562€/mois
- Prêt perso : 185€/mois (fin juillet 2028)
- 2 filles : Adèle et Gabrielle
`;

    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: `${PROMPTS[type]}\n\nDonnées financières :\n${context}\n\nRéponds en français, en texte brut (PAS de HTML, PAS de balises). Utilise des retours à la ligne pour séparer les points. 3-5 phrases max.`,
        },
      ],
    });

    let text = message.content[0]?.type === "text" ? message.content[0].text : "";
    // Strip any markdown code blocks Claude might wrap the response in
    text = text.replace(/^```(?:html)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
    // Convert plain text line breaks to HTML for rendering
    const html = text
      .split(/\n{2,}/)
      .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
      .join("");
    return NextResponse.json({ content: html });
  } catch (err) {
    console.error("[analyze] Error:", err);
    const message = err instanceof Error ? err.message : "Erreur inconnue";

    if (message.includes("401") || message.includes("authentication") || message.includes("invalid x-api-key")) {
      return NextResponse.json({ error: "api_key_invalid", message: "Clé API invalide. Vérifiez votre clé dans Paramètres." }, { status: 401 });
    }
    if (message.includes("429") || message.includes("rate")) {
      return NextResponse.json({ error: "rate_limit", message: "Limite de requêtes atteinte. Réessayez dans quelques secondes." }, { status: 429 });
    }
    if (message.includes("insufficient") || message.includes("credit") || message.includes("billing")) {
      return NextResponse.json({ error: "billing", message: "Crédit API insuffisant. Rechargez votre compte Anthropic." }, { status: 402 });
    }

    return NextResponse.json({ error: "api_error", message: `Erreur API Claude : ${message}` }, { status: 500 });
  }
}
