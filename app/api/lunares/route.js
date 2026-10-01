import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { owui } from "@/lib/owui";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };
const fail = (error, status = 502) => NextResponse.json({ error }, { status, headers: NO_STORE });
const clip = (v, n) => String(v ?? "").slice(0, n);

// los modelos pequeños no siempre obedecen: sin emojis, sin markdown y como mucho cuatro frases
const tidy = (t, max = 4, len = 420) => {
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
// «Perfecto», «Vale»… no contestan nada: null para reintentar o darla por vacía
const finish = (raw) => {
  const text = String(raw || "").replace(/<think>[\s\S]*?(<\/think>|$)/g, "").replace(/\s+/g, " ").trim();
  const bare = text.replace(/\[[^\]]{1,16}\]/g, "").replace(/[^\p{L}\p{N}\s]/gu, "").trim();
  return bare && (bare.split(/\s+/).length >= 3 || !/^(perfecto|vale|ok|okay|claro|entendido|genial|de acuerdo|si|sí|no|bien|hola)$/i.test(bare)) ? tidy(text) : null;
};

// Instrucciones cortas: los modelos pequeños (gemma3:270m, qwen3:0.6b) se pierden con un prompt largo.
const system = (name, about) => `Eres ${name}, una mascota con forma de gota que vive en la página de inicio de tu dueño. Eres curioso, cariñoso y algo payaso. Hablas en español, tuteando.
Reglas: contesta con frases cortas, normalmente 1 o 2; si tienes varias cosas que contar, hasta 4. Sin listas, emojis ni markdown. Usa solo los datos que te dan; si no están, di que no lo sabes. Nunca inventes cifras.
Empieza con una emoción entre corchetes: [happy] [love] [think] [surprised] [worried] [proud] [sus] [annoyed] [sleep].${about ? "\n\n" + ABOUT : ""}`;

// Cómo funciona la página: solo se manda si la pregunta va de eso
const ABOUT = `Sobre la página:
- Arriba: la fecha y el botón «Editar», que abre los ajustes (Enlaces, Servicios, Módulos, Apariencia, Kero, Conexiones, Copia de seguridad). Todo se guarda solo.
- Centro: reloj y saludo. Atajos: «/» busca, «F» modo foco, 1–9 abren las apps.
- Fila de apps: enlaces a los servicios; el punto de color dice si responden.
- Carrusel de widgets: Patrimonio (FinanceMaster), Servicios (ping), Clima (Open-Meteo), Tareas, Servidor (CPU, RAM, disco, temperatura, consumo), Calendario (iCal), GitHub, DiscoPanel (Minecraft), Casa (Home Assistant) e Immich (fotos).
- Tú: te pueden arrastrar y lanzar; doble clic abre la charla; «abre X» abre una app; «busca X» lo buscas en internet; «recuérdame…», «apunta…» y «recuerda que…» los apuntas tú. Duermes de 22 a 9 y a veces la siesta.`;
const ABOUT_Q = /editar|ajuste|configur|atajo|tecla|bot[oó]n|widget|p[aá]gina|carrusel|c[oó]mo (se|puedo|hago)|para qu[eé] sirve|qu[eé] (es|eres|haces|sabes)|qui[eé]n eres|dormir|siesta/i;

// Puente con OpenWebUI (API compatible con OpenAI). La clave nunca sale del servidor.
// Con `stream: true` contesta en NDJSON: {"d": trozo}… y al final {"text": respuesta limpia} o {"error"}.
export async function POST(req) {
  if (!(await isAuthed())) return fail("unauthorized", 401);
  let body;
  try { body = await req.json(); } catch { return fail("bad json", 400); }
  const { co, base, headers } = await owui();
  // test: el botón «Probar» de ajustes funciona aunque la IA esté apagada y con el modelo elegido
  if (!base) return fail("OpenWebUI sin configurar", 400);
  if (!co.ai && !body?.test) return fail("IA desactivada", 400);
  const model = (typeof body?.model === "string" && body.model.trim() && clip(body.model.trim(), 80)) || co.model || "qwen3:0.6b";
  const msgs = (Array.isArray(body?.messages) ? body.messages : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-12)
    .map((m) => ({ role: m.role, content: clip(m.content, 600) }));
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return fail("sin mensaje", 400);
  // los datos van pegados a la última pregunta: un modelo pequeño los ignora si están lejos, en el prompt de sistema
  const data = clip(body?.context, 2000).trim(), last = msgs[msgs.length - 1].content;
  const about = ABOUT_Q.test(last);
  const withData = [...msgs.slice(0, -1), { role: "user", content: data ? `Datos reales ahora mismo:\n${data}\n\n${last}` : last }];
  const call = (tries, stream, signal) => fetch(`${base}/api/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system(co.name || "Kero", about) }, ...withData],
      // think: false apaga el razonamiento de qwen3 (si no, piensa cientos de tokens antes de contestar)
      params: { think: false, keep_alive: "30m" },
      stream, max_tokens: 180, temperature: tries ? 0.6 : 0.8,
    }),
    signal,
    cache: "no-store",
  });
  const bad = (r) => (r.status === 404 || r.status === 400 ? `modelo «${model}» no disponible` : `OpenWebUI ${r.status}`);

  if (body?.stream) {
    // si se cierra la charla (o pasan 30 s), se deja de esperar al modelo
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(30000)]);
    let r;
    try { r = await call(0, true, signal); } catch (e) { return fail(e?.name === "TimeoutError" ? "tiempo agotado" : "sin conexión"); }
    if (!r.ok || !r.body) return fail(bad(r));
    const enc = new TextEncoder(), dec = new TextDecoder();
    const out = new ReadableStream({
      async start(ctl) {
        const put = (o) => { try { ctl.enqueue(enc.encode(JSON.stringify(o) + "\n")); } catch {} };
        let raw = "", buf = "";
        try {
          const rd = r.body.getReader();
          for (;;) {
            const { value, done } = await rd.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            const lines = buf.split("\n"); buf = lines.pop();
            // OpenWebUI manda eventos SSE: «data: {…choices[0].delta.content…}»
            for (const ln of lines) {
              const m = ln.match(/^data:\s*(.*)$/);
              if (!m || m[1] === "[DONE]") continue;
              let d = "";
              try { d = JSON.parse(m[1])?.choices?.[0]?.delta?.content || ""; } catch {}
              if (d) { raw += d; put({ d }); }
            }
          }
          const text = finish(raw);
          put(text ? { text } : { error: "respuesta vacía" });
        } catch (e) {
          put({ error: e?.name === "TimeoutError" ? "tiempo agotado" : "sin conexión" });
        }
        try { ctl.close(); } catch {}
      },
    });
    return new Response(out, { headers: { ...NO_STORE, "Content-Type": "application/x-ndjson; charset=utf-8" } });
  }

  const deadline = Date.now() + 15000;
  try {
    // los modelos pequeños a veces contestan solo con etiquetas: se reintenta una vez
    for (let tries = 0; tries < 2; tries++) {
      const r = await call(tries, false, AbortSignal.timeout(Math.max(1000, deadline - Date.now())));
      if (!r.ok) return fail(bad(r));
      const j = await r.json();
      const text = finish(j?.choices?.[0]?.message?.content);
      if (text) return NextResponse.json({ text }, { headers: NO_STORE });
    }
    return fail("respuesta vacía");
  } catch (e) {
    return fail(e?.name === "TimeoutError" ? "tiempo agotado" : "sin conexión");
  }
}
