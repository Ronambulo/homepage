import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { owui } from "@/lib/owui";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

// Modelos disponibles en OpenWebUI, para elegirlos en Editar → Kero.
export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  const { base, headers } = await owui();
  if (!base) return NextResponse.json({ error: "Falta la URL de OpenWebUI en Conexiones." }, { status: 400, headers: NO_STORE });
  try {
    const r = await fetch(`${base}/api/models`, { headers, signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!r.ok) return NextResponse.json({ error: r.status === 401 || r.status === 403 ? "La clave de OpenWebUI no es válida." : `OpenWebUI ${r.status}` }, { status: 502, headers: NO_STORE });
    const j = await r.json();
    const models = (j?.data || [])
      .filter((m) => m?.id && m.owned_by !== "arena")
      .map((m) => ({ id: String(m.id), name: String(m.name || m.id), size: m.ollama?.details?.parameter_size || null }));
    return NextResponse.json({ models }, { headers: NO_STORE });
  } catch (e) {
    return NextResponse.json({ error: e?.name === "TimeoutError" ? "OpenWebUI no responde." : "No llego a OpenWebUI." }, { status: 502, headers: NO_STORE });
  }
}
