// Kero: charla, IA, órdenes (recordatorios, temporizadores, tareas, memoria), avisos útiles y ánimo.
import {
  pick, topics, brief, glance, answer, webQuery, chunks, readMs, parseAI, partial, DUNNO,
  route, SURE, openLink, command, toolOf, shown, recallFacts, calc, checkNumbers, findFact, findFactBy, upsertFact, removeFact, tidyFacts, relevantFacts, factsOverview, fmtWhen, shortWhen, fmtRep, nextRep, MIN_EVERY, toYou, toThem, mood, decay, raise, nudges, pruneSaid, morning, morningReady, dayKey, special, visit, greet,
  recentEpisodes, nearPlans, prefsOf, plansLine, planReply,
  HABITS, cleanHabits, noteUse, noteRoute, wrongRoute, routeKey, routeLabel, habitNudges, rephrased, REPHRASE_MS,
  watchSay, watchLabel, checkWatch, resolveWatch, resolveRel, WATCH_HELP,
} from "@/lib/lunares";
import { rnd, lsGet, lsSet } from "./util";
import { chime, armSound } from "./sound";

// botones del aviso: posponer o darlo por visto
const SNOOZE_ACTS = [{ k: "10", label: "+10 min" }, { k: "60", label: "+1 h" }, { k: "ok", label: "Vale" }];
// mensajes de la charla que se le mandan a la IA (el servidor recorta si se pasan de largo)
const HIST = 20;
// «¿y mañana?» se completa con la pregunta anterior si llega antes de 5 minutos
const PREV_MS = 5 * 60000;
const REMS = "lunares_rems", WATCH = "lunares_watch", MEM = "lunares_mem", MEMQ = "lunares_memq", SAID = "lunares_said", DAY = "lunares_day", SEEN = "lunares_seen";
// en desarrollo React monta dos veces seguidas: la segunda reutiliza la visita de la primera
let lastVisit = null;
// desde cuándo está la página abierta (para «llevas un buen rato…»)
const loadedAt = Date.now();
// «hoy», «ayer», «hace 3 días»
const ago = (t) => { const d = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(t).setHours(0, 0, 0, 0)) / 864e5); return d <= 0 ? "hoy" : d === 1 ? "ayer" : `hace ${d} días`; };
const MEM_API = "/api/lunares/memory";
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
  const T = E.trace;

  /* ---------- IA (OpenWebUI a través del servidor) ---------- */
  const aiOn = () => st().ai && now() > S.aiOffUntil;
  // intercala: nunca dos frases de IA seguidas, y no siempre
  const useAI = (p = 0.65) => aiOn() && !S.lastAI && Math.random() < p;
  // contexto para la IA: hora, dueño, lo que sabe de ti, su ánimo y los datos reales de los widgets
  // (`only`: solo ese widget; `q`: la pregunta, y solo se mandan los widgets de los que habla)
  const ctx = (extra, only, q) => {
    const f = F(), d = new Date(), o = [];
    o.push(`Ahora: ${d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}, ${d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}.`);
    if (f.name) o.push(`Tu dueño se llama ${f.name}.`);
    // de lo que sabe de ti, solo lo que tiene que ver con la pregunta (y quién eres)
    const facts = relevantFacts(mem(), q, only ? 3 : 8);
    if (facts.length) o.push(`Sabes de tu dueño: ${facts.map((m) => toThem(m.text)).join("; ")}.`);
    if (S.moodK) o.push(`Tu estado de ánimo: ${S.moodK}.`);
    // los widgets de la pregunta con detalle y el resto en una línea (lo que va mal, primero);
    // sin pregunta (comentarios sueltos), todo con detalle
    const ids = only ? [only] : q ? topics(q) : [];
    const info = { facts: facts.map((m) => m.text), widgets: ids };
    const rest = only ? "" : q ? glance(f, ids) : "";
    const b = [ids.length ? ids.map((id) => brief(f, id)).filter(Boolean).join("\n") : q ? "" : brief(f), rest].filter(Boolean).join("\n");
    if (b) o.push(b);
    else if (!only) {
      if (f.weather) o.push(`Tiempo en ${f.weather.city}: ${f.weather.t}°, máxima ${f.weather.hi}°, lluvia ${f.weather.rain ?? 0}%.`);
      if (f.services) o.push(f.services.down?.length ? `Servicios caídos: ${f.services.down.join(", ")}.` : `Servicios: ${f.services.total} funcionando.`);
    }
    if (!only) {
      const rems = lsGet(REMS, []).slice(0, 3);
      if (rems.length) o.push(`Recordatorios pendientes: ${rems.map((r) => `${r.text} (${r.rep ? fmtRep(r.rep) + ", la próxima " + fmtWhen(r.at) : fmtWhen(r.at)})`).join("; ")}.`);
      const ws = lsGet(WATCH, []).filter((w) => w?.w).slice(0, 3);
      if (ws.length) o.push(`Le avisarás ${ws.map((w) => watchSay(w.w)).join("; ")}.`);
      info.rems = rems.length + ws.length;
      if (f.alerts?.length) o.push(`Alertas: ${f.alerts.join("; ")}.`);
      if (f.links?.length) o.push(`Apps de la fila: ${f.links.map((l) => l.name).join(", ")}.`);
      // lo que te contó con fecha, de qué hablasteis otros días y cuánto llevas aquí
      const plans = plansLine(nearPlans(mem()));
      if (plans) { o.push(plans); info.plans = plans; }
      const eps = recentEpisodes(mem(), q, { skip: S.chatId ? "ep:" + S.chatId : undefined });
      if (eps.length) { o.push(`Charlas anteriores: ${eps.map((e) => `${ago(e.upd || e.at)}, ${toThem(e.text)}`).join("; ")}.`); info.eps = eps.map((e) => e.text); }
      const mins = Math.round((Date.now() - loadedAt) / 60000);
      if (mins >= 2) o.push(`Tu dueño lleva ${mins < 60 ? mins + " min" : Math.floor(mins / 60) + " h " + (mins % 60) + " min"} con la página abierta.`);
    }
    // las cuentas las hace la página: el modelo solo las cuenta
    const c = q ? calc(q, f) : null;
    if (c) { o.push(c); info.calc = c; }
    if (extra) o.push(extra);
    const out = o.join("\n");
    E.ctxInfo = { ...info, lines: o.length, chars: out.length, mood: S.moodK };
    return out;
  };
  // si la IA falla, descansa un rato (1 min si fue la petición, 3 si fue el servidor) y se apunta por qué, para el cerebro
  const failed = (status, why) => { S.aiOffUntil = now() + (status === 400 ? 60000 : 180000); S.aiErr = { why: why || (status ? "error " + status : "sin conexión"), status, at: now() }; T.ev("aioff", { ...S.aiErr, secs: status === 400 ? 60 : 180 }, null); };
  // una respuesta de golpe (comentarios sueltos)
  const askAI = async (messages, extra, only, q) => {
    try {
      const context = ctx(extra, only, q);
      const r = await fetch("/api/lunares", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages, context, prefs: prefsOf(mem()) }) });
      const j = await r.json().catch(() => ({}));
      // un comentario con cifras que no están en los datos no se dice (se queda la frase de siempre)
      if (r.ok && j.text) { const v = checkNumbers(j.text, context); T.ev("muse", { widget: only || null, text: v.text || null, bad: v.bad?.length || 0 }, null); return v.text ? { text: v.text } : { error: "cifras inventadas" }; }
      T.ev("muse", { widget: only || null, error: j.error || "error " + r.status }, null);
      failed(r.status, j.error);
      return { error: j.error || "error " + r.status };
    } catch { failed(0, "sin conexión"); return { error: "sin conexión" }; }
  };
  // la respuesta va llegando a trozos (charla): onRaw(texto en bruto acumulado)
  // desde la 4.ª pregunta de la charla, la IA dice de qué va ([tema: …]) para recordarla otro día
  const ctxFor = (q, messages) => {
    const c = ctx(null, null, q);
    T.ev("ctx", { ...E.ctxInfo, hist: messages.length });
    T.ev("llm", { phase: "start", model: st().model });
    return c;
  };
  const askStream = async (...a) => {
    const run = T.cur, t0 = Date.now(), r = await askStream0(...a);
    T.ev("llm", { phase: "done", ms: Date.now() - t0, chars: r?.text?.length || 0, ...(r?.error ? { error: r.error } : {}), ...(r?.topic ? { topic: r.topic } : {}), ...(r?.note ? { note: r.note } : {}) }, run);
    return r;
  };
  const askStream0 = async (messages, q, onRaw, signal) => {
    const topic = messages.filter((m) => m.role === "user").length >= 4;
    try {
      const r = await fetch("/api/lunares", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages, context: ctxFor(q, messages), stream: true, tools: true, prefs: prefsOf(mem()), topic }), signal });
      if (!r.ok || !r.body) { const j = await r.json().catch(() => ({})); failed(r.status, j.error); return { error: j.error || "error " + r.status }; }
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
          else if (o.text || o.error || o.tool) end = o;
        }
      }
      if (end?.tool) return { tool: end.tool };
      if (end?.text) return { text: end.text, note: end.note, topic: end.topic };
      // se cortó pero ya había dicho algo con sentido: se da por buena
      if (partial(raw).split(/\s+/).length >= 4) return { text: raw };
      if (end?.error !== "respuesta vacía") failed(500, end?.error || "se cortó sin respuesta");
      return { error: end?.error || "sin respuesta" };
    } catch (e) {
      if (e?.name === "AbortError") return { error: "cancelado" };
      failed(0, "sin conexión"); return { error: "sin conexión" };
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
  // el menú los enseña juntos: primero los recordatorios, luego lo que vigila
  const saveRems = (list) => { lsSet(REMS, list); set.rems([...list, ...watches()]); tgSoon(); };
  const addRem = (at, text, kind, rep) => {
    const list = [...rems(), { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), at, text, kind, ...(rep ? { rep } : {}) }].sort((a, b) => a.at - b.at);
    saveRems(list.slice(-50));
  };
  const delRem = (id) => { saveRems(rems().filter((r) => r.id !== id)); saveWatches(watches().filter((w) => w.id !== id)); };

  /* ---------- Telegram (lib/kerobot.js) ---------- */
  // la página le pasa al bot sus datos y recordatorios (para contestar y avisarte en el móvil)
  // y hace lo que le pediste por allí (tareas, borrar recordatorios). Sin bot vinculado, mira cada 10 min
  let tgOff = 0, tgTimer = null;
  const tgSync = async () => {
    if (!page || Date.now() < tgOff) return;
    try {
      const r = await fetch("/api/lunares/telegram", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "sync", f: F(), rems: rems() }), cache: "no-store" });
      const j = r.ok ? await r.json() : null;
      if (!j?.on) { tgOff = Date.now() + 10 * 60000; return; }
      for (const o of j.inbox || []) {
        if (o.op === "todo") P()?.onTodo?.("add", o.text);
        else if (o.op === "done") P()?.onTodo?.("done", o.text);
        else if (o.op === "unrem" && typeof o.id === "string") delRem(o.id);
      }
      if (j.inbox?.length) T.ev("tg", { n: j.inbox.length }, null);
      if (j.mem) memSync();
    } catch { tgOff = Date.now() + 5 * 60000; }
  };
  // un recordatorio nuevo o borrado llega al bot enseguida
  const tgSoon = () => { if (!page) return; clearTimeout(tgTimer); tgTimer = setTimeout(() => { tgOff = 0; tgSync(); }, 2000); };

  /* ---------- lo que vigila porque se lo has pedido («avísame si la CPU pasa de 80») ---------- */
  const watches = () => lsGet(WATCH, []).filter((w) => w && w.w && w.id);
  const saveWatches = (list) => { lsSet(WATCH, list); set.rems([...rems(), ...list]); };
  const addWatch = (w) => {
    const same = JSON.stringify({ ...w, until: 0 });
    const list = watches().filter((x) => JSON.stringify({ ...x.w, until: 0 }) !== same);
    saveWatches([...list, { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), kind: "watch", w, text: watchLabel(w), at: Date.now() }].slice(-20));
  };
  // cada uno avisa una vez y se quita (antes de decirlo, como los recordatorios); los caducados se tiran sin decir nada
  function watchTick() {
    const list = watches();
    if (!list.length) return;
    const t = Date.now(), f = F(), keep = [], hits = [];
    for (const x of list) {
      if (t > x.w.until) continue;
      const h = checkWatch(x.w, f, t);
      if (h) hits.push(h); else keep.push(x);
    }
    if (keep.length !== list.length) saveWatches(keep);
    T.ev("watch", { n: list.length, hits, gone: list.length - keep.length - hits.length }, null);
    if (!hits.length) return;
    const text = `Te aviso, como me pediste: ${hits.join("; ")}.`;
    rouse();
    if (st().sound !== false) chime("remind");
    notify(text);
    run(() => B().notice(text, "surprised", 15000), true);
  }
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
    if (!due.length) return watchTick();
    const text = remText(due);
    T.ev("rem", { text, n: due.length }, null);
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
    const s = special(t, mem().filter((m) => m.kind === "birthday"), F().name);
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
  // Se guarda en el servidor (la misma en todos tus dispositivos y en la copia de seguridad).
  // Aquí queda una copia para contestar al momento; cada cambio se aplica en la copia y se manda
  // después, en orden. Si no llega (sin conexión, sin sesión), espera en una cola hasta la próxima vez.
  const mem = () => { const l = lsGet(MEM, []); return Array.isArray(l) ? l.filter((m) => m && m.text) : []; };
  const saveMem = (list) => { lsSet(MEM, list); set.mem(list); };
  const memQ = () => { const q = lsGet(MEMQ, []); return Array.isArray(q) ? q : []; };
  let syncing = null;
  const memSync = () => syncing || (syncing = (async () => {
    let ok = false;
    try {
      // lo que se guardó antes de que hubiera servidor (sin id): sube una vez
      const old = mem().filter((m) => !m.id);
      if (old.length) { lsSet(MEMQ, [...memQ(), { op: "merge", facts: old.map(({ text, at }) => ({ text, at })) }]); saveMem(tidyFacts(mem())); }
      let facts = null;
      for (let q = memQ(); q.length; q = memQ()) {
        const r = await fetch(MEM_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(q[0]) });
        if (!r.ok && r.status !== 400) throw new Error(r.status); // 400: cambio que no vale; se tira
        if (r.ok) facts = (await r.json()).facts;
        lsSet(MEMQ, memQ().slice(1));
      }
      if (!facts) { const r = await fetch(MEM_API, { cache: "no-store" }); if (!r.ok) throw new Error(r.status); facts = (await r.json()).facts; }
      if (Array.isArray(facts) && !memQ().length) saveMem(facts);
      ok = true;
    } catch {} finally { syncing = null; }
    if (ok && memQ().length) memSync();
  })());
  const memOp = (op) => { lsSet(MEMQ, [...memQ(), op].slice(-200)); memSync(); };
  // apunta un dato (lo que le dices o lo que la IA ha entendido de ti)
  // extra: { kind: "episode" | "plan" | "pref", key, due, allday } para los datos especiales (lib/lunares/memory.js)
  const learn = (text, t = Date.now(), extra) => {
    const { list, fact, old } = upsertFact(mem(), text, t, undefined, extra);
    if (!fact) return null;
    T.ev("mem", { op: old ? "change" : "add", kind: extra?.kind || "fact", text: fact.text, ...(old ? { old: old.text } : {}) });
    saveMem(list); memOp({ op: "add", text: fact.text, id: fact.id, at: t, ...(extra || {}), ...(fact.key && extra ? { key: fact.key } : {}) });
    return { fact, old };
  };
  const delFact = (id) => { T.ev("mem", { op: "del", text: mem().find((m) => m.id === id)?.text || "" }); saveMem(removeFact(mem(), id)); memOp({ op: "del", id }); };
  // «¿cuándo es mi cumple?» → lo que encaja
  const recall = (q) => recallFacts(mem(), q);
  const you = (m) => cap(toYou(m.text)).replace(/[.!]*$/, ".");

  /* ---------- lo que aprende de cómo lo usas (lib/lunares/habits.js), solo en este navegador ---------- */
  const habits = () => cleanHabits(lsGet(HABITS, null));
  const saveHabits = (h) => lsSet(HABITS, h);
  // has mirado o preguntado por estos widgets
  const used = (ids) => { if (!ids.length) return; let h = habits(); for (const id of ids) h = noteUse(h, id); saveHabits(h); };
  // la IA ha elegido el mismo camino que proponía el router: la próxima vez va directo
  const agreed = (label) => { const l = S.lastRoute; if (l && l.guess === label) { saveHabits(noteRoute(habits(), l.key, label, 1)); T.ev("habit", { op: "agree", label, key: l.key }); } if (l) l.label = label; };

  // registro de fallos (fase 0.2, apagado por defecto): solo la pregunta y por dónde fue, nunca datos de widgets
  const logMiss = (why, q, route, more) => {
    if (!page || st().log !== true) return;
    fetch("/api/lunares/log", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ why, q, route, ...more }), cache: "no-store" }).catch(() => {});
  };

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
        // «10 minutos antes de la reunión», «al acabar el dentista»: la hora sale de la agenda
        if (c.rel) {
          const cal = F().w?.cal, hit = cal ? resolveRel(c.rel, cal.events, t) : null;
          if (!hit) {
            if (c.rel.soft && c.alt) return doCommand(c.alt);
            return [cal ? `No encuentro ${quote(c.rel.ev)} en tu agenda.` : "No veo tu agenda en la página, así que no sé cuándo es eso.", "think"];
          }
          const title = hit.ev.title, end = c.rel.edge === "end", ms = c.rel.ms;
          if (hit.past) return [`Esa hora ya ha pasado (${quote(title)}, ${shortWhen(+new Date(end ? hit.ev.end || hit.ev.start : hit.ev.start), t)}).`, "think"];
          const how = ms ? `${fmtDur(ms)} ${end ? "después de" : "antes de"}` : end ? "al acabar" : "al empezar";
          addRem(hit.at, c.text || (end ? `Ha acabado ${quote(title)}` : ms ? `${quote(title)} en ${fmtDur(ms)}` : `Empieza ${quote(title)}`), "remind"); askNotify();
          return [`Vale, te aviso ${fmtWhen(hit.at, t)}, ${how} ${quote(title)}${c.text ? ": " + toYou(c.text).replace(/[.!]+$/, "") : ""}.`, "proud"];
        }
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
        const list = rems(), ws = watches();
        if (!list.length && !ws.length) return ["No tienes recordatorios pendientes.", "happy"];
        const items = list.slice(0, 5).map((r) => `${r.kind === "timer" ? "temporizador" : r.text || "aviso"} (${r.rep ? fmtRep(r.rep) : shortWhen(r.at, t)})`);
        const watching = ws.length ? `${list.length ? " Y estoy" : "Estoy"} pendiente de avisarte ${ws.slice(0, 4).map((w) => watchSay(w.w, t)).join("; ")}${ws.length > 4 ? "…" : "."}` : "";
        return [`${list.length ? `Tienes ${list.length === 1 ? "uno" : list.length}: ${items.join("; ")}${list.length > 5 ? "…" : "."}` : ""}${watching}`.trim(), "think"];
      }
      case "unremind": {
        const list = rems(), ws = watches(), n = list.length + ws.length;
        if (!n) return ["No tienes recordatorios que borrar.", "happy"];
        if (c.all) { saveRems([]); saveWatches([]); return [n === 1 ? "Borrado." : `Borrados los ${n}.`, "proud"]; }
        const i = findFact(list, c.text);
        if (i < 0) {
          // «borra el aviso de la CPU»
          const j = findFact(ws.map((w) => `${w.text} ${watchSay(w.w, t)}`), c.text);
          if (j >= 0) { delRem(ws[j].id); return [`Vale, ya no vigilo ${quote(ws[j].text)}.`, "proud"]; }
          return [`No encuentro ningún recordatorio de ${quote(c.text)}.`, "worried"];
        }
        delRem(list[i].id);
        return [`Borrado: ${quote(list[i].text || "temporizador")}.`, "proud"];
      }
      case "watch": {
        if (c.bad) return [WATCH_HELP, "think"];
        const f = F(), r = resolveWatch(c.w, f);
        if (r.err) return [r.err, "worried"];
        const hit = checkWatch(r.w, f, t);
        if (hit) return [`Ya está: ${hit}.`, "surprised"];
        addWatch(r.w); askNotify();
        return [`Vale, te aviso ${watchSay(r.w, t)}.`, "proud"];
      }
      case "multi": {
        // «recuérdame mañana llamar a mamá y apunta comprar pan»: cada una por su lado, en una sola respuesta
        const out = c.list.map((x) => doCommand(x)).filter(Boolean);
        if (!out.length) return null;
        return [out.map((x) => x[0]).join(" "), out.find((x) => x[1] !== "proud")?.[1] || "proud"];
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
      case "pref": {
        // «háblame más corto»: va al prompt de la IA, no a «lo que sé de ti»
        const r = learn(c.text, t, { kind: "pref" });
        if (!r) return null;
        return [`Vale, lo tendré en cuenta: ${quote(cap(c.text))}.${aiOn() ? "" : " (Se nota cuando charlo con la IA.)"}`, "proud"];
      }
      case "remember": {
        const r = learn(c.text, t);
        if (!r) return null;
        // «vivo en Sevilla» después de «vivo en Madrid»: lo cambia y lo dice
        if (r.old && r.old.text.toLowerCase() !== r.fact.text.toLowerCase()) return [`Apuntado. Antes sabía que ${toYou(r.old.text).replace(/[.!]+$/, "")}; ahora, que ${toYou(r.fact.text).replace(/[.!]+$/, "")}.`, "love"];
        return [c.soft ? `¡Me lo apunto! ${you(r.fact)}` : `Vale, me acordaré: ${toYou(c.text).replace(/[.!]+$/, "")}.`, "love"];
      }
      case "forget": {
        const list = mem();
        if (c.all) { saveMem([]); memOp({ op: "clear" }); return [list.length ? "Hecho, ya no recuerdo nada de lo que me contaste." : "No sabía nada de ti todavía.", "think"]; }
        const hit = findFactBy(list, c.text) || list[findFact(list, c.text)];
        if (!hit) return ["No recordaba nada de eso.", "think"];
        delFact(hit.id);
        return [`Olvidado: ${quote(toYou(hit.text))}.`, "proud"];
      }
      case "recall": {
        const list = mem();
        if (c.q) {
          // «¿qué tiempo hace en mi ciudad?» es del widget del tiempo, no de la memoria
          if (c.soft && topics(c.q).length) return null;
          const hits = recall(c.q);
          if (!hits.length) return c.soft ? null : [`No me has contado nada de ${quote(toYou(c.q))}. Si quieres, dime «recuerda que…».`, "think"];
          return [hits.map(you).join(" "), "love"];
        }
        if (!list.length) return ["Todavía no me has contado nada de ti. Dime «recuerda que…» y me lo apunto.", "think"];
        const o = factsOverview(list, 6), more = list.length - o.length;
        return [`Sé que ${o.map((m) => toYou(m.text).replace(/[.!]+$/, "")).join("; ")}.${more > 0 ? ` Y ${more === 1 ? "una cosa" : more + " cosas"} más: las tienes en mi menú (clic derecho).` : ""}`, "love"];
      }
    }
    return null;
  }
  const P = () => E.P.current;

  /* ---------- charla ---------- */
  // cada vez que se abre la charla es una conversación nueva; mientras siga abierta, recuerda lo hablado
  const openChat = () => {
    if (S.chatting) return;
    S.chatting = true; S.sid++; S.hist = []; S.prevQ = null; S.chatId = Date.now().toString(36) + Math.random().toString(36).slice(2, 5); set.chat(true);
    run(async () => { setExpr("happy"); await hop(S.x, S.y, 16, 300); say(pick(["¿Qué me cuentas?", "Dime.", "Soy todo oídos. Bueno, no tengo."]), 6000, true); await wait(600); });
  };
  const closeChat = () => { if (!S.chatting) return; S.chatting = false; S.sid++; S.hist = []; S.prevQ = null; set.chat(false); E.nextAt = now() + 2000; };
  // contestar una pregunta: bloquea lo demás hasta que termina la última burbuja
  const ask = (fn) => {
    S.answering = true; set.thinking(true);
    const id = T.cur;
    return run(fn, true).finally(() => { S.answering = false; T.end(id); if (E.alive) set.thinking(false); });
  };
  // lo que dice al final de un pensamiento (para el cerebro)
  const spoke = (text, face) => T.ev("out", { text, face });
  function send(text) {
    if (S.answering) return; // una pregunta cada vez
    S.lastAct = now();
    T.run(); T.ev("in", { text, chat: S.chatting, hist: S.hist.length });
    // historial de esta charla (si se cierra mientras contesta, la respuesta ya no se apunta)
    const sid = S.sid, remember = (...m) => { if (S.sid === sid) S.hist = [...S.hist, ...m].slice(-HIST); }, forget = () => { if (S.sid === sid) S.hist.pop(); };
    const f = F();
    // por dónde va (lib/lunares/router.js): primero lo que no necesita IA. «¿y mañana?» se completa con la pregunta anterior
    const prev = S.prevQ && Date.now() - S.prevQ.t < PREV_MS ? S.prevQ.q : null;
    const rt = route(text, { f, facts: mem(), snoozable: !!S.lastRem && Date.now() - S.lastRem.t <= 15 * 60000, prev, learned: habits().routes });
    T.ev("route", { type: rt.type, label: routeLabel(rt), score: rt.score, sure: rt.score >= SURE || !aiOn(), ai: aiOn(), ...(rt.merged ? { merged: rt.merged } : {}), ...(rt.fixed ? { fixed: rt.fixed } : {}), ...(rt.learned ? { learned: rt.learned, was: rt.was } : {}), ...(prev ? { prev } : {}) });
    // «no, eso no»: no es una pregunta nueva, es sobre la respuesta anterior
    if (rt.type === "command" && rt.c.type === "wrong") return wrong(text, remember, sid);
    S.prevQ = { q: rt.merged || text, t: Date.now() };
    // órdenes sencillas en el mismo gesto, para que el navegador deje abrir pestañas y avisos
    if (rt.type === "open") {
      const l = rt.link;
      spoke(`¡Abriendo ${l.name}!`, "happy"); T.end(T.cur);
      window.open(l.href, "_blank", "noopener"); return run(async () => { setExpr("happy"); await hop(S.x, S.y, 22, 340); await wait(say(`¡Abriendo ${l.name}!`, 4000, true)); });
    }
    // con la IA encendida, lo dudoso lo decide ella (puede contestar, buscar o pedir la orden)
    const sure = rt.score >= SURE || !aiOn();
    // la misma pregunta con otras palabras al poco: la respuesta anterior no servía
    const last = S.lastRoute;
    if (last && Date.now() - last.t < REPHRASE_MS && rephrased(last.q, text)) logMiss("rephrase", last.q, last.label, { next: text });
    // por qué camino ha ido (para «eso no») y de qué widgets has preguntado
    const key = routeKey(rt.merged || text), guess = rt.type === "ai" ? null : routeLabel(rt);
    S.lastRoute = { key, guess, label: sure ? guess || "ai" : "ai", q: text, t: Date.now() };
    if (rt.type === "answer" || rt.type === "ai") used(topics(rt.merged || text));
    // «mañana tengo un examen»: se apunta con su fecha y luego pregunta qué tal fue; contesta la IA si está
    if (rt.type === "plan") learn(rt.plan.text, Date.now(), { kind: "plan", due: rt.plan.due, allday: rt.plan.allday });
    const done = rt.type === "command" && sure ? doCommand(rt.c) : rt.type === "plan" && sure ? [planReply(rt.plan), "love"] : null;
    if (done) {
      const [reply, face] = done;
      T.ev(rt.type === "plan" ? "plan" : "cmd", { type: rt.type === "plan" ? "plan" : rt.c.type, reply, ...(rt.type === "plan" ? { due: rt.plan.due } : {}) });
      spoke(reply, face);
      remember({ role: "user", content: text }, { role: "assistant", content: reply });
      return ask(async () => { setExpr(face); await hop(S.x, S.y, 16, 300); S.qv += 2; await sayMany(chunks(reply), 9000); });
    }
    // «busca X» o preguntas de cultura/actualidad: lo busca él en internet y cuenta lo que dicen las fuentes
    // (con la IA encendida, la IA lee las webs y contesta citándolas; si no, frases sacadas tal cual)
    const web = async (wq, question) => {
      setExpr("think"); ponder(true); S.bias = 4;
      const withAI = aiOn() && st().webAI !== false, ac = new AbortController();
      T.ev("web", { phase: "start", q: wq, ai: withAI });
      const s = await guard((withAI
        ? fetch("/api/lunares/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q: wq, question }), cache: "no-store", signal: ac.signal })
        : fetch("/api/lunares/search?q=" + encodeURIComponent(wq), { cache: "no-store" })).then((r) => r.json()), ac);
      S.bias = 0;
      if (!s?.ok || !s.summary?.text) {
        T.ev("web", { phase: "fail", error: s?.error || (s?.ok ? "sin resultados" : "sin conexión") });
        forget(); setExpr("worried");
        await wait(say(s?.error === "sin resultados" || (s?.ok && !s.summary?.text) ? `No encuentro nada fiable sobre «${wq}».`
          : s?.error === "sin buscador" ? "Para noticias y cosas de actualidad necesito un buscador: conecta OpenWebUI o SearXNG en Editar → Conexiones."
          : /SearXNG|OpenWebUI/.test(s?.error || "") ? s.error[0].toUpperCase() + s.error.slice(1) + "." : "Ahora mismo no llego a internet.", 8000, true));
        return;
      }
      remember({ role: "assistant", content: s.summary.text });
      T.ev("web", { phase: "done", n: s.summary.sources?.length || 0, sites: (s.summary.sources || []).slice(0, 5).map((x) => x.site || x.url), dropped: s.summary.dropped || 0 });
      spoke(s.summary.text, "proud");
      if (s.summary.dropped) logMiss("web", question, "web", { n: s.summary.dropped });
      setExpr("proud"); S.qv += 2;
      await sayMany(chunks(s.summary.text), 16000, undefined, s.summary.sources);
    };
    // una orden que al final no se pudo cumplir sigue su camino
    const wq = rt.type === "web" ? (sure ? rt.q : null) : rt.type === "command" && sure ? webQuery(text) : null;
    if (wq) {
      remember({ role: "user", content: text });
      return ask(() => web(wq, rt.merged || text));
    }
    // preguntas sobre tus datos: se contestan con los datos reales, al momento y sin IA
    const known = rt.type === "answer" && sure ? rt.text : rt.type === "command" && sure ? answer(text, f) : null;
    if (known) {
      T.ev("data", { ids: topics(rt.merged || text), text: known });
      spoke(known, "proud");
      remember({ role: "user", content: text }, { role: "assistant", content: known });
      return ask(async () => { setExpr("think"); ponder(true); await wait(rnd(350, 650)); setExpr(f.alerts?.length && /aviso|no responde/.test(known) ? "worried" : "proud"); S.qv += 2; await sayMany(chunks(known), 14000); });
    }
    // lo que pide la IA con una etiqueta (lib/lunares/tools.js), con el mismo código que sin IA
    const useTool = async (tool) => {
      T.ev("tool", { name: tool.name, arg: tool.arg });
      if (tool.name === "busca") { agreed("web"); return web(tool.arg, rt.merged || text); }
      if (tool.name === "abre") {
        const l = openLink("abre " + tool.arg, f.links);
        // abrir una pestaña solo se puede en el mismo clic: aquí, el enlace en la burbuja
        const reply = l ? `Aquí tienes ${l.name}.` : `No tengo ninguna app que se llame ${quote(tool.arg)}.`;
        spoke(reply, l ? "happy" : "think");
        remember({ role: "assistant", content: reply });
        setExpr(l ? "happy" : "think"); S.qv += 2;
        return sayMany([reply], 9000, undefined, l ? [{ site: l.name, url: l.href }] : undefined);
      }
      const c = command(tool.arg);
      if (c) agreed("command:" + c.type);
      const res = c && ["remind", "timer", "todo", "watch", "multi"].includes(c.type) ? doCommand(c) : null;
      const [reply, face] = res || ["No sé hacer eso así. Dímelo como «recuérdame mañana a las 9…» o «apunta…».", "think"];
      T.ev("cmd", { type: c?.type || "?", reply }); spoke(reply, face);
      remember({ role: "assistant", content: reply });
      setExpr(face); await hop(S.x, S.y, 16, 300); S.qv += 2;
      await sayMany(chunks(reply), 9000);
    };
    remember({ role: "user", content: text });
    ask(async () => {
      setExpr("think"); ponder(true); S.bias = 4;
      if (!st().ai) { T.ev("llm", { phase: "done", error: "IA apagada" }); forget(); setExpr("worried"); await wait(say("Para charlar, activa «Pensar con IA» en Editar → Kero.", 7000, true)); return; }
      // la respuesta se va enseñando según llega: cada frase completa pasa a su burbuja
      const key = "a" + Math.random().toString(36).slice(2, 7), ac = new AbortController();
      let shownN = 0, felt = false, asked = null;
      const r = await guard(askStream(S.hist, rt.merged || text, (raw) => {
        if (asked) return;
        // pide una herramienta: se deja de esperar al modelo y se hace
        if ((asked = toolOf(raw, false))) { ac.abort(); return; }
        const pt = partial(shown(raw));
        if (!pt) return;
        if (!felt) { const { emo } = parseAI(raw); if (emo) { setExpr(emo); felt = true; } else if (pt.length > 3) setExpr("happy"); }
        S.bias = 0;
        const parts = chunks(pt);
        if (parts.length > shownN) S.qv += 1.5;
        shownN = parts.length;
        show(parts, 0, key);
      }, ac.signal), ac);
      S.bias = 0;
      const tool = asked || r?.tool;
      if (tool) return useTool(tool);
      const out = r?.text ? parseAI(r.text) : null;
      if (!out?.text) {
        // lo dudoso que tenía camino sin IA: si la IA falla, por ahí
        if (rt.type === "web") return web(rt.q, rt.merged || text);
        const own = rt.type === "command" ? doCommand(rt.c) : rt.type === "plan" ? [planReply(rt.plan), "love"] : rt.type === "answer" ? [rt.text, "proud"] : null;
        if (own) { T.ev(rt.type === "answer" ? "data" : rt.type === "plan" ? "plan" : "cmd", { type: rt.c?.type || rt.type, reply: own[0], fallback: true }); spoke(own[0], own[1]); remember({ role: "assistant", content: own[0] }); setExpr(own[1]); return sayMany(chunks(own[0]), 9000); }
        forget(); setExpr("worried");
        await wait(say(r?.error === "respuesta vacía" ? "Me he quedado en blanco. ¿Me lo preguntas de otra forma?" : `Mi cerebro no contesta (${r?.error || "error"}). ¿Está OpenWebUI encendido?`, 7000, true));
        return;
      }
      // si habla de tus datos, cada cifra tiene que salir de ellos; si no, esa frase se cambia por la respuesta exacta del widget
      if (topics(text).length || calc(text, f)) {
        const exact = answer(text, f);
        const v = checkNumbers(out.text, [ctx(null, null, text), brief(f), exact || "", ...S.hist.filter((m) => m.role === "user").map((m) => m.content)], exact);
        T.ev("check", { bad: v.bad.length, nums: v.bad.slice(0, 4) });
        if (v.bad.length) logMiss("numbers", text, "ai", { n: v.bad.length });
        if (v.bad.length) out.text = v.text || "No me cuadran las cifras, así que prefiero no inventármelas. Míralo en su widget.";
      }
      remember({ role: "assistant", content: out.text });
      spoke(out.text, out.emo);
      if (DUNNO.test(chunks(out.text)[0] || "")) logMiss("dunno", rt.merged || text, S.lastRoute?.label || "ai");
      // lo que la IA ha entendido de ti (solo si se lo has contado tú, en primera persona)
      // de qué va la charla (desde la 4.ª pregunta): se guarda como «charla» y la próxima vez sirve de contexto
      if (r.topic && S.chatId && S.sid === sid) learn(r.topic, Date.now(), { kind: "episode", key: "ep:" + S.chatId });
      if (r.note && rt.type !== "plan" && /(?:^|[^\p{L}])(?:mi|mis|me|tengo|soy|vivo|trabajo|estudio|nac[ií])(?![\p{L}])/iu.test(r.note)) learn(r.note);
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

  // «no, eso no»: ese camino baja para esa frase y, con la IA encendida, se le vuelve a preguntar a ella
  function wrong(text, remember, sid) {
    const l = S.lastRoute, fresh = l && Date.now() - l.t < PREV_MS, mine = fresh && l.label !== "ai";
    S.lastRoute = null;
    if (fresh) logMiss("wrong", l.q, l.label);
    T.ev("wrong", { label: l?.label || null, q: l?.q || null, fresh: !!fresh, learned: !!mine });
    if (mine) saveHabits(wrongRoute(habits(), l.key, l.label));
    const retry = mine && aiOn();
    const reply = !fresh ? "¿El qué? Dímelo de otra forma y lo intento."
      : !mine ? "Vaya, perdona. ¿Me lo preguntas de otra forma?"
      : retry ? "Vaya, perdona. Tomo nota y lo pienso mejor…"
      : "Vaya, perdona. Tomo nota: la próxima vez no lo contesto así.";
    remember({ role: "user", content: text }, { role: "assistant", content: reply });
    return ask(async () => { setExpr("worried"); S.qv += 1; await sayMany([reply], 6000); })
      .then(() => { if (retry && E.alive && S.sid === sid) send(l.q); });
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
    // lo que sueles mirar este día a esta hora va detrás de los avisos de verdad
    const n = [...nudges(f, t, said, prev, mem().filter((x) => x.kind === "plan")), ...habitNudges(habits(), f, t, said)].find((x) => !asleep || x.wake);
    T.ev("nudge", n ? { text: n.text, key: n.key } : { none: true }, null);
    if (!n) { lsSet(SAID, said); if (!asleep && !E.busy) run(() => E.special()); return; }
    said[n.key] = t; lsSet(SAID, said);
    if (asleep) rouse();
    if (!n.key.startsWith("habit:")) notify(n.text);
    run(() => B().notice(n.text, n.face, 12000), true);
  }

  /* ---------- ánimo ---------- */
  let moodAt = now();
  function moodTick() {
    const t = now(), dt = t - moodAt, f = F();
    moodAt = t;
    S.joy = decay(S.joy, dt, 300000); S.grump = decay(S.grump, dt, 180000);
    const m = mood({ alerts: f.alerts?.length || 0, down: f.services?.down?.length || 0, total: f.services?.total || 0, joy: S.joy, grump: S.grump, idleMin: (t - S.lastAct) / 60000 });
    S.moodW = m.w; S.moodWhy = m.why; S.moodRules = m.rules;
    if (m.key !== S.moodK) { T.ev("mood", { key: m.key, from: S.moodK, why: m.why }, null); S.moodK = m.key; S.moodSince = t; set.moodK(m.key); }
    if (m.face !== S.face) { S.face = m.face; set.face(m.face); }
  }
  // caricias, cosquillas, zarandeos…: cuánto le suben la alegría o el mal humor
  const feel = (k, by) => { S[k] = raise(S[k], by); T.ev("feel", { kind: k, by }, null); moodTick(); };

  // lo que enseña el cerebro (/kero) cada segundo
  const brainState = () => {
    const h = habits(), t = now();
    return {
      name: st().name || "Kero", mood: S.moodK, moodW: S.moodW || {}, moodWhy: S.moodWhy, moodRules: S.moodRules || [], moodSince: S.moodSince || 0, joy: S.joy, grump: S.grump, idle: Math.round((t - S.lastAct) / 1000),
      state: S.mood, sleepWhy: S.sleepWhy, mode: S.mode, busy: E.busy, chatting: S.chatting, answering: S.answering, expr: S.expr,
      ai: !!st().ai, aiOn: aiOn(), aiOff: aiOn() || !st().ai ? 0 : Math.max(0, Math.round((S.aiOffUntil - t) / 1000)), aiErr: S.aiErr || null, model: st().model, webAI: st().webAI !== false,
      nudges: st().nudges !== false, chatter: st().chatter, recent: S.recent,
      hist: S.hist.map((m) => ({ role: m.role, content: String(m.content).slice(0, 400) })),
      facts: mem(), routes: h.routes, use: Object.fromEntries(Object.entries(h.use).map(([k, l]) => [k, l.length])),
      rems: rems(), watches: watches(), ctx: E.ctxInfo || null, lastRoute: S.lastRoute ? { q: S.lastRoute.q, label: S.lastRoute.label } : null,
    };
  };

  function startTalk() {
    T.state(brainState);
    set.rems([...rems(), ...watches()]);
    set.mem(mem());
    memSync();
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
      iv.push(setInterval(remTick, 5000), setInterval(nudgeTick, 30000), setInterval(touchSeen, 60000), setInterval(tgSync, 60000));
      window.addEventListener("pagehide", touchSeen);
    }
    const onStore = (e) => { if (e.key === REMS || e.key === WATCH) set.rems([...rems(), ...watches()]); if (e.key === MEM) set.mem(mem()); };
    // al volver a la pestaña: lo que hayas contado desde otro dispositivo
    const onVis = () => { if (document.visibilityState === "visible") memSync(); };
    window.addEventListener("storage", onStore);
    document.addEventListener("visibilitychange", onVis);
    // qué widget miras: el ratón encima un rato (1,5 s) cuenta como mirarlo (el carrusel pasa solo, eso no cuenta)
    let hov = null;
    const onOver = (e) => {
      const id = e.target?.closest?.("[data-mod]")?.dataset.mod || null;
      if (hov?.id === id) return;
      clearTimeout(hov?.t);
      hov = id ? { id, t: setTimeout(() => { used([id]); T.ev("look", { id }, null); }, 1500) } : null;
    };
    if (page) document.addEventListener("pointerover", onOver);
    // el primer repaso de avisos, un poco después de saludar
    const first = page ? setTimeout(nudgeTick, 8000) : null, tgFirst = page ? setTimeout(tgSync, 6000) : null;
    return () => { iv.forEach(clearInterval); clearTimeout(first); clearTimeout(tgFirst); clearTimeout(tgTimer); clearTimeout(hov?.t); document.removeEventListener("pointerover", onOver); window.removeEventListener("storage", onStore); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("pagehide", touchSeen); };
  }

  return { aiOn, useAI, ctx, askAI, sayAI, openChat, closeChat, ask, send, delRem, delFact, feel, startTalk };
}
