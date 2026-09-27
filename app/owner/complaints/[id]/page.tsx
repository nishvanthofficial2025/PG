import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { ageLabel, fmtDate, COMPLAINT_STATUS } from "@/lib/format";
import { PageHeader, Flash, Badge, Row } from "@/components/ui";
import { Submit } from "@/components/client";
import { updateComplaintAction } from "../../actions";

const NEXT: Record<string, { status: string; label: string }[]> = {
  open: [{ status: "in_progress", label: "Start work" }, { status: "resolved", label: "Mark resolved" }],
  in_progress: [{ status: "resolved", label: "Mark resolved" }],
  resolved: [{ status: "closed", label: "Close" }, { status: "open", label: "Reopen" }],
  closed: [{ status: "open", label: "Reopen" }],
};

export default async function Complaint({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const u = await requireStaff();
  const c = get<{ id: number; property_id: number; resident_id: number; category: string; description: string; status: string; priority: string; created_at: string; resolved_at: string | null; rating: number | null; photo_file_id: string | null; assigned_to: number | null; name: string; phone: string; room: string | null; property: string }>(
    `SELECT c.*, u.name, u.phone, r.number room, p.name property FROM complaints c JOIN users u ON u.id = c.resident_id LEFT JOIN rooms r ON r.id = c.room_id JOIN properties p ON p.id = c.property_id WHERE c.id = ?`,
    Number(id),
  );
  if (!c || !u.propertyIds.includes(c.property_id)) notFound();
  const team = all<{ id: number; name: string; role: string }>(
    `SELECT id, name, role FROM users WHERE (id = ? OR (owner_id = ? AND role IN ('manager','staff') AND status = 'active'
       AND EXISTS (SELECT 1 FROM manager_properties mp WHERE mp.user_id = users.id AND mp.property_id = ?)))`,
    u.owner_id,
    u.owner_id,
    c.property_id,
  );
  const back = `/owner/complaints/${c.id}`;

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title={`#${c.id} · ${c.category === "wifi" ? "Wi-Fi" : c.category[0].toUpperCase() + c.category.slice(1)}`} subtitle={`${c.property}${c.room ? ` · Room ${c.room}` : ""}`} back="/owner/complaints" action={<Badge cls={COMPLAINT_STATUS[c.status].cls}>{COMPLAINT_STATUS[c.status].label}</Badge>} />
      <Flash sp={sp} />
      <div className="card mb-4">
        <p className="whitespace-pre-line text-base">{c.description}</p>
        {c.photo_file_id && (
          <a href={`/api/files/${c.photo_file_id}`} target="_blank">
            <img src={`/api/files/${c.photo_file_id}`} alt="Complaint photo" className="mt-3 max-h-72 rounded-xl border border-stone-200 object-cover" />
          </a>
        )}
        <div className="mt-3 border-t border-stone-100 pt-2">
          <Row label="Raised by">
            <Link href={`/owner/residents/${c.resident_id}`} className="text-brand-700 underline">
              {c.name}
            </Link>{" "}
            · <a href={`tel:+91${c.phone}`}>{c.phone}</a>
          </Row>
          <Row label="Raised">{ageLabel(c.created_at)}</Row>
          {c.resolved_at && <Row label="Resolved">{fmtDate(c.resolved_at)}</Row>}
          {c.rating && <Row label="Resident rating">{"★".repeat(c.rating) + "☆".repeat(5 - c.rating)}</Row>}
        </div>
      </div>

      <form action={updateComplaintAction} className="card mb-4 grid grid-cols-2 gap-3">
        <input type="hidden" name="id" value={c.id} />
        <input type="hidden" name="back" value={back} />
        <div>
          <label className="label">Assigned to</label>
          <select name="assigned_to" className="input" defaultValue={c.assigned_to ?? ""}>
            <option value="">Unassigned</option>
            {team.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.role})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Priority</label>
          <select name="priority" className="input" defaultValue={c.priority}>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </select>
        </div>
        <div className="col-span-2">
          <Submit className="btn-secondary w-full">Save</Submit>
        </div>
      </form>

      <div className="grid gap-2">
        {NEXT[c.status].map((n) => (
          <form key={n.status} action={updateComplaintAction}>
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="back" value={back} />
            <input type="hidden" name="status" value={n.status} />
            <Submit className={n.status === "open" ? "btn-secondary w-full" : "btn-primary w-full"}>{n.label}</Submit>
          </form>
        ))}
      </div>
      <p className="mt-3 text-center text-xs text-stone-500">The resident is notified at every status change and can reopen if it isn’t fixed.</p>
    </div>
  );
}
