// Kero: órdenes que entiende sin IA (recordatorios, temporizadores, tareas y lo que le cuentas de ti).
// command(texto) → { type, … } o null si no es una orden.
import { parseWhen, duration } from "./when.js";
import { parseRepeat } from "./repeat.js";

const flat = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
// quita «que», «de», signos… del principio y del final de lo que queda
const clean = (s) => String(s || "").replace(/^[\s,.:;¿¡!?-]+|[\s,.:;¿¡!?-]+$/g, "")
  .replace(/^(?:que|de|el|lo de|para|a)\s+/i, "").replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, "").trim();

// prefijo (sobre el texto sin acentos, que mide lo mismo que el original) → resto del texto original
function after(src, re) {
  const f = flat(src), m = re.exec(f);
  if (!m) return null;
  return { m, rest: src.slice(m.index + m[0].length) };
}

const REMIND = /^\s*(?:oye,?\s+|porfa,?\s+|por favor,?\s+)?(?:recuerdame|recordarme|avisame|acuerdate de (?:decirme|avisarme|recordarme)|despiertame|ponme un (?:recordatorio|aviso)|pon(?:me)? un recordatorio|crea un recordatorio|recordatorio|aviso)\b(?:\s*(?:de|que|para|:))?/;
const TIMER = /^\s*(?:pon(?:me)?|crea|inicia|empieza|activa)?\s*(?:un |una )?(?:temporizador|timer|cuenta atras|alarma)\b(?:\s*(?:de|para|en|:))?/;
const LIST_REM = /\b(?:que|cuales|cuantos) (?:recordatorios|avisos)|(?:mis|los|tus) recordatorios|que me (?:tienes|tenias|vas) (?:que|a) recordar|lista de recordatorios|(?:hay|tengo) (?:algun )?recordatorios?/;
const UNREM = /^\s*(?:borra|quita|cancela|elimina|anula)(?:me)?\s+(?:el |la |los |las |todos los |todas las )?(?:recordatorios?|avisos?|temporizador(?:es)?|alarmas?)\b(?:\s*(?:del|de|que|para)\b)?/;
const TODO = /^\s*(?:apunta|apuntame|anota|anotame|anade|agrega|mete|pon)(?:\s+(?:en|a)\s+(?:la lista(?: de tareas)?|las tareas|tareas|mis tareas|pendientes))?(?:\s*(?:que|:))?\s+|^\s*(?:nueva tarea|tarea nueva|tarea|pendiente)\s*:\s*/;
const TODO_TAIL = /\s+(?:a|en)\s+(?:la lista(?: de tareas)?|las tareas|tareas|mis tareas|pendientes)\s*$/;
const DONE = /^\s*(?:ya\s+)?(?:he\s+)?(?:hecho|terminado|acabado|completado|hice|termine|acabe)\s+(?:lo de\s+|con\s+)?|^\s*(?:marca|marcame|tacha|tachame|completa|da por hech[oa])\s+(?:como hech[oa]\s+)?(?:la tarea\s+|lo de\s+)?|^\s*(?:tarea\s+)?(?:hecha|terminada|completada)\s*:?\s*/;
const REMEMBER = /^\s*(?:recuerda|acuerdate de|no olvides|apunta en tu memoria|guarda en tu memoria|que sepas)\s+que\s+|^\s*(?:recuerda|apunta en tu memoria)\s*:\s*/;
const ABOUT_ME = /^\s*(?:me llamo|mi nombre es|soy (?:de|del)|vivo en|trabajo (?:en|de|como)|tengo \d+ anos|mi cumple(?:anos)? es|me (?:gusta|gustan|encanta|encantan|chifla|chiflan|flipa|flipan)|no me (?:gusta|gustan)|odio|mi \w+ (?:favorit[oa] )?(?:es|son|se llama))\b/;
const FORGET = /^\s*(?:olvida|olvidate de|borra de tu memoria|ya no recuerdes)(?:\s+(?:que|lo de))?\s+/;
const FORGET_ALL = /^\s*(?:olvida|olvidate de|borra) (?:todo|todo lo que sabes de mi|lo que sabes de mi|tu memoria)\s*[.!]?\s*$/;
const RECALL = /\bque (?:sabes|recuerdas|te acuerdas) (?:de|sobre) mi\b|\bque te he contado\b|\bque sabes de mi\b|\bme conoces\b/;

// posponer el último aviso: «luego», «pospónlo», «en 10 minutos», «recuérdamelo en media hora»…
const SNOOZE_VERB = /^\s*(?:pospon(?:lo|melo|me)?|aplaza(?:lo|melo)?|retrasa(?:lo|melo)?|recuerdamelo|recuerdamelo otra vez|avisame|avisame otra vez|dimelo|vuelve a (?:avisarme|recordarmelo|decirmelo))\b/;
const SNOOZE_SOFT = /^\s*(?:recuerdamelo|avisame|dimelo)/; // también podrían ser un recordatorio nuevo
const LATER = /^(?:luego|mas tarde|despues|en un rato|dentro de un rato|un rato|ahora no|ahora no puedo|otro rato|un poco mas tarde)$/;
const DUR_ONLY = /^(?:(?:en|dentro de)\s+)?(?:(?:\d+(?:[.,]\d+)?|[a-z]+)\s*(?:segundos?|segs?|minutos?|mins?|horas?|hrs?|h|m)\b|\b(?:una?|media|y|medi[ao]|cuarto|de|hora|rato|momento)\b|\s)+$/;
const DEFAULT_SNOOZE = 10 * 60000;
function snooze(f) {
  const m = SNOOZE_VERB.exec(f);
  const rest = (m ? f.slice(m[0].length) : f).replace(/[.,!¡?¿]+/g, " ").replace(/\s+/g, " ").trim().replace(/^otra vez\s*/, "");
  let ms = 0;
  if (!rest) ms = m ? DEFAULT_SNOOZE : 0;
  else if (LATER.test(rest)) ms = /rato/.test(rest) ? duration("un rato") : DEFAULT_SNOOZE;
  // solo una duración («en 20 minutos», «pospónlo media hora»); sin verbo, tiene que empezar por «en» o «dentro de»
  else if (rest.length <= 40 && (m || /^(?:en|dentro de)\s/.test(rest)) && DUR_ONLY.test(rest)) ms = duration(rest.replace(/^(?:en|dentro de)\s+/, ""));
  if (!ms) return null;
  return { type: "snooze", ms, bare: !m || SNOOZE_SOFT.test(f) };
}

export function command(text, now = Date.now(), { noSnooze = false } = {}) {
  const src = String(text || "").normalize("NFC").trim();
  const f = flat(src);
  if (!src || src.length > 300) return null;
  let a;

  // solo vale justo después de un aviso; si no lo hay, `alt` es lo que sería sin posponer
  const sn = !noSnooze && snooze(f);
  if (sn) {
    if (!sn.bare) return sn;
    const alt = command(text, now, { noSnooze: true });
    return { ...sn, alt: alt?.fromRemind ? null : alt }; // «avísame luego» no es una tarea que se llame «luego»
  }

  if (FORGET_ALL.test(f)) return { type: "forget", all: true };
  if (RECALL.test(f)) return { type: "recall" };
  if ((a = after(src, UNREM))) {
    const rest = clean(a.rest);
    return { type: "unremind", all: /\btod[oa]s\b/.test(a.m[0]) || !rest || /^tod[oa]s?$/i.test(rest), text: rest };
  }
  if (LIST_REM.test(f) && !REMIND.test(f)) return { type: "reminders" };

  if ((a = after(src, TIMER)) && /temporizador|timer|cuenta atras|alarma/.test(a.m[0])) {
    const ms = duration(a.rest);
    if (ms > 0) {
      const what = clean(a.rest.replace(/^\s*(?:de\s+|en\s+)?[^,]*?(?:segundos?|segs?|minutos?|mins?|horas?|hrs?|media hora|cuarto de hora)\b(?:\s+y\s+(?:medi[ao]|cuarto))?/i, ""));
      return { type: "timer", at: now + ms, ms, text: what };
    }
    // «pon una alarma a las 7»: un recordatorio (que se puede repetir: «todos los días a las 7»)
    const r = parseRepeat(a.rest, now, { am: true });
    if (r) return { type: "remind", at: r.at, text: clean(r.rest), rep: r.rep };
    const w = parseWhen(a.rest, now, { am: true });
    if (w?.exact) return { type: "remind", at: w.at, text: clean(w.rest), past: w.past };
    return { type: "timer", at: 0, ms: 0, text: "" }; // falta la duración: se pregunta
  }

  if ((a = after(src, REMIND))) {
    const wake = /^\s*despiertame/.test(f);
    // «todos los lunes a las 9», «cada día», «cada 2 horas»…
    const r = parseRepeat(a.rest, now, { am: wake });
    if (r) return { type: "remind", at: r.at, text: clean(r.rest) || (wake ? "¡Arriba!" : ""), rep: r.rep };
    const w = parseWhen(a.rest, now, { am: wake });
    const what = clean(w ? w.rest : a.rest);
    if (w) return { type: "remind", at: w.at, text: what || (wake ? "¡Arriba!" : ""), past: w.past };
    // sin hora: a la lista de tareas
    return what ? { type: "todo", text: what, fromRemind: true } : { type: "remind", at: 0, text: "" };
  }

  if ((a = after(src, REMEMBER))) {
    // «recuerda que el viernes es el cumple de Ana»: con fecha es un recordatorio
    const w = parseWhen(a.rest, now);
    if (w && !w.past && w.rest) return { type: "remind", at: w.at, text: clean(w.rest).replace(/^(?:es|son|hay|tengo)\s+/i, "") };
    const fact = clean(a.rest);
    return fact ? { type: "remember", text: fact } : null;
  }

  if ((a = after(src, FORGET))) {
    const what = clean(a.rest);
    if (/^(?:el |los |todos los )?recordatorios?\b/i.test(what)) return { type: "unremind", all: true, text: "" };
    return what ? { type: "forget", text: what } : null;
  }

  if ((a = after(src, DONE))) {
    const what = clean(a.rest.replace(TODO_TAIL, ""));
    if (what && what.length <= 120) return { type: "done", text: what };
  }

  if ((a = after(src, TODO))) {
    // «pon un temporizador…» ya se ha visto arriba; «pon música» no es una tarea
    if (/^\s*pon\b/.test(f) && !TODO_TAIL.test(f) && !/^\s*pon\s+(?:en|a)\s/.test(f)) return null;
    const what = clean(a.rest.replace(TODO_TAIL, ""));
    if (what && what.length <= 120) return { type: "todo", text: what[0].toUpperCase() + what.slice(1) };
  }

  if (ABOUT_ME.test(f) && src.length <= 160 && !/\?\s*$/.test(src)) return { type: "remember", text: src.replace(/[.!\s]+$/, ""), soft: true };
  return null;
}

// la tarea que más se parece a lo que ha dicho (para tacharla)
export function findTodo(list, text) {
  const words = (s) => flat(s).replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 2);
  const q = words(text);
  if (!q.length) return -1;
  let best = -1, score = 0;
  (list || []).forEach((t, i) => {
    const w = new Set(words(t.text));
    const hit = q.filter((x) => w.has(x) || [...w].some((y) => y.startsWith(x) || x.startsWith(y))).length / q.length;
    const s = hit - (t.done ? 0.5 : 0);
    if (s > score) { score = s; best = i; }
  });
  return score >= 0.5 ? best : -1;
}

// el dato que más se parece (para olvidarlo)
export const findFact = (list, text) => findTodo((list || []).map((t) => ({ text: t.text ?? t })), text);
