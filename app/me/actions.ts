"use server";

import crypto from "node:crypto";
import { all, get, run, tx, logActivity } from "@/lib/db";
import { requireResident } from "@/lib/auth";
import { attempt, str, optStr, num, need } from "@/lib/action";
import { recordPayment } from "@/lib/billing";
import { giveNotice } from "@/lib/residents";
import { saveUpload } from "@/lib/files";
import { notify } from "@/lib/notify";
import { myStay } from "@/lib/resident";
import { normalizePhone, COMPLAINT_CATEGORIES, inr } from "@/lib/format";

async function writable() {
  const u = await requireResident();
  if (u.status === "read_only") throw new Error("Your stay has ended — your account is read-only.");
  return u;
}

async function myInvoice(userId: number, invoiceId: number) {
  const inv = await get<{ id: number; owner_id: number; property_id: number; total: number; paid: number; status: string; month: string }>(
    "SELECT i.* FROM invoices i JOIN stays s ON s.id = i.stay_id WHERE i.id = ? AND s.resident_id = ?",
    invoiceId,
    userId,
  );
  if (!inv) throw new Error("Invoice not found");
  return inv;
}

/**
 * Online payment. v1 simulates the gateway (test mode). With Razorpay/Cashfree this
 * becomes: create order → open checkout / UPI intent → webhook verifies signature →
 * await recordPayment(mode 'gateway', reference = gateway payment id).
 */
export async function payOnlineAction(fd: FormData) {
  const invoiceId = num(fd, "invoice_id");
  await attempt(`/me/pay/${invoiceId}`, async () => {
    const u = await writable();
    const inv = await myInvoice(u.id, invoiceId);
    const due = inv.total - inv.paid;
    need(due > 0, "This invoice is already paid");
    const amount = Math.min(num(fd, "amount", due), due);
    need(amount > 0, "Enter an amount");
    const ref = "pay_TEST" + crypto.randomBytes(6).toString("hex").toUpperCase();
    const pid = await recordPayment({ invoiceId, amount, mode: "gateway", reference: ref, note: `via ${str(fd, "method") || "UPI"}`, recordedBy: u.id });
    return `/me/paid/${pid}`;
  });
}

/** Resident paid outside the app → upload proof → owner confirms with one tap. */
export async function uploadProofAction(fd: FormData) {
  await attempt("/me/payments", async () => {
    const u = await writable();
    const inv = await myInvoice(u.id, num(fd, "invoice_id"));
    const amount = num(fd, "amount");
    need(amount > 0, "Enter the amount you paid");
    const fileId = await saveUpload(fd.get("proof"), inv.owner_id, u.id, u.id);
    need(fileId || str(fd, "reference"), "Add the UPI reference number or a screenshot");
    await run(
      "INSERT INTO payments (owner_id, invoice_id, amount, mode, reference, proof_file_id, status, recorded_by, paid_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)",
      inv.owner_id,
      inv.id,
      amount,
      str(fd, "mode") || "upi",
      optStr(fd, "reference"),
      fileId,
      u.id,
      new Date().toISOString(),
    );
    const staff = await all<{ id: number }>(
      "SELECT id FROM users WHERE id = ? UNION SELECT user_id FROM manager_properties WHERE property_id = ?",
      inv.owner_id,
      inv.property_id,
    );
    for (const s of staff) await notify(s.id, "Payment proof to confirm", `${u.name} says they paid ${inr(amount)}`);
  }, "Sent to the owner for confirmation. You’ll get a receipt once confirmed.");
}

export async function raiseComplaintAction(fd: FormData) {
  await attempt("/me/complaints", async () => {
    const u = await writable();
    const stay = await myStay(u.id);
    need(stay && (stay.status === "active" || stay.status === "notice"), "You need an active stay to raise a complaint");
    const category = str(fd, "category");
    need((COMPLAINT_CATEGORIES as readonly string[]).includes(category), "Pick a category");
    const description = str(fd, "description");
    need(description.length >= 3, "Describe the problem");
    const photo = await saveUpload(fd.get("photo"), stay.owner_id, u.id, u.id);
    const c = await run(
      "INSERT INTO complaints (owner_id, property_id, resident_id, room_id, category, description, photo_file_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
      stay.owner_id,
      stay.property_id,
      u.id,
      stay.room_id,
      category,
      description.slice(0, 2000),
      photo,
    );
    const staff = await all<{ id: number }>("SELECT id FROM users WHERE id = ? UNION SELECT user_id FROM manager_properties WHERE property_id = ?", stay.owner_id, stay.property_id);
    for (const s of staff) await notify(s.id, "New complaint", `${category} · Room ${stay.room}: ${description.slice(0, 80)}`);
    await logActivity(stay.owner_id, u.id, "raise_complaint", "complaint", c.id);
  }, "Complaint raised. The manager has been notified.");
}

export async function complaintFeedbackAction(fd: FormData) {
  await attempt("/me/complaints", async () => {
    const u = await writable();
    const id = num(fd, "id");
    const c = await get<{ status: string; owner_id: number; property_id: number }>("SELECT status, owner_id, property_id FROM complaints WHERE id = ? AND resident_id = ?", id, u.id);
    need(c, "Complaint not found");
    const decision = str(fd, "decision");
    if (decision === "reopen") {
      need(c.status === "resolved" || c.status === "closed", "Only resolved complaints can be reopened");
      await run("UPDATE complaints SET status = 'open', resolved_at = NULL, updated_at = datetime('now') WHERE id = ?", id);
      await notify(c.owner_id, "Complaint reopened", `#${id} was reopened by ${u.name}`);
    } else {
      const rating = Math.min(Math.max(num(fd, "rating", 5), 1), 5);
      await run("UPDATE complaints SET status = 'closed', rating = ?, updated_at = datetime('now') WHERE id = ?", rating, id);
    }
  }, "Thanks for the feedback");
}

export async function updateProfileAction(fd: FormData) {
  const back = str(fd, "back") || "/me/profile";
  await attempt(back, async () => {
    const u = await writable();
    await run("UPDATE users SET name = COALESCE(NULLIF(?, ''), name), email = ? WHERE id = ?", str(fd, "name"), optStr(fd, "email"), u.id);
    await run(
      `INSERT INTO resident_profiles (user_id, emergency_name, emergency_phone, occupation, college_company, permanent_address) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET emergency_name = excluded.emergency_name, emergency_phone = excluded.emergency_phone,
       occupation = excluded.occupation, college_company = excluded.college_company, permanent_address = excluded.permanent_address`,
      u.id,
      optStr(fd, "emergency_name"),
      normalizePhone(str(fd, "emergency_phone")) || null,
      optStr(fd, "occupation"),
      optStr(fd, "college_company"),
      optStr(fd, "permanent_address"),
    );
  }, "Saved");
}

export async function uploadMyDocumentAction(fd: FormData) {
  const back = str(fd, "back") || "/me/profile";
  await attempt(back, async () => {
    const u = await writable();
    const fileId = await saveUpload(fd.get("file"), u.owner_id, u.id, u.id);
    need(fileId, "Choose a file");
    await run("INSERT INTO documents (owner_id, resident_id, type, file_id) VALUES (?, ?, ?, ?)", u.owner_id, u.id, str(fd, "type"), fileId);
  }, "Document uploaded. The owner will verify it.");
}

/** Onboarding: profile + rules/agreement acceptance → account becomes active. */
export async function completeWelcomeAction(fd: FormData) {
  await attempt("/me/welcome", async () => {
    const u = await requireResident();
    need(fd.get("accept"), "Please accept the house rules to continue");
    need(str(fd, "emergency_phone"), "Add an emergency contact");
    await tx(async () => {
      await run(
        `INSERT INTO resident_profiles (user_id, emergency_name, emergency_phone, permanent_address, rules_accepted_at) VALUES (?, ?, ?, ?, datetime('now'))
         ON CONFLICT(user_id) DO UPDATE SET emergency_name = excluded.emergency_name, emergency_phone = excluded.emergency_phone,
         permanent_address = excluded.permanent_address, rules_accepted_at = excluded.rules_accepted_at`,
        u.id,
        optStr(fd, "emergency_name"),
        normalizePhone(str(fd, "emergency_phone")),
        optStr(fd, "permanent_address"),
      );
      await run("UPDATE users SET status = 'active', email = COALESCE(?, email) WHERE id = ? AND status = 'invited'", optStr(fd, "email"), u.id);
    });
    const fileId = await saveUpload(fd.get("file"), u.owner_id, u.id, u.id);
    if (fileId) await run("INSERT INTO documents (owner_id, resident_id, type, file_id) VALUES (?, ?, ?, ?)", u.owner_id, u.id, str(fd, "type") || "aadhaar", fileId);
    return "/me";
  }, "You're all set! Welcome home.");
}

export async function giveNoticeAction() {
  await attempt("/me/profile", async () => {
    const u = await writable();
    const stay = await myStay(u.id);
    need(stay && stay.status === "active", "No active stay");
    const moveOut = await tx(async () => await giveNotice(stay.id, u.id));
    await notify(stay.owner_id, "Move-out notice", `${u.name} (bed ${stay.bed}) gave notice. Last day ${moveOut}.`);
  }, "Notice sent to the owner");
}
