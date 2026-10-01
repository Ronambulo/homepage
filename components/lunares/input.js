// Kero: ratón, teclado y lo que pasa en la página. Devuelve la función que lo desengancha todo.
import { pick, LINES } from "@/lib/lunares";
import { clamp } from "./util";

export function bindInput(E) {
  const { S, L, C, P, st, now, px, page, set, reduceQ, run, cancel, say, hush, line, bump, setExpr, rouse, marg, floor, home, timers } = E;
  const B = E.B, openChat = () => E.openChat(), closeChat = () => E.closeChat();

  const toLayer = (e) => { const r = L.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const onDown = (e) => {
    if (e.button > 0) return;
    e.preventDefault();
    C.setPointerCapture?.(e.pointerId);
    const [x, y] = toLayer(e);
    E.down = { x, y, ox: x - S.x, oy: y - S.y, drag: false, hist: [[x, y, now()]] };
  };
  const onMove = (e) => {
    const d = E.down;
    if (!d) return;
    const [x, y] = toLayer(e);
    d.hist.push([x, y, now()]); if (d.hist.length > 6) d.hist.shift();
    if (!d.drag && Math.hypot(x - d.x, y - d.y) > 6 && st().drag) {
      // levantarlo corta lo que estuviera diciendo (también la cola de burbujas de una respuesta)
      if (S.answering) hush();
      d.drag = true; cancel(); E.tok++; E.busy = true; S.mode = "drag"; set.dragging(true);
      if (S.on) { bump(S.on, 400); S.on = null; }
      // si estaba dormido, se despierta (y no vuelve a dormirse en un par de minutos)
      if (S.mood === "sleep") rouse();
      E.feel("grump", 0.3);
      setExpr("surprised"); if (E.gripe(0.12)) say(line("grab"), 2000);
    }
    if (d.drag) d.t = [x - d.ox, y - d.oy];
  };
  const onUp = () => {
    const d = E.down;
    if (!d) return;
    E.down = null;
    S.lastAct = now();
    if (!d.drag) return click();
    set.dragging(false);
    const a = d.hist[0], b = d.hist[d.hist.length - 1], dt = Math.max(16, b[2] - a[2]) / 1000;
    S.vx = clamp((b[0] - a[0]) / dt, -2500, 2500); S.vy = clamp((b[1] - a[1]) / dt, -2500, 2500);
    S.mode = "fall"; // siempre cae: los widgets, botones y el reloj le hacen de suelo
    setExpr("scared");
  };
  function react() {
    if (S.mood === "sleep") { rouse(); return run(B.wake); }
    const opts = ["tickle", "tickle", "surprised", "think"];
    if (st().goofy && !reduceQ.matches) opts.push("spin", "jiggle");
    const k = pick(opts);
    if (k === "tickle") E.feel("joy", 0.2);
    run(B[k]);
  }
  function click() {
    if (S.answering) return;
    const t = now();
    S.clicks = S.clicks.filter((c) => t - c < 2500); S.clicks.push(t);
    clearTimeout(timers.click);
    if (S.clicks.length >= 5) { S.clicks = []; E.feel("grump", 0.4); return run(B.dizzy); }
    if (!st().ai) return react();
    // con IA: doble clic abre la charla, así que el clic simple espera un poco
    const quick = S.clicks.length >= 2 && t - S.clicks[S.clicks.length - 2] < 320;
    timers.click = setTimeout(() => (quick ? (S.chatting ? closeChat() : openChat()) : react()), quick ? 340 : 320);
  }
  const onKey = (e) => {
    if (S.answering) return;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (e.shiftKey && st().ai) openChat(); else react(); }
  };
  // clic derecho: opciones rápidas (solo donde se pueden guardar)
  const onCtx = (e) => {
    if (!P.current.onTweak) return;
    e.preventDefault();
    E.down = null;
    // con la tecla de menú no hay posición del ratón: junto a él
    const [x, y] = e.clientX || e.clientY ? toLayer(e) : [S.x, S.y - px()];
    set.menu({ x: x + 4, y: y + 4 });
  };
  C.addEventListener("pointerdown", onDown);
  C.addEventListener("pointermove", onMove);
  C.addEventListener("pointerup", onUp);
  C.addEventListener("pointercancel", onUp);
  C.addEventListener("keydown", onKey);
  C.addEventListener("contextmenu", onCtx);

  // ratón por la página: caricias, sustos y curiosidad
  const onWin = (e) => {
    const [x, y] = toLayer(e), t = now();
    if (S.ptr) {
      const dt = Math.max(1, t - S.ptrT) / 1000, d = Math.hypot(x - S.ptr[0], y - S.ptr[1]);
      S.speed = dt > 0.12 ? 0 : S.speed * 0.6 + (d / dt) * 0.4;
      const cy = S.y - px() * 0.42, near = Math.hypot(x - S.x, y - cy), over = near < px() * 0.4;
      if (over && !E.down) {
        S.pet += d;
        if (S.pet > 700 && !E.busy && S.mode === "rest" && t > (S.cool.pet || 0)) {
          S.pet = 0; S.cool.pet = t + 6000;
          if (S.mood === "sleep") rouse();
          E.feel("joy", 0.5);
          run(B.pet);
        }
      } else if (!over && S.speed > 2600 && near < px() * 1.3 && S.mode === "rest" && t > (S.cool.startle || 0) && S.mood !== "sleep" && !S.chatting) {
        S.cool.startle = t + 8000; run(B.startle);
      }
    }
    S.ptr = [x, y]; S.ptrT = t; S.lastAct = t;
  };
  window.addEventListener("pointermove", onWin, { passive: true });

  // cosas de la página que mira y comenta (solo en la página, no en la vista previa)
  const POI = "nav.apps a, [data-mod]";
  const nameOf = (el) => (el.getAttribute("aria-label") || el.title || el.textContent || "").trim().split("\n")[0].slice(0, 30);
  const onOver = (e) => {
    const a = e.target.closest?.(POI);
    if (!a || a === S.poi || L.contains(a)) return;
    S.poi = a; clearTimeout(timers.hover);
    const mod = a.dataset.mod;
    timers.hover = setTimeout(() => {
      const t = now();
      if (S.poi !== a || !st().comments || S.mode !== "rest" || S.mood === "sleep" || S.chatting || E.down) return;
      if (mod) {
        // widget: siempre comenta algo, sin repetirse demasiado
        if (t < (S.cool.widget || 0) || t < (S.cool["w:" + mod] || 0)) return;
        S.cool.widget = t + 12000; S.cool["w:" + mod] = t + 45000;
        run(() => B.widget(a));
      } else {
        const n = nameOf(a);
        if (n && !E.busy && t > (S.cool.link || 0) && Math.random() < (st().chatter === "high" ? 0.6 : 0.3)) { S.cool.link = t + 30000; say(LINES.link(n), 2600); }
      }
    }, mod ? 1200 : 900);
  };
  const onOut = (e) => { if (S.poi && e.target.closest?.(POI) === S.poi && !S.poi.contains(e.relatedTarget)) { S.poi = null; clearTimeout(timers.hover); } };
  const onFocus = (e) => {
    if (!e.target.closest?.(".search")) return;
    S.poi = e.target;
    const t = now();
    if (st().comments && t > (S.cool.search || 0) && Math.random() < 0.5) { S.cool.search = t + 90000; say(line("search"), 2200); }
  };
  const onBlur = (e) => { if (S.poi === e.target) S.poi = null; };
  const onInput = (e) => { if (e.target.closest?.(".search")) S.reading = now(); };
  const onVis = () => {
    if (document.hidden) S.hiddenAt = Date.now();
    else if (S.hiddenAt && Date.now() - S.hiddenAt > 300000 && S.mood !== "sleep") run(B.back);
  };
  if (page) {
    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerout", onOut);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onBlur);
    document.addEventListener("input", onInput);
    document.addEventListener("visibilitychange", onVis);
  }
  const ro = new ResizeObserver(() => {
    E.W = L.clientWidth; E.H = L.clientHeight;
    S.x = clamp(S.x, marg(), E.W - marg());
    if (!S.on && S.mode === "rest") S.y = floor();
    if (st().roam === "off" && S.mode === "rest" && !E.busy && !S.on) S.x = home();
    E.platsAt = 0;
  });
  ro.observe(L);

  return () => {
    ro.disconnect();
    C.removeEventListener("pointerdown", onDown); C.removeEventListener("pointermove", onMove);
    C.removeEventListener("pointerup", onUp); C.removeEventListener("pointercancel", onUp); C.removeEventListener("keydown", onKey); C.removeEventListener("contextmenu", onCtx);
    window.removeEventListener("pointermove", onWin);
    if (page) {
      document.removeEventListener("pointerover", onOver); document.removeEventListener("pointerout", onOut);
      document.removeEventListener("focusin", onFocus); document.removeEventListener("focusout", onBlur);
      document.removeEventListener("input", onInput); document.removeEventListener("visibilitychange", onVis);
    }
  };
}
