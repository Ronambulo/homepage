// Kero por Telegram: un bot que pregunta a Telegram si hay mensajes nuevos (long polling, no hace falta abrir puertos
// ni tener dominio). Solo habla con el chat que se vincula con el código de Editar → Conexiones → Telegram.
// Piensa como en la página (lib/lunares: router, órdenes, memoria, internet e IA) con lo último que le mandó la página
// (sus datos, recordatorios y tareas), y avisa por aquí de los recordatorios, tanto los de aquí como los de la página.
// Estado en data/kero-tg.json. Se arranca una vez por proceso (instrumentation.js y, por si acaso, la API).
import fs from "node:fs/promises";
import path from "node:path";
import { DATA_DIR, readConfig } from "./store";
import { readSecrets } from "./secrets";
import { readMemory, changeMemory } from "./kero";
import { owui } from "./owui";
import { askOnce } from "./keroai";
import { webSearch, summarize, readPages } from "./websearch";
import { webAnswer } from "./webanswer";
import { tg, send } from "./telegram";
import { route, SURE, answer, webQuery, topics, brief, calc, checkNumbers, planReply, prefsOf, parseAI, upsertFact } from "./lunares/index.js";
import { botCommand, botContext, takeDue, remText, sentKey, pageRems, pruneSent, newCode, pairOf, CODE_MS, plainText } from "./lunares/bot.js";

const FILE = path.join(DATA_DIR, "kero-tg.json");
const EMPTY = { chat: null, who: "", code: null, codeAt: 0, offset: 0, rems: [], page: null, sent: {}, inbox: [], memAt: 0, lastRem: null };
const G = globalThis;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIN = 60000;

/* ---------- estado ---------- */
export async function readBot() {
  try { return { ...EMPTY, ...JSON.parse(await fs.readFile(FILE, "utf8")) }; } catch { return { ...EMPTY }; }
}
let chain = Promise.resolve();
// cambios de uno en uno: fn(estado) lo cambia en el sitio y lo que devuelva es el resultado
export function changeBot(fn) {
  const p = chain.then(async () => {
    const s = await readBot();
    const out = await fn(s);
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tmp = FILE + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(s), { mode: 0o600 });
    await fs.rename(tmp, FILE);
    return out;
  });
  chain = p.catch(() => {});
  return p;
}

// lo que ve la página de ajustes
export async function botStatus() {
  const s = await readBot(), token = !!(await readSecrets()).tgToken, b = G.__keroBot || {};
  let code = null;
  if (token && !s.chat) code = await changeBot((x) => { if (!x.code || Date.now() - x.codeAt > CODE_MS - 2 * MIN) { x.code = newCode(); x.codeAt = Date.now(); } return x.code; });
  return { token, on: !!b.on, err: b.err || null, name: b.name || null, paired: !!s.chat, who: s.who || "", code };
}
export const unpair = () => changeBot((s) => { s.chat = null; s.who = ""; s.code = null; s.lastRem = null; });

// la página manda sus datos y recordatorios (cada minuto, mientras está abierta) y se lleva lo que le toca hacer
export async function pageSync({ f, rems }) {
  return changeBot((s) => {
    const json = JSON.stringify(f || {});
    s.page = { at: Date.now(), f: json.length <= 120000 ? JSON.parse(json) : s.page?.f || {}, rems: pageRems(rems, s.sent) };
    const inbox = s.inbox;
    s.inbox = [];
    const mem = s.memAt > (s.pageMemAt || 0);
    s.pageMemAt = Date.now();
    return { on: !!s.chat, inbox, mem };
  });
}

/* ---------- el bucle ---------- */
export function startBot() {
  if (G.__keroBot) return;
  G.__keroBot = { on: false, err: null, name: null };
  // si algo falla (disco, red), se vuelve a intentar al rato
  (async () => { for (;;) { try { await poll(); } catch {} await sleep(15000); } })();
  setInterval(() => { tick().catch(() => {}); }, 20000);
}

async function poll() {
  let unhooked = false, last = null;
  for (;;) {
    const token = (await readSecrets()).tgToken;
    if (!token) { G.__keroBot.on = false; G.__keroBot.err = null; await sleep(15000); continue; }
    if (token !== last) {
      last = token;
      const me = await tg(token, "getMe");
      G.__keroBot.name = me.ok ? me.result.username : null;
      if (me.ok) tg(token, "setMyCommands", { commands: [{ command: "recordatorios", description: "Los recordatorios pendientes" }, { command: "ayuda", description: "Qué puedo hacer" }] });
    }
    const s = await readBot();
    const r = await tg(token, "getUpdates", { offset: s.offset, timeout: 50, allowed_updates: ["message", "callback_query"] }, 65000);
    if (!r.ok) {
      G.__keroBot.on = false;
      G.__keroBot.err = r.status === 401 || r.status === 404 ? "token no válido" : r.status === 409 ? "otro programa está usando este bot" : r.error;
      // 409: tenía un webhook puesto (se quita una vez) u otra copia de la página usa el mismo token
      if (r.status === 409 && !unhooked) { unhooked = true; await tg(token, "deleteWebhook"); continue; }
      last = r.status === 401 || r.status === 404 ? null : last;
      await sleep(r.status === 401 || r.status === 404 ? 2 * MIN : 15000);
      continue;
    }
    G.__keroBot.on = true; G.__keroBot.err = null;
    for (const u of r.result || []) {
      await changeBot((x) => { x.offset = Math.max(x.offset || 0, u.update_id + 1); });
      try { await onUpdate(token, u); } catch {}
    }
  }
}

// cada 20 s: los recordatorios que tocan (los de aquí y la copia de los de la página)
async function tick() {
  const token = (await readSecrets()).tgToken;
  if (!token) return;
  const due = await changeBot((s) => {
    if (!s.chat) return [];
    const t = Date.now(), a = takeDue(s.rems, t), b = takeDue(s.page?.rems, t);
    s.rems = a.keep;
    if (s.page) s.page.rems = b.keep;
    const all = [...a.due, ...b.due].filter((r) => !s.sent[sentKey(r)]);
    s.sent = pruneSent(s.sent, t);
    for (const r of [...a.due, ...b.due]) s.sent[sentKey(r)] = t;
    if (all.length) s.lastRem = { due: all.map(({ text, kind }) => ({ text, kind })), t };
    return all.length ? [s.chat, all] : [];
  });
  if (!due.length) return;
  const [chat, list] = due;
  await send(token, chat, remText(list), { reply_markup: { inline_keyboard: [[{ text: "+10 min", callback_data: "sn:10" }, { text: "+1 h", callback_data: "sn:60" }, { text: "Vale", callback_data: "ok" }]] } });
}

/* ---------- mensajes ---------- */
const HELP = `Soy Kero, el de tu página de inicio. Por aquí puedo:
- Recordarte cosas: «recuérdame mañana a las 9 llamar a mamá», «pon un temporizador de 10 minutos», «qué recordatorios tengo».
- Apuntar tareas: «apunta comprar pan» (aparecen en la página cuando la abras).
- Acordarme de lo que me cuentas: «recuerda que el cumple de Ana es el 3 de mayo».
- Buscar en internet: «busca …».
- Decirte cómo van tus cosas (tiempo, servicios, servidor…), con lo último que vi en la página.
- Y charlar, si tengo la IA encendida.
También te aviso aquí de los recordatorios, los pongas aquí o en la página.`;

async function onUpdate(token, u) {
  if (u.callback_query) return onButton(token, u.callback_query);
  const m = u.message;
  if (!m || m.chat?.type !== "private") return;
  const s = await readBot();
  let text = String(m.text || "").trim();
  if (!s.chat) {
    const code = pairOf(text);
    if (code && s.code && code === s.code && Date.now() - s.codeAt < CODE_MS) {
      const who = m.from?.first_name || "";
      await changeBot((x) => { x.chat = m.chat.id; x.who = who; x.code = null; });
      return send(token, m.chat.id, `¡Hola${who ? ", " + who : ""}! Ya estamos conectados. Escríbeme cuando quieras.\n\n${HELP}`);
    }
    // a cualquier otro, solo cómo se hace (y únicamente si lo pide)
    if (/^\/start\b/.test(text) || code) return send(token, m.chat.id, "Hola, soy Kero. Para hablar conmigo, abre tu página de inicio, ve a Editar → Conexiones → Telegram y mándame el código que sale allí.");
    return;
  }
  if (m.chat.id !== s.chat) return; // solo el dueño
  if (!text) return send(token, s.chat, "De momento solo entiendo mensajes de texto.");
  if (/^\/(?:start|ayuda|help)\b/.test(text)) return send(token, s.chat, HELP);
  if (/^\/recordatorios\b/.test(text)) text = "qué recordatorios tengo";
  tg(token, "sendChatAction", { chat_id: s.chat, action: "typing" });
  // la IA puede tardar: el «escribiendo…» dura 5 s, así que se repite
  const typing = setInterval(() => tg(token, "sendChatAction", { chat_id: s.chat, action: "typing" }), 4500);
  let reply;
  try { reply = await think(text.slice(0, 600), s); } finally { clearInterval(typing); }
  if (reply) await send(token, s.chat, reply);
}

async function onButton(token, q) {
  const s = await readBot();
  tg(token, "answerCallbackQuery", { callback_query_id: q.id });
  if (!s.chat || q.message?.chat?.id !== s.chat) return;
  // quita los botones del aviso, se pulse lo que se pulse
  tg(token, "editMessageReplyMarkup", { chat_id: s.chat, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } });
  if (q.data === "ok") return changeBot((x) => { x.lastRem = null; });
  const ms = /^sn:(\d+)$/.exec(q.data || "")?.[1] * MIN;
  if (!ms) return;
  const r = await apply({ type: "snooze", ms, bare: false }, { ...s, now: Date.now() });
  if (r) await send(token, s.chat, r);
}

/* ---------- pensar (como send() de components/lunares/talk.js, sin cara ni burbujas) ---------- */
// la charla de Telegram: se olvida tras 30 min sin hablar
const H = { hist: [], at: 0, prev: null, aiOffUntil: 0 };

// una orden: se aplican sus cambios y se devuelve la respuesta (o null si no es cosa de aquí)
async function apply(c, ctx) {
  const r = botCommand(c, ctx);
  if (!r) return null;
  await changeBot((s) => {
    if (r.rems) s.rems = r.rems;
    if ("lastRem" in r) s.lastRem = r.lastRem;
    const ops = [...(r.inbox || []), ...(r.pageDel || []).map((id) => ({ op: "unrem", id }))];
    if (ops.length) s.inbox = [...(s.inbox || []), ...ops].slice(-50);
    if (r.pageDel?.length && s.page) s.page.rems = (s.page.rems || []).filter((x) => !r.pageDel.includes(x.id));
    // las tareas nuevas ya cuentan aquí, aunque la página aún no lo sepa
    if (r.todos && s.page?.f) { s.page.f.todos = r.todos; if (s.page.f.w) s.page.f.w.todo = r.todos; }
  });
  if (r.mem) { await changeMemory(r.mem); await changeBot((s) => { s.memAt = Date.now(); }); }
  return r.reply;
}

async function think(text, s) {
  const now = Date.now(), cfg = await readConfig(), co = cfg.companion || {};
  if (now - H.at > 30 * MIN) { H.hist = []; H.prev = null; }
  H.at = now;
  const facts = await readMemory();
  // lo último que mandó la página (si no la has abierto nunca, solo tus apps)
  const age = s.page?.at ? now - s.page.at : Infinity;
  const f = Number.isFinite(age) ? { ...s.page.f, at: s.page.at } : { name: cfg.name, links: (cfg.links || []).map((l) => ({ name: l.name, href: l.url })) };
  const stale = age > 30 * MIN && Number.isFinite(age) ? ` (Es lo que vi en la página hace ${age < 120 * MIN ? Math.round(age / MIN) + " minutos" : Math.round(age / 36e5) + " horas"}.)` : "";
  const page = s.page?.rems || [];
  const ow = await owui(), aiOn = !!(ow.base && co.ai) && now > H.aiOffUntil;
  const prev = H.prev && now - H.prev.t < 5 * MIN ? H.prev.q : null;
  const rt = route(text, { f, facts, snoozable: !!s.lastRem && now - s.lastRem.t <= 15 * MIN, prev, now });
  const remember = (...m) => { H.hist = [...H.hist, ...m].slice(-20); };
  const said = (reply) => { remember({ role: "user", content: text }, { role: "assistant", content: reply }); return reply; };
  if (rt.type === "command" && rt.c.type === "wrong") return said("Vaya, perdona. ¿Me lo preguntas de otra forma?");
  H.prev = { q: rt.merged || text, t: now };
  const sure = rt.score >= SURE || !aiOn;
  if (rt.type === "open") return said(`Aquí tienes ${rt.link.name}: ${rt.link.href}`);
  if (rt.type === "plan") await changeMemory((l) => upsertFact(l, rt.plan.text, now, undefined, { kind: "plan", due: rt.plan.due, allday: rt.plan.allday }).list);
  const ctx = { rems: s.rems, page, todos: f.w?.todo || f.todos || [], facts, f, lastRem: s.lastRem, now };
  const own = async () => rt.type === "command" ? apply(rt.c, ctx) : rt.type === "plan" ? planReply(rt.plan) : rt.type === "answer" ? rt.text + stale : null;
  if (sure && (rt.type === "command" || rt.type === "plan")) { const r = await own(); if (r) return said(r); }
  const wq = rt.type === "web" ? (sure ? rt.q : null) : rt.type === "command" && sure ? webQuery(text) : null;
  if (wq) return said(await web(wq, rt.merged || text, ow));
  if (rt.type === "answer" && sure) return said(rt.text + stale);
  if (rt.type === "command" && sure) { const k = answer(text, f, now); if (k) return said(k + stale); }

  // la IA
  const fallback = async (why) => {
    const o = await own();
    if (o) return said(o);
    if (rt.type === "web") return said(await web(rt.q, rt.merged || text, ow));
    return why;
  };
  if (!aiOn) return fallback(!co.ai || !ow.base ? "Para charlar de cualquier cosa necesito la IA: actívala en la página, en Editar → Kero. Mientras, puedo recordarte cosas, apuntar tareas, buscar en internet y decirte cómo van tus widgets." : "Mi cabeza (la IA) está descansando un momento después de un fallo. Prueba otra vez en un par de minutos.");
  remember({ role: "user", content: text });
  const q = rt.merged || text;
  const context = botContext({ f: Number.isFinite(age) ? f : {}, facts, rems: [...s.rems, ...page], q, name: cfg.name, now });
  const r = await askOnce(ow, { messages: H.hist, context, prefs: prefsOf(facts), via: "telegram" });
  if (!r.text) {
    H.hist.pop();
    if (r.error !== "respuesta vacía") H.aiOffUntil = Date.now() + (/modelo|OpenWebUI 4/.test(r.error || "") ? MIN : 3 * MIN);
    return fallback(r.error === "respuesta vacía" ? "Me he quedado en blanco. ¿Me lo preguntas de otra forma?" : `Mi cerebro no contesta (${r.error || "error"}). ¿Está OpenWebUI encendido?`);
  }
  let out = plainText(parseAI(r.text).text);
  // si habla de tus datos, cada cifra tiene que salir de ellos
  if (Number.isFinite(age) && (topics(text).length || calc(text, f, now))) {
    const exact = answer(text, f, now);
    const v = checkNumbers(out, [context, brief(f), exact || "", ...H.hist.filter((m) => m.role === "user").map((m) => m.content)], exact);
    if (v.bad.length) out = v.text ? plainText(v.text) : "No me cuadran las cifras, así que prefiero no inventármelas. Míralo en su widget.";
  }
  if (!out) return fallback("Me he quedado en blanco. ¿Me lo preguntas de otra forma?");
  remember({ role: "assistant", content: out });
  // lo que la IA ha entendido de ti (solo si se lo has contado tú)
  if (r.note && rt.type !== "plan" && /(?:^|[^\p{L}])(?:mi|mis|me|tengo|soy|vivo|trabajo|estudio|nac[ií])(?![\p{L}])/iu.test(r.note)) {
    await changeMemory((l) => upsertFact(l, r.note, Date.now()).list);
    await changeBot((x) => { x.memAt = Date.now(); });
  }
  return out;
}

// «busca X»: con la IA, lee las webs y contesta citando; si no, frases sacadas tal cual. Con las fuentes debajo
async function web(wq, question, ow) {
  const v = await webSearch(wq);
  if (!v.ok) return v.error === "sin buscador" ? "Para buscar necesito un buscador: conecta OpenWebUI o SearXNG en la página, en Editar → Conexiones."
    : v.error === "sin resultados" ? `No encuentro nada fiable sobre «${wq}».` : "Ahora mismo no llego a internet.";
  let sum = null;
  if (ow.base && ow.co.ai && ow.co.webAI !== false) {
    await readPages(v);
    const a = await webAnswer(v, question, ow);
    if (a) sum = { text: a.text, sources: a.sources };
  }
  sum ||= summarize(v);
  if (!sum?.text) return `No encuentro nada fiable sobre «${wq}».`;
  const src = (sum.sources || []).slice(0, 4).map((x) => `- ${x.site ? x.site + ": " : ""}${x.url}`);
  return plainText(sum.text) + (src.length ? `\n\nFuentes:\n${src.join("\n")}` : "");
}

// para el botón «Probar» de ajustes
export async function botTest() {
  const token = (await readSecrets()).tgToken, s = await readBot();
  if (!token) return { error: "falta el token" };
  if (!s.chat) return { error: "sin vincular" };
  const r = await send(token, s.chat, "Hola desde tu página de inicio. Si lees esto, los avisos te llegarán aquí.");
  return r.ok ? { ok: true } : { error: r.error };
}
