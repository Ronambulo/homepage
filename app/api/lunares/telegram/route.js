import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { startBot, botStatus, unpair, pageSync, botTest } from "@/lib/kerobot";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };
const fail = (error, status = 400) => NextResponse.json({ error }, { status, headers: NO_STORE });
const ok = (j) => NextResponse.json(j, { headers: NO_STORE });

// GET → { token, on, err, name, paired, who, code } (el código para vincular, solo si aún no hay chat)
export async function GET() {
  if (!(await isAuthed())) return fail("unauthorized", 401);
  startBot();
  return ok(await botStatus());
}

// POST { op: "sync", f, rems } → { on, inbox, mem } (la página, cada minuto)
//      { op: "unpair" } | { op: "test" }
export async function POST(req) {
  if (!(await isAuthed())) return fail("unauthorized", 401);
  startBot();
  let b;
  try { b = await req.json(); } catch { return fail("bad json"); }
  switch (b?.op) {
    case "sync": return ok(await pageSync({ f: b.f && typeof b.f === "object" ? b.f : {}, rems: b.rems }));
    case "unpair": await unpair(); return ok(await botStatus());
    case "test": { const r = await botTest(); return r.ok ? ok(r) : fail(r.error, 502); }
  }
  return fail("op desconocida");
}
