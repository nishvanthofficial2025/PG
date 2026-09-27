import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { BED_STATUS } from "@/lib/format";
import { BedGrid, BedLegend, bedCounts } from "@/components/bed-grid";
import { PageHeader, Flash } from "@/components/ui";
import { Submit } from "@/components/client";
import { addRoomAction } from "../../actions";

export default async function PropertyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; ok?: string; err?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const u = await requireStaff();
  const pid = Number(id);
  if (!u.propertyIds.includes(pid)) notFound();
  const p = get<{ name: string; address: string | null }>("SELECT name, address FROM properties WHERE id = ?", pid)!;
  const floors = all<{ name: string }>("SELECT name FROM floors WHERE property_id = ? ORDER BY sort, id", pid);
  const status = sp.status && sp.status in BED_STATUS ? sp.status : undefined;

  return (
    <>
      <PageHeader
        title={p.name}
        subtitle={p.address}
        back="/owner/properties"
        action={
          u.role === "owner" && (
            <Link href={`/owner/properties/${pid}/settings`} className="btn-secondary btn-sm">
              Settings
            </Link>
          )
        }
      />
      <Flash sp={sp} />
      <BedLegend counts={bedCounts([pid])} active={status} base={`/owner/properties/${pid}`} />
      <BedGrid propertyIds={[pid]} status={status} />

      {u.role === "owner" && (
        <details className="card mt-6">
          <summary className="cursor-pointer font-bold">+ Add a room</summary>
          <form action={addRoomAction} className="mt-4 grid grid-cols-2 gap-3">
            <input type="hidden" name="property_id" value={pid} />
            <div className="col-span-2">
              <label className="label">Floor</label>
              <input name="floor" className="input" list="floors" defaultValue={floors[0]?.name} />
              <datalist id="floors">
                {floors.map((f) => (
                  <option key={f.name} value={f.name} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="label">Room number</label>
              <input name="number" className="input" required />
            </div>
            <div>
              <label className="label">Beds</label>
              <input name="sharing" type="number" min={1} max={12} defaultValue={2} className="input" />
            </div>
            <div className="col-span-2">
              <label className="label">Rent per bed (₹)</label>
              <input name="rent" type="number" min={0} step={100} defaultValue={8000} className="input" />
            </div>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" name="ac" className="h-5 w-5" /> AC
            </label>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" name="bath" className="h-5 w-5" defaultChecked /> Attached bath
            </label>
            <div className="col-span-2">
              <Submit>Add room</Submit>
            </div>
          </form>
        </details>
      )}
    </>
  );
}
