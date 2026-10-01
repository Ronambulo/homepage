// Kero: frases sueltas para cada situación.
import { pick } from "./brain.js";

export const LINES = {
  hello: (f) => {
    const h = f.hour ?? new Date().getHours(), you = f.name ? ", " + f.name : "";
    return pick([(h < 6 ? "Buenas noches" : h < 14 ? "¡Buenos días" : h < 21 ? "¡Buenas tardes" : "Buenas noches") + you + (h < 6 || h >= 21 ? "." : "!"), "¡Hola" + you + "!", "¡Ey" + you + "! Ya estoy aquí."]);
  },
  back: ["¡Has vuelto!", "Te echaba de menos. Un poco.", "¿Qué tal ahí fuera?"],
  tickle: ["¡Jiji!", "¡Eh, cosquillas no!", "¿Qué pasa?", "¡Hola!", "Aquí estoy."],
  dizzy: ["Me mareo…", "Para, para…", "Veo tres ratones."],
  pet: ["Mmm…", "Más, más.", "Esto me gusta."],
  drop: ["¡Uf!", "Aterrizaje perfecto.", "Buen sitio, este."],
  grab: ["¡Wiii!", "¿A dónde vamos?", "¡De paseo!"],
  wake: ["¡Estaba despierto!", "Mmm… ¿qué hora es?", "Cinco minutitos más…"],
  bored: ["Me aburro…", "¿Hacemos algo?", "Voy a contar mis bultos. Uno, dos…"],
  startle: ["¡Ay!", "¡Qué susto!", "Cuidado con ese ratón."],
  search: ["¿Qué buscamos?", "Te leo.", "Escribe, escribe."],
  clock: () => { const d = new Date(); return pick([`¡Son las ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}!`, "Tic, tac.", "Desde aquí arriba controlo el tiempo.", "Encima de la hora. Muy puntual."]); },
  button: ["Un botón. Mejor no lo pulso.", "Shh, no toco nada.", "Qué blandito."],
  perch: ["¡Qué vistas!", "Aquí arriba se está bien.", "Mi nuevo sitio favorito."],
  splat: ["Plaf.", "Ay… estoy plano.", "Me he espachurrado.", "Recogiendo mis bultos…", "Desde muy arriba, eso."],
  night: ["Me voy a dormir. Hasta mañana.", "Son las diez… a la cama.", "Buenas noches. Ronco poco, prometido."],
  siesta: ["Hora de la siesta…", "Una siestecita y vuelvo.", "Después de comer, a dormir un poco."],
  morning: ["¡Buenos días! Qué bien he dormido.", "Ya estoy despierto. Más o menos.", "Mmm… ¿ya es de día?"],
  awake: ["Ya estoy. Qué siesta más buena.", "Uf, me he quedado frito.", "¿Me he perdido algo?"],
  link: (n) => pick([`¿A ${n}?`, `${n}, buena elección.`, `Saluda a ${n} de mi parte.`]),
};

// sueños: lo que murmura dormido, a veces con algo del día (eventos, tareas, servicios, tiempo)
const DREAMS = ["galletas…", "cinco minutos más…", "nubes de algodón…", "no, el rojo no…", "¿un pato?…", "soy un dragón…", "más alto… más alto…", "qué bien huele…", "todo de chocolate…", "la luna… es queso…", "ñam…", "ese botón no…"];
// las dos o tres primeras palabras, en minúscula y sin signos: «la reunión de equipo…»
const bit = (s, n = 3) => {
  const w = String(s || "").replace(/[«»"“”¿?¡!.,:;()]/g, " ").split(/\s+/).filter(Boolean).slice(0, n).join(" ");
  return w.length > 24 ? w.slice(0, 24).trim() : w;
};
const low = (s) => (s && s[0] === s[0].toUpperCase() && s.slice(1, 2) === s.slice(1, 2).toLowerCase() ? s[0].toLowerCase() + s.slice(1) : s);
export function dream(f = {}, r = Math.random) {
  const one = (a) => a[Math.floor(r() * a.length)];
  const day = [];
  const ev = (f.w?.cal?.events || []).filter((e) => e?.title);
  if (ev.length) { const e = bit(one(ev).title); if (e) day.push(`${low(e)}… ¿a qué hora era?…`, `${low(e)}…`); }
  if (f.todos?.length) { const t = bit(one(f.todos)); if (t) day.push(`${low(t)}… mañana…`, `que sí… ${low(t)}…`); }
  const down = f.services?.down || [];
  if (down.length) { const s = bit(one(down), 2); day.push(`${s}… vuelve…`, `${s}… no te vayas…`); }
  const rain = f.weather?.rain;
  if (rain >= 50) day.push("plic… plic… paraguas…");
  const words = day.length && r() < 0.5 ? one(day) : one(DREAMS);
  return "zzz… " + words;
}
