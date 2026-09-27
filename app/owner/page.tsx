import Link from "next/link";
import { requireStaff, inList } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { scopeIds } from "@/lib/scope";
import { inr, today, thisMonth, addDays, fmtDate, fmtMonth, ageLabel, hoursSince, daysBetween, BED_STATUS } from "@/lib/format";
import { Stat, Section, Flash, Empty } from "@/components/ui";
import { Submit } from "@/components/client";
import { remindAllAction } from "./actions";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const u = await requireStaff();
  const { ids } = await scopeIds(u);
  const q = inList(ids);
  const t = today();
  const month = thisMonth();

  if (!u.propertyIds.length) {
    return (
      <div className="mx-auto max-w-md pt-10">
        <h1 className="mb-2 text-2xl font-bold">Hi {u.name.split(" ")[0]} 👋</h1>
        <p className="mb-6 text-stone-600">{u.role === "owner" ? "Let's add your first PG. It takes about 2 minutes." : "You haven't been assigned to a property yet. Ask the owner to add you."}</p>
        {u.role === "owner" && (
          <Link href="/owner/properties/new" className="btn-primary w-full">
            Add my first property
          </Link>
        )}
      </div>
    );
  }

  const beds = await all<{ status: string; n: number }>(`SELECT status, COUNT(*) n FROM beds WHERE property_id IN (${q}) GROUP BY status`, ...ids);
  const bedCount = (s: string) => beds.find((b) => b.status === s)?.n ?? 0;
  const totalBeds = beds.reduce((a, b) => a + b.n, 0);

  const rent = (await get<{ expected: number; collected: number; overdue: number; unpaidCount: number }>(
    `SELECT COALESCE(SUM(total),0) expected, COALESCE(SUM(paid),0) collected,
       COALESCE(SUM(CASE WHEN status != 'paid' AND due_date < ? THEN total - paid END),0) overdue,
       COUNT(CASE WHEN status != 'paid' THEN 1 END) "unpaidCount"
     FROM invoices WHERE month = ? AND property_id IN (${q})`,
    t,
    month,
    ...ids,
  ))!;
  const pending = rent.expected - rent.collected;
  const pct = rent.expected ? Math.round((rent.collected / rent.expected) * 100) : 0;

  const defaulters = await all<{ invoice_id: number; resident_id: number; name: string; bed: string; due: number; due_date: string; property: string }>(
    `SELECT i.id invoice_id, u.id resident_id, u.name, b.label bed, i.total - i.paid due, i.due_date, p.name property
     FROM invoices i JOIN stays s ON s.id = i.stay_id JOIN users u ON u.id = s.resident_id JOIN beds b ON b.id = s.bed_id JOIN properties p ON p.id = i.property_id
     WHERE i.month = ? AND i.status != 'paid' AND i.property_id IN (${q})
     ORDER BY i.due_date, due DESC LIMIT 8`,
    month,
    ...ids,
  );
  const proofs = (await get<{ n: number }>(`SELECT COUNT(*) n FROM payments p JOIN invoices i ON i.id = p.invoice_id WHERE p.status = 'pending' AND i.property_id IN (${q})`, ...ids))!.n;

  const complaints = await all<{ id: number; category: string; description: string; created_at: string; room: string | null }>(
    `SELECT c.id, c.category, c.description, c.created_at, r.number room FROM complaints c LEFT JOIN rooms r ON r.id = c.room_id
     WHERE c.status IN ('open','in_progress') AND c.property_id IN (${q}) ORDER BY c.created_at`,
    ...ids,
  );
  const overdueComplaints = complaints.filter((c) => hoursSince(c.created_at) > 48).length;

  const week = addDays(t, 7);
  const checkIns = await all<{ resident_id: number; name: string; bed: string; move_in: string }>(
    `SELECT s.resident_id, u.name, b.label bed, s.move_in FROM stays s JOIN users u ON u.id = s.resident_id JOIN beds b ON b.id = s.bed_id
     WHERE s.status = 'reserved' AND s.move_in <= ? AND s.property_id IN (${q}) ORDER BY s.move_in`,
    week,
    ...ids,
  );
  const checkOuts = await all<{ resident_id: number; name: string; bed: string; move_out: string }>(
    `SELECT s.resident_id, u.name, b.label bed, s.move_out FROM stays s JOIN users u ON u.id = s.resident_id JOIN beds b ON b.id = s.bed_id
     WHERE s.status = 'notice' AND s.move_out <= ? AND s.property_id IN (${q}) ORDER BY s.move_out`,
    week,
    ...ids,
  );

  return (
    <>
      <Flash sp={sp} />
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">Namaste, {u.name.split(" ")[0]}</h1>
        <p className="text-sm text-stone-500">{fmtDate(t)} · {u.role === "owner" ? u.business_name ?? "Owner" : "Manager"}</p>
      </div>

      {/* The one line owners care about most. */}
      <div className="card mb-4 border-brand-100 bg-gradient-to-br from-brand-600 to-brand-700 p-5 text-white">
        <div className="text-sm font-medium opacity-90">Rent for {fmtMonth(month)}</div>
        {rent.expected === 0 ? (
          <div className="mt-2">
            <div className="text-lg font-semibold">No invoices yet this month</div>
            <Link href="/owner/rent" className="mt-3 inline-flex rounded-xl bg-white px-4 py-2 font-semibold text-brand-700">
              Generate invoices →
            </Link>
          </div>
        ) : (
          <>
            <div className="mt-1 text-3xl font-bold">{pending > 0 ? `${inr(pending)} pending` : "All collected 🎉"}</div>
            <div className="text-sm opacity-90">{pending > 0 ? `from ${rent.unpaidCount} ${rent.unpaidCount === 1 ? "person" : "people"}` : `${inr(rent.collected)} received`}</div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/25">
              <div className="h-full rounded-full bg-white" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-2 flex justify-between text-xs opacity-90">
              <span>Collected {inr(rent.collected)} ({pct}%)</span>
              <span>Expected {inr(rent.expected)}</span>
            </div>
            {pending > 0 && (
              <form action={remindAllAction} className="mt-4">
                <input type="hidden" name="month" value={month} />
                <input type="hidden" name="back" value="/owner" />
                <Submit className="btn w-full bg-white text-brand-700 hover:bg-brand-50" pendingText="Sending…">
                  Remind all {rent.unpaidCount} on WhatsApp / SMS
                </Submit>
              </form>
            )}
          </>
        )}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Overdue" value={inr(rent.overdue)} tone={rent.overdue ? "bad" : "good"} href="/owner/rent?filter=overdue" />
        <Stat label="Collected" value={inr(rent.collected)} tone="good" href="/owner/rent?filter=paid" />
        <Stat label="Proofs to confirm" value={proofs} tone={proofs ? "warn" : "default"} href="/owner/rent#proofs" />
        <Stat label="Open complaints" value={complaints.length} tone={overdueComplaints ? "bad" : "default"} hint={overdueComplaints ? `${overdueComplaints} older than 48h` : undefined} href="/owner/complaints" />
      </div>

      <Section title="Beds" action={<Link href="/owner/beds" className="text-sm font-semibold text-brand-700">Bed grid →</Link>}>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          <Stat label="Total" value={totalBeds} href="/owner/beds" />
          {(["occupied", "vacant", "reserved", "notice", "maintenance"] as const).map((s) => (
            <Link key={s} href={`/owner/beds?status=${s}`} className={`min-w-0 rounded-2xl border p-4 ${BED_STATUS[s].cls}`}>
              <div className="truncate text-[11px] font-medium uppercase opacity-80">{BED_STATUS[s].label}</div>
              <div className="mt-1 text-2xl font-bold">{bedCount(s)}</div>
            </Link>
          ))}
        </div>
      </Section>

      <div className="grid gap-6 md:grid-cols-2">
        <Section title="Yet to pay this month" action={<Link href="/owner/rent?filter=unpaid" className="text-sm font-semibold text-brand-700">All →</Link>}>
          {defaulters.length === 0 ? (
            <Empty title="Nobody owes rent 🎉" />
          ) : (
            <ul className="card divide-y divide-stone-100 p-0">
              {defaulters.map((d) => {
                const late = daysBetween(d.due_date, t);
                return (
                  <li key={d.invoice_id}>
                    <Link href={`/owner/residents/${d.resident_id}`} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <div className="font-semibold">{d.name}</div>
                        <div className="text-xs text-stone-500">
                          Bed {d.bed}
                          {ids.length > 1 ? ` · ${d.property}` : ""}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold">{inr(d.due)}</div>
                        <div className={`text-xs ${late > 0 ? "font-semibold text-rose-600" : "text-stone-500"}`}>{late > 0 ? `${late} days late` : `due ${fmtDate(d.due_date)}`}</div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <Section title="Complaints" action={<Link href="/owner/complaints" className="text-sm font-semibold text-brand-700">All →</Link>}>
          {complaints.length === 0 ? (
            <Empty title="No open complaints" />
          ) : (
            <ul className="card divide-y divide-stone-100 p-0">
              {complaints.slice(0, 4).map((c) => (
                <li key={c.id}>
                  <Link href={`/owner/complaints/${c.id}`} className="flex items-start justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <div className="truncate font-semibold capitalize">{c.category === "wifi" ? "Wi-Fi" : c.category} {c.room && <span className="font-normal text-stone-500">· Room {c.room}</span>}</div>
                      <div className="truncate text-sm text-stone-500">{c.description}</div>
                    </div>
                    <span className={`shrink-0 text-xs font-semibold ${hoursSince(c.created_at) > 48 ? "text-rose-600" : "text-stone-500"}`}>{ageLabel(c.created_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Next 7 days">
          {checkIns.length + checkOuts.length === 0 ? (
            <Empty title="No check-ins or check-outs coming up" />
          ) : (
            <ul className="card divide-y divide-stone-100 p-0">
              {checkIns.map((c) => (
                <li key={"in" + c.resident_id}>
                  <Link href={`/owner/residents/${c.resident_id}`} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <div className="font-semibold">{c.name}</div>
                      <div className="text-xs text-stone-500">Check-in · Bed {c.bed}</div>
                    </div>
                    <span className="chip bg-amber-100 text-amber-900">{fmtDate(c.move_in)}</span>
                  </Link>
                </li>
              ))}
              {checkOuts.map((c) => (
                <li key={"out" + c.resident_id}>
                  <Link href={`/owner/residents/${c.resident_id}`} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <div className="font-semibold">{c.name}</div>
                      <div className="text-xs text-stone-500">Check-out · Bed {c.bed}</div>
                    </div>
                    <span className="chip bg-violet-100 text-violet-900">{fmtDate(c.move_out)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}
