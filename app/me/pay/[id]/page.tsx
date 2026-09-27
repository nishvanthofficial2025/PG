import Link from "next/link";
import { notFound } from "next/navigation";
import { requireResident } from "@/lib/auth";
import { get } from "@/lib/db";
import { inr, fmtMonth } from "@/lib/format";
import { Flash } from "@/components/ui";
import { Submit } from "@/components/client";
import { payOnlineAction } from "../../actions";

/** Checkout. In v1 the gateway is simulated (test mode) — see payOnlineAction. */
export default async function Pay({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const u = await requireResident();
  const inv = get<{ id: number; month: string; total: number; paid: number; property: string }>(
    "SELECT i.id, i.month, i.total, i.paid, p.name property FROM invoices i JOIN stays s ON s.id = i.stay_id JOIN properties p ON p.id = i.property_id WHERE i.id = ? AND s.resident_id = ?",
    Number(id),
    u.id,
  );
  if (!inv) notFound();
  const due = inv.total - inv.paid;

  return (
    <>
      <Link href="/me" className="text-sm font-medium text-brand-700">
        ← Back
      </Link>
      <h1 className="mb-1 mt-2 text-2xl font-bold">Pay rent</h1>
      <p className="mb-4 text-sm text-stone-500">
        {inv.property} · {fmtMonth(inv.month)}
      </p>
      <Flash sp={sp} />
      {due <= 0 ? (
        <div className="card">This invoice is fully paid.</div>
      ) : (
        <form action={payOnlineAction} className="space-y-4">
          <input type="hidden" name="invoice_id" value={inv.id} />
          <div className="card">
            <label className="label">Amount</label>
            <input name="amount" type="number" min={1} max={due} defaultValue={due} className="input text-2xl font-bold" inputMode="numeric" />
            <p className="mt-1 text-xs text-stone-500">You can pay part now and the rest later.</p>
          </div>
          <div className="card space-y-2">
            <div className="label">Pay with</div>
            {[
              ["UPI", "Google Pay, PhonePe, Paytm, BHIM"],
              ["Card", "Debit / credit card"],
              ["Netbanking", "All major banks"],
            ].map(([m, d], i) => (
              <label key={m} className="flex cursor-pointer items-center gap-3 rounded-xl border border-stone-200 p-3 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
                <input type="radio" name="method" value={m} defaultChecked={i === 0} className="h-5 w-5 accent-brand-600" />
                <div>
                  <div className="font-semibold">{m}</div>
                  <div className="text-xs text-stone-500">{d}</div>
                </div>
              </label>
            ))}
          </div>
          <div className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">Test mode: no real money moves. The payment gateway (Razorpay / Cashfree) plugs in here.</div>
          <Submit pendingText="Processing payment…">Pay securely</Submit>
        </form>
      )}
    </>
  );
}
