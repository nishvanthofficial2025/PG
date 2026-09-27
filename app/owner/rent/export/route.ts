import { currentUser, accessiblePropertyIds, inList } from "@/lib/auth";
import { all } from "@/lib/db";
import { thisMonth } from "@/lib/format";

/** Monthly rent collection as CSV — opens in Excel for the owner's accountant. */
export async function GET(req: Request) {
  const u = await currentUser();
  if (!u || (u.role !== "owner" && u.role !== "manager")) return new Response("Unauthorized", { status: 401 });
  const ids = accessiblePropertyIds(u);
  const m = new URL(req.url).searchParams.get("month") ?? "";
  const month = /^\d{4}-\d{2}$/.test(m) ? m : thisMonth();
  const rows = all<Record<string, string | number>>(
    `SELECT p.name property, b.label bed, u.name resident, u.phone, i.month, i.due_date, i.total, i.paid, i.total - i.paid balance, i.status,
       (SELECT GROUP_CONCAT(pay.receipt_no || ' ' || pay.mode || ' ' || pay.amount, '; ') FROM payments pay WHERE pay.invoice_id = i.id AND pay.status = 'confirmed') payments
     FROM invoices i JOIN stays s ON s.id = i.stay_id JOIN users u ON u.id = s.resident_id JOIN beds b ON b.id = s.bed_id JOIN properties p ON p.id = i.property_id
     WHERE i.month = ? AND i.property_id IN (${inList(ids)}) ORDER BY p.name, b.label`,
    month,
    ...ids,
  );
  const cols = ["property", "bed", "resident", "phone", "month", "due_date", "total", "paid", "balance", "status", "payments"];
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\r\n");
  return new Response("﻿" + csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="rent-${month}.csv"` },
  });
}
