import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser, accessiblePropertyIds } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { inr, fmtDate, fmtMonth, PAY_MODES } from "@/lib/format";
import { PrintButton } from "@/components/client";

/** Printable rent receipt (browser "Save as PDF"). Useful for HRA claims. */
export default async function Receipt({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await currentUser();
  if (!u) redirect("/login");
  const p = get<{
    id: number; amount: number; mode: string; reference: string | null; paid_at: string; receipt_no: string; invoice_id: number; month: string;
    property_id: number; resident_id: number; resident: string; phone: string; bed: string; property: string; address: string | null;
    owner: string; business: string | null; total: number; paid: number;
  }>(
    `SELECT pay.*, i.month, i.property_id, i.total, i.paid, s.resident_id, r.name resident, r.phone, b.label bed, pr.name property, pr.address, o.name owner, o.business_name business
     FROM payments pay JOIN invoices i ON i.id = pay.invoice_id JOIN stays s ON s.id = i.stay_id JOIN users r ON r.id = s.resident_id
     JOIN beds b ON b.id = s.bed_id JOIN properties pr ON pr.id = i.property_id JOIN users o ON o.id = pr.owner_id
     WHERE pay.id = ? AND pay.status = 'confirmed'`,
    Number(id),
  );
  if (!p) notFound();
  const allowed = u.role === "resident" ? p.resident_id === u.id : accessiblePropertyIds(u).includes(p.property_id);
  if (!allowed) notFound();
  const items = all<{ label: string; amount: number }>("SELECT label, amount FROM invoice_items WHERE invoice_id = ? ORDER BY id", p.invoice_id);

  return (
    <main className="mx-auto max-w-lg px-4 py-6">
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href={u.role === "resident" ? "/me/payments" : `/owner/residents/${p.resident_id}`} className="text-sm font-medium text-brand-700">
          ← Back
        </Link>
        <PrintButton />
      </div>
      <div className="rounded-2xl border border-stone-200 bg-white p-6 print:border-0 print:p-0">
        <div className="flex items-start justify-between border-b border-stone-200 pb-4">
          <div>
            <div className="text-xl font-bold">{p.business ?? p.property}</div>
            <div className="text-sm text-stone-600">{p.property}</div>
            <div className="text-xs text-stone-500">{p.address}</div>
          </div>
          <div className="text-right">
            <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">Rent receipt</div>
            <div className="whitespace-nowrap font-mono font-bold">{p.receipt_no}</div>
            <div className="text-sm">{fmtDate(p.paid_at)}</div>
          </div>
        </div>

        <p className="py-4 text-sm leading-relaxed">
          Received with thanks from <b>{p.resident}</b> (+91 {p.phone}), resident of bed <b>{p.bed}</b>, the sum of <b>{inr(p.amount)}</b> towards accommodation charges for{" "}
          <b>{fmtMonth(p.month)}</b>, paid by {PAY_MODES[p.mode]?.toLowerCase()}
          {p.reference ? ` (ref. ${p.reference})` : ""}.
        </p>

        <table className="w-full text-sm">
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="border-b border-stone-100">
                <td className="py-1.5">{it.label}</td>
                <td className="py-1.5 text-right">{inr(it.amount)}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="py-1.5">Invoice total</td>
              <td className="py-1.5 text-right">{inr(p.total)}</td>
            </tr>
            <tr>
              <td className="py-1.5">This payment</td>
              <td className="py-1.5 text-right font-bold">{inr(p.amount)}</td>
            </tr>
            <tr className="text-stone-600">
              <td className="py-1.5">Balance for the month</td>
              <td className="py-1.5 text-right">{inr(Math.max(p.total - p.paid, 0))}</td>
            </tr>
          </tbody>
        </table>

        <div className="mt-8 flex items-end justify-between">
          <div className="text-xs text-stone-500">Computer-generated receipt. No signature required.</div>
          <div className="text-right text-sm">
            <div className="font-semibold">{p.owner}</div>
            <div className="text-xs text-stone-500">Owner / Landlord</div>
          </div>
        </div>
      </div>
    </main>
  );
}
