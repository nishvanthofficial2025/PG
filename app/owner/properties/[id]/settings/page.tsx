import { notFound } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { get } from "@/lib/db";
import { PageHeader, Flash } from "@/components/ui";
import { Submit } from "@/components/client";
import { updatePropertyAction } from "../../../actions";

type P = {
  id: number; name: string; address: string | null; type: string; amenities: string | null; rules: string | null;
  wifi_name: string | null; wifi_password: string | null; contact_phone: string | null;
  billing_day: number; due_day: number; late_fee: number; notice_days: number; show_roommates: number;
};

export default async function PropertySettings({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const u = await requireOwner();
  if (!u.propertyIds.includes(Number(id))) notFound();
  const p = get<P>("SELECT * FROM properties WHERE id = ?", Number(id))!;
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Property settings" subtitle={p.name} back={`/owner/properties/${p.id}`} />
      <Flash sp={sp} />
      <form action={updatePropertyAction} className="card space-y-4">
        <input type="hidden" name="id" value={p.id} />
        <div>
          <label className="label">Name</label>
          <input name="name" className="input" defaultValue={p.name} required />
        </div>
        <div>
          <label className="label">Address</label>
          <input name="address" className="input" defaultValue={p.address ?? ""} />
        </div>
        <div>
          <label className="label">Type</label>
          <select name="type" className="input" defaultValue={p.type}>
            <option value="boys">Boys</option>
            <option value="girls">Girls</option>
            <option value="coed">Co-living</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Invoice on day</label>
            <input name="billing_day" type="number" min={1} max={28} className="input" defaultValue={p.billing_day} />
          </div>
          <div>
            <label className="label">Due on day</label>
            <input name="due_day" type="number" min={1} max={28} className="input" defaultValue={p.due_day} />
          </div>
          <div>
            <label className="label">Late fee (₹)</label>
            <input name="late_fee" type="number" min={0} className="input" defaultValue={p.late_fee} />
          </div>
          <div>
            <label className="label">Notice (days)</label>
            <input name="notice_days" type="number" min={0} className="input" defaultValue={p.notice_days} />
          </div>
          <div>
            <label className="label">Wi-Fi name</label>
            <input name="wifi_name" className="input" defaultValue={p.wifi_name ?? ""} />
          </div>
          <div>
            <label className="label">Wi-Fi password</label>
            <input name="wifi_password" className="input" defaultValue={p.wifi_password ?? ""} />
          </div>
        </div>
        <div>
          <label className="label">Contact number for residents</label>
          <input name="contact_phone" className="input" inputMode="numeric" defaultValue={p.contact_phone ?? ""} />
        </div>
        <div>
          <label className="label">Amenities</label>
          <input name="amenities" className="input" defaultValue={p.amenities ?? ""} />
        </div>
        <div>
          <label className="label">House rules</label>
          <textarea name="rules" rows={6} className="input" defaultValue={p.rules ?? ""} />
        </div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="show_roommates" className="h-5 w-5" defaultChecked={!!p.show_roommates} /> Show roommates’ first names to residents
        </label>
        <Submit>Save</Submit>
      </form>
    </div>
  );
}
