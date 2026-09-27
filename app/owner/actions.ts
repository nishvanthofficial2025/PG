"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { all, get, run, tx, logActivity } from "@/lib/db";
import { requireStaff, requireOwner, assertProperty, inList } from "@/lib/auth";
import { attempt, str, optStr, num, bool, need } from "@/lib/action";
import { SCOPE_COOKIE } from "@/lib/scope";
import { createProperty, wizardFloors, addRoom } from "@/lib/setup";
import { checkIn, activateReserved, giveNotice, settle, shiftRoom } from "@/lib/residents";
import { generateInvoices, recordPayment, addInvoiceItem, recalcInvoice, receiptNo } from "@/lib/billing";
import { saveUpload } from "@/lib/files";
import { notify } from "@/lib/notify";
import { normalizePhone, today, thisMonth, inr, fmtMonth, COMPLAINT_STATUS } from "@/lib/format";

/* ---------- scope ---------- */

export async function setScope(value: string) {
  (await cookies()).set(SCOPE_COOKIE, value, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/owner", "layout");
}

/* ---------- properties & beds ---------- */

export async function createPropertyAction(fd: FormData) {
  const u = await requireOwner();
  await attempt("/owner/properties/new", () => {
    const name = str(fd, "name");
    need(name, "Give the property a name");
    const floors = Math.min(num(fd, "floors", 1), 20);
    const rooms = Math.min(num(fd, "rooms", 1), 40);
    const sharing = Math.min(Math.max(num(fd, "sharing", 2), 1), 12);
    const rent = num(fd, "rent");
    need(floors > 0 && rooms > 0, "Enter floors and rooms");
    need(rent > 0, "Enter the rent per bed");
    const id = createProperty(u.id, u.id, {
      name,
      address: optStr(fd, "address") ?? undefined,
      type: str(fd, "type") || "coed",
      amenities: optStr(fd, "amenities") ?? undefined,
      rules: optStr(fd, "rules") ?? undefined,
      contact_phone: normalizePhone(str(fd, "contact_phone")) || u.phone,
      billing_day: Math.min(Math.max(num(fd, "billing_day", 1), 1), 28),
      due_day: Math.min(Math.max(num(fd, "due_day", 5), 1), 28),
      late_fee: num(fd, "late_fee"),
      notice_days: num(fd, "notice_days", 30),
      floors: wizardFloors({ floors, roomsPerFloor: rooms, sharing, rent, ac: bool(fd, "ac"), bath: bool(fd, "bath"), groundFloor: bool(fd, "ground") }),
    });
    return `/owner/properties/${id}`;
  }, "Property created. Tap any bed to add a resident.");
}

export async function updatePropertyAction(fd: FormData) {
  const u = await requireOwner();
  const id = num(fd, "id");
  await attempt(`/owner/properties/${id}/settings`, () => {
    assertProperty(u, id);
    run(
      `UPDATE properties SET name = ?, address = ?, type = ?, amenities = ?, rules = ?, wifi_name = ?, wifi_password = ?, contact_phone = ?,
       billing_day = ?, due_day = ?, late_fee = ?, notice_days = ?, show_roommates = ? WHERE id = ? AND owner_id = ?`,
      str(fd, "name"),
      optStr(fd, "address"),
      str(fd, "type") || "coed",
      optStr(fd, "amenities"),
      optStr(fd, "rules"),
      optStr(fd, "wifi_name"),
      optStr(fd, "wifi_password"),
      normalizePhone(str(fd, "contact_phone")) || null,
      Math.min(Math.max(num(fd, "billing_day", 1), 1), 28),
      Math.min(Math.max(num(fd, "due_day", 5), 1), 28),
      num(fd, "late_fee"),
      num(fd, "notice_days", 30),
      bool(fd, "show_roommates") ? 1 : 0,
      id,
      u.id,
    );
    logActivity(u.id, u.id, "update_property", "property", id);
  }, "Saved");
}

export async function addRoomAction(fd: FormData) {
  const u = await requireOwner();
  const propertyId = num(fd, "property_id");
  await attempt(`/owner/properties/${propertyId}`, () => {
    assertProperty(u, propertyId);
    const floorName = str(fd, "floor") || "Ground floor";
    let floor = get<{ id: number }>("SELECT id FROM floors WHERE property_id = ? AND name = ?", propertyId, floorName);
    if (!floor) floor = { id: run("INSERT INTO floors (property_id, name, sort) VALUES (?, ?, 99)", propertyId, floorName).id };
    const number = str(fd, "number");
    need(number, "Enter a room number");
    need(!get("SELECT 1 FROM rooms WHERE property_id = ? AND number = ?", propertyId, number), "Room number already exists");
    addRoom(propertyId, floor.id, { number, sharing: Math.min(Math.max(num(fd, "sharing", 1), 1), 12), rent: num(fd, "rent"), ac: bool(fd, "ac"), bath: bool(fd, "bath") });
  }, "Room added");
}

export async function updateBedAction(fd: FormData) {
  const u = await requireStaff();
  const bedId = num(fd, "bed_id");
  await attempt(`/owner/beds/${bedId}`, () => {
    const bed = get<{ property_id: number; status: string }>("SELECT property_id, status FROM beds WHERE id = ?", bedId);
    need(bed, "Bed not found");
    assertProperty(u, bed.property_id);
    const rent = num(fd, "monthly_rent", -1);
    if (rent >= 0) {
      need(u.role === "owner", "Only the owner can change rent");
      run("UPDATE beds SET monthly_rent = ? WHERE id = ?", rent, bedId);
      logActivity(u.owner_id, u.id, "change_bed_rent", "bed", bedId, inr(rent));
    }
    const status = str(fd, "status");
    if (status) {
      need((bed.status === "vacant" && status === "maintenance") || (bed.status === "maintenance" && status === "vacant"), "Only vacant beds can be marked for maintenance");
      run("UPDATE beds SET status = ? WHERE id = ?", status, bedId);
    }
  }, "Bed updated");
}

/* ---------- residents ---------- */

export async function checkInAction(fd: FormData) {
  const u = await requireStaff();
  const bedId = num(fd, "bed_id");
  await attempt(`/owner/beds/${bedId}`, () => {
    const bed = get<{ property_id: number }>("SELECT property_id FROM beds WHERE id = ?", bedId);
    need(bed, "Bed not found");
    assertProperty(u, bed.property_id);
    const phone = normalizePhone(str(fd, "phone"));
    need(/^[6-9]\d{9}$/.test(phone), "Enter a valid 10-digit mobile number");
    need(str(fd, "name"), "Enter the resident's name");
    const { residentId } = tx(() =>
      checkIn(u.owner_id, u.id, {
        name: str(fd, "name"),
        phone,
        email: optStr(fd, "email"),
        bedId,
        moveIn: str(fd, "move_in") || today(),
        rent: num(fd, "rent"),
        deposit: num(fd, "deposit"),
        occupation: optStr(fd, "occupation"),
        college_company: optStr(fd, "college_company"),
      }),
    );
    return `/owner/residents/${residentId}?invite=1`;
  }, "Resident added. Send them the invite link below.");
}

export async function activateAction(fd: FormData) {
  const u = await requireStaff();
  const stayId = num(fd, "stay_id");
  const residentId = num(fd, "resident_id");
  await attempt(`/owner/residents/${residentId}`, () => {
    const s = get<{ property_id: number }>("SELECT property_id FROM stays WHERE id = ?", stayId);
    assertProperty(u, s?.property_id);
    tx(() => activateReserved(u.owner_id, u.id, stayId));
  }, "Checked in. First month's rent is prorated.");
}

export async function updateResidentAction(fd: FormData) {
  const u = await requireStaff();
  const residentId = num(fd, "resident_id");
  await attempt(`/owner/residents/${residentId}`, () => {
    assertResident(u, residentId);
    run("UPDATE users SET name = ?, email = ? WHERE id = ?", str(fd, "name"), optStr(fd, "email"), residentId);
    run(
      `INSERT INTO resident_profiles (user_id, emergency_name, emergency_phone, occupation, college_company, permanent_address) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET emergency_name = excluded.emergency_name, emergency_phone = excluded.emergency_phone,
       occupation = excluded.occupation, college_company = excluded.college_company, permanent_address = excluded.permanent_address`,
      residentId,
      optStr(fd, "emergency_name"),
      normalizePhone(str(fd, "emergency_phone")) || null,
      optStr(fd, "occupation"),
      optStr(fd, "college_company"),
      optStr(fd, "permanent_address"),
    );
  }, "Profile saved");
}

export async function uploadDocumentAction(fd: FormData) {
  const u = await requireStaff();
  const residentId = num(fd, "resident_id");
  await attempt(`/owner/residents/${residentId}`, async () => {
    assertResident(u, residentId);
    const fileId = await saveUpload(fd.get("file"), u.owner_id, u.id, residentId);
    need(fileId, "Choose a file");
    run("INSERT INTO documents (owner_id, resident_id, type, file_id, verified) VALUES (?, ?, ?, ?, 1)", u.owner_id, residentId, str(fd, "type"), fileId);
    logActivity(u.owner_id, u.id, "upload_document", "resident", residentId, str(fd, "type"));
  }, "Document uploaded");
}

export async function verifyDocumentAction(fd: FormData) {
  const u = await requireStaff();
  const residentId = num(fd, "resident_id");
  await attempt(`/owner/residents/${residentId}`, () => {
    assertResident(u, residentId);
    run("UPDATE documents SET verified = 1 WHERE id = ? AND resident_id = ?", num(fd, "doc_id"), residentId);
    logActivity(u.owner_id, u.id, "verify_document", "resident", residentId);
  }, "Document verified");
}

export async function noticeAction(fd: FormData) {
  const u = await requireStaff();
  const residentId = num(fd, "resident_id");
  await attempt(`/owner/residents/${residentId}`, () => {
    assertResident(u, residentId);
    tx(() => giveNotice(num(fd, "stay_id"), u.id, str(fd, "notice_date") || today()));
  }, "Notice recorded. The bed is now bookable.");
}

export async function settleAction(fd: FormData) {
  const u = await requireStaff();
  const residentId = num(fd, "resident_id");
  const stayId = num(fd, "stay_id");
  await attempt(`/owner/residents/${residentId}`, () => {
    assertResident(u, residentId);
    tx(() => settle(u.owner_id, u.id, stayId, num(fd, "deductions"), str(fd, "note")));
    return `/owner/settlement/${stayId}`;
  }, "Move-out settled");
}

export async function refundPaidAction(fd: FormData) {
  const u = await requireOwner();
  const stayId = num(fd, "stay_id");
  await attempt(`/owner/settlement/${stayId}`, () => {
    const s = get<{ property_id: number; resident_id: number; refund_amount: number }>("SELECT * FROM stays WHERE id = ? AND status = 'closed'", stayId);
    need(s, "Settlement not found");
    assertProperty(u, s.property_id);
    run("UPDATE stays SET refund_paid_at = ? WHERE id = ?", new Date().toISOString(), stayId);
    logActivity(u.id, u.id, "refund_paid", "stay", stayId, inr(s.refund_amount));
    notify(s.resident_id, "Deposit refund processed", `${inr(Math.max(s.refund_amount, 0))} has been refunded.`);
  }, "Refund marked as paid");
}

export async function shiftAction(fd: FormData) {
  const u = await requireStaff();
  const residentId = num(fd, "resident_id");
  await attempt(`/owner/residents/${residentId}`, () => {
    assertResident(u, residentId);
    const bedId = num(fd, "bed_id");
    const bed = get<{ property_id: number; monthly_rent: number }>("SELECT property_id, monthly_rent FROM beds WHERE id = ?", bedId);
    need(bed, "Pick a bed");
    assertProperty(u, bed.property_id);
    tx(() => shiftRoom(u.owner_id, u.id, num(fd, "stay_id"), bedId, num(fd, "rent", bed.monthly_rent)));
  }, "Room shifted. History is kept.");
}

function assertResident(u: { owner_id: number; propertyIds: number[] }, residentId: number) {
  const s = get(
    `SELECT 1 FROM stays WHERE resident_id = ? AND owner_id = ? AND property_id IN (${inList(u.propertyIds)})`,
    residentId,
    u.owner_id,
    ...u.propertyIds,
  );
  if (!s) throw new Error("Not allowed");
}

/* ---------- rent ---------- */

export async function generateInvoicesAction(fd: FormData) {
  const u = await requireStaff();
  const month = str(fd, "month") || thisMonth();
  const n = generateInvoices(u.owner_id, u.id, month, u.propertyIds);
  revalidatePath("/owner", "layout");
  redirect(`/owner/rent?month=${month}&ok=` + encodeURIComponent(n ? `${n} invoices created for ${fmtMonth(month)}` : "All invoices for this month already exist"));
}

export async function recordPaymentAction(fd: FormData) {
  const u = await requireStaff();
  const invoiceId = num(fd, "invoice_id");
  const back = str(fd, "back") || "/owner/rent";
  await attempt(back, async () => {
    const inv = get<{ property_id: number; owner_id: number; stay_id: number; total: number; paid: number }>("SELECT * FROM invoices WHERE id = ?", invoiceId);
    need(inv && inv.owner_id === u.owner_id, "Invoice not found");
    assertProperty(u, inv.property_id);
    const amount = num(fd, "amount");
    need(amount > 0, "Enter the amount received");
    const resident = get<{ resident_id: number }>("SELECT resident_id FROM stays WHERE id = ?", inv.stay_id)!;
    const proof = await saveUpload(fd.get("proof"), u.owner_id, u.id, resident.resident_id);
    recordPayment({ invoiceId, amount, mode: str(fd, "mode") || "cash", reference: optStr(fd, "reference"), note: optStr(fd, "note"), proofFileId: proof, recordedBy: u.id });
  }, "Payment recorded & receipt sent");
}

export async function confirmProofAction(fd: FormData) {
  const u = await requireStaff();
  const paymentId = num(fd, "payment_id");
  const approve = str(fd, "decision") === "approve";
  await attempt("/owner/rent", () => {
    const p = get<{ invoice_id: number; owner_id: number; amount: number; status: string }>("SELECT * FROM payments WHERE id = ?", paymentId);
    need(p && p.owner_id === u.owner_id && p.status === "pending", "Payment not found");
    const inv = get<{ property_id: number; stay_id: number; month: string }>("SELECT property_id, stay_id, month FROM invoices WHERE id = ?", p.invoice_id)!;
    assertProperty(u, inv.property_id);
    const resident = get<{ resident_id: number }>("SELECT resident_id FROM stays WHERE id = ?", inv.stay_id)!;
    tx(() => {
      if (approve) {
        const rc = receiptNo(u.owner_id);
        run("UPDATE payments SET status = 'confirmed', recorded_by = ?, receipt_no = ? WHERE id = ?", u.id, rc, paymentId);
        notify(resident.resident_id, "Payment confirmed", `${inr(p.amount)} for ${fmtMonth(inv.month)}. Receipt ${rc}.`);
      } else {
        run("UPDATE payments SET status = 'rejected', recorded_by = ? WHERE id = ?", u.id, paymentId);
        notify(resident.resident_id, "Payment not confirmed", `Your ${inr(p.amount)} payment proof could not be matched. Please contact the manager.`);
      }
      recalcInvoice(p.invoice_id);
      logActivity(u.owner_id, u.id, approve ? "confirm_payment" : "reject_payment", "payment", paymentId, inr(p.amount));
    });
  }, approve ? "Payment confirmed" : "Payment rejected");
}

/** Splits a room's electricity bill equally among everyone billed in that room for the month. */
export async function electricityAction(fd: FormData) {
  const u = await requireStaff();
  const month = str(fd, "month") || thisMonth();
  await attempt(`/owner/rent?month=${month}`, () => {
    const roomId = num(fd, "room_id");
    const amount = num(fd, "amount");
    need(amount > 0, "Enter the bill amount");
    const room = get<{ property_id: number; number: string }>("SELECT property_id, number FROM rooms WHERE id = ?", roomId);
    need(room, "Pick a room");
    assertProperty(u, room.property_id);
    const invs = all<{ id: number }>(
      "SELECT i.id FROM invoices i JOIN stays s ON s.id = i.stay_id JOIN beds b ON b.id = s.bed_id WHERE b.room_id = ? AND i.month = ?",
      roomId,
      month,
    );
    need(invs.length, "No invoices for this room in that month — generate invoices first");
    const share = Math.round(amount / invs.length);
    tx(() => {
      for (const i of invs) addInvoiceItem(i.id, "electricity", `Electricity – room ${room.number} (1/${invs.length})`, share);
      logActivity(u.owner_id, u.id, "add_electricity", "room", roomId, `${inr(amount)} split ${invs.length} ways`);
    });
  }, "Electricity added to invoices");
}

export async function addChargeAction(fd: FormData) {
  const u = await requireStaff();
  const invoiceId = num(fd, "invoice_id");
  const back = str(fd, "back") || "/owner/rent";
  await attempt(back, () => {
    const inv = get<{ property_id: number; owner_id: number }>("SELECT property_id, owner_id FROM invoices WHERE id = ?", invoiceId);
    need(inv && inv.owner_id === u.owner_id, "Invoice not found");
    assertProperty(u, inv.property_id);
    const amount = num(fd, "amount");
    need(amount !== 0, "Enter an amount");
    const kind = str(fd, "kind") || "other";
    addInvoiceItem(invoiceId, kind, str(fd, "label") || kind[0].toUpperCase() + kind.slice(1).replace("_", " "), amount);
    logActivity(u.owner_id, u.id, "add_charge", "invoice", invoiceId, `${kind} ${inr(amount)}`);
  }, "Charge added");
}

/** Adds the property's late fee to overdue invoices that don't have one yet. */
export async function applyLateFeesAction(fd: FormData) {
  const u = await requireStaff();
  const month = str(fd, "month") || thisMonth();
  await attempt(`/owner/rent?month=${month}`, () => {
    const rows = all<{ id: number; late_fee: number }>(
      `SELECT i.id, p.late_fee FROM invoices i JOIN properties p ON p.id = i.property_id
       WHERE i.owner_id = ? AND i.month = ? AND i.status != 'paid' AND i.due_date < ? AND p.late_fee > 0
       AND i.property_id IN (${inList(u.propertyIds)})
       AND NOT EXISTS (SELECT 1 FROM invoice_items ii WHERE ii.invoice_id = i.id AND ii.kind = 'late_fee')`,
      u.owner_id,
      month,
      today(),
      ...u.propertyIds,
    );
    tx(() => {
      for (const r of rows) addInvoiceItem(r.id, "late_fee", "Late fee", r.late_fee);
      if (rows.length) logActivity(u.owner_id, u.id, "apply_late_fees", "invoice", null, `${rows.length} invoices`);
    });
    need(rows.length, "No overdue invoices without a late fee");
  }, "Late fees applied");
}

/** Sends a reminder to every resident with an unpaid balance this month. */
export async function remindAllAction(fd: FormData) {
  const u = await requireStaff();
  const month = str(fd, "month") || thisMonth();
  const back = str(fd, "back") || `/owner/rent?month=${month}`;
  const only = num(fd, "invoice_id", 0);
  await attempt(back, () => {
    const rows = all<{ resident_id: number; due: number; due_date: string }>(
      `SELECT s.resident_id, i.total - i.paid due, i.due_date FROM invoices i JOIN stays s ON s.id = i.stay_id
       WHERE i.owner_id = ? AND i.month = ? AND i.status != 'paid' AND i.property_id IN (${inList(u.propertyIds)}) ${only ? "AND i.id = ?" : ""}`,
      u.owner_id,
      month,
      ...u.propertyIds,
      ...(only ? [only] : []),
    );
    need(rows.length, "Nobody to remind — everyone has paid");
    for (const r of rows) notify(r.resident_id, "Rent reminder", `${inr(r.due)} is due${r.due_date < today() ? " (overdue)" : ` by ${r.due_date}`}. Pay in the app to get an instant receipt.`);
    logActivity(u.owner_id, u.id, "send_reminders", "invoice", only || null, `${rows.length} residents`);
  }, only ? "Reminder sent" : "Reminders sent to everyone with dues");
}

/* ---------- complaints ---------- */

export async function updateComplaintAction(fd: FormData) {
  const u = await requireStaff();
  const id = num(fd, "id");
  await attempt(str(fd, "back") || "/owner/complaints", () => {
    const c = get<{ property_id: number; owner_id: number; resident_id: number; status: string }>("SELECT * FROM complaints WHERE id = ?", id);
    need(c && c.owner_id === u.owner_id, "Complaint not found");
    assertProperty(u, c.property_id);
    const status = str(fd, "status") || c.status;
    need(status in COMPLAINT_STATUS, "Bad status");
    let assigned = fd.has("assigned_to") ? num(fd, "assigned_to") || null : undefined;
    // Whoever starts work on an unassigned complaint owns it.
    if (status === "in_progress" && assigned === undefined && !get("SELECT assigned_to FROM complaints WHERE id = ? AND assigned_to IS NOT NULL", id)) assigned = u.id;
    run(
      `UPDATE complaints SET status = ?, updated_at = datetime('now'), resolved_at = CASE WHEN ? IN ('resolved','closed') THEN COALESCE(resolved_at, datetime('now')) ELSE NULL END
       ${assigned !== undefined ? ", assigned_to = ?" : ""}, priority = COALESCE(?, priority) WHERE id = ?`,
      status,
      status,
      ...(assigned !== undefined ? [assigned] : []),
      optStr(fd, "priority"),
      id,
    );
    if (status !== c.status) notify(c.resident_id, "Complaint update", `Your complaint #${id} is now ${COMPLAINT_STATUS[status].label.toLowerCase()}.`);
  }, "Complaint updated");
}

/* ---------- notices ---------- */

export async function postNoticeAction(fd: FormData) {
  const u = await requireStaff();
  await attempt("/owner/notices", () => {
    const title = str(fd, "title");
    need(title, "Add a title");
    const target = str(fd, "property_id");
    const propertyId = target === "all" ? null : Number(target);
    if (propertyId === null) need(u.role === "owner", "Managers can post to their property only");
    else assertProperty(u, propertyId);
    const n = run("INSERT INTO notices (owner_id, property_id, title, body, pinned, created_by) VALUES (?, ?, ?, ?, ?, ?)", u.owner_id, propertyId, title, str(fd, "body"), bool(fd, "pinned") ? 1 : 0, u.id);
    const ids = propertyId ? [propertyId] : u.propertyIds;
    const residents = all<{ resident_id: number }>(`SELECT DISTINCT resident_id FROM stays WHERE status IN ('active','notice') AND property_id IN (${inList(ids)})`, ...ids);
    for (const r of residents) notify(r.resident_id, "New notice", title);
    logActivity(u.owner_id, u.id, "post_notice", "notice", n.id, title);
  }, "Notice posted and residents notified");
}

export async function deleteNoticeAction(fd: FormData) {
  const u = await requireStaff();
  await attempt("/owner/notices", () => {
    const n = get<{ property_id: number | null; owner_id: number }>("SELECT * FROM notices WHERE id = ?", num(fd, "id"));
    need(n && n.owner_id === u.owner_id, "Notice not found");
    if (n.property_id === null) need(u.role === "owner", "Not allowed");
    else assertProperty(u, n.property_id);
    run("DELETE FROM notices WHERE id = ?", num(fd, "id"));
  }, "Notice removed");
}

export async function togglePinAction(fd: FormData) {
  const u = await requireStaff();
  await attempt("/owner/notices", () => {
    const n = get<{ property_id: number | null; owner_id: number }>("SELECT * FROM notices WHERE id = ?", num(fd, "id"));
    need(n && n.owner_id === u.owner_id, "Notice not found");
    if (n.property_id !== null) assertProperty(u, n.property_id);
    run("UPDATE notices SET pinned = 1 - pinned WHERE id = ?", num(fd, "id"));
  });
}

/* ---------- team ---------- */

export async function addManagerAction(fd: FormData) {
  const u = await requireOwner();
  await attempt("/owner/more", () => {
    const phone = normalizePhone(str(fd, "phone"));
    need(/^[6-9]\d{9}$/.test(phone), "Enter a valid mobile number");
    need(!get("SELECT 1 FROM users WHERE phone = ?", phone), "This number is already registered");
    const ids = fd.getAll("property_ids").map(Number).filter((id) => u.propertyIds.includes(id));
    need(ids.length, "Pick at least one property");
    tx(() => {
      const m = run("INSERT INTO users (owner_id, name, phone, role) VALUES (?, ?, ?, 'manager')", u.id, str(fd, "name"), phone);
      for (const id of ids) run("INSERT INTO manager_properties (user_id, property_id) VALUES (?, ?)", m.id, id);
      logActivity(u.id, u.id, "add_manager", "user", m.id, str(fd, "name"));
    });
  }, "Manager added. They can log in with their phone number.");
}

export async function removeManagerAction(fd: FormData) {
  const u = await requireOwner();
  await attempt("/owner/more", () => {
    const id = num(fd, "id");
    need(get("SELECT 1 FROM users WHERE id = ? AND owner_id = ? AND role = 'manager'", id, u.id), "Not found");
    tx(() => {
      run("DELETE FROM manager_properties WHERE user_id = ?", id);
      run("DELETE FROM sessions WHERE user_id = ?", id);
      run("UPDATE users SET status = 'disabled', phone = phone || '-removed-' || id WHERE id = ?", id);
      logActivity(u.id, u.id, "remove_manager", "user", id);
    });
  }, "Manager removed");
}
