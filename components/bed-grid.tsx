import Link from "next/link";
import { all, get } from "@/lib/db";
import { inList } from "@/lib/auth";
import { BED_STATUS, inr, firstName } from "@/lib/format";

type BedRow = { id: number; label: string; status: string; monthly_rent: number; room_id: number; resident: string | null };

/** Colour-coded bed grid grouped Property → Floor → Room. */
export function BedGrid({ propertyIds, status }: { propertyIds: number[]; status?: string }) {
  const q = inList(propertyIds);
  const props = all<{ id: number; name: string }>(`SELECT id, name FROM properties WHERE id IN (${q}) ORDER BY id`, ...propertyIds);
  const floors = all<{ id: number; property_id: number; name: string }>(`SELECT id, property_id, name FROM floors WHERE property_id IN (${q}) ORDER BY sort, id`, ...propertyIds);
  const rooms = all<{ id: number; floor_id: number; number: string; sharing: number; is_ac: number; attached_bath: number }>(`SELECT * FROM rooms WHERE property_id IN (${q}) ORDER BY number`, ...propertyIds);
  const beds = all<BedRow>(
    `SELECT b.id, b.label, b.status, b.monthly_rent, b.room_id,
       (SELECT u.name FROM stays s JOIN users u ON u.id = s.resident_id WHERE s.bed_id = b.id AND s.status IN ('active','notice') LIMIT 1) resident
     FROM beds b WHERE b.property_id IN (${q}) ORDER BY b.label`,
    ...propertyIds,
  );
  const shown = status ? beds.filter((b) => b.status === status) : beds;

  return (
    <div className="space-y-6">
      {props.map((p) => {
        const pFloors = floors.filter((f) => f.property_id === p.id);
        return (
          <div key={p.id}>
            {props.length > 1 && (
              <Link href={`/owner/properties/${p.id}`} className="mb-2 block text-lg font-bold">
                {p.name} →
              </Link>
            )}
            <div className="space-y-4">
              {pFloors.map((f) => {
                const fRooms = rooms.filter((r) => r.floor_id === f.id).filter((r) => shown.some((b) => b.room_id === r.id));
                if (!fRooms.length) return null;
                return (
                  <div key={f.id}>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">{f.name}</div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {fRooms.map((r) => (
                        <div key={r.id} className="card p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <div className="font-bold">Room {r.number}</div>
                            <div className="text-xs text-stone-500">
                              {r.sharing === 1 ? "Single" : `${r.sharing}-sharing`}
                              {r.is_ac ? " · AC" : ""}
                              {r.attached_bath ? " · Bath" : ""}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {shown
                              .filter((b) => b.room_id === r.id)
                              .map((b) => (
                                <Link key={b.id} href={`/owner/beds/${b.id}`} className={`rounded-xl border px-2.5 py-2 text-sm transition hover:brightness-95 ${BED_STATUS[b.status].cls}`}>
                                  <div className="flex items-center justify-between font-bold">
                                    <span>{b.label}</span>
                                    <span className="text-[10px] font-semibold uppercase opacity-70">{BED_STATUS[b.status].label}</span>
                                  </div>
                                  <div className="truncate text-xs opacity-80">{b.resident ? firstName(b.resident) : b.status === "vacant" ? `+ Add · ${inr(b.monthly_rent)}` : inr(b.monthly_rent)}</div>
                                </Link>
                              ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function BedLegend({ counts, active, base }: { counts: Record<string, number>; active?: string; base: string }) {
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      <Link href={base} className={`chip border px-3 py-1 ${!active ? "border-stone-800 bg-stone-800 text-white" : "border-stone-300 bg-white text-stone-700"}`}>
        All {Object.values(counts).reduce((a, b) => a + b, 0)}
      </Link>
      {Object.entries(BED_STATUS).map(([k, v]) => (
        <Link key={k} href={`${base}?status=${k}`} className={`chip border px-3 py-1 ${v.cls} ${active === k ? "ring-2 ring-stone-800" : ""}`}>
          {v.label} {counts[k] ?? 0}
        </Link>
      ))}
    </div>
  );
}

export function bedCounts(propertyIds: number[]): Record<string, number> {
  const rows = all<{ status: string; n: number }>(`SELECT status, COUNT(*) n FROM beds WHERE property_id IN (${inList(propertyIds)}) GROUP BY status`, ...propertyIds);
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}

export function propertyName(id: number) {
  return get<{ name: string }>("SELECT name FROM properties WHERE id = ?", id)?.name;
}
