import Link from "next/link";
import { requireStaff, inList } from "@/lib/auth";
import { all } from "@/lib/db";
import { PageHeader, Empty } from "@/components/ui";

export default async function Properties() {
  const u = await requireStaff();
  const rows = all<{ id: number; name: string; address: string | null; type: string; beds: number; occupied: number; vacant: number }>(
    `SELECT p.id, p.name, p.address, p.type, COUNT(b.id) beds,
       SUM(b.status IN ('occupied','notice')) occupied, SUM(b.status = 'vacant') vacant
     FROM properties p LEFT JOIN beds b ON b.property_id = p.id
     WHERE p.id IN (${inList(u.propertyIds)}) GROUP BY p.id ORDER BY p.id`,
    ...u.propertyIds,
  );
  return (
    <>
      <PageHeader
        title="Properties"
        back="/owner/more"
        action={
          u.role === "owner" && (
            <Link href="/owner/properties/new" className="btn-primary btn-sm">
              + Add property
            </Link>
          )
        }
      />
      {rows.length === 0 ? (
        <Empty title="No properties yet">Add one with the setup wizard.</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map((p) => (
            <Link key={p.id} href={`/owner/properties/${p.id}`} className="card block">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-lg font-bold">{p.name}</div>
                  <div className="text-sm text-stone-500">{p.address}</div>
                </div>
                <span className="chip bg-stone-100 capitalize text-stone-700">{p.type === "coed" ? "Co-living" : p.type}</span>
              </div>
              <div className="mt-3 flex gap-4 text-sm">
                <span>
                  <b>{p.beds}</b> beds
                </span>
                <span className="text-sky-800">
                  <b>{p.occupied}</b> occupied
                </span>
                <span className="text-emerald-700">
                  <b>{p.vacant}</b> vacant
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
