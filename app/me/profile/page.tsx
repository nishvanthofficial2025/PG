import { requireResident } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { myStay } from "@/lib/resident";
import { fmtDate, addDays, today } from "@/lib/format";
import { Flash, Section } from "@/components/ui";
import { Submit } from "@/components/client";
import { logout } from "@/app/login/actions";
import { updateProfileAction, uploadMyDocumentAction, giveNoticeAction } from "../actions";

const DOC_TYPES: Record<string, string> = { aadhaar: "Aadhaar", pan: "PAN", passport: "Passport", agreement: "Rental agreement", police: "Police verification" };

export default async function Profile({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const u = await requireResident();
  const stay = myStay(u.id);
  const p = get<{ emergency_name: string | null; emergency_phone: string | null; occupation: string | null; college_company: string | null; permanent_address: string | null; rules_accepted_at: string | null }>(
    "SELECT * FROM resident_profiles WHERE user_id = ?",
    u.id,
  );
  const docs = all<{ id: number; type: string; file_id: string; verified: number }>("SELECT * FROM documents WHERE resident_id = ? ORDER BY id DESC", u.id);
  const ro = u.status === "read_only";

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">{u.name}</h1>
      <p className="mb-4 text-sm text-stone-500">+91 {u.phone}</p>
      <Flash sp={sp} />

      <Section title="My details">
        <form action={updateProfileAction} className="card space-y-3">
          <fieldset disabled={ro} className="space-y-3">
            <div>
              <label className="label">Name</label>
              <input name="name" className="input" defaultValue={u.name} />
            </div>
            <div>
              <label className="label">Email</label>
              <input name="email" type="email" className="input" defaultValue={u.email ?? ""} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Emergency contact</label>
                <input name="emergency_name" className="input" defaultValue={p?.emergency_name ?? ""} placeholder="Name" />
              </div>
              <div>
                <label className="label">Their phone</label>
                <input name="emergency_phone" className="input" inputMode="numeric" defaultValue={p?.emergency_phone ?? ""} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Occupation</label>
                <input name="occupation" className="input" defaultValue={p?.occupation ?? ""} />
              </div>
              <div>
                <label className="label">College / company</label>
                <input name="college_company" className="input" defaultValue={p?.college_company ?? ""} />
              </div>
            </div>
            <div>
              <label className="label">Permanent address</label>
              <input name="permanent_address" className="input" defaultValue={p?.permanent_address ?? ""} />
            </div>
            {!ro && <Submit className="btn-secondary w-full">Save</Submit>}
          </fieldset>
        </form>
      </Section>

      <Section title="My documents">
        <div className="card space-y-3">
          {docs.map((d) => (
            <div key={d.id} className="flex items-center justify-between">
              <a href={`/api/files/${d.file_id}`} target="_blank" className="font-medium text-brand-700 underline">
                {DOC_TYPES[d.type] ?? d.type}
              </a>
              <span className={`chip ${d.verified ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{d.verified ? "Verified" : "Pending check"}</span>
            </div>
          ))}
          {docs.length === 0 && <p className="text-sm text-stone-500">Upload your ID proof (Aadhaar, PAN or passport).</p>}
          {!ro && (
            <form action={uploadMyDocumentAction} className="grid gap-2 border-t border-stone-100 pt-3">
              <select name="type" className="input py-2">
                {Object.entries(DOC_TYPES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <input name="file" type="file" accept="image/*,application/pdf" required className="text-sm" />
              <Submit className="btn-secondary">Upload</Submit>
            </form>
          )}
          <p className="text-xs text-stone-500">Stored privately — only you and your PG owner/manager can see these.</p>
          {p?.rules_accepted_at && <p className="text-xs text-stone-500">House rules accepted on {fmtDate(p.rules_accepted_at)}.</p>}
        </div>
      </Section>

      {stay && stay.status === "active" && (
        <Section title="Moving out?">
          <form action={giveNoticeAction} className="card space-y-2">
            <p className="text-sm text-stone-600">
              Your notice period is {stay.notice_days} days. If you give notice today, your last day will be <b>{fmtDate(addDays(today(), stay.notice_days))}</b>. Your deposit ({"₹" + stay.deposit.toLocaleString("en-IN")}) is refunded after
              dues and any damage deductions.
            </p>
            <Submit className="btn-secondary w-full" confirm="Send move-out notice to the owner? This can't be undone from the app.">
              Give move-out notice
            </Submit>
          </form>
        </Section>
      )}

      <form action={logout}>
        <button className="btn-secondary w-full">Log out</button>
      </form>
      <p className="mt-4 text-center text-xs text-stone-400">Want a copy of your data or to delete it? Ask your PG owner — we support export and deletion under the DPDP Act.</p>
    </>
  );
}
