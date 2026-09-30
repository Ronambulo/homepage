import { NextResponse } from "next/server";
import { authEnabled, passwordOk, cookieOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Freno básico a la fuerza bruta: 5 fallos → 1 minuto de espera (en memoria).
let fails = 0, lockedUntil = 0;

export async function POST(req) {
  if (!authEnabled()) return NextResponse.json({ ok: true });
  if (Date.now() < lockedUntil) return NextResponse.json({ error: "Demasiados intentos, espera un minuto" }, { status: 429 });
  const { password } = await req.json().catch(() => ({}));
  if (!passwordOk(password)) {
    if (++fails >= 5) { fails = 0; lockedUntil = Date.now() + 60_000; }
    return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 401 });
  }
  fails = 0;
  const res = NextResponse.json({ ok: true });
  res.cookies.set(cookieOptions());
  return res;
}
