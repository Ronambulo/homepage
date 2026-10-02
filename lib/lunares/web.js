// Kero: lo que se hace con los resultados de internet, sin IA.
// La respuesta se arma con frases sacadas tal cual de las webs (resumen extractivo): no se inventa nada
// y no carga el servidor con un modelo.

export const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
export const plain = (v) => String(v || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// «elpais.com, https://www.ejemplo.es/x» → ["elpais.com", "ejemplo.es"]
export const blocklist = (v) => String(v || "").toLowerCase().split(/[\s,;]+/).map((d) => d.replace(/^[a-z]+:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "")).filter((d) => d.includes("."));
export const blocked = (site, block) => block.some((d) => site === d || site.endsWith("." + d));

// Cifras y nombres que repiten al menos dos webs distintas: lo más fiable de la búsqueda
export function agree(results, q) {
  const skip = new Set(plain(q).split(/\W+/)), seen = new Map(); // dato -> webs
  for (const r of results) {
    const toks = new Set([
      ...(r.text.match(/\d+(?:[.,]\d+)*(?:\s?%|\s?(?:€|euros?|dólares|millones|años|km|grados))?/g) || []).filter((t) => t.replace(/\D/g, "").length >= 2),
      ...(r.text.match(/(?<![.!?]\s)(?<!^)\b\p{Lu}[\p{Ll}]{3,}(?:\s(?:de\s)?\p{Lu}[\p{Ll}]+)*/gu) || []).filter((t) => !skip.has(plain(t))),
    ]);
    for (const t of toks) { const k = plain(t); if (!seen.has(k)) seen.set(k, { t, s: new Set() }); seen.get(k).s.add(r.site); }
  }
  return [...seen.values()].filter((x) => x.s.size >= 2).sort((a, b) => b.s.size - a.s.size || b.t.length - a.t.length).slice(0, 6).map((x) => x.t);
}

// palabras que no dicen nada de qué se pregunta
const STOP = new Set("a al algo alguien busca buscame cual cuales cuando cuanto cuanta cuantos cuantas como con de del dime donde el ella ellos en era es esta este esto eso fue fueron ha han hay la las le les lo los me mi mira oye para pero por porque que quien quienes sabes se sea ser si sobre son su sus te tu un una unos unas y ya dice dijo hace hizo paso pasa sabes puedes buscar internet".split(" "));
// raíz corta para que «ganó», «ganador» y «ganaron» cuenten igual
const stem = (w) => w.length > 5 ? w.slice(0, 5) : w;
const words = (s) => plain(s).replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));

// relleno típico de las webs que no sirve como respuesta
const JUNK = /cookies?|suscr[ií]b|newsletter|inicia sesi[oó]n|reg[ií]strate|haz clic|pulsa aqu|leer m[aá]s|ver m[aá]s|s[ií]guenos|comparte|publicidad|todos los derechos|aviso legal|pol[ií]tica de privacidad|descarga la app|ap[uú]ntate|^\W*(foto|imagen|v[ií]deo)\b|\.\.\.\s*$|…\s*$/i;

// trozos de texto en frases completas (sin las cortadas por el buscador ni las preguntas)
export function sentences(t) {
  return String(t || "")
    .replace(/\s+/g, " ")
    .replace(/^(?:\w{3}\.? )?\d{1,2} (?:de )?\w{3,10}\.? (?:de )?\d{4}\s*[—–·-]\s*/i, "") // «12 may 2025 — » del buscador
    .split(/(?<=[.!?])\s+(?=[¿¡"«(]?\p{Lu}|\d)/u)
    .map((s) => s.trim())
    .filter((s) => s.length >= 30 && s.length <= 320 && /[.!]["»)]?$/.test(s) && !/\?["»)]?$/.test(s) && !JUNK.test(s));
}

const overlap = (a, b) => {
  const A = new Set(words(a).map(stem)), B = new Set(words(b).map(stem));
  if (!A.size || !B.size) return 0;
  let n = 0; for (const w of A) if (B.has(w)) n++;
  return n / (A.size + B.size - n);
};

const COMMON = /^(?:El|La|Los|Las|Un|Una|Unos|Unas|En|Este|Esta|Estos|Estas|Ese|Esa|Se|Su|Sus|Hay|Es|Fue|Con|Para|Por|Desde|Tras|Según|Al|Del|Lo|Que|Cuando|Durante|Aunque|Además|Hoy|Ayer|Mañana)\b/;
const tidySite =(s) => String(s || "").replace(/^(?:es|m|amp)\./, "");

// Los resultados → { text: «Según elpais.com: … Y en as.com: …», sources: [{ site, url }] }
export function summarize(v, { max = 3, len = 520 } = {}) {
  const results = (v?.results || []).filter((r) => r?.text);
  if (!results.length) return { text: "", sources: [] };
  const qw = [...new Set(words(v.q).map(stem))];
  const agreed = (v.agree || []).map(plain);
  const numQ = /\b(cuant[oa]s?|cuando|que (dia|fecha|hora|precio)|precio|cuesta|vale|resultado|marcador|edad|anos tiene|altura|poblacion)\b/.test(plain(v.q));
  const cands = [];
  results.forEach((r, ri) => {
    const direct = /^respuesta directa$/i.test(r.title || "");
    // una respuesta directa corta («3-1», «28 °C») vale entera aunque no sea una frase
    const list = sentences(r.text);
    if (!list.length && (direct || r.text.length < 200) && r.text.length >= 3) list.push(r.text.trim().replace(/[\s,;:]+$/, "") + (/[.!]$/.test(r.text.trim()) ? "" : "."));
    list.forEach((s, si) => {
      const p = plain(s), sw = new Set(words(s).map(stem));
      let score = 0;
      for (const w of qw) if (sw.has(w)) score += 2;
      for (const a of agreed) if (a && p.includes(a)) score += 1.5;
      if (numQ && /\d/.test(s)) score += 1.5;
      if (direct) score += 4;
      score -= ri * 0.4 + si * 0.6; // lo primero de los primeros resultados suele ser lo importante
      if (s.length > 240) score -= 1;
      if (qw.length && ![...qw].some((w) => sw.has(w)) && !direct) score -= 3;
      cands.push({ s, score, r });
    });
  });
  cands.sort((a, b) => b.score - a.score);
  // primero una frase de cada web (así se contrasta), luego lo mejor que quede
  const chosen = [], used = new Set();
  const fits = (c) => chosen.reduce((n, x) => n + x.s.length, 0) + c.s.length <= len && !chosen.some((x) => overlap(x.s, c.s) > 0.5);
  for (const c of cands) {
    if (chosen.length >= max) break;
    if (c.score < 0 || used.has(c.r.site) || !fits(c)) continue;
    chosen.push(c); used.add(c.r.site);
  }
  for (const c of cands) {
    if (chosen.length >= max) break;
    if (c.score < 1 || chosen.includes(c) || !fits(c)) continue;
    chosen.push(c);
  }
  // si nada encaja con la pregunta, al menos lo primero del primer resultado
  if (!chosen.length) {
    const c = cands.find((x) => x.r === results[0]) || cands[0];
    if (c) chosen.push({ ...c, s: c.s.length > len ? c.s.slice(0, len).replace(/\s+\S*$/, "") + "…" : c.s });
  }
  // en el orden de los resultados: queda más natural
  chosen.sort((a, b) => results.indexOf(a.r) - results.indexOf(b.r));
  let text = "", prev = null;
  chosen.forEach((c, i) => {
    const site = tidySite(c.r.site), direct = /^respuesta directa$/i.test(c.r.title || "");
    const lead = c.r.site === prev ? "" : direct || !site ? "" : i === 0 ? `Según ${site}: ` : `Y en ${site}: `;
    // «Según as.com: el Madrid…»: solo se pasa a minúscula una palabra corriente, nunca un nombre propio
    const s = lead && COMMON.test(c.s) ? c.s[0].toLowerCase() + c.s.slice(1) : c.s;
    text += (text ? " " : "") + lead + s;
    prev = c.r.site;
  });
  const sources = [];
  for (const c of chosen) if (c.r.url && !sources.some((x) => x.url === c.r.url)) sources.push({ site: tidySite(c.r.site), url: c.r.url });
  for (const r of results) { if (sources.length >= 3) break; if (r.url && !sources.some((x) => x.site === tidySite(r.site))) sources.push({ site: tidySite(r.site), url: r.url }); }
  return { text: text.trim(), sources: sources.slice(0, 3) };
}

/* ---------- respuestas de internet escritas por la IA (fase 3) ---------- */

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", laquo: "«", raquo: "»", hellip: "…", ndash: "–", mdash: "—", iexcl: "¡", iquest: "¿" };
const code = (n, m) => { try { return String.fromCodePoint(n); } catch { return m; } };
// HTML → texto plano
export const untag = (h) => String(h || "")
  .replace(/<[^>]+>/g, " ")
  .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, k) => ENT[k.toLowerCase()] ?? (k[0] === "#" ? code(/^#x/i.test(k) ? parseInt(k.slice(2), 16) : +k.slice(1), m) : m))
  .replace(/\s+/g, " ").replace(/\s+([.,;:!?)»])/g, "$1").trim();
