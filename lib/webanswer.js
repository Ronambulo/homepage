import { sourcesFor, checkWeb, cites, WEB_RULES } from "./lunares/webai.js";

// lo que piensa el modelo antes de contestar no se enseña
const THINK = /<think>[\s\S]*?(<\/think>|$)|<details[^>]*type="reasoning"[\s\S]*?(<\/details>|$)/g;

// Respuesta de internet escrita por la IA a partir de las fuentes, citando [n].
// Cada cifra y cada nombre propio tiene que estar en las fuentes; si no queda nada que valga, null (y se usa el resumen sin IA).
// → { text, sources, dropped } o null
export async function webAnswer(v, question, { co, base, headers }) {
  if (!base || !v?.results?.length) return null;
  const { list, prompt } = sourcesFor(v);
  if (!list.length) return null;
  const today = new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const q = String(question || v.q).slice(0, 300);
  let r;
  try {
    r = await fetch(`${base}/api/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: co.model || "qwen3:0.6b",
        messages: [
          { role: "system", content: `Eres ${co.name || "Kero"}, la mascota de la página de inicio de tu dueño. ${WEB_RULES}\nHoy es ${today}.` },
          { role: "user", content: `Fuentes:\n${prompt}\n\nPregunta: ${q}` },
        ],
        params: { think: false, keep_alive: "30m" },
        stream: false, max_tokens: 380, temperature: 0.3,
      }),
      signal: AbortSignal.timeout(35000),
      cache: "no-store",
    });
  } catch { return null; }
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  const raw = String(j?.choices?.[0]?.message?.content || "").replace(THINK, " ").replace(/\s+/g, " ").trim();
  if (!raw) return null;
  // lo que no sale en ninguna fuente, fuera
  const chk = checkWeb(raw, list.map((s) => `${s.site} ${s.title} ${s.text}`).concat(v.agree || []), q);
  const out = cites(chk.text, list);
  if (out.text.replace(/[^\p{L}\p{N}]/gu, "").length < 25) return null;
  return { text: out.text, sources: out.sources, dropped: chk.bad.length };
}
