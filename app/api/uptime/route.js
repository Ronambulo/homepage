import { NextResponse } from "next/server";
import { readConfig } from "@/lib/store";
import { readUptime, recordUptime } from "@/lib/uptime";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  return NextResponse.json(await readUptime(), { headers: NO_STORE });
}

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const results = Array.isArray(body?.results) ? body.results.slice(0, 24).map((r) => ({ id: String(r?.id || ""), up: !!r?.up })) : [];
  const cfg = await readConfig();
  await recordUptime(results, new Set((cfg.services || []).map((s) => s.id)));
  return NextResponse.json(await readUptime(), { headers: NO_STORE });
}
