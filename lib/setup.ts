import "server-only";
import { run, tx, logActivity } from "./db";

export type RoomSpec = { number: string; sharing: number; rent: number; ac: boolean; bath: boolean };
export type FloorSpec = { name: string; rooms: RoomSpec[] };
export type PropertySpec = {
  name: string;
  address?: string;
  type: string;
  amenities?: string;
  rules?: string;
  wifi_name?: string;
  wifi_password?: string;
  contact_phone?: string;
  billing_day: number;
  due_day: number;
  late_fee: number;
  notice_days: number;
  floors: FloorSpec[];
};

const LETTERS = "ABCDEFGHIJKL";

/** Bulk wizard: "3 floors, 5 rooms each, double sharing, ₹8,000/bed" → property + floors + rooms + beds. */
export function wizardFloors(opts: { floors: number; roomsPerFloor: number; sharing: number; rent: number; ac: boolean; bath: boolean; groundFloor: boolean }): FloorSpec[] {
  const out: FloorSpec[] = [];
  for (let f = 0; f < opts.floors; f++) {
    const level = opts.groundFloor ? f : f + 1;
    const name = level === 0 ? "Ground floor" : `Floor ${level}`;
    const rooms: RoomSpec[] = [];
    for (let r = 1; r <= opts.roomsPerFloor; r++) {
      rooms.push({ number: String(level * 100 + r).padStart(3, "0"), sharing: opts.sharing, rent: opts.rent, ac: opts.ac, bath: opts.bath });
    }
    out.push({ name, rooms });
  }
  return out;
}

export async function createProperty(ownerId: number, userId: number, spec: PropertySpec): Promise<number> {
  return await tx(async () => {
    const p = await run(
      `INSERT INTO properties (owner_id, name, address, type, amenities, rules, wifi_name, wifi_password, contact_phone, billing_day, due_day, late_fee, notice_days)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ownerId,
      spec.name,
      spec.address ?? null,
      spec.type,
      spec.amenities ?? null,
      spec.rules ?? null,
      spec.wifi_name ?? null,
      spec.wifi_password ?? null,
      spec.contact_phone ?? null,
      spec.billing_day,
      spec.due_day,
      spec.late_fee,
      spec.notice_days,
    );
    for (const [i, f] of spec.floors.entries()) await addFloor(p.id, f, i);
    await logActivity(ownerId, userId, "create_property", "property", p.id, spec.name);
    return p.id;
  });
}

export async function addFloor(propertyId: number, f: FloorSpec, sort: number) {
  const fl = await run("INSERT INTO floors (property_id, name, sort) VALUES (?, ?, ?)", propertyId, f.name, sort);
  for (const r of f.rooms) await addRoom(propertyId, fl.id, r);
}

export async function addRoom(propertyId: number, floorId: number, r: RoomSpec) {
  const room = await run(
    "INSERT INTO rooms (property_id, floor_id, number, sharing, is_ac, attached_bath) VALUES (?, ?, ?, ?, ?, ?)",
    propertyId,
    floorId,
    r.number,
    r.sharing,
    r.ac ? 1 : 0,
    r.bath ? 1 : 0,
  );
  for (let b = 0; b < r.sharing; b++) {
    const label = r.sharing === 1 ? r.number : `${r.number}-${LETTERS[b]}`;
    await run("INSERT INTO beds (property_id, room_id, label, monthly_rent) VALUES (?, ?, ?, ?)", propertyId, room.id, label, r.rent);
  }
}
