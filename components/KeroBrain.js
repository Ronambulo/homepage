"use client";

// Kero: su cerebro en directo (/kero). Escucha a la página de inicio por un BroadcastChannel (components/lunares/trace.js):
// cada paso de lo que piensa enciende su caja en el diagrama, y debajo se ve su estado (ánimo, memoria, hábitos…).
// Ábrela en otra pestaña, junto a la página de inicio.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BRAIN } from "./lunares/trace";

/* ---------- el diagrama ---------- */
const W = 1010, H = 598;
// [centro x, centro y, ancho, alto, nombre, carril]; el carril «talk» es la charla, «know» lo que sabe y «life» lo que hace solo
const NODES = {
  in: [76, 185, 112, 48, "Oído", "talk"], route: [228, 185, 112, 48, "Router", "talk"], sure: [376, 185, 120, 72, "¿Seguro?", "talk"],
  open: [530, 60, 112, 40, "Abrir app", "talk"], cmd: [530, 110, 112, 40, "Orden", "talk"], plan: [530, 160, 112, 40, "Plan", "talk"],
  web: [530, 210, 112, 40, "Internet", "talk"], data: [530, 260, 112, 40, "Tus datos", "talk"], ai: [530, 310, 112, 40, "IA", "talk"],
  ctx: [670, 310, 108, 48, "Contexto", "talk"], llm: [800, 310, 108, 48, "Modelo", "talk"], tool: [800, 240, 112, 48, "Herramienta", "talk"],
  check: [940, 310, 108, 48, "Cifras", "talk"], out: [940, 185, 112, 48, "Habla", "talk"],
  habit: [228, 425, 112, 48, "Hábitos", "know"], eyes: [530, 425, 112, 48, "Widgets", "know"], mem: [670, 425, 112, 48, "Memoria", "know"], rems: [940, 425, 112, 48, "Pendientes", "know"],
  senses: [76, 545, 112, 48, "Sentidos", "life"], mood: [228, 545, 112, 48, "Ánimo", "life"], choose: [376, 545, 112, 48, "¿Qué hago?", "life"], act: [530, 545, 112, 48, "Hace", "life"],
  sleep: [670, 545, 112, 48, "Sueño", "life"], nudge: [800, 545, 112, 48, "Avisos", "life"], clock: [940, 545, 112, 48, "Reloj", "life"],
};
const LANES = [["talk", 0, 360, "Cuando le hablas"], ["know", 378, 96, "Lo que sabe"], ["life", 492, 106, "Vida propia"]];
// flechas en ángulo recto: [de, a, trazo, punteada (le da datos, no es el camino)]
const BUS = (y) => `M436 185H455V${y}H472`, OUT = (y) => `M586 ${y}H600V185H882`;
const EDGES = [
  ["in", "route", "M132 185H170"], ["route", "sure", "M284 185H314"], ["route", "open", "M228 161V60H472"],
  ["sure", "cmd", BUS(110)], ["sure", "plan", BUS(160)], ["sure", "web", BUS(210)], ["sure", "data", BUS(260)], ["sure", "ai", BUS(310)],
  ["open", "out", OUT(60)], ["cmd", "out", OUT(110)], ["plan", "out", OUT(160)], ["web", "out", OUT(210)], ["data", "out", OUT(260)],
  ["ai", "ctx", "M586 310H614"], ["ctx", "llm", "M724 310H744"], ["llm", "check", "M854 310H884"], ["check", "out", "M940 286V211"],
  ["llm", "tool", "M800 286V266"], ["tool", "cmd", "M744 232H622V120H588"], ["tool", "web", "M744 248H630V200H588"],
  ["habit", "route", "M228 401V211", 1], ["eyes", "ai", "M530 401V332", 1], ["mem", "ctx", "M670 401V336", 1],
  ["senses", "mood", "M132 545H170"], ["mood", "choose", "M284 545H318"], ["choose", "act", "M432 545H472"],
  ["clock", "nudge", "M884 545H858"], ["clock", "rems", "M940 521V451"],
];
const EDGE_D = Object.fromEntries(EDGES.map(([a, b, d]) => [a + ">" + b, d]));
const diamond = (w, h) => `M${-w / 2} 0L0 ${-h / 2}L${w / 2} 0L0 ${h / 2}Z`;

const DESC = {
  in: "Lo que le escribes en la charla (doble clic sobre él) o lo que pruebas desde aquí.",
  route: "Decide por dónde va cada mensaje sin IA: abrir una app, una orden, un plan, internet, tus datos o la IA. Corrige faltas, completa «¿y mañana?» con la pregunta anterior y da una confianza de 0 a 100 %.",
  sure: "Con un 80 % de confianza o más (o con la IA apagada), lo hace él. Si no, decide la IA, que puede contestar, buscar o pedir la orden.",
  open: "«abre Plex»: abre una de tus apps.",
  cmd: "Órdenes sin IA: recordatorios, temporizadores, tareas, vigilancias, recordar y olvidar cosas…",
  plan: "«mañana tengo un examen»: lo apunta con su fecha y después te pregunta qué tal fue.",
  web: "Busca en internet. Con IA lee las webs y contesta citándolas; quita las frases que no salen en las fuentes.",
  data: "Preguntas sobre tus widgets: contesta con los datos reales, al momento y sin IA.",
  ai: "Tu modelo en OpenWebUI, para todo lo demás.",
  ctx: "Lo que se le cuenta a la IA antes de la pregunta: la hora, lo que sabe de ti que viene al caso, los widgets de los que hablas, charlas de otros días, planes y cuentas ya hechas.",
  llm: "El modelo escribiendo la respuesta, que llega a trozos.",
  tool: "La IA puede pedir una herramienta en vez de contestar: buscar, abrir una app o una orden.",
  check: "Cada cifra sobre tus datos tiene que salir de los widgets; si se inventa una, cambia la frase por la respuesta exacta.",
  out: "Lo que dice, en burbujas.",
  habit: "Lo que aprende de cómo lo usas: qué camino acertó o falló para cada frase (tus «no, eso no») y qué widgets miras y cuándo.",
  mem: "Lo que sabe de ti: datos, planes, charlas y cómo hablarte. Se guarda en el servidor.",
  eyes: "Los datos de los widgets de la página: servidor, servicios, tiempo, agenda, patrimonio…",
  rems: "Recordatorios, temporizadores y vigilancias que tiene pendientes.",
  senses: "Caricias, cosquillas, zarandeos y qué widget miras con el ratón.",
  mood: "Su ánimo: sale de los avisos de la página, de cómo lo tratas (alegría y mal humor que se apagan solos) y del rato que pasa sin que le hagas caso.",
  choose: "Cuando está libre, sortea qué hacer. Cada cosa pesa más o menos según su energía, su ánimo y lo que acaba de hacer.",
  act: "Lo que ha decidido hacer.",
  sleep: "Duerme de noche y a veces se echa la siesta; lo urgente lo despierta.",
  clock: "Cada 5 s mira los recordatorios y lo que vigila; cada 30 s, los avisos útiles.",
  nudge: "Avisos útiles: un evento a punto de empezar, lluvia, un servicio que vuelve, lo que sueles mirar a esta hora…",
};

/* ---------- nombres ---------- */
const ROUTE = { open: "abrir una app", plan: "un plan tuyo con fecha", web: "buscar en internet", answer: "datos de tus widgets", ai: "la IA" };
const CMD = {
  remind: "recordatorio", timer: "temporizador", todo: "tarea", done: "tachar una tarea", remember: "recordar algo de ti", forget: "olvidar algo",
  recall: "lo que sabe de ti", reminders: "ver recordatorios", unremind: "borrar un recordatorio", watch: "vigilar algo", multi: "varias órdenes",
  pref: "cómo hablarte", snooze: "posponer", wrong: "«eso no»", plan: "plan",
};
const routeName = (l) => (l?.startsWith("command:") ? "orden: " + (CMD[l.slice(8)] || l.slice(8)) : ROUTE[l] || l || "?");
const ACTS = {
  look: "mirar alrededor", think: "pensar en voz alta", wander: "pasear", yawn: "bostezar", nap: "echar la siesta", bored: "aburrirse", stretch: "estirarse",
  sigh: "suspirar", nod: "asentir", spin: "dar vueltas", melt: "derretirse", dance: "bailar", jiggle: "temblar", wink: "guiñar un ojo", stare: "mirarte fijo",
  peek: "asomarse", sneeze: "estornudar", hum: "tararear", bounce: "botar",
};
const WIDGET = { fm: "patrimonio", svc: "servicios", wx: "tiempo", todo: "tareas", srv: "servidor", cal: "agenda", gh: "GitHub", dp: "Minecraft", ha: "casa", im: "fotos" };
const KIND = {
  fact: "dato", plan: "plan", episode: "charla", pref: "cómo hablarte", birthday: "cumpleaños", name: "nombre", age: "edad", home: "dónde vives",
  origin: "de dónde eres", work: "trabajo", like: "le gusta", dislike: "no le gusta", fav: "favorito", rel: "familia", has: "tiene",
};
const pct = (v) => Math.round((v || 0) * 100) + " %";
const cut = (s, n = 90) => { s = String(s ?? ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const hhmmss = (t) => new Date(t).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const ago = (s) => (s < 60 ? `${s} s` : s < 3600 ? `${Math.floor(s / 60)} min` : `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`);

// por qué cajas pasa cada paso, y el texto corto que se queda debajo de cada una (por parejas: caja, texto…)
function pathOf(ev) {
  switch (ev.k) {
    case "in": return ["in"];
    case "route": return ev.type === "open" ? ["route", "open"] : ev.learned ? ["habit", "route", "sure"] : ["route", "sure"];
    case "cmd": return ev.type === "watch" || ev.type === "remind" || ev.type === "timer" ? ["cmd", "rems"] : ["cmd"];
    case "plan": return ["plan"];
    case "web": return ["web"];
    case "data": return ["eyes", "data"];
    case "ctx": return ["ai", "ctx"];
    case "llm": return ["llm"];
    case "aioff": return ["llm"];
    case "tool": return ["tool"];
    case "check": return ["check"];
    case "mem": return ["mem"];
    case "out": return ["out"];
    case "wrong": case "habit": return ["habit"];
    case "feel": return ["senses", "mood"];
    case "look": return ["senses", "habit"];
    case "mood": return ["mood"];
    case "choose": return ["mood", "choose", "act"];
    case "muse": return ev.text ? ["act", "ctx", "llm", "out"] : ["act", "ctx", "llm"];
    case "sleep": return ["clock", "sleep"];
    case "rem": return ["clock", "rems", "out"];
    case "watch": return ev.hits?.length ? ["clock", "rems", "out"] : ["clock", "rems"];
    case "nudge": return ev.none ? ["clock", "nudge"] : ["clock", "nudge", "out"];
    default: return [];
  }
}
function subOf(ev) {
  switch (ev.k) {
    case "in": return ["in", ev.text];
    case "route": return ev.type === "open" ? ["open", ev.label] : ["route", `${routeName(ev.label)} · ${pct(ev.score)}`, "sure", ev.sure ? (ev.ai ? "sí · ≥ 80 %" : "sí · sin IA") : "no · < 80 %"];
    case "cmd": return ["cmd", CMD[ev.type] || ev.type];
    case "plan": return ["plan", "apuntado"];
    case "web": return ["web", ev.phase === "start" ? `buscando «${ev.q}»` : ev.phase === "fail" ? ev.error : `${ev.n} fuentes`];
    case "data": return ["data", (ev.ids || []).map((i) => WIDGET[i] || i).join(", ") || "datos"];
    case "ctx": return ["ctx", `${ev.facts?.length || 0} tuyas · ${ev.widgets?.length ? WIDGET[ev.widgets[0]] || ev.widgets[0] : `${ev.lines} líneas`}`, "mem", ev.facts?.length ? `${ev.facts.length} al contexto` : "nada al caso"];
    case "aioff": return ["llm", "descansa"];
    case "llm": return ["llm", ev.phase === "start" ? "pensando…" : ev.error ? ev.error : `${(ev.ms / 1000).toFixed(1)} s · ${ev.chars} letras`];
    case "tool": return ["tool", `${ev.name}: ${ev.arg}`];
    case "check": return ["check", ev.bad ? `${ev.bad} inventadas` : "todas bien"];
    case "mem": return ["mem", `${ev.op === "del" ? "olvida" : ev.op === "change" ? "cambia" : "apunta"} ${KIND[ev.kind] || ""}`.trim()];
    case "out": return ["out", ev.text];
    case "wrong": return ["habit", "«eso no»"];
    case "habit": return ["habit", "acierto +1"];
    case "feel": return ["senses", ev.kind === "grump" ? "le molestas" : "le gusta"];
    case "look": return ["senses", `miras ${WIDGET[ev.id] || ev.id}`];
    case "mood": return ["mood", ev.key];
    case "choose": return ["act", ACTS[ev.pick] || ev.pick];
    case "muse": return ["act", ev.text ? "comenta algo" : "se calla"];
    case "sleep": return ["sleep", ev.to === "sleep" ? (ev.why === "night" ? "de noche" : "siesta") : ev.to === "alert" ? "¡alerta!" : "despierto"];
    case "rem": return ["rems", "¡toca uno!"];
    case "watch": return ["rems", ev.hits?.length ? "¡se cumple!" : `vigila ${ev.n}`];
    case "nudge": return ["nudge", ev.none ? "nada que decir" : "avisa"];
    default: return [null];
  }
}

// cada paso contado en una frase (para «Lo que está pensando» y el registro)
function tell(ev) {
  switch (ev.k) {
    case "in": return ["Oye", `«${ev.text}»${ev.hist ? ` (con ${ev.hist / 2 | 0} preguntas antes en esta charla)` : ""}`];
    case "route": {
      const o = [];
      if (ev.fixed) o.push(`corrige las faltas: «${ev.fixed}»`);
      if (ev.merged) o.push(`lo junta con la pregunta anterior: «${ev.merged}»`);
      o.push(`parece ${routeName(ev.label)} (${pct(ev.score)} de confianza)`);
      if (ev.learned) o.push(ev.learned > 0 ? `lo ha aprendido de otras veces (antes ${pct(ev.was)})` : `le dijiste «eso no» a esta frase (antes ${pct(ev.was)})`);
      if (ev.type !== "open") o.push(ev.sure ? (ev.ai ? "está seguro: lo hace él, sin IA" : "la IA está apagada: lo hace él") : "no está seguro: que decida la IA");
      return ["Router", o.join("; ") + "."];
    }
    case "cmd": return [ev.fallback ? "Orden (la IA falló)" : "Orden", `${CMD[ev.type] || ev.type} → «${cut(ev.reply, 160)}»`];
    case "plan": return ["Plan", `lo apunta con fecha${ev.due ? " (" + new Date(ev.due).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" }) + ")" : ""}.`];
    case "web":
      if (ev.phase === "start") return ["Internet", `busca «${ev.q}»${ev.ai ? " y la IA leerá las webs" : " (sin IA: frases tal cual)"}.`];
      if (ev.phase === "fail") return ["Internet", `no hay suerte: ${ev.error}.`];
      return ["Internet", `${ev.n} fuentes${ev.sites?.length ? ": " + ev.sites.join(", ") : ""}${ev.dropped ? `; quita ${ev.dropped} frases que no salían en ellas` : ""}.`];
    case "data": return ["Tus datos", `contesta con los datos reales de ${(ev.ids || []).map((i) => WIDGET[i] || i).join(", ") || "los widgets"}, sin IA.`];
    case "ctx": {
      const o = [`${ev.lines} líneas (${ev.chars} letras)`];
      o.push(ev.facts?.length ? `${ev.facts.length} cosas tuyas que vienen al caso: ${ev.facts.map((f) => `«${cut(f, 50)}»`).join(", ")}` : "nada de lo que sabe de ti viene al caso");
      if (ev.widgets?.length) o.push(`widgets: ${ev.widgets.map((i) => WIDGET[i] || i).join(", ")}`);
      if (ev.eps?.length) o.push(`${ev.eps.length} charlas de otros días`);
      if (ev.plans) o.push("tus planes cercanos");
      if (ev.calc) o.push("una cuenta ya hecha");
      if (ev.hist) o.push(`${ev.hist} mensajes de esta charla`);
      return ["Contexto", o.join("; ") + "."];
    }
    case "llm":
      if (ev.phase === "start") return ["Modelo", `le pregunta a ${ev.model || "la IA"}…`];
      if (ev.error) return ["Modelo", `falla: ${ev.error}.`];
      return ["Modelo", `contesta en ${(ev.ms / 1000).toFixed(1)} s (${ev.chars} letras)${ev.note ? `; ha entendido de ti: «${ev.note}»` : ""}${ev.topic ? `; la charla va de «${ev.topic}»` : ""}.`];
    case "tool": return ["Herramienta", `la IA pide «${ev.name}»: ${ev.arg}.`];
    case "check": return ["Cifras", ev.bad ? `se ha inventado ${ev.bad} (${(ev.nums || []).join(", ")}): cambia esas frases por los datos exactos.` : "todas las cifras salen de tus datos."];
    case "mem": return ["Memoria", ev.op === "del" ? `olvida «${ev.text}».` : ev.op === "change" ? `cambia «${ev.old}» por «${ev.text}».` : `apunta (${KIND[ev.kind] || ev.kind}): «${ev.text}».`];
    case "out": return ["Habla", `«${cut(ev.text, 220)}»`];
    case "wrong": return ["Hábitos", ev.fresh ? `«eso no»: ${ev.learned ? `${routeName(ev.label)} baja para «${cut(ev.q, 60)}»` : "era la IA, no aprende nada"}.` : "«eso no», pero no sabe a qué."];
    case "habit": return ["Hábitos", `la IA eligió lo mismo que el router (${routeName(ev.label)}): la próxima vez irá directo.`];
    case "feel": return ["Sentidos", ev.kind === "grump" ? `le molestas: su mal humor sube un ${pct(ev.by)}.` : `le gusta: su alegría sube un ${pct(ev.by)}.`];
    case "look": return ["Sentidos", `miras el widget de ${WIDGET[ev.id] || ev.id}: lo apunta en sus hábitos.`];
    case "mood": return ["Ánimo", `pasa de ${ev.from || "nada"} a ${ev.key}${ev.why ? `: ${ev.why}` : ""}.`];
    case "choose": return ["¿Qué hago?", `sortea entre ${ev.w.length} cosas y sale «${ACTS[ev.pick] || ev.pick}».`];
    case "aioff": return ["IA", `falla (${ev.why}): no la vuelve a usar en ${ev.secs / 60} min; mientras, tira de frases propias.`];
    case "muse": return ["Comentario", ev.text ? `se le ocurre: «${cut(ev.text, 140)}»` : ev.error ? `la IA no contesta (${ev.error}).` : `lo descarta: se inventaba ${ev.bad} cifras.`];
    case "sleep": return ["Sueño", ev.to === "sleep" ? `se duerme (${ev.why === "nap" ? "siesta" : ev.why === "night" ? "es de noche" : ev.why === "siesta" ? "hora de la siesta" : ev.why || "sueño"}).` : ev.to === "alert" ? "se pone en alerta: hay avisos en la página." : "se despierta."];
    case "rem": return ["Pendientes", `¡toca! «${cut(ev.text, 140)}»`];
    case "watch": return ["Pendientes", ev.hits?.length ? `se cumple: ${ev.hits.join("; ")}.` : `mira ${ev.n} ${ev.n === 1 ? "vigilancia" : "vigilancias"}: nada todavía.`];
    case "nudge": return ["Avisos", ev.none ? "repasa la página: nada que decir." : `«${cut(ev.text, 140)}»`];
    default: return [ev.k, ""];
  }
}

const STEP_MS = 380, MAX_EV = 400;
const Ic = ({ d }) => <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
// los textos cortos de debajo de cada caja vienen por parejas: [caja, texto, caja, texto…]
const eachSub = (ev, fn) => { const s = subOf(ev); for (let i = 0; i + 1 < s.length; i += 2) if (s[i]) fn(s[i], s[i + 1]); };

export default function KeroBrain() {
  const [st, setSt] = useState(null); // la foto del estado
  const [evs, setEvs] = useState([]); // todos los pasos que han llegado
  const [seen, setSeen] = useState(0); // cuándo llegó el último mensaje de la página
  const [glow, setGlow] = useState({}); // caja → nº de veces que se ha encendido (la clave reinicia la animación)
  const [sub, setSub] = useState({}); // caja → lo último que ha pasado por ella
  const [pulses, setPulses] = useState([]); // bolitas que van por las flechas
  const [sel, setSel] = useState(null); // el pensamiento que se ve (null: el último)
  const [node, setNode] = useState(null); // la caja pulsada (su explicación)
  const [life, setLife] = useState(true); // enseñar la vida propia en el registro
  const [paused, setPaused] = useState(false);
  const [now, setNow] = useState(Date.now());
  const bc = useRef(null), tab = useRef(null), lastAt = useRef(0), queue = useRef([]), timer = useRef(null), lastNode = useRef({}), pausedR = useRef(false);
  const tryIn = useRef(null);
  pausedR.current = paused;

  /* ---------- animación: un paso cada STEP_MS para que se vea el camino ---------- */
  const light = useCallback((ev) => {
    let path = pathOf(ev);
    const prev = ev.run ? lastNode.current[ev.run] : null;
    if (prev && path.length && prev !== path[0] && EDGE_D[prev + ">" + path[0]]) path = [prev, ...path];
    if (ev.run && path.length) lastNode.current[ev.run] = path[path.length - 1];
    const upd = {};
    eachSub(ev, (n, v) => { upd[n] = v; });
    if (Object.keys(upd).length) setSub((s) => ({ ...s, ...upd }));
    path.forEach((id, i) => {
      setTimeout(() => {
        if (!(i === 0 && prev === id)) setGlow((g) => ({ ...g, [id]: (g[id] || 0) + 1 }));
        const nx = path[i + 1], d = nx && EDGE_D[id + ">" + nx];
        if (d) {
          const k = Math.random().toString(36).slice(2);
          setPulses((p) => [...p, { k, d, life: NODES[id][5] === "life" || NODES[nx][5] === "life" }]);
          setTimeout(() => setPulses((p) => p.filter((x) => x.k !== k)), 700);
        }
      }, i * 170);
    });
  }, []);
  const pump = useCallback(() => {
    if (timer.current) return;
    const step = () => {
      const ev = queue.current.shift();
      if (!ev) { timer.current = null; return; }
      light(ev);
      timer.current = setTimeout(step, queue.current.length > 6 ? 90 : STEP_MS);
    };
    step();
  }, [light]);

  /* ---------- la conexión con la página de inicio ---------- */
  useEffect(() => {
    let ch;
    try { ch = new BroadcastChannel(BRAIN); } catch { return; }
    bc.current = ch;
    ch.onmessage = (e) => {
      const m = e.data;
      if (!m?.tab) return;
      const t = Date.now();
      // si hay varias pestañas de inicio abiertas, se queda con una mientras siga hablando
      if (!tab.current || (tab.current !== m.tab && t - lastAt.current > 6000)) { tab.current = m.tab; lastNode.current = {}; }
      if (m.tab !== tab.current) return;
      lastAt.current = t; setSeen(t);
      if (m.state) setSt(m.state);
      if (m.t === "history") {
        setEvs(m.list || []);
        // lo último que pasó por cada caja, sin animar
        const s = {};
        for (const ev of m.list || []) { eachSub(ev, (n, v) => { s[n] = v; }); const p = pathOf(ev); if (ev.run && p.length) lastNode.current[ev.run] = p[p.length - 1]; }
        setSub(s);
      } else if (m.t === "ev") {
        setEvs((l) => [...l, m.ev].slice(-MAX_EV));
        if (!pausedR.current) { queue.current.push(m.ev); pump(); }
      }
    };
    const hello = (full) => ch.postMessage({ t: "hello", full });
    hello(true);
    const iv = setInterval(() => hello(false), 3000), clock = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(iv); clearInterval(clock); clearTimeout(timer.current); ch.close(); };
  }, [pump]);

  const live = now - seen < 6000;
  const runs = useMemo(() => {
    const m = new Map();
    for (const ev of evs) if (ev.run) { if (!m.has(ev.run)) m.set(ev.run, []); m.get(ev.run).push(ev); }
    return [...m.entries()].map(([id, l]) => ({ id, l, q: l.find((e) => e.k === "in")?.text || "…", at: l[0].at }));
  }, [evs]);
  const cur = (sel && runs.find((r) => r.id === sel)) || runs[runs.length - 1] || null;
  // el camino del pensamiento que se ve: sus cajas y sus flechas, marcadas; «last» es donde acabó
  const walked = useMemo(() => {
    const n = new Set(), e = new Set();
    let prev = null;
    for (const ev of cur?.l || []) for (const id of pathOf(ev)) { n.add(id); if (prev && prev !== id) e.add(prev + ">" + id); prev = id; }
    const used = (cur?.l || []).some((ev) => ev.k === "ctx" && ev.facts?.length);
    return { n, e, last: prev, used };
  }, [cur]);
  const lastChoose = useMemo(() => [...evs].reverse().find((e) => e.k === "choose") || null, [evs]);
  const feels = useMemo(() => evs.filter((e) => e.k === "feel").slice(-4).reverse(), [evs]);
  const log = useMemo(() => evs.filter((e) => life || e.run).slice(-120).reverse(), [evs, life]);

  const tryAsk = (ev) => {
    ev.preventDefault();
    const v = tryIn.current?.value.trim();
    if (!v || !tab.current || !live) return;
    bc.current?.postMessage({ t: "ask", to: tab.current, text: v });
    tryIn.current.value = ""; setSel(null);
  };

  const ctxFacts = new Set(st?.ctx?.facts || []);
  const S = st || {};
  const status = !live ? "sin conexión" : S.state === "sleep" ? "durmiendo" : S.answering ? "contestando" : S.state === "alert" ? "en alerta" : S.busy ? "ocupado" : "despierto";
  const pick = (id) => setNode(node === id ? null : id);
  const usedN = (S.facts || []).filter((f) => ctxFacts.has(f.text)).length;

  return (
    <div className="kb">
      <header className="kb-top">
        <div className="kb-title">
          <svg width="34" height="30" viewBox="0 0 34 30" aria-hidden="true"><path d="M4 22c-3-6 0-15 9-18 7-2 15 1 18 8 3 8-2 15-10 16-7 1-14-1-17-6z" fill="var(--accent)" /><ellipse cx="13" cy="15" rx="2.2" ry="3" fill="#0a0a0b" /><ellipse cx="21" cy="15" rx="2.2" ry="3" fill="#0a0a0b" /></svg>
          <div>
            <h1>Cerebro de {S.name || "Kero"}</h1>
            <p><i className={"kb-dot" + (live ? " on" : "")} />{live ? "en directo · " : ""}{status}{live && S.mood ? ` · ${S.mood}` : ""}</p>
          </div>
        </div>
        <form className="kb-try" onSubmit={tryAsk}>
          <input ref={tryIn} maxLength={300} placeholder={live ? "Prueba una frase: «¿qué tiempo hace mañana?»" : "Abre la página de inicio para probar"} disabled={!live || S.answering} aria-label="Probar una frase" />
          <button type="submit" disabled={!live || S.answering}>Probar</button>
        </form>
        <div className="kb-btns">
          <button type="button" className={paused ? "on" : ""} onClick={() => { setPaused(!paused); queue.current = []; }}><Ic d={paused ? "M5 3.5l7 4.5-7 4.5z" : "M5.5 3.5v9M10.5 3.5v9"} />{paused ? "Seguir" : "Pausar"}</button>
          <a href="/"><Ic d="M2.5 7.5 8 3l5.5 4.5V13H2.5z" />Inicio</a>
        </div>
      </header>

      <div className="kb-main">
        <section className="kb-card kb-flow">
          <div className="kb-head">
            <h2>Cómo lo piensa</h2>
            <div className="kb-legend">
              <span><i className="kb-lg on" />esta pregunta</span><span><i className="kb-lg" />otros caminos</span><span><i className="kb-lg feed" />le da datos</span>
            </div>
          </div>
          <div className="kb-scroll">
            <svg viewBox={`-2 -2 ${W + 4} ${H + 4}`} className="kb-svg" role="img" aria-label="Diagrama de cómo piensa Kero">
              <defs>
                <pattern id="kb-dots" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="rgba(255,255,255,.05)" /></pattern>
                {["", "-on", "-feed"].map((v) => (
                  <marker key={v} id={"kb-arr" + v} viewBox="0 0 4 4" refX="3.2" refY="2" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L4 2 0 4z" className={"kb-arrh" + (v ? " " + v.slice(1) : "")} /></marker>
                ))}
              </defs>
              <rect x="0" y="0" width={W} height={H} fill="url(#kb-dots)" />
              {LANES.map(([k, y, h, label]) => (
                <g key={k}>
                  <rect x="0.5" y={y + 0.5} width={W - 1} height={h - 1} rx="14" className={"kb-lane " + k} />
                  <text x="14" y={y + 20} className={"kb-lanet " + k}>{label}</text>
                </g>
              ))}
              {[false, true].map((top) => EDGES.map(([a, b, d, feed]) => {
                const on = walked.e.has(a + ">" + b);
                if (on !== top) return null;
                const lf = NODES[a][5] === "life" && NODES[b][5] === "life";
                return <path key={a + b} d={d} className={"kb-edge" + (feed ? " feed" : "") + (lf ? " life" : "") + (on ? " on" : "")} markerEnd={`url(#kb-arr${on ? "-on" : feed ? "-feed" : ""})`} />;
              }))}
              {pulses.map((p) => (
                <circle key={p.k} r="5" className={"kb-pulse" + (p.life ? " life" : "")}>
                  <animateMotion dur="0.5s" fill="freeze" path={p.d} begin="indefinite" ref={(el) => { try { el?.beginElement(); } catch {} }} />
                </circle>
              ))}
              {Object.entries(NODES).map(([id, [x, y, w, h, label, lane]]) => {
                const s = sub[id], on = walked.n.has(id), dia = id === "sure";
                const cls = [lane, on && lane === "talk" && "on", walked.last === id && "now", (id === "mem" ? walked.used : on && lane === "know") && "used", node === id && "sel"].filter(Boolean).join(" ");
                return (
                  <g key={id} className={"kb-node " + cls} transform={`translate(${x} ${y})`} onClick={() => pick(id)} role="button" tabIndex={0} aria-label={label}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(id); } }}>
                    <title>{DESC[id]}</title>
                    {dia ? <path d={diamond(w, h)} className="kb-box" /> : <rect x={-w / 2} y={-h / 2} width={w} height={h} rx="10" className="kb-box" />}
                    {glow[id] > 0 && (dia
                      ? <path key={glow[id]} d={diamond(w + 8, h + 6)} className="kb-flash" />
                      : <rect key={glow[id]} x={-w / 2 - 3} y={-h / 2 - 3} width={w + 6} height={h + 6} rx="13" className="kb-flash" />)}
                    <text y={s ? -2 : 4} className={"kb-nl" + (h === 40 ? " sm" : "")}>{label}</text>
                    {s && <text y={h === 40 ? 12 : 13} className="kb-ns">{cut(s, dia ? 13 : 18)}</text>}
                  </g>
                );
              })}
            </svg>
          </div>
          {!live && (
            <div className="kb-wait">
              <b>Esperando a {S.name || "Kero"}…</b>
              <span>Abre la página de inicio en otra pestaña de este navegador. Cuando le hables o haga algo por su cuenta, aquí verás cómo lo piensa.</span>
            </div>
          )}
          {node ? (
            <div className="kb-explain">
              <div>
                <p className="kb-explain-h"><b>{NODES[node][4]}</b><span>pulsada</span></p>
                <p>{DESC[node]}</p>
              </div>
              {(() => {
                const last = [...evs].reverse().filter((e) => pathOf(e).includes(node)).slice(0, 4);
                return last.length
                  ? <ul>{last.map((e) => <li key={e.id}><span className="kb-t">{hhmmss(e.at)}</span>{tell(e)[1]}</li>)}</ul>
                  : <p className="kb-dim">Todavía no ha pasado nada por aquí.</p>;
              })()}
            </div>
          ) : <p className="kb-dim kb-hint">Pulsa una caja para saber qué hace y qué ha pasado por ella.</p>}
        </section>

        <aside className="kb-side">
          <section className="kb-card">
            <h2>Lo que está pensando</h2>
            {runs.length > 0 && (
              <div className="kb-runs">
                {runs.slice(-8).reverse().map((r) => (
                  <button key={r.id} type="button" className={cur?.id === r.id ? "on" : ""} onClick={() => setSel(r.id === runs[runs.length - 1].id ? null : r.id)} title={hhmmss(r.at)}>{cut(r.q, 24)}</button>
                ))}
              </div>
            )}
            {cur ? (
              <ol className="kb-steps">
                {cur.l.map((e) => { const [h, d] = tell(e); return <li key={e.id} className={"k-" + e.k}><b>{h}</b><span>{d}</span></li>; })}
                {S.answering && cur === runs[runs.length - 1] && <li className="k-wait"><b>…</b><span>pensando</span></li>}
              </ol>
            ) : <p className="kb-dim">Háblale (doble clic sobre él) o prueba una frase arriba.</p>}
          </section>
          <section className="kb-card">
            <div className="kb-head">
              <h2>Todo lo que pasa</h2>
              <label className="kb-chk"><input type="checkbox" checked={life} onChange={(e) => setLife(e.target.checked)} />vida propia</label>
            </div>
            <ul className="kb-log">
              {log.map((e) => { const [h, d] = tell(e); return <li key={e.id} className={e.run ? "talk" : "life"}><span className="kb-t">{hhmmss(e.at)}</span><span><b>{h}</b> {d}</span></li>; })}
              {!log.length && <li className="kb-dim">Nada todavía.</li>}
            </ul>
          </section>
        </aside>
      </div>

      <div className="kb-grid">
        <section className="kb-card">
          <h2>Ahora mismo</h2>
          <dl className="kb-dl">
            <dt>Estado</dt><dd>{status}{S.sleepWhy && S.state === "sleep" ? (S.sleepWhy === "night" ? " (es de noche)" : " (siesta)") : ""}</dd>
            <dt>Sin hacerle caso</dt><dd>{live ? ago(S.idle || 0) : "—"}</dd>
            <dt>Charla</dt><dd>{S.chatting ? `abierta, ${S.hist?.length || 0} mensajes` : "cerrada"}</dd>
            <dt>IA</dt><dd>{!S.ai ? "apagada" : S.aiOn ? `${S.model || "encendida"}` : <>descansando {S.aiOff} s{S.aiErr ? <> · falló a las {hhmmss(S.aiErr.at).slice(0, 5)}: <b>{S.aiErr.why}</b></> : " (falló)"}</>}</dd>
            <dt>Internet con IA</dt><dd>{S.webAI ? "sí" : "no"}</dd>
            <dt>Avisos útiles</dt><dd>{S.nudges ? "sí" : "no"}</dd>
          </dl>
        </section>

        <section className="kb-card">
          <div className="kb-head">
            <h2>Ánimo: {S.mood || "—"}</h2>
            {S.moodSince ? <span className="kb-dim">desde las {hhmmss(S.moodSince).slice(0, 5)}</span> : null}
          </div>
          {S.moodWhy && <p className="kb-why">Mira las reglas en orden y se queda con la primera que se cumple. <span>Está {S.mood} porque {S.moodWhy}.</span></p>}
          {!!S.moodRules?.length && (() => {
            const w = S.moodRules.findIndex((r) => r.ok);
            return (
              <ol className="kb-rules">
                {S.moodRules.map((r, i) => {
                  const c = i === w ? "win" : i > w ? "skip" : "no";
                  return (
                    <li key={r.key} className={c} title={c === "skip" ? "No hace falta mirarla: ya ganó una anterior" : undefined}>
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label={c === "win" ? "se cumple" : c === "no" ? "no se cumple" : "no se mira"}>
                        {c === "win" ? <path d="M3 8.5l3.2 3L13 4.5" /> : c === "no" ? <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" /> : null}
                      </svg>
                      <b>{r.key}</b><span>{r.rule}</span><em>{r.val}</em>
                    </li>
                  );
                })}
              </ol>
            );
          })()}
          <div className="kb-bars">
            <div><span>Alegría</span><i style={{ "--v": S.joy || 0 }} className="joy" /><em>{pct(S.joy)}</em></div>
            <div><span>Mal humor</span><i style={{ "--v": S.grump || 0 }} className="grump" /><em>{pct(S.grump)}</em></div>
          </div>
          <ul className="kb-feels">
            {feels.map((e) => (
              <li key={e.id}><span className="kb-t">{hhmmss(e.at)}</span>{e.kind === "grump" ? <>le molestas: mal humor <b className="grump">+{pct(e.by)}</b></> : <>le gusta: alegría <b>+{pct(e.by)}</b></>}</li>
            ))}
            <li className="kb-dim">Se le pasan solas: la alegría en unos 5 min, el mal humor en unos 3.</li>
          </ul>
          {lastChoose && (() => {
            const tot = lastChoose.w.reduce((a, [, v]) => a + v, 0) || 1, ws = [...lastChoose.w].sort((a, b) => b[1] - a[1]).slice(0, 7);
            return (
              <>
                <p className="kb-sub">Último sorteo, entre {lastChoose.w.length} cosas: <b>{ACTS[lastChoose.pick] || lastChoose.pick}</b></p>
                <div className="kb-bars small">
                  {ws.map(([n, v]) => <div key={n} className={n === lastChoose.pick ? "pick" : ""}><span>{ACTS[n] || n}</span><i style={{ "--v": v / ws[0][1] }} /><em>{Math.round((v / tot) * 100)} %</em></div>)}
                </div>
              </>
            );
          })()}
        </section>

        <section className="kb-card">
          <div className="kb-head">
            <h2>Memoria</h2>
            <span className="kb-dim">{S.facts?.length || 0} cosas{usedN ? <> · <span className="kb-know">{usedN} en la última pregunta</span></> : null}</span>
          </div>
          <ul className="kb-facts">
            {[...(S.facts || [])].reverse().slice(0, 40).map((f) => (
              <li key={f.id || f.text} className={ctxFacts.has(f.text) ? "used" : ""} title={ctxFacts.has(f.text) ? "Se lo ha contado a la IA en la última pregunta" : undefined}>
                {f.kind && <span className="kb-tag">{KIND[f.kind] || f.kind}</span>}{f.text}
              </li>
            ))}
            {!S.facts?.length && <li className="kb-dim">No sabe nada de ti todavía.</li>}
          </ul>
        </section>

        <section className="kb-card">
          <h2>Charla de ahora</h2>
          <ul className="kb-hist">
            {(S.hist || []).map((m, i) => <li key={i} className={m.role}>{m.content}</li>)}
            {!S.hist?.length && <li className="kb-dim">Cada vez que abres la charla empieza de cero; esto es lo que recuerda de la de ahora.</li>}
          </ul>
        </section>

        <section className="kb-card">
          <h2>Hábitos</h2>
          {(() => {
            const r = Object.entries(S.routes || {}).slice(-12).reverse();
            const use = Object.entries(S.use || {}).sort((a, b) => b[1] - a[1]);
            return (
              <>
                {use.length > 0 && <p className="kb-use">{use.map(([k, n]) => <span key={k}>{WIDGET[k] || k} <b>{n}</b></span>)}</p>}
                <div className="kb-routes">
                  {r.map(([k, m]) => (
                    <div key={k}><span>{k}</span><span>{Object.entries(m).map(([l, n]) => <em key={l} className={n < 0 ? "neg" : "pos"}>{routeName(l)} {n > 0 ? "+" + n : n}</em>)}</span></div>
                  ))}
                </div>
                {!r.length && !use.length && <p className="kb-dim">Aún no ha aprendido nada de cómo lo usas.</p>}
              </>
            );
          })()}
        </section>

        <section className="kb-card">
          <h2>Pendientes</h2>
          <ul className="kb-facts kb-pend">
            {(S.rems || []).map((r) => <li key={r.id}><span className="kb-tag">{r.kind === "timer" ? "temporizador" : r.rep ? "se repite" : "recordatorio"}</span><b>{r.text || "Aviso"}</b> · {new Date(r.at).toLocaleString("es-ES", { weekday: "short", hour: "2-digit", minute: "2-digit" })}</li>)}
            {(S.watches || []).map((w) => <li key={w.id}><span className="kb-tag">vigila</span><b>{w.text}</b></li>)}
            {!S.rems?.length && !S.watches?.length && <li className="kb-dim">Nada pendiente.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
