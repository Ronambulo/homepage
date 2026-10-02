// Kero: registro de fallos (fase 0.2), apagado por defecto. Solo el texto de tus preguntas y por dónde fueron,
// nunca datos de los widgets. El servidor lo guarda en data/kero-log.jsonl (lib/kero.js) y sirve para sacar
// casos reales para el banco de preguntas (npm run kero-log).
import { routeKey } from "./habits.js";

export const LOG_MAX = 500;
// por qué se apunta:
//   wrong    → le has dicho «no, eso no»
//   rephrase → has vuelto a preguntar lo mismo con otras palabras en menos de 30 s
//   dunno    → la IA ha contestado que no lo sabe
//   numbers  → la IA se ha inventado cifras de tus widgets y se han cambiado (fase 5)
//   web      → en la respuesta de internet se han quitado frases que no salían en las fuentes (fase 3)
export const LOG_WHY = ["wrong", "rephrase", "dunno", "numbers", "web"];
export const REPHRASE_MS = 30000;

const str = (v, n) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");
// una línea limpia (o null si no vale): { at, why, q, route, next?, n? }
export function logEntry(b, now = Date.now()) {
  const why = LOG_WHY.includes(b?.why) ? b.why : null, q = str(b?.q, 200);
  if (!why || !q) return null;
  const e = { at: now, why, q, route: str(b.route, 40) || "ai" };
  const next = str(b.next, 200);
  if (next) e.next = next;
  if (Number.isFinite(b.n) && b.n > 0) e.n = Math.min(99, Math.round(b.n));
  return e;
}

// las últimas LOG_MAX líneas, con la nueva al final
export const rotate = (lines, add, max = LOG_MAX) => [...lines.filter(Boolean), ...add].slice(-max);

// ¿«text» es la pregunta anterior dicha de otra forma (o repetida)? Mismas palabras importantes en buena parte.
//   «¿y mañana?» es un seguimiento, no una repetición
export function rephrased(prev, text) {
  if (!prev || !text || /^[\s¿¡]*y\s+\S/i.test(text)) return false;
  const a = new Set(routeKey(prev).split(" ").filter(Boolean)), b = new Set(routeKey(text).split(" ").filter(Boolean));
  if (!a.size || !b.size) return false;
  const both = [...a].filter((w) => b.has(w)).length;
  return both / new Set([...a, ...b]).size >= 0.5;
}
