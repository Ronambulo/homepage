// Kero: horario de sueño.

// Siesta de hoy (entre las 15 y las 17, de 30 a 60 min, no todos los días). Igual en cada recarga.
export function siesta(d = new Date()) {
  let x = d.getFullYear() * 400 + d.getMonth() * 31 + d.getDate();
  const r = () => { x = (x + 0x6d2b79f5) | 0; let t = Math.imul(x ^ (x >>> 15), 1 | x); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  if (r() > 0.6) return null;
  const dur = 30 + Math.round(r() * 30), start = 15 * 60 + Math.round(r() * (120 - dur));
  return [start, start + dur];
}
// ¿Toca dormir? "night" de 22 a 9, "siesta" si cae en la de hoy
export function sleepy(d = new Date()) {
  const h = d.getHours(), m = h * 60 + d.getMinutes();
  if (h >= 22 || h < 9) return "night";
  const s = siesta(d);
  return s && m >= s[0] && m < s[1] ? "siesta" : null;
}
