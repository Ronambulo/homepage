// Kero: utilidades del motor (sin React).
export const PX = { s: 60, m: 84, l: 120 };
export const rnd = (a, b) => a + Math.random() * (b - a);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lin = (u) => u;
export const io = (u) => u * u * (3 - 2 * u);
export class Cancel extends Error {}

// localStorage que no falla (modo privado, cuota…)
export const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || "null"); return v ?? d; } catch { return d; } };
export const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
