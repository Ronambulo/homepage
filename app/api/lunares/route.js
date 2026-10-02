import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { owui } from "@/lib/owui";
import { toolOf } from "@/lib/lunares/tools";
import { LONG, SHORT, finish, noteOf, topicOf, system, DEEP, fit, TELLS, ABOUT_Q, noThink } from "@/lib/keroai";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };
const fail = (error, status = 502) => NextResponse.json({ error }, { status, headers: NO_STORE });
const clip = (v, n) => String(v ?? "").slice(0, n);

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
  const msgs = fit((Array.isArray(body?.messages) ? body.messages : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-20)
    .map((m) => ({ role: m.role, content: clip(m.content, 1200) })));
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return fail("sin mensaje", 400);
  // los datos van pegados a la última pregunta: un modelo pequeño los ignora si están lejos, en el prompt de sistema
  const data = clip(body?.context, 2000).trim(), last = msgs[msgs.length - 1].content;
  const about = ABOUT_Q.test(last), note = TELLS.test(last) && !/\?/.test(last), tools = !!body?.stream && body?.tools === true;
  // en la charla, respuestas más largas; y si la pregunta lo pide, que piense antes
  const prefs = (Array.isArray(body?.prefs) ? body.prefs : []).filter((p) => typeof p === "string" && p.trim()).slice(-5).map((p) => clip(p.trim(), 120));
  const topic = !!body?.stream && body?.topic === true;
  // «háblame más corto» o «más largo» también cambia cuánto se deja hablar
  const brief = prefs.some((p) => /cort|breve|conciso|grano|enroll/i.test(p)) && !prefs.some((p) => /larg|detall|extens/i.test(p) && !/menos/i.test(p));
  const long = !brief && prefs.some((p) => /larg|detall|extens/i.test(p) && !/menos/i.test(p));
  const size = body?.stream ? (brief ? [3, 380] : long ? [8, 900] : LONG) : brief ? [2, 260] : SHORT;
  const deep = !!body?.stream && last.length >= 25 && DEEP.test(last) && !noThink.has(model);
  const withData = [...msgs.slice(0, -1), { role: "user", content: data ? `Datos reales ahora mismo:\n${data}\n\n${last}` : last }];
  const call = (tries, stream, signal, think = false) => fetch(`${base}/api/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system(co.name || "Kero", about, note, tools, { prefs, topic }) }, ...withData],
      // think: el razonamiento, apagado salvo en las preguntas que lo merecen (si no, piensa cientos de tokens antes de contestar)
      params: { think, keep_alive: "30m" },
      // pensando, los tokens del razonamiento también cuentan
      stream, max_tokens: think ? 1200 : body?.stream ? (long ? 560 : 400) + (topic ? 30 : 0) : 180, temperature: tries ? 0.6 : 0.8,
    }),
    signal,
    cache: "no-store",
  });
  const bad = (r) => (r.status === 404 || r.status === 400 ? `modelo «${model}» no disponible` : `OpenWebUI ${r.status}`);

  if (body?.stream) {
    // si se cierra la charla (o pasan 30 s; 60 s si piensa), se deja de esperar al modelo
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(deep ? 60000 : 30000)]);
    let r;
    try {
      r = await call(0, true, signal, deep);
      // el modelo no sabe pensar: se apunta y se pregunta otra vez sin pensar
      if (deep && !r.ok) { noThink.add(model); r = await call(0, true, signal); }
    } catch (e) { return fail(e?.name === "TimeoutError" ? "tiempo agotado" : "sin conexión"); }
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
          // pide una herramienta: la ejecuta la página
          const tool = tools ? toolOf(raw) : null;
          if (tool) { put({ tool }); try { ctl.close(); } catch {} return; }
          const text = finish(raw, size), mem = note ? noteOf(raw) : null, subj = topic ? topicOf(raw) : null;
          put(text ? { text, ...(mem ? { note: mem } : {}), ...(subj ? { topic: subj } : {}) } : { error: "respuesta vacía" });
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
      const raw = j?.choices?.[0]?.message?.content, text = finish(raw, size), mem = note ? noteOf(raw) : null;
      if (text) return NextResponse.json({ text, ...(mem ? { note: mem } : {}) }, { headers: NO_STORE });
    }
    return fail("respuesta vacía");
  } catch (e) {
    return fail(e?.name === "TimeoutError" ? "tiempo agotado" : "sin conexión");
  }
}
