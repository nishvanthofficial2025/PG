import { redirect } from "next/navigation";
import { requireResident } from "@/lib/auth";
import { myStay } from "@/lib/resident";
import { inr, fmtDate } from "@/lib/format";
import { Flash } from "@/components/ui";
import { Submit } from "@/components/client";
import { completeWelcomeAction } from "../actions";

/** First login after the owner's invite: confirm details, upload ID, accept rules. */
export default async function Welcome({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const sp = await searchParams;
  const u = await requireResident();
  if (u.status !== "invited") redirect("/me");
  const stay = myStay(u.id);
  return (
    <>
      <h1 className="text-2xl font-bold">Welcome, {u.name.split(" ")[0]}!</h1>
      <p className="mb-4 text-stone-500">Three quick things and you’re in.</p>
      <Flash sp={sp} />
      {stay && (
        <div className="card mb-4 text-sm">
          <div className="font-semibold">{stay.property}</div>
          <div className="text-stone-600">
            Bed {stay.bed} · {inr(stay.rent)}/month · Deposit {inr(stay.deposit)} · From {fmtDate(stay.move_in)}
          </div>
        </div>
      )}
      <form action={completeWelcomeAction} className="space-y-4">
        <div className="card space-y-3">
          <div className="font-bold">1. Emergency contact</div>
          <input name="emergency_name" className="input" placeholder="Name & relation, e.g. Father" />
          <input name="emergency_phone" className="input" inputMode="numeric" placeholder="Phone number" required />
          <input name="permanent_address" className="input" placeholder="Permanent address" />
          <input name="email" type="email" className="input" placeholder="Email (for receipts)" defaultValue={u.email ?? ""} />
        </div>
        <div className="card space-y-3">
          <div className="font-bold">2. ID proof</div>
          <select name="type" className="input">
            <option value="aadhaar">Aadhaar</option>
            <option value="pan">PAN</option>
            <option value="passport">Passport</option>
          </select>
          <input name="file" type="file" accept="image/*,application/pdf" className="block w-full text-sm" />
          <p className="text-xs text-stone-500">Stored privately. You can also do this later from Profile.</p>
        </div>
        <div className="card space-y-3">
          <div className="font-bold">3. House rules</div>
          <div className="max-h-48 overflow-y-auto whitespace-pre-line rounded-xl bg-stone-50 p-3 text-sm">{stay?.rules ?? "Follow the PG’s rules and pay rent by the due date."}</div>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="accept" className="mt-0.5 h-5 w-5" required />
            <span>I accept the house rules and the rental terms above, and consent to my data being stored for my stay (DPDP Act 2023).</span>
          </label>
        </div>
        <Submit>Finish setup</Submit>
      </form>
    </>
  );
}
