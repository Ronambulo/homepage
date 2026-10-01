// Kero: fechas especiales (tu cumpleaños si se lo contaste, fiestas, viernes por la tarde, lunes por la mañana).
// special(ahora, memoria, nombre) → { key, text, face, act } o null. Se dice una vez (la clave lleva la fecha).

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const flat = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const pick = (a, r) => a[Math.floor(r() * a.length)];

// «mi cumpleaños es el 3 de mayo», «cumplo años el 3/5», «nací el 3 de mayo de 1990» → { m (0-11), d } o null
export function birthday(mem = []) {
  for (const x of [...(mem || [])].reverse()) {
    const t = flat(x?.text ?? x);
    if (!/cumple|naci\b|nacimiento/.test(t)) continue;
    let m = new RegExp(`\\b(\\d{1,2}) de (${MONTHS.join("|")})\\b`).exec(t);
    if (m) return { d: +m[1], m: MONTHS.indexOf(m[2]) };
    m = /\b(\d{1,2})[/-](\d{1,2})\b/.exec(t);
    if (m && +m[2] >= 1 && +m[2] <= 12) return { d: +m[1], m: +m[2] - 1 };
  }
  return null;
}

export function special(now = Date.now(), mem = [], name = "", r = Math.random) {
  const d = new Date(now), y = d.getFullYear(), mo = d.getMonth(), day = d.getDate(), h = d.getHours(), dow = d.getDay();
  const you = name ? `, ${name}` : "";
  const ymd = `${y}-${mo + 1}-${day}`;
  const is = (M, D) => mo === M && day === D;

  // tu cumpleaños (y el día antes, por la tarde)
  const b = birthday(mem);
  if (b) {
    if (is(b.m, b.d)) return { key: `bday:${y}`, text: pick([`¡Feliz cumpleaños${you}! Hoy toca tarta.`, `¡Es tu cumpleaños${you}! ¡Que cumplas muchos más!`, `¡Felicidades${you}! Hoy mandas tú.`], r), face: "love", act: "party" };
    const tm = new Date(y, mo, day + 1);
    if (tm.getMonth() === b.m && tm.getDate() === b.d && h >= 12) return { key: `bday-1:${y}`, text: "Mañana es tu cumpleaños. ¿Ya sabes qué vas a pedir?", face: "happy", act: "dance" };
  }

  // fiestas
  if (is(0, 1)) return { key: `ny:${y}`, text: `¡Feliz año nuevo${you}! ${y}, allá vamos.`, face: "love", act: "party" };
  if (is(0, 6)) return { key: `reyes:${y}`, text: "¡Día de Reyes! ¿Te han traído carbón?", face: "wink", act: "dance" };
  if (is(9, 31) && h >= 17) return { key: `hw:${y}`, text: "¡Buuu! Feliz Halloween.", face: "sus", act: "dance" };
  if (is(11, 24) && h >= 17) return { key: `nb:${y}`, text: "¡Feliz Nochebuena! Que no falten los turrones.", face: "happy", act: "dance" };
  if (is(11, 25)) return { key: `xmas:${y}`, text: `¡Feliz Navidad${you}!`, face: "love", act: "party" };
  if (is(11, 31) && h >= 18) return { key: `nv:${y}`, text: "¡Últimas horas del año! ¿Tienes las uvas preparadas?", face: "happy", act: "party" };

  // la semana
  if (dow === 5 && h >= 15 && h < 23) return { key: `fri:${ymd}`, text: pick(["¡Viernes por la tarde! Ya huele a finde.", "¡Es viernes! Lo que queda de semana cabe en un bostezo.", "Viernes tarde: modo finde activándose…"], r), face: "happy", act: "dance" };
  if (dow === 1 && h >= 6 && h < 12) return { key: `mon:${ymd}`, text: pick(["Lunes por la mañana… Ánimo, que tú puedes.", "Otra vez lunes. Un café y a por ello.", "Lunes. Respira hondo, que la semana es larga."], r), face: "idle", act: "sigh" };
  return null;
}
