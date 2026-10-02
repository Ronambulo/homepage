// Kero: motor propio a 60 fps. Física sencilla (muelles para aplastarse e inclinarse, saltos en parábola,
// caída con gravedad que aterriza en los widgets, botones y el reloj) + guiones asíncronos cancelables para
// los comportamientos. Puede pensar con un modelo de OpenWebUI (/api/lunares). Todo plano, sin sombras.
//
// Todo el estado vive en `E` (el contexto compartido por los módulos):
//   engine.js     guiones, burbujas, movimiento y plataformas
//   behaviours.js lo que hace (B) y cómo elige qué hacer
//   talk.js       charla, IA, órdenes, recordatorios, memoria y avisos
//   input.js      ratón, teclado y la página
//   loop.js       el fotograma: física, cuerpo, ojos y burbujas
import { pick, LINES, readMs } from "@/lib/lunares";
import { makeBehaviours } from "./behaviours";
import { makeTalk } from "./talk";
import { bindInput } from "./input";
import { makeFrame } from "./loop";
import { makeTrace } from "./trace";
import { PX, rnd, clamp, lin, io, Cancel } from "./util";

const PLAT = ".gc, .hero .time, button"; // cosas de la página sobre las que puede posarse

// P: ref con { s, facts, embedded, onTweak, onTodo }; refs: nodos del DOM; set: setters de React
export function createEngine({ P, refs, set }) {
  const L = refs.layer.current, C = refs.char.current;
  C.style.visibility = "hidden"; // hasta el primer fotograma
  const reduceQ = window.matchMedia("(prefers-reduced-motion: reduce)");
  const now = () => performance.now();
  const F = () => P.current.facts;
  const st = () => P.current.s;
  const page = !P.current.embedded;
  const px = () => (PX[st().size] || 84) * (P.current.embedded ? 0.9 : 1);
  const E = {
    P, refs, set, L, C, reduceQ, now, F, st, page, px,
    W: L.clientWidth, H: L.clientHeight,
    busy: false, tok: 0, nextAt: now() + 2500, alive: true, down: null, plats: [], platsAt: 0,
    pend: new Set(), tweens: new Set(), timers: {},
  };
  const floor = () => E.H - (P.current.embedded ? 8 : 12);
  const marg = () => px() / 2 + 8;
  const home = () => (st().side === "left" ? marg() + 6 : E.W - marg() - 6);

  const S = E.S = {
    x: home(), y: floor(), vx: 0, vy: 0, svx: 0, mode: "rest", phase: Math.random(),
    q: 0, qv: -3, qT: 0, lean: 0, lv: 0, bias: 0, rot: 0, spin: false, pop: 0, popv: 0,
    look: [0, 0], lookO: null, blink: 0, nextBlink: now() + 1500, talkUntil: 0,
    expr: null, mood: "ok", pet: 0, cool: {}, clicks: [], lastAct: now(), napUntil: 0, awakeUntil: 0, demoUntil: 0,
    ptr: null, ptrT: 0, speed: 0, still: 0, poi: null, reading: 0, alertKey: null, alertSaid: 0, movedSaid: 0, prev: null, hiddenAt: 0,
    on: null, onL: null, mute: false, chatting: false, hist: [], sid: 0, aiOffUntil: 0, lastAI: false, fallTop: null, splat: 0, splatv: 0, splatT: 0, fx: null, sleepWhy: null,
    // ánimo: joy (caricias) y grump (zarandeos) van de 0 a 1 y se apagan solos; recent: últimos gestos (para no repetirse)
    joy: 0, grump: 0, recent: [], moodK: null, face: null, moodAt: 0,
  };
  // posición guardada (solo en la página). Siempre reaparece en el suelo.
  if (page && st().roam !== "off") {
    try {
      const p = JSON.parse(localStorage.getItem("lunares_pos") || "null");
      if (p && Number.isFinite(p.fx)) S.x = clamp(p.fx * E.W, marg(), E.W - marg());
    } catch {}
  }
  const save = () => { if (!page) return; try { localStorage.setItem("lunares_pos", JSON.stringify({ fx: S.x / E.W })); } catch {} };

  /* ---------- plataformas: widgets, botones y el reloj ---------- */
  const rectOf = (el) => {
    if (!el.isConnected || (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true }))) return null;
    const lr = L.getBoundingClientRect();
    let r = el.getBoundingClientRect(), pad = 0;
    if (el.matches(".time")) {
      // el reloj: usa el borde de las cifras, no la caja de la línea
      const rg = document.createRange(); rg.selectNodeContents(el); r = rg.getBoundingClientRect();
      pad = parseFloat(getComputedStyle(el).fontSize) * 0.17;
    }
    if (r.width < 36 || r.height < 14) return null;
    return { el, l: r.left - lr.left, r: r.right - lr.left, top: r.top - lr.top + pad };
  };
  const scan = () => {
    if (!page) return;
    const out = [];
    for (const el of document.querySelectorAll(PLAT)) {
      if (L.contains(el) || el.closest(".sheet, dialog, [aria-hidden='true'], .xdet")) continue;
      const p = rectOf(el);
      if (!p || p.r < 20 || p.l > E.W - 20 || p.top < px() * 0.9 || p.top > floor() - 24) continue;
      out.push(p);
    }
    E.plats = out;
  };
  const bump = (el, v) => {
    if (!el || reduceQ.matches) return;
    el.style.setProperty("--lun-bump", clamp(v / 260, 1.2, 7).toFixed(1) + "px");
    el.classList.remove("lun-bump"); void el.offsetWidth; el.classList.add("lun-bump");
    clearTimeout(el._lunT); el._lunT = setTimeout(() => el.classList.remove("lun-bump"), 520);
  };

  /* ---------- guiones ---------- */
  const { pend, tweens } = E;
  const wait = (ms) => new Promise((res, rej) => { const o = { rej }; o.id = setTimeout(() => { pend.delete(o); res(); }, ms); pend.add(o); });
  const tween = (ms, fn, ease = io) => new Promise((res, rej) => { const o = { rej, res, fn, ease, ms, t0: now() }; pend.add(o); tweens.add(o); });
  // espera una promesa externa (fetch) pero se cancela con el guion (y si se pasa `ac`, también se aborta la petición)
  const guard = (p, ac) => new Promise((res, rej) => {
    const o = { rej: (e) => { try { ac?.abort(); } catch {} rej(e); } };
    pend.add(o);
    p.then((v) => { pend.delete(o); res(v); }, () => { pend.delete(o); res(null); });
  });
  const cancel = () => { for (const o of pend) { clearTimeout(o.id); o.rej(new Cancel()); } pend.clear(); tweens.clear(); S.qT = 0; S.bias = 0; S.lookO = null; S.spin = false; S.mute = false; S.splatT = 0; S.fx = null; };
  const setExpr = (e) => { S.expr = e; set.expr(e); };
  const idleDelay = () => rnd(0.7, 1.3) * (10000 - 7000 * (st().energy / 100));
  // mientras piensa o contesta una pregunta, todo lo demás (clics, caricias, comentarios, paseos) se ignora
  async function run(fn, force) {
    if (S.answering && !force) return;
    cancel();
    const my = ++E.tok;
    E.busy = true;
    try { await fn(); } catch (e) { if (!(e instanceof Cancel)) console.error(e); }
    finally { if (my === E.tok) { E.busy = false; setExpr(null); S.qT = 0; S.bias = 0; S.lookO = null; E.nextAt = now() + idleDelay(); } }
  }
  const chance = (p) => st().chatter === "high" || Math.random() < p;

  /* ---------- burbujas ---------- */
  const hideIn = (d) => { clearTimeout(E.timers.bub); E.timers.bub = setTimeout(() => { if (E.alive) { set.bubble(null); set.trail([]); } }, d); };
  // `src`: enlaces de donde sale lo que dice (búsquedas en internet), debajo de la burbuja
  // `acts`: botones bajo la burbuja ([{ k, label }]); al pulsarlos llama a E.onAct(k)
  const say = (text, ms, force, keep, src, acts) => {
    if (!text || S.mute || ((st().chatter === "off" || S.answering) && !force)) return 0;
    const d = ms ?? clamp(2000 + text.length * 55, 2800, 9000);
    set.bubble({ text, k: Math.random(), src, acts }); S.lastAI = false;
    if (!keep) set.trail([]);
    S.talkUntil = now() + Math.min(300 + text.length * 45, 2600);
    hideIn(d);
    return d;
  };
  const ponder = (force) => { if (st().chatter === "off" && !force) return false; clearTimeout(E.timers.bub); set.trail([]); set.bubble({ think: true, k: Math.random() }); return true; };
  const hush = () => { clearTimeout(E.timers.bub); set.bubble(null); set.trail([]); };
  const line = (k) => (typeof LINES[k] === "function" ? LINES[k](F()) : pick(LINES[k]));
  // burbuja tras burbuja: las anteriores se quedan apiladas encima; `prev` es la que ya está en pantalla
  async function sayMany(parts, last, prev, src) {
    for (let i = 0; i < parts.length; i++) {
      const before = i ? parts[i - 1] : prev;
      if (before) { await wait(400); S.qv += 1.5; set.trail((t) => [...t, { text: before, k: Math.random() }].slice(-4)); }
      const end = i === parts.length - 1, read = readMs(parts[i]);
      // la burbuja no se esconde sola entre una y otra; la última se queda `last` ms
      say(parts[i], end ? Math.max(last || 0, read + parts.length * 1500) : read + 5000, true, !!before, end ? src : undefined);
      await wait(end ? read * 0.85 : read);
    }
  }
  // todas las burbujas de golpe (la respuesta que va llegando): las anteriores encima, la última abajo.
  // Las claves son fijas para que no se vuelvan a animar con cada trozo.
  const show = (parts, ms, key = "live") => {
    if (!parts.length) return;
    const last = parts[parts.length - 1];
    set.trail(parts.slice(0, -1).slice(-4).map((text, i, a) => ({ text, k: key + ":" + (parts.length - 1 - a.length + i) })));
    set.bubble({ text: last, k: key + ":" + (parts.length - 1) });
    S.talkUntil = now() + 500; S.lastAI = false;
    if (ms) hideIn(ms); else clearTimeout(E.timers.bub);
  };

  /* ---------- movimiento ---------- */
  // salto en parábola; `el` es la plataforma donde aterriza (null = suelo; por defecto, la misma)
  async function hop(tx, ty, h = 26, ms = 400, el = S.on) {
    const from = S.on;
    S.qT = -0.2; await wait(100); S.qT = 0; S.qv += 3.2;
    if (from && from !== el) bump(from, 300);
    S.on = el; S.onL = null;
    const x0 = S.x, y0 = S.y;
    await tween(ms, (u) => { S.x = x0 + (tx - x0) * u; S.y = y0 + (ty - y0) * u - h * 4 * u * (1 - u); }, lin);
    S.qv -= 2.4 + Math.min(h, 80) / 30;
    if (el && (el !== from || h > 15)) bump(el, 180 + h * 6);
    await wait(70);
  }
  async function walkTo(tx, ty = floor(), el = null) {
    tx = clamp(tx, marg(), E.W - marg());
    if (el !== S.on || Math.abs(ty - S.y) > 3) {
      // cambiar de nivel: un salto (si baja de una plataforma, primero hasta el borde)
      const dx = tx - S.x, dy = ty - S.y;
      const h = clamp(Math.abs(dx) * 0.22, 22, 110) + Math.max(0, -dy) * 1.05;
      await hop(tx, ty, h, clamp(380 + Math.hypot(dx, dy) * 0.55, 400, 1100), el);
      return;
    }
    let lo = marg(), hi = E.W - marg();
    if (S.on) { const r = rectOf(S.on); if (r) { lo = Math.max(lo, r.l + px() * 0.25); hi = Math.min(hi, r.r - px() * 0.25); } }
    tx = clamp(tx, lo, Math.max(lo, hi));
    if (Math.random() < 0.35 && Math.abs(tx - S.x) > 60) {
      // reptar: se estira y encoge mientras avanza
      const x0 = S.x, d = tx - x0, ms = Math.abs(d) / 0.11;
      S.bias = Math.sign(d) * 6;
      await tween(ms, (u) => { S.x = x0 + d * u; S.qT = 0.08 * Math.sin(u * Math.abs(d) / 9); }, io);
      S.bias = 0; S.qT = 0; return;
    }
    const big = st().roam === "free";
    for (let i = 0; i < 14; i++) {
      const dx = tx - S.x;
      if (Math.abs(dx) < 6) break;
      const step = Math.sign(dx) * Math.min(Math.abs(dx), big ? rnd(70, 140) : rnd(45, 85));
      await hop(S.x + step, S.y, big ? rnd(14, 30) : rnd(10, 20), big ? rnd(320, 400) : rnd(280, 340));
    }
  }
  // a dónde ir: en modo libre, a una plataforma o al suelo; en los demás, por el suelo (si está subido, se baja)
  const spot = () => {
    if (st().roam === "free" && page) {
      const ps = E.plats.filter((p) => p.el !== S.on && p.r - p.l > px() * 0.9);
      if (ps.length && Math.random() < 0.6) { const p = pick(ps); return [rnd(p.l + px() * 0.4, p.r - px() * 0.4), p.top, p.el]; }
      return [rnd(marg(), E.W - marg()), floor(), null];
    }
    if (S.on) {
      const r = rectOf(S.on);
      const ex = r ? (Math.random() < 0.5 ? r.l - px() * 0.7 : r.r + px() * 0.7) : S.x;
      return [clamp(ex, marg(), E.W - marg()), floor(), null];
    }
    return [clamp(S.x + rnd(-1, 1) * rnd(120, Math.max(160, E.W * 0.4)), marg(), E.W - marg()), floor(), null];
  };
  const drop = () => { cancel(); E.tok++; E.busy = true; S.on = null; S.vx = 0; S.vy = 0; S.mode = "fall"; setExpr("surprised"); };
  // despertarlo un rato (al moverlo, acariciarlo, un recordatorio…)
  const rouse = (ms = 120000) => { S.napUntil = 0; S.awakeUntil = now() + ms; };

  Object.assign(E, {
    floor, marg, home, save, rectOf, scan, bump,
    wait, tween, guard, cancel, setExpr, run, chance,
    say, ponder, hush, line, sayMany, show, hop, walkTo, spot, drop, rouse,
  });
  E.trace = makeTrace(page); // lo que piensa, para /kero (el cerebro)
  Object.assign(E, makeBehaviours(E)); // B, choose, gripe, goofs
  Object.assign(E, makeTalk(E)); // ctx, askAI, sayAI, send, openChat, closeChat, recordatorios…
  const unbind = bindInput(E);
  const frame = makeFrame(E);

  let raf;
  const loop = () => { raf = requestAnimationFrame(loop); frame(); };
  raf = requestAnimationFrame(loop);
  run(E.B.hello);
  const stopTalk = E.startTalk();
  E.trace.onAsk = (t) => { if (t) { S.lastAct = now(); E.send(t); } };

  return {
    // probar desde el panel
    play(n) {
      const { B, goofs } = E;
      S.lastAct = now();
      if (n === "sleep") { S.awakeUntil = 0; S.napUntil = now() + (P.current.embedded ? 12000 : 300000); cancel(); E.tok++; E.busy = false; setExpr(null); return; }
      rouse(60000);
      if (n === "alert") { S.demoUntil = now() + 9000; return run(B.alert); }
      if (n === "chat") return E.openChat();
      if (n === "goof") n = pick(goofs.filter((g) => g !== "peek" || st().roam !== "off"));
      if (n === "scared") n = "startle";
      if (B[n]) run(B[n]);
    },
    send: (t) => E.send(t),
    closeChat: () => E.closeChat(),
    delRem: (id) => E.delRem(id),
    delFact: (id) => E.delFact(id),
    act: (k) => E.onAct?.(k),
    destroy() {
      E.alive = false;
      cancelAnimationFrame(raf); cancel(); E.tok++;
      for (const t of Object.values(E.timers)) { clearTimeout(t); clearInterval(t); }
      unbind(); stopTalk(); E.trace.close();
    },
  };
}
