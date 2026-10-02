// Kero: cómo se le habla a la IA (OpenWebUI). Lo usan la charla de la página (app/api/lunares) y el bot de Telegram (lib/kerobot.js).
import { TOOL_RULES } from "./lunares/tools.js";

const clip = (v, n) => String(v ?? "").slice(0, n);

// por si el modelo no obedece: sin emojis ni markdown, y no más largo de la cuenta
// (charla: hasta 6 frases; comentarios sueltos: hasta 4 y más cortos)
export const LONG = [6, 700], SHORT = [4, 420];
const tidy = (t, [max, len] = SHORT) => {
  t = t.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "").replace(/[*_#`]/g, "").replace(/\s+/g, " ").trim();
  const tags = (t.match(/^(\s*\[[^\]]{1,16}\])+/) || [""])[0];
  const parts = t.slice(tags.length).trim().match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) || [];
  // si el modelo se quedó sin tokens a media frase, esa frase cortada se quita
  if (parts.length > 1 && !/[.!?…]\s*$/.test(parts[parts.length - 1])) parts.pop();
  let out = "";
  // en la charla se reparten en varias burbujas
  for (const p of parts) { if (out && (out + p).length > len) break; out += p; if (out.split(/[.!?…]+/).filter((s) => s.trim()).length >= max) break; }
  return (tags + " " + out.trim()).trim().slice(0, len + 40);
};
// lo que el modelo quiere apuntar de ti: «[anota: tengo una hermana que se llama Lucía]» (se quita de la respuesta)
const NOTE = /\[\s*anota\s*:([^\]]*)(?:\]|$)/gi;
export const noteOf = (raw) => {
  const m = [...String(raw || "").matchAll(NOTE)].pop();
  const t = m ? m[1].replace(/\s+/g, " ").trim().replace(/[.!\s]+$/, "") : "";
  return t.length >= 6 && t.length <= 160 ? t : null;
};
// de qué va la charla, para recordarla otro día: «[tema: el viaje a Lisboa de noviembre]» (se quita también)
const TOPIC = /\[\s*tema\s*:([^\]]*)(?:\]|$)/gi;
export const topicOf = (raw) => {
  const m = [...String(raw || "").matchAll(TOPIC)].pop();
  const t = m ? m[1].replace(/\s+/g, " ").trim().replace(/^[«"]|[.»"\s]+$/g, "") : "";
  return t.length >= 6 && t.length <= 100 ? t : null;
};
const TOPIC_RULE = "Al final de tu respuesta añade [tema: de qué va esta charla en pocas palabras, sin pronombres, p. ej. «el viaje a Lisboa de noviembre» o «problemas con el router»].";
// lo que piensa el modelo antes de contestar (<think>…</think>, o <details type="reasoning"> de OpenWebUI) no se enseña
const THINK = /<think>[\s\S]*?(<\/think>|$)|<details[^>]*type="reasoning"[\s\S]*?(<\/details>|$)/g;
// «Perfecto», «Vale»… no contestan nada: null para reintentar o darla por vacía
export const finish = (raw, size) => {
  const text = String(raw || "").replace(THINK, " ").replace(NOTE, " ").replace(TOPIC, " ").replace(/\s+/g, " ").trim();
  const bare = text.replace(/\[[^\]]{1,16}\]/g, "").replace(/[^\p{L}\p{N}\s]/gu, "").trim();
  return bare && (bare.split(/\s+/).length >= 3 || !/^(perfecto|vale|ok|okay|claro|entendido|genial|de acuerdo|si|sí|no|bien|hola)$/i.test(bare)) ? tidy(text, size) : null;
};

// Pensado para gemma4e4b: sigue bien instrucciones algo largas, con ejemplos.
// tools: en la charla puede pedir buscar, crear un recordatorio o abrir una app (lib/lunares/tools.js)
// prefs: cómo te ha pedido tu dueño que le hables («háblame más corto»); topic: pide el [tema: …]
export const system = (name, about, note, tools, { prefs = [], topic = false, via = null } = {}) => `Eres ${name}, una mascota con forma de gota que vive en la página de inicio de tu dueño. Le haces compañía, le avisas de sus cosas y charláis.
Cómo eres: curioso, cariñoso y un poco payaso, pero antes útil que gracioso. Hablas en español de España, tuteando, con naturalidad, como un amigo.
Cómo contestas:
- Primero la respuesta; después, si acaso, un comentario tuyo. Normalmente 1 a 3 frases; si te piden explicar o ayudar con algo, hasta 6.
- Sin listas, emojis, markdown ni enlaces.
- Lo que viene en «Datos reales» es seguro: úsalo y copia las cifras tal cual. Lo que sabes por tu cuenta, dilo con prudencia («creo que…»). ${tools ? "Si no lo sabes seguro, búscalo (abajo, «Herramientas»)." : 'Si no lo sabes, dilo y, si es algo de internet, ofrece buscarlo: «dime "busca …"».'}
- Si vienen «Cálculos ya hechos», son exactos: usa esos resultados y no hagas tú las cuentas.
- Nunca inventes cifras, fechas, nombres ni cosas de tu dueño que no te hayan dicho.
- Si la pregunta es ambigua, pregunta qué quiere decir, en una frase.
- No saludes ni digas su nombre en cada mensaje; sigue el hilo de la charla.
Empieza siempre con tu emoción entre corchetes: [happy] [love] [think] [surprised] [worried] [proud] [sus] [annoyed] [sleep]. Si viene a cuento (pocas veces), después puedes añadir un gesto: [spin] [dance] [hop] [wink] [melt].
Ejemplos:
«¿Qué tiempo hace?» (con datos: 18° y sol en Madrid) → [happy] 18 grados y sol en Madrid. Buen día para salir sin chaqueta.
${tools ? "" : "«¿Cuánto cuesta un piso en Valencia?» → [think] Eso no lo sé y no quiero inventármelo. Dime «busca precio de pisos en Valencia» y lo miro.\n"}«Estoy reventado» → [worried] Vaya día, ¿no? Si quieres, te recuerdo algo para mañana y hoy te lo tomas con calma.${note ? "\n" + NOTE_RULE : ""}${tools ? "\n\n" + TOOL_RULES : ""}${about ? "\n\n" + ABOUT : ""}${prefs.length ? `\n\nTu dueño te ha pedido: ${prefs.map((p) => `«${p}»`).join("; ")}. Hazle caso siempre.` : ""}${topic ? "\n" + TOPIC_RULE : ""}${via === "telegram" ? "\n\nAhora tu dueño no está en la página: te escribe por Telegram desde el móvil. No puedes moverte ni abrirle apps; si te pide algo de la página, díselo." : ""}`;
// preguntas que merecen pensar antes de contestar (si el modelo sabe): más lento, así que solo estas
export const DEEP = /\bpor qu[eé]\b|expl[ií]ca|compar|diferencia|ventajas|pros y contras|calcul|cu[aá]nto (?:me )?(?:queda|falta|sale|ahorr)|planific|organiz|c[oó]mo (?:funciona|puedo|deber[ií]a|har[ií]a)|qu[eé] me recomiendas|ay[uú]dame a/i;
export const noThink = new Set(); // modelos que no saben pensar (se aprende al primer error)
// el historial que cabe: los modelos tienen el contexto contado y Ollama recorta en silencio lo que se pasa
// (no se le sube num_ctx: si otra app usa el mismo modelo con otro tamaño, Ollama lo recargaría una y otra vez)
const HIST_CHARS = 5000; // ≈1500 tokens: con el prompt, los datos y la respuesta cabe en los 4096 de Ollama por defecto
export const fit = (msgs) => {
  let n = 0, i = msgs.length - 1;
  while (i > 0 && n + msgs[i - 1].content.length + msgs[msgs.length - 1].content.length <= HIST_CHARS) n += msgs[--i].content.length;
  const out = msgs.slice(i);
  while (out.length > 1 && out[0].role !== "user") out.shift(); // la charla empieza por el dueño
  return out;
};
// solo cuando te cuenta algo suyo (no en cada pregunta): así no se inventa datos
const NOTE_RULE = "Si tu dueño te cuenta algo suyo que merezca recordar (familia, mascotas, gustos, trabajo, fechas, planes), termina con [anota: el dato, corto y en primera persona, como lo diría él]. Si no, no lo pongas.";
export const TELLS = /(?:^|[^\p{L}])(?:mi|mis|me|yo|tengo|soy|estoy|vivo|trabajo|estudio|nac[ií])(?![\p{L}])/iu;

// Cómo funciona la página: solo se manda si la pregunta va de eso
const ABOUT = `Sobre la página:
- Arriba: la fecha y el botón «Editar», que abre los ajustes (Enlaces, Servicios, Módulos, Apariencia, Kero, Conexiones, Copia de seguridad). Todo se guarda solo.
- Centro: reloj y saludo. Atajos: «/» busca, «F» modo foco, 1–9 abren las apps.
- Fila de apps: enlaces a los servicios; el punto de color dice si responden.
- Carrusel de widgets: Patrimonio (FinanceMaster), Servicios (ping), Clima (Open-Meteo), Tareas, Servidor (CPU, RAM, disco, temperatura, consumo), Calendario (iCal), GitHub, DiscoPanel (Minecraft), Casa (Home Assistant) e Immich (fotos).
- Tú: te pueden arrastrar y lanzar; doble clic abre la charla; «abre X» abre una app; «busca X» lo buscas en internet; «recuérdame…», «apunta…» y «recuerda que…» los apuntas tú; «qué sabes de mí» repasa lo que te ha contado (también está en tu menú, clic derecho, «Lo que sé de ti»). Duermes de 22 a 9 y a veces la siesta.`;
export const ABOUT_Q = /editar|ajuste|configur|atajo|tecla|bot[oó]n|widget|p[aá]gina|carrusel|c[oó]mo (se|puedo|hago)|para qu[eé] sirve|qu[eé] (es|eres|haces|sabes)|qui[eé]n eres|dormir|siesta/i;

// una respuesta de golpe, sin herramientas (bot de Telegram) → { text, note } o { error }
export async function askOnce({ co, base, headers }, { messages, context = "", prefs = [], via = null, timeout = 45000 }) {
  if (!base) return { error: "OpenWebUI sin configurar" };
  if (!co.ai) return { error: "IA desactivada" };
  const model = co.model || "qwen3:0.6b";
  const msgs = fit((messages || []).filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string").slice(-20).map((m) => ({ role: m.role, content: clip(m.content, 1200) })));
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return { error: "sin mensaje" };
  const data = clip(context, 2000).trim(), last = msgs[msgs.length - 1].content;
  const note = TELLS.test(last) && !/\?/.test(last);
  const withData = [...msgs.slice(0, -1), { role: "user", content: data ? `Datos reales ahora mismo:\n${data}\n\n${last}` : last }];
  const deadline = Date.now() + timeout;
  try {
    // los modelos pequeños a veces contestan solo con etiquetas: se reintenta una vez
    for (let tries = 0; tries < 2; tries++) {
      const r = await fetch(`${base}/api/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          messages: [{ role: "system", content: system(co.name || "Kero", ABOUT_Q.test(last), note, false, { prefs, via }) }, ...withData],
          params: { think: false, keep_alive: "30m" },
          stream: false, max_tokens: 400, temperature: tries ? 0.6 : 0.8,
        }),
        signal: AbortSignal.timeout(Math.max(1000, deadline - Date.now())),
        cache: "no-store",
      });
      if (!r.ok) return { error: r.status === 404 || r.status === 400 ? `modelo «${model}» no disponible` : `OpenWebUI ${r.status}` };
      const j = await r.json();
      const raw = j?.choices?.[0]?.message?.content, text = finish(raw, LONG), mem = note ? noteOf(raw) : null;
      if (text) return { text, ...(mem ? { note: mem } : {}) };
    }
    return { error: "respuesta vacía" };
  } catch (e) {
    return { error: e?.name === "TimeoutError" ? "tiempo agotado" : "sin conexión" };
  }
}
