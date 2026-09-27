import Link from "next/link";
import { requireStaff, inList } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { scopeIds } from "@/lib/scope";
import { inr, fmtDate, fmtMonth, thisMonth, addMonths, today, INVOICE_STATUS, PAY_MODES } from "@/lib/format";
import { PageHeader, Flash, Stat, Section, Badge, Empty } from "@/components/ui";
import { Submit } from "@/components/client";
import { RecordPaymentForm } from "@/components/payment-form";
import { generateInvoicesAction, remindAllAction, applyLateFeesAction, electricityAction, confirmProofAction } from "../actions";

const FILTERS = ["all", "unpaid", "overdue", "paid"] as const;

export default async function Rent({ searchParams }: { searchParams: Promise<{ month?: string; filter?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const u = await requireStaff();
  const { ids } = await scopeIds(u);
  const q = inList(ids);
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : thisMonth();
  const filter = (FILTERS as readonly string[]).includes(sp.filter ?? "") ? sp.filter! : "all";
  const t = today();

  const invoices = all<{ id: number; resident_id: number; name: string; bed: string; property: string; total: number; paid: number; status: string; due_date: string }>(
    `SELECT i.id, s.resident_id, u.name, b.label bed, p.name property, i.total, i.paid, i.status, i.due_date
     FROM invoices i JOIN stays s ON s.id = i.stay_id JOIN users u ON u.id = s.resident_id JOIN beds b ON b.id = s.bed_id JOIN properties p ON p.id = i.property_id
     WHERE i.month = ? AND i.property_id IN (${q}) ORDER BY (i.status = 'paid'), i.due_date, b.label`,
    month,
    ...ids,
  );
  const expected = invoices.reduce((a, i) => a + i.total, 0);
  const collected = invoices.reduce((a, i) => a + i.paid, 0);
  const overdueRows = invoices.filter((i) => i.status !== "paid" && i.due_date < t);
  const overdue = overdueRows.reduce((a, i) => a + i.total - i.paid, 0);
  const shown = invoices.filter((i) => (filter === "all" ? true : filter === "paid" ? i.status === "paid" : filter === "unpaid" ? i.status !== "paid" : i.status !== "paid" && i.due_date < t));
  const activeStays = get<{ n: number }>(`SELECT COUNT(*) n FROM stays WHERE status IN ('active','notice') AND property_id IN (${q})`, ...ids)!.n;
  const missing = Math.max(0, activeStays - invoices.length);

  const proofs = all<{ id: number; amount: number; mode: string; reference: string | null; proof_file_id: string | null; paid_at: string; name: string; bed: string; month: string }>(
    `SELECT p.id, p.amount, p.mode, p.reference, p.proof_file_id, p.paid_at, u.name, b.label bed, i.month
     FROM payments p JOIN invoices i ON i.id = p.invoice_id JOIN stays s ON s.id = i.stay_id JOIN users u ON u.id = s.resident_id JOIN beds b ON b.id = s.bed_id
     WHERE p.status = 'pending' AND i.property_id IN (${q}) ORDER BY p.paid_at`,
    ...ids,
  );
  const rooms = all<{ id: number; number: string; property: string }>(`SELECT r.id, r.number, p.name property FROM rooms r JOIN properties p ON p.id = r.property_id WHERE r.property_id IN (${q}) ORDER BY p.id, r.number`, ...ids);

  return (
    <>
      <PageHeader
        title="Rent"
        subtitle={
          <span className="flex items-center gap-3">
            <Link href={`/owner/rent?month=${addMonths(month, -1)}`} className="font-bold text-brand-700" aria-label="Previous month">
              ‹
            </Link>
            <span className="font-semibold text-stone-800">{fmtMonth(month)}</span>
            <Link href={`/owner/rent?month=${addMonths(month, 1)}`} className="font-bold text-brand-700" aria-label="Next month">
              ›
            </Link>
          </span>
        }
        action={
          <a href={`/owner/rent/export?month=${month}`} className="btn-secondary btn-sm">
            Export CSV
          </a>
        }
      />
      <Flash sp={sp} />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Expected" value={inr(expected)} />
        <Stat label="Collected" value={inr(collected)} tone="good" hint={expected ? `${Math.round((collected / expected) * 100)}%` : undefined} />
        <Stat label="Pending" value={inr(expected - collected)} tone={expected - collected ? "warn" : "good"} />
        <Stat label="Overdue" value={inr(overdue)} tone={overdue ? "bad" : "good"} hint={overdueRows.length ? `${overdueRows.length} residents` : undefined} />
      </div>

      <div className="mb-6 grid gap-2 sm:grid-cols-3">
        <form action={generateInvoicesAction}>
          <input type="hidden" name="month" value={month} />
          <Submit className={`${missing ? "btn-primary" : "btn-secondary"} w-full`} pendingText="Generating…">
            {missing ? `Generate ${missing} invoice${missing > 1 ? "s" : ""}` : "Generate invoices"}
          </Submit>
        </form>
        <form action={remindAllAction}>
          <input type="hidden" name="month" value={month} />
          <Submit className="btn-secondary w-full" pendingText="Sending…">
            Remind all unpaid
          </Submit>
        </form>
        <form action={applyLateFeesAction}>
          <input type="hidden" name="month" value={month} />
          <Submit className="btn-secondary w-full" confirm="Add the late fee to every overdue invoice this month?">
            Apply late fees
          </Submit>
        </form>
      </div>

      {proofs.length > 0 && (
        <Section title={`Payment proofs to confirm (${proofs.length})`}>
          <div id="proofs" className="space-y-2">
            {proofs.map((p) => (
              <div key={p.id} className="card flex flex-wrap items-center justify-between gap-3 border-amber-200">
                <div>
                  <div className="font-semibold">
                    {p.name} · {inr(p.amount)}
                  </div>
                  <div className="text-xs text-stone-500">
                    Bed {p.bed} · {fmtMonth(p.month)} · {PAY_MODES[p.mode]} {p.reference && `· Ref ${p.reference}`} · {fmtDate(p.paid_at)}
                  </div>
                  {p.proof_file_id && (
                    <a href={`/api/files/${p.proof_file_id}`} target="_blank" className="text-sm font-semibold text-brand-700 underline">
                      View screenshot
                    </a>
                  )}
                </div>
                <div className="flex gap-2">
                  <form action={confirmProofAction}>
                    <input type="hidden" name="payment_id" value={p.id} />
                    <input type="hidden" name="decision" value="reject" />
                    <Submit className="btn-secondary btn-sm">Reject</Submit>
                  </form>
                  <form action={confirmProofAction}>
                    <input type="hidden" name="payment_id" value={p.id} />
                    <input type="hidden" name="decision" value="approve" />
                    <Submit className="btn-primary btn-sm">Confirm</Submit>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Invoices">
        <div className="mb-3 flex gap-2 overflow-x-auto">
          {FILTERS.map((f) => (
            <Link key={f} href={`/owner/rent?month=${month}&filter=${f}`} className={`chip shrink-0 border px-3 py-1.5 text-sm capitalize ${f === filter ? "border-stone-800 bg-stone-800 text-white" : "border-stone-300 bg-white"}`}>
              {f}
            </Link>
          ))}
        </div>
        {shown.length === 0 ? (
          <Empty title={invoices.length ? "Nothing in this filter" : "No invoices for this month"}>{!invoices.length && "Tap “Generate invoices” to bill every resident."}</Empty>
        ) : (
          <div className="space-y-2">
            {shown.map((i) => {
              const due = i.total - i.paid;
              const late = i.status !== "paid" && i.due_date < t;
              return (
                <details key={i.id} className="card py-3">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{i.name}</div>
                      <div className="truncate text-xs text-stone-500">
                        Bed {i.bed}
                        {ids.length > 1 ? ` · ${i.property}` : ""} · due {fmtDate(i.due_date)}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-bold">{inr(i.status === "paid" ? i.total : due)}</div>
                      <Badge cls={late ? "bg-rose-600 text-white" : INVOICE_STATUS[i.status].cls}>{late ? "Overdue" : INVOICE_STATUS[i.status].label}</Badge>
                    </div>
                  </summary>
                  <div className="mt-3 border-t border-stone-100 pt-3">
                    {i.status !== "paid" ? (
                      <RecordPaymentForm invoiceId={i.id} due={due} back={`/owner/rent?month=${month}&filter=${filter}`} />
                    ) : (
                      <p className="text-sm text-stone-500">Paid in full.</p>
                    )}
                    <Link href={`/owner/residents/${i.resident_id}`} className="mt-3 block text-center text-sm font-semibold text-brand-700">
                      Open resident →
                    </Link>
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="Split a room’s electricity bill">
        <form action={electricityAction} className="card grid gap-3 sm:grid-cols-[1fr_10rem_auto]">
          <input type="hidden" name="month" value={month} />
          <select name="room_id" className="input" required>
            <option value="">Choose room…</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                Room {r.number}
                {ids.length > 1 ? ` · ${r.property}` : ""}
              </option>
            ))}
          </select>
          <input name="amount" type="number" min={1} className="input" placeholder="Bill ₹" required />
          <Submit className="btn-secondary">Split equally</Submit>
          <p className="text-xs text-stone-500 sm:col-span-3">Adds an equal share to the {fmtMonth(month)} invoice of everyone in that room.</p>
        </form>
      </Section>
    </>
  );
}
