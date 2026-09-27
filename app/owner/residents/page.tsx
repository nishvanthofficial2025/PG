import Link from "next/link";
import { requireStaff, inList } from "@/lib/auth";
import { all } from "@/lib/db";
import { scopeIds } from "@/lib/scope";
import { inr, fmtDate } from "@/lib/format";
import { PageHeader, Empty } from "@/components/ui";

const FILTERS = [
  { key: "current", label: "Current", where: "s.status IN ('active','notice')" },
  { key: "notice", label: "On notice", where: "s.status = 'notice'" },
  { key: "reserved", label: "Upcoming", where: "s.status = 'reserved'" },
  { key: "past", label: "Moved out", where: "s.status = 'closed'" },
];

export default async function Residents({ searchParams }: { searchParams: Promise<{ q?: string; f?: string }> }) {
  const sp = await searchParams;
  const u = await requireStaff();
  const { ids } = await scopeIds(u);
  const filter = FILTERS.find((f) => f.key === sp.f) ?? FILTERS[0];
  const q = (sp.q ?? "").trim();
  const rows = await all<{ id: number; name: string; phone: string; status: string; bed: string; property: string; dues: number; move_in: string; move_out: string | null; user_status: string }>(
    `SELECT u.id, u.name, u.phone, u.status user_status, s.status, b.label bed, p.name property, s.move_in, s.move_out,
       (SELECT COALESCE(SUM(total - paid),0) FROM invoices i WHERE i.stay_id = s.id) dues
     FROM stays s JOIN users u ON u.id = s.resident_id JOIN beds b ON b.id = s.bed_id JOIN properties p ON p.id = s.property_id
     WHERE ${filter.where} AND s.property_id IN (${inList(ids)})
       AND s.id = (SELECT MAX(s2.id) FROM stays s2 WHERE s2.resident_id = u.id AND s2.status != 'shifted')
       ${q ? "AND (u.name ILIKE ? OR u.phone ILIKE ? OR b.label ILIKE ?)" : ""}
     ORDER BY b.label`,
    ...ids,
    ...(q ? [`%${q}%`, `%${q}%`, `%${q}%`] : []),
  );

  return (
    <>
      <PageHeader title="Residents" subtitle={`${rows.length} ${filter.label.toLowerCase()}`} action={<Link href="/owner/beds?status=vacant" className="btn-primary btn-sm">+ Add</Link>} />
      <form className="mb-3">
        <input type="hidden" name="f" value={filter.key} />
        <input name="q" defaultValue={q} placeholder="Search name, phone or bed" className="input" />
      </form>
      <div className="mb-4 flex gap-2 overflow-x-auto">
        {FILTERS.map((f) => (
          <Link key={f.key} href={`/owner/residents?f=${f.key}`} className={`chip shrink-0 border px-3 py-1.5 text-sm ${f.key === filter.key ? "border-stone-800 bg-stone-800 text-white" : "border-stone-300 bg-white"}`}>
            {f.label}
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <Empty title="No residents here">{filter.key === "current" && "Tap a vacant bed in the bed grid to add one."}</Empty>
      ) : (
        <ul className="card divide-y divide-stone-100 p-0">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/owner/residents/${r.id}`} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate font-semibold">
                    {r.name}
                    {r.user_status === "invited" && <span className="chip ml-2 bg-amber-100 text-amber-900">Invited</span>}
                  </div>
                  <div className="truncate text-xs text-stone-500">
                    Bed {r.bed}
                    {ids.length > 1 ? ` · ${r.property}` : ""}
                    {r.status === "notice" && ` · leaving ${fmtDate(r.move_out)}`}
                    {r.status === "reserved" && ` · arriving ${fmtDate(r.move_in)}`}
                  </div>
                </div>
                {r.dues > 0 ? <span className="font-bold text-rose-700">{inr(r.dues)}</span> : <span className="text-xs font-semibold text-emerald-700">No dues</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
