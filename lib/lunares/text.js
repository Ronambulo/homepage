// Kero: utilidades de texto para las burbujas y las respuestas de la IA.
import { EXPR } from "./shape.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const norm = (v) => String(v).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

// acciones que la IA puede pedir entre corchetes ([spin], [dance]…)
export const ACTS = ["spin", "dance", "melt", "hop", "wink"];
// «no lo sé», «no tengo información»…: lo que contesta un modelo pequeño cuando no lee los datos
export const DUNNO = /no (lo )?s[eé](?![a-zñ])|no tengo (esa |la |ninguna |suficiente )?informaci|no (puedo|dispongo|encuentro)|desconozco|no hay (datos|informaci)/i;

// una respuesta larga va en varias burbujas: una por frase (las muy cortas se juntan), como mucho 6
export function chunks(text) {
  const out = [];
  for (const para of String(text || "").split(/\n+/)) {
    let cur = "";
    for (let s of para.split(/(?<=[.!?…]["»)]?)\s+/)) {
      s = s.trim(); if (!s) continue;
      if (cur && (cur + " " + s).length > 70) { out.push(cur); cur = s; } else cur = cur ? cur + " " + s : s;
    }
    if (cur) out.push(cur);
  }
  if (out.length > 6) out.splice(5, out.length, out.slice(5).join(" "));
  return out;
}

// tiempo para leer una burbuja con calma
export const readMs = (t) => clamp(2800 + String(t).length * 75, 3800, 11000);

// «[happy] [spin] Hola» → cara, acción y texto
export function parseAI(raw) {
  const tags = [];
  const text = String(raw || "").replace(/<think>[\s\S]*?(<\/think>|$)|<details[^>]*type="reasoning"[\s\S]*?(<\/details>|$)/g, "").replace(/\[\s*(?:anota|tema)\s*:[^\]]*(\]|$)/gi, " ").replace(/\[([^\]]{1,16})\]/g, (_, k) => { tags.push(norm(k)); return " "; }).replace(/[*_#`]/g, "").replace(/\s+/g, " ").trim();
  return { text: text.slice(0, 720), emo: tags.find((k) => EXPR[k] && k !== "idle"), act: tags.find((k) => ACTS.includes(k)) };
}

// mientras llega la respuesta: lo que ya se puede enseñar (sin etiquetas ni una etiqueta a medio escribir)
export const partial = (raw) => parseAI(String(raw || "").replace(/\[[^\]]{0,16}$/, "")).text;

// primera persona → segunda («mi madre» → «tu madre»), para repetir lo que le cuentas
const SWAP2 = { mi: "tu", mis: "tus", me: "te", yo: "tú", conmigo: "contigo", soy: "eres", estoy: "estás", tengo: "tienes", voy: "vas", he: "has", puedo: "puedes", quiero: "quieres", odio: "odias", necesito: "necesitas", vivo: "vives" };
// primera → tercera («me gusta el fútbol» → «le gusta el fútbol»), para el contexto de la IA
const SWAP3 = { mi: "su", mis: "sus", me: "le", yo: "", conmigo: "con él", soy: "es", estoy: "está", tengo: "tiene", voy: "va", he: "ha", puedo: "puede", quiero: "quiere", odio: "odia", necesito: "necesita", vivo: "vive" };
// verbos que también son nombres («mi trabajo»): solo se cambian al principio
const LEAD2 = { "me llamo": "te llamas", naci: "naciste", "nací": "naciste", cumplo: "cumples", trabajo: "trabajas", estudio: "estudias", curro: "curras", juego: "juegas", adoro: "adoras", prefiero: "prefieres", detesto: "detestas" };
const LEAD3 = { "me llamo": "se llama", naci: "nació", "nací": "nació", cumplo: "cumple", trabajo: "trabaja", estudio: "estudia", curro: "curra", juego: "juega", adoro: "adora", prefiero: "prefiere", detesto: "detesta" };
const lead = (map) => (s) => String(s || "").replace(/^\s*(me llamo|nac[ií]|cumplo|trabajo|estudio|curro|juego|adoro|prefiero|detesto)(?=[\s,.]|$)/i, (w) => {
  const r = map[w.trim().toLowerCase()];
  return w.trim()[0] === w.trim()[0].toUpperCase() ? r[0].toUpperCase() + r.slice(1) : r;
});
const swap = (map, first) => (s) => first(s).replace(/[\p{L}]+/gu, (w) => {
  const r = map[w.toLowerCase()];
  if (r == null) return w;
  return w[0] === w[0].toUpperCase() && r ? r[0].toUpperCase() + r.slice(1) : r;
}).replace(/\s{2,}/g, " ").trim();
export const toYou = swap(SWAP2, lead(LEAD2));
export const toThem = swap(SWAP3, lead(LEAD3));
