// Kero: efectos del tiempo a su alrededor (al pasar por el widget del tiempo). Nada que se ponga encima:
// solo luz, nubes, gotas y copos que pasan, y su cuerpo reacciona (temblar, encogerse, derretirse).
// Coordenadas del SVG de Kero: centro del cuerpo ≈ (60, 66), base en y = 96.

const RAIN = [[20, 6, 0], [30, 14, 0.35], [40, 2, 0.15], [52, 10, 0.5], [64, 4, 0.25], [76, 12, 0.6], [86, 0, 0.1], [96, 8, 0.45], [104, 16, 0.3], [26, 22, 0.55], [92, 24, 0.2]];
const FLAKES = [[22, 10, 0], [34, 2, 0.8], [48, 14, 0.4], [60, 4, 1.2], [72, 12, 0.2], [84, 0, 0.9], [98, 8, 0.5], [28, 26, 1.4], [92, 22, 1.1]];
const STARS = [[24, 30, 0], [36, 18, 0.5], [86, 16, 0.25], [100, 40, 0.8], [18, 54, 1.1], [104, 64, 0.4]];
const star = (x, y, s) => `M${x} ${y - 3 * s}L${x + 0.9 * s} ${y - 0.9 * s} ${x + 3 * s} ${y} ${x + 0.9 * s} ${y + 0.9 * s} ${x} ${y + 3 * s} ${x - 0.9 * s} ${y + 0.9 * s} ${x - 3 * s} ${y} ${x - 0.9 * s} ${y - 0.9 * s}Z`;
const d = (s) => ({ "--d": s + "s" });

// detrás del cuerpo: el resplandor del sol y las estrellas
export function SkyBack({ k }) {
  if (k === "sun") return (
    <g className="lun-sky">
      <circle className="sky-glow" cx="60" cy="66" r="38" fill="#ffd166" />
      <g className="sky-rays" stroke="#ffc94a" strokeWidth="2.4" strokeLinecap="round">
        {Array.from({ length: 12 }, (_, i) => <path key={i} d={i % 2 ? "M60 22v-5" : "M60 20v-7"} transform={`rotate(${i * 30} 60 66)`} />)}
      </g>
    </g>
  );
  if (k === "night") return (
    <g className="lun-sky">
      <path d="M101 14a8 8 0 1 0 6 12 6.5 6.5 0 0 1-6-12z" fill="#f0e2a8" opacity=".9" />
      {STARS.map(([x, y, t], i) => <path key={i} className="sky-twinkle" d={star(x, y, i % 2 ? 0.8 : 1.1)} fill="#f0e2a8" style={d(t)} />)}
    </g>
  );
  return null;
}

// delante: nubes, lluvia, rayos, nieve, vaho, sudor
export function SkyFront({ k }) {
  if (k === "cloud") return (
    <g className="lun-sky">
      <path className="sky-nube" d="M44 34h32a8 8 0 0 0 0-16 11 11 0 0 0-20-4 8 8 0 0 0-12 4 8 8 0 0 0 0 16z" fill="#d5dde6" stroke="#aeb9c6" strokeWidth=".8" />
    </g>
  );
  if (k === "rain" || k === "storm") return (
    <g className="lun-sky">
      {k === "storm" && <circle className="sky-flash" cx="60" cy="60" r="62" fill="#fff" />}
      {k === "storm" && <path className="sky-bolt" d="M32 6l-8 18h7l-5 14 13-20h-7l5-12z" fill="#ffd84a" stroke="#c99a10" strokeWidth=".8" strokeLinejoin="round" />}
      <g stroke="#7fbfe8" strokeWidth="1.6" strokeLinecap="round">
        {RAIN.map(([x, y, t], i) => <path key={i} className="sky-drop" d={`M${x} ${y}l-1.5 5`} style={d(t)} />)}
      </g>
    </g>
  );
  if (k === "snow") return (
    <g className="lun-sky">
      {FLAKES.map(([x, y, t], i) => <circle key={i} className="sky-flake" cx={x} cy={y} r={i % 3 ? 1.6 : 2.2} fill="#fff" stroke="#b9c7d6" strokeWidth=".5" style={d(t)} />)}
    </g>
  );
  if (k === "cold") return (
    <g className="lun-sky" fill="#fff" stroke="#b9c7d6" strokeWidth=".5">
      {[0, 0.4, 0.8].map((t) => <circle key={t} className="sky-puff" cx="68" cy="78" r="2.4" style={d(t)} />)}
    </g>
  );
  if (k === "hot") return (
    <g className="lun-sky">
      <g fill="#9fd3ec">
        <path className="sky-sweat" d="M36 48c1.4 2.1 2.1 3.3 2.1 4.4a2.1 2.1 0 0 1-4.2 0c0-1.1.7-2.3 2.1-4.4z" style={d(0)} />
        <path className="sky-sweat" d="M85 44c1.4 2.1 2.1 3.3 2.1 4.4a2.1 2.1 0 0 1-4.2 0c0-1.1.7-2.3 2.1-4.4z" style={d(0.5)} />
      </g>
      <g fill="none" stroke="#ff9f5a" strokeWidth="1.4" strokeLinecap="round">
        {[44, 60, 76].map((x, i) => <path key={x} className="sky-heat" d={`M${x} 30c-2-2 2-4 0-6s2-4 0-6`} style={d(i * 0.3)} />)}
      </g>
    </g>
  );
  return null;
}
