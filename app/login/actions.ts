"use server";

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { get, run, demoMode } from "@/lib/db";
import { createSession, destroySession } from "@/lib/auth";
import { sign, verify, keyedHash, OTP_COOKIE, type PendingOtp } from "@/lib/signed";
import { normalizePhone } from "@/lib/format";
import { sendOtp } from "@/lib/notify";
import { str } from "@/lib/action";

/*
 * The OTP step lives in a signed cookie (phone + keyed hash of the code +
 * attempt count), so request and verify can land on different servers.
 * TODO once SMS is live: also rate-limit per phone in the shared DB / Redis.
 */
const PENDING = OTP_COOKIE;
const SIGNUP = "se_signup";
const OTP_TTL = 10 * 60;
const MAX_ATTEMPTS = 5;

const cookieOpts = (maxAge: number) => ({ httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", maxAge, path: "/" });

export async function requestOtp(fd: FormData) {
  const phone = normalizePhone(str(fd, "phone"));
  if (!/^[6-9]\d{9}$/.test(phone)) redirect("/login?err=" + encodeURIComponent("Enter a valid 10-digit mobile number"));
  const code = String(crypto.randomInt(100000, 1000000));
  sendOtp(phone, code);
  const pending: PendingOtp = { p: phone, h: keyedHash(phone + ":" + code), a: 0 };
  if (demoMode()) pending.c = code; // shown on screen until an SMS provider is connected
  (await cookies()).set(PENDING, sign(pending, OTP_TTL), cookieOpts(OTP_TTL));
  redirect("/login?step=otp");
}

export async function verifyOtp(fd: FormData) {
  const jar = await cookies();
  const pending = verify<PendingOtp>(jar.get(PENDING)?.value);
  if (!pending) redirect("/login?err=" + encodeURIComponent("OTP expired. Please request a new one."));
  if (pending.a >= MAX_ATTEMPTS) {
    jar.delete(PENDING);
    redirect("/login?err=" + encodeURIComponent("Too many attempts. Request a new OTP."));
  }
  const code = str(fd, "code");
  if (keyedHash(pending.p + ":" + code) !== pending.h) {
    const { exp, ...rest } = pending;
    const left = Math.max(1, Math.round((exp - Date.now()) / 1000));
    jar.set(PENDING, sign({ ...rest, a: pending.a + 1 }, left), cookieOpts(left));
    redirect("/login?step=otp&err=" + encodeURIComponent("Wrong OTP, try again"));
  }
  jar.delete(PENDING);
  const phone = pending.p;

  const user = await get<{ id: number; role: string; status: string }>("SELECT id, role, status FROM users WHERE phone = ?", phone);
  if (!user) {
    // New number → owner sign-up (residents are always invited by an owner).
    jar.set(SIGNUP, sign({ p: phone }, 15 * 60), cookieOpts(15 * 60));
    redirect("/signup");
  }
  await createSession(user.id);
  if (user.role === "resident") redirect(user.status === "invited" ? "/me/welcome" : "/me");
  redirect("/owner");
}

export async function completeSignup(fd: FormData) {
  const jar = await cookies();
  const signup = verify<{ p: string }>(jar.get(SIGNUP)?.value);
  if (!signup) redirect("/login?err=" + encodeURIComponent("Session expired, please log in again"));
  const name = str(fd, "name");
  const business = str(fd, "business_name");
  if (!name || !fd.get("consent")) redirect("/signup?err=" + encodeURIComponent("Enter your name and accept the privacy terms"));
  const existing = await get<{ id: number }>("SELECT id FROM users WHERE phone = ?", signup.p);
  const id = existing?.id ?? (await run("INSERT INTO users (name, phone, role, business_name) VALUES (?, ?, 'owner', ?)", name, signup.p, business || null)).id;
  if (!existing) await run("UPDATE users SET owner_id = id WHERE id = ?", id);
  jar.delete(SIGNUP);
  await createSession(id);
  redirect(existing ? "/" : "/owner/properties/new?first=1");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
