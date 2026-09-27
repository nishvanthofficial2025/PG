import Link from "next/link";
import { requireResident } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { myStay } from "@/lib/resident";
import { inr, fmtDate, fmtMonth, thisMonth, addMonths, today, PAY_MODES } from "@/lib/format";
import { PrintButton } from "@/components/client";

/** Consolidated rent receipt for a date range (for HRA / income-tax proof). */
export default async function Statement({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  const u = await requireResident();
  const valid = (m?: string) => (m && /^\d{4}-\d{2}$/.test(m) ? m : undefined);
  const to = valid(sp.to) ?? thisMonth();
  const from = valid(sp.from) ?? addMonths(to, -11);
  const stay = myStay(u.id);
  const owner = stay ? get<{ name: string; business_name: string | null }>("SELECT name, business_name FROM users WHERE id = ?", stay.owner_id) : undefined;
  const rows = all<{ month: string; amount: number; mode: string; paid_at: string; receipt_no: string; bed: string; property: string; address: string | null }>(
    `SELECT i.month, p.amount, p.mode, p.paid_at, p.receipt_no, b.label bed, pr.name property, pr.address FROM payments p JOIN invoices i ON i.id = p.invoice_id
     JOIN stays s ON s.id = i.stay_id JOIN beds b ON b.id = s.bed_id JOIN properties pr ON pr.id = i.property_id
     WHERE s.resident_id = ? AND p.status = 'confirmed' AND i.month BETWEEN ? AND ? ORDER BY i.month, p.paid_at`,
    u.id,
    from,
    to,
  );
  const total = rows.reduce((a, r) => a + r.amount, 0);

  return (
    <div>
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href="/me/payments" className="text-sm font-medium text-brand-700">
          ← Back
        </Link>
        <PrintButton />
      </div>
      <div className="rounded-2xl border border-stone-200 bg-white p-5 print:border-0">
        <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">Rent receipt</div>
        <div className="text-lg font-bold">
          {fmtMonth(from)} – {fmtMonth(to)}
        </div>
        <p className="my-3 text-sm leading-relaxed">
          This is to certify that <b>{u.name}</b> has paid a total rent of <b>{inr(total)}</b> for accommodation at <b>{stay?.property}</b>
          {stay?.address ? `, ${stay.address}` : ""} for the period above, as detailed below.
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-xs uppercase text-stone-500">
              <th className="py-1">Month</th>
              <th className="py-1">Receipt</th>
              <th className="py-1 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-stone-100">
                <td className="py-1.5">{fmtMonth(r.month)}</td>
                <td className="py-1.5 text-xs text-stone-500">
                  {r.receipt_no} · {PAY_MODES[r.mode]} · {fmtDate(r.paid_at)}
                </td>
                <td className="py-1.5 text-right">{inr(r.amount)}</td>
              </tr>
            ))}
            <tr className="font-bold">
              <td className="py-2" colSpan={2}>
                Total
              </td>
              <td className="py-2 text-right">{inr(total)}</td>
            </tr>
          </tbody>
        </table>
        <div className="mt-8 flex items-end justify-between text-sm">
          <div className="text-xs text-stone-500">Generated {fmtDate(today())}</div>
          <div className="text-right">
            <div className="font-semibold">{owner?.name}</div>
            <div className="text-xs text-stone-500">{owner?.business_name ?? "Owner / Landlord"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
