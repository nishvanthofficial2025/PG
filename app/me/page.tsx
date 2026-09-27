import Link from "next/link";
import { redirect } from "next/navigation";
import { requireResident } from "@/lib/auth";
import { all } from "@/lib/db";
import { myStay } from "@/lib/resident";
import { inr, fmtDate, fmtMonth, today, daysBetween, ageLabel, COMPLAINT_STATUS } from "@/lib/format";
import { Flash, Section, Badge } from "@/components/ui";

export default async function ResidentHome({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const u = await requireResident();
  if (u.status === "invited") redirect("/me/welcome");
  const stay = myStay(u.id);
  if (!stay) {
    return <div className="card mt-10 text-center">You don’t have a bed assigned yet. Please contact your PG owner.</div>;
  }
  const t = today();

  const unpaid = all<{ id: number; month: string; total: number; paid: number; due_date: string }>(
    `SELECT i.id, i.month, i.total, i.paid, i.due_date FROM invoices i JOIN stays s ON s.id = i.stay_id
     WHERE s.resident_id = ? AND i.status != 'paid' ORDER BY i.month`,
    u.id,
  );
  const items = all<{ invoice_id: number; label: string; amount: number }>(
    `SELECT invoice_id, label, amount FROM invoice_items WHERE invoice_id IN (${unpaid.map(() => "?").join(",") || "NULL"}) ORDER BY id`,
    ...unpaid.map((i) => i.id),
  );
  const pendingProof = all<{ amount: number }>(
    "SELECT p.amount FROM payments p JOIN invoices i ON i.id = p.invoice_id JOIN stays s ON s.id = i.stay_id WHERE s.resident_id = ? AND p.status = 'pending'",
    u.id,
  );
  const totalDue = unpaid.reduce((a, i) => a + i.total - i.paid, 0);
  const next = unpaid[0];
  const lateDays = next ? daysBetween(next.due_date, t) : 0;

  const notices = all<{ id: number; title: string; body: string; pinned: number; created_at: string }>(
    `SELECT id, title, body, pinned, created_at FROM notices WHERE owner_id = ? AND (property_id IS NULL OR property_id = ?) ORDER BY pinned DESC, created_at DESC LIMIT 3`,
    stay.owner_id,
    stay.property_id,
  );
  const complaints = all<{ id: number; category: string; status: string; created_at: string }>(
    "SELECT id, category, status, created_at FROM complaints WHERE resident_id = ? AND status != 'closed' ORDER BY created_at DESC LIMIT 3",
    u.id,
  );
  const alerts = all<{ title: string; body: string | null; created_at: string }>("SELECT title, body, created_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 4", u.id);

  return (
    <>
      <div className="mb-4">
        <div className="text-sm text-stone-500">
          {stay.property} · Bed {stay.bed}
        </div>
        <h1 className="text-2xl font-bold">Hi {u.name.split(" ")[0]} 👋</h1>
      </div>
      <Flash sp={sp} />

      {stay.status === "closed" && (
        <div className="card mb-4 border-stone-300 bg-stone-50">
          <div className="font-bold">Your stay ended on {fmtDate(stay.move_out)}</div>
          <div className="text-sm text-stone-600">
            Deposit refund: {inr(Math.max(stay.refund_amount ?? 0, 0))} · {stay.refund_paid_at ? `paid ${fmtDate(stay.refund_paid_at)}` : "pending"}. Your receipts stay downloadable.
          </div>
        </div>
      )}
      {stay.status === "notice" && (
        <div className="card mb-4 border-violet-200 bg-violet-50 text-sm">
          You’re on notice. Last day: <b>{fmtDate(stay.move_out)}</b>. Your refund is calculated on your last day.
        </div>
      )}

      <div className={`card mb-6 p-5 ${totalDue > 0 ? (lateDays > 0 ? "border-rose-200" : "") : "border-emerald-200 bg-emerald-50"}`}>
        {totalDue > 0 && next ? (
          <>
            <div className="text-sm font-medium text-stone-500">You owe</div>
            <div className="text-4xl font-bold tracking-tight">{inr(totalDue)}</div>
            <div className={`mt-1 text-sm font-semibold ${lateDays > 0 ? "text-rose-600" : "text-stone-600"}`}>
              {lateDays > 0 ? `Overdue by ${lateDays} day${lateDays > 1 ? "s" : ""}` : lateDays === 0 ? "Due today" : `Due by ${fmtDate(next.due_date)}`}
            </div>
            <div className="mt-4 rounded-xl bg-stone-50 p-3 text-sm">
              {unpaid.map((inv) => (
                <div key={inv.id} className="mb-1 last:mb-0">
                  {unpaid.length > 1 && <div className="text-xs font-semibold uppercase text-stone-500">{fmtMonth(inv.month)}</div>}
                  {items
                    .filter((it) => it.invoice_id === inv.id)
                    .map((it, k) => (
                      <div key={k} className="flex justify-between py-0.5">
                        <span className="text-stone-600">{it.label}</span>
                        <span>{inr(it.amount)}</span>
                      </div>
                    ))}
                  {inv.paid > 0 && (
                    <div className="flex justify-between py-0.5 text-emerald-700">
                      <span>Already paid</span>
                      <span>− {inr(inv.paid)}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {u.status !== "read_only" && (
              <Link href={`/me/pay/${next.id}`} className="btn-primary mt-4 w-full text-lg">
                Pay {inr(next.total - next.paid)} now
              </Link>
            )}
            {pendingProof.length > 0 && <p className="mt-2 text-center text-xs text-amber-700">{inr(pendingProof.reduce((a, p) => a + p.amount, 0))} waiting for owner confirmation</p>}
            <Link href="/me/payments#proof" className="mt-2 block text-center text-sm font-medium text-brand-700">
              Paid outside the app? Upload proof
            </Link>
          </>
        ) : (
          <>
            <div className="text-sm font-medium text-emerald-800">All paid up ✓</div>
            <div className="text-2xl font-bold text-emerald-900">No dues right now</div>
            <Link href="/me/payments" className="mt-2 inline-block text-sm font-semibold text-brand-700">
              View receipts →
            </Link>
          </>
        )}
      </div>

      {notices.length > 0 && (
        <Section title="Notices" action={<Link href="/me/info#notices" className="text-sm font-semibold text-brand-700">All</Link>}>
          <div className="space-y-2">
            {notices.map((n) => (
              <div key={n.id} className={`card ${n.pinned ? "border-amber-300 bg-amber-50/60" : ""}`}>
                <div className="font-semibold">
                  {n.pinned ? "📌 " : ""}
                  {n.title}
                </div>
                {n.body && <p className="mt-0.5 text-sm text-stone-600">{n.body}</p>}
                <div className="mt-1 text-xs text-stone-400">{fmtDate(n.created_at)}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="My complaints" action={<Link href="/me/complaints" className="text-sm font-semibold text-brand-700">+ Raise</Link>}>
        {complaints.length === 0 ? (
          <div className="card text-sm text-stone-500">Nothing open. Something broken? Tap “Raise”.</div>
        ) : (
          <ul className="card divide-y divide-stone-100 p-0">
            {complaints.map((c) => (
              <li key={c.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="font-semibold capitalize">{c.category === "wifi" ? "Wi-Fi" : c.category}</div>
                  <div className="text-xs text-stone-500">{ageLabel(c.created_at)}</div>
                </div>
                <Badge cls={COMPLAINT_STATUS[c.status].cls}>{COMPLAINT_STATUS[c.status].label}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {alerts.length > 0 && (
        <Section title="Updates">
          <ul className="card divide-y divide-stone-100 p-0 text-sm">
            {alerts.map((a, i) => (
              <li key={i} className="px-4 py-2.5">
                <div className="font-medium">{a.title}</div>
                {a.body && <div className="text-stone-500">{a.body}</div>}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}
