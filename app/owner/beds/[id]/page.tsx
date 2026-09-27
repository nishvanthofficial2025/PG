import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { BED_STATUS, inr, fmtDate, today } from "@/lib/format";
import { PageHeader, Flash, Badge, Row } from "@/components/ui";
import { Submit } from "@/components/client";
import { checkInAction, updateBedAction } from "../../actions";

export default async function BedPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const u = await requireStaff();
  const bed = get<{ id: number; label: string; status: string; monthly_rent: number; property_id: number; property: string; room: string; sharing: number; is_ac: number; attached_bath: number }>(
    `SELECT b.*, p.name property, r.number room, r.sharing, r.is_ac, r.attached_bath
     FROM beds b JOIN properties p ON p.id = b.property_id JOIN rooms r ON r.id = b.room_id WHERE b.id = ?`,
    Number(id),
  );
  if (!bed || !u.propertyIds.includes(bed.property_id)) notFound();

  const stays = all<{ id: number; resident_id: number; name: string; phone: string; status: string; move_in: string; move_out: string | null; rent: number }>(
    `SELECT s.id, s.resident_id, u.name, u.phone, s.status, s.move_in, s.move_out, s.rent FROM stays s JOIN users u ON u.id = s.resident_id
     WHERE s.bed_id = ? AND s.status IN ('reserved','active','notice') ORDER BY s.move_in`,
    bed.id,
  );
  const current = stays.find((s) => s.status !== "reserved");
  const reserved = stays.find((s) => s.status === "reserved");
  const canAdd = (bed.status === "vacant" || bed.status === "notice") && !reserved;

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title={`Bed ${bed.label}`} subtitle={`${bed.property} · Room ${bed.room}`} back="/owner/beds" action={<Badge cls={BED_STATUS[bed.status].cls + " border"}>{BED_STATUS[bed.status].label}</Badge>} />
      <Flash sp={sp} />

      <div className="card mb-4">
        <Row label="Room type">
          {bed.sharing === 1 ? "Single" : `${bed.sharing}-sharing`}
          {bed.is_ac ? ", AC" : ", Non-AC"}
          {bed.attached_bath ? ", attached bath" : ""}
        </Row>
        <Row label="Monthly rent">{inr(bed.monthly_rent)}</Row>
        {current && (
          <Row label={current.status === "notice" ? "Resident (on notice)" : "Resident"}>
            <Link href={`/owner/residents/${current.resident_id}`} className="text-brand-700 underline">
              {current.name}
            </Link>
            {current.move_out && <div className="text-xs text-stone-500">Leaving {fmtDate(current.move_out)}</div>}
          </Row>
        )}
        {reserved && (
          <Row label="Reserved for">
            <Link href={`/owner/residents/${reserved.resident_id}`} className="text-brand-700 underline">
              {reserved.name}
            </Link>
            <div className="text-xs text-stone-500">Arriving {fmtDate(reserved.move_in)}</div>
          </Row>
        )}
      </div>

      {canAdd && (
        <form action={checkInAction} className="card mb-4 space-y-4">
          <h2 className="text-lg font-bold">{bed.status === "notice" ? "Book this bed for the next resident" : "Add resident"}</h2>
          <input type="hidden" name="bed_id" value={bed.id} />
          <div>
            <label className="label">Full name</label>
            <input name="name" className="input" required autoComplete="off" />
          </div>
          <div>
            <label className="label">Mobile number</label>
            <input name="phone" className="input" inputMode="numeric" maxLength={10} required placeholder="10-digit number" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Move-in date</label>
              <input name="move_in" type="date" className="input" defaultValue={current?.move_out ?? today()} required />
            </div>
            <div>
              <label className="label">Monthly rent (₹)</label>
              <input name="rent" type="number" min={0} className="input" defaultValue={bed.monthly_rent} required />
            </div>
            <div>
              <label className="label">Security deposit (₹)</label>
              <input name="deposit" type="number" min={0} className="input" defaultValue={bed.monthly_rent * 2} />
            </div>
            <div>
              <label className="label">Occupation</label>
              <select name="occupation" className="input">
                <option>Working professional</option>
                <option>Student</option>
                <option>Other</option>
              </select>
            </div>
          </div>
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-brand-700">More details (optional)</summary>
            <div className="mt-3 space-y-3">
              <div>
                <label className="label">Email</label>
                <input name="email" type="email" className="input" />
              </div>
              <div>
                <label className="label">College / company</label>
                <input name="college_company" className="input" />
              </div>
            </div>
          </details>
          <p className="text-xs text-stone-500">First month’s rent is prorated automatically. The resident gets an invite to finish their profile and upload KYC.</p>
          <Submit>{bed.status === "notice" ? "Reserve bed" : "Add resident"}</Submit>
        </form>
      )}

      <div className="card space-y-3">
        <h2 className="font-bold">Bed options</h2>
        {u.role === "owner" && (
          <form action={updateBedAction} className="flex items-end gap-2">
            <input type="hidden" name="bed_id" value={bed.id} />
            <div className="flex-1">
              <label className="label">Default rent for this bed (₹)</label>
              <input name="monthly_rent" type="number" min={0} className="input" defaultValue={bed.monthly_rent} />
            </div>
            <Submit className="btn-secondary">Save</Submit>
          </form>
        )}
        {bed.status === "vacant" && (
          <form action={updateBedAction}>
            <input type="hidden" name="bed_id" value={bed.id} />
            <input type="hidden" name="status" value="maintenance" />
            <Submit className="btn-secondary w-full">Mark under maintenance</Submit>
          </form>
        )}
        {bed.status === "maintenance" && (
          <form action={updateBedAction}>
            <input type="hidden" name="bed_id" value={bed.id} />
            <input type="hidden" name="status" value="vacant" />
            <Submit className="btn-secondary w-full">Maintenance done — mark vacant</Submit>
          </form>
        )}
      </div>
    </div>
  );
}
