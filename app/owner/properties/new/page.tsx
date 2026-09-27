import { requireOwner } from "@/lib/auth";
import { PageHeader, Flash } from "@/components/ui";
import { Submit } from "@/components/client";
import { createPropertyAction } from "../../actions";

const DEFAULT_RULES = "Gate closes at 11 PM.\nNo smoking or alcohol inside.\nGuests allowed in common area only.\nRent due by the 5th of every month.";

export default async function NewProperty({ searchParams }: { searchParams: Promise<{ err?: string; first?: string }> }) {
  const sp = await searchParams;
  await requireOwner();
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title={sp.first ? "Set up your first PG" : "Add a property"} subtitle="Describe the building once — we create every room and bed for you." back={sp.first ? undefined : "/owner/properties"} />
      <Flash sp={sp} />
      <form action={createPropertyAction} className="space-y-5">
        <div className="card space-y-4">
          <h2 className="font-bold">1. About the PG</h2>
          <div>
            <label className="label">PG name</label>
            <input name="name" className="input" placeholder="e.g. Sunrise Men's PG" required />
          </div>
          <div>
            <label className="label">Address</label>
            <input name="address" className="input" placeholder="Street, area, city" />
          </div>
          <div>
            <label className="label">Who is it for?</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                ["boys", "Boys"],
                ["girls", "Girls"],
                ["coed", "Co-living"],
              ].map(([v, l], i) => (
                <label key={v} className="flex cursor-pointer items-center justify-center rounded-xl border border-stone-300 px-2 py-3 font-medium has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-700">
                  <input type="radio" name="type" value={v} defaultChecked={i === 0} className="sr-only" />
                  {l}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="card space-y-4">
          <h2 className="font-bold">2. Rooms &amp; beds</h2>
          <p className="-mt-2 text-sm text-stone-500">You can change individual rooms, sharing and rent later.</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Floors</label>
              <input name="floors" type="number" min={1} max={20} defaultValue={3} className="input" inputMode="numeric" required />
            </div>
            <div>
              <label className="label">Rooms per floor</label>
              <input name="rooms" type="number" min={1} max={40} defaultValue={5} className="input" inputMode="numeric" required />
            </div>
            <div>
              <label className="label">Beds per room</label>
              <select name="sharing" className="input" defaultValue="2">
                <option value="1">1 — Single</option>
                <option value="2">2 — Double</option>
                <option value="3">3 — Triple</option>
                <option value="4">4 sharing</option>
                <option value="5">5 sharing</option>
                <option value="6">6 sharing</option>
              </select>
            </div>
            <div>
              <label className="label">Rent per bed (₹/month)</label>
              <input name="rent" type="number" min={0} step={100} defaultValue={8000} className="input" inputMode="numeric" required />
            </div>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="ac" className="h-5 w-5" /> AC rooms
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="bath" className="h-5 w-5" defaultChecked /> Attached bathroom
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="ground" className="h-5 w-5" /> Start from ground floor
            </label>
          </div>
        </div>

        <div className="card space-y-4">
          <h2 className="font-bold">3. Rent rules</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Invoice on day</label>
              <input name="billing_day" type="number" min={1} max={28} defaultValue={1} className="input" inputMode="numeric" />
            </div>
            <div>
              <label className="label">Rent due on day</label>
              <input name="due_day" type="number" min={1} max={28} defaultValue={5} className="input" inputMode="numeric" />
            </div>
            <div>
              <label className="label">Late fee (₹)</label>
              <input name="late_fee" type="number" min={0} step={50} defaultValue={200} className="input" inputMode="numeric" />
            </div>
            <div>
              <label className="label">Notice period (days)</label>
              <input name="notice_days" type="number" min={0} defaultValue={30} className="input" inputMode="numeric" />
            </div>
          </div>
        </div>

        <details className="card">
          <summary className="cursor-pointer font-bold">4. House rules &amp; amenities (optional)</summary>
          <div className="mt-4 space-y-4">
            <div>
              <label className="label">Amenities</label>
              <input name="amenities" className="input" placeholder="Wi-Fi, Hot water, 3 meals, Washing machine" />
            </div>
            <div>
              <label className="label">House rules</label>
              <textarea name="rules" rows={5} className="input" defaultValue={DEFAULT_RULES} />
            </div>
            <div>
              <label className="label">Contact number shown to residents</label>
              <input name="contact_phone" className="input" inputMode="numeric" placeholder="Defaults to your number" />
            </div>
          </div>
        </details>

        <Submit pendingText="Creating rooms and beds…">Create property</Submit>
      </form>
    </div>
  );
}
