"use server";

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { get, run } from "@/lib/db";
import { createSession, destroySession } from "@/lib/auth";
import { normalizePhone } from "@/lib/format";
import { sendOtp } from "@/lib/notify";
import { str } from "@/lib/action";

const PENDING = "se_login_phone";
const SIGNUP = "se_signup";

export async function requestOtp(fd: FormData) {
  const phone = normalizePhone(str(fd, "phone"));
  if (!/^[6-9]\d{9}$/.test(phone)) redirect("/login?err=" + encodeURIComponent("Enter a valid 10-digit mobile number"));
  const code = String(crypto.randomInt(100000, 1000000));
  await run(
    `INSERT INTO otps (phone, code, attempts, expires_at) VALUES (?, ?, 0, ?)
     ON CONFLICT(phone) DO UPDATE SET code = excluded.code, attempts = 0, expires_at = excluded.expires_at`,
    phone,
    code,
    new Date(Date.now() + 10 * 60_000).toISOString(),
  );
  sendOtp(phone, code);
  (await cookies()).set(PENDING, phone, { httpOnly: true, sameSite: "lax", maxAge: 600, path: "/" });
  redirect("/login?step=otp");
}

export async function verifyOtp(fd: FormData) {
  const jar = await cookies();
  const phone = jar.get(PENDING)?.value;
  if (!phone) redirect("/login");
  const code = str(fd, "code");
  const row = await get<{ code: string; attempts: number; expires_at: string }>("SELECT * FROM otps WHERE phone = ?", phone);
  if (!row || row.expires_at < new Date().toISOString()) redirect("/login?err=" + encodeURIComponent("OTP expired. Please request a new one."));
  if (row.attempts >= 5) redirect("/login?err=" + encodeURIComponent("Too many attempts. Request a new OTP."));
  if (row.code !== code) {
    await run("UPDATE otps SET attempts = attempts + 1 WHERE phone = ?", phone);
    redirect("/login?step=otp&err=" + encodeURIComponent("Wrong OTP, try again"));
  }
  await run("DELETE FROM otps WHERE phone = ?", phone);
  jar.delete(PENDING);

  const user = await get<{ id: number; role: string; status: string }>("SELECT id, role, status FROM users WHERE phone = ?", phone);
  if (!user) {
    // New number → owner sign-up (residents are always invited by an owner).
    const token = crypto.randomBytes(24).toString("hex");
    await run("INSERT INTO otps (phone, code, expires_at) VALUES (?, ?, ?)", phone, "signup:" + token, new Date(Date.now() + 15 * 60_000).toISOString());
    jar.set(SIGNUP, token, { httpOnly: true, sameSite: "lax", maxAge: 900, path: "/" });
    redirect("/signup");
  }
  await createSession(user.id);
  if (user.role === "resident") redirect(user.status === "invited" ? "/me/welcome" : "/me");
  redirect("/owner");
}

export async function completeSignup(fd: FormData) {
  const jar = await cookies();
  const token = jar.get(SIGNUP)?.value;
  const row = token ? await get<{ phone: string; expires_at: string }>("SELECT phone, expires_at FROM otps WHERE code = ?", "signup:" + token) : undefined;
  if (!row || row.expires_at < new Date().toISOString()) redirect("/login?err=" + encodeURIComponent("Session expired, please log in again"));
  const name = str(fd, "name");
  const business = str(fd, "business_name");
  if (!name || !fd.get("consent")) redirect("/signup?err=" + encodeURIComponent("Enter your name and accept the privacy terms"));
  const id = (await run("INSERT INTO users (name, phone, role, business_name) VALUES (?, ?, 'owner', ?)", name, row.phone, business || null)).id;
  await run("UPDATE users SET owner_id = id WHERE id = ?", id);
  await run("DELETE FROM otps WHERE phone = ?", row.phone);
  jar.delete(SIGNUP);
  await createSession(id);
  redirect("/owner/properties/new?first=1");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
