import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { demoMode } from "@/lib/db";
import { verify, OTP_COOKIE, type PendingOtp } from "@/lib/signed";
import { currentUser } from "@/lib/auth";
import { Submit } from "@/components/client";
import { Flash } from "@/components/ui";
import { requestOtp, verifyOtp } from "./actions";

const DEMO = [
  { who: "Owner · Ramesh", phone: "9876500001" },
  { who: "Manager · Suresh", phone: "9876500002" },
  { who: "Resident · Priya", phone: "9876500003" },
];

export default async function Login({ searchParams }: { searchParams: Promise<{ step?: string; err?: string }> }) {
  const sp = await searchParams;
  if (await currentUser()) redirect("/");
  const pending = verify<PendingOtp>((await cookies()).get(OTP_COOKIE)?.value);
  const phone = pending?.p;
  const otpStep = sp.step === "otp" && phone;
  const dev = demoMode();
  const devCode = otpStep && dev ? pending?.c : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
      <div className="mb-8 text-center">
        <img src="/icon.svg" alt="" className="mx-auto mb-3 h-14 w-14" />
        <h1 className="text-3xl font-bold tracking-tight">StayEasy</h1>
        <p className="mt-1 text-stone-500">Your PG, on one screen.</p>
      </div>
      <Flash sp={sp} />

      {!otpStep ? (
        <form action={requestOtp} className="card space-y-4 p-5">
          <div>
            <label className="label" htmlFor="phone">
              Mobile number
            </label>
            <div className="flex gap-2">
              <span className="input w-16 shrink-0 text-center text-stone-500">+91</span>
              <input id="phone" name="phone" className="input" inputMode="numeric" autoComplete="tel-national" maxLength={10} placeholder="98765 43210" required autoFocus />
            </div>
          </div>
          <Submit>Send OTP</Submit>
          <p className="text-center text-xs text-stone-500">No password needed. New owners can sign up with the same button.</p>
        </form>
      ) : (
        <form action={verifyOtp} className="card space-y-4 p-5">
          <div>
            <label className="label" htmlFor="code">
              Enter the 6-digit OTP sent to +91 {phone}
            </label>
            <input id="code" name="code" className="input text-center text-2xl tracking-[.5em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required autoFocus />
          </div>
          {devCode && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Demo mode — your OTP is <b className="font-mono">{devCode}</b>
            </p>
          )}
          <Submit>Verify &amp; continue</Submit>
          <a href="/login" className="block text-center text-sm font-medium text-brand-700">
            Change number
          </a>
        </form>
      )}

      {dev && !otpStep && (
        <div className="mt-6 rounded-2xl border border-dashed border-stone-300 p-4 text-sm">
          <div className="mb-2 font-semibold text-stone-600">Demo accounts</div>
          <div className="space-y-2">
            {DEMO.map((d) => (
              <form key={d.phone} action={requestOtp} className="flex items-center justify-between">
                <input type="hidden" name="phone" value={d.phone} />
                <span className="text-stone-600">{d.who}</span>
                <button className="font-mono font-medium text-brand-700 underline">{d.phone}</button>
              </form>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
