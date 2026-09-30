import { NextResponse } from "next/server";
import { widget } from "@/lib/widgets";
import { isAuthed } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(_req, { params }) {
  if (!(await isAuthed())) return NextResponse.json({ ok: false, auth: true, error: "inicia sesión en Editar" }, { status: 401 });
  const v = await widget((await params).kind);
  if (!v) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(v, { headers: { "Cache-Control": "no-store" } });
}
