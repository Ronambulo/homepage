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

// joy y grump van de 0 a 1 (se apagan solos con el tiempo); idleMin = minutos sin que le hagas caso
export function mood({ alerts = 0, down = 0, total = 0, joy = 0, grump = 0, idleMin = 0 } = {}) {
  let k;
  if (alerts >= 2 || down >= 2) k = "agobiado";
  else if (grump > 0.5) k = "gruñón";
  else if (joy > 0.55) k = "mimoso";
  else if (idleMin > 30) k = "aburrido";
  else if (!alerts && total > 0 && !down && joy > 0.15) k = "radiante";
  else if (!alerts && !down && idleMin < 10) k = "contento";
  else k = "tranquilo";
  return { key: k, ...MOODS[k] };
}

// sube un valor 0..1 y lo deja decaer: v(t) = v0 · e^(−t/τ)
export const decay = (v, ms, tau) => v * Math.exp(-ms / tau);
export const raise = (v, by) => Math.min(1, v + by);
