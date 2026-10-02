// Kero: lo que la IA puede pedir en la charla, con una etiqueta al empezar la respuesta.
//   [busca: consulta]        → lo busca en internet (y contesta con las fuentes)
//   [orden: la orden]        → un recordatorio, temporizador o tarea dicho con otras palabras, reescrito como las de siempre
//   [abre: nombre de la app] → el enlace a una de tus apps
// Las ejecuta la página con el mismo código que las órdenes sin IA (commands.js, router.js). Etiquetas y no `tools`
// de OpenWebUI: funcionan con cualquier modelo y versión, y se pueden leer mientras llega la respuesta.

export const TOOL_RULES = `Herramientas: si hace falta, en vez de contestar escribe solo una de estas etiquetas (después de tu emoción) y nada más:
- [busca: consulta corta] si la pregunta va de algo que cambia (noticias, resultados, precios, cargos, estrenos) o de un dato que no sabes seguro (fechas, cifras, quién es alguien). Mejor buscar que inventar.
- [orden: la orden] si te pide un recordatorio, un temporizador o apuntar una tarea con otras palabras. Escríbela así: «recuérdame <cuándo> <qué>», «pon un temporizador de <tiempo>» o «apunta <tarea>». No inventes la hora: si no la dijo, ponla sin hora.
- [abre: nombre] si quiere abrir una de sus apps.
Ejemplos:
«¿Quién es el presidente de Francia?» → [think] [busca: presidente de Francia]
«Que no se me pase llamar al dentista mañana a las 10» → [proud] [orden: recuérdame mañana a las 10 llamar al dentista]
«¿Qué es una gota?» → [happy] Una gota es una porción pequeñita de líquido, redondita como yo.`;

const NAMES = { busca: "busca", buscar: "busca", orden: "orden", abre: "abre", abrir: "abre" };
const TAG = /\[\s*(busca|buscar|orden|abre|abrir)\s*:\s*([^\]\n]{2,200}?)\s*(\]|$)/i;
const THINK = /<think>[\s\S]*?(<\/think>|$)|<details[^>]*type="reasoning"[\s\S]*?(<\/details>|$)/g;

// la herramienta que pide la respuesta → { name, arg } o null
//   done: la respuesta ya ha terminado (vale una etiqueta sin cerrar al final); si no, solo las cerradas
export function toolOf(raw, done = true) {
  const m = String(raw || "").replace(THINK, " ").match(TAG);
  if (!m || (!done && m[3] !== "]")) return null;
  const arg = m[2].replace(/^[«"'\s]+|[»"'\s.]+$/g, "").trim();
  return arg.length >= 2 ? { name: NAMES[m[1].toLowerCase()], arg } : null;
}

// mientras llega: lo que se puede enseñar ya (sin una etiqueta a medio escribir, que podría ser una herramienta)
export const shown = (raw) => String(raw || "").replace(/\[[^\]]*$/, "");
