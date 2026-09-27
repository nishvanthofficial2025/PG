import "server-only";
import { run } from "./db";

/*
 * v1: every notification is stored in-app (residents see them on Home) and
 * logged to the server console. Real channels (WhatsApp via Interakt/Gupshup,
 * SMS via MSG91, email via Resend, web push) plug in here.
 */
export function notify(userId: number, title: string, body?: string) {
  run("INSERT INTO notifications (user_id, title, body) VALUES (?, ?, ?)", userId, title, body ?? null);
  if (process.env.NODE_ENV !== "production") console.log(`[notify] user=${userId} ${title} — ${body ?? ""}`);
}

export function sendOtp(phone: string, code: string) {
  // TODO: MSG91 / Firebase / Supabase phone auth.
  console.log(`[otp] ${phone}: ${code}`);
}
