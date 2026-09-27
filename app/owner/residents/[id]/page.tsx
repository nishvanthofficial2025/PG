import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireStaff, inList } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { inr, fmtDate, fmtMonth, today, INVOICE_STATUS, PAY_MODES } from "@/lib/format";
import { stayDues } from "@/lib/billing";
import { PageHeader, Flash, Section, Row, Badge } from "@/components/ui";
import { Submit, CopyButton } from "@/components/client";
import { RecordPaymentForm } from "@/components/payment-form";
import {
  activateAction, updateResidentAction, uploadDocumentAction, verifyDocumentAction,
  noticeAction, settleAction, shiftAction, addChargeAction, remindAllAction,
} from "../../actions";

const DOC_TYPES: Record<string, string> = { aadhaar: "Aadhaar", pan: "PAN", passport: "Passport", agreement: "Rental agreement", police: "Police verification" };

export default async function Resident({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string; invite?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const u = await requireStaff();
  const rid = Number(id);
  const r = await get<{ id: number; name: string; phone: string; email: string | null; status: string }>("SELECT id, name, phone, email, status FROM users WHERE id = ? AND role = 'resident' AND owner_id = ?", rid, u.owner_id);
  if (!r) notFound();
  const stays = await all<{ id: number; status: string; bed_id: number; bed: string; room: string; property_id: number; property: string; move_in: string; move_out: string | null; rent: number; deposit: number; notice_date: string | null; refund_amount: number | null }>(
    `SELECT s.*, b.label bed, rm.number room, p.name property FROM stays s JOIN beds b ON b.id = s.bed_id JOIN rooms rm ON rm.id = b.room_id JOIN properties p ON p.id = s.property_id
     WHERE s.resident_id = ? AND s.property_id IN (${inList(u.propertyIds)}) ORDER BY s.id DESC`,
    rid,
    ...u.propertyIds,
  );
  if (!stays.length) notFound();
  const stay = stays[0];
  const past = stays.slice(1);
  const profile = await get<{ emergency_name: string | null; emergency_phone: string | null; occupation: string | null; college_company: string | null; permanent_address: string | null; rules_accepted_at: string | null }>(
    "SELECT * FROM resident_profiles WHERE user_id = ?",
    rid,
  );
  const stayIds = stays.map((s) => s.id);
  const invoices = await all<{ id: number; month: string; total: number; paid: number; status: string; due_date: string }>(
    `SELECT id, month, total, paid, status, due_date FROM invoices WHERE stay_id IN (${inList(stayIds)}) ORDER BY month DESC`,
    ...stayIds,
  );
  const items = await all<{ invoice_id: number; label: string; amount: number }>(
    `SELECT invoice_id, label, amount FROM invoice_items WHERE invoice_id IN (${inList(invoices.map((i) => i.id))}) ORDER BY id`,
    ...invoices.map((i) => i.id),
  );
  const payments = await all<{ id: number; amount: number; mode: string; paid_at: string; receipt_no: string | null; status: string; month: string }>(
    `SELECT p.id, p.amount, p.mode, p.paid_at, p.receipt_no, p.status, i.month FROM payments p JOIN invoices i ON i.id = p.invoice_id
     WHERE i.stay_id IN (${inList(stayIds)}) ORDER BY p.paid_at DESC`,
    ...stayIds,
  );
  const docs = await all<{ id: number; type: string; file_id: string; verified: number; created_at: string }>("SELECT * FROM documents WHERE resident_id = ? ORDER BY id DESC", rid);
  const dues = await stayDues(stay.id);
  const unpaid = invoices.filter((i) => i.status !== "paid");
  const vacantBeds = stay.status === "active" ? await all<{ id: number; label: string; monthly_rent: number; property: string }>(
    `SELECT b.id, b.label, b.monthly_rent, p.name property FROM beds b JOIN properties p ON p.id = b.property_id WHERE b.status = 'vacant' AND b.property_id IN (${inList(u.propertyIds)}) ORDER BY p.id, b.label`,
    ...u.propertyIds,
  ) : [];

  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const inviteText = `Hi ${r.name.split(" ")[0]}, welcome to ${stay.property}! Log in to StayEasy with your number ${r.phone} to see your rent, pay online and raise complaints: ${origin}/login`;
  const back = `/owner/residents/${rid}`;
  const active = stay.status === "active" || stay.status === "notice";

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={r.name}
        subtitle={
          <>
            Bed {stay.bed} · {stay.property}
          </>
        }
        back="/owner/residents"
        action={
          <Badge cls={{ active: "bg-sky-100 text-sky-900", notice: "bg-violet-100 text-violet-900", reserved: "bg-amber-100 text-amber-900", closed: "bg-stone-200 text-stone-700", shifted: "bg-stone-200" }[stay.status] ?? ""}>
            {{ active: "Staying", notice: "On notice", reserved: "Upcoming", closed: "Moved out", shifted: "Shifted" }[stay.status]}
          </Badge>
        }
      />
      <Flash sp={sp} />

      <div className="mb-4 grid grid-cols-2 gap-2">
        <a href={`tel:+91${r.phone}`} className="btn-secondary">
          📞 Call
        </a>
        <a href={`https://wa.me/91${r.phone}`} target="_blank" rel="noreferrer" className="btn-secondary">
          💬 WhatsApp
        </a>
      </div>

      {(sp.invite || r.status === "invited") && stay.status !== "closed" && (
        <div className="card mb-4 border-amber-200 bg-amber-50">
          <div className="font-bold">Invite {r.name.split(" ")[0]} to the app</div>
          <p className="mt-1 text-sm text-stone-700">They log in with their phone number and OTP, then fill in their profile, KYC and accept the house rules.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a className="btn-primary btn-sm" target="_blank" rel="noreferrer" href={`https://wa.me/91${r.phone}?text=${encodeURIComponent(inviteText)}`}>
              Send on WhatsApp
            </a>
            <a className="btn-secondary btn-sm" href={`sms:+91${r.phone}?body=${encodeURIComponent(inviteText)}`}>
              Send SMS
            </a>
            <CopyButton text={inviteText} label="Copy message" />
          </div>
        </div>
      )}

      {stay.status === "reserved" && (
        <form action={activateAction} className="card mb-4 flex items-center justify-between gap-3">
          <input type="hidden" name="stay_id" value={stay.id} />
          <input type="hidden" name="resident_id" value={rid} />
          <div>
            <div className="font-bold">Arriving {fmtDate(stay.move_in)}</div>
            <div className="text-sm text-stone-500">Check in when they arrive and collect deposit + first rent.</div>
          </div>
          <Submit className="btn-primary btn-sm">Check in</Submit>
        </form>
      )}

      <div className="card mb-6">
        <Row label="Dues now">
          <span className={dues > 0 ? "text-rose-700" : "text-emerald-700"}>{dues > 0 ? inr(dues) : "Nothing due"}</span>
        </Row>
        <Row label="Rent">{inr(stay.rent)} / month</Row>
        <Row label="Security deposit">{inr(stay.deposit)}</Row>
        <Row label="Moved in">{fmtDate(stay.move_in)}</Row>
        {stay.notice_date && <Row label="Notice given">{fmtDate(stay.notice_date)}</Row>}
        {stay.move_out && <Row label={stay.status === "closed" ? "Moved out" : "Last day"}>{fmtDate(stay.move_out)}</Row>}
        <Row label="Phone">+91 {r.phone}</Row>
        {r.email && <Row label="Email">{r.email}</Row>}
      </div>

      {active && unpaid.length > 0 && (
        <Section title="Collect payment">
          <div className="card space-y-4">
            <div className="text-sm text-stone-600">
              For <b>{fmtMonth(unpaid[unpaid.length - 1].month)}</b> — {inr(unpaid[unpaid.length - 1].total - unpaid[unpaid.length - 1].paid)} due
            </div>
            <RecordPaymentForm invoiceId={unpaid[unpaid.length - 1].id} due={unpaid[unpaid.length - 1].total - unpaid[unpaid.length - 1].paid} back={back} />
            <form action={remindAllAction}>
              <input type="hidden" name="invoice_id" value={unpaid[unpaid.length - 1].id} />
              <input type="hidden" name="month" value={unpaid[unpaid.length - 1].month} />
              <input type="hidden" name="back" value={back} />
              <Submit className="btn-secondary w-full">Send reminder</Submit>
            </form>
          </div>
        </Section>
      )}

      <Section title="Invoices">
        <div className="space-y-2">
          {invoices.length === 0 && <div className="card text-sm text-stone-500">No invoices yet.</div>}
          {invoices.map((i) => (
            <details key={i.id} className="card">
              <summary className="flex cursor-pointer list-none items-center justify-between">
                <div>
                  <div className="font-semibold">{fmtMonth(i.month)}</div>
                  <div className="text-xs text-stone-500">Due {fmtDate(i.due_date)}</div>
                </div>
                <div className="text-right">
                  <div className="font-bold">{inr(i.total)}</div>
                  <Badge cls={INVOICE_STATUS[i.status].cls}>{i.status === "partial" ? `${inr(i.total - i.paid)} left` : INVOICE_STATUS[i.status].label}</Badge>
                </div>
              </summary>
              <div className="mt-3 border-t border-stone-100 pt-2">
                {items
                  .filter((it) => it.invoice_id === i.id)
                  .map((it, k) => (
                    <Row key={k} label={it.label}>
                      {inr(it.amount)}
                    </Row>
                  ))}
                {active && i.status !== "paid" && (
                  <form action={addChargeAction} className="mt-3 grid grid-cols-[1fr_1fr_auto] gap-2">
                    <input type="hidden" name="invoice_id" value={i.id} />
                    <input type="hidden" name="back" value={back} />
                    <select name="kind" className="input py-2 text-sm">
                      <option value="electricity">Electricity</option>
                      <option value="food">Food</option>
                      <option value="laundry">Laundry</option>
                      <option value="late_fee">Late fee</option>
                      <option value="other">Other</option>
                    </select>
                    <input name="amount" type="number" placeholder="₹" className="input py-2 text-sm" required />
                    <Submit className="btn-secondary btn-sm">Add</Submit>
                  </form>
                )}
              </div>
            </details>
          ))}
        </div>
      </Section>

      <Section title="Payments & receipts">
        {payments.length === 0 ? (
          <div className="card text-sm text-stone-500">No payments yet.</div>
        ) : (
          <ul className="card divide-y divide-stone-100 p-0">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="font-semibold">
                    {inr(p.amount)} <span className="font-normal text-stone-500">· {PAY_MODES[p.mode]}</span>
                  </div>
                  <div className="text-xs text-stone-500">
                    {fmtDate(p.paid_at)} · {fmtMonth(p.month)}
                  </div>
                </div>
                {p.status === "confirmed" ? (
                  <Link href={`/receipt/${p.id}`} className="text-sm font-semibold text-brand-700">
                    {p.receipt_no}
                  </Link>
                ) : (
                  <Badge cls={p.status === "pending" ? "bg-amber-100 text-amber-900" : "bg-rose-100 text-rose-800"}>{p.status}</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="KYC & documents">
        <div className="card space-y-3">
          {docs.length === 0 && <div className="text-sm text-stone-500">No documents yet. The resident can upload from their app, or you can add them here.</div>}
          {docs.map((d) => (
            <div key={d.id} className="flex items-center justify-between">
              <a href={`/api/files/${d.file_id}`} target="_blank" className="font-medium text-brand-700 underline">
                {DOC_TYPES[d.type] ?? d.type}
              </a>
              {d.verified ? (
                <span className="chip bg-emerald-100 text-emerald-800">Verified</span>
              ) : (
                <form action={verifyDocumentAction}>
                  <input type="hidden" name="doc_id" value={d.id} />
                  <input type="hidden" name="resident_id" value={rid} />
                  <Submit className="btn-secondary btn-sm">Mark verified</Submit>
                </form>
              )}
            </div>
          ))}
          <form action={uploadDocumentAction} className="grid gap-2 border-t border-stone-100 pt-3 sm:grid-cols-[auto_1fr_auto]">
            <input type="hidden" name="resident_id" value={rid} />
            <select name="type" className="input py-2 text-sm">
              {Object.entries(DOC_TYPES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <input name="file" type="file" accept="image/*,application/pdf" required className="text-sm" />
            <Submit className="btn-secondary btn-sm">Upload</Submit>
          </form>
          <p className="text-xs text-stone-500">Stored privately. Only you, your managers and the resident can open these files.</p>
        </div>
      </Section>

      <Section title="Profile">
        <form action={updateResidentAction} className="card grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="resident_id" value={rid} />
          <div>
            <label className="label">Name</label>
            <input name="name" className="input" defaultValue={r.name} required />
          </div>
          <div>
            <label className="label">Email</label>
            <input name="email" type="email" className="input" defaultValue={r.email ?? ""} />
          </div>
          <div>
            <label className="label">Emergency contact name</label>
            <input name="emergency_name" className="input" defaultValue={profile?.emergency_name ?? ""} />
          </div>
          <div>
            <label className="label">Emergency contact phone</label>
            <input name="emergency_phone" className="input" defaultValue={profile?.emergency_phone ?? ""} />
          </div>
          <div>
            <label className="label">Occupation</label>
            <input name="occupation" className="input" defaultValue={profile?.occupation ?? ""} />
          </div>
          <div>
            <label className="label">College / company</label>
            <input name="college_company" className="input" defaultValue={profile?.college_company ?? ""} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Permanent address</label>
            <input name="permanent_address" className="input" defaultValue={profile?.permanent_address ?? ""} />
          </div>
          <div className="text-xs text-stone-500 sm:col-span-2">House rules accepted: {profile?.rules_accepted_at ? fmtDate(profile.rules_accepted_at) : "not yet"}</div>
          <div className="sm:col-span-2">
            <Submit className="btn-secondary w-full">Save profile</Submit>
          </div>
        </form>
      </Section>

      {stay.status === "active" && vacantBeds.length > 0 && (
        <Section title="Shift room">
          <form action={shiftAction} className="card grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <input type="hidden" name="resident_id" value={rid} />
            <input type="hidden" name="stay_id" value={stay.id} />
            <select name="bed_id" className="input" required>
              <option value="">Choose a vacant bed…</option>
              {vacantBeds.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label} · {inr(b.monthly_rent)}
                  {u.propertyIds.length > 1 ? ` · ${b.property}` : ""}
                </option>
              ))}
            </select>
            <input name="rent" type="number" className="input sm:w-32" placeholder="New rent" />
            <Submit className="btn-secondary" confirm="Move this resident to the selected bed?">
              Shift
            </Submit>
          </form>
        </Section>
      )}

      {active && (
        <Section title="Move-out">
          <div className="card space-y-4">
            {stay.status === "active" && (
              <form action={noticeAction} className="flex items-end gap-2">
                <input type="hidden" name="resident_id" value={rid} />
                <input type="hidden" name="stay_id" value={stay.id} />
                <div className="flex-1">
                  <label className="label">Notice given on</label>
                  <input name="notice_date" type="date" className="input" defaultValue={today()} />
                </div>
                <Submit className="btn-secondary">Record notice</Submit>
              </form>
            )}
            <form action={settleAction} className="space-y-3 border-t border-stone-100 pt-4">
              <input type="hidden" name="resident_id" value={rid} />
              <input type="hidden" name="stay_id" value={stay.id} />
              <div className="font-semibold">Final settlement</div>
              <div className="rounded-xl bg-stone-50 p-3 text-sm">
                <Row label="Deposit held">{inr(stay.deposit)}</Row>
                <Row label="Pending dues">− {inr(dues)}</Row>
                <Row label="Refund before deductions">{inr(stay.deposit - dues)}</Row>
              </div>
              <div className="grid grid-cols-[8rem_1fr] gap-2">
                <input name="deductions" type="number" min={0} className="input" placeholder="Deductions ₹" />
                <input name="note" className="input" placeholder="Reason (e.g. broken chair, key lost)" />
              </div>
              <Submit className="btn-danger w-full" confirm="Close this stay and create the settlement slip? The resident's account becomes read-only.">
                Settle &amp; check out
              </Submit>
            </form>
          </div>
        </Section>
      )}

      {stay.status === "closed" && (
        <Link href={`/owner/settlement/${stay.id}`} className="btn-secondary mb-6 w-full">
          View settlement slip
        </Link>
      )}

      {past.length > 0 && (
        <Section title="History">
          <ul className="card divide-y divide-stone-100 p-0 text-sm">
            {past.map((s) => (
              <li key={s.id} className="flex justify-between px-4 py-2">
                <span>
                  Bed {s.bed} · {s.property}
                </span>
                <span className="text-stone-500">
                  {fmtDate(s.move_in)} – {fmtDate(s.move_out)}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
