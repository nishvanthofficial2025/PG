import Link from "next/link";
import { notFound } from "next/navigation";
import { requireResident } from "@/lib/auth";
import { get } from "@/lib/db";
import { inr, fmtMonth } from "@/lib/format";

export default async function Paid({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await requireResident();
  const p = get<{ id: number; amount: number; receipt_no: string; month: string; reference: string }>(
    "SELECT p.id, p.amount, p.receipt_no, p.reference, i.month FROM payments p JOIN invoices i ON i.id = p.invoice_id JOIN stays s ON s.id = i.stay_id WHERE p.id = ? AND s.resident_id = ?",
    Number(id),
    u.id,
  );
  if (!p) notFound();
  return (
    <div className="pt-10 text-center">
      <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-4xl text-emerald-700">✓</div>
      <h1 className="text-2xl font-bold">Payment successful</h1>
      <p className="mt-1 text-stone-600">
        {inr(p.amount)} for {fmtMonth(p.month)}
      </p>
      <p className="mt-1 font-mono text-xs text-stone-400">{p.reference}</p>
      <div className="mt-8 space-y-2">
        <Link href={`/receipt/${p.id}`} className="btn-primary w-full">
          Download receipt {p.receipt_no}
        </Link>
        <Link href="/me" className="btn-secondary w-full">
          Done
        </Link>
      </div>
    </div>
  );
}
