// Cliente mínimo de la API de bots de Telegram (https://core.telegram.org/bots/api). El token nunca sale del servidor.
// → { ok, result } o { ok: false, status, error }
export async function tg(token, method, body = {}, ms = 15000) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(ms),
      cache: "no-store",
    });
    const j = await r.json().catch(() => null);
    if (j?.ok) return { ok: true, result: j.result };
    return { ok: false, status: r.status, error: j?.description || "Telegram " + r.status };
  } catch (e) {
    return { ok: false, status: 0, error: e?.name === "TimeoutError" ? "tiempo agotado" : "sin conexión" };
  }
}

// Telegram corta en 4096 caracteres
export const send = (token, chat, text, extra = {}) => tg(token, "sendMessage", { chat_id: chat, text: String(text).slice(0, 4000), disable_web_page_preview: true, ...extra });
