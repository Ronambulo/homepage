import { readConfig } from "@/lib/store";
import { readSecrets } from "@/lib/secrets";

// Datos para hablar con OpenWebUI desde el servidor (la clave nunca llega al navegador).
export async function owui() {
  const cfg = await readConfig();
  const { owuiKey } = await readSecrets();
  return {
    co: cfg.companion || {},
    base: (cfg.integrations?.owui?.url || "").replace(/\/+$/, ""),
    headers: { "Content-Type": "application/json", ...(owuiKey ? { Authorization: `Bearer ${owuiKey}` } : {}) },
  };
}
