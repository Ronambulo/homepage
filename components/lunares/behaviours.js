// Kero: comportamientos (guiones asíncronos) y la elección de qué hacer cuando está libre.
import { pick, thought, widgetLine, LINES, skyFx } from "@/lib/lunares";
import { rnd, clamp, lin } from "./util";

export function makeBehaviours(E) {
  const { S, F, st, now, px, page, reduceQ, wait, tween, guard, say, ponder, hush, line, hop, walkTo, spot, save, bump, setExpr, chance, floor, marg, home } = E;
  // estos vienen de talk.js (se asignan después): se llaman a través de E
  const useAI = (p) => E.useAI(p), aiOn = () => E.aiOn(), askAI = (...a) => E.askAI(...a), sayAI = (...a) => E.sayAI(...a);

  const B = {
    async hello() {
      S.pop = 0; S.popv = 0;
      await wait(250);
      if (F().alerts?.length && st().reacts && now() - S.alertSaid > 15 * 60000) return B.alert();
      setExpr("happy"); await hop(S.x, S.y, 24, 360);
      // «¡cuánto tiempo!», «¿qué haces por aquí a estas horas?»… o el saludo de siempre
      const g = E.greet?.();
      if (g) setExpr(g.face);
      if (st().chatter !== "off") await wait(say(g ? g.text : line("hello"), g ? 6000 : undefined) * 0.6);
      setExpr("idle"); await wait(400);
      // recordatorios que vencieron con la página cerrada
      await E.missed?.();
      // la primera visita del día: agenda, tiempo, recordatorios y pendientes
      await E.daily?.();
      // cumpleaños, fiestas, viernes por la tarde…
      await E.special?.();
    },
    async back() { setExpr("surprised"); await hop(S.x, S.y, 20, 320); setExpr("happy"); await wait(say(line("back")) * 0.6); },
    async look() {
      for (let i = 0, n = rnd(2, 4); i < n; i++) { S.lookO = [rnd(-1, 1), rnd(-0.7, 0.5)]; S.bias = S.lookO[0] * 5; await wait(rnd(700, 1400)); }
    },
    async think() {
      setExpr("think");
      if (!ponder()) return wait(1500);
      S.bias = 4;
      let r = null;
      // un solo widget al azar de los que tienen datos: le da tema concreto y poco que leer
      const W = F().w || {}, ids = ["fm", "svc", "wx", "todo", "srv", "cal", "gh", "dp", "ha", "im"].filter((k) => W[k] && W[k].ok !== false && !W[k].state);
      if (useAI(0.6)) r = await guard(askAI([{ role: "user", content: pick(["Di un pensamiento corto y gracioso sobre estos datos.", "Coméntame algo curioso de estos datos.", "Dame un consejo breve según estos datos."]) }], null, ids.length ? pick(ids) : null));
      else await wait(rnd(1400, 2500));
      S.bias = 0;
      if (r?.text && (await sayAI(r.text))) return;
      setExpr(Math.random() < 0.5 ? "idle" : "proud"); S.qv += 2;
      // un aviso ya dado no se repite en cada frase: se recuerda como mucho cada 15 min
      const f = F(), quiet = now() - S.alertSaid < 15 * 60000;
      const t = thought({ ...f, alerts: quiet ? [] : f.alerts, ai: st().ai }, st().name);
      if (!quiet && f.alerts?.length && t.includes(f.alerts[0].slice(1))) S.alertSaid = now();
      await wait(say(t) * 0.8);
    },
    async wander() {
      const [x, y, el] = spot();
      await walkTo(x, y, el); save();
      if (el && chance(0.25)) say(el.matches(".time") ? line("clock") : el.matches("button") ? line("button") : line("perch"));
      setExpr(pick([null, "happy", "idle"])); await wait(500);
    },
    async spin() {
      setExpr("happy"); S.qT = -0.25; await wait(160); S.qT = 0; S.qv += 4;
      const y0 = S.y, dir = Math.random() < 0.5 ? -1 : 1; S.spin = true;
      await tween(640, (u) => { S.y = y0 - 58 * 4 * u * (1 - u); S.rot = dir * 360 * u; }, lin);
      S.spin = false; S.rot = 0; S.qv -= 4.5; setExpr("proud"); bump(S.on, 500);
      if (chance(0.3)) say(pick(["¡Tachán!", "Diez de diez.", "¿Lo has visto?"]));
      await wait(1200);
    },
    async melt() {
      setExpr("sleep"); S.qT = -0.38;
      if (chance(0.4)) say(pick(["Me derrito…", "Modo charco.", "Plof."]));
      await wait(rnd(1400, 2200));
      setExpr("surprised"); S.qT = 0; S.qv += 4; await wait(700); setExpr("happy"); await wait(600);
    },
    async dance(quiet) {
      setExpr("happy"); if (!quiet && chance(0.6)) say("♪ ♫ ♪", 3000);
      for (let i = 0; i < 6; i++) { S.bias = i % 2 ? 11 : -11; await hop(S.x + (i % 2 ? 6 : -6), S.y, 9, 240); }
      S.bias = 0; setExpr("proud"); await wait(700);
    },
    async jiggle() { setExpr("love"); for (let i = 0; i < 6; i++) { S.qv += i % 2 ? 2.6 : -2.6; await wait(95); } await wait(700); },
    async wink() { setExpr("wink"); S.bias = -5; if (chance(0.3)) say(pick(["Tú y yo sabemos cosas.", "Psst."])); await wait(1100); },
    async stare() { setExpr("sus"); S.lookO = null; S.bias = 3; if (chance(0.3)) say(pick(["Te estoy vigilando.", "Hmm…"])); await wait(2000); },
    async yawn() { setExpr("yawn"); S.qT = 0.16; S.bias = -3; await wait(1500); S.qT = 0; setExpr("sleep"); await wait(500); setExpr("idle"); await wait(300); },
    async peek() {
      if (S.on) return B.wander();
      const right = S.x > E.W / 2, x0 = right ? E.W - marg() : marg();
      await walkTo(x0, floor());
      const hide = right ? E.W + px() * 0.12 : -px() * 0.12, xa = S.x;
      S.bias = right ? 8 : -8;
      await tween(700, (u) => { S.x = xa + (hide - xa) * u; });
      setExpr("sus"); S.lookO = [right ? -1 : 1, 0]; S.bias = right ? -6 : 6;
      await wait(1300); if (chance(0.5)) say(pick(["¿Hola?", "¿Hay alguien?", "Cucú."])); await wait(1400);
      setExpr("happy"); S.bias = 0;
      await tween(500, (u) => { S.x = hide + (xa - hide) * u; });
      await hop(S.x, S.y, 18, 320); save();
    },
    async nap() { setExpr("yawn"); say(pick(["Me echo una siesta…", "Cinco minutitos…"]), 2500); await wait(1400); S.napUntil = now() + rnd(3, 8) * 60000; },
    async bored() { setExpr("annoyed"); say(line("bored")); await wait(1800); },

    /* gestos sueltos */
    // estirarse: alto y fino, se inclina a un lado y al otro, y se suelta
    async stretch() {
      setExpr("drowsy"); S.qT = 0.22; await wait(500);
      setExpr("happy"); S.bias = -9; await wait(450); S.bias = 9; await wait(450);
      S.bias = 0; S.qT = -0.12; await wait(260); S.qT = 0; S.qv += 2;
      if (chance(0.2)) say(pick(["Aaah, mucho mejor.", "Crujido de gota."]));
      await wait(600);
    },
    // estornudo: coge aire… ¡achís! (se sacude y retrocede un poco)
    async sneeze() {
      setExpr("surprised"); S.qT = 0.1; S.lookO = [0, -0.6]; await wait(450);
      S.qT = 0.18; await wait(380);
      setExpr("sneeze"); S.qT = -0.22; S.qv -= 4; S.bias = -7; S.lookO = null;
      if (chance(0.6)) say("¡Achís!", 1800);
      if (!reduceQ.matches) await hop(clamp(S.x - (S.lean >= 0 ? 10 : -10), marg(), E.W - marg()), S.y, 8, 220);
      S.qT = 0; S.bias = 0;
      setExpr("annoyed"); await wait(700);
      if (chance(0.25)) say(pick(["Perdón.", "Será el polvo de los widgets."]));
      setExpr("happy"); await wait(500);
    },
    // tararear: se balancea con los ojos cerrados
    async hum() {
      setExpr("hum");
      if (chance(0.5)) say(pick(["♪ mm-mm-mmm ♪", "♪ la-ra-la ♪", "♪ tururú ♪"]), 3200);
      await tween(2600, (u) => { S.bias = 6 * Math.sin(u * Math.PI * 4); S.qT = 0.03 * Math.sin(u * Math.PI * 8); }, lin);
      S.bias = 0; S.qT = 0; setExpr("happy"); await wait(400);
    },
    // botes de alegría, cada uno más bajo
    async bounce() {
      setExpr("happy");
      for (const h of [30, 20, 12]) await hop(S.x, S.y, h, 260 + h * 3);
      setExpr("proud"); await wait(600);
    },
    // suspiro: se hincha, se desinfla y se queda un poco chafado
    // fiesta: estrellitas alrededor y saltos de alegría (cumpleaños, Navidad, año nuevo…)
    async party() {
      setExpr("love"); E.set.party(Date.now()); S.qv += 3;
      await hop(S.x, S.y, 30, 380);
      for (let i = 0; i < 4; i++) { S.bias = i % 2 ? 9 : -9; await hop(S.x + (i % 2 ? 5 : -5), S.y, 12, 260); }
      S.bias = 0; E.set.party(Date.now()); setExpr("happy"); await wait(900);
    },
    async sigh(quiet) {
      setExpr("sigh"); S.qT = 0.12; await wait(700);
      S.qT = -0.14; S.bias = -3; if (!quiet && chance(0.3)) say(pick(["Ay…", "Hmmf.", "En fin."]), 2200);
      await wait(1100); S.qT = 0; S.bias = 0; setExpr("meh"); await wait(700);
    },
    // asentir: mira hacia ti y dice que sí con la cabeza
    async nod() {
      setExpr("happy");
      for (let i = 0; i < 3; i++) { S.lookO = [0, 0.7]; S.qT = -0.09; await wait(170); S.lookO = [0, -0.2]; S.qT = 0.03; await wait(170); }
      S.lookO = null; S.qT = 0; await wait(400);
    },

    // el tiempo en su cuerpo: sol, nubes, lluvia, tormenta, nieve, frío o calor (al pasar por el widget del tiempo)
    async weather() {
      const k = skyFx(F().weather, new Date().getHours());
      if (!k) return false;
      const shiver = async (n, a) => { for (let i = 0; i < n; i++) { S.bias = i % 2 ? a : -a; S.qv += i % 2 ? 0.8 : -0.8; await wait(55); } S.bias = 0; };
      E.set.sky({ k, n: Date.now() });
      if (k === "sun") {
        setExpr("happy"); S.lookO = [0, -0.6]; S.qT = 0.06; await wait(500);
        await hop(S.x, S.y, 12, 300); S.qT = 0; await wait(1500); setExpr("chuffed"); await wait(500);
      } else if (k === "night") {
        setExpr("love"); S.lookO = [0.5, -0.8]; await wait(1400); S.lookO = [-0.6, -0.7]; await wait(1300);
      } else if (k === "cloud") {
        S.lookO = [-0.8, -0.8]; setExpr("idle"); await wait(1000); S.lookO = [0, -1]; setExpr("meh"); await wait(900); S.lookO = [0.8, -0.8]; await wait(900);
      } else if (k === "rain") {
        setExpr("worried"); S.lookO = [0, -0.8]; await wait(400); S.qT = -0.14; S.qv -= 2; await wait(2200); S.qT = 0;
      } else if (k === "storm") {
        setExpr("worried"); S.qT = -0.1; await wait(650);
        setExpr("scared"); S.qT = 0.12; S.qv += 5; await hop(S.x, S.y, 18, 260); S.qT = -0.14; await shiver(10, 5); await wait(1000); S.qT = 0;
      } else if (k === "snow") {
        setExpr("surprised"); S.lookO = [0, -0.8]; await wait(800); setExpr("happy"); await wait(600); S.qT = -0.06; await shiver(14, 3); S.qT = 0; await wait(500);
      } else if (k === "cold") {
        setExpr("grumpy"); S.qT = -0.1; await shiver(30, 4); S.qT = 0; await wait(700);
      } else if (k === "hot") {
        setExpr("drowsy"); await wait(600); S.qT = -0.32; setExpr("sleep"); await wait(1700); S.qT = 0; S.qv += 3; setExpr("meh"); await wait(500);
      }
      S.lookO = null;
      await wait(300);
      E.set.sky(null);
      return true;
    },
    // comenta un widget (al dejar el ratón encima o al caer sobre él)
    async widget(el) {
      const id = el.dataset.mod, card = el.querySelector(".gc") || el;
      const al = F().w?.alert?.[id];
      S.poi = el;
      // en modo libre, a veces se sube encima para verlo de cerca
      const top = page && st().roam === "free" && S.on !== card && Math.random() < 0.35 && E.plats.find((p) => p.el === card);
      if (top) await walkTo(clamp(S.x, top.l + px() * 0.4, top.r - px() * 0.4), top.top, card);
      if (id === "wx" && (await B.weather())) await wait(200);
      setExpr("think"); S.bias = 3;
      const local = widgetLine(id, F());
      if ((local ? useAI(0.6) : aiOn()) && ponder()) {
        const label = (card.querySelector(".label")?.textContent || id).trim();
        const txt = card.innerText.replace(/\s+/g, " ").slice(0, 500);
        const r = await guard(askAI([{ role: "user", content: `Estoy mirando mi widget «${label}». Coméntame algo útil o gracioso de lo que muestra, en una frase.` }], `Texto visible del widget «${label}»: ${txt}`, id));
        S.bias = 0;
        if (r?.text && (await sayAI(r.text))) return;
      } else await wait(rnd(400, 800));
      S.bias = 0;
      if (!local) { hush(); return; }
      setExpr(al ? "worried" : pick(["idle", "happy", "proud"])); S.qv += 2;
      await wait(say(local) * 0.85);
    },
    // reacciones
    async tickle() { setExpr("happy"); if (chance(0.5)) say(line("tickle")); for (let i = 0; i < 5; i++) { S.qv += i % 2 ? 2.4 : -2.4; S.bias = i % 2 ? 6 : -6; await wait(90); } S.bias = 0; await wait(900); },
    async surprised() { setExpr("surprised"); S.qv += 4; await hop(S.x, S.y, 16, 280); await wait(900); },
    async dizzy() {
      setExpr("dizzy"); say(line("dizzy"));
      await tween(2200, (u) => { S.bias = 14 * Math.sin(u * Math.PI * 7) * (1 - u); S.lookO = [Math.cos(u * 20), Math.sin(u * 20) * 0.6]; }, lin);
      await wait(500);
    },
    async pet() { setExpr("love"); if (chance(0.5)) say(line("pet")); S.qT = -0.07; await wait(1800); S.qT = 0; setExpr("happy"); await wait(500); },
    async startle() {
      setExpr("scared"); if (chance(0.4)) say(line("startle"));
      const away = S.ptr && S.ptr[0] > S.x ? -1 : 1;
      await hop(clamp(S.x + away * 34, marg(), E.W - marg()), S.y, 20, 300);
      await wait(1000);
    },
    async wake() { setExpr("surprised"); S.qT = 0.12; await wait(500); S.qT = 0; setExpr("annoyed"); S.qv += 3; say(line("wake")); await wait(1800); setExpr("idle"); },
    async alert() {
      const a = F().alerts?.[0] || (S.demoUntil > now() ? "Algo no va bien (es una prueba)" : null);
      setExpr("scared"); await hop(S.x, S.y, 26, 340); await hop(S.x, S.y, 18, 300);
      setExpr("worried");
      if (a) { S.alertSaid = now(); await wait(say(pick(["¡Ojo! ", "¡Eh! ", "Oye: "]) + a.charAt(0).toLowerCase() + a.slice(1) + ".", 8000) * 0.7); }
    },
    // un aviso útil o un recordatorio: salta para llamar la atención y lo dice (la burbuja se queda un buen rato)
    async notice(text, face = "surprised", ms = 15000, acts) {
      setExpr(face === "worried" ? "worried" : "surprised"); await hop(S.x, S.y, 24, 330);
      setExpr(face); S.qv += 2;
      await wait(say(text, ms, true, false, undefined, acts) * 0.6);
    },
    // caída desde muy arriba: se queda espachurrado un momento y se recompone
    // impacto → charco (ojos en espiral, estrellitas) → despegarse → sacudirse → listo. Las gotas y el charco los pinta loop.js
    async splat(el) {
      S.splatT = 1; setExpr("dizzy"); if (el) bump(el, 1400);
      S.fx = { t0: now() };
      await wait(450);
      if (gripe(0.35)) say(line("splat"));
      await wait(1350);
      setExpr("surprised"); S.splatT = 0; S.splatv -= 3; S.qT = 0.16;
      S.lookO = [-0.8, 0]; await wait(220); S.lookO = [0.8, 0]; await wait(230); S.lookO = null;
      S.qT = 0; S.qv -= 2; setExpr("squeeze"); S.spin = true;
      await tween(400, (u) => { S.rot = 9 * Math.sin(u * Math.PI * 5) * (1 - u); }, lin);
      S.spin = false; S.rot = 0; setExpr("chuffed");
      await wait(900);
      S.fx = null;
      return B.landed(false, el, true);
    },
    async landed(hard, el, quiet) {
      const mod = el?.closest?.("[data-mod]");
      if (!quiet) {
        setExpr(hard ? "dizzy" : "surprised");
        if (el?.matches(".time") && chance(0.6)) say(line("clock"));
        else if (el?.matches("button") && chance(0.5)) say(line("button"));
        else if (!mod && gripe(0.15)) say(line("drop"));
        await wait(hard ? 1500 : 900);
      }
      setExpr("idle");
      if (mod && st().comments && chance(0.5)) { await wait(300); return B.widget(mod); }
      if (st().roam === "off" && (S.on || Math.abs(S.x - home()) > 10)) { await wait(500); await walkTo(home(), floor()); }
      save();
    },
    async home() { await walkTo(home(), floor()); },
    // quedarse dormido: le entra sueño → bostezo → se acurruca. Luego loop.js lo deja hecho una bola respirando
    async doze() {
      setExpr("drowsy"); S.bias = -2; await wait(1200);
      setExpr("yawn"); S.qT = 0.18; S.bias = -4; await wait(1400);
      setExpr("sleep"); S.qT = -0.06; S.bias = -6; S.qv -= 1.5; await wait(1000);
      S.qT = 0; S.bias = 0; setExpr(null);
    },
    // se despierta solo (por la mañana o al acabar la siesta)
    async rise(why) {
      setExpr("surprised"); S.qT = 0.12; await wait(600);
      setExpr("yawn"); S.qT = 0.16; S.bias = -3; await wait(1500); S.qT = 0; S.bias = 0;
      setExpr("happy"); await hop(S.x, S.y, 18, 320);
      await wait(say(line(why === "night" ? "morning" : "awake")) * 0.7);
    },
  };
  // que lo muevas de sitio no le molesta tanto: comenta poco y nunca dos veces seguidas en unos minutos
  function gripe(p) {
    if (now() - S.movedSaid < 4 * 60000 || !chance(p)) return false;
    S.movedSaid = now(); return true;
  }
  const goofs = ["spin", "melt", "dance", "jiggle", "wink", "stare", "peek", "sneeze", "bounce", "hum"];

  // qué hacer: pesos según los ajustes, la hora y el ánimo; lo que ha hecho hace poco pesa menos
  function choose() {
    const p = st(), e = p.energy / 100, red = reduceQ.matches, idle = now() - S.lastAct;
    const w = [
      ["look", 3],
      ["think", p.chatter === "off" ? 0 : p.chatter === "low" ? 1.2 : 3],
      // subido a algo fuera del modo libre: acaba bajándose
      ["wander", red ? 0 : S.on && p.roam !== "free" ? 3 : p.roam === "off" ? 0 : 1 + e * 2.5],
      ["yawn", 0.4 + (1 - e) + ([21, 14].includes(new Date().getHours()) ? 1 : 0)],
      ["nap", idle > 180000 ? 1.2 * (1 - e) + 0.2 : 0],
      ["bored", idle > 120000 && p.chatter !== "off" ? 0.5 : 0],
      ["stretch", 0.35 + (1 - e) * 0.4],
      ["sigh", idle > 60000 ? 0.4 : 0.1],
      ["nod", 0.3],
    ];
    if (p.goofy && !red) {
      const g = 0.3 + e * 0.7;
      w.push(["spin", 0.5 * g], ["melt", 0.5 * g], ["dance", 0.4 * g], ["jiggle", 0.6 * g], ["wink", 0.5], ["stare", 0.4], ["peek", p.roam === "off" || S.on ? 0 : 0.5 * g],
        ["sneeze", 0.2], ["hum", 0.45 * g], ["bounce", 0.4 * g]);
    }
    const mw = S.moodW || {};
    for (const r of w) {
      if (mw[r[0]] != null) r[1] *= mw[r[0]];
      if (S.recent.includes(r[0])) r[1] *= 0.25; // no repetir lo mismo una y otra vez
    }
    let r = Math.random() * w.reduce((a, [, v]) => a + v, 0), k = "look";
    for (const [n, v] of w) if ((r -= v) <= 0) { k = n; break; }
    S.recent = [k, ...S.recent.filter((x) => x !== k)].slice(0, 4);
    return k;
  }

  return { B, gripe, goofs, choose };
}
