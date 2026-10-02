import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { webSearch, summarize, readPages } from "@/lib/websearch";
import { webAnswer } from "@/lib/webanswer";
import { owui } from "@/lib/owui";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

// Kero busca en internet desde el servidor (el navegador no puede leer otras webs por CORS)
export async function GET(req) {
  if (!(await isAuthed())) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q") || "";
  const v = await webSearch(q);
  return NextResponse.json({ ...v, summary: summarize(v) }, { headers: NO_STORE });
}

// Con la IA: busca, lee las mejores páginas y el modelo contesta citando las fuentes.
// Si la IA está apagada o falla, el resumen sin IA de siempre. Body: { q: consulta, question: la pregunta tal cual }
export async function POST(req) {
  if (!(await isAuthed())) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 }); }
  const q = String(body?.q || "").slice(0, 200), question = String(body?.question || q).slice(0, 300);
  const v = await webSearch(q);
  const res = { ok: v.ok, q: v.q, source: v.source, error: v.error };
  if (!v.ok) return NextResponse.json({ ...res, summary: summarize(v) }, { headers: NO_STORE });
  const ow = await owui();
  if (ow.base && ow.co.ai && ow.co.webAI !== false) {
    await readPages(v);
    const a = await webAnswer(v, question, ow);
    if (a) return NextResponse.json({ ...res, summary: { text: a.text, sources: a.sources, ai: true, dropped: a.dropped } }, { headers: NO_STORE });
  }
  return NextResponse.json({ ...res, summary: summarize(v) }, { headers: NO_STORE });
}
