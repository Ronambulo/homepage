// Kero: forma del cuerpo, colores y expresiones. Sin dependencias.

// Las tres siluetas originales (8 vértices cada una). Solo se usan sus vértices:
// la curva se reconstruye en cada fotograma con Catmull-Rom centrípeta, que no hace picos.
const FRAMES = [
  "M92.2 70.0C90.2 77.8 83.9 87.9 76.8 91.9C69.7 95.9 57.9 96.3 49.5 93.9C41.1 91.5 29.8 84.9 26.5 77.7C23.2 70.5 26.7 58.2 29.8 50.7C33.0 43.1 38.4 36.8 45.3 32.2C52.3 27.6 64.2 20.9 71.5 23.0C78.7 25.1 85.1 37.1 88.6 44.9C92.0 52.8 94.1 62.1 92.2 70.0z",
  "M92.2 70.0C89.3 77.6 82.1 84.9 75.1 88.6C68.1 92.2 57.1 94.3 50.1 91.9C43.2 89.5 37.7 81.3 33.2 74.1C28.7 66.9 21.5 56.0 23.3 48.7C25.2 41.3 36.2 34.4 44.2 30.1C52.2 25.8 63.5 20.7 71.5 22.8C79.5 25.0 88.8 35.1 92.3 43.0C95.7 50.8 95.1 62.4 92.2 70.0z",
  "M92.2 70.0C90.7 78.1 85.0 91.0 78.1 94.3C71.2 97.6 58.6 93.0 50.8 89.9C42.9 86.7 34.9 82.1 30.9 75.4C26.8 68.7 24.6 57.6 26.6 49.7C28.6 41.8 36.1 30.9 43.1 28.0C50.1 25.1 61.2 29.4 68.5 32.4C75.9 35.4 83.0 39.5 87.0 45.8C90.9 52.0 93.7 61.9 92.2 70.0z",
];

const anchors = (d) => {
  const n = d.match(/-?\d+(\.\d+)?/g).map(Number), pts = [[n[0], n[1]]];
  for (let i = 2; i + 5 < n.length; i += 6) pts.push([n[i + 4], n[i + 5]]);
  pts.pop(); // el último repite el primero
  return pts;
};
export const KEYS = FRAMES.map(anchors);
export const FLOOR = 96; // y de la base del cuerpo en unidades del SVG
export const CX = 60;

const ease = (t) => t * t * (3 - 2 * t);

// t en vueltas (0..1 recorre las tres siluetas y vuelve a la primera). amp 0..1 escala cuánto se deforma.
export function shapeAt(t, amp = 1) {
  const f = (((t % 1) + 1) % 1) * 3, i = Math.floor(f), k = ease(f - i);
  const A = KEYS[i % 3], B = KEYS[(i + 1) % 3], base = KEYS[0];
  return A.map((p, j) => {
    const x = p[0] + (B[j][0] - p[0]) * k, y = p[1] + (B[j][1] - p[1]) * k;
    return [base[j][0] + (x - base[j][0]) * amp, base[j][1] + (y - base[j][1]) * amp];
  });
}

// round 0..1: acerca cada vértice a la media de sus vecinos solo en el radio (suaviza bultos sin moverlos de sitio)
export function toPath(pts, round = 0.3) {
  const n = pts.length;
  let P = pts;
  if (round > 0) {
    const cx = pts.reduce((s, p) => s + p[0], 0) / n, cy = pts.reduce((s, p) => s + p[1], 0) / n;
    const r = pts.map((p) => Math.hypot(p[0] - cx, p[1] - cy));
    P = pts.map((p, i) => {
      const avg = (r[(i - 1 + n) % n] + r[(i + 1) % n]) / 2, nr = r[i] + (avg - r[i]) * round * 0.5, s = nr / (r[i] || 1);
      return [cx + (p[0] - cx) * s, cy + (p[1] - cy) * s];
    });
  }
  const f = (v) => v.toFixed(2);
  let d = "M" + f(P[0][0]) + " " + f(P[0][1]);
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    // Catmull-Rom centrípeta (alpha 0.5) → Bézier cúbica
    const d1 = Math.max(1e-3, Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) ** 0.5);
    const d2 = Math.max(1e-3, Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) ** 0.5);
    const d3 = Math.max(1e-3, Math.hypot(p3[0] - p2[0], p3[1] - p2[1]) ** 0.5);
    const b1 = [0, 1].map((k) => (d1 * d1 * p2[k] - d2 * d2 * p0[k] + (2 * d1 * d1 + 3 * d1 * d2 + d2 * d2) * p1[k]) / (3 * d1 * (d1 + d2)));
    const b2 = [0, 1].map((k) => (d3 * d3 * p1[k] - d2 * d2 * p3[k] + (2 * d3 * d3 + 3 * d3 * d2 + d2 * d2) * p2[k]) / (3 * d3 * (d3 + d2)));
    d += "C" + f(b1[0]) + " " + f(b1[1]) + " " + f(b2[0]) + " " + f(b2[1]) + " " + f(p2[0]) + " " + f(p2[1]);
  }
  return d + "z";
}

export const COLORS = { tema: null, menta: "#a7dcb8", ambar: "#f0c992", indigo: "#b9c4f2", malva: "#e3b8d9", coral: "#f2a98f", cielo: "#9fd3ec" };
export const ALERT = "#e6a0a0";

// Expresiones: forma de cada ojo (pill | arc | line | shut | x | slant | squeeze), escala, desplazamiento, boca (o | O | w | frown) y rubor.
export const EXPR = {
  idle: { l: "pill", r: "pill" },
  happy: { l: "arc", r: "arc" },
  love: { l: "arc", r: "arc", blush: 1 },
  think: { l: "pill", r: "pill", h: 0.8, look: [0.7, -1] },
  surprised: { l: "pill", r: "pill", w: 1.25, h: 1.15, mouth: "o" },
  scared: { l: "pill", r: "pill", w: 1.1, h: 0.7, mouth: "o", shiver: 1 },
  worried: { l: "slant", r: "slant", shiver: 0.5 },
  sleep: { l: "shut", r: "shut" },
  drowsy: { l: "pill", r: "pill", h: 0.4, dy: 3 },
  yawn: { l: "arc", r: "arc", mouth: "O", tear: 1 },
  dizzy: { l: "x", r: "x", mouth: "w" },
  annoyed: { l: "pill", r: "pill", h: 0.42, dy: 3 },
  wink: { l: "pill", r: "arc" },
  sus: { l: "pill", r: "pill", h: 0.45, dy: 2, look: [-1, 0] },
  proud: { l: "arc", r: "arc", dy: -2 },
  squeeze: { l: "squeeze", r: "squeeze" },
  chuffed: { l: "arc", r: "arc", dy: -2, blush: 1 },
  // caras de reposo según el humor y gestos nuevos
  content: { l: "pill", r: "pill", h: 0.9, dy: -1, blush: 1 },
  meh: { l: "pill", r: "pill", h: 0.6, dy: 2 },
  grumpy: { l: "line", r: "line", dy: 1, mouth: "frown" },
  sneeze: { l: "squeeze", r: "squeeze", mouth: "o" },
  hum: { l: "arc", r: "arc", mouth: "o" },
  sigh: { l: "pill", r: "pill", h: 0.45, dy: 3, mouth: "o" },
};
