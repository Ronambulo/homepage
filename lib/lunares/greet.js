// Kero: se acuerda de tus visitas («¡cuánto tiempo!», «¿qué haces por aquí a estas horas?», «otra vez por aquí»).
// seen = { last (ms de la última vez que te vio), day ("2026-10-1"), n (visitas de ese día) }

const GAP = 5 * 60000; // recargar o volver al rato no es otra visita
const dayOf = (t) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
const pick = (a, r) => a[Math.floor(r() * a.length)];

// al cargar la página: { seen (lo que hay que guardar), gap (ms desde la última vez; null si es la primera), n (visitas de hoy), first }
export function visit(seen, now = Date.now()) {
  const last = Number.isFinite(seen?.last) ? seen.last : null;
  const gap = last == null ? null : Math.max(0, now - last);
  const day = dayOf(now);
  let n = seen?.day === day ? seen.n || 1 : 0;
  if (gap == null || gap >= GAP || n === 0) n += 1;
  return { seen: { last: now, day, n }, gap, n, first: last == null };
}

// el saludo según la visita; null = el de siempre
export function greet(v, now = Date.now(), name = "", r = Math.random) {
  if (!v) return null;
  const you = name ? `, ${name}` : "";
  const h = new Date(now).getHours(), D = 86400000;
  if (v.first) return { text: `¡Hola${you}! Soy Kero. Me quedo por aquí abajo, haciéndote compañía.`, face: "happy" };
  if (v.gap >= 7 * D) return { text: pick([`¡Cuánto tiempo${you}! Ya pensaba que te habías olvidado de mí.`, `¡Has vuelto${you}! Una semana sin verte, por lo menos.`], r), face: "love" };
  if (v.gap >= 2 * D) return { text: `¡Hola de nuevo${you}! Hacía ${Math.floor(v.gap / D)} días que no venías.`, face: "happy" };
  if (v.gap >= GAP && h >= 1 && h < 6) return { text: pick(["¿Qué haces por aquí a estas horas?", "Shh… que es de madrugada. ¿No puedes dormir?", "¿A estas horas? Yo estaba soñando con galletas."], r), face: "sus" };
  if (v.gap >= GAP && (v.n === 4 || (v.n > 4 && v.n % 5 === 0))) return { text: pick([`Otra vez por aquí. Ya van ${v.n} hoy.`, `¡Visita número ${v.n} del día! Me tienes contento.`], r), face: "wink" };
  return null;
}
