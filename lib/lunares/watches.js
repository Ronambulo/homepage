// Kero: avisos que pides tú (fase 8), sin IA.
//   vigilancias  → «avísame si la CPU pasa de 80», «avísame cuando vuelva Plex», «avísame si mañana llueve»,
//                  «avísame cuando el patrimonio pase de 50.000». Se miran con los datos de los widgets y avisan una vez.
//   con la agenda → «recuérdame 10 minutos antes de la reunión», «avísame al acabar el dentista».
import { duration, parseWhen } from "./when.js";

const DAY = 864e5, KEEP = 30 * DAY;
const RAIN = 50; // % de lluvia que cuenta como «llueve»
// sin número: «avísame si se calienta el servidor»
const HOT = { cpu: 90, ram: 90, disk: 90, temp: 80 };

const flat = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const clean = (s) => String(s || "").replace(/^[\s,.:;¿¡!?-]+|[\s,.:;¿¡!?-]+$/g, "").trim();
const day0 = (t) => new Date(t).setHours(0, 0, 0, 0);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
const eu = (n) => `${Math.round(n).toLocaleString("es-ES")} €`;
const WD = ["el domingo", "el lunes", "el martes", "el miércoles", "el jueves", "el viernes", "el sábado"];
const dayName = (t, now) => { const k = Math.round((day0(t) - day0(now)) / DAY); return k <= 0 ? "hoy" : k === 1 ? "mañana" : k === 2 ? "pasado mañana" : WD[new Date(t).getDay()]; };

// «80», «80%», «50.000», «50 mil», «50k», «1,5 millones» → número (o null)
export function numberIn(s) {
  const m = /(\d{1,3}(?:\.\d{3})+|\d+(?:[.,]\d+)?)\s*(k\b|mil\b|millon(?:es)?\b|m\b)?/.exec(flat(s));
  if (!m) return null;
  let n = /\.\d{3}(?:\.|$)/.test(m[1]) && !/,/.test(m[1]) ? +m[1].replace(/\./g, "") : +m[1].replace(",", ".");
  if (m[2] === "k" || m[2] === "mil") n *= 1e3;
  else if (m[2]) n *= 1e6;
  return Number.isFinite(n) ? n : null;
}

/* ---------- vigilancias ---------- */
// el resto de «avísame si/cuando …» → { k, … } | null
//   { k: "srv", m: "cpu"|"ram"|"disk"|"temp", op, n } · { k: "ha"|"wx", op, n } (grados en casa / fuera)
//   { k: "fm", op, n } · { k: "svc", name, up } · { k: "rain", day } (day: las 0:00 de ese día)
export function watchOf(rest, now = Date.now()) {
  const src = String(rest || "").trim(), f = flat(src);
  if (!/^(?:si|cuando|en cuanto)\s/.test(f)) return null;
  const body = f.replace(/^(?:si|cuando|en cuanto)\s+/, "");
  const until = now + KEEP;
  const op = /\b(?:baj[ae]n?|menos|debajo|inferior|desciend[ae])\b/.test(body) ? "<" : ">";
  const n = numberIn(body);

  // lluvia: hoy, mañana, pasado mañana o un día de la semana
  if (/\b(?:llov\w*|llueve|llueva|lluvia)\b/.test(body)) {
    const w = parseWhen(src, now);
    let t = /pasado manana/.test(body) ? now + 2 * DAY : /\bmanana\b/.test(body) ? now + DAY : w && !w.past ? w.at : now;
    if (t - now > 4 * DAY) return null; // solo hay previsión de unos pocos días
    return { k: "rain", day: day0(t), until: day0(t) + DAY };
  }
  // patrimonio
  if (/\b(?:patrimonio|neto|ahorros|dinero|fortuna)\b/.test(body)) return n != null ? { k: "fm", op, n, until } : null;
  // grados
  const hot = /\b(?:temperatura|grados|calienta|caliente|calor|frio|fria)\b|°/.test(body);
  if (/\b(?:cpu|procesador|servidor|ram|memoria|disco|almacenamiento|espacio)\b/.test(body)) {
    const m = hot ? "temp" : /\b(?:ram|memoria)\b/.test(body) ? "ram" : /\b(?:disco|almacenamiento|espacio)\b/.test(body) ? "disk" : /\b(?:cpu|procesador)\b/.test(body) ? "cpu" : null;
    if (m) return { k: "srv", m, op: n != null ? op : ">", n: n ?? HOT[m], until };
  }
  if (hot && n != null) return { k: /\b(?:casa|dentro|salon)\b/.test(body) ? "ha" : "wx", op, n, until };
  // un servicio que vuelve o se cae: lo que queda de la frase es su nombre
  const down = /\b(?:caiga|cae|caido|falle|falla|rompa|apague)\b|deje de funcionar|no responda/.test(body);
  const up = /\b(?:vuelva|vuelve|funcione|funciona|levante|arranque|responda|encienda)\b/.test(body);
  if (up || down) {
    const STOP = /^(?:se|el|la|los|las|de|a|otra|vez|que|y|no|deje|dejen|funcionar|funcione|funciona|vuelva|vuelve|caiga|cae|caido|falle|falla|rompa|apague|levante|arranque|responda|encienda|servicio|esta|este|arriba|bien|ya|en|marcha)$/;
    const name = src.replace(/^\s*(?:si|cuando|en cuanto)\s+/i, "").split(/\s+/).filter((w) => !STOP.test(flat(w).replace(/[^a-z0-9ñ]/g, ""))).join(" ");
    const nm = clean(name);
    return nm ? { k: "svc", name: nm, up: !down, until } : null;
  }
  return null;
}

// el servicio por su nombre en la página; y que el widget esté → { w } | { err }
export function resolveWatch(w, f = {}) {
  const W = f.w || {};
  const need = { srv: ["srv", "el servidor"], ha: ["ha", "la casa"], wx: ["wx", "el tiempo"], rain: ["wx", "el tiempo"], fm: ["fm", "el patrimonio"], svc: ["svc", "los servicios"] }[w?.k];
  if (!need) return { err: "No sé vigilar eso." };
  if (W[need[0]] == null) return { err: `No tengo ${need[1]} en la página, así que no puedo vigilarlo.` };
  if (w.k !== "svc") return { w };
  const q = flat(w.name), list = W.svc || [];
  const hit = list.find((s) => flat(s.name) === q) || list.find((s) => flat(s.name).startsWith(q) || q.startsWith(flat(s.name))) || list.find((s) => flat(s.name).includes(q));
  return hit ? { w: { ...w, name: hit.name } } : { err: `No tengo ningún servicio que se llame «${w.name}».` };
}

const METRIC = { cpu: "la CPU", ram: "la RAM", disk: "el disco", temp: "la CPU" };
const unit = (w) => (w.k === "fm" ? "" : w.k === "srv" && w.m !== "temp" ? "%" : w.k === "wx" ? "°" : " °C");
const val = (w, n) => (w.k === "fm" ? eu(n) : `${String(Math.round(n * 10) / 10).replace(".", ",")}${unit(w)}`);
const over = (w, v) => (w.op === "<" ? v < w.n : v > w.n);

// el valor de ahora (o null si aún no hay datos)
function valueOf(w, W) {
  if (w.k === "srv") {
    const d = W.srv;
    if (!d || d.ok === false) return null;
    return w.m === "cpu" ? d.cpu : w.m === "ram" ? pct(d.ramUsed, d.ramTotal) : w.m === "disk" ? (d.disk ? pct(d.disk.used, d.disk.total) : null) : d.temp;
  }
  if (w.k === "ha") return W.ha?.temp;
  if (w.k === "wx") return W.wx?.t;
  if (w.k === "fm") return W.fm && !W.fm.state ? W.fm.nw : null;
  return null;
}

// ¿se cumple? → lo que hay que decir («la CPU va al 85%») o null
export function checkWatch(w, f = {}, now = Date.now()) {
  const W = f.w || {};
  if (!w) return null;
  if (w.k === "svc") {
    const s = (W.svc || []).find((x) => x.name === w.name);
    if (!s || typeof s.up !== "boolean" || s.up !== w.up) return null;
    return w.up ? `${s.name} funciona` : `${s.name} se ha caído`;
  }
  if (w.k === "rain") {
    const k = Math.round((w.day - day0(now)) / DAY);
    const d = W.wx;
    if (!d || k < 0) return null;
    const r = k === 0 ? d.rain ?? d.days?.[0]?.rain : d.days?.[k]?.rain;
    if (r == null || r < RAIN) return null;
    return `${k === 0 ? "hoy" : k === 1 ? "mañana" : k === 2 ? "pasado mañana" : "ese día"} hay un ${r}% de lluvia${d.city ? ` en ${d.city}` : ""}`;
  }
  const v = valueOf(w, W);
  if (v == null || !Number.isFinite(v) || !over(w, v)) return null;
  if (w.k === "srv") return w.m === "temp" ? `la CPU está a ${val(w, v)}` : `${METRIC[w.m]} va al ${val(w, v)}`;
  if (w.k === "ha") return `en casa hay ${val(w, v)}`;
  if (w.k === "wx") return `fuera hace ${val(w, v)}`;
  return `tu patrimonio ${w.op === "<" ? "ha bajado de" : "ya pasa de"} ${eu(w.n)}: ${eu(v)}`;
}

// cómo se dice al pedirlo: «si la CPU pasa del 80%», «cuando vuelva Plex»
export function watchSay(w, now = Date.now()) {
  const dir = w.op === "<" ? "baja de" : "pasa de";
  if (w.k === "svc") return w.up ? `cuando vuelva ${w.name}` : `si se cae ${w.name}`;
  if (w.k === "rain") return `si ${dayName(w.day, now)} llueve`;
  if (w.k === "srv") return w.m === "temp" ? `si la CPU ${dir} ${val(w, w.n)}` : `si ${METRIC[w.m]} ${dir} ${val(w, w.n)}`;
  if (w.k === "ha") return `si en casa ${dir} ${val(w, w.n)}`;
  if (w.k === "wx") return `si fuera ${dir} ${val(w, w.n)}`;
  return `si tu patrimonio ${dir} ${eu(w.n)}`;
}
// la etiqueta corta del menú: «CPU > 80%», «Plex vuelva», «Lluvia mañana»
export function watchLabel(w, now = Date.now()) {
  const o = w.op === "<" ? "<" : ">";
  if (w.k === "svc") return w.up ? `Que vuelva ${w.name}` : `Que se caiga ${w.name}`;
  if (w.k === "rain") return `Lluvia ${dayName(w.day, now)}`;
  if (w.k === "srv") return `${w.m === "temp" ? "CPU" : w.m === "disk" ? "Disco" : w.m.toUpperCase()} ${o} ${val(w, w.n)}`;
  if (w.k === "ha") return `Casa ${o} ${val(w, w.n)}`;
  if (w.k === "wx") return `Fuera ${o} ${val(w, w.n)}`;
  return `Patrimonio ${o} ${eu(w.n)}`;
}
export const WATCH_HELP = "Eso no lo sé vigilar. Puedo avisarte si la CPU, la RAM, el disco o la temperatura pasan de algo, si un servicio se cae o vuelve, si va a llover o si el patrimonio pasa de una cifra.";

/* ---------- recordatorios con la agenda ---------- */
const DUR = "(\\d+(?:[.,]\\d+)?\\s*(?:minutos?|mins?|horas?|h)|(?:un|una|dos|tres|cinco|diez|quince|veinte|treinta)\\s+(?:minutos?|horas?)|media hora|una hora|un cuarto de hora|un rato|un momento)";
const ANCHOR = new RegExp(`(?:^|\\s)(?:${DUR}\\s+)?(antes|despues)\\s+(?:de\\s+(?:la|el|los|las|mi|tu)\\s+|del\\s+|de\\s+)|(?:^|\\s)(?:al|cuando|en cuanto)\\s+(?:se\\s+)?(acab\\w*|termin\\w*|finali\\w*|empie\\w*|comien\\w*|empez\\w*|comenz\\w*|sal\\w*\\s+de)\\s+(?:de\\s+|del\\s+)?(?:(?:la|el|los|las|mi|tu)\\s+)?`);
// el resto de «recuérdame …» → { ev, ms, edge: "start"|"end", text } | null
export function relOf(rest) {
  const src = String(rest || "").normalize("NFC"), f = flat(src), m = ANCHOR.exec(f);
  if (!m) return null;
  const end = m[2] ? m[2] === "despues" : !/^(?:empie|comien|empez|comenz)/.test(m[3]);
  const ms = m[2] === "antes" ? (m[1] ? duration(m[1]) : 10 * 60000) : m[1] ? duration(m[1]) : 0;
  const tail = src.slice(m.index + m[0].length), tf = flat(tail);
  const sep = /\s+(?:que|para|y que|a ver si)\s+|,\s*/.exec(tf);
  const ev = clean(sep ? tail.slice(0, sep.index) : tail);
  const text = clean([src.slice(0, m.index), sep ? tail.slice(sep.index + sep[0].length) : ""].filter((x) => x.trim()).join(" "));
  if (!ev || ev.length > 60) return null;
  if (parseWhen(ev, Date.now())?.exact || /^(?:las?|la una)\s+\d|^\d/.test(flat(ev))) return null; // «antes de las 9» es una hora, no un evento
  // soft: «después de comer» puede no ser de la agenda; si no hay evento, vale como recordatorio normal
  return { ev, ms, edge: end ? "end" : "start", text: text.replace(/^(?:que|de|para)\s+/i, ""), ...(m[2] === "despues" ? { soft: true } : {}) };
}

// el evento de la agenda que más se parece (el próximo, si hay varios) → { at, ev, past } | null
export function resolveRel(rel, events = [], now = Date.now()) {
  const words = (s) => flat(s).replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 2);
  const q = words(rel.ev);
  if (!q.length) return null;
  const at = (e) => +new Date(rel.edge === "end" ? e.end || e.start : e.start) + (rel.edge === "end" ? rel.ms : -rel.ms);
  const cands = (events || []).filter((e) => e?.title && e.start && !e.allDay && +new Date(e.end || e.start) > now - 3600000)
    .map((e) => { const w = words(e.title); return { e, s: q.filter((x) => w.some((y) => y.startsWith(x) || x.startsWith(y))).length / q.length }; })
    .filter((c) => c.s >= 0.5)
    .sort((a, b) => b.s - a.s || (at(b.e) > now) - (at(a.e) > now) || +new Date(a.e.start) - +new Date(b.e.start));
  const best = cands[0];
  return best ? { at: at(best.e), ev: best.e, past: at(best.e) <= now } : null;
}
