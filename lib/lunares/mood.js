// Kero: estado de ánimo de fondo. Cambia la cara en reposo, lo que le apetece hacer y cómo habla.
// Sale de lo que pasa en la página (avisos, servicios) y de cómo lo tratas (caricias, zarandeos, abandono).

export const MOODS = {
  agobiado: { face: "worried", w: { think: 1.5, look: 1.5, sigh: 2, dance: 0, hum: 0, bounce: 0, spin: 0.3 } },
  "gruñón": { face: "grumpy", w: { stare: 2.5, sigh: 2, bored: 1.5, dance: 0.2, hum: 0, bounce: 0.2, spin: 0.4, jiggle: 0.3, wink: 0.3 } },
  mimoso: { face: "content", w: { jiggle: 2, hum: 2, wink: 2, nod: 1.5, stare: 0.3 } },
  aburrido: { face: "meh", w: { bored: 3, sigh: 3, yawn: 1.5, stretch: 2, wander: 1.4, think: 0.7 } },
  radiante: { face: "content", w: { dance: 2, spin: 1.5, bounce: 2.5, hum: 1.8, sigh: 0.2, bored: 0 } },
  contento: { face: null, w: { hum: 1.3, bounce: 1.3, sigh: 0.6 } },
  tranquilo: { face: null, w: {} },
};

const pc = (v) => Math.round(v * 100) + " %";
const mins = (m) => (m < 1 ? Math.round(m * 60) + " s" : Math.round(m) + " min");

// joy y grump van de 0 a 1 (se apagan solos con el tiempo); idleMin = minutos sin que le hagas caso.
// Mira las reglas en orden y se queda con la primera que se cumple; «rules» las lleva todas (para enseñar el porqué).
export function mood({ alerts = 0, down = 0, total = 0, joy = 0, grump = 0, idleMin = 0 } = {}) {
  const calm = !alerts && !down;
  const rules = [
    { key: "agobiado", ok: alerts >= 2 || down >= 2, val: `${alerts} avisos · ${down} caídos`, rule: "2 avisos o 2 servicios caídos",
      why: alerts >= 2 ? `hay ${alerts} avisos en la página` : `hay ${down} servicios caídos` },
    { key: "gruñón", ok: grump > 0.5, val: pc(grump), rule: "mal humor por encima del 50 %", why: `le has molestado (mal humor al ${pc(grump)})` },
    { key: "mimoso", ok: joy > 0.55, val: pc(joy), rule: "alegría por encima del 55 %", why: `le has dado mimos (alegría al ${pc(joy)})` },
    { key: "aburrido", ok: idleMin > 30, val: mins(idleMin), rule: "más de 30 min sin hacerle caso", why: `lleva ${mins(idleMin)} sin que le hagas caso` },
    { key: "radiante", ok: calm && total > 0 && joy > 0.15, val: pc(joy), rule: "todo en marcha y algo de alegría (> 15 %)",
      why: `todos los servicios van bien y está alegre (${pc(joy)})` },
    { key: "contento", ok: calm && idleMin < 10, val: mins(idleMin), rule: "sin avisos y caso hace < 10 min",
      why: `no hay avisos y le has hecho caso hace ${mins(idleMin)}` },
    { key: "tranquilo", ok: true, val: "", rule: "si no se cumple nada de lo anterior",
      why: alerts || down ? "hay algún aviso, pero nada grave" : `nada especial: hace ${mins(idleMin)} que no le haces caso` },
  ];
  const win = rules.find((r) => r.ok), k = win.key;
  return { key: k, ...MOODS[k], why: win.why, rules: rules.map(({ key, ok, val, rule }) => ({ key, ok, val, rule })) };
}

// sube un valor 0..1 y lo deja decaer: v(t) = v0 · e^(−t/τ)
export const decay = (v, ms, tau) => v * Math.exp(-ms / tau);
export const raise = (v, by) => Math.min(1, v + by);
