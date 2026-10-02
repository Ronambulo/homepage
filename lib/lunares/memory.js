// Kero: lo que sabe de ti. Lógica pura (la usan el navegador y el servidor).
//
// Cada dato: { id, text, kind, key, at, upd } (y `due`, `allday` en los planes)
//   text  como lo dijiste, en primera persona («mi perro se llama Toby»)
//   kind  name | age | birthday | home | origin | work | like | dislike | fav | rel | has | fact
//         y los especiales, que no salen de clasificar el texto:
//         episode  de qué hablasteis en una charla («el viaje a Lisboa»); lo resume la IA, caduca a los 60 días
//                  y no cuenta para el límite
//         plan     algo que tienes un día («el examen», con `due`); se borra 7 días después
//         pref     cómo quieres que te hable («háblame más corto»); va al prompt, no a lo que sabe de ti
//   key   de qué trata («mascota:perr», «gusto:cafe»…). Un dato nuevo con la misma clave sustituye al viejo:
//         «ya no me gusta el café» pisa a «me gusta el café», «vivo en Sevilla» pisa a «vivo en Madrid».
//   at    cuándo se lo contaste por primera vez; upd, la última vez que cambió
//
// Buscar: BM25 sobre palabras normalizadas (sin tildes ni palabras vacías, con raíz ligera y sinónimos),
// más un empujón si la pregunta toca la clave del dato. Así «¿cuándo es mi cumple?» encuentra
// «nací el 3 de mayo» y «¿cómo se llama mi perro?» encuentra «mi perro se llama Toby».

export const MAX_FACTS = 200;
export const SPECIAL = new Set(["episode", "plan", "pref"]);
const DAY_MS = 864e5, EP_DAYS = 60, PLAN_DAYS = 7, MAX_EP = 30;
const flat = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const STOP = new Set(("a al algo alguna alguno ante como con contigo cual cuales cuando cuanta cuantas cuanto cuantos de del desde donde el ella ellas ellos en era eres es esa ese eso esta estan este esto fue ha has hay he la las le les lo los mas me mi mis mucho muy no nos o para pero poco por porque que quien quienes se sea ser si sin sobre son su sus te ti tu tus un una unas uno unos y ya yo " +
  "sabes recuerdas acuerdas dije dicho conte contado contaste cuenta dime oye kero tengo tienes tiene dia vez cosa cosas").split(" "));

// palabras que significan lo mismo para buscar (en ambos lados: datos y preguntas)
const SYN = {
  cumple: ["cumpleanos"], cumpleanos: ["cumpleanos"], naci: ["cumpleanos"], nacimiento: ["cumpleanos"], cumplo: ["cumpleanos"], nacido: ["cumpleanos"],
  llamo: ["nombre"], llamas: ["nombre"], llama: ["nombre"], llaman: ["nombre"], nombre: ["nombre"],
  vivo: ["vivir"], vives: ["vivir"], vive: ["vivir"], viven: ["vivir"], casa: ["vivir"], ciudad: ["vivir"], piso: ["vivir"],
  trabajo: ["trabajo"], trabajas: ["trabajo"], trabaja: ["trabajo"], curro: ["trabajo"], curras: ["trabajo"], empresa: ["trabajo"], oficio: ["trabajo"], profesion: ["trabajo"], estudio: ["trabajo"], estudias: ["trabajo"],
  gusta: ["gustar"], gustan: ["gustar"], encanta: ["gustar"], encantan: ["gustar"], chifla: ["gustar"], chiflan: ["gustar"], flipa: ["gustar"], flipan: ["gustar"], adoro: ["gustar"], favorito: ["gustar"], favorita: ["gustar"], favoritos: ["gustar"], favoritas: ["gustar"], prefiero: ["gustar"], gustos: ["gustar"],
  odio: ["odiar"], odias: ["odiar"], detesto: ["odiar"],
  anos: ["edad"], edad: ["edad"],
  perro: ["mascota"], perra: ["mascota"], gato: ["mascota"], gata: ["mascota"], mascota: ["mascota"], mascotas: ["mascota"], conejo: ["mascota"], loro: ["mascota"], tortuga: ["mascota"],
  madre: ["familia"], padre: ["familia"], mama: ["familia"], papa: ["familia"], hermano: ["familia"], hermana: ["familia"], hijo: ["familia"], hija: ["familia"], abuelo: ["familia"], abuela: ["familia"], familia: ["familia"],
  novia: ["pareja"], novio: ["pareja"], mujer: ["pareja"], marido: ["pareja"], pareja: ["pareja"], esposa: ["pareja"], esposo: ["pareja"],
  comida: ["comer"], comer: ["comer"], plato: ["comer"],
};

// raíz ligera: plurales y género («perros», «perra» → «perr»)
export function stem(w) {
  if (/^\d+$/.test(w)) return w;
  if (w.length > 4 && /[^aeiou]es$/.test(w)) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith("s")) w = w.slice(0, -1);
  if (w.length > 4 && /[aoe]$/.test(w)) w = w.slice(0, -1);
  return w;
}

const words = (s) => flat(s).replace(/[^\p{L}\p{N}]+/gu, " ").split(" ").filter(Boolean);
// palabras con las que se busca: sin vacías, con raíz y con sus sinónimos
export function terms(s) {
  const out = [];
  for (const w of words(s)) {
    const syn = SYN[w];
    if (syn) out.push(...syn);
    if (!STOP.has(w) && (w.length > 1 || /\d/.test(w))) out.push(stem(w));
  }
  return out;
}

// de qué trata un dato
export function classify(text) {
  const f = words(text).join(" ");
  const obj = (rest) => words(rest).filter((w) => !STOP.has(w) && !/^(el|la|los|las|un|una|mucho|muchisimo|bastante|nada)$/.test(w)).slice(0, 2).map(stem).join(" ");
  let m;
  if (/^(?:me llamo|mi nombre es)\b/.test(f)) return { kind: "name", key: "nombre" };
  if (/^(?:soy (?:de|del)|naci en)\b/.test(f)) return { kind: "origin", key: "origen" };
  // solo el tuyo: «mi madre cumple el 5» no es tu cumpleaños
  if (/^(?:mi cumple|naci\b|cumplo anos|mi (?:fecha de )?nacimiento)/.test(f)) return { kind: "birthday", key: "cumpleanos" };
  if (/^tengo \d+ anos\b/.test(f)) return { kind: "age", key: "edad" };
  if (/^(?:vivo|ahora vivo) en\b/.test(f)) return { kind: "home", key: "vivir" };
  if (/^(?:trabajo|curro|estudio)\b|^mi (?:trabajo|curro|empresa)\b/.test(f)) return { kind: "work", key: "trabajo" };
  if ((m = /^mis? ((?:\w+ ){0,2}?)(?:favorit[oa]s?|preferid[oa]s?) (?:es|son|era)\b/.exec(f))) return { kind: "fav", key: "fav:" + obj(m[1]) };
  if ((m = /^(ya )?(no )?me (?:gusta|gustan|encanta|encantan|chifla|chiflan|flipa|flipan|apasiona|apasionan|vuelve loco|vuelven locos?)\s+(.+)$/.exec(f)))
    return { kind: m[2] ? "dislike" : "like", key: "gusto:" + obj(m[3]) };
  if ((m = /^(odio|detesto|adoro)\s+(.+)$/.exec(f))) return { kind: m[1] === "adoro" ? "like" : "dislike", key: "gusto:" + obj(m[2]) };
  // «mi perro se llama Toby»: uno por cada quién (el hermano y la hermana son dos)
  if ((m = /^mis? (\w+)(?: \w+)? se llaman?\b/.exec(f))) return { kind: "rel", key: "llama:" + m[1].replace(/s$/, "") };
  if ((m = /^tengo (?:un|una|dos|tres|unos|unas|\d+) (\w+)/.exec(f))) return { kind: "has", key: "tengo:" + stem(m[1]) };
  return { kind: "fact", key: "" };
}

// la clave de un gusto de estilo: «háblame más largo» pisa a «háblame más corto»
export function prefKey(text) {
  const f = words(text).join(" ");
  if (/cort|breve|larg|extens|concis|detall|resum|rollo|enroll/.test(f)) return "pref:largo";
  if (/llam/.test(f)) return "pref:nombre";
  if (/seri|gracios|broma|chiste|formal|cercan|carinos|usted|tutea|payas/.test(f)) return "pref:tono";
  return "pref:" + terms(text).slice(0, 3).join(" ");
}
const KEY = /^[\p{L}\p{N}:._ -]{1,80}$/u;
// de qué trata un dato, contando con los especiales (extra: { kind, key })
function kindOf(text, extra = {}) {
  if (!SPECIAL.has(extra.kind)) return classify(text);
  const key = typeof extra.key === "string" && KEY.test(extra.key) ? extra.key
    : extra.kind === "pref" ? prefKey(text) : extra.kind === "plan" ? "plan:" + terms(text).join(" ") : "";
  return { kind: extra.kind, key };
}

// lo que ya no vale: charlas de hace más de 60 días (como mucho 30) y planes que pasaron hace más de 7
export function pruneFacts(list, now = Date.now()) {
  let eps = 0;
  return [...(list || [])].reverse().filter((f) => {
    if (f.kind === "episode") return (f.upd || f.at || now) > now - EP_DAYS * DAY_MS && ++eps <= MAX_EP;
    if (f.kind === "plan") return !Number.isFinite(f.due) || f.due > now - PLAN_DAYS * DAY_MS;
    return true;
  }).reverse();
}
// para el límite de 200 cuentan todos menos las charlas
const counted = (list) => list.filter((f) => f.kind !== "episode").length;

const jaccard = (a, b) => {
  const A = new Set(a), B = new Set(b);
  if (!A.size || !B.size) return 0;
  let n = 0; for (const x of A) if (B.has(x)) n++;
  return n / (A.size + B.size - n);
};
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const cleanText = (t) => String(t ?? "").replace(/\s+/g, " ").trim().replace(/[.!\s]+$/, "").slice(0, 200);

// lo que viene de fuera (localStorage antiguo, copia de seguridad, petición): datos válidos y completos
export function tidyFacts(list, now = Date.now()) {
  const seen = new Set(), out = [];
  for (const x of Array.isArray(list) ? list : []) {
    const text = cleanText(x?.text ?? (typeof x === "string" ? x : ""));
    if (!text) continue;
    let id = typeof x?.id === "string" && /^[a-z0-9]{4,24}$/.test(x.id) ? x.id : newId() + out.length;
    if (seen.has(id)) id = newId() + out.length;
    seen.add(id);
    const at = Number.isFinite(x?.at) ? x.at : now, { kind, key } = kindOf(text, { kind: x?.kind, key: x?.key });
    out.push({ id, text, kind, key, at, upd: Number.isFinite(x?.upd) ? x.upd : at, ...(kind === "plan" && Number.isFinite(x?.due) ? { due: x.due, ...(x.allday ? { allday: true } : {}) } : {}) });
  }
  const kept = pruneFacts(out, now);
  while (counted(kept) > MAX_FACTS) kept.splice(kept.findIndex((f) => f.kind !== "episode"), 1);
  return kept;
}

// el dato que ya había sobre lo mismo: misma clave o casi las mismas palabras
// (los especiales solo con los de su clase; una charla, solo con su clave)
function same(list, text, key, kind) {
  const group = (f) => (SPECIAL.has(kind) ? f.kind === kind : !SPECIAL.has(f.kind));
  if (key) { const i = list.findIndex((f) => f.key === key && group(f)); if (i >= 0) return i; }
  if (kind === "episode") return -1;
  const t = terms(text);
  let best = -1, s = 0.7;
  list.forEach((f, i) => { if (!group(f)) return; const j = jaccard(t, terms(f.text)); if (j >= s) { s = j; best = i; } });
  return best;
}

// apunta un dato: sustituye al que hablaba de lo mismo. → { list, fact, old }
//   extra: { kind, key, due, allday } para los especiales (charlas, planes y gustos de estilo)
export function upsertFact(list, text, now = Date.now(), id, extra = {}) {
  text = cleanText(text);
  list = pruneFacts(list, now);
  if (!text) return { list, fact: null, old: null };
  const { kind, key } = kindOf(text, extra), i = same(list, text, key, kind);
  const when = kind === "plan" && Number.isFinite(extra.due) ? { due: extra.due, ...(extra.allday ? { allday: true } : {}) } : {};
  if (i >= 0) {
    const old = list[i], fact = { ...old, text, kind, key, upd: now, ...when };
    list.splice(i, 1);
    list.push(fact);
    return { list, fact, old };
  }
  const fact = { id: typeof id === "string" && /^[a-z0-9]{4,24}$/.test(id) && !list.some((f) => f.id === id) ? id : newId(), text, kind, key, at: now, upd: now, ...when };
  list.push(fact);
  // lleno: se va lo más viejo que no sea quién eres (las charlas no cuentan)
  while (counted(list) > MAX_FACTS) {
    const j = list.findIndex((f) => !CORE.has(f.kind) && f.kind !== "episode");
    list.splice(j >= 0 ? j : list.findIndex((f) => f.kind !== "episode"), 1);
  }
  return { list, fact, old: null };
}

export const removeFact = (list, id) => (list || []).filter((f) => f.id !== id);

// lo básico de quién eres: siempre va al contexto de la IA y no se tira al llenarse
const CORE = new Set(["name", "birthday", "home", "work", "origin", "age"]);

// busca en lo que sabe → [{ fact, score, cover }] de más a menos parecido
// cover: qué parte de la pregunta encaja (1 = todas sus palabras)
export function searchFacts(list, query, { k = 5, now = Date.now() } = {}) {
  list = list || [];
  const q = [...new Set(terms(query))];
  if (!q.length || !list.length) return [];
  const docs = list.map((f) => { const t = terms(f.text); return { f, t, key: new Set(terms(f.key.replace(/[:]/g, " "))) }; });
  const N = docs.length, avg = docs.reduce((a, d) => a + d.t.length, 0) / N || 1;
  const df = (w) => docs.filter((d) => d.t.includes(w) || d.key.has(w)).length;
  const idf = Object.fromEntries(q.map((w) => [w, Math.log(1 + (N - df(w) + 0.5) / (df(w) + 0.5))]));
  const k1 = 1.2, b = 0.5;
  const out = [];
  for (const d of docs) {
    let score = 0, hit = 0;
    for (const w of q) {
      let tf = d.t.filter((x) => x === w).length;
      // «cumplea» encuentra «cumpleanos»; «tob» no vale: al menos 4 letras
      if (!tf && w.length >= 4) tf = d.t.filter((x) => x.length >= 4 && (x.startsWith(w) || w.startsWith(x))).length * 0.6;
      if (d.key.has(w)) { score += 1.2; tf = tf || 0.5; }
      if (!tf) continue;
      hit++;
      score += idf[w] * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * d.t.length / avg));
    }
    if (!hit) continue;
    // a igualdad, lo más reciente
    score += 0.15 * Math.exp(-(now - (d.f.upd || d.f.at || now)) / (180 * 864e5));
    out.push({ fact: d.f, score, cover: hit / q.length });
  }
  return out.sort((a, b2) => b2.score - a.score).slice(0, k);
}

// el dato al que se refiere («olvida lo de mi perro»)
export function findFactBy(list, text) {
  const [top] = searchFacts(list, text, { k: 1 });
  return top && top.cover >= 0.5 ? top.fact : null;
}

// lo que se manda a la IA: lo que tiene que ver con la pregunta, y lo básico de quién eres
export function relevantFacts(list, q, k = 8) {
  list = (list || []).filter((f) => !SPECIAL.has(f.kind));
  const out = [], add = (f) => { if (f && !out.includes(f) && out.length < k) out.push(f); };
  if (q) for (const h of searchFacts(list, q, { k })) if (h.cover >= 0.34) add(h.fact);
  for (const f of list) if (f.kind === "name") add(f);
  for (const f of [...list].reverse()) if (CORE.has(f.kind)) add(f);
  if (!q) for (const f of [...list].reverse()) add(f);
  return out;
}

// para contar lo que sabe: primero quién eres, luego lo más nuevo
export function factsOverview(list, k = 6) {
  list = (list || []).filter((f) => !SPECIAL.has(f.kind));
  const core = list.filter((f) => CORE.has(f.kind)), rest = [...list.filter((f) => !CORE.has(f.kind))].reverse();
  return [...core, ...rest].slice(0, k);
}

// las charlas que van al contexto: las que tienen que ver con la pregunta y, si no, las últimas (sin la de ahora)
export function recentEpisodes(list, q, { k = 2, now = Date.now(), skip } = {}) {
  const eps = pruneFacts(list, now).filter((f) => f.kind === "episode" && f.key !== skip);
  const out = q ? searchFacts(eps, q, { k, now }).filter((h) => h.cover >= 0.34).map((h) => h.fact) : [];
  for (const f of [...eps].reverse()) if (out.length < k && !out.includes(f)) out.push(f);
  return out;
}
// los planes de estos días: de hace 2 días a dentro de 2 semanas, por fecha
export const nearPlans = (list, now = Date.now(), k = 3) => pruneFacts(list, now)
  .filter((f) => f.kind === "plan" && Number.isFinite(f.due) && f.due > now - 2 * DAY_MS && f.due < now + 14 * DAY_MS)
  .sort((a, b) => a.due - b.due).slice(0, k);
// cómo quieres que te hable
export const prefsOf = (list) => (list || []).filter((f) => f.kind === "pref").map((f) => f.text).slice(-5);
