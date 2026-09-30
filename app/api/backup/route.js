import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { DATA_DIR, readConfig, writeConfig } from "@/lib/store";
import { readSecrets, writeSecrets, SECRET_KEYS } from "@/lib/secrets";
import { isAuthed } from "@/lib/auth";

export const dynamic = "force-dynamic";

const EXTS = ["webp", "jpg", "png", "avif"];
const unauthorized = () => NextResponse.json({ error: "unauthorized" }, { status: 401 });

// Copia completa: configuración + claves + fondo. Contiene secretos: hay que guardarla como tal.
export async function GET() {
  if (!(await isAuthed())) return unauthorized();
  let background = null;
  for (const ext of EXTS) {
    try { background = { ext, data: (await fs.readFile(path.join(DATA_DIR, "background." + ext))).toString("base64") }; break; } catch {}
  }
  const body = { app: "homepage", version: 1, exportedAt: new Date().toISOString(), config: await readConfig(), secrets: await readSecrets(), background };
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="homepage-backup.json"', "Cache-Control": "no-store" },
  });
}

export async function POST(req) {
  if (!(await isAuthed())) return unauthorized();
  let j;
  try { j = await req.json(); } catch { return NextResponse.json({ error: "JSON no válido" }, { status: 400 }); }
  if (j?.app !== "homepage" || !j.config || !Array.isArray(j.config.links)) return NextResponse.json({ error: "No es una copia de esta página" }, { status: 400 });

  const cur = await readConfig();
  const cfg = { ...j.config };
  let bg = null;
  if (j.background && EXTS.includes(j.background.ext) && typeof j.background.data === "string") {
    const buf = Buffer.from(j.background.data, "base64");
    if (buf.length && buf.length <= 15 * 1024 * 1024) bg = { ext: j.background.ext, buf };
  }
  cfg.appearance = { ...(cfg.appearance || {}), bgVersion: (cur.appearance.bgVersion || 0) + 1 };
  await writeConfig(cfg);

  // Sustituye las claves: las que no vienen en la copia se borran
  const patch = Object.fromEntries(SECRET_KEYS.map((k) => [k, typeof j.secrets?.[k] === "string" ? j.secrets[k] : ""]));
  await writeSecrets(patch);

  if (bg) {
    for (const e of EXTS) await fs.rm(path.join(DATA_DIR, "background." + e), { force: true });
    await fs.writeFile(path.join(DATA_DIR, "background." + bg.ext), bg.buf);
  }
  return NextResponse.json({ ok: true, background: !!bg });
}
