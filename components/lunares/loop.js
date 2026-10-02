// Kero: un fotograma. Horario de sueño, alertas, física, muelles, cuerpo, ojos, boca y burbujas.
import { shapeAt, toPath, EXPR, FLOOR, sleepy, dream } from "@/lib/lunares";
import { rnd, clamp, io } from "./util";

const BASE = (FLOOR - 14) / 92; // de la parte de arriba de la caja a la base del cuerpo (viewBox 14 14 92 92)
const TOP = (22 - 14) / 92; // hasta la coronilla
// espachurrado: gotas que salen volando [x0, vx, vy, r] y gravedad (unidades del SVG)
const DROPS = [[48, -80, 190, 2.4], [72, 90, 200, 2], [44, -50, 240, 1.5], [76, 60, 220, 1.7]], G = 900;

const ZZZ = ["zzz…", "Zzz…", "zzz… zzz…", "mmm… zzz…"];

export function makeFrame(E) {
  const { S, L, C, refs, set, reduceQ, now, F, st, page, px, pend, tweens, run, cancel, say, line, setExpr, rectOf, scan, bump, drop, floor, marg } = E;
  const B = E.B;
  const born = now();
  let last = now();

  // espachurrado: charco, gotas que salen y vuelven, estrellitas y un destello al final (tiempos en s desde el impacto)
  const FX = refs.fx.current, fxq = (k) => [...FX.querySelectorAll(`[data-k="${k}"]`)];
  const [pud] = fxq("pud"), spir = fxq("sp"), stars = fxq("star"), drops = fxq("drop"), [spark] = fxq("spark");
  const vis = (el, on, o = 1) => { el.style.opacity = on ? o : 0; };
  function paintFx(t, red) {
    const a = S.fx ? (t - S.fx.t0) / 1000 : -1;
    FX.style.display = a < 0 ? "none" : "";
    refs.grp.current.style.opacity = a > 0.08 && a < 1.8 ? 0 : 1;
    if (a < 0) return;
    // charco
    if (a < 0.08 || a > 2.25) vis(pud, false);
    else {
      let sx = 1, sy = 1;
      if (a < 1.8) sx = red ? 1 : 1 + 0.1 * Math.sin((a - 0.08) * 18) * Math.exp(-(a - 0.08) * 6);
      else { const k = io((a - 1.8) / 0.45); sx = 1 - 0.5 * k; sy = (1 - k) * (1 - k) * 0.4; }
      vis(pud, true); pud.setAttribute("transform", `translate(60 96) scale(${sx.toFixed(3)} ${sy.toFixed(3)}) translate(-60 -96)`);
      spir.forEach((s, i) => { vis(s, a < 1.8); s.setAttribute("transform", `translate(${i ? 70.5 : 49.5} 89.5) scale(1 .8) rotate(${((red ? 0 : a * 140) * (i ? 1 : -1)).toFixed(1)})`); });
    }
    // estrellitas dando vueltas
    stars.forEach((s, i) => {
      const on = !red && a > 0.25 && a < 1.8, th = a * 2.4 + (i * 2 * Math.PI) / 3;
      vis(s, on, clamp(Math.min(a - 0.25, 1.8 - a) * 6, 0, 1));
      if (on) s.setAttribute("transform", `translate(${(60 + 24 * Math.cos(th)).toFixed(2)} ${(72 + 6 * Math.sin(th)).toFixed(2)}) scale(${(0.75 + 0.25 * Math.sin(th)).toFixed(2)})`);
    });
    // gotas: salen volando, esperan en el suelo, vuelven rodando; al sacudirse saltan dos
    drops.forEach((d, i) => {
      const [x0, vx, vy, r] = DROPS[i], gy = 96 - r, T = (vy + Math.sqrt(vy * vy + 2 * G * (gy - 92))) / G, xl = x0 + vx * T;
      let x, y, o = 1;
      if (red || a > 2.65 || (a > 2.25 && i > 1)) o = 0;
      else if (a > 2.25) { const k = (a - 2.25) / 0.4, sd = i ? 1 : -1; x = 60 + sd * (26 + 30 * k); y = 58 - 40 * k + 50 * k * k; o = 1 - k; }
      else if (a > 1.8) { const k = io((a - 1.8) / 0.45); x = xl + (60 + Math.sign(vx) * 12 - xl) * k; y = gy; o = 1 - k; }
      else if (a < T) { x = x0 + vx * a; y = 92 - vy * a + (G * a * a) / 2; }
      else { x = xl; y = gy; }
      vis(d, o > 0, o);
      if (o > 0) { d.setAttribute("cx", x.toFixed(2)); d.setAttribute("cy", y.toFixed(2)); d.setAttribute("r", r); }
    });
    // destello final
    const k = (a - 2.65) / 0.85;
    vis(spark, !red && k > 0 && k < 1);
    if (k > 0 && k < 1) spark.setAttribute("transform", `translate(92 30) rotate(${(k * 90).toFixed(1)}) scale(${(Math.sin(k * Math.PI) * 1.3).toFixed(3)})`);
  }

  return function frame() {
    const t = now(), dt = Math.min(0.05, (t - last) / 1000); last = t;
    const p = st(), red = reduceQ.matches, f = F();
    const pxs = px(), W = E.W, H = E.H;
    if (page && t - E.platsAt > 250) { E.platsAt = t; scan(); }

    // estado de fondo
    const alert = (p.reacts && f.alerts?.length > 0) || S.demoUntil > t;
    // horario: duerme de 22 a 9 y algunos días se echa la siesta entre las 15 y las 17
    if (t > (S.sleepAt || 0)) { S.sleepAt = t + 5000; S.sleepWhy = p.sleep && page ? sleepy() : null; }
    const night = S.sleepWhy && t > S.awakeUntil;
    const m = alert ? "alert" : S.napUntil > t || night ? "sleep" : "ok";
    if (m !== S.mood && !S.answering) { // no se duerme ni se alarma a media respuesta
      const was = S.mood, settled = t - born > 4000;
      S.mood = m; set.mood(m);
      E.trace?.ev("sleep", { to: m, from: was, why: m === "sleep" ? (S.napUntil > t ? "nap" : S.sleepWhy) : null }, null);
      if (m === "sleep") {
        cancel(); E.tok++; E.busy = false; setExpr(null); set.bubble(null); E.closeChat();
        S.slept = S.napUntil > t ? "nap" : S.sleepWhy;
        S.zzzAt = t + rnd(15000, 30000);
        if (settled && S.slept !== "nap") say(line(S.slept === "night" ? "night" : "siesta"), 3500);
        if (settled && S.mode === "rest") run(B.doze, true);
      } else if (was === "sleep") {
        // se despierta: la pompa explota y da un respingo
        set.burst(t); S.popv += 2.5; S.qv += 3;
        if (settled && t > S.awakeUntil && S.mode === "rest") run(() => B.rise(S.slept));
      }
    }

    // alertas nuevas
    const key = p.reacts ? (f.alerts || []).join("|") : "";
    if (S.alertKey === null) S.alertKey = key;
    else if (key !== S.alertKey && !S.answering) { S.alertKey = key; if (key && S.mode === "rest") run(B.alert); }

    // cambios de ajustes
    const sig = p.roam + p.side + p.size;
    if (S.prev && S.prev !== sig && S.mode === "rest" && p.roam === "off") run(B.home);
    S.prev = sig;

    // tweens de los guiones
    for (const o of tweens) {
      const u = clamp((t - o.t0) / o.ms, 0, 1);
      o.fn(o.ease(u));
      if (u >= 1) { tweens.delete(o); pend.delete(o); o.res(); }
    }

    // apoyo: sigue a la plataforma si se mueve; si desaparece o se sale del borde, cae
    if (S.mode === "rest") {
      if (S.on) {
        const r = rectOf(S.on);
        if (!r) { if (!tweens.size) drop(); }
        else {
          if (S.onL != null && !tweens.size) S.x += r.l - S.onL;
          S.onL = r.l;
          if (!tweens.size) {
            if (S.x < r.l - 2 || S.x > r.r + 2 || S.x < marg() - 4 || S.x > W - marg() + 4 || r.top < pxs * 0.6 || r.top > floor()) drop();
            else S.y = r.top;
          }
        }
      } else if (!tweens.size && S.y < floor() - 2) drop();
    }

    // física
    const x0 = S.x, down = E.down;
    if (S.mode === "drag" && down?.t) {
      const k = 1 - Math.exp(-dt * 16);
      S.x += (down.t[0] - S.x) * k; S.y += (down.t[1] - S.y) * k;
      S.x = clamp(S.x, pxs * 0.3, W - pxs * 0.3); S.y = clamp(S.y, pxs * 0.9, H + pxs * 0.1);
      S.qT = 0.14;
    } else if (S.mode === "fall") {
      const py = S.y;
      if (S.fallTop == null) S.fallTop = S.y;
      S.vy += 2600 * dt; S.x += S.vx * dt; S.y += S.vy * dt;
      S.fallTop = Math.min(S.fallTop, S.y);
      if (S.x < marg()) { S.x = marg(); S.vx = Math.abs(S.vx) * 0.5; S.qv -= 1.5; }
      if (S.x > W - marg()) { S.x = W - marg(); S.vx = -Math.abs(S.vx) * 0.5; S.qv -= 1.5; }
      if (S.y < pxs) { S.y = pxs; S.vy = Math.abs(S.vy) * 0.3; }
      // ¿cruza el borde de arriba de algo? (plataformas de un solo sentido)
      let land = null;
      if (S.vy > 0) for (const q of E.plats) if (S.x > q.l + 4 && S.x < q.r - 4 && py <= q.top + 1 && S.y >= q.top && (!land || q.top < land.top)) land = q;
      const gy = land ? land.top : floor();
      if (S.y >= gy) {
        S.y = gy;
        const fell = gy - S.fallTop, el = land?.el || null;
        S.fallTop = gy;
        if (land) bump(land.el, S.vy);
        if (!red && fell > Math.max(260, H * 0.3) && S.vy > 1000) {
          // ¡plaf! desde muy arriba: se espachurra (y le sienta fatal)
          S.mode = "rest"; S.vy = 0; S.vx = 0; S.qT = 0; S.qv = 0; S.splatv = 9; S.on = el; S.onL = null; S.fallTop = null;
          E.feel("grump", 0.5);
          run(() => B.splat(el));
        } else if (S.vy > 500) { S.qv -= clamp(S.vy / 380, 0, 6); S.vy *= -0.32; S.vx *= 0.7; }
        else {
          const hard = Math.hypot(S.vx, S.vy) > 900 || S.qv < -4;
          S.mode = "rest"; S.vy = 0; S.vx = 0; S.qT = 0; S.qv -= 2.5; S.on = el; S.onL = null; S.fallTop = null;
          run(() => B.landed(hard, el));
        }
      }
    }
    S.svx = S.svx * 0.8 + ((S.x - x0) / Math.max(dt, 1e-3)) * 0.2;

    // muelles: aplastamiento e inclinación
    S.qv += (-220 * (S.q - S.qT) - 14 * S.qv) * dt; S.q = clamp(S.q + S.qv * dt, -0.45, 0.45);
    const leanT = clamp((S.mode === "drag" ? -1 : 1) * S.svx * 0.022, -16, 16) + S.bias;
    S.lv += (-120 * (S.lean - leanT) - 13 * S.lv) * dt; S.lean += S.lv * dt;
    S.popv += (-170 * (S.pop - 1) - 12 * S.popv) * dt; S.pop += S.popv * dt;
    S.splatv += (-240 * (S.splat - S.splatT) - 15 * S.splatv) * dt; S.splat = clamp(S.splat + S.splatv * dt, -0.25, 1.1);
    if (!S.spin) S.rot *= Math.exp(-dt * 10);

    // curiosidad: si dejas el ratón quieto cerca, se inclina hacia él
    let curious = 0;
    if (S.ptr && !E.busy && S.mode === "rest" && t - S.ptrT > 1200 && S.mood === "ok") {
      const dx = S.ptr[0] - S.x;
      if (Math.abs(dx) < 260 && Math.abs(S.ptr[1] - S.y) < 260) curious = Math.sign(dx) * 5;
    }
    if (!E.busy) S.bias += (curious - S.bias) * Math.min(1, dt * 3);

    // cuerpo
    const asleep = S.mood === "sleep";
    const speed = asleep ? 1 / 22 : alert ? 1 / 2.4 : 1 / (12 - 5 * p.energy / 100);
    S.phase += dt * speed * (red ? 0.5 : 1);
    const amp = red ? 0.45 : asleep ? 0.6 : 1;
    refs.body.current.setAttribute("d", toPath(shapeAt(S.phase, amp), clamp(p.round, 0, 100) / 100));
    // dormido: acurrucado (más ancho y bajo) y respirando hondo, al ritmo de la pompa (4,8 s)
    S.curl = (S.curl || 0) + ((asleep && !E.busy ? 1 : 0) - (S.curl || 0)) * Math.min(1, dt * 2.5);
    const br = Math.sin((t / 1000) * 2 * Math.PI / (asleep ? 4.8 : 3.8)) * (asleep ? 0.026 : 0.01);
    // en reposo, la cara depende del ánimo (S.face)
    const ex = EXPR[S.expr || (S.mood === "alert" ? "worried" : asleep ? "sleep" : S.face || "idle")] || EXPR.idle;
    const sh = ex.shiver && !red ? (Math.random() - 0.5) * 1.6 * ex.shiver : 0;
    const sy = (1 + S.q + br) * S.pop * (1 - 0.6 * S.splat) * (1 - 0.07 * S.curl), sx = (1 - 0.8 * S.q - br) * S.pop * (1 + 0.62 * S.splat) * (1 + 0.06 * S.curl);
    refs.grp.current.setAttribute("transform", `rotate(${S.rot.toFixed(2)} 60 62) translate(${(60 + sh).toFixed(2)} 96) rotate(${S.lean.toFixed(2)}) scale(${sx.toFixed(4)} ${sy.toFixed(4)}) translate(-60 -96)`);
    paintFx(t, red);

    // ojos
    let lt = [0, 0];
    const ec = [S.x, S.y - pxs * 0.42];
    const toward = (x, y, reach = 300) => { const dx = x - ec[0], dy = y - ec[1], d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / reach); return [(dx / d) * k, (dy / d) * k]; };
    const lr = L.getBoundingClientRect();
    if (ex.look) lt = ex.look;
    else if (S.lookO) lt = S.lookO;
    else if (S.poi && page && S.poi.isConnected) {
      const r = S.poi.getBoundingClientRect();
      lt = toward(r.left + r.width / 2 - lr.left, r.top + r.height / 2 - lr.top, 120);
      if (t - S.reading < 600) lt[0] += Math.sin(t / 90) * 0.35;
    } else if (p.follow && S.ptr) lt = toward(S.ptr[0], S.ptr[1]);
    else { if (!S.idleLook || t > S.idleLook.t) S.idleLook = { v: [rnd(-0.8, 0.8), rnd(-0.5, 0.4)], t: t + rnd(1500, 4000) }; lt = S.idleLook.v; }
    if (asleep) lt = [0, 0];
    const lk = 1 - Math.exp(-dt * 14);
    S.look[0] += (lt[0] - S.look[0]) * lk; S.look[1] += (lt[1] - S.look[1]) * lk;
    refs.eyes.current.setAttribute("transform", `translate(${(S.look[0] * 4.2).toFixed(2)} ${(S.look[1] * 3.2).toFixed(2)})`);

    // parpadeo (a veces doble)
    if (t > S.nextBlink && !asleep) { S.blink = 1; S.nextBlink = t + (Math.random() < 0.2 ? 260 : rnd(2200, 5600)); }
    S.blink = Math.max(0, S.blink - dt / 0.15);
    refs.lids.current.style.transform = `scaleY(${(1 - 0.9 * Math.sin(S.blink * Math.PI)).toFixed(3)})`;

    // boca al hablar
    const talking = t < S.talkUntil, tk = refs.talk.current;
    if (tk) {
      tk.setAttribute("ry", talking ? (0.8 + 3 * Math.abs(Math.sin(t / 55)) * (0.6 + 0.4 * Math.sin(t / 170))).toFixed(2) : "0");
      tk.style.opacity = talking ? 1 : 0;
    }

    // personaje y bocadillo
    C.style.width = C.style.height = pxs + "px";
    C.style.visibility = "";
    C.style.transform = `translate3d(${(S.x - pxs / 2).toFixed(1)}px, ${(S.y - pxs * BASE).toFixed(1)}px, 0)`;
    const bb = refs.bub.current;
    if (bb) {
      const bw = bb.offsetWidth, bh = bb.offsetHeight;
      const bx = clamp(S.x - bw / 2, 8, W - bw - 8);
      let by = S.y - pxs * (BASE - TOP) - bh - 12;
      if (by < 8) by = S.y + 10;
      bb.style.transform = `translate3d(${bx.toFixed(1)}px, ${by.toFixed(1)}px, 0)`;
      bb.style.setProperty("--tx", clamp(S.x - bx, 16, bw - 16).toFixed(0) + "px");
      // las burbujas anteriores de la misma respuesta, apiladas encima (o debajo si no caben);
      // si no caben todas, se cortan las más antiguas por arriba
      const sk = refs.stk.current;
      if (sk) {
        const up = by < S.y;
        sk.style.maxHeight = up ? Math.max(0, by - 14) + "px" : "";
        const sw = sk.offsetWidth, sh2 = sk.offsetHeight;
        const sx2 = clamp(S.x - sw / 2, 8, W - sw - 8), sy2 = up ? by - sh2 - 6 : by + bh + 6;
        sk.style.transform = `translate3d(${sx2.toFixed(1)}px, ${sy2.toFixed(1)}px, 0)`; sk.style.flexDirection = up ? "column" : "column-reverse";
      }
    }

    // ¿qué hago ahora?
    if (!E.busy && S.mode === "rest" && !asleep && !S.chatting && t > E.nextAt) run(B[E.choose()]);
    // dormido: de vez en cuando, una burbujita de «zzz…» (sin mover la boca)
    if (asleep && !E.busy && S.mode === "rest" && t > (S.zzzAt || 0)) {
      S.zzzAt = t + rnd(25000, 60000);
      // 1 de cada 3, un sueño («zzz… galletas…», «zzz… Plex… vuelve…»)
      const z = Math.random() < 1 / 3 ? dream(F()) : ZZZ[Math.floor(Math.random() * ZZZ.length)];
      if (say(z, z.length > 12 ? 3400 : 2600)) S.talkUntil = 0;
    }
  };
}
