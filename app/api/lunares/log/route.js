import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { readConfig } from "@/lib/store";
import { readLog, writeLog } from "@/lib/kero";
import { logEntry } from "@/lib/lunares/log.js";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };
const fail = (error, status = 400) => NextResponse.json({ error }, { status, headers: NO_STORE });

// GET → { count } | ?download=1 → el archivo kero-log.jsonl
export async function GET(req) {
  if (!(await isAuthed())) return fail("unauthorized", 401);
  const list = await readLog();
  if (new URL(req.url).searchParams.get("download")) {
    return new NextResponse(list.map((e) => JSON.stringify(e)).join("\n") + (list.length ? "\n" : ""), {
      headers: { ...NO_STORE, "Content-Type": "application/x-ndjson; charset=utf-8", "Content-Disposition": 'attachment; filename="kero-log.jsonl"' },
    });
  }
  return NextResponse.json({ count: list.length }, { headers: NO_STORE });
}

// POST { why, q, route, next?, n? } → { count }. Solo si el registro está encendido en Editar → Kero.
export async function POST(req) {
  if (!(await isAuthed())) return fail("unauthorized", 401);
  if ((await readConfig()).companion?.log !== true) return fail("registro apagado", 403);
  let b;
  try { b = await req.json(); } catch { return fail("bad json"); }
  const e = logEntry(b);
  if (!e) return fail("línea no válida");
  try { return NextResponse.json({ count: await writeLog([e]) }, { headers: NO_STORE }); } catch { return fail("no se pudo guardar", 500); }
}

// DELETE → lo vacía
export async function DELETE() {
  if (!(await isAuthed())) return fail("unauthorized", 401);
  try { return NextResponse.json({ count: await writeLog([], true) }, { headers: NO_STORE }); } catch { return fail("no se pudo borrar", 500); }
}
