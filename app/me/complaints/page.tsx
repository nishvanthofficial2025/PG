import { requireResident } from "@/lib/auth";
import { all } from "@/lib/db";
import { ageLabel, fmtDate, COMPLAINT_CATEGORIES, COMPLAINT_STATUS } from "@/lib/format";
import { Flash, Section, Badge } from "@/components/ui";
import { Submit } from "@/components/client";
import { raiseComplaintAction, complaintFeedbackAction } from "../actions";

const LABELS: Record<string, string> = { electrical: "⚡ Electrical", plumbing: "🚿 Plumbing", wifi: "📶 Wi-Fi", cleaning: "🧹 Cleaning", food: "🍛 Food", other: "📝 Other" };

export default async function MyComplaints({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const u = await requireResident();
  const rows = all<{ id: number; category: string; description: string; status: string; created_at: string; resolved_at: string | null; rating: number | null; photo_file_id: string | null }>(
    "SELECT * FROM complaints WHERE resident_id = ? ORDER BY created_at DESC",
    u.id,
  );
  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Complaints</h1>
      <Flash sp={sp} />
      {u.status !== "read_only" && (
        <form action={raiseComplaintAction} className="card mb-6 space-y-3">
          <div className="label">What’s the problem?</div>
          <div className="grid grid-cols-3 gap-2">
            {COMPLAINT_CATEGORIES.map((c, i) => (
              <label key={c} className="flex cursor-pointer items-center justify-center rounded-xl border border-stone-300 px-1 py-3 text-center text-sm font-medium has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
                <input type="radio" name="category" value={c} defaultChecked={i === 0} className="sr-only" />
                {LABELS[c]}
              </label>
            ))}
          </div>
          <textarea name="description" rows={3} className="input" placeholder="e.g. Geyser not heating since morning" required />
          <div>
            <label className="label">Photo (optional)</label>
            <input name="photo" type="file" accept="image/*" capture="environment" className="block w-full text-sm" />
          </div>
          <Submit>Raise complaint</Submit>
        </form>
      )}
      <Section title="My complaints">
        {rows.length === 0 ? (
          <div className="card text-sm text-stone-500">No complaints yet.</div>
        ) : (
          <div className="space-y-2">
            {rows.map((c) => (
              <div key={c.id} className="card">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{LABELS[c.category]}</div>
                    <p className="text-sm text-stone-600">{c.description}</p>
                    <div className="mt-1 text-xs text-stone-400">
                      #{c.id} · {ageLabel(c.created_at)}
                      {c.resolved_at && ` · fixed ${fmtDate(c.resolved_at)}`}
                    </div>
                  </div>
                  <Badge cls={COMPLAINT_STATUS[c.status].cls}>{COMPLAINT_STATUS[c.status].label}</Badge>
                </div>
                {c.status === "resolved" && u.status !== "read_only" && (
                  <div className="mt-3 border-t border-stone-100 pt-3">
                    <div className="mb-2 text-sm font-medium">Is it fixed? Rate the fix:</div>
                    <form action={complaintFeedbackAction} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="decision" value="close" />
                      <select name="rating" className="input w-auto py-2" defaultValue="5">
                        {[5, 4, 3, 2, 1].map((r) => (
                          <option key={r} value={r}>
                            {"★".repeat(r)}
                          </option>
                        ))}
                      </select>
                      <Submit className="btn-primary btn-sm">Yes, close it</Submit>
                    </form>
                    <form action={complaintFeedbackAction} className="mt-2">
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="decision" value="reopen" />
                      <Submit className="btn-secondary btn-sm">No, reopen</Submit>
                    </form>
                  </div>
                )}
                {c.rating && <div className="mt-1 text-sm text-amber-600">{"★".repeat(c.rating)}</div>}
              </div>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
