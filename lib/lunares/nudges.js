// Kero: avisos útiles que da por su cuenta, cada uno una sola vez.
// nudges(facts, ahora, yaDichos) → [{ key, text, face, wake }] (el primero es el más urgente)

const hm = (d) => d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

export function nudges(f = {}, now = Date.now(), said = {}, prevUp = null) {
  const out = [], d = new Date(now), h = d.getHours();
  const add = (key, text, face = "happy", wake = false) => { if (!said[key]) out.push({ key, text, face, wake }); };
  const events = (f.w?.cal?.events || []).filter((e) => e && e.start && !e.allDay);

  // un evento que empieza en 10 minutos o menos
  for (const e of events) {
    const st = +new Date(e.start), mins = Math.round((st - now) / 60000);
    if (mins >= 0 && mins <= 10) add(`ev:${e.title}:${st}`, mins <= 1 ? `¡«${e.title}» empieza ya!` : `«${e.title}» empieza en ${mins} minutos.`, "surprised", true);
  }

  // un servicio que vuelve a funcionar (prevUp: nombres caídos en la última vuelta)
  if (prevUp && f.services) {
    const downNow = new Set(f.services.down || []);
    for (const name of prevUp) if (!downNow.has(name)) add(`up:${name}:${Math.floor(now / 60000)}`, `¡${name} vuelve a funcionar!`, "happy");
  }

  // mucha lluvia: una vez al día, de 7 a 20
  const rain = f.weather?.rain ?? f.w?.wx?.rain;
  if (rain >= 60 && h >= 7 && h < 20) add(`rain:${dayKey(d)}`, `Hoy hay un ${rain}% de lluvia${f.weather?.city ? ` en ${f.weather.city}` : ""}. Si sales, que no te pille.`, "worried");

  // por la tarde: si mañana hay algo temprano (antes de las 10), se avisa una vez
  if (h >= 19 && h < 23) {
    const tm = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    const early = events.filter((e) => { const s = new Date(e.start); return s.toDateString() === tm.toDateString() && s.getHours() < 10; })
      .sort((a, b) => +new Date(a.start) - +new Date(b.start))[0];
    if (early) add(`early:${dayKey(tm)}`, `Mañana madrugas: «${early.title}» a las ${hm(new Date(early.start))}.`, "think");
  }
  return out;
}

// quita los avisos ya dichos de hace más de dos días
export function pruneSaid(said = {}, now = Date.now()) {
  const out = {};
  for (const [k, at] of Object.entries(said)) if (now - at < 2 * 86400000) out[k] = at;
  return out;
}
