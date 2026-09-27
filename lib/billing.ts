import "server-only";
import { all, get, run, tx, nextCounter, logActivity } from "./db";
import { daysInMonth, dayOfMonth, today, nowIso, inr, fmtMonth } from "./format";
import { notify } from "./notify";

export type Stay = {
  id: number;
  owner_id: number;
  property_id: number;
  resident_id: number;
  bed_id: number;
  move_in: string;
  move_out: string | null;
  rent: number;
  deposit: number;
  notice_date: string | null;
  status: string;
};

/** Rent for `month`, prorated by days stayed when moving in or out mid-month. */
export function proratedRent(rent: number, month: string, moveIn: string, moveOut: string | null): { amount: number; days: number; total: number } {
  const total = daysInMonth(month);
  const start = moveIn.slice(0, 7) === month ? Number(moveIn.slice(8, 10)) : moveIn.slice(0, 7) < month ? 1 : total + 1;
  const end = moveOut && moveOut.slice(0, 7) === month ? Number(moveOut.slice(8, 10)) : moveOut && moveOut.slice(0, 7) < month ? 0 : total;
  const days = Math.max(0, end - start + 1);
  return { amount: days === total ? rent : Math.round((rent * days) / total), days, total };
}

/** Creates the month's invoice for one stay if it doesn't exist. Returns invoice id or null. */
export function createInvoiceForStay(stay: Stay, month: string): number | null {
  const exists = get("SELECT id FROM invoices WHERE stay_id = ? AND month = ?", stay.id, month);
  if (exists) return null;
  const p = get<{ due_day: number }>("SELECT due_day FROM properties WHERE id = ?", stay.property_id)!;
  const r = proratedRent(stay.rent, month, stay.move_in, stay.move_out);
  if (r.days === 0) return null;
  const label = r.days === r.total ? `Rent – ${fmtMonth(month)}` : `Rent – ${fmtMonth(month)} (${r.days} of ${r.total} days)`;
  // First invoice is due on move-in if that's after the usual due day.
  let due = dayOfMonth(month, p.due_day);
  if (stay.move_in > due) due = stay.move_in;
  const inv = run(
    "INSERT INTO invoices (owner_id, property_id, stay_id, month, due_date, total) VALUES (?, ?, ?, ?, ?, ?)",
    stay.owner_id,
    stay.property_id,
    stay.id,
    month,
    due,
    r.amount,
  );
  run("INSERT INTO invoice_items (invoice_id, kind, label, amount) VALUES (?, 'rent', ?, ?)", inv.id, label, r.amount);
  recalcInvoice(inv.id);
  return inv.id;
}

/** Generates invoices for every active/notice stay across the given properties. */
export function generateInvoices(ownerId: number, userId: number, month: string, propertyIds: number[]): number {
  if (!propertyIds.length) return 0;
  const stays = all<Stay>(
    `SELECT * FROM stays WHERE owner_id = ? AND status IN ('active','notice')
     AND property_id IN (${propertyIds.map(() => "?").join(",")})`,
    ownerId,
    ...propertyIds,
  );
  let count = 0;
  tx(() => {
    for (const s of stays) {
      const id = createInvoiceForStay(s, month);
      if (id) {
        count++;
        const inv = get<{ total: number; due_date: string }>("SELECT total, due_date FROM invoices WHERE id = ?", id)!;
        notify(s.resident_id, "New rent invoice", `${fmtMonth(month)}: ${inr(inv.total)} due by ${inv.due_date}`);
      }
    }
    if (count) logActivity(ownerId, userId, "generate_invoices", "invoice", null, `${count} invoices for ${month}`);
  });
  return count;
}

export function addInvoiceItem(invoiceId: number, kind: string, label: string, amount: number) {
  run("INSERT INTO invoice_items (invoice_id, kind, label, amount) VALUES (?, ?, ?, ?)", invoiceId, kind, label, amount);
  recalcInvoice(invoiceId);
}

export function recalcInvoice(invoiceId: number) {
  const total = get<{ t: number }>("SELECT COALESCE(SUM(amount),0) t FROM invoice_items WHERE invoice_id = ?", invoiceId)!.t;
  const paid = get<{ p: number }>("SELECT COALESCE(SUM(amount),0) p FROM payments WHERE invoice_id = ? AND status = 'confirmed'", invoiceId)!.p;
  const status = paid >= total && total > 0 ? "paid" : paid > 0 ? "partial" : total === 0 ? "paid" : "unpaid";
  run("UPDATE invoices SET total = ?, paid = ?, status = ? WHERE id = ?", total, paid, status, invoiceId);
}

export function receiptNo(ownerId: number): string {
  const n = nextCounter(ownerId, "receipt");
  return `RC-${today().slice(0, 4)}-${String(n).padStart(5, "0")}`;
}

/** Records a confirmed payment (gateway or offline) and issues a receipt number. */
export function recordPayment(opts: {
  invoiceId: number;
  amount: number;
  mode: string;
  reference?: string | null;
  note?: string | null;
  proofFileId?: string | null;
  recordedBy: number;
  paidAt?: string;
}): number {
  return tx(() => {
    const inv = get<{ owner_id: number; stay_id: number; month: string }>("SELECT owner_id, stay_id, month FROM invoices WHERE id = ?", opts.invoiceId);
    if (!inv) throw new Error("Invoice not found");
    const rc = receiptNo(inv.owner_id);
    const p = run(
      `INSERT INTO payments (owner_id, invoice_id, amount, mode, reference, note, proof_file_id, status, recorded_by, paid_at, receipt_no)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?)`,
      inv.owner_id,
      opts.invoiceId,
      opts.amount,
      opts.mode,
      opts.reference ?? null,
      opts.note ?? null,
      opts.proofFileId ?? null,
      opts.recordedBy,
      opts.paidAt ?? nowIso(),
      rc,
    );
    recalcInvoice(opts.invoiceId);
    const resident = get<{ resident_id: number }>("SELECT resident_id FROM stays WHERE id = ?", inv.stay_id)!;
    notify(resident.resident_id, "Payment received", `${inr(opts.amount)} for ${fmtMonth(inv.month)}. Receipt ${rc}.`);
    logActivity(inv.owner_id, opts.recordedBy, "record_payment", "payment", p.id, `${inr(opts.amount)} ${opts.mode} ${rc}`);
    return p.id;
  });
}

/** Unpaid amount across all invoices for a stay. */
export function stayDues(stayId: number): number {
  return get<{ d: number }>("SELECT COALESCE(SUM(total - paid),0) d FROM invoices WHERE stay_id = ?", stayId)!.d;
}
