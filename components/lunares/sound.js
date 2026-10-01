// Kero: el «tilín» de los avisos, sintetizado con WebAudio (sin archivos de sonido).
// El navegador solo deja sonar si ya has tocado la página alguna vez: se intenta arrancar el audio al momento
// y, si no se puede, suena en cuanto hagas clic o pulses una tecla.

let ctx = null, pending = null, armed = false;

const NOTES = {
  remind: [[784, 0], [1047, 0.16], [1319, 0.32]], // sol-do-mi, subiendo
  timer: [[1047, 0], [1047, 0.22], [1047, 0.44], [1319, 0.66]], // pip-pip-pip-piiii
};

function getCtx() {
  if (!ctx) {
    const A = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
    if (A) ctx = new A();
  }
  return ctx;
}

function play(kind) {
  const t0 = ctx.currentTime + 0.03;
  const out = ctx.createGain();
  out.gain.value = 0.3;
  out.connect(ctx.destination);
  for (const [f, at] of NOTES[kind] || NOTES.remind) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "triangle"; o.frequency.value = f;
    g.gain.value = 0;
    g.gain.setValueAtTime(0, t0 + at);
    g.gain.linearRampToValueAtTime(1, t0 + at + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + at + 0.5);
    o.connect(g); g.connect(out);
    o.start(t0 + at); o.stop(t0 + at + 0.55);
  }
}

// arranca el audio (si el navegador lo permite) y suena lo pendiente
function start() {
  const c = getCtx();
  if (!c) return Promise.resolve(false);
  const go = () => { if (c.state !== "running") { console.info("[Kero] el navegador aún no deja sonar (audio " + c.state + "); sonará con el próximo clic"); return false; } if (pending) { const k = pending; pending = null; play(k); } return true; };
  if (c.state === "running") return Promise.resolve(go());
  return c.resume().then(go, () => false);
}

// se llama al arrancar: el primer gesto en la página desbloquea el audio
export function armSound() {
  if (armed || typeof window === "undefined") return;
  armed = true;
  const on = () => start().then((ok) => { if (ok) ["pointerdown", "click", "keydown", "touchend"].forEach((e) => window.removeEventListener(e, on, true)); });
  ["pointerdown", "click", "keydown", "touchend"].forEach((e) => window.addEventListener(e, on, true));
}

// kind: "remind" | "timer"
export function chime(kind = "remind") {
  try {
    pending = kind;
    armSound();
    start().catch(() => {}); // si aún no se puede, se queda pendiente hasta el próximo clic o tecla
  } catch {}
}
