// Pure helpers, safe on server and client.

export const TZ = "Asia/Kolkata";

export function inr(n: number | null | undefined): string {
  return "₹" + Math.round(n ?? 0).toLocaleString("en-IN");
}

/** Today as YYYY-MM-DD in IST. */
export function today(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}
export function thisMonth(): string {
  return today().slice(0, 7);
}
export function nowIso(): string {
  return new Date().toISOString();
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
export function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86_400_000);
}
export function dayOfMonth(month: string, day: number): string {
  const d = Math.min(day, daysInMonth(month));
  return `${month}-${String(d).padStart(2, "0")}`;
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d.length === 10 ? d + "T00:00:00Z" : d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: d.length === 10 ? "UTC" : TZ,
  });
}
export function fmtMonth(month: string): string {
  return new Date(month + "-01T00:00:00Z").toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
}
export function ageLabel(iso: string): string {
  const hrs = Math.max(0, Math.round((Date.now() - Date.parse(iso.replace(" ", "T") + (iso.includes("Z") ? "" : "Z"))) / 3_600_000));
  if (hrs < 1) return "just now";
  if (hrs < 48) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}
export function hoursSince(iso: string): number {
  return (Date.now() - Date.parse(iso.replace(" ", "T") + (iso.includes("Z") ? "" : "Z"))) / 3_600_000;
}

export function firstName(name: string): string {
  return name.split(" ")[0];
}

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export const BED_STATUS: Record<string, { label: string; cls: string }> = {
  vacant: { label: "Vacant", cls: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  occupied: { label: "Occupied", cls: "bg-sky-100 text-sky-900 border-sky-300" },
  reserved: { label: "Reserved", cls: "bg-amber-100 text-amber-900 border-amber-300" },
  notice: { label: "On notice", cls: "bg-violet-100 text-violet-900 border-violet-300" },
  maintenance: { label: "Maintenance", cls: "bg-stone-200 text-stone-700 border-stone-300" },
};

export const COMPLAINT_CATEGORIES = ["electrical", "plumbing", "wifi", "cleaning", "food", "other"] as const;
export const COMPLAINT_STATUS: Record<string, { label: string; cls: string }> = {
  open: { label: "Open", cls: "bg-rose-100 text-rose-800" },
  in_progress: { label: "In progress", cls: "bg-amber-100 text-amber-900" },
  resolved: { label: "Resolved", cls: "bg-emerald-100 text-emerald-800" },
  closed: { label: "Closed", cls: "bg-stone-200 text-stone-700" },
};
export const INVOICE_STATUS: Record<string, { label: string; cls: string }> = {
  unpaid: { label: "Unpaid", cls: "bg-rose-100 text-rose-800" },
  partial: { label: "Partly paid", cls: "bg-amber-100 text-amber-900" },
  paid: { label: "Paid", cls: "bg-emerald-100 text-emerald-800" },
};
export const PAY_MODES: Record<string, string> = {
  gateway: "Online (UPI/Card)",
  cash: "Cash",
  upi: "Direct UPI",
  bank: "Bank transfer",
};
