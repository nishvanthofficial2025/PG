import Link from "next/link";
import { requireResident } from "@/lib/auth";
import { all } from "@/lib/db";
import { myStay } from "@/lib/resident";
import { inr, fmtDate, fmtMonth, thisMonth, addMonths, PAY_MODES } from "@/lib/format";
import { Flash, Section, Badge, Row } from "@/components/ui";
import { Submit } from "@/components/client";
import { uploadProofAction } from "../actions";

export default async function Payments({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const u = await requireResident();
  const stay = await myStay(u.id);
  const payments = await all<{ id: number; amount: number; mode: string; paid_at: string; receipt_no: string | null; status: string; month: string }>(
    `SELECT p.id, p.amount, p.mode, p.paid_at, p.receipt_no, p.status, i.month FROM payments p JOIN invoices i ON i.id = p.invoice_id JOIN stays s ON s.id = i.stay_id
     WHERE s.resident_id = ? ORDER BY p.paid_at DESC`,
    u.id,
  );
  const unpaid = await all<{ id: number; month: string; due: number }>(
    "SELECT i.id, i.month, i.total - i.paid due FROM invoices i JOIN stays s ON s.id = i.stay_id WHERE s.resident_id = ? AND i.status != 'paid' ORDER BY i.month",
    u.id,
  );
  const m = thisMonth();

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Payments</h1>
      <Flash sp={sp} />

      {stay && (
        <div className="card mb-6">
          <Row label="Monthly rent">{inr(stay.rent)}</Row>
          <Row label="Security deposit held">{inr(stay.deposit)}</Row>
        </div>
      )}

      <Section title="Rent receipt for HRA">
        <form action="/me/statement" className="card grid grid-cols-[1fr_1fr_auto] items-end gap-2">
          <div>
            <label className="label">From</label>
            <input type="month" name="from" className="input px-2" defaultValue={addMonths(m, -11)} />
          </div>
          <div>
            <label className="label">To</label>
            <input type="month" name="to" className="input px-2" defaultValue={m} />
          </div>
          <button className="btn-secondary">Get</button>
        </form>
      </Section>

      <Section title="History">
        {payments.length === 0 ? (
          <div className="card text-sm text-stone-500">No payments yet.</div>
        ) : (
          <ul className="card divide-y divide-stone-100 p-0">
            {payments.map((p) => (
              <li key={p.id}>
                {p.status === "confirmed" ? (
                  <Link href={`/receipt/${p.id}`} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <div className="font-semibold">{inr(p.amount)}</div>
                      <div className="text-xs text-stone-500">
                        {fmtMonth(p.month)} · {PAY_MODES[p.mode]} · {fmtDate(p.paid_at)}
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-brand-700">Receipt ↓</span>
                  </Link>
                ) : (
                  <div className="flex items-center justify-between px-4 py-3">
                    <div>
                      <div className="font-semibold">{inr(p.amount)}</div>
                      <div className="text-xs text-stone-500">
                        {fmtMonth(p.month)} · {fmtDate(p.paid_at)}
                      </div>
                    </div>
                    <Badge cls={p.status === "pending" ? "bg-amber-100 text-amber-900" : "bg-rose-100 text-rose-800"}>{p.status === "pending" ? "Awaiting confirmation" : "Not confirmed"}</Badge>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {unpaid.length > 0 && u.status !== "read_only" && (
        <Section title="Paid outside the app?">
          <form id="proof" action={uploadProofAction} className="card space-y-3">
            <select name="invoice_id" className="input">
              {unpaid.map((i) => (
                <option key={i.id} value={i.id}>
                  {fmtMonth(i.month)} — {inr(i.due)} due
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input name="amount" type="number" min={1} className="input" placeholder="Amount ₹" defaultValue={unpaid[0].due} required />
              <select name="mode" className="input">
                <option value="upi">UPI</option>
                <option value="bank">Bank transfer</option>
                <option value="cash">Cash</option>
              </select>
            </div>
            <input name="reference" className="input" placeholder="UPI reference / UTR number" />
            <div>
              <label className="label">Screenshot</label>
              <input name="proof" type="file" accept="image/*,application/pdf" className="block w-full text-sm" />
            </div>
            <Submit>Send to owner</Submit>
          </form>
        </Section>
      )}
    </>
  );
}
