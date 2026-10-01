import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { webSearch, summarize } from "@/lib/websearch";

export const dynamic = "force-dynamic";

// Kero busca en internet desde el servidor (el navegador no puede leer otras webs por CORS)
export async function GET(req) {
  if (!(await isAuthed())) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q") || "";
  const v = await webSearch(q);
  return NextResponse.json({ ...v, summary: summarize(v) }, { headers: { "Cache-Control": "no-store" } });
}
