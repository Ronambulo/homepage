// Kero: respuestas de internet escritas por la IA (sin red: lo que se hace con el HTML y con la respuesta).
// La IA lee las fuentes y contesta citándolas con [n]; luego se comprueba que cada cifra y cada nombre
// propio sale de verdad en alguna fuente. Lo que no sale, se quita.
import { untag, plain, host } from "./web.js";
import { terms } from "./memory.js";
import { nums, sameNum } from "./numbers.js";

/* ---------- 3.1: el texto de una página ---------- */

const NOISE = /<(script|style|noscript|svg|nav|header|footer|aside|form|iframe|button|select|template|figure)\b[\s\S]*?<\/\1\s*>/gi;
const JUNK = /cookies?|suscr[ií]b|newsletter|inicia sesi[oó]n|reg[ií]strate|haz clic|pulsa aqu|s[ií]guenos|publicidad|todos los derechos|aviso legal|pol[ií]tica de privacidad|descarga la app|ap[uú]ntate/i;
// los párrafos del contenido principal (sin menús, cabeceras, pies ni avisos de cookies)
export function extract(html) {
  const h = String(html || "").replace(/<!--[\s\S]*?-->/g, " ").replace(NOISE, " ");
  const out = [], seen = new Set();
  for (const m of h.matchAll(/<(p|li|blockquote|dd|td)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)) {
    const t = untag(m[2]);
    if (t.length < 60 || t.length > 1500 || (t.length < 250 && JUNK.test(t))) continue;
    const k = plain(t).slice(0, 80);
    if (seen.has(k)) continue;
    seen.add(k); out.push(t);
    if (out.length >= 120) break;
  }
  return out;
}

// los párrafos que más se parecen a la pregunta (BM25, como la memoria), en el orden de la página
export function bestParas(paras, q, k = 4) {
  const qt = [...new Set(terms(q))];
  if (!qt.length || !paras?.length) return (paras || []).slice(0, Math.min(k, 2));
  const docs = paras.map((p, i) => ({ p, i, t: terms(p) }));
  const N = docs.length, avg = docs.reduce((a, d) => a + d.t.length, 0) / N || 1;
  const idf = Object.fromEntries(qt.map((w) => { const df = docs.filter((d) => d.t.includes(w)).length; return [w, Math.log(1 + (N - df + 0.5) / (df + 0.5))]; }));
  const scored = docs.map((d) => {
    let s = 0;
    for (const w of qt) {
      let tf = d.t.filter((x) => x === w).length;
      if (!tf && w.length >= 4) tf = d.t.filter((x) => x.length >= 4 && (x.startsWith(w) || w.startsWith(x))).length * 0.6;
      if (tf) s += idf[w] * (tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * d.t.length / avg));
    }
    return { ...d, s: s - d.i * 0.01 }; // a igualdad, lo de arriba de la página
  });
  return scored.filter((d) => d.s > 0).sort((a, b) => b.s - a.s).slice(0, k).sort((a, b) => a.i - b.i).map((d) => d.p);
}

/* ---------- 3.3: mejores consultas ---------- */

const FILLER = /^(?:oye|kero|lunares|por favor|perdona|me puedes decir|puedes decirme|podrias decirme|sabes|dime|quiero saber|me gustaria saber|una pregunta)\b[\s,:]*/i;
// → { q: consulta, range: "day" | "week" | "month" | null (para SearXNG) }
export function refine(q, now = Date.now()) {
  let s = String(q || "").replace(/[¿?¡!]+/g, " ").replace(/\s+/g, " ").trim();
  for (let i = 0; i < 4 && FILLER.test(s); i++) s = s.replace(FILLER, "");
  s = s.replace(/[\s,]+por favor$/i, "").trim();
  const t = plain(s);
  const range = /\b(hoy|ahora mismo|esta (manana|tarde|noche))\b/.test(t) ? "day" : /\b(ayer|esta semana)\b/.test(t) ? "week" : /\beste mes\b/.test(t) ? "month" : null;
  // actualidad sin año: se le pone el de ahora para que no salgan noticias viejas
  if (!/\b(19|20)\d{2}\b/.test(t) && /\b(ultim[oa]s?|este ano|actual(es|mente)?|vigente|reciente(s|mente)?|nuev[oa]s?|ahora)\b/.test(t)) s += " " + new Date(now).getFullYear();
  return { q: s || String(q || "").trim(), range };
}

/* ---------- 3.2: fuentes para el modelo y comprobación de lo que dice ---------- */

const site = (r) => String(r.site || host(r.url) || "web").replace(/^(?:es|m|amp)\./, "");
// [1] elpais.com — título: texto… (≈ len caracteres en total) + lo que confirman varias webs
export function sourcesFor(v, { len = 3000, max = 5 } = {}) {
  const res = (v?.results || []).filter((r) => r?.text || r?.paras?.length).slice(0, max);
  const per = Math.max(350, Math.floor(len / Math.max(1, res.length)));
  const list = res.map((r, i) => {
    const body = (r.paras?.length ? r.paras.join(" ") : r.text).replace(/\s+/g, " ").trim();
    const text = body.length > per ? body.slice(0, per).replace(/\s+\S*$/, "") + "…" : body;
    return { n: i + 1, site: site(r), url: r.url || "", title: r.title || "", text };
  });
  const lines = list.map((s) => `[${s.n}] ${s.site}${s.title && !/^respuesta directa$/i.test(s.title) ? ` — ${s.title}` : ""}: ${s.text}`);
  if (v?.agree?.length) lines.push(`Confirmado por varias fuentes: ${v.agree.join(", ")}.`);
  return { list, prompt: lines.join("\n") };
}

// palabras con mayúscula que no son nombres propios aunque vayan en mayúscula
const COMMON = new Set("el la los las un una unos unas en este esta estos estas ese esa se su sus hay es fue con para por desde tras segun al del lo que cuando durante aunque ademas hoy ayer manana si no ya pero y o asi tambien sin embargo eso esto aqui alli yo tu".split(" "));
const CAP = /(^|[\s(«"'¿¡-])(\p{Lu}[\p{L}\p{M}'’-]*|\p{Lu}{2,})/gu;

// Quita las frases cuyas cifras o nombres propios no salen en las fuentes (ni en la pregunta).
// → { text, bad: [frases quitadas] }
export function checkWeb(answer, sources, q = "") {
  const pool = [].concat(sources).join(" \n ") + " \n " + q;
  const P = plain(pool), ok = nums(pool);
  const bad = [], out = [];
  for (const raw of String(answer || "").split(/(?<=[.!?…]["»)]?(?:\s*\[[\d,\s–-]+\])*)\s+/)) {
    const s = raw.trim();
    if (!s) continue;
    const bare = s.replace(/\[[\d,\s–-]+\]/g, " ");
    const wrongNum = nums(bare).some((v) => !ok.some((c) => sameNum(v, c)));
    let wrongName = false;
    for (const m of bare.matchAll(CAP)) {
      const w = m[2], at = m.index + m[1].length;
      const before = bare.slice(0, at).trimEnd();
      if (!before || /[.!?:…¿¡«"]$/.test(before)) continue; // empieza frase: no dice si es nombre propio
      const p = plain(w).replace(/['’-]+$/, "");
      if (p.length < 2 || COMMON.has(p)) continue;
      if (!P.includes(p)) { wrongName = true; break; }
    }
    if (wrongNum || wrongName) bad.push(s); else out.push(s);
  }
  return { text: out.join(" ").trim(), bad };
}

// «… [1][2]» → texto sin marcas + las fuentes citadas (en el orden en que se citan), para los enlaces de la burbuja
export function cites(text, list) {
  const used = [];
  let t = String(text || "").replace(/\s*\[([\d,\s–-]+)\]/g, (_, g) => {
    for (const p of g.split(/[,\s]+/)) {
      const [a, b] = p.split(/[–-]/).map(Number);
      for (let n = a; n <= (b || a) && n - a < 6; n++) if (Number.isFinite(n) && !used.includes(n)) used.push(n);
    }
    return "";
  });
  // sin emojis, markdown ni etiquetas de emoción
  t = t.replace(/\[[^\]\d]{1,16}\]/g, " ").replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "").replace(/[*_#`]/g, "").replace(/\s+([.,;:!?])/g, "$1").replace(/\s+/g, " ").trim();
  const sources = [];
  for (const n of used) {
    const s = (list || []).find((x) => x.n === n);
    if (s?.url && !sources.some((x) => x.url === s.url)) sources.push({ site: s.site, url: s.url });
  }
  if (!sources.length) for (const s of list || []) { if (sources.length >= 2) break; if (s.url && !sources.some((x) => x.url === s.url)) sources.push({ site: s.site, url: s.url }); }
  return { text: t, sources: sources.slice(0, 4) };
}

// lo que se le dice al modelo
export const WEB_RULES = `Contestas preguntas con lo que dicen las fuentes de internet que te paso (numeradas). Reglas:
- Usa solo lo que dicen las fuentes. Si no contestan a la pregunta, dilo en una frase y no rellenes con lo que tú creas.
- Primero la respuesta directa; después, el contexto que ayude. Entre 2 y 5 frases, en español de España, tuteando.
- Detrás de cada dato pon entre corchetes el número de la fuente de donde sale: [1], [2]. Si varias lo dicen, [1][3].
- Copia las cifras, fechas y nombres tal cual vienen en la fuente.
- Si las fuentes no coinciden, dilo («[1] dice…, pero según [2]…»).
- Si es algo que cambia (precios, resultados, cargos, noticias), di de cuándo es el dato si la fuente lo dice.
- Sin listas, markdown, emojis, enlaces ni etiquetas al principio.`;
