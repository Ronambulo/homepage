import fs from "node:fs/promises";
import os from "node:os";
import { readConfig } from "./store";
import { readSecrets } from "./secrets";

const T = (ms = 8000) => AbortSignal.timeout(ms);
const cache = new Map(); // kind -> { at, v }
const fail = (e) => ({ ok: false, error: String(e?.message || e).slice(0, 120) });

/* ── Servidor ─────────────────────────────────────────── */
let lastCpu = null;
function cpuNow() {
  const c = os.cpus().reduce((t, x) => { const v = Object.values(x.times); return [t[0] + v.reduce((a, b) => a + b, 0), t[1] + x.times.idle]; }, [0, 0]);
  let p = null;
  if (lastCpu && c[0] > lastCpu[0]) p = 1 - (c[1] - lastCpu[1]) / (c[0] - lastCpu[0]);
  lastCpu = c;
  return p;
}

/* ZimaOS: login en /v1/users/login y lectura de /v1/sys/utilization + /v2/local_storage/storage/stats */
let zimaToken = null;
const num = (v) => (Number.isFinite(+v) ? +v : null);
async function zimaGet(base, path) {
  const once = (auth) => fetch(base + path, { signal: T(), headers: { Authorization: auth } });
  let r = await once("Bearer " + zimaToken);
  if (r.status === 401) r = await once(zimaToken);
  return r;
}
// Busca recursivamente un objeto con total y used (varias nomenclaturas).
function findDisk(o, depth = 0) {
  if (!o || typeof o !== "object" || depth > 5) return null;
  const total = num(o.total ?? o.size ?? o.totalSize), used = num(o.used ?? o.usedSize ?? o.used_size);
  if (total > 0 && used != null) return { total, used };
  for (const v of Object.values(o)) { const x = findDisk(v, depth + 1); if (x) return x; }
  return null;
}
const zget = async (base, path) => { try { const r = await zimaGet(base, path); return r.ok ? (await r.json())?.data ?? null : null; } catch { return null; } };
// Contadores anteriores para calcular tasas (W, B/s) entre consultas.
let zprev = null;

async function zima(cfg, sec) {
  const base = cfg.integrations.srv.zima;
  if (!sec.zimaUser || !sec.zimaPass) throw new Error("faltan usuario y contraseña de ZimaOS");
  const login = async () => {
    const r = await fetch(base + "/v1/users/login", { method: "POST", signal: T(), headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: sec.zimaUser, password: sec.zimaPass }) });
    const j = await r.json().catch(() => ({}));
    const t = j?.data?.token?.access_token || j?.data?.token;
    if (!t || typeof t !== "string") throw new Error("login ZimaOS: " + (j.message || r.status));
    zimaToken = t;
  };
  if (!zimaToken) await login();
  let u = await zimaGet(base, "/v1/sys/utilization");
  if (u.status === 401) { await login(); u = await zimaGet(base, "/v1/sys/utilization"); }
  if (!u.ok) throw new Error("ZimaOS " + u.status);
  const d = (await u.json()).data || {};
  const cpu = d.cpu || {}, mem = d.mem || {};
  const total = num(mem.total), used = num(mem.used) ?? (total != null && num(mem.available) != null ? total - mem.available : null);
  let disk = null, raw = null;
  try {
    const s = await zimaGet(base, "/v2/local_storage/storage/stats");
    if (s.ok) { const j = await s.json(); disk = findDisk(j); if (!disk) raw = JSON.stringify(j).slice(0, 300); }
  } catch {}
  const temp = num(cpu.temperature);
  const [st, di, sl] = await Promise.all([zget(base, "/v2/local_storage/storage/stats"), zget(base, "/v2/local_storage/disk/info"), zget(base, "/v2/local_storage/storages")]);
  const now = Date.now() / 1000;
  const pw = cpu.power && typeof cpu.power === "object" ? cpu.power : null;
  const nets = (Array.isArray(d.net) ? d.net : []).filter((n) => n && n.name);
  const nu = nets.filter((n) => n.state === "up").sort((x, y) => num(y.bytesRecv) - num(x.bytesRecv))[0];
  let watts = null, rx = null, tx = null;
  if (zprev) {
    const dt = now - zprev.t;
    if (dt > 1) {
      if (pw && zprev.pw != null && num(pw.value) >= zprev.pw) watts = (pw.value - zprev.pw) / 1e6 / dt;
      if (nu && zprev.net?.name === nu.name && nu.bytesRecv >= zprev.net.rx) { rx = (nu.bytesRecv - zprev.net.rx) / dt; tx = (nu.bytesSent - zprev.net.tx) / dt; }
    }
  }
  zprev = { t: now, pw: pw ? num(pw.value) : null, net: nu ? { name: nu.name, rx: num(nu.bytesRecv), tx: num(nu.bytesSent) } : null };
  const drives = (Array.isArray(di) ? di : di?.disk ? [di.disk] : []).map((x) => ({ model: x.model, type: x.disk_type, temp: num(x.temperature) > 0 ? num(x.temperature) : null, hours: num(x.power_on_hours), health: x.health, size: num(x.size) }));
  const volumes = (Array.isArray(sl) ? sl : []).map((x) => ({ name: x.name, type: x.type, size: num(x.extensions?.size), used: num(x.extensions?.used), health: x.extensions?.health })).filter((x) => x.size);
  const sd = d.sys_disk || st?.sys_disk;
  if (!disk && num(sd?.size) > 0) disk = { total: sd.size, used: num(sd.used) ?? sd.size - sd.avail };
  return { cpuModel: cpu.model || null, watts, ramAvail: num(mem.available), net: nu ? { name: nu.name, rx, tx, total: { rx: num(nu.bytesRecv), tx: num(nu.bytesSent) } } : null, drives, volumes, ok: true, source: "zimaos", cpu: num(cpu.percent) == null ? null : Math.round(cpu.percent), cores: num(cpu.num), load: null, ramUsed: used, ramTotal: total, disk, temp: temp > 0 ? temp : null, uptime: null, ...(disk ? {} : { diskRaw: raw }) };
}

async function server(cfg, sec) {
  if (cfg.integrations.srv.zima) return zima(cfg, sec);
  let cpu = cpuNow();
  if (cpu == null) { await new Promise((r) => setTimeout(r, 400)); cpu = cpuNow(); }
  const total = os.totalmem();
  let avail = os.freemem();
  try {
    const m = await fs.readFile("/proc/meminfo", "utf8");
    const a = /MemAvailable:\s+(\d+)/.exec(m); if (a) avail = +a[1] * 1024;
  } catch {}
  let disk = null;
  for (const p of [cfg.integrations.srv.disk, "/"]) {
    try { const s = await fs.statfs(p || "/"); disk = { total: s.blocks * s.bsize, used: (s.blocks - s.bavail) * s.bsize }; break; } catch {}
  }
  let temp = null;
  try {
    const zones = (await fs.readdir("/sys/class/thermal")).filter((z) => z.startsWith("thermal_zone"));
    const ts = (await Promise.all(zones.map((z) => fs.readFile(`/sys/class/thermal/${z}/temp`, "utf8").then((x) => +x / 1000).catch(() => null)))).filter((n) => Number.isFinite(n) && n > 0 && n < 130);
    if (ts.length) temp = Math.max(...ts);
  } catch {}
  return { ok: true, cpu: cpu == null ? null : Math.round(cpu * 100), cores: os.cpus().length, load: os.loadavg()[0], ramUsed: total - avail, ramTotal: total, disk, temp, uptime: os.uptime() };
}

/* ── Calendario (iCal) ────────────────────────────────── */
const unfold = (t) => t.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
function pDate(v) {
  const m = /^(\d{4})(\d\d)(\d\d)(?:T(\d\d)(\d\d)(\d\d)?(Z)?)?$/.exec(v);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (h == null) return { d: new Date(+y, +mo - 1, +d), allDay: true };
  return { d: z ? new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s || 0))) : new Date(+y, +mo - 1, +d, +h, +mi, +(s || 0)), allDay: false };
}
const unesc = (s) => s.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1");
const DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

// Expande RRULE sencillas (DAILY/WEEKLY[BYDAY]/MONTHLY/YEARLY, INTERVAL, COUNT, UNTIL, EXDATE).
function expand(ev, from, to) {
  const out = [], dur = ev.end ? ev.end - ev.start : 0;
  const push = (s) => { const e = new Date(+s + dur); if (e >= from && s < to) out.push({ title: ev.title, start: s, end: e, allDay: ev.allDay }); };
  if (!ev.rrule) { push(ev.start); return out; }
  const r = Object.fromEntries(ev.rrule.split(";").map((p) => p.split("=")));
  const step = Math.max(1, +r.INTERVAL || 1), until = r.UNTIL ? pDate(r.UNTIL)?.d : null, max = +r.COUNT || Infinity;
  const byday = r.BYDAY ? r.BYDAY.split(",").map((x) => DAYS.indexOf(x.slice(-2))).filter((x) => x >= 0) : null;
  const tod = ev.start - new Date(ev.start).setHours(0, 0, 0, 0);
  let n = 0;
  for (let i = 0; i < 3000; i++) {
    const s = new Date(ev.start);
    if (r.FREQ === "DAILY") s.setDate(s.getDate() + i * step);
    else if (r.FREQ === "WEEKLY") s.setDate(s.getDate() + i * 7 * step);
    else if (r.FREQ === "MONTHLY") s.setMonth(s.getMonth() + i * step);
    else if (r.FREQ === "YEARLY") s.setFullYear(s.getFullYear() + i * step);
    else break;
    let cands = [s];
    if (r.FREQ === "WEEKLY" && byday?.length) {
      const wk = new Date(s); wk.setHours(0, 0, 0, 0); wk.setDate(wk.getDate() - wk.getDay());
      cands = byday.map((d) => { const c = new Date(wk); c.setDate(c.getDate() + d); return new Date(+c + tod); }).filter((c) => c >= ev.start).sort((a, b) => a - b);
    }
    for (const c of cands) {
      if ((until && c > until) || ++n > max || c >= to) return out;
      if (!ev.exdates.has(+c)) push(c);
    }
  }
  return out;
}

function parseIcs(text, from, to) {
  const evs = []; let cur = null;
  for (const line of unfold(text)) {
    if (line === "BEGIN:VEVENT") cur = { exdates: new Set() };
    else if (line === "END:VEVENT") { if (cur?.start) evs.push(cur); cur = null; }
    else if (cur) {
      const i = line.indexOf(":"); if (i < 0) continue;
      const name = line.slice(0, i).split(";")[0], val = line.slice(i + 1);
      if (name === "SUMMARY") cur.title = unesc(val);
      else if (name === "DTSTART") { const p = pDate(val); if (p) { cur.start = p.d; cur.allDay = p.allDay; } }
      else if (name === "DTEND") { const p = pDate(val); if (p) cur.end = p.d; }
      else if (name === "RRULE") cur.rrule = val;
      else if (name === "EXDATE") for (const v of val.split(",")) { const p = pDate(v); if (p) cur.exdates.add(+p.d); }
      else if (name === "STATUS" && val === "CANCELLED") cur.cancelled = true;
    }
  }
  return evs.filter((e) => !e.cancelled).flatMap((e) => expand(e, from, to));
}

async function calendar(cfg, sec) {
  if (!sec.icsUrl) return { ok: false, error: "sin configurar" };
  const r = await fetch(sec.icsUrl.replace(/^webcal:/i, "https:"), { signal: T(10000) });
  if (!r.ok) throw new Error("iCal " + r.status);
  const from = new Date(); from.setHours(0, 0, 0, 0);
  const to = new Date(+from + 8 * 864e5);
  const events = parseIcs(await r.text(), from, to)
    .sort((a, b) => a.start - b.start)
    .slice(0, 60)
    .map((e) => ({ title: e.title || "(sin título)", start: e.start.toISOString(), end: e.end.toISOString(), allDay: e.allDay }));
  return { ok: true, events };
}

/* ── GitHub ───────────────────────────────────────────── */
const GH_QUERY = `query($from: DateTime!) { viewer { login
  contributionsCollection(from: $from) { contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } } }
  repositories(first: 30, orderBy: {field: PUSHED_AT, direction: DESC}, ownerAffiliations: OWNER, isFork: false) { nodes { name defaultBranchRef { target { ... on Commit { committedDate messageHeadline statusCheckRollup { state } } } } } } }
  prs: search(query: "is:pr is:open author:@me archived:false", type: ISSUE, first: 6) { issueCount nodes { ... on PullRequest { number title repository { name } } } }
  issues: search(query: "is:issue is:open assignee:@me archived:false", type: ISSUE, first: 6) { issueCount nodes { ... on Issue { number title repository { name } } } } }`;

async function github(cfg, sec) {
  if (!sec.ghToken) return { ok: false, error: "sin configurar" };
  const from = new Date(Date.now() - 30 * 864e5).toISOString();
  const r = await fetch("https://api.github.com/graphql", { method: "POST", signal: T(10000), headers: { Authorization: "Bearer " + sec.ghToken, "Content-Type": "application/json", "User-Agent": "homepage" }, body: JSON.stringify({ query: GH_QUERY, variables: { from } }) });
  const j = await r.json();
  if (!r.ok || j.errors) throw new Error(j.message || j.errors?.[0]?.message || "GitHub " + r.status);
  const d = j.data, cal = d.viewer.contributionsCollection.contributionCalendar;
  const days = cal.weeks.flatMap((w) => w.contributionDays).sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-30);
  const counts = days.map((x) => x.contributionCount);
  let streak = 0, i = counts.length - 1;
  if (counts[i] === 0) i--;
  for (; i >= 0 && counts[i] > 0; i--) streak++;
  const repos = d.viewer.repositories.nodes.filter((n) => n.defaultBranchRef);
  const failing = repos.filter((n) => ["FAILURE", "ERROR"].includes(n.defaultBranchRef.target?.statusCheckRollup?.state));
  const last = repos.map((n) => ({ repo: n.name, at: n.defaultBranchRef.target?.committedDate, msg: n.defaultBranchRef.target?.messageHeadline })).filter((x) => x.at).sort((a, b) => (a.at < b.at ? 1 : -1))[0] || null;
  const item = (n) => ({ n: n.number, title: n.title, repo: n.repository.name });
  return { ok: true, user: d.viewer.login, total: counts.reduce((a, b) => a + b, 0), counts, streak, prs: { count: d.prs.issueCount, items: d.prs.nodes.filter((n) => n?.number).map(item) }, issues: { count: d.issues.issueCount, items: d.issues.nodes.filter((n) => n?.number).map(item) }, failing: failing.map((n) => n.name), last };
}

/* ── DiscoPanel (Connect, JSON) ───────────────────────── */
let dpToken = null;
async function dpCall(base, path, body, token) {
  const r = await fetch(base + "/discopanel.v1." + path, { method: "POST", signal: T(), headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, j };
}

async function discopanel(cfg, sec) {
  const base = cfg.integrations.dp.url;
  if (!base || !sec.dpUser || !sec.dpPass) return { ok: false, error: "sin configurar" };
  const list = async () => {
    let x = await dpCall(base, "ServerService/ListServers", { fullStats: true }, dpToken);
    if (x.status === 400) x = await dpCall(base, "ServerService/ListServers", {}, dpToken);
    return x;
  };
  let x = dpToken ? await list() : { status: 401 };
  if (x.status === 401) {
    const l = await dpCall(base, "AuthService/Login", { username: sec.dpUser, password: sec.dpPass });
    if (!l.j.token) throw new Error("login: " + (l.j.message || l.status));
    dpToken = l.j.token; x = await list();
  }
  if (x.status !== 200) throw new Error(x.j.message || "DiscoPanel " + x.status);
  const servers = (x.j.servers || []).map((s) => {
    const st = String(s.status ?? "");
    return { name: s.name, running: /RUNNING|UNHEALTHY/i.test(st), starting: /STARTING/i.test(st), players: +s.playersOnline || 0, max: +s.maxPlayers || 0, mem: +s.memory || 0, version: s.mcVersion || "" };
  });
  return { ok: true, servers };
}

/* ── Home Assistant ───────────────────────────────────── */
async function home(cfg, sec) {
  const { url, temp, roomba, boiler } = cfg.integrations.ha;
  if (!url || !sec.haToken) return { ok: false, error: "sin configurar" };
  const get = async (id) => {
    if (!id) return null;
    const r = await fetch(`${url}/api/states/${id}`, { signal: T(), headers: { Authorization: "Bearer " + sec.haToken } });
    if (r.status === 401) throw new Error("token no válido");
    return r.ok ? r.json() : null;
  };
  const [t, v, b] = await Promise.all([get(temp), get(roomba), get(boiler)]);
  // Los sensores dan la temperatura en el estado; las entidades weather.* en el atributo "temperature".
  const raw = t ? (Number.isFinite(parseFloat(t.state)) ? parseFloat(t.state) : parseFloat(t.attributes?.temperature)) : NaN;
  const num = Number.isFinite(raw) ? raw : null;
  return {
    ok: true,
    temp: num, tempState: t?.state || null, tempUnit: t?.attributes?.unit_of_measurement || t?.attributes?.temperature_unit || "°C", tempName: t?.attributes?.friendly_name || "",
    roomba: v ? { state: v.state, battery: v.attributes?.battery_level ?? null, name: v.attributes?.friendly_name || "Roomba" } : null,
    boiler: b ? { on: b.state === "on", since: b.last_changed, name: b.attributes?.friendly_name || "Caldera" } : null,
  };
}

/* ── Immich ───────────────────────────────────────────── */
async function immich(cfg, sec) {
  const base = cfg.integrations.im.url;
  if (!base || !sec.immichKey) return { ok: false, error: "sin configurar" };
  const h = { "x-api-key": sec.immichKey, Accept: "application/json" };
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  const [st, se] = await Promise.all([
    fetch(base + "/api/server/statistics", { headers: h, signal: T() }).catch(() => null),
    fetch(base + "/api/search/metadata", { method: "POST", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify({ createdAfter: midnight.toISOString(), size: 1000, order: "desc" }), signal: T() }),
  ]);
  if (se.status === 401 || se.status === 403) throw new Error("clave no válida");
  if (!se.ok) throw new Error("Immich " + se.status);
  const items = (await se.json())?.assets?.items || [];
  const sj = st?.ok ? await st.json().catch(() => null) : null;
  const t = (a) => Date.parse(a.createdAt || a.fileCreatedAt || "") || 0;
  const last = items.reduce((m, a) => Math.max(m, t(a)), 0);
  return {
    ok: true,
    today: items.length, capped: items.length >= 1000,
    todayVideos: items.filter((a) => a.type === "VIDEO").length,
    last: last || null,
    photos: Number.isFinite(sj?.photos) ? sj.photos : null, videos: Number.isFinite(sj?.videos) ? sj.videos : null, usage: Number.isFinite(sj?.usage) ? sj.usage : null,
  };
}

const KINDS = { im: [immich, 50000], srv: [server, 5000], cal: [calendar, 60000], gh: [github, 110000], dp: [discopanel, 10000], ha: [home, 10000] }; // algo por debajo del ritmo del cliente para que cada refresco traiga dato nuevo

export async function widget(kind) {
  const k = KINDS[kind];
  if (!k) return null;
  const hit = cache.get(kind);
  if (hit && Date.now() - hit.at < (hit.v.ok ? k[1] : 3000)) return hit.v;
  let v;
  try { const [cfg, sec] = await Promise.all([readConfig(), readSecrets()]); v = await k[0](cfg, sec); }
  catch (e) { if (kind === "dp") dpToken = null; if (kind === "srv") zimaToken = null; v = fail(e); }
  cache.set(kind, { at: Date.now(), v });
  return v;
}
