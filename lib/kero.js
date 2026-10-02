// Lo que Kero sabe de ti, guardado en el servidor (data/kero.json): el mismo en todos tus dispositivos
// y dentro de la copia de seguridad. La lógica (clasificar, sustituir, buscar) está en lib/lunares/memory.js.
import fs from "node:fs/promises";
import path from "node:path";
import { DATA_DIR } from "./store";
import { tidyFacts } from "./lunares/memory.js";
import { rotate } from "./lunares/log.js";

const FILE = path.join(DATA_DIR, "kero.json");

export async function readMemory() {
  try { return tidyFacts(JSON.parse(await fs.readFile(FILE, "utf8"))?.facts); } catch { return []; }
}

export async function writeMemory(facts) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = FILE + ".tmp";
  await fs.writeFile(tmp, JSON.stringify({ version: 1, facts: tidyFacts(facts) }, null, 1));
  await fs.rename(tmp, FILE);
}

// cambios de uno en uno (dos pestañas a la vez no se pisan)
let chain = Promise.resolve();
export function changeMemory(fn) {
  const p = chain.then(async () => {
    const next = tidyFacts(await fn(await readMemory()));
    await writeMemory(next);
    return next;
  });
  chain = p.catch(() => {});
  return p;
}

/* ---------- registro de fallos (fase 0.2): data/kero-log.jsonl, una línea por fallo, las 500 últimas ---------- */
const LOG = path.join(DATA_DIR, "kero-log.jsonl");

export async function readLog() {
  try { return (await fs.readFile(LOG, "utf8")).split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return []; }
}

let logChain = Promise.resolve();
// entries: líneas ya limpias (logEntry); [] con clear = true lo vacía
export function writeLog(entries, clear = false) {
  const p = logChain.then(async () => {
    const next = rotate(clear ? [] : await readLog(), entries);
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tmp = LOG + ".tmp";
    await fs.writeFile(tmp, next.map((e) => JSON.stringify(e)).join("\n") + (next.length ? "\n" : ""));
    await fs.rename(tmp, LOG);
    return next.length;
  });
  logChain = p.catch(() => {});
  return p;
}
