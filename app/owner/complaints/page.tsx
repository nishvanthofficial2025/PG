import Link from "next/link";
import { requireStaff, inList } from "@/lib/auth";
import { all } from "@/lib/db";
import { scopeIds } from "@/lib/scope";
import { ageLabel, hoursSince, COMPLAINT_STATUS } from "@/lib/format";
import { PageHeader, Badge, Empty, Flash } from "@/components/ui";

const TABS = [
  { key: "open", label: "Open", where: "c.status IN ('open','in_progress')" },
  { key: "resolved", label: "Resolved", where: "c.status = 'resolved'" },
  { key: "closed", label: "Closed", where: "c.status = 'closed'" },
];

export default async function Complaints({ searchParams }: { searchParams: Promise<{ tab?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const u = await requireStaff();
  const { ids } = await scopeIds(u);
  const tab = TABS.find((t) => t.key === sp.tab) ?? TABS[0];
  const rows = all<{ id: number; category: string; description: string; status: string; priority: string; created_at: string; name: string; room: string | null; property: string; assignee: string | null }>(
    `SELECT c.id, c.category, c.description, c.status, c.priority, c.created_at, u.name, r.number room, p.name property, a.name assignee
     FROM complaints c JOIN users u ON u.id = c.resident_id LEFT JOIN rooms r ON r.id = c.room_id JOIN properties p ON p.id = c.property_id LEFT JOIN users a ON a.id = c.assigned_to
     WHERE ${tab.where} AND c.property_id IN (${inList(ids)}) ORDER BY c.created_at ${tab.key === "open" ? "ASC" : "DESC"} LIMIT 200`,
    ...ids,
  );
  return (
    <>
      <PageHeader title="Complaints" subtitle="Oldest first. Anything older than 48 hours is flagged." />
      <Flash sp={sp} />
      <div className="mb-4 flex gap-2">
        {TABS.map((t) => (
          <Link key={t.key} href={`/owner/complaints?tab=${t.key}`} className={`chip border px-3 py-1.5 text-sm ${t.key === tab.key ? "border-stone-800 bg-stone-800 text-white" : "border-stone-300 bg-white"}`}>
            {t.label}
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <Empty title="Nothing here" />
      ) : (
        <div className="space-y-2">
          {rows.map((c) => {
            const stale = tab.key === "open" && hoursSince(c.created_at) > 48;
            return (
              <Link key={c.id} href={`/owner/complaints/${c.id}`} className={`card block ${stale ? "border-rose-300 bg-rose-50/40" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold capitalize">
                      {c.category === "wifi" ? "Wi-Fi" : c.category}
                      {c.priority === "high" && <span className="chip ml-2 bg-rose-600 text-white">High</span>}
                    </div>
                    <div className="line-clamp-2 text-sm text-stone-600">{c.description}</div>
                    <div className="mt-1 text-xs text-stone-500">
                      {c.name} · {c.room ? `Room ${c.room}` : ""}
                      {ids.length > 1 ? ` · ${c.property}` : ""}
                      {c.assignee ? ` · → ${c.assignee}` : " · unassigned"}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <Badge cls={COMPLAINT_STATUS[c.status].cls}>{COMPLAINT_STATUS[c.status].label}</Badge>
                    <div className={`mt-1 text-xs ${stale ? "font-bold text-rose-600" : "text-stone-500"}`}>{ageLabel(c.created_at)}</div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
