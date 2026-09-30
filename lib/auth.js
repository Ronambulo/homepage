import crypto from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "hp_admin";

export const authEnabled = () => !!process.env.ADMIN_PASSWORD;

function token() {
  return crypto.createHmac("sha256", process.env.ADMIN_PASSWORD || "").update("homepage-admin-v1").digest("hex");
}

export function passwordOk(pw) {
  const a = crypto.createHash("sha256").update(String(pw ?? "")).digest();
  const b = crypto.createHash("sha256").update(process.env.ADMIN_PASSWORD || "").digest();
  return crypto.timingSafeEqual(a, b);
}

export async function isAuthed() {
  if (!authEnabled()) return true;
  const v = (await cookies()).get(COOKIE)?.value;
  if (!v || v.length !== 64) return false;
  return crypto.timingSafeEqual(Buffer.from(v), Buffer.from(token()));
}

export const cookieOptions = () => ({
  name: COOKIE,
  value: token(),
  httpOnly: true,
  sameSite: "strict",
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
  // Se sirve normalmente por HTTP en la LAN; activa COOKIE_SECURE=1 detrás de HTTPS.
  secure: process.env.COOKIE_SECURE === "1",
});

export const COOKIE_NAME = COOKIE;
