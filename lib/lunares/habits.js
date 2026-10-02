// Kero: lo que aprende de cómo lo usas, sin IA y solo en este navegador.
//   use[id]          → cuándo miraste o preguntaste por cada widget (para «como sueles mirarlo los lunes…»)
//   routes[frase][r] → qué camino del router acertó (+) o falló (−) para esa frase (para desempatar la próxima vez)
import { answer, plain } from "./brain.js";

export const HABITS = "lunares_habits";
const DAY = 864e5, WEEK = 7 * DAY, KEEP = 8 * WEEK;
const MAX_USE = 60, MAX_ROUTES = 200, GAP = 30 * 60000;

export const emptyHabits = () => ({ use: {}, routes: {} });
// lo guardado puede venir roto o de otra versión: se queda con lo que tenga buena pinta
export function cleanHabits(h) {
  const o = emptyHabits();
  if (!h || typeof h !== "object") return o;
  for (const [id, l] of Object.entries(h.use || {})) if (Array.isArray(l)) o.use[id] = l.filter(Number.isFinite).slice(-MAX_USE);
  for (const [k, m] of Object.entries(h.routes || {})) if (m && typeof m === "object") o.routes[k] = m;
  return o;
}

/* ---------- qué widgets miras y cuándo ---------- */
// una vez cada media hora como mucho por widget (pasar el ratón tres veces seguidas cuenta una)
export function noteUse(h, id, now = Date.now()) {
  const l = (h.use[id] || []).filter((t) => now - t < KEEP);
  if (l.some((t) => Math.abs(now - t) < GAP)) return h;
  return { ...h, use: { ...h.use, [id]: [...l, now].sort((a, b) => a - b).slice(-MAX_USE) } };
}

const WD = ["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"];
const NAMES = { fm: "el patrimonio", svc: "los servicios", wx: "el tiempo", todo: "las tareas", srv: "el servidor", cal: "la agenda", gh: "GitHub", dp: "el Minecraft", ha: "la casa", im: "las fotos" };
// la pregunta de siempre de cada widget (la contesta brain.js con los datos reales)
const ASK = { fm: "¿cómo va mi patrimonio?", svc: "¿cómo van los servicios?", wx: "¿qué tiempo hace?", todo: "¿qué tareas tengo?", srv: "¿cómo va el servidor?", cal: "¿qué tengo hoy?", gh: "¿cómo va GitHub?", dp: "¿cómo va el Minecraft?", ha: "¿cómo está la casa?", im: "¿cómo va Immich?" };
const day0 = (t) => new Date(t).setHours(0, 0, 0, 0);
const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
// la primera frase o dos, que el aviso no es un informe
const short = (s) => { const p = String(s).match(/[^.!?]+[.!?]+/g) || [String(s)]; let o = p[0]; for (const x of p.slice(1)) if ((o + x).length <= 160) o += x; else break; return o.trim(); };

// widgets que sueles mirar este día de la semana a esta hora: en 3 semanas distintas o más de las últimas 8
//   → [{ id, hour }], el más repetido primero
export function habitsNow(h, now = Date.now()) {
  const d = new Date(now), today = day0(now), out = [];
  for (const [id, l] of Object.entries(h.use || {})) {
    if (l.some((t) => t >= today)) continue; // hoy ya lo has mirado
    const hits = l.filter((t) => now - t < KEEP && t < today && new Date(t).getDay() === d.getDay());
    const weeks = new Set(hits.map((t) => Math.round((today - day0(t)) / WEEK)));
    if (weeks.size < 3) continue;
    const hs = hits.map((t) => new Date(t).getHours()).sort((a, b) => a - b), hour = hs[Math.floor(hs.length / 2)];
    if (Math.abs(d.getHours() - hour) <= 1) out.push({ id, hour, n: weeks.size });
  }
  return out.sort((a, b) => b.n - a.n);
}

// el aviso: «Como sueles mirar el patrimonio los lunes: …» (uno al día por widget; vacío si no hay datos)
export function habitNudges(h, f = {}, now = Date.now(), said = {}) {
  const out = [];
  for (const { id } of habitsNow(h, now)) {
    const key = `habit:${id}:${dayKey(now)}`;
    if (said[key] || !ASK[id] || !f.w?.[id]) continue; // sin el widget en la página, nada
    const a = answer(ASK[id], f, now);
    if (a) out.push({ key, id, text: `Como sueles mirar ${NAMES[id]} los ${WD[new Date(now).getDay()]}: ${short(a)}`, face: "happy", wake: false });
  }
  return out;
}

/* ---------- qué camino acierta para cada frase ---------- */
const STOP = new Set("que como cual cuales esta este estan esto eso esa ese los las del por para con una uno unos unas hay mas muy kero lunares oye dime sabes puedes porfa favor me mi mis tu tus te le lo la el en de y o a al es son va van".split(" "));
// las palabras que importan, sin orden: «¿cómo está la casa?» y «la casa, ¿cómo está?» son la misma frase
export function routeKey(text) {
  const w = [...new Set((plain(text).match(/[a-z0-9ñ]+/g) || []).filter((x) => x.length >= 3 && !STOP.has(x)))].sort();
  return w.slice(0, 6).join(" ");
}
// el nombre del camino (igual que en el banco de preguntas): «web», «answer», «command:remind»…
export const routeLabel = (r) => (r?.type === "command" ? "command:" + r.c?.type : r?.type || "ai");

// suma (acierto) o resta (fallo) a ese camino para esa frase; entre −3 y 5
export function noteRoute(h, key, label, by) {
  if (!key || !label) return h;
  const m = { ...(h.routes[key] || {}) };
  m[label] = Math.max(-3, Math.min(5, (m[label] || 0) + by));
  const routes = { ...h.routes };
  delete routes[key]; // lo último que se toca va al final: al pasarse del máximo se olvida lo más viejo
  routes[key] = m;
  const keys = Object.keys(routes);
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_ROUTES))) delete routes[k];
  return { ...h, routes };
}

// «no, eso no»: ese camino queda en negativo para esa frase, aunque antes hubiera acertado
export const wrongRoute = (h, key, label) => noteRoute(h, key, label, -Math.max(2, (h.routes[key]?.[label] || 0) + 1));

// lo aprendido cambia la confianza del camino: 2 aciertos → seguro; un «eso no» → que decida la IA
//   (abrir apps no se toca: «abre Plex» es siempre «abre Plex»)
export function learnedScore(r, routes, text, sure) {
  if (!routes || !r || r.type === "open" || r.type === "ai") return r;
  const n = routes[routeKey(r.merged || text)]?.[routeLabel(r)] || 0;
  if (n <= -1) return { ...r, score: Math.min(r.score, sure / 2), learned: -1, was: r.score };
  if (n >= 2 && r.score < sure) return { ...r, score: sure, learned: 1, was: r.score };
  return r;
}
