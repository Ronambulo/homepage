// Kero: planes con fecha que le cuentas («mañana tengo un examen», «el viernes me voy a Lisboa»).
// Se guardan como dato `plan` con su fecha (memory.js), van al contexto de la IA mientras están cerca
// y, cuando ya han pasado, Kero pregunta una vez qué tal fue (nudges.js).
import { parseWhen } from "./when.js";
import { toYou, toThem } from "./text.js";

const DAY = 864e5, HOUR = 36e5;
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const ART = { un: "el", una: "la", unos: "los", unas: "las" };
// sin artículo: «tengo dentista», «mañana tengo clase»
const BARE = { dentista: "el", medico: "el", examen: "el", partido: "el", entreno: "el", juicio: "el", clase: "la", clases: "las", cita: "la", entrevista: "la", reunion: "la", cena: "la", comida: "la", boda: "la", fiesta: "la", revision: "la", consulta: "la" };
const flat = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// «mañana tengo un examen» → { text: "el examen", due, allday } o null
//   text: en primera persona, como los demás datos («la boda de mi hermana»)
export function planOf(text, now = Date.now()) {
  const src = String(text || "").normalize("NFC").trim().replace(/[.!¡\s]+$/, "");
  if (!src || src.length > 120 || /[¿?]/.test(src)) return null;
  const w = parseWhen(src, now);
  if (!w || w.past || w.at - now > 120 * DAY || w.at - now < 30 * 60000) return null;
  const rest = w.rest.replace(/^(?:pues|oye|que sepas que|sabes que),?\s+/i, "").replace(/[,.]+$/, "").trim();
  let m, what = null;
  // «tengo un examen», «hay una cena con los del curro», «es la boda de mi hermana»
  if ((m = /^(?:tengo|hay|es|será|sera|toca|me toca)\s+(un|una|unos|unas|el|la|los|las|mi|mis)\s+(.{3,60})$/i.exec(rest))) {
    const a = m[1].toLowerCase();
    what = `${ART[a] || a} ${m[2]}`;
  }
  else if ((m = /^(?:tengo|hay)\s+(\p{L}+)(.{0,50})$/u.exec(rest)) && BARE[flat(m[1])]) what = `${BARE[flat(m[1])]} ${m[1]}${m[2]}`;
  // «me voy a Lisboa», «me voy de viaje a Lisboa», «me voy de vacaciones»
  else if ((m = /^me voy (?:de viaje )?a\s+([A-ZÁÉÍÓÚÑ][\p{L}\s]{1,40})$/u.exec(rest))) what = `el viaje a ${m[1].trim()}`;
  else if ((m = /^me voy de (vacaciones|viaje)(?:\s+a\s+(.{2,40}))?$/i.exec(rest))) what = `${m[1].toLowerCase() === "viaje" ? "el viaje" : "las vacaciones"}${m[2] ? " a " + m[2] : ""}`;
  // nada de tareas ni sensaciones: «tengo que…», «tengo ganas de…»
  if (!what || /\b(?:que|ganas|miedo|sueno|hambre)\b/.test(flat(what).split(" ").slice(0, 2).join(" "))) return null;
  const d = new Date(w.at);
  return w.exact ? { text: what, due: w.at } : { text: what, due: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime(), allday: true };
}

// «mañana a las 9:00», «el viernes», «ayer», «hace 3 días»
export function planWhen(p, now = Date.now()) {
  const d = new Date(p.due), n = new Date(now);
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dd = Math.round((day(d) - day(n)) / DAY);
  const hm = p.allday ? "" : ` a la${d.getHours() === 1 ? "" : "s"} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  const w = dd === 0 ? "hoy" : dd === 1 ? "mañana" : dd === 2 ? "pasado mañana" : dd === -1 ? "ayer" : dd === -2 ? "anteayer"
    : dd < 0 ? `hace ${-dd} días` : dd < 7 ? `el ${d.toLocaleDateString("es-ES", { weekday: "long" })}` : `el ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
  return w + (dd >= 0 ? hm : "");
}

// para el contexto de la IA: «Planes de tu dueño: el examen (mañana a las 9:00); la boda de su hermana (el sábado).»
export const plansLine = (plans, now = Date.now()) =>
  plans.length ? `Planes de tu dueño: ${plans.map((p) => `${toThem(p.text)} (${planWhen(p, now)})`).join("; ")}.` : "";

// lo que dice al enterarse (sin IA)
export const planReply = (p) => {
  const x = toYou(p.text);
  return /examen|entrevista|oposici|prueba|partido|competici|carrera/i.test(x) ? `¡Mucha suerte con ${x}! Luego me cuentas qué tal.`
    : /viaje|vacaciones/i.test(x) ? `¡Qué bien, ${x}! Ya me contarás.`
    : `Me lo apunto: ${x}, ${planWhen(p)}. Luego me cuentas qué tal.`;
};

// ¿toca preguntar qué tal fue? Ya ha pasado (4 horas después; si era todo el día, por la tarde), hace menos de 2 días,
// se lo contaste hace al menos 3 horas, y no a deshoras
export function planAsk(p, now = Date.now()) {
  const h = new Date(now).getHours();
  if (!Number.isFinite(p?.due) || now < p.due + 4 * HOUR || now - p.due > 2 * DAY || now - (p.at || 0) < 3 * HOUR || h < 9 || h >= 22) return null;
  return { key: `plan:${p.id}`, text: `Oye, ¿qué tal ha ido ${toYou(p.text)}?`, face: "love" };
}
