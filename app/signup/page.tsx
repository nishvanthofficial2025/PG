import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Submit } from "@/components/client";
import { Flash } from "@/components/ui";
import { completeSignup } from "../login/actions";

export default async function Signup({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const sp = await searchParams;
  if (!(await cookies()).get("se_signup")) redirect("/login");
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
      <h1 className="text-2xl font-bold">Welcome to StayEasy</h1>
      <p className="mb-6 mt-1 text-stone-500">Set up your owner account. It takes a minute.</p>
      <Flash sp={sp} />
      <form action={completeSignup} className="card space-y-4 p-5">
        <div>
          <label className="label">Your name</label>
          <input name="name" className="input" required autoFocus />
        </div>
        <div>
          <label className="label">Business name (optional)</label>
          <input name="business_name" className="input" placeholder="e.g. Sai Balaji PG" />
        </div>
        <label className="flex items-start gap-3 text-sm text-stone-600">
          <input type="checkbox" name="consent" className="mt-1 h-5 w-5" required />
          <span>I agree to StayEasy storing my and my residents’ data to run my PG, as per the DPDP Act 2023. I can export or delete it anytime.</span>
        </label>
        <Submit>Create account</Submit>
      </form>
    </main>
  );
}
