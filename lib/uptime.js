import fs from "node:fs/promises";
import path from "node:path";
import { DATA_DIR } from "./store";

const FILE = path.join(DATA_DIR, "uptime.json");
const INC = path.join(DATA_DIR, "incidents.json");
const MAX_INC = 20;
export const DAYS = 30;

const dayKey = (d) => {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export function lastDays(n = DAYS) {
  const out = [], t = new Date();
  for (let i = n - 1; i >= 0; i--) { const d = new Date(t); d.setDate(t.getDate() - i); out.push(dayKey(d)); }
  return out;
}

async function read() {
  try { return JSON.parse(await fs.readFile(FILE, "utf8")) || {}; } catch { return {}; }
}

// incidents: { [serviceId]: { since: ms|null, list: [{ s, e }] } } — s/e en ms; since = caída abierta
async function readInc() {
  try { return JSON.parse(await fs.readFile(INC, "utf8")) || {}; } catch { return {}; }
}

// data: { [serviceId]: { [YYYY-MM-DD]: [ok, total] } }, solo los últimos 30 días
export async function readUptime() {
  const days = lastDays(), data = await read(), out = {};
  for (const [id, byDay] of Object.entries(data)) {
    out[id] = {};
    for (const k of days) if (byDay?.[k]) out[id][k] = byDay[k];
  }
  const inc = await readInc(), cut = Date.now() - DAYS * 864e5, incidents = {};
  for (const [id, v] of Object.entries(inc)) incidents[id] = { since: v.since || null, list: (v.list || []).filter((x) => x.e >= cut) };
  return { days, services: out, incidents };
}

let queue = Promise.resolve();

// results: [{ id, up }]; solo se guardan ids que existen en el config
export function recordUptime(results, validIds) {
  queue = queue.then(async () => {
    const data = await read(), k = dayKey(new Date()), days = new Set(lastDays());
    for (const r of results) {
      if (!validIds.has(r.id)) continue;
      const cur = (data[r.id] ||= {});
      const [ok, tot] = cur[k] || [0, 0];
      cur[k] = [ok + (r.up ? 1 : 0), tot + 1];
    }
    for (const id of Object.keys(data)) {
      if (!validIds.has(id)) { delete data[id]; continue; }
      for (const d of Object.keys(data[id])) if (!days.has(d)) delete data[id][d];
    }
    const inc = await readInc(), nowMs = Date.now(), cut = nowMs - DAYS * 864e5;
    for (const r of results) {
      if (!validIds.has(r.id)) continue;
      const i = (inc[r.id] ||= { since: null, list: [] });
      if (!r.up && !i.since) i.since = nowMs;
      else if (r.up && i.since) { i.list.push({ s: i.since, e: nowMs }); i.since = null; }
    }
    for (const id of Object.keys(inc)) {
      if (!validIds.has(id)) { delete inc[id]; continue; }
      inc[id].list = inc[id].list.filter((x) => x.e >= cut).slice(-MAX_INC);
    }
    await fs.mkdir(DATA_DIR, { recursive: true });
    for (const [f, v] of [[FILE, data], [INC, inc]]) {
      const tmp = f + ".tmp";
      await fs.writeFile(tmp, JSON.stringify(v));
      await fs.rename(tmp, f);
    }
  }).catch(() => {});
  return queue;
}
