// Kero: qué animación toca al pasar por el widget del tiempo, según el código de Open-Meteo y la temperatura.
// "sun" | "night" (despejado de noche) | "cloud" | "rain" | "storm" | "snow" | "cold" | "hot" | null (sin datos)

export const SKY = ["sun", "night", "cloud", "rain", "storm", "snow", "cold", "hot"];

export function skyFx(w, hour = new Date().getHours()) {
  const c = Number(w?.c), t = Number(w?.t);
  if (!Number.isFinite(c) && !Number.isFinite(t)) return null;
  // lo que cae del cielo manda sobre la temperatura
  if (c >= 95) return "storm";
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return "snow";
  if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) return "rain";
  if (t > 30) return "hot";
  if (t < 8) return "cold";
  if (c === 2 || c === 3 || c === 45 || c === 48) return "cloud";
  if (c === 0 || c === 1) return hour >= 21 || hour < 7 ? "night" : "sun";
  return null;
}
