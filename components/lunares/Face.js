// Kero: piezas de la cara (ojos y boca) e iconos del menú rápido.
const EYE = { l: [49.5, 59.5], r: [70.5, 59.5] };

export function Eye({ kind, side, e }) {
  const [cx, cy0] = EYE[side], cy = cy0 + (e.dy || 0);
  const w = 7 * (e.w || 1), h = 19 * (e.h || 1);
  if (kind === "arc") return <path d={`M${cx - 5.5} ${cy + 3}Q${cx} ${cy - 7} ${cx + 5.5} ${cy + 3}`} fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" />;
  // dormido: ︶ (ojos cerrados y relajados)
  if (kind === "shut") return <path d={`M${cx - 5.5} ${cy - 0.5}Q${cx} ${cy + 5} ${cx + 5.5} ${cy - 0.5}`} fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />;
  if (kind === "line") return <rect x={cx - 7} y={cy - 2} width="14" height="4" rx="2" />;
  if (kind === "x") return <path d={`M${cx - 4.5} ${cy - 4.5}L${cx + 4.5} ${cy + 4.5}M${cx + 4.5} ${cy - 4.5}L${cx - 4.5} ${cy + 4.5}`} stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />;
  if (kind === "squeeze") { const d = side === "l" ? 1 : -1; return <path d={`M${cx - 4 * d} ${cy - 5}L${cx + 3.5 * d} ${cy}L${cx - 4 * d} ${cy + 5}`} fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />; }
  if (kind === "slant") return <rect x={cx - 7} y={cy - 3.5} width="14" height="7" rx="3.5" transform={`rotate(${side === "l" ? 16 : -16} ${cx} ${cy})`} />;
  return <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={w / 2} />;
}

export function Mouth({ kind }) {
  if (kind === "o") return <ellipse cx="60" cy="77" rx="3" ry="3.4" />;
  if (kind === "O") return <ellipse cx="60" cy="78" rx="4.2" ry="6" />;
  if (kind === "w") return <path d="M53 77q2.3 3 4.6 0t4.6 0 4.6 0" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />;
  // gruñón: ︵
  if (kind === "frown") return <path d="M55 79q5-4 10 0" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />;
  return null;
}

// iconos del menú rápido (trazos de 16×16)
export const I = {
  talk: "M3 3.5h10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H7.5L4.5 14v-2.5H3a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1z",
  size: "M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9",
  move: "M8 2v12M2 8h12M6 4l2-2 2 2M6 12l2 2 2-2M4 6 2 8l2 2M12 6l2 2-2 2",
  color: "M8 2a6 6 0 1 0 0 12c1 0 1.4-.7 1.1-1.5-.4-1 .2-2 1.3-2H12a2 2 0 0 0 2-2A6 6 0 0 0 8 2z",
  moon: "M13 9.5A5.5 5.5 0 1 1 6.5 3a4.5 4.5 0 0 0 6.5 6.5z",
  sun: "M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1",
  hide: "M2 2l12 12M6.5 4A6.6 6.6 0 0 1 8 3.5c4 0 6.5 4.5 6.5 4.5a12 12 0 0 1-1.8 2.3M10.6 11.8A6 6 0 0 1 8 12.5C4 12.5 1.5 8 1.5 8a12 12 0 0 1 2.4-2.9",
  more: "M2.5 4h6M12 4h1.5M2.5 8h1M7 8h6.5M2.5 12h6M12 12h1.5M8.7 4a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 1 0-3.2 0M3.7 8a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 1 0-3.2 0M8.7 12a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 1 0-3.2 0",
  bell: "M4 11V7.5a4 4 0 0 1 8 0V11l1.2 1.5H2.8zM6.6 14a1.5 1.5 0 0 0 2.8 0",
  timer: "M8 5v3.5l2 1.5M6.5 1.5h3M8 3a5.5 5.5 0 1 0 0 11A5.5 5.5 0 0 0 8 3z",
  x: "M4.5 4.5l7 7M11.5 4.5l-7 7",
  repeat: "M2.5 7.5V7a3.5 3.5 0 0 1 3.5-3.5h7.5M11 1.5l2.5 2-2.5 2M13.5 8.5V9a3.5 3.5 0 0 1-3.5 3.5H2.5M5 14.5l-2.5-2 2.5-2",
};
export const CHECK = "M3 8.5l3.2 3L13 4.5", CHEV = "M6 3l5 5-5 5";
export const Ic = ({ d, small, accent }) => (
  <svg className={"lun-mi" + (accent ? " acc" : "")} width={small ? 12 : 15} height={small ? 12 : 15} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={accent || small ? 1.9 : 1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
);
