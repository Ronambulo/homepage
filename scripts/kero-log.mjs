// Saca del registro de fallos de Kero (data/kero-log.jsonl) las preguntas que aún no están en el banco
// (test/fixtures/questions.json), con la ruta que tomó hoy, para copiarlas al banco con la ruta buena.
// Uso: npm run kero-log            → lista de candidatas
//      npm run kero-log -- --json  → ya en el formato del banco (con want: "?" para rellenar)
import fs from "node:fs";
import path from "node:path";
import { route } from "../lib/lunares/router.js";
import { routeLabel } from "../lib/lunares/habits.js";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..");
const file = path.join(process.env.DATA_DIR || path.join(root, "data"), "kero-log.jsonl");
if (!fs.existsSync(file)) { console.log("No hay registro (" + file + "). Enciéndelo en Editar → Kero → Registro de fallos."); process.exit(0); }

const flat = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\d ]+/gu, " ").replace(/\s+/g, " ").trim();
const bench = JSON.parse(fs.readFileSync(path.join(root, "test/fixtures/questions.json"), "utf8")).cases;
const known = new Set(bench.map((c) => flat(c.q)));

// cada pregunta una vez, con cuántas veces y por qué ha fallado
const seen = new Map();
for (const line of fs.readFileSync(file, "utf8").split("\n").filter(Boolean)) {
  let e; try { e = JSON.parse(line); } catch { continue; }
  if (!e?.q || known.has(flat(e.q))) continue;
  const k = flat(e.q), s = seen.get(k) || { q: e.q, n: 0, why: new Set(), was: e.route, next: [] };
  s.n++; s.why.add(e.why); if (e.next) s.next.push(e.next);
  seen.set(k, s);
}
const list = [...seen.values()].sort((a, b) => b.n - a.n);
if (!list.length) { console.log("Nada nuevo: todo lo del registro ya está en el banco."); process.exit(0); }

if (process.argv.includes("--json")) {
  for (const s of list) console.log(`    { "q": ${JSON.stringify(s.q)}, "want": "?" },`);
} else {
  for (const s of list) {
    const now = routeLabel(route(s.q));
    console.log(`${s.n}× «${s.q}» — ${[...s.why].join(", ")}; fue por ${s.was}, hoy va por ${now}${s.next.length ? `; luego: «${s.next[0]}»` : ""}`);
  }
}
