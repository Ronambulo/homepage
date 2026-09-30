import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { DATA_DIR } from "@/lib/store";
import { isAuthed } from "@/lib/auth";

export const dynamic = "force-dynamic";

const TYPES = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png", "image/avif": "avif" };
const MIME = Object.fromEntries(Object.entries(TYPES).map(([m, e]) => [e, m]));
const MAX = 15 * 1024 * 1024;

async function findCustom() {
  for (const ext of Object.values(TYPES)) {
    const p = path.join(DATA_DIR, "background." + ext);
    try { await fs.access(p); return { p, ext }; } catch {}
  }
  return null;
}
const clear = async () => { for (const ext of Object.values(TYPES)) await fs.rm(path.join(DATA_DIR, "background." + ext), { force: true }); };

export async function GET() {
  const custom = await findCustom();
  const file = custom ? custom.p : path.join(process.cwd(), "public", "bg.webp");
  const ext = custom ? custom.ext : "webp";
  const buf = await fs.readFile(file);
  return new NextResponse(buf, { headers: { "Content-Type": MIME[ext], "Cache-Control": "public, max-age=31536000, immutable" } });
}

export async function POST(req) {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const file = (await req.formData().catch(() => null))?.get("file");
  if (!file || typeof file === "string") return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  const ext = TYPES[file.type];
  if (!ext) return NextResponse.json({ error: "Formato no admitido (webp, jpg, png, avif)" }, { status: 415 });
  if (file.size > MAX) return NextResponse.json({ error: "Máximo 15 MB" }, { status: 413 });
  await fs.mkdir(DATA_DIR, { recursive: true });
  await clear();
  await fs.writeFile(path.join(DATA_DIR, "background." + ext), Buffer.from(await file.arrayBuffer()));
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await clear();
  return NextResponse.json({ ok: true });
}
