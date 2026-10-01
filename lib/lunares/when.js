// Kero: entiende cuándo («en 20 minutos», «mañana a las 9», «el viernes por la tarde», «el 3 de mayo»…).
// Devuelve la hora en ms y el resto de la frase sin la parte de la fecha.

const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const WORDS = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
  trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, veinticinco: 25,
  treinta: 30, cuarenta: 40, cincuenta: 50, noventa: 90, cien: 100,
};
const NW = Object.keys(WORDS).sort((a, b) => b.length - a.length).join("|");
const N = `(?:\\d+(?:[.,]\\d+)?|${NW})`;
const UNIT = "(?:segundos?|segs?|s|minutos?|mins?|m|horas?|hrs?|h|dias?|semanas?)";
const DAYS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const PART = { madrugada: 3, manana: 9, mediodia: 13, tarde: 17, noche: 21 };

const num = (v) => (v == null ? NaN : WORDS[v] ?? parseFloat(String(v).replace(",", ".")));
const flat = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// «una hora y media», «20 min», «2 horas y 10 minutos» → ms
export function duration(s) {
  const t = flat(String(s || ""));
  if (/^\s*(un )?rato\b/.test(t)) return 30 * MIN;
  if (/^\s*(un )?momento\b/.test(t)) return 5 * MIN;
  let ms = 0;
  if (/\bmedia hora\b/.test(t)) ms += 30 * MIN;
  if (/\bcuarto de hora\b/.test(t)) ms += 15 * MIN;
  const re = new RegExp(`(${N})\\s*(${UNIT})\\b`, "g");
  let m, last = null;
  while ((m = re.exec(t))) {
    const n = num(m[1]), u = m[2];
    if (!Number.isFinite(n)) continue;
    const k = /^s/.test(u) && !/^sem/.test(u) ? 1000 : /^m/.test(u) ? MIN : /^h/.test(u) ? HOUR : /^d/.test(u) ? DAY : 7 * DAY;
    ms += n * k; last = k;
  }
  // «una hora y media», «dos minutos y medio»
  if (last && /\by medi[ao]\b/.test(t)) ms += last / 2;
  if (last === HOUR && /\by cuarto\b/.test(t)) ms += 15 * MIN;
  return ms;
}

// la hora del reloj para «a las 6»: con mañana/tarde/noche o am/pm si lo dice, y si no, la próxima que tenga sentido
function clock(h, m, part, base, dayGiven, now, am) {
  // alarmas y «despiértame»: sin más pistas, la hora es de la mañana
  if (am && !part && h >= 1 && h <= 11) part = "manana";
  if (part === "tarde" || part === "noche" || part === "pm") {
    if (part === "noche" && h === 12) return [0, m, 1];
    if (h < 12) h += 12;
  } else if (part === "manana" || part === "madrugada" || part === "am") {
    if (h === 12) h = 0;
  } else if (h >= 1 && h <= 12) {
    if (dayGiven) { if (h <= 7) h += 12; }
    else {
      // hoy: la primera de las dos (9 o 21) que aún no ha pasado; si no, mañana
      const at = (hh) => new Date(base.getFullYear(), base.getMonth(), base.getDate(), hh, m).getTime();
      const opts = h === 12 ? [12] : [h, h + 12];
      const ok = opts.find((hh) => at(hh) > now + 30000);
      if (ok != null) return [ok, m, 0];
      return [h <= 7 ? h + 12 : h, m, 1];
    }
  }
  return [h, m, 0];
}

export function parseWhen(text, now = Date.now(), { am = false } = {}) {
  const src = String(text || "").normalize("NFC");
  const t = flat(src);
  if (t.length !== src.length) return null; // no debería pasar con texto normal
  const cut = []; // trozos de la frase que hablan de la fecha
  const take = (re) => { const m = re.exec(t); if (m) cut.push([m.index, m.index + m[0].length]); return m; };
  const rest = () => {
    let out = "", i = 0;
    for (const [a, b] of cut.sort((x, y) => x[0] - y[0])) { if (a > i) out += src.slice(i, a); i = Math.max(i, b); }
    out += src.slice(i);
    return out.replace(/\s+/g, " ").trim()
      .replace(/^(?:[,.:;-]\s*)+/, "").replace(/(?:\s*[,.:;-])+$/, "")
      .replace(/^(?:que|de|para|y|a)\s+/i, "").replace(/\s+(?:y|que|de|para|a)$/i, "").trim();
  };

  // 1. dentro de un rato: «en 20 minutos», «dentro de una hora y media»
  const rel = take(new RegExp(`\\b(?:en|dentro de|de aqui a)\\s+((?:(?:un |una )?(?:media hora|cuarto de hora|rato|momento)|${N}\\s*${UNIT}(?:\\s*(?:y|,)\\s*(?:${N}\\s*${UNIT}|medi[ao]|cuarto))?))\\b`));
  if (rel) {
    const ms = duration(rel[1]);
    if (ms > 0) return { at: now + ms, rest: rest(), exact: true };
    cut.pop();
  }

  const d0 = new Date(now);
  let base = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate()), dayGiven = false, today = false;
  const addDays = (n) => { base = new Date(base.getFullYear(), base.getMonth(), base.getDate() + n); };

  // 2. el día
  if (take(/\bpasado manana\b/)) { addDays(2); dayGiven = true; }
  else if (take(/(?<!(?:de|por|a) la |esta |esta misma )\bmanana\b/)) { addDays(1); dayGiven = true; }
  else if (take(/\bhoy\b/)) today = true;
  let m;
  if (!dayGiven && (m = take(/\b(?:el |este |el proximo |el siguiente |proximo )?(lunes|martes|miercoles|jueves|viernes|sabado|domingo)(?: que viene)?\b/))) {
    let n = (DAYS.indexOf(m[1]) - base.getDay() + 7) % 7;
    if (n === 0) n = 7;
    addDays(n); dayGiven = true;
  }
  if (!dayGiven && (m = take(new RegExp(`\\b(?:el )?(?:dia )?(\\d{1,2}) de (${MONTHS.join("|")})(?: (?:de )?(\\d{4}))?\\b`)))) {
    const y = m[3] ? +m[3] : base.getFullYear();
    let d = new Date(y, MONTHS.indexOf(m[2]), +m[1]);
    if (!m[3] && d < base) d = new Date(y + 1, MONTHS.indexOf(m[2]), +m[1]);
    base = d; dayGiven = true;
  }
  if (!dayGiven && (m = take(/\b(?:el )?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))) {
    const y = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : base.getFullYear();
    let d = new Date(y, +m[2] - 1, +m[1]);
    if (!m[3] && d < base) d = new Date(y + 1, +m[2] - 1, +m[1]);
    base = d; dayGiven = true;
  }
  if (!dayGiven && (m = take(/\bel dia (\d{1,2})\b/))) {
    let d = new Date(base.getFullYear(), base.getMonth(), +m[1]);
    if (d < base) d = new Date(base.getFullYear(), base.getMonth() + 1, +m[1]);
    base = d; dayGiven = true;
  }

  // 3. la hora
  let h = null, mi = 0, part = null, extra = 0;
  const HW = "una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce";
  if ((m = take(new RegExp(`\\b(?:a|sobre|hacia|para) (?:las?|eso de las?) (\\d{1,2}|${HW})(?:(?::|\\.|h)(\\d{2}))?(?: ?(?:h|hrs|horas)\\b)?(?: (y media|y cuarto|menos cuarto|y (\\d{1,2}|${NW})(?: minutos)?))?(?: (?:de la|por la) (manana|tarde|noche|madrugada)| ?(am|pm|a\\.m\\.|p\\.m\\.))?`)))) {
    h = num(m[1]); mi = m[2] ? +m[2] : 0;
    if (m[3] === "y media") mi = 30; else if (m[3] === "y cuarto") mi = 15; else if (m[3] === "menos cuarto") { h -= 1; mi = 45; } else if (m[4]) mi = num(m[4]);
    part = m[5] || (m[6] ? (m[6][0] === "p" ? "pm" : "am") : null);
  } else if ((m = take(/\b(?:a las |las )?(\d{1,2}):(\d{2})\b/))) {
    h = +m[1]; mi = +m[2];
  } else if (take(/\b(?:a|al|sobre el|hacia el) mediodia\b/)) { h = 13; part = "pm"; }
  else if (take(/\b(?:a|sobre la|hacia la) medianoche\b/)) { h = 0; part = "am"; extra = 1; }
  // «esta tarde», «por la noche», «el viernes por la mañana»
  if ((m = take(/\b(?:esta|esta misma|por la|de la|a la) (manana|tarde|noche|madrugada)\b/))) {
    if (/^esta/.test(m[0])) today = true;
    if (h == null) h = PART[m[1]]; else part = part || m[1];
  }

  if (h == null && !dayGiven && !today) return null;
  if (!Number.isFinite(h ?? 0) || (h ?? 0) > 23 || mi > 59) return null;
  let at;
  if (h == null) {
    // solo el día: hoy, dentro de una hora; otro día, a las 9
    at = dayGiven ? new Date(base.getFullYear(), base.getMonth(), base.getDate(), 9).getTime() : Math.ceil((now + HOUR) / (5 * MIN)) * 5 * MIN;
  } else {
    let [hh, mm, plus] = clock(h, mi, part, base, dayGiven || today, now, am);
    plus += extra;
    at = new Date(base.getFullYear(), base.getMonth(), base.getDate() + plus, hh, mm).getTime();
    // «a las 6» y ya son las 7: mañana (si no ha dicho el día)
    if (at <= now && !dayGiven && !today) at += DAY;
  }
  return { at, rest: rest(), exact: h != null, past: at <= now };
}

// «en 20 minutos», «hoy a las 18:30», «mañana a las 9:00», «el viernes a las 9:00», «el 3 de mayo a las 9:00»
export function fmtWhen(at, now = Date.now()) {
  const d = new Date(at), n = new Date(now), diff = at - now;
  if (diff < 0) return "hace un momento";
  if (diff < 50 * 1000) return "en unos segundos";
  if (diff < 60 * MIN) { const k = Math.round(diff / MIN); return `en ${k} ${k === 1 ? "minuto" : "minutos"}`; }
  const hm = `a la${d.getHours() === 1 ? "" : "s"} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dd = Math.round((day(d) - day(n)) / DAY);
  if (dd === 0) return `hoy ${hm}`;
  if (dd === 1) return `mañana ${hm}`;
  if (dd === 2) return `pasado mañana ${hm}`;
  if (dd < 7) return `el ${d.toLocaleDateString("es-ES", { weekday: "long" })} ${hm}`;
  return `el ${d.getDate()} de ${MONTHS[d.getMonth()]} ${hm}`;
}

// hora corta para listas: «18:30», «mañana 9:00», «vie 9:00», «3 may 9:00»
export function shortWhen(at, now = Date.now()) {
  const d = new Date(at), n = new Date(now), hm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dd = Math.round((day(d) - day(n)) / DAY);
  if (dd <= 0) return hm;
  if (dd === 1) return "mañana " + hm;
  if (dd < 7) return d.toLocaleDateString("es-ES", { weekday: "short" }).replace(".", "") + " " + hm;
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${hm}`;
}
