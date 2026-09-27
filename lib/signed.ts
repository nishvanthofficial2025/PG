import "server-only";
import crypto from "node:crypto";

/*
 * Tamper-proof cookie payloads: base64url(JSON) + "." + HMAC-SHA256.
 * Used for login sessions and the OTP step so they don't depend on any one
 * server's database — any instance holding SESSION_SECRET can verify them.
 */

/** Cookie holding the pending OTP step (see app/login/actions.ts). */
export const OTP_COOKIE = "se_login_otp";
export type PendingOtp = { p: string; h: string; a: number; c?: string };

function secret(): string {
  const s = process.env.SESSION_SECRET?.trim() || process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim();
  if (s) return s;
  // Never sign production cookies with a key that's public in the source.
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET is not set");
  return "stayeasy-local-dev-secret";
}

const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64url");
const mac = (data: string) => crypto.createHmac("sha256", secret()).update(data).digest("base64url");

/** Signs `payload` with an expiry `ttlSeconds` from now. */
export function sign(payload: Record<string, unknown>, ttlSeconds: number): string {
  const body = b64(JSON.stringify({ ...payload, exp: Date.now() + ttlSeconds * 1000 }));
  return `${body}.${mac(body)}`;
}

/** Returns the payload if the signature is valid and it hasn't expired, else null. */
export function verify<T extends Record<string, unknown>>(token: string | undefined): (T & { exp: number }) | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = Buffer.from(mac(body));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return typeof data.exp === "number" && data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}

/** Keyed hash so a secret (e.g. the OTP) can sit in a cookie without being readable. */
export function keyedHash(value: string): string {
  return mac("h:" + value);
}
