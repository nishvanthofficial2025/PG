import { requireStaff, inList } from "@/lib/auth";
import { all } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { propertyList } from "@/lib/scope";
import { PageHeader, Flash, Section, Empty } from "@/components/ui";
import { Submit } from "@/components/client";
import { postNoticeAction, deleteNoticeAction, togglePinAction } from "../actions";

export default async function Notices({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const u = await requireStaff();
  const props = await propertyList(u.propertyIds);
  const notices = await all<{ id: number; title: string; body: string; pinned: number; created_at: string; property: string | null; author: string }>(
    `SELECT n.id, n.title, n.body, n.pinned, n.created_at, p.name property, a.name author FROM notices n LEFT JOIN properties p ON p.id = n.property_id JOIN users a ON a.id = n.created_by
     WHERE n.owner_id = ? AND (n.property_id IS NULL OR n.property_id IN (${inList(u.propertyIds)})) ORDER BY n.pinned DESC, n.created_at DESC`,
    u.owner_id,
    ...u.propertyIds,
  );
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Notices" subtitle="Residents get an alert as soon as you post." back="/owner/more" />
      <Flash sp={sp} />
      <form action={postNoticeAction} className="card mb-6 space-y-3">
        <input name="title" className="input" placeholder="Title, e.g. Water off Sunday 10–2" required />
        <textarea name="body" rows={3} className="input" placeholder="Details (optional)" />
        <div className="flex flex-wrap items-center gap-3">
          <select name="property_id" className="input w-auto flex-1" defaultValue={u.role === "owner" && props.length > 1 ? "all" : String(props[0]?.id ?? "")}>
            {u.role === "owner" && props.length > 1 && <option value="all">All properties</option>}
            {props.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="pinned" className="h-5 w-5" /> Pin
          </label>
        </div>
        <Submit>Post notice</Submit>
      </form>
      <Section title="Posted">
        {notices.length === 0 ? (
          <Empty title="No notices yet" />
        ) : (
          <div className="space-y-2">
            {notices.map((n) => (
              <div key={n.id} className={`card ${n.pinned ? "border-amber-300 bg-amber-50/50" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">
                      {n.pinned ? "📌 " : ""}
                      {n.title}
                    </div>
                    {n.body && <p className="mt-1 whitespace-pre-line text-sm text-stone-600">{n.body}</p>}
                    <div className="mt-1 text-xs text-stone-500">
                      {n.property ?? "All properties"} · {fmtDate(n.created_at)} · {n.author}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <form action={togglePinAction}>
                      <input type="hidden" name="id" value={n.id} />
                      <Submit className="btn-secondary btn-sm">{n.pinned ? "Unpin" : "Pin"}</Submit>
                    </form>
                    <form action={deleteNoticeAction}>
                      <input type="hidden" name="id" value={n.id} />
                      <Submit className="btn-secondary btn-sm" confirm="Remove this notice?">
                        ✕
                      </Submit>
                    </form>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
