// Kero: charla, IA, órdenes (recordatorios, temporizadores, tareas, memoria), avisos útiles y ánimo.
import {
  pick, topics, brief, answer, webQuery, chunks, readMs, parseAI, partial, norm, DUNNO,
  command, findFact, fmtWhen, shortWhen, fmtRep, nextRep, MIN_EVERY, toYou, toThem, mood, decay, raise, nudges, pruneSaid, morning, morningReady, dayKey, special, visit, greet,
} from "@/lib/lunares";
import { rnd, lsGet, lsSet } from "./util";
import { chime, armSound } from "./sound";

// botones del aviso: posponer o darlo por visto
const SNOOZE_ACTS = [{ k: "10", label: "+10 min" }, { k: "60", label: "+1 h" }, { k: "ok", label: "Vale" }];
const REMS = "lunares_rems", MEM = "lunares_mem", SAID = "lunares_said", DAY = "lunares_day", SEEN = "lunares_seen";
// en desarrollo React monta dos veces seguidas: la segunda reutiliza la visita de la primera
let lastVisit = null;
const MAX_MEM = 20;
// «10 minutos», «1 hora y 30 minutos», «45 segundos»
const fmtDur = (ms) => {
  const s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60, o = [];
  if (h) o.push(`${h} ${h === 1 ? "hora" : "horas"}`);
  if (m) o.push(`${m} ${m === 1 ? "minuto" : "minutos"}`);
  if (r && !h) o.push(`${r} ${r === 1 ? "segundo" : "segundos"}`);
  return o.join(" y ") || "un momento";
};
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const quote = (s) => `«${String(s).replace(/[.!?]+$/, "")}»`;

export function makeTalk(E) {
  const { S, F, st, now, page, set, reduceQ, wait, guard, run, say, ponder, sayMany, show, hop, setExpr, rouse, hush } = E;
  const B = () => E.B;

  /* ---------- IA (OpenWebUI a través del servidor) ---------- */
  const aiOn = () => st().ai && now() > S.aiOffUntil;
  // intercala: nunca dos frases de IA seguidas, y no siempre
  const useAI = (p = 0.65) => aiOn() && !S.lastAI && Math.random() < p;
  // contexto para la IA: hora, dueño, lo que sabe de ti, su ánimo y los datos reales de los widgets
  // (`only`: solo ese widget; `q`: la pregunta, y solo se mandan los widgets de los que habla)
  const ctx = (extra, only, q) => {
    const f = F(), d = new Date(), o = [];
    o.push(`Ahora: ${d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}, ${d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}.`);
    if (f.name) o.push(`Tu dueño se llama ${f.name}.`);
    const mem = lsGet(MEM, []);
    if (mem.length) o.push(`Sabes de tu dueño: ${mem.slice(-8).map((m) => toThem(m.text)).join("; ")}.`);
    if (S.moodK) o.push(`Tu estado de ánimo: ${S.moodK}.`);
    const ids = only ? [only] : q ? topics(q) : [];
    const b = ids.length ? ids.map((id) => brief(f, id)).filter(Boolean).join("\n") : brief(f);
    if (b) o.push(b);
    else if (!only) {
      if (f.weather) o.push(`Tiempo en ${f.weather.city}: ${f.weather.t}°, máxima ${f.weather.hi}°, lluvia ${f.weather.rain ?? 0}%.`);
      if (f.services) o.push(f.services.down?.length ? `Servicios caídos: ${f.services.down.join(", ")}.` : `Servicios: ${f.services.total} funcionando.`);
    }
    if (!only) {
      const rems = lsGet(REMS, []).slice(0, 3);
      if (rems.length) o.push(`Recordatorios pendientes: ${rems.map((r) => `${r.text} (${r.rep ? fmtRep(r.rep) + ", la próxima " + fmtWhen(r.at) : fmtWhen(r.at)})`).join("; ")}.`);
      if (f.alerts?.length) o.push(`Alertas: ${f.alerts.join("; ")}.`);
      if (f.links?.length) o.push(`Apps de la fila: ${f.links.map((l) => l.name).join(", ")}.`);
    }
    if (extra) o.push(extra);
    return o.join("\n");
  };
  const failed = (status) => { S.aiOffUntil = now() + (status === 400 ? 60000 : 180000); };
  // una respuesta de golpe (comentarios sueltos)
  const askAI = async (messages, extra, only, q) => {
    try {
      const r = await fetch("/api/lunares", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages, context: ctx(extra, only, q) }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.text) return { text: j.text };
      failed(r.status);
      return { error: j.error || "error " + r.status };
    } catch { failed(0); return { error: "sin conexión" }; }
  };
  // la respuesta va llegando a trozos (charla): onRaw(texto en bruto acumulado)
  const askStream = async (messages, q, onRaw, signal) => {
    try {
      const r = await fetch("/api/lunares", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages, context: ctx(null, null, q), stream: true }), signal });
      if (!r.ok || !r.body) { const j = await r.json().catch(() => ({})); failed(r.status); return { error: j.error || "error " + r.status }; }
      const rd = r.body.getReader(), dec = new TextDecoder();
      let buf = "", raw = "", end = null;
      for (;;) {
        const { value, done } = await rd.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop();
        for (const ln of lines) {
          if (!ln.trim()) continue;
          let o; try { o = JSON.parse(ln); } catch { continue; }
          if (o.d) { raw += o.d; onRaw(raw); }
          else if (o.text || o.error) end = o;
        }
      }
      if (end?.text) return { text: end.text };
      // se cortó pero ya había dicho algo con sentido: se da por buena
      if (partial(raw).split(/\s+/).length >= 4) return { text: raw };
      if (end?.error !== "respuesta vacía") failed(500);
      return { error: end?.error || "sin respuesta" };
    } catch (e) {
      if (e?.name === "AbortError") return { error: "cancelado" };
      failed(0); return { error: "sin conexión" };
    }
  };
  async function sayAI(raw, ms, force) {
    const { text, emo, act } = parseAI(raw);
    if (!text) return false;
    setExpr(emo || "happy"); S.qv += 2;
    // en la charla puede decir varias cosas seguidas; los comentarios sueltos, de una vez
    const parts = force ? chunks(text) : [text], many = parts.length > 1;
    const d = say(parts[0], many ? readMs(parts[0]) + 5000 : ms, force), t0 = now();
    await doAct(act, emo);
    await wait(Math.max(300, (many ? readMs(parts[0]) : Math.min(d, 9000) * 0.85) - (now() - t0)));
    if (many) await sayMany(parts.slice(1), ms, parts[0]);
    S.lastAI = true;
    return true;
  }
  // la acción que pide la IA ([spin], [dance]…), sin cortar lo que está diciendo
  async function doAct(act, emo) {
    if (!act || reduceQ.matches) return;
    S.mute = true;
    try { if (act === "hop") await hop(S.x, S.y, 22, 340); else await B()[act](); } finally { S.mute = false; }
    setExpr(emo || "happy");
  }

  /* ---------- recordatorios ---------- */
  const rems = () => lsGet(REMS, []).filter((r) => r && Number.isFinite(r.at)).sort((a, b) => a.at - b.at);
  const saveRems = (list) => { lsSet(REMS, list); set.rems(list); };
  const addRem = (at, text, kind, rep) => {
    const list = [...rems(), { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), at, text, kind, ...(rep ? { rep } : {}) }].sort((a, b) => a.at - b.at);
    saveRems(list.slice(-50));
  };
  const delRem = (id) => saveRems(rems().filter((r) => r.id !== id));
  // los que tocan: se quitan de la lista antes de decirlos (así otra pestaña no los repite);
  // los que se repiten se vuelven a programar para la próxima vez
  const takeDue = () => {
    const all = rems(), t = Date.now(), due = all.filter((r) => r.at <= t);
    if (!due.length) return [];
    const next = due.filter((r) => r.rep).map((r) => ({ ...r, at: nextRep(r.rep, t, r.at) })).filter((r) => r.at > t);
    saveRems([...all.filter((r) => r.at > t), ...next].sort((a, b) => a.at - b.at));
    return due.filter((r) => t - r.at < 86400000); // los de hace más de un día se tiran
  };
  const remText = (due) => {
    const late = due.some((r) => Date.now() - r.at > 120000);
    const one = (r) => (r.kind === "timer" ? (r.text ? `¡Tiempo! ${cap(r.text)}` : "¡Se acabó el tiempo!") : cap(r.text || "¡Es la hora!"));
    if (due.length === 1) return (late ? "Se me pasó avisarte: " : due[0].kind === "timer" ? "" : "¡Recordatorio! ") + one(due[0]).replace(/[.!]?$/, (m) => m || ".");
    return `${late ? "Se me pasaron" : "Tienes"} ${due.length} recordatorios: ${due.map((r) => one(r).replace(/[.!]+$/, "")).join("; ")}.`;
  };
  const notify = (text) => {
    try { if (document.hidden && "Notification" in window && Notification.permission === "granted") new Notification(st().name || "Kero", { body: text, tag: "lunares" }); } catch {}
  };
  const askNotify = () => { try { if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {}); } catch {} };
  // el tilín: el de temporizador si alguno lo es
  const ring = (due) => { if (st().sound !== false) chime(due.some((r) => r.kind === "timer") ? "timer" : "remind"); };
  // solo la página los dice (no la vista previa del panel)
  function remTick() {
    if (!page || S.answering || S.mode !== "rest") return;
    const due = takeDue();
    if (!due.length) return;
    const text = remText(due);
    rouse();
    ring(due);
    notify(text);
    S.lastRem = { due, t: Date.now() };
    run(() => B().notice(text, "surprised", 20000, SNOOZE_ACTS), true);
  }
  // al cargar: lo que venció con la página cerrada (desde hello)
  E.missed = async () => {
    if (!page) return;
    const due = takeDue();
    if (!due.length) return;
    await wait(300);
    ring(due);
    S.lastRem = { due, t: Date.now() };
    await B().notice(remText(due), "surprised", 20000, SNOOZE_ACTS);
  };

  /* ---------- resumen del día (desde hello) ---------- */
  // una vez al día, a partir de las 6; espera unos segundos a que lleguen los datos de los widgets
  E.daily = async () => {
    const t = Date.now();
    if (!page || st().daily === false || new Date(t).getHours() < 6 || lsGet(DAY, "") === dayKey(t)) return;
    for (let i = 0; i < 16 && !morningReady(F()); i++) await wait(500);
    if (!morningReady(F())) return; // sin datos: se intenta en la próxima visita
    lsSet(DAY, dayKey(t));
    const parts = morning(F(), rems(), Date.now());
    if (!parts.length) return;
    await wait(500);
    setExpr("happy"); S.qv += 2;
    await sayMany(parts, 9000);
    setExpr("idle");
  };

  /* ---------- visitas: el saludo de la primera vez que se carga ---------- */
  E.greet = () => {
    const v = E.visitInfo;
    E.visitInfo = null; // solo al cargar, no al despertarle desde el menú
    return v ? greet(v, Date.now(), F().name) : null;
  };
  const touchSeen = () => { const s = lsGet(SEEN, null); if (s) lsSet(SEEN, { ...s, last: Date.now() }); };

  /* ---------- fechas especiales (desde hello y cada vuelta de los avisos) ---------- */
  // una vez cada una: la clave lleva la fecha y se guarda con los avisos ya dichos
  E.special = async () => {
    if (!page || st().chatter === "off" || S.mood === "sleep") return false;
    const t = Date.now(), said = pruneSaid(lsGet(SAID, {}), t);
    const s = special(t, mem(), F().name);
    if (!s || said[s.key]) return false;
    said[s.key] = t; lsSet(SAID, said);
    await wait(400);
    setExpr(s.face); S.qv += 2;
    say(s.text, 8000, true);
    await wait(300);
    await B()[s.act]?.(true);
    return true;
  };

  /* ---------- posponer el último aviso ---------- */
  // vale durante 15 minutos después de sonar; los que se repiten ya tienen su próxima vez, así que se añade una suelta
  const snoozeRem = (ms) => {
    const lr = S.lastRem;
    if (!lr || Date.now() - lr.t > 15 * 60000) return null;
    S.lastRem = null;
    const at = Date.now() + ms;
    for (const r of lr.due) addRem(at, r.text, r.kind === "timer" ? "timer" : "remind");
    return { at, n: lr.due.length };
  };
  const snoozed = (s) => `Vale, te lo vuelvo a decir ${fmtWhen(s.at)}.`;
  // botones de la burbuja del aviso
  E.onAct = (k) => {
    if (k === "ok") { S.lastRem = null; hush(); setExpr("happy"); return; }
    const s = snoozeRem(+k * 60000);
    hush();
    if (s) run(async () => { setExpr("proud"); S.qv += 2; await wait(say(snoozed(s), 3500, true)); }, true);
  };

  /* ---------- memoria: lo que le cuentas de ti ---------- */
  const mem = () => lsGet(MEM, []).filter((m) => m && m.text);
  const saveMem = (list) => lsSet(MEM, list.slice(-MAX_MEM));

  /* ---------- órdenes sin IA ---------- */
  // devuelve [frase, cara] o null si no es una orden
  function doCommand(c) {
    const t = Date.now();
    switch (c.type) {
      case "snooze": {
        const s = snoozeRem(c.ms);
        if (s) return [snoozed(s), "proud"];
        // sin aviso reciente: «avísame en 10 minutos» es un recordatorio nuevo; «luego» a secas no es una orden
        if (c.bare) return c.alt ? doCommand(c.alt) : null;
        return ["No hay ningún aviso reciente que posponer.", "think"];
      }
      case "remind": {
        if (!c.at) return ["¿Cuándo te lo recuerdo? Dime, por ejemplo, «recuérdame mañana a las 9 llamar a mamá».", "think"];
        if (c.past) return ["Esa hora ya ha pasado. ¿Cuándo te aviso?", "think"];
        if (c.rep) {
          if (c.rep.ms && c.rep.ms < MIN_EVERY) return ["Eso es demasiado a menudo; como mucho, cada 5 minutos.", "worried"];
          addRem(c.at, c.text, "remind", c.rep); askNotify();
          return [`Vale, te lo recuerdo ${fmtRep(c.rep)}${c.text ? ": " + toYou(c.text).replace(/[.!]+$/, "") : ""}. La primera vez, ${fmtWhen(c.at, t)}.`, "proud"];
        }
        addRem(c.at, c.text, "remind"); askNotify();
        return [`Vale, te lo recuerdo ${fmtWhen(c.at, t)}${c.text ? ": " + toYou(c.text).replace(/[.!]+$/, "") : ""}.`, "proud"];
      }
      case "timer": {
        if (!c.ms) return ["¿De cuánto? Por ejemplo, «pon un temporizador de 10 minutos».", "think"];
        addRem(c.at, c.text, "timer"); askNotify();
        return [`Temporizador de ${fmtDur(c.ms)} en marcha${c.text ? ` para ${quote(c.text)}` : ""}.`, "proud"];
      }
      case "reminders": {
        const list = rems();
        if (!list.length) return ["No tienes recordatorios pendientes.", "happy"];
        const items = list.slice(0, 5).map((r) => `${r.kind === "timer" ? "temporizador" : r.text || "aviso"} (${r.rep ? fmtRep(r.rep) : shortWhen(r.at, t)})`);
        return [`Tienes ${list.length === 1 ? "uno" : list.length}: ${items.join("; ")}${list.length > 5 ? "…" : "."}`, "think"];
      }
      case "unremind": {
        const list = rems();
        if (!list.length) return ["No tienes recordatorios que borrar.", "happy"];
        if (c.all) { saveRems([]); return [list.length === 1 ? "Borrado." : `Borrados los ${list.length}.`, "proud"]; }
        const i = findFact(list, c.text);
        if (i < 0) return [`No encuentro ningún recordatorio de ${quote(c.text)}.`, "worried"];
        delRem(list[i].id);
        return [`Borrado: ${quote(list[i].text || "temporizador")}.`, "proud"];
      }
      case "todo": {
        if (!P().onTodo) return ["Aquí no puedo apuntar tareas; pídemelo en la página de inicio.", "worried"];
        P().onTodo("add", c.text);
        return [c.fromRemind ? `Como no me has dicho cuándo, lo apunto en Tareas: ${quote(c.text)}.` : `Apuntado en Tareas: ${quote(c.text)}.`, "proud"];
      }
      case "done": {
        if (!P().onTodo) return ["Aquí no puedo tachar tareas; pídemelo en la página de inicio.", "worried"];
        const hit = P().onTodo("done", c.text);
        return hit ? [`¡Hecho! He tachado ${quote(hit)}.`, "proud"] : [`No encuentro ${quote(c.text)} en tus tareas.`, "worried"];
      }
      case "remember": {
        const list = mem(), i = findFact(list, c.text);
        if (i >= 0) list.splice(i, 1);
        saveMem([...list, { text: c.text, at: t }]);
        return [c.soft ? `¡Me lo apunto! ${cap(toYou(c.text)).replace(/[.!]*$/, ".")}` : `Vale, me acordaré: ${toYou(c.text).replace(/[.!]+$/, "")}.`, "love"];
      }
      case "forget": {
        const list = mem();
        if (c.all) { saveMem([]); return [list.length ? "Hecho, ya no recuerdo nada de lo que me contaste." : "No sabía nada de ti todavía.", "think"]; }
        const i = findFact(list, c.text);
        if (i < 0) return ["No recordaba nada de eso.", "think"];
        list.splice(i, 1); saveMem(list);
        return ["Olvidado.", "proud"];
      }
      case "recall": {
        const list = mem();
        if (!list.length) return ["Todavía no me has contado nada de ti. Dime «recuerda que…» y me lo apunto.", "think"];
        return [`Sé que ${list.slice(-6).map((m) => toYou(m.text).replace(/[.!]+$/, "")).join("; ")}.`, "love"];
      }
    }
    return null;
  }
  const P = () => E.P.current;

  /* ---------- charla ---------- */
  // cada vez que se abre la charla es una conversación nueva; mientras siga abierta, recuerda lo hablado
  const openChat = () => {
    if (S.chatting) return;
    S.chatting = true; S.sid++; S.hist = []; set.chat(true);
    run(async () => { setExpr("happy"); await hop(S.x, S.y, 16, 300); say(pick(["¿Qué me cuentas?", "Dime.", "Soy todo oídos. Bueno, no tengo."]), 6000, true); await wait(600); });
  };
  const closeChat = () => { if (!S.chatting) return; S.chatting = false; S.sid++; S.hist = []; set.chat(false); E.nextAt = now() + 2000; };
  // contestar una pregunta: bloquea lo demás hasta que termina la última burbuja
  const ask = (fn) => {
    S.answering = true; set.thinking(true);
    return run(fn, true).finally(() => { S.answering = false; if (E.alive) set.thinking(false); });
  };
  function send(text) {
    if (S.answering) return; // una pregunta cada vez
    S.lastAct = now();
    // historial de esta charla (si se cierra mientras contesta, la respuesta ya no se apunta)
    const sid = S.sid, remember = (...m) => { if (S.sid === sid) S.hist = [...S.hist, ...m].slice(-12); }, forget = () => { if (S.sid === sid) S.hist.pop(); };
    const f = F();
    // primero, órdenes sencillas que no necesitan IA (en el mismo gesto, para que el navegador deje abrir pestañas y avisos)
    const m = text.match(/^(?:abre|abrir|ábreme|ve a|vete a|llévame a)\s+(?:el |la |los |las |a )?(.+?)[.!?¡¿]*$/i);
    if (m) {
      const q = norm(m[1]), l = (f.links || []).find((x) => norm(x.name).includes(q) || q.includes(norm(x.name)));
      if (l) { window.open(l.href, "_blank", "noopener"); return run(async () => { setExpr("happy"); await hop(S.x, S.y, 22, 340); await wait(say(`¡Abriendo ${l.name}!`, 4000, true)); }); }
    }
    const c = command(text);
    const done = c && doCommand(c);
    if (done) {
      const [reply, face] = done;
      remember({ role: "user", content: text }, { role: "assistant", content: reply });
      return ask(async () => { setExpr(face); await hop(S.x, S.y, 16, 300); S.qv += 2; await sayMany(chunks(reply), 9000); });
    }
    // «busca X» o preguntas de cultura/actualidad: lo busca él en internet y cuenta lo que dicen las fuentes (sin IA)
    const wq = webQuery(text);
    if (wq) {
      remember({ role: "user", content: text });
      return ask(async () => {
        setExpr("think"); ponder(true); S.bias = 4;
        const s = await guard(fetch("/api/lunares/search?q=" + encodeURIComponent(wq), { cache: "no-store" }).then((r) => r.json()));
        S.bias = 0;
        if (!s?.ok || !s.summary?.text) {
          forget(); setExpr("worried");
          await wait(say(s?.error === "sin resultados" || (s?.ok && !s.summary?.text) ? `No encuentro nada fiable sobre «${wq}».`
            : s?.error === "sin buscador" ? "Para noticias y cosas de actualidad necesito un buscador: conecta OpenWebUI o SearXNG en Editar → Conexiones."
            : /SearXNG|OpenWebUI/.test(s?.error || "") ? s.error[0].toUpperCase() + s.error.slice(1) + "." : "Ahora mismo no llego a internet.", 8000, true));
          return;
        }
        remember({ role: "assistant", content: s.summary.text });
        setExpr("proud"); S.qv += 2;
        await sayMany(chunks(s.summary.text), 16000, undefined, s.summary.sources);
      });
    }
    // preguntas sobre tus datos: se contestan con los datos reales, al momento y sin IA
    const known = answer(text, f);
    if (known) {
      remember({ role: "user", content: text }, { role: "assistant", content: known });
      return ask(async () => { setExpr("think"); ponder(true); await wait(rnd(350, 650)); setExpr(f.alerts?.length && /aviso|no responde/.test(known) ? "worried" : "proud"); S.qv += 2; await sayMany(chunks(known), 14000); });
    }
    remember({ role: "user", content: text });
    ask(async () => {
      setExpr("think"); ponder(true); S.bias = 4;
      if (!st().ai) { forget(); setExpr("worried"); await wait(say("Para charlar, activa «Pensar con IA» en Editar → Kero.", 7000, true)); return; }
      // la respuesta se va enseñando según llega: cada frase completa pasa a su burbuja
      const key = "a" + Math.random().toString(36).slice(2, 7), ac = new AbortController();
      let shown = 0, felt = false;
      const r = await guard(askStream(S.hist, text, (raw) => {
        const pt = partial(raw);
        if (!pt) return;
        if (!felt) { const { emo } = parseAI(raw); if (emo) { setExpr(emo); felt = true; } else if (pt.length > 3) setExpr("happy"); }
        S.bias = 0;
        const parts = chunks(pt);
        if (parts.length > shown) S.qv += 1.5;
        shown = parts.length;
        show(parts, 0, key);
      }, ac.signal), ac);
      S.bias = 0;
      const out = r?.text ? parseAI(r.text) : null;
      if (!out?.text) {
        forget(); setExpr("worried");
        await wait(say(r?.error === "respuesta vacía" ? "Me he quedado en blanco. ¿Me lo preguntas de otra forma?" : `Mi cerebro no contesta (${r?.error || "error"}). ¿Está OpenWebUI encendido?`, 7000, true));
        return;
      }
      remember({ role: "assistant", content: out.text });
      // la versión limpia del servidor (sin frases cortadas) sustituye a la que iba llegando
      const parts = chunks(out.text), last = parts[parts.length - 1];
      setExpr(out.emo || "happy");
      show(parts, readMs(last) + parts.length * 1500 + 6000, key);
      S.talkUntil = now() + Math.min(300 + last.length * 45, 2600);
      await doAct(out.act, out.emo);
      await wait(readMs(last));
      S.lastAI = true;
    });
  }

  /* ---------- avisos útiles ---------- */
  function nudgeTick() {
    if (!page) return;
    const f = F(), down = f.services ? [...(f.services.down || [])] : null, prev = E.prevDown;
    E.prevDown = down;
    if (st().nudges === false || S.answering || S.mode !== "rest" || S.chatting) return;
    const t = Date.now(), said = pruneSaid(lsGet(SAID, {}), t);
    const asleep = S.mood === "sleep";
    // dormido solo le despierta lo urgente (un evento que empieza ya)
    const n = nudges(f, t, said, prev).find((x) => !asleep || x.wake);
    if (!n) { lsSet(SAID, said); if (!asleep && !E.busy) run(() => E.special()); return; }
    said[n.key] = t; lsSet(SAID, said);
    if (asleep) rouse();
    notify(n.text);
    run(() => B().notice(n.text, n.face, 12000), true);
  }

  /* ---------- ánimo ---------- */
  let moodAt = now();
  function moodTick() {
    const t = now(), dt = t - moodAt, f = F();
    moodAt = t;
    S.joy = decay(S.joy, dt, 300000); S.grump = decay(S.grump, dt, 180000);
    const m = mood({ alerts: f.alerts?.length || 0, down: f.services?.down?.length || 0, total: f.services?.total || 0, joy: S.joy, grump: S.grump, idleMin: (t - S.lastAct) / 60000 });
    S.moodW = m.w;
    if (m.key !== S.moodK) { S.moodK = m.key; set.moodK(m.key); }
    if (m.face !== S.face) { S.face = m.face; set.face(m.face); }
  }
  // caricias, cosquillas, zarandeos…: cuánto le suben la alegría o el mal humor
  const feel = (k, by) => { S[k] = raise(S[k], by); moodTick(); };

  function startTalk() {
    set.rems(rems());
    moodTick();
    const iv = [setInterval(moodTick, 5000)];
    if (page) {
      armSound();
      const t = Date.now();
      if (!lastVisit || t - lastVisit.t > 3000) {
        const v = visit(lsGet(SEEN, null), t);
        lsSet(SEEN, v.seen);
        lastVisit = { t, v };
      }
      E.visitInfo = lastVisit.v;
      // «la última vez que te vio» es mientras la página sigue abierta, no solo al cargar
      iv.push(setInterval(remTick, 5000), setInterval(nudgeTick, 30000), setInterval(touchSeen, 60000));
      window.addEventListener("pagehide", touchSeen);
    }
    const onStore = (e) => { if (e.key === REMS) set.rems(rems()); };
    window.addEventListener("storage", onStore);
    // el primer repaso de avisos, un poco después de saludar
    const first = page ? setTimeout(nudgeTick, 8000) : null;
    return () => { iv.forEach(clearInterval); clearTimeout(first); window.removeEventListener("storage", onStore); window.removeEventListener("pagehide", touchSeen); };
  }

  return { aiOn, useAI, ctx, askAI, sayAI, openChat, closeChat, ask, send, delRem, feel, startTalk };
}
