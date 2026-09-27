import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { get } from "@/lib/db";
import { inr, fmtDate } from "@/lib/format";
import { Flash, Row } from "@/components/ui";
import { PrintButton, Submit } from "@/components/client";
import { refundPaidAction } from "../../actions";

export default async function Settlement({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const u = await requireStaff();
  const s = get<{
    id: number; property_id: number; resident_id: number; move_in: string; move_out: string; notice_date: string | null; rent: number; deposit: number;
    deductions: number; deduction_note: string | null; refund_amount: number; refund_paid_at: string | null; name: string; phone: string; bed: string; property: string; address: string | null;
  }>(
    `SELECT s.*, u.name, u.phone, b.label bed, p.name property, p.address FROM stays s JOIN users u ON u.id = s.resident_id JOIN beds b ON b.id = s.bed_id JOIN properties p ON p.id = s.property_id
     WHERE s.id = ? AND s.status = 'closed'`,
    Number(id),
  );
  if (!s || !u.propertyIds.includes(s.property_id)) notFound();
  const dues = s.deposit - s.deductions - s.refund_amount;

  return (
    <main className="mx-auto max-w-lg">
      <Flash sp={sp} />
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href={`/owner/residents/${s.resident_id}`} className="text-sm font-medium text-brand-700">
          ← Back
        </Link>
        <PrintButton />
      </div>
      <div className="rounded-2xl border border-stone-200 bg-white p-6 print:border-0">
        <div className="mb-4 border-b border-stone-200 pb-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">Move-out settlement</div>
          <div className="text-xl font-bold">{s.property}</div>
          <div className="text-xs text-stone-500">{s.address}</div>
        </div>
        <Row label="Resident">
          {s.name} · +91 {s.phone}
        </Row>
        <Row label="Bed">{s.bed}</Row>
        <Row label="Stay">
          {fmtDate(s.move_in)} – {fmtDate(s.move_out)}
        </Row>
        {s.notice_date && <Row label="Notice given">{fmtDate(s.notice_date)}</Row>}
        <div className="my-3 rounded-xl bg-stone-50 p-3">
          <Row label="Security deposit">{inr(s.deposit)}</Row>
          <Row label="Pending dues adjusted">− {inr(dues)}</Row>
          <Row label={`Deductions${s.deduction_note ? ` (${s.deduction_note})` : ""}`}>− {inr(s.deductions)}</Row>
          <Row label={s.refund_amount >= 0 ? "Refund to resident" : "Resident still owes"}>
            <span className="text-lg font-bold">{inr(Math.abs(s.refund_amount))}</span>
          </Row>
        </div>
        <Row label="Refund status">{s.refund_paid_at ? `Paid on ${fmtDate(s.refund_paid_at)}` : "Pending"}</Row>
      </div>
      {!s.refund_paid_at && s.refund_amount > 0 && u.role === "owner" && (
        <form action={refundPaidAction} className="no-print mt-4">
          <input type="hidden" name="stay_id" value={s.id} />
          <Submit confirm={`Confirm you have paid ${inr(s.refund_amount)} to ${s.name}?`}>Mark refund as paid</Submit>
        </form>
      )}
    </main>
  );
}
