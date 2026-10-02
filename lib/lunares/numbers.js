// Kero: cifras. Que la IA no se invente números de tus datos y que las cuentas las haga la página, no el modelo.
import { plain, topics } from "./brain.js";
import { parseWhen } from "./when.js";

const GB = 1073741824;
const eu = (n) => Math.round(n).toLocaleString("es-ES") + " €";
const fmt = (n) => (Math.round(n * 100) / 100).toLocaleString("es-ES", { maximumFractionDigits: 2 });
const pct = (a, b) => Math.round((a / b) * 100) + "%";

// «1.234,56», «1234.5», «1,2 mil», «10k», «3 millones» → números (sin signo)
const NUM = /(?<![\p{L}\d.,])(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+)|\.(\d+))?(?:\s*(mil(?:lones?)?|millones|k)(?![\p{L}]))?/giu;
export function nums(text) {
  const out = [];
  for (const m of String(text || "").matchAll(NUM)) {
    let v = parseFloat(m[1].replace(/\./g, "") + (m[2] || m[3] ? "." + (m[2] || m[3]) : ""));
    const k = (m[4] || "").toLowerCase();
    if (k === "mil" || k === "k") v *= 1000; else if (k) v *= 1e6;
    if (Number.isFinite(v)) out.push(v);
  }
  return out;
}

// ¿«v» puede ser la cifra «c» dicha a su manera? (redondeos: 1.234,56 € → «unos 1.235 €», «1,2 mil», «más de 1.000»)
export function sameNum(v, c) {
  const d = Math.abs(v - c);
  if (d <= 0.51 || d <= Math.abs(c) * 0.015) return true;
  if (!Number.isInteger(v) || v < 100) return false;
  let step = 1;
  while (v % (step * 10) === 0) step *= 10;
  return step >= 100 && d < step && [Math.round(c / step), Math.floor(c / step), Math.ceil(c / step)].some((x) => x * step === v);
}

// los números pequeños (cuántas tareas, «en 2 días», las 8) se los dejamos contar al modelo
const SMALL = 12;
const TAGS = /^(\s*\[[^\]]{1,16}\])+\s*/;

// Quita de `text` las frases con cifras que no salen en `known` (textos con los datos que tenía).
// La primera frase quitada se cambia por `fallback` (la respuesta exacta del widget), si la hay.
// → { text, bad: [frases quitadas] }; text vacío si no queda nada.
export function checkNumbers(text, known, fallback) {
  const src = String(text || ""), tags = (src.match(TAGS) || [""])[0];
  const ok = [].concat(known).flatMap(nums);
  const bad = [], out = [];
  let used = false;
  for (const s of src.slice(tags.length).split(/(?<=[.!?…]["»)]?)\s+/)) {
    if (!s.trim()) continue;
    const wrong = nums(s).some((v) => !(Number.isInteger(v) && v <= SMALL) && !ok.some((c) => sameNum(v, c)));
    if (!wrong) { out.push(s.trim()); continue; }
    bad.push(s.trim());
    if (fallback && !used) { out.push(String(fallback).trim()); used = true; }
  }
  const body = out.join(" ").trim();
  return { text: body ? (tags + body).trim() : "", bad };
}

/* ---------- cuentas de verdad (gemma4e4b es mala en aritmética: se le dan hechas) ---------- */

// «23 por 17», «(1500 - 200) / 3», «2.500,5 + 100» → número o null
function arith(src) {
  const t = String(src).replace(/\bdividido (?:entre|por)\b|\bentre\b/g, "/").replace(/\bpor\b|(?<=\d\s*)x(?=\s*\d)|×/g, "*").replace(/\bmas\b/g, "+").replace(/\bmenos\b/g, "-").replace(/÷/g, "/");
  const tk = [], re = /\s*(?:(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)|([-+*/()]))/y;
  let i = 0;
  while (i < t.length) {
    re.lastIndex = i;
    const m = re.exec(t);
    if (!m) { if (/^\s*$/.test(t.slice(i))) break; return null; }
    tk.push(m[1] ? nums(m[1])[0] : m[2]);
    i = re.lastIndex;
  }
  if (tk.length < 3 || !tk.some((x) => typeof x === "string" && x !== "(" && x !== ")")) return null;
  let p = 0;
  const expr = () => { let v = term(); while (tk[p] === "+" || tk[p] === "-") v = tk[p++] === "+" ? v + term() : v - term(); return v; };
  const term = () => { let v = fact(); while (tk[p] === "*" || tk[p] === "/") v = tk[p++] === "*" ? v * fact() : v / fact(); return v; };
  const fact = () => {
    const x = tk[p++];
    if (x === "-") return -fact();
    if (x === "(") { const v = expr(); if (tk[p++] !== ")") throw 0; return v; }
    if (typeof x !== "number") throw 0;
    return x;
  };
  try { const v = expr(); return p === tk.length && Number.isFinite(v) ? v : null; } catch { return null; }
}

const AMOUNT = "(\\d[\\d.,]*(?:\\s*(?:mil|k)(?![a-z]))?)\\s*(?:€|euros?|pavos)?";
const FIXED = { navidad: "25 de diciembre", nochebuena: "24 de diciembre", nochevieja: "31 de diciembre", "fin de ano": "31 de diciembre", "ano nuevo": "1 de enero", reyes: "6 de enero" };
const span = (ms) => {
  const d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5), m = Math.round((ms % 36e5) / 6e4);
  if (d) return `${d} ${d === 1 ? "día" : "días"}${h ? ` y ${h} ${h === 1 ? "hora" : "horas"}` : ""}`;
  if (h) return `${h} ${h === 1 ? "hora" : "horas"}${m ? ` y ${m} min` : ""}`;
  return `${m} min`;
};

// Las cuentas que pide (o que le hacen falta a la IA para contestar), ya hechas. null si no hay ninguna.
export function calc(text, f = {}, now = Date.now()) {
  const t = plain(text), W = f.w || {}, ids = topics(text), o = [];

  // «cuánto es 23 por 17», «el 15% de 2.400»
  const per = t.match(/(\d[\d.,]*)\s*(?:%|por ?ciento)\s+de\s+(\d[\d.,]*(?:\s*(?:mil|k)(?![a-z]))?)/);
  if (per) { const a = nums(per[1])[0], b = nums(per[2])[0]; if (a != null && b != null) o.push(`el ${fmt(a)}% de ${fmt(b)} es ${fmt((a / 100) * b)}`); }
  const ex = !per && t.match(/(?:cuanto (?:es|son|da)|calcula(?:me)?|resultado de)\s+([\d\s.,()+\-*/x×÷]+(?:\s*(?:por|entre|mas|menos|dividido (?:entre|por))\s*[\d\s.,()+\-*/x×÷]+)*)/);
  if (ex) { const v = arith(ex[1].trim()); if (v != null) o.push(`${ex[1].trim()} = ${fmt(v)}`); }

  // patrimonio: tasa de ahorro, variación y cuánto falta para una cifra
  const fm = W.fm;
  if (fm && !fm.state && (ids.includes("fm") || /€|euros?\b|falta.*\d|ahorr/.test(t))) {
    if (fm.inc > 0) o.push(`este ciclo ahorras el ${pct(fm.s, fm.inc)} de lo que entra (${eu(fm.s)} de ${eu(fm.inc)}) y gastas el ${pct(fm.exp, fm.inc)}`);
    if (fm.first) { const d = fm.nw - fm.first; o.push(`el patrimonio ha ${d >= 0 ? "subido" : "bajado"} ${eu(Math.abs(d))} (${(d >= 0 ? "+" : "−") + pct(Math.abs(d), Math.abs(fm.first))}) en el periodo`); }
    let q = t, month = null;
    const mm = q.match(new RegExp(`${AMOUNT}\\s*(?:al|cada|por|a el) mes`));
    if (mm) { month = nums(mm[1])[0]; q = q.replace(mm[0], " "); }
    const goal = /falta|queda|lleg|alcanz|consegu|tard|cuando tendre|junt/.test(q) && q.match(new RegExp(`(?:para|hasta|a|tener|juntar)\\s+(?:llegar a\\s+|tener\\s+)?${AMOUNT}`));
    const X = goal ? nums(goal[1])[0] : null;
    if (X > 0) {
      const diff = X - fm.nw, rate = month || (fm.s > 0 ? fm.s : null);
      if (diff <= 0) o.push(`ya tienes ${eu(fm.nw)}: ${eu(-diff)} más que ${eu(X)}`);
      else {
        let s = `para ${eu(X)} te faltan ${eu(diff)} (tienes ${eu(fm.nw)})`;
        if (rate) { const n = Math.ceil(diff / rate); s += `; ahorrando ${eu(rate)} al mes${month ? "" : " (como este ciclo)"}, ${n} ${n === 1 ? "mes" : "meses"}${n >= 24 ? ` (unos ${fmt(Math.round((n / 12) * 10) / 10)} años)` : ""}`; }
        o.push(s);
      }
    }
  }

  // servidor: lo que queda libre
  const srv = W.srv;
  if (srv?.ok && ids.includes("srv")) {
    if (srv.disk?.total) o.push(`disco: ${fmt((srv.disk.total - srv.disk.used) / GB)} GB libres de ${fmt(srv.disk.total / GB)} GB`);
    if (srv.ramTotal) o.push(`RAM: ${fmt((srv.ramTotal - srv.ramUsed) / GB)} GB libres de ${fmt(srv.ramTotal / GB)} GB`);
  }

  // cuánto falta: para un evento del calendario o para una fecha
  if (/cuant[oa]s? (?:\w+ )?(?:falta|queda)|cuantos dias|cuanto tiempo|en cuanto/.test(t)) {
    const ev = (W.cal?.events || []).find((e) => +new Date(e.start) > now && plain(e.title).trim().length >= 3 && t.includes(plain(e.title).trim()));
    if (ev) o.push(`para «${ev.title}» faltan ${span(+new Date(ev.start) - now)}`);
    else {
      const rest = t.replace(/^.*?(?:falta|queda)n?\s+(?:para|hasta)\s+/, "");
      const key = Object.keys(FIXED).find((k) => rest.includes(k));
      const w = parseWhen(key ? FIXED[key] : rest, now);
      if (w && !w.past && w.at - now < 4 * 365 * 864e5) {
        const d0 = new Date(now), a = new Date(w.at);
        const days = Math.round((new Date(a.getFullYear(), a.getMonth(), a.getDate()) - new Date(d0.getFullYear(), d0.getMonth(), d0.getDate())) / 864e5);
        o.push(`hasta el ${a.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} faltan ${days} ${days === 1 ? "día" : "días"}`);
      }
    }
  }

  return o.length ? `Cálculos ya hechos (exactos, úsalos tal cual): ${o.join("; ")}.` : null;
}
