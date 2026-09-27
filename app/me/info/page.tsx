import { requireResident } from "@/lib/auth";
import { all } from "@/lib/db";
import { myStay } from "@/lib/resident";
import { fmtDate, firstName } from "@/lib/format";
import { Section, Row } from "@/components/ui";
import { CopyButton } from "@/components/client";

export default async function Info() {
  const u = await requireResident();
  const stay = myStay(u.id);
  if (!stay) return <div className="card mt-10 text-center">No bed assigned yet.</div>;
  const roommates = stay.show_roommates
    ? all<{ name: string; bed: string }>(
        `SELECT u.name, b.label bed FROM stays s JOIN users u ON u.id = s.resident_id JOIN beds b ON b.id = s.bed_id
         WHERE b.room_id = ? AND s.status IN ('active','notice') AND s.resident_id != ?`,
        stay.room_id,
        u.id,
      )
    : [];
  const notices = all<{ id: number; title: string; body: string; pinned: number; created_at: string }>(
    "SELECT * FROM notices WHERE owner_id = ? AND (property_id IS NULL OR property_id = ?) ORDER BY pinned DESC, created_at DESC LIMIT 20",
    stay.owner_id,
    stay.property_id,
  );
  const contact = stay.contact_phone ?? stay.owner_phone;

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">{stay.property}</h1>
      <p className="mb-4 text-sm text-stone-500">{stay.address}</p>

      <div className="card mb-6">
        <Row label="Room / bed">
          Room {stay.room} · Bed {stay.bed}
        </Row>
        <Row label="Moved in">{fmtDate(stay.move_in)}</Row>
        {roommates.length > 0 && <Row label="Roommates">{roommates.map((r) => firstName(r.name)).join(", ")}</Row>}
        <Row label="Notice period">{stay.notice_days} days</Row>
      </div>

      {stay.wifi_name && (
        <Section title="Wi-Fi">
          <div className="card">
            <Row label="Network">{stay.wifi_name}</Row>
            <Row label="Password">
              <span className="font-mono">{stay.wifi_password}</span> {stay.wifi_password && <CopyButton text={stay.wifi_password} />}
            </Row>
          </div>
        </Section>
      )}

      <Section title="Contacts">
        <div className="grid grid-cols-2 gap-2">
          <a href={`tel:+91${contact}`} className="btn-secondary">
            📞 Manager
          </a>
          <a href={`https://wa.me/91${contact}`} target="_blank" rel="noreferrer" className="btn-secondary">
            💬 WhatsApp
          </a>
          <a href="tel:112" className="btn-secondary">
            🚨 Emergency 112
          </a>
          <a href="tel:108" className="btn-secondary">
            🚑 Ambulance 108
          </a>
        </div>
      </Section>

      {stay.rules && (
        <Section title="House rules">
          <div className="card whitespace-pre-line text-sm leading-relaxed">{stay.rules}</div>
        </Section>
      )}

      <Section title="Notices">
        <div id="notices" className="space-y-2">
          {notices.length === 0 && <div className="card text-sm text-stone-500">No notices.</div>}
          {notices.map((n) => (
            <div key={n.id} className={`card ${n.pinned ? "border-amber-300 bg-amber-50/60" : ""}`}>
              <div className="font-semibold">
                {n.pinned ? "📌 " : ""}
                {n.title}
              </div>
              {n.body && <p className="mt-0.5 whitespace-pre-line text-sm text-stone-600">{n.body}</p>}
              <div className="mt-1 text-xs text-stone-400">{fmtDate(n.created_at)}</div>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
