import { NextResponse } from "next/server";
import { readConfig, writeConfig } from "@/lib/store";
import { isAuthed } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await readConfig(), { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(req) {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  return NextResponse.json(await writeConfig(body));
}
