import { readConfig } from "./store";
import { owui } from "./owui";
import { host, plain, blocklist, blocked, agree, summarize } from "./lunares/web.js";

// Búsqueda en internet para Kero. Por orden:
//   1. SearXNG (si está configurado): buscador de verdad, sirve para noticias y actualidad.
//   2. DuckDuckGo HTML: a veces responde, pero a los servidores suele devolverles un control antibots.
//   3. DuckDuckGo respuestas instantáneas y Wikipedia: solo cultura general, con las palabras clave.
// Devuelve pocos resultados y cortos: un modelo pequeño se pierde con mucho texto.

const T = (ms) => AbortSignal.timeout(ms);
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36", "Accept-Language": "es-ES,es;q=0.9" };
const BOT = { "User-Agent": "HomePage-Kero/1.0", "Accept-Language": "es-ES,es;q=0.9" };
const cache = new Map(); // consulta -> { at, v }
const TTL = 10 * 60000;

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const text = (h) => String(h || "")
  .replace(/<[^>]+>/g, "")
  .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, k) => ENT[k.toLowerCase()] ?? (k[0] === "#" ? String.fromCodePoint(/^#x/i.test(k) ? parseInt(k.slice(2), 16) : +k.slice(1)) : m))
  .replace(/\s+/g, " ").trim();

// «¿quién ganó la última Champions?» → «ultima champions»: Wikipedia y las respuestas instantáneas buscan por palabras
const STOP = new Set("a al algo alguien busca buscame cual cuales cuando cuanto cuanta cuantos cuantas como con de del dime donde el ella ellos en era es esta este esto eso fue fueron ha han hay la las le les lo los me mi mira oye para pero por porque que quien quienes sabes se sea ser si sobre son su sus te tu un una unos unas y ya gano gana ganaron dice dijo significa quiere decir hace hizo paso pasa".split(" "));
// actualidad: con Wikipedia sale cualquier cosa, así que sin buscador de verdad mejor decir que no
const NEWS = /\b(gan[oa]|ganaron|ultim[oa]s?|noticias?|hoy|ayer|esta semana|resultado|marcador|partido|precio|cotiza|estreno|sale|elecciones|actualidad|ahora mismo|tiempo en)\b/;
const keywords = (q) => plain(q).replace(/[^\p{L}\p{N}\s-]/gu, " ").split(/\s+/).filter((w) => w && !STOP.has(w)).join(" ");

async function searx(base, q) {
  const r = await fetch(`${base}/search?format=json&language=es&safesearch=1&q=${encodeURIComponent(q)}`, { headers: BOT, signal: T(8000), cache: "no-store" });
  if (r.status === 403) throw new Error("SearXNG: activa el formato JSON en settings.yml");
  if (!r.ok) throw new Error("SearXNG " + r.status);
  const j = await r.json();
  const out = [];
  // las «answers»/«infoboxes» son respuestas directas (resultados de fútbol, conversiones, definiciones…)
  for (const a of j.answers || []) { const t = text(typeof a === "string" ? a : a?.answer); if (t) out.push({ title: "Respuesta directa", url: a?.url || "", text: t }); }
  for (const b of j.infoboxes || []) { const t = text(b.content); if (t) out.push({ title: b.infobox || "Ficha", url: b.urls?.[0]?.url || b.id || "", text: t }); }
  for (const x of j.results || []) { const t = text(x.content); if (t && x.url) out.push({ title: text(x.title), url: x.url, text: t }); if (out.length >= 5) break; }
  return out;
}

// La búsqueda web de OpenWebUI (Admin → Ajustes → Búsqueda web), con el motor que tenga puesto.
// Con «saltar embeddings» activado devuelve el texto de las páginas; si no, lo guarda en una colección y se le pregunta a ella.
async function owSearch({ base, headers }, q) {
  const r = await fetch(`${base}/api/v1/retrieval/process/web/search`, {
    method: "POST", headers, body: JSON.stringify({ queries: [q], query: q }), signal: T(25000), cache: "no-store",
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) {
    const d = String(j?.detail || "");
    if (/disabled|not enabled|desactiv/i.test(d) || r.status === 400) throw new Error("activa la búsqueda web en OpenWebUI (Panel de administración → Ajustes → Búsqueda web)");
    // el chat funciona con la misma clave, así que un 403 aquí es un permiso de OpenWebUI, no la clave
    if (r.status === 401 || r.status === 403) throw new Error("OpenWebUI no deja buscar con esta clave (403): en Panel de administración → Ajustes → General, si «Restricciones de endpoints de la clave API» está activado, añade /api/v1/retrieval/*; y en Usuarios → Grupos/Permisos activa «Búsqueda web»");
    throw new Error("OpenWebUI " + r.status);
  }
  const pick = (content, m = {}) => ({ title: text(m.title || m.name || host(m.source || "") || "Web"), url: m.source || m.url || "", text: text(content) });
  if (j?.docs?.length) return j.docs.slice(0, 4).map((d) => pick(d.content ?? d.page_content, d.metadata));
  const names = j?.collection_names || (j?.collection_name ? [j.collection_name] : []);
  if (!names.length) return [];
  const c = await fetch(`${base}/api/v1/retrieval/query/collection`, {
    method: "POST", headers, body: JSON.stringify({ collection_names: names, query: q, k: 3 }), signal: T(15000), cache: "no-store",
  });
  if (!c.ok) throw new Error("OpenWebUI " + c.status);
  const cj = await c.json().catch(() => null);
  const docs = cj?.documents?.[0] || [], meta = cj?.metadatas?.[0] || [];
  return docs.slice(0, 4).map((d, i) => pick(d, meta[i]));
}

async function ddg(q) {
  const r = await fetch("https://html.duckduckgo.com/html/", {
    method: "POST", headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ q, kl: "es-es" }), signal: T(5000), cache: "no-store",
  });
  if (r.status !== 200) return []; // 202 = control antibots
  const html = await r.text(), out = [];
  for (const b of html.split(/class="result results_links/).slice(1)) {
    if (/result--ad/.test(b.slice(0, 200))) continue;
    const a = b.match(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    const s = b.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
    if (!a || !s) continue;
    let url = a[1].replace(/&amp;/g, "&");
    const u = url.match(/[?&]uddg=([^&]+)/); if (u) url = decodeURIComponent(u[1]);
    if (url.startsWith("//")) url = "https:" + url;
    if (/duckduckgo\.com\/y\.js/.test(url)) continue; // anuncios
    out.push({ title: text(a[2]), url, text: text(s[1]) });
    if (out.length >= 4) break;
  }
  return out;
}

async function instant(kw) {
  const r = await fetch(`https://api.duckduckgo.com/?format=json&no_html=1&skip_disambig=1&kl=es-es&q=${encodeURIComponent(kw)}`, { headers: BOT, signal: T(5000), cache: "no-store" });
  if (!r.ok) return [];
  const j = await r.json().catch(() => null);
  const out = [];
  if (j?.Answer) out.push({ title: "Respuesta directa", url: "", text: text(j.Answer) });
  if (j?.AbstractText) out.push({ title: j.Heading || kw, url: j.AbstractURL || "", text: j.AbstractText });
  else if (j?.Definition) out.push({ title: j.Heading || kw, url: j.DefinitionURL || "", text: j.Definition });
  return out;
}

async function wiki(kw) {
  const s = await fetch(`https://es.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(kw)}&srlimit=3&format=json&utf8=1`, { headers: BOT, signal: T(5000), cache: "no-store" });
  if (!s.ok) return [];
  // solo artículos cuyo título comparte alguna palabra con la pregunta (si no, Wikipedia devuelve cualquier cosa)
  const words = kw.split(" ").filter((w) => w.length > 2);
  const hits = ((await s.json())?.query?.search || []).filter((h) => words.some((w) => plain(h.title).includes(w)));
  if (!hits.length) return [];
  const top = await fetch(`https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(hits[0].title.replace(/ /g, "_"))}`, { headers: BOT, signal: T(5000), cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return hits.slice(0, 2).map((h, i) => ({
    title: h.title,
    url: "https://es.wikipedia.org/wiki/" + encodeURIComponent(h.title.replace(/ /g, "_")),
    text: i === 0 && top?.extract ? top.extract : text(h.snippet),
  }));
}

// dos resultados como mucho por web y sin repetir enlaces: así la respuesta se contrasta entre sitios distintos
function merge(list, add, source, block = []) {
  for (const r of add) {
    if (!r.text) continue;
    const site = host(r.url) || source.toLowerCase();
    if (blocked(site, block)) continue;
    if (r.url && list.some((x) => x.url === r.url)) continue;
    if (list.filter((x) => x.site === site).length >= 2) continue;
    const head = plain(r.text).slice(0, 80);
    if (list.some((x) => plain(x.text).slice(0, 80) === head)) continue;
    list.push({ ...r, site, from: source, text: r.text.slice(0, 700) });
  }
  return list;
}
const sites = (list) => new Set(list.map((r) => r.site)).size;

export async function webSearch(q) {
  q = String(q || "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (!q) return { ok: false, error: "sin consulta", results: [] };
  const sx = (await readConfig()).integrations?.searx || {}, block = blocklist(sx.block);
  const key = q.toLowerCase() + "|" + block.join(","), hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.v;
  const base = (sx.url || "").replace(/\/+$/, "");
  const ow = await owui();
  const kw = keywords(q) || q, news = NEWS.test(plain(q));
  const steps = [
    base && ["SearXNG", () => searx(base, q)],
    ["DuckDuckGo", () => ddg(q)],
    // OpenWebUI carga el servidor de casa: solo si lo demás apenas ha encontrado nada
    ow.base && ["OpenWebUI", () => owSearch(ow, q), 2],
    // de enciclopedia: para actualidad sacan cualquier cosa, así que ahí no se usan
    !news && ["Wikipedia", () => wiki(kw)],
    !news && ["DuckDuckGo", () => instant(kw)],
  ].filter(Boolean);
  // se va sumando de varias fuentes hasta tener al menos tres webs distintas
  let results = [], used = [], error = "";
  for (const [name, fn, skipAt] of steps) {
    if (sites(results) >= 3 && results.length >= 4) break;
    if (skipAt && sites(results) >= skipAt) continue;
    try {
      const n = results.length;
      merge(results, await fn(), name, block);
      if (results.length > n && !used.includes(name)) used.push(name);
    } catch (e) { error = error || e?.message || name; }
  }
  results = results.slice(0, 6);
  const v = results.length
    ? { ok: true, q, source: used.join(" + "), results, agree: agree(results, q) }
    : { ok: false, q, error: error || (news && !base && !ow.base ? "sin buscador" : "sin resultados"), results: [] };
  if (v.ok) { cache.set(key, { at: Date.now(), v }); if (cache.size > 100) cache.delete(cache.keys().next().value); }
  return v;
}

// Respuesta armada con frases de las webs (sin IA) y los enlaces de donde salen
export { summarize };
