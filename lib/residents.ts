import "server-only";
import { get, run, logActivity } from "./db";
import { createInvoiceForStay, stayDues, type Stay } from "./billing";
import { addDays, thisMonth, today, inr } from "./format";
import { notify } from "./notify";

export type NewResident = {
  name: string;
  phone: string;
  email?: string | null;
  bedId: number;
  moveIn: string;
  rent: number;
  deposit: number;
  occupation?: string | null;
  college_company?: string | null;
};

/** Assigns a (new or returning) resident to a bed. Caller wraps in tx(). */
export function checkIn(ownerId: number, userId: number, r: NewResident): { residentId: number; stayId: number } {
  const bed = get<{ id: number; property_id: number; status: string }>(
    "SELECT b.id, b.property_id, b.status FROM beds b JOIN properties p ON p.id = b.property_id WHERE b.id = ? AND p.owner_id = ?",
    r.bedId,
    ownerId,
  );
  if (!bed) throw new Error("Bed not found");
  if (bed.status !== "vacant" && bed.status !== "notice") throw new Error("That bed is not free");

  let user = get<{ id: number; role: string; owner_id: number }>("SELECT id, role, owner_id FROM users WHERE phone = ?", r.phone);
  if (user && (user.role !== "resident" || user.owner_id !== ownerId)) throw new Error("This phone number is already registered to another account");
  if (user) {
    const open = get("SELECT id FROM stays WHERE resident_id = ? AND status IN ('reserved','active','notice')", user.id);
    if (open) throw new Error("This resident already has an active bed");
    run("UPDATE users SET name = ?, email = COALESCE(?, email), status = 'invited' WHERE id = ?", r.name, r.email ?? null, user.id);
  } else {
    const u = run("INSERT INTO users (owner_id, name, phone, email, role, status) VALUES (?, ?, ?, ?, 'resident', 'invited')", ownerId, r.name, r.phone, r.email ?? null);
    run("INSERT INTO resident_profiles (user_id, occupation, college_company) VALUES (?, ?, ?)", u.id, r.occupation ?? null, r.college_company ?? null);
    user = { id: u.id, role: "resident", owner_id: ownerId };
  }

  // A bed "on notice" can be booked for after the current resident leaves.
  const future = r.moveIn > today() || bed.status === "notice";
  const s = run(
    "INSERT INTO stays (owner_id, property_id, resident_id, bed_id, move_in, rent, deposit, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ownerId,
    bed.property_id,
    user.id,
    bed.id,
    r.moveIn,
    r.rent,
    r.deposit,
    future ? "reserved" : "active",
  );
  if (bed.status === "vacant") run("UPDATE beds SET status = ? WHERE id = ?", future ? "reserved" : "occupied", bed.id);
  if (!future) createInvoiceForStay(get<Stay>("SELECT * FROM stays WHERE id = ?", s.id)!, thisMonth());
  logActivity(ownerId, userId, future ? "reserve_bed" : "check_in", "stay", s.id, `${r.name} rent ${inr(r.rent)} deposit ${inr(r.deposit)}`);
  return { residentId: user.id, stayId: s.id };
}

/** Converts a reserved stay into an active one (resident has arrived). */
export function activateReserved(ownerId: number, userId: number, stayId: number) {
  const stay = get<Stay>("SELECT * FROM stays WHERE id = ? AND owner_id = ? AND status = 'reserved'", stayId, ownerId);
  if (!stay) throw new Error("Reservation not found");
  const occupied = get("SELECT id FROM stays WHERE bed_id = ? AND status IN ('active','notice')", stay.bed_id);
  if (occupied) throw new Error("The current resident of this bed hasn't moved out yet");
  const moveIn = stay.move_in > today() ? today() : stay.move_in;
  run("UPDATE stays SET status = 'active', move_in = ? WHERE id = ?", moveIn, stayId);
  run("UPDATE beds SET status = 'occupied' WHERE id = ?", stay.bed_id);
  createInvoiceForStay({ ...stay, move_in: moveIn, status: "active" }, thisMonth());
  logActivity(ownerId, userId, "check_in", "stay", stayId);
}

/** Starts the notice period (from resident or owner). */
export function giveNotice(stayId: number, byUserId: number, noticeDate = today()) {
  const stay = get<Stay & { notice_days: number }>(
    "SELECT s.*, p.notice_days FROM stays s JOIN properties p ON p.id = s.property_id WHERE s.id = ? AND s.status = 'active'",
    stayId,
  );
  if (!stay) throw new Error("No active stay");
  const moveOut = addDays(noticeDate, stay.notice_days);
  run("UPDATE stays SET status = 'notice', notice_date = ?, move_out = ? WHERE id = ?", noticeDate, moveOut, stayId);
  run("UPDATE beds SET status = 'notice' WHERE id = ?", stay.bed_id);
  logActivity(stay.owner_id, byUserId, "give_notice", "stay", stayId, `move-out ${moveOut}`);
  notify(stay.resident_id, "Move-out notice recorded", `Your last day is ${moveOut}.`);
  return moveOut;
}

/** Final settlement: refund = deposit − pending dues − deductions. Closes the stay. */
export function settle(ownerId: number, userId: number, stayId: number, deductions: number, note: string) {
  const stay = get<Stay>("SELECT * FROM stays WHERE id = ? AND owner_id = ? AND status IN ('active','notice')", stayId, ownerId);
  if (!stay) throw new Error("Stay not found");
  const dues = stayDues(stayId);
  const refund = stay.deposit - dues - deductions;
  const moveOut = stay.move_out && stay.move_out < today() ? stay.move_out : today();
  run(
    "UPDATE stays SET status = 'closed', move_out = ?, deductions = ?, deduction_note = ?, refund_amount = ? WHERE id = ?",
    moveOut,
    deductions,
    note || null,
    refund,
    stayId,
  );
  const next = get("SELECT id FROM stays WHERE bed_id = ? AND status = 'reserved'", stay.bed_id);
  run("UPDATE beds SET status = ? WHERE id = ?", next ? "reserved" : "vacant", stay.bed_id);
  run("UPDATE users SET status = 'read_only' WHERE id = ?", stay.resident_id);
  logActivity(ownerId, userId, "settle", "stay", stayId, `deposit ${inr(stay.deposit)} dues ${inr(dues)} deductions ${inr(deductions)} refund ${inr(refund)}`);
  notify(stay.resident_id, "Move-out settled", `Refund due to you: ${inr(Math.max(refund, 0))}`);
  return refund;
}

/** Moves a resident to another bed, keeping history (old stay → 'shifted'). */
export function shiftRoom(ownerId: number, userId: number, stayId: number, newBedId: number, newRent: number) {
  const stay = get<Stay>("SELECT * FROM stays WHERE id = ? AND owner_id = ? AND status = 'active'", stayId, ownerId);
  if (!stay) throw new Error("Only active stays can be shifted");
  const bed = get<{ id: number; property_id: number; status: string }>(
    "SELECT b.id, b.property_id, b.status FROM beds b JOIN properties p ON p.id = b.property_id WHERE b.id = ? AND p.owner_id = ?",
    newBedId,
    ownerId,
  );
  if (!bed || bed.status !== "vacant") throw new Error("Pick a vacant bed");
  const t = today();
  run("UPDATE stays SET status = 'shifted', move_out = ? WHERE id = ?", t, stayId);
  run("UPDATE beds SET status = 'vacant' WHERE id = ?", stay.bed_id);
  const s = run(
    "INSERT INTO stays (owner_id, property_id, resident_id, bed_id, move_in, rent, deposit, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'active')",
    ownerId,
    bed.property_id,
    stay.resident_id,
    bed.id,
    t,
    newRent,
    stay.deposit,
  );
  run("UPDATE beds SET status = 'occupied' WHERE id = ?", bed.id);
  // Any unpaid invoices follow the resident to the new stay.
  run("UPDATE invoices SET stay_id = ? WHERE stay_id = ? AND status != 'paid' AND month NOT IN (SELECT month FROM invoices WHERE stay_id = ?)", s.id, stayId, s.id);
  logActivity(ownerId, userId, "shift_room", "stay", s.id, `from bed ${stay.bed_id} to ${bed.id}`);
  return s.id;
}
