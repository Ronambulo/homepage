export const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
export const timeout = (ms) => (typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined);
export const eur = (n, d = 0) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: d }).format(n);
export const signed = (n, d = 0) => (n > 0 ? "+" : n < 0 ? "−" : "") + eur(Math.abs(n), d);

// Si el host local no responde, se usa el alternativo con el mismo puerto.
export const resolveUrl = (url, hosts, useAlt) =>
  useAlt && hosts.alt && hosts.local ? url.split(hosts.local).join(hosts.alt) : url;

export async function probeHost(hosts) {
  if (!hosts.alt || !hosts.probe) return false;
  try { await fetch(hosts.probe, { mode: "no-cors", signal: timeout(1500), cache: "no-store" }); return false; }
  catch { return true; }
}

export async function probeLink(url) {
  try { await fetch(url, { mode: "no-cors", signal: timeout(2500), cache: "no-store" }); return true; }
  catch { return false; }
}

export async function geocode(name) {
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=es`, { signal: timeout(6000) });
  const g = (await r.json()).results?.[0];
  return g ? { name: g.name, lat: g.latitude, lon: g.longitude } : null;
}

export async function probeLinkTimed(url) {
  const t = performance.now();
  const up = await probeLink(url);
  return { up, ms: up ? Math.round(performance.now() - t) : null };
}
