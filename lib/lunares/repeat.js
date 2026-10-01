// Kero: recordatorios que se repiten («todos los lunes a las 9», «cada día», «de lunes a viernes»,
// «el día 5 de cada mes», «cada 2 horas»).
// rep = { ms } | { days: [0-6], h, m } | { mday, h, m }
import { parseWhen, duration } from "./when.js";

const MIN = 60000;
export const MIN_EVERY = 5 * MIN; // más a menudo sería un incordio
const DAYS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
const DAYS_ES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const ALL = [0, 1, 2, 3, 4, 5, 6];
const D = "lunes|martes|miercoles|jueves|viernes|sabados?|domingos?";
const flat = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const day = (w) => DAYS.indexOf(/^(sabado|domingo)s$/.test(w) ? w.slice(0, -1) : w);

// la parte de la frase que dice cada cuánto
function rule(t) {
  let m;
  if ((m = /\bcada (media hora|cuarto de hora|hora|minuto|(?:\d+|[a-z]+) (?:minutos?|mins?|horas?|hrs?)(?: y medi[ao])?)\b/.exec(t))) {
    const ms = duration(/^(hora|minuto)$/.test(m[1]) ? "1 " + m[1] : m[1]);
    return ms > 0 ? { m, rep: { ms } } : null;
  }
  if ((m = /\b(?:entre semana|(?:de )?lunes a viernes|(?:todos )?los dias (?:laborables|de diario|de trabajo)|cada dia laborable)\b/.exec(t))) return { m, rep: { days: [1, 2, 3, 4, 5] } };
  if ((m = /\b(?:(?:todos )?los fines de semana|cada fin de semana)\b/.exec(t))) return { m, rep: { days: [0, 6] } };
  if ((m = new RegExp(`\\b(?:todos los|todas las semanas los|cada|los)\\s+((?:${D})(?:(?:\\s*,\\s*|\\s+y\\s+)(?:los\\s+)?(?:${D}))*)\\b`).exec(t))) {
    const days = [...new Set(m[1].split(/\s*,\s*|\s+y\s+/).map((w) => day(w.replace(/^los\s+/, ""))))].filter((d) => d >= 0).sort();
    if (days.length) return { m, rep: { days } };
  }
  if ((m = /\b(?:el (?:dia )?(\d{1,2}) de cada mes|cada mes el (?:dia )?(\d{1,2})|todos los (?:dias )?(\d{1,2}) de (?:cada )?mes|(?:todos los meses|cada mes|mensualmente) el (?:dia )?(\d{1,2}))\b/.exec(t))) {
    const d = +(m[1] || m[2] || m[3] || m[4]);
    return d >= 1 && d <= 31 ? { m, rep: { mday: d } } : null;
  }
  if ((m = /\b(?:cada|todas las) (mananas?|tardes?|noches?)\b/.exec(t))) return { m, rep: { days: ALL }, part: m[1].replace(/s$/, "") };
  if ((m = /\b(?:cada dia|todos los dias|a diario|diariamente)\b/.exec(t))) return { m, rep: { days: ALL } };
  if ((m = /\b(?:cada semana|semanalmente|todas las semanas)\b/.exec(t))) return { m, rep: { days: null } }; // el día de hoy
  return null;
}

// la próxima vez después de `after` (para un intervalo, contando desde `from`)
export function nextRep(rep, after = Date.now(), from = after) {
  if (!rep) return 0;
  if (rep.ms >= MIN_EVERY) return from > after ? from : from + Math.ceil((after - from + 1) / rep.ms) * rep.ms;
  const a = new Date(after), h = rep.h ?? 9, m = rep.m ?? 0;
  if (rep.mday) {
    for (let k = 0; k <= 12; k++) {
      const last = new Date(a.getFullYear(), a.getMonth() + k + 1, 0).getDate();
      const c = new Date(a.getFullYear(), a.getMonth() + k, Math.min(rep.mday, last), h, m).getTime();
      if (c > after) return c;
    }
    return 0;
  }
  const days = rep.days?.length ? rep.days : ALL;
  for (let k = 0; k <= 7; k++) {
    const c = new Date(a.getFullYear(), a.getMonth(), a.getDate() + k, h, m);
    if (c.getTime() > after && days.includes(c.getDay())) return c.getTime();
  }
  return 0;
}

// «… todos los lunes a las 9 sacar la basura» → { rep, at, rest } o null si no se repite
export function parseRepeat(text, now = Date.now(), { am = false } = {}) {
  const src = String(text || "").normalize("NFC"), t = flat(src);
  if (t.length !== src.length) return null;
  const r = rule(t);
  if (!r) return null;
  const rest0 = (src.slice(0, r.m.index) + " " + src.slice(r.m.index + r.m[0].length)).replace(/\s+/g, " ").trim();
  if (r.rep.ms) {
    const rep = { ms: r.rep.ms };
    return { rep, at: now + rep.ms, rest: tidy(rest0) };
  }
  // la hora, como si ya tuviera día: «a las 8» es por la mañana; sin hora, las 9
  // («cada noche a las 11» se lee como «a las 11 por la noche»)
  const w = parseWhen("mañana " + rest0 + (r.part ? " por la " + r.part : ""), now, { am });
  const at = w?.exact ? new Date(w.at) : null;
  const rep = { ...r.rep, h: at ? at.getHours() : 9, m: at ? at.getMinutes() : 0 };
  if (rep.days === null) rep.days = [new Date(now).getDay()];
  return { rep, at: nextRep(rep, now), rest: tidy(w ? w.rest : rest0) };
}
const tidy = (s) => s.replace(/^(?:[,.:;-]\s*)+|(?:\s*[,.:;-])+$/g, "").replace(/^(?:que|de|para|y|a)\s+/i, "").replace(/\s+(?:y|que|de|para|a)$/i, "").trim();

// «cada día a las 9:00», «los lunes y jueves a las 8:30», «el día 5 de cada mes a las 9:00», «cada 2 horas»
export function fmtRep(rep) {
  if (!rep) return "";
  if (rep.ms) {
    const mins = Math.round(rep.ms / MIN);
    if (mins % 60 === 0) return mins === 60 ? "cada hora" : `cada ${mins / 60} horas`;
    if (mins === 30) return "cada media hora";
    return mins > 60 ? `cada ${(mins / 60).toLocaleString("es-ES", { maximumFractionDigits: 1 })} horas` : `cada ${mins} minutos`;
  }
  const hm = `a la${rep.h === 1 ? "" : "s"} ${rep.h}:${String(rep.m).padStart(2, "0")}`;
  if (rep.mday) return `el día ${rep.mday} de cada mes ${hm}`;
  const d = [...(rep.days || ALL)].sort();
  const k = d.join();
  if (k === ALL.join()) return `cada día ${hm}`;
  if (k === "1,2,3,4,5") return `de lunes a viernes ${hm}`;
  if (k === "0,6") return `los fines de semana ${hm}`;
  if (d.length === 1) return `cada ${DAYS_ES[d[0]]} ${hm}`;
  // de lunes a domingo; sábados y domingos en plural
  const names = [...d.filter((x) => x), ...d.filter((x) => !x)].map((x) => DAYS_ES[x] + (x === 0 || x === 6 ? "s" : ""));
  return `los ${names.slice(0, -1).join(", ")} y ${names.at(-1)} ${hm}`;
}

// para el menú: «↻ L–V», «↻ diario», «↻ lun, jue», «↻ día 5», «↻ 2 h»
export function shortRep(rep) {
  if (!rep) return "";
  if (rep.ms) { const mins = Math.round(rep.ms / MIN); return mins >= 60 ? `${+(mins / 60).toFixed(1)} h` : `${mins} min`; }
  if (rep.mday) return `día ${rep.mday}`;
  const k = [...(rep.days || ALL)].sort().join();
  if (k === ALL.join()) return "diario";
  if (k === "1,2,3,4,5") return "L–V";
  if (k === "0,6") return "finde";
  return rep.days.map((x) => DAYS_ES[x].slice(0, 3)).join(", ");
}
