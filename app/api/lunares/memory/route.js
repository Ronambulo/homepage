import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { readMemory, changeMemory } from "@/lib/kero";
import { upsertFact, removeFact, SPECIAL } from "@/lib/lunares/memory.js";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };
const fail = (error, status = 400) => NextResponse.json({ error }, { status, headers: NO_STORE });
const ok = (facts) => NextResponse.json({ facts }, { headers: NO_STORE });
const when = (v) => (Number.isFinite(v) && v > 0 && v <= Date.now() + 60000 ? v : Date.now());
// datos especiales (charla, plan, gusto de estilo): solo lo que vale
const extraOf = (b) => !SPECIAL.has(b?.kind) ? {} : {
  kind: b.kind,
  ...(typeof b.key === "string" ? { key: b.key.slice(0, 80) } : {}),
  ...(b.kind === "plan" && Number.isFinite(b.due) ? { due: b.due, ...(b.allday === true ? { allday: true } : {}) } : {}),
};

// GET → { facts }
export async function GET() {
  if (!(await isAuthed())) return fail("unauthorized", 401);
  return ok(await readMemory());
}

// POST { op: "add", text, id?, at?, kind?, key?, due?, allday? } | { op: "del", id } | { op: "clear" } | { op: "merge", facts: [{ text, at }] } → { facts }
// El navegador apunta el cambio al momento en su copia y lo manda después (si no hay conexión, espera en cola).
export async function POST(req) {
  if (!(await isAuthed())) return fail("unauthorized", 401);
  let b;
  try { b = await req.json(); } catch { return fail("bad json"); }
  const text = typeof b?.text === "string" ? b.text.trim().slice(0, 200) : "";
  try {
    switch (b?.op) {
      case "add":
        if (!text) return fail("sin texto");
        return ok(await changeMemory((l) => upsertFact(l, text, when(b.at), b.id, extraOf(b)).list));
      case "del":
        if (typeof b.id !== "string") return fail("sin id");
        return ok(await changeMemory((l) => removeFact(l, b.id)));
      case "clear":
        return ok(await changeMemory(() => []));
      case "merge": {
        const add = (Array.isArray(b.facts) ? b.facts : []).slice(0, 200)
          .map((x) => ({ text: typeof x?.text === "string" ? x.text.slice(0, 200) : "", at: when(x?.at) })).filter((x) => x.text)
          .sort((x, y) => x.at - y.at);
        return ok(await changeMemory((l) => add.reduce((acc, x) => upsertFact(acc, x.text, x.at).list, l)));
      }
    }
  } catch {
    return fail("no se pudo guardar", 500);
  }
  return fail("op desconocida");
}
