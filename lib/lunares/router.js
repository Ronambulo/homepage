// Kero: por dónde va cada mensaje de la charla, sin IA. Lo usa la charla (talk.js) y el banco de preguntas de los tests.
//   open    → «abre Plex»: abre una de tus apps
//   command → recordatorios, tareas, memoria… (commands.js)
//   web     → lo busca en internet
//   answer  → datos de los widgets, exactos (brain.js)
//   ai      → todo lo demás, a la IA
// Cada ruta lleva `score` (0–1): por debajo de SURE, si la IA está encendida, decide ella (puede pedir buscar).
import { command } from "./commands.js";
import { webQuery, webSure, answer, topics } from "./brain.js";
import { searchFacts, SPECIAL } from "./memory.js";
import { norm } from "./text.js";
import { planOf } from "./plans.js";
import { learnedScore } from "./habits.js";

export const SURE = 0.8;

const OPEN = /^(?:abre|abrir|ábreme|ve a|vete a|llévame a)\s+(?:el |la |los |las |a )?(.+?)[.!?¡¿]*$/i;
// «abre Plex» → el enlace de la fila de apps (o null)
export function openLink(text, links = []) {
  const m = String(text || "").match(OPEN);
  if (!m) return null;
  const q = norm(m[1]);
  return links.find((x) => norm(x.name).includes(q) || q.includes(norm(x.name))) || null;
}

// lo que sabe de ti que contesta a una pregunta: los que casi empatan con el mejor, como mucho 3
export function recallFacts(list, q) {
  const hits = searchFacts((list || []).filter((f) => !SPECIAL.has(f.kind)), q, { k: 4 }).filter((h) => h.cover >= 0.5);
  return hits.filter((h) => h.score >= hits[0]?.score * 0.6).slice(0, 3).map((h) => h.fact);
}

/* ---------- faltas de ortografía en las palabras clave ---------- */
// solo palabras largas y sin vecinas de verdad a un error («cuanto»/«cuando» no: se confundirían entre sí)
const VOCAB = ["recuerdame", "recordatorio", "recordatorios", "temporizador", "buscame", "despiertame", "quien", "noticias", "wikipedia"];
const flat = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
// ¿a un error como mucho? (cambiar, sobrar o faltar una letra, o dos letras cambiadas de sitio)
export function near1(a, b) {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  while (i < la && i < lb && a[i] === b[i]) i++;
  if (la === lb) return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
  return la > lb ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}
// «temporisador de 5 minutos» → «temporizador de 5 minutos»; «qien es…» → «quien es…»
export function fixTypos(text) {
  return String(text || "").replace(/\p{L}+/gu, (w) => {
    const p = flat(w);
    if (p.length < 4 || VOCAB.includes(p)) return w;
    return VOCAB.find((v) => near1(p, v)) || w;
  });
}

/* ---------- seguimientos: «¿y mañana?», «¿y en Barcelona?», «¿y Jellyfin?» ---------- */
const FOLLOW = /^[\s¿¡]*y\s+\S/i;
const DAY = /\b(?:hoy|pasado mañana|mañana|esta (?:mañana|tarde|noche)|este (?:finde|fin de semana)|el finde|el fin de semana|esta semana|(?:el )?(?:lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo))\b/gi;
const YEAR = /\b(?:19|20)\d\d\b/;
const NAME = /(?:^|\s)((?:[A-ZÁÉÍÓÚÑ][\p{L}\d]*)(?:\s+[A-ZÁÉÍÓÚÑ][\p{L}\d]*)*)/gu;
const strip = (s) => String(s || "").replace(/[¿?¡!]+/g, " ").replace(/\s+/g, " ").trim();
// la pregunta anterior con lo que cambia la nueva (o null si no es un seguimiento)
export function followUp(prev, text) {
  if (!prev || !FOLLOW.test(text) || strip(text).split(" ").length > 8) return null;
  const p = strip(prev), c = strip(text).replace(/^y\s+/i, "");
  if (!p || !c) return null;
  // el año: «¿y en 2023?», «¿y el año anterior?»
  const yp = p.match(YEAR)?.[0];
  if (yp) {
    const yc = c.match(YEAR)?.[0];
    if (yc) return p.replace(yp, yc);
    if (/\baño (?:anterior|pasado|antes)\b/i.test(c)) return p.replace(yp, String(+yp - 1));
    if (/\baño (?:siguiente|que viene|después)\b/i.test(c)) return p.replace(yp, String(+yp + 1));
  }
  // el día: «¿y mañana?», «¿y el viernes?»
  if (c.replace(DAY, "").replace(/[\s,]+/g, "") === "") return `${p.replace(DAY, " ").replace(/\s+/g, " ").trim()} ${c}`;
  // el sitio: «¿y en Barcelona?»
  if (/^en\s+[A-ZÁÉÍÓÚÑ]/.test(c)) {
    const pp = p.match(/\ben\s+[A-ZÁÉÍÓÚÑ][\p{L}]*(?:\s+[A-ZÁÉÍÓÚÑ][\p{L}]*)*/u)?.[0];
    return pp ? p.replace(pp, c) : `${p} ${c}`;
  }
  // un nombre: «¿y Jellyfin?» tras «¿está caído Plex?» (el último nombre que no empieza la frase)
  const name = c.replace(/^(?:el|la|los|las|de|del)\s+/i, "");
  if (/^[A-ZÁÉÍÓÚÑ][\p{L}\d]*(?:\s+[A-ZÁÉÍÓÚÑ][\p{L}\d]*){0,2}$/u.test(name)) {
    const names = [...p.matchAll(NAME)].filter((m) => m.index > 0);
    const last = names[names.length - 1]?.[1];
    if (last) { const i = p.lastIndexOf(last); return p.slice(0, i) + name + p.slice(i + last.length); }
  }
  // lo demás se junta: «¿y la temperatura?» tras «¿cómo va el servidor?»
  return `${p}, ${c}`;
}

// ¿la orden se puede cumplir aquí? Si no, el mensaje sigue su camino (como si no fuera una orden).
//   snoozable: hay un aviso reciente que posponer
function usable(c, { facts, snoozable }) {
  if (!c) return null;
  if (c.type === "snooze" && c.bare && !snoozable) return usable(c.alt, { facts, snoozable });
  if (c.type === "recall" && c.q && c.soft) {
    // «¿qué tiempo hace en mi ciudad?» es del widget del tiempo, no de la memoria
    if (topics(c.q).length || !recallFacts(facts, c.q).length) return null;
  }
  return c;
}

function direct(text, { f, facts, snoozable, now }) {
  const link = openLink(text, f.links);
  if (link) return { type: "open", link, score: 1 };
  const c = usable(command(text, now), { facts, snoozable });
  // «¿cómo se llama mi gato?» sin saberlo: con la IA, mejor que conteste ella
  if (c) return { type: "command", c, score: c.type === "recall" && c.q && !recallFacts(facts, c.q).length ? 0.6 : 1 };
  // «mañana tengo un examen»: se apunta siempre; con IA, contesta ella
  const plan = planOf(text, now);
  if (plan) return { type: "plan", plan, score: 0.6 };
  const q = webQuery(text);
  if (q) return { type: "web", q, score: webSure(text) };
  const known = answer(text, f, now);
  if (known) return { type: "answer", text: known, score: 1 };
  return { type: "ai", score: 0 };
}

// → { type: "open", link } | { type: "command", c } | { type: "plan", plan } | { type: "web", q } | { type: "answer", text } | { type: "ai" }, con `score`
//   prev: la pregunta anterior de la charla; si esta es un seguimiento, `merged` es la pregunta completa
//   learned: lo que ha aprendido de tus «eso no» y de lo que elige la IA (habits.js); sube o baja `score`
//   fixed: el texto con las faltas corregidas, si ha cambiado algo
export function route(text, { learned = null, ...o } = {}) {
  const fixed = fixTypos(text);
  const r = learnedScore(firstRoute(fixed, o), learned, fixed, SURE);
  return fixed !== text ? { ...r, fixed } : r;
}
function firstRoute(text, { f = {}, facts = [], snoozable = false, now = Date.now(), prev = null }) {
  const o = { f, facts, snoozable, now }, own = direct(text, o);
  if (own.type === "open" || own.type === "command" || own.type === "plan" || !FOLLOW.test(text)) return own;
  // «¿y recuérdame…?»: una orden sigue siendo una orden
  const bare = direct(text.replace(/^[\s¿¡]*y\s+/i, ""), o);
  if (bare.type === "open" || bare.type === "command") return bare;
  if (!prev) return own;
  const merged = followUp(prev, text);
  if (!merged) return own;
  const r = direct(merged, o);
  return r.type === "answer" || r.type === "web" ? { ...r, merged } : own;
}
