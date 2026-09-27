import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { all } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { propertyList } from "@/lib/scope";
import { PageHeader, Flash, Section } from "@/components/ui";
import { Submit } from "@/components/client";
import { logout } from "@/app/login/actions";
import { addManagerAction, removeManagerAction } from "../actions";

export default async function More({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const u = await requireStaff();
  const isOwner = u.role === "owner";
  const managers = isOwner
    ? await all<{ id: number; name: string; phone: string; props: string | null }>(
        `SELECT u.id, u.name, u.phone, (SELECT STRING_AGG(p.name, ', ') FROM manager_properties mp JOIN properties p ON p.id = mp.property_id WHERE mp.user_id = u.id) props
         FROM users u WHERE u.owner_id = ? AND u.role = 'manager' AND u.status != 'disabled' ORDER BY u.name`,
        u.id,
      )
    : [];
  const activity = await all<{ action: string; detail: string | null; created_at: string; who: string }>(
    `SELECT a.action, a.detail, a.created_at, u.name who FROM activity_log a JOIN users u ON u.id = a.user_id
     WHERE a.owner_id = ? ${isOwner ? "" : "AND a.user_id = ?"} ORDER BY a.id DESC LIMIT 25`,
    u.owner_id,
    ...(isOwner ? [] : [u.id]),
  );

  const links = [
    { href: "/owner/notices", label: "Notices", desc: "Post updates to residents" },
    { href: "/owner/properties", label: "Properties", desc: "Rooms, beds, rules and settings" },
    { href: "/owner/residents?f=past", label: "Past residents", desc: "Settlements and old receipts" },
  ];

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="More" subtitle={`${u.name} · +91 ${u.phone}`} />
      <Flash sp={sp} />
      <div className="card mb-6 divide-y divide-stone-100 p-0">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="flex items-center justify-between px-4 py-3.5">
            <div>
              <div className="font-semibold">{l.label}</div>
              <div className="text-xs text-stone-500">{l.desc}</div>
            </div>
            <span className="text-stone-400">›</span>
          </Link>
        ))}
      </div>

      {isOwner && (
        <Section title="Managers">
          <div className="card space-y-3">
            {managers.length === 0 && <p className="text-sm text-stone-500">No managers yet.</p>}
            {managers.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold">{m.name}</div>
                  <div className="text-xs text-stone-500">
                    +91 {m.phone} · {m.props ?? "no properties"}
                  </div>
                </div>
                <form action={removeManagerAction}>
                  <input type="hidden" name="id" value={m.id} />
                  <Submit className="btn-secondary btn-sm" confirm={`Remove ${m.name}? They will be logged out.`}>
                    Remove
                  </Submit>
                </form>
              </div>
            ))}
            <details className="border-t border-stone-100 pt-3">
              <summary className="cursor-pointer font-semibold text-brand-700">+ Add manager</summary>
              <form action={addManagerAction} className="mt-3 space-y-3">
                <input name="name" className="input" placeholder="Name" required />
                <input name="phone" className="input" placeholder="Mobile number" inputMode="numeric" required />
                <div className="space-y-1">
                  {(await propertyList(u.propertyIds)).map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="property_ids" value={p.id} className="h-5 w-5" /> {p.name}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-stone-500">Managers can add residents, record payments and handle complaints for their properties. They can’t change rent or see other properties.</p>
                <Submit>Add manager</Submit>
              </form>
            </details>
          </div>
        </Section>
      )}

      <Section title={isOwner ? "Activity log" : "My recent activity"}>
        <ul className="card divide-y divide-stone-100 p-0 text-sm">
          {activity.map((a, i) => (
            <li key={i} className="px-4 py-2">
              <div>
                <b>{a.who}</b> · {a.action.replace(/_/g, " ")} {a.detail && <span className="text-stone-500">— {a.detail}</span>}
              </div>
              <div className="text-xs text-stone-400">{fmtDate(a.created_at)}</div>
            </li>
          ))}
        </ul>
      </Section>

      <form action={logout}>
        <button className="btn-secondary w-full">Log out</button>
      </form>
    </div>
  );
}
