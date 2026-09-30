import fs from "node:fs/promises";
import path from "node:path";
import { DEFAULT_CONFIG, MODULES, THEMES, SEARCH_ENGINES } from "./defaults";

export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");

const str = (v, max, d = "") => (typeof v === "string" ? v.trim().slice(0, max) : d);
const isHttp = (u) => /^https?:\/\/[^\s]+$/i.test(u);
const clone = (o) => JSON.parse(JSON.stringify(o));

// Valida y completa cualquier entrada; nunca lanza.
export function sanitize(input) {
  const d = clone(DEFAULT_CONFIG);
  const c = input && typeof input === "object" ? input : {};

  const out = { version: 1, name: str(c.name, 40) };

  out.links = Array.isArray(c.links)
    ? c.links
        .map((l, i) => ({ id: str(l?.id, 24) || "l" + Date.now().toString(36) + i, name: str(l?.name, 40), url: str(l?.url, 300), icon: /^[a-z0-9-]{1,24}$/.test(l?.icon) ? l.icon : "" }))
        .filter((l) => l.name && isHttp(l.url))
        .slice(0, 24)
    : d.links;

  out.services = Array.isArray(c.services)
    ? c.services
        .map((l, i) => ({ id: str(l?.id, 24) || "s" + Date.now().toString(36) + i, name: str(l?.name, 40), url: str(l?.url, 300) }))
        .filter((l) => l.name && isHttp(l.url))
        .slice(0, 24)
    : out.links.map(({ id, name, url }) => ({ id, name, url }));

  const h = c.hosts || {};
  out.hosts = {
    local: str(h.local, 100, d.hosts.local),
    alt: str(h.alt, 100),
    probe: isHttp(str(h.probe, 300)) ? str(h.probe, 300) : "",
  };
  if (!c.hosts) out.hosts = d.hosts;

  const seen = new Set();
  const mods = [];
  for (const m of Array.isArray(c.modules) ? c.modules : []) {
    if (MODULES[m?.id] && !seen.has(m.id)) { seen.add(m.id); mods.push({ id: m.id, enabled: m.enabled !== false }); }
  }
  for (const id of Object.keys(MODULES)) if (!seen.has(id)) mods.push({ id, enabled: !MODULES[id].off });
  out.modules = mods;

  const a = c.appearance || {};
  out.appearance = {
    theme: THEMES[a.theme] ? a.theme : d.appearance.theme,
    intensity: Number.isFinite(+a.intensity) ? Math.max(0, Math.min(100, Math.round(+a.intensity))) : 100,
    showSearch: a.showSearch !== false,
    searchEngine: SEARCH_ENGINES[a.searchEngine] ? a.searchEngine : "Google",
    bgVersion: Number.isFinite(+a.bgVersion) ? +a.bgVersion : 0,
  };

  const fmUrl = str(c.fm?.url, 300).replace(/\/+$/, "");
  out.fm = { url: c.fm ? (isHttp(fmUrl) || fmUrl === "" ? fmUrl : d.fm.url) : d.fm.url };

  const it = c.integrations || {};
  const url = (v) => { const u = str(v, 300).replace(/\/+$/, ""); return isHttp(u) ? u : ""; };
  const ent = (v) => (/^[a-z_]+\.[a-z0-9_]+$/.test(str(v, 100)) ? str(v, 100) : "");
  out.integrations = {
    srv: { disk: str(it.srv?.disk, 200, "/") || "/", zima: url(it.srv?.zima) },
    dp: { url: url(it.dp?.url) },
    im: { url: url(it.im?.url) },
    ha: { url: url(it.ha?.url), temp: ent(it.ha?.temp), roomba: ent(it.ha?.roomba), boiler: ent(it.ha?.boiler) },
  };

  const al = c.alerts || {}, num = (v, lo, hi, def) => (Number.isFinite(+v) && v !== "" && v !== null ? Math.min(hi, Math.max(lo, Math.round(+v))) : def);
  out.alerts = { downMin: num(al.downMin, 1, 1440, 10), temp: num(al.temp, 30, 120, 75), driveTemp: num(al.driveTemp, 30, 100, 55), disk: num(al.disk, 50, 100, 90) };

  const w = c.weather;
  out.weather =
    w && typeof w.name === "string" && Number.isFinite(+w.lat) && Number.isFinite(+w.lon)
      ? { name: str(w.name, 80), lat: +w.lat, lon: +w.lon }
      : null;

  return out;
}

export async function readConfig() {
  try {
    return sanitize(JSON.parse(await fs.readFile(CONFIG_FILE, "utf8")));
  } catch {
    return sanitize(DEFAULT_CONFIG);
  }
}

export async function writeConfig(input) {
  const cfg = sanitize(input);
  await fs.mkdir(DATA_DIR, { recursive: true });
  // copia de seguridad rotativa (las 10 últimas) de la versión anterior si cambia
  try {
    const next = JSON.stringify(cfg, null, 2), prev = await fs.readFile(CONFIG_FILE, "utf8").catch(() => null);
    if (prev && prev !== next) {
      const dir = path.join(DATA_DIR, "backups");
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, "config-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json"), prev);
      const old = (await fs.readdir(dir)).filter((f) => f.startsWith("config-")).sort().slice(0, -10);
      await Promise.all(old.map((f) => fs.unlink(path.join(dir, f)).catch(() => {})));
    }
  } catch {}
  const tmp = CONFIG_FILE + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(cfg, null, 2));
  await fs.rename(tmp, CONFIG_FILE);
  return cfg;
}
