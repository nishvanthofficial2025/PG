import { Submit } from "./client";
import { PAY_MODES } from "@/lib/format";
import { recordPaymentAction } from "@/app/owner/actions";

/** Record a cash / UPI / bank payment in ~10 seconds (Suresh's flow). */
export function RecordPaymentForm({ invoiceId, due, back }: { invoiceId: number; due: number; back: string }) {
  return (
    <form action={recordPaymentAction} className="space-y-3">
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <input type="hidden" name="back" value={back} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Amount (₹)</label>
          <input name="amount" type="number" min={1} className="input" defaultValue={due} required />
        </div>
        <div>
          <label className="label">Mode</label>
          <select name="mode" className="input" defaultValue="cash">
            {Object.entries(PAY_MODES)
              .filter(([k]) => k !== "gateway")
              .map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
          </select>
        </div>
      </div>
      <details>
        <summary className="cursor-pointer text-sm font-semibold text-brand-700">Add reference / screenshot</summary>
        <div className="mt-3 space-y-3">
          <input name="reference" className="input" placeholder="UPI ref / txn id" />
          <input name="note" className="input" placeholder="Note (e.g. rest by 15th)" />
          <input name="proof" type="file" accept="image/*,application/pdf" className="block w-full text-sm" />
        </div>
      </details>
      <Submit pendingText="Saving…">Record payment</Submit>
    </form>
  );
}
