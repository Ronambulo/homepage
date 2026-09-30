import fs from "node:fs/promises";
import path from "node:path";
import { DATA_DIR } from "./store";

const FILE = path.join(DATA_DIR, "secrets.json");
export const SECRET_KEYS = ["haToken", "ghToken", "dpUser", "dpPass", "icsUrl", "zimaUser", "zimaPass", "immichKey"];

export async function readSecrets() {
  try {
    const j = JSON.parse(await fs.readFile(FILE, "utf8")) || {};
    return Object.fromEntries(SECRET_KEYS.filter((k) => typeof j[k] === "string" && j[k]).map((k) => [k, j[k]]));
  } catch { return {}; }
}

// patch: { clave: "valor" | "" } ("" borra). Ignora claves desconocidas.
export async function writeSecrets(patch) {
  const cur = await readSecrets();
  for (const k of SECRET_KEYS) {
    if (typeof patch?.[k] !== "string") continue;
    const v = patch[k].trim().slice(0, 600);
    if (v) cur[k] = v; else delete cur[k];
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = FILE + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(cur), { mode: 0o600 });
  await fs.rename(tmp, FILE);
  return cur;
}
