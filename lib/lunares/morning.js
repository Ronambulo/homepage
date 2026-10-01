// Kero: el resumen del día que da en la primera visita (a partir de las 6).
// morning(facts, recordatorios, ahora) → hasta dos frases cortas ([] si no hay nada que contar)

const hm = (d) => d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
export const dayKey = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
// «2026-10-01» (eventos de día entero) es medianoche local, no UTC
const toDate = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) : new Date(s));
const list = (a) => (a.length < 2 ? a.join("") : `${a.slice(0, -1).join(", ")} y ${a.at(-1)}`);

// ¿han llegado ya los datos de algún widget? (si no, el resumen se deja para luego)
export const morningReady = (f = {}) => !!(f.weather || f.w?.cal || f.todos || f.services);

export function morning(f = {}, rems = [], now = Date.now()) {
  const d = new Date(now), end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  const one = [], two = [];

  // agenda de hoy: lo que queda (los de día entero, aunque ya hayan empezado)
  const cal = f.w?.cal;
  if (cal && cal.ok !== false) {
    const ev = (cal.events || []).filter((e) => e?.title && e.start).map((e) => ({ ...e, s: toDate(e.start), e: e.end ? toDate(e.end) : null }))
      .filter((e) => e.s.getTime() < end && (e.allDay ? e.s.toDateString() === d.toDateString() || (e.e && e.e.getTime() > now) : e.s.getTime() >= now))
      .sort((a, b) => a.s - b.s);
    const allDay = ev.filter((e) => e.allDay), timed = ev.filter((e) => !e.allDay);
    if (timed.length) one.push(`Hoy tienes ${list(timed.slice(0, 3).map((e) => `«${e.title}» a las ${hm(e.s)}`))}${timed.length > 3 ? ` y ${timed.length - 3} más` : ""}.`);
    if (allDay.length) one.push(`Hoy es ${list(allDay.slice(0, 2).map((e) => `«${e.title}»`))}.`);
    if (!ev.length) one.push("Hoy no tienes nada en el calendario.");
  }

  // el tiempo
  const w = f.weather;
  if (w && Number.isFinite(w.hi) && Number.isFinite(w.lo)) {
    const rain = w.rain ?? 0;
    one.push(`Hoy de ${w.lo}° a ${w.hi}°${rain >= 60 ? `, con un ${rain}% de lluvia: mejor llévate paraguas` : rain >= 30 ? `, con un ${rain}% de lluvia` : ""}.`);
  }

  // recordatorios que quedan hoy
  const today = (rems || []).filter((r) => r && r.at > now && r.at < end && r.text).sort((a, b) => a.at - b.at);
  if (today.length) two.push(`Te recordaré ${list(today.slice(0, 3).map((r) => `${r.text.replace(/[.!]+$/, "")} (${hm(new Date(r.at))})`))}.`);

  // tareas y servicios caídos
  const n = f.todos?.length || 0;
  if (n) two.push(n === 1 ? `Te queda una tarea: ${f.todos[0]}.` : `Te quedan ${n} tareas pendientes.`);
  const down = f.services?.down || [];
  if (down.length) two.push(`Ojo: ${list(down.slice(0, 3))} ${down.length === 1 ? "está caído" : "están caídos"}.`);

  return [one.join(" "), two.join(" ")].filter(Boolean);
}
