import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { readSecrets, writeSecrets, SECRET_KEYS } from "@/lib/secrets";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };
const flags = (s) => Object.fromEntries(SECRET_KEYS.map((k) => [k, !!s[k]]));

// Nunca devuelve los valores, solo si están guardados.
export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(flags(await readSecrets()), { headers: NO_STORE });
}

export async function PUT(req) {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  return NextResponse.json(flags(await writeSecrets(body)), { headers: NO_STORE });
}
