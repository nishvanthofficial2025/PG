"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { setScope } from "./actions";

const TABS = [
  { href: "/owner", label: "Home", icon: "M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" },
  { href: "/owner/beds", label: "Beds", icon: "M3 18v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6M3 18h18M3 18v2m18-2v2M6 10V7a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" },
  { href: "/owner/rent", label: "Rent", icon: "M7 5h10M7 9h10M9 5c4 0 5 2 5 4s-2 4-5 4H7l7 7" },
  { href: "/owner/residents", label: "Residents", icon: "M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6m13 9v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8" },
  { href: "/owner/complaints", label: "Issues", icon: "M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0" },
  { href: "/owner/more", label: "More", icon: "M4 6h16M4 12h16M4 18h16" },
];

function active(path: string, href: string) {
  return href === "/owner" ? path === "/owner" : path.startsWith(href);
}

export function BottomNav({ openComplaints }: { openComplaints: number }) {
  const path = usePathname();
  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-6">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} className={`relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${active(path, t.href) ? "text-brand-700" : "text-stone-500"}`}>
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d={t.icon} />
            </svg>
            {t.label}
            {t.href === "/owner/complaints" && openComplaints > 0 && <span className="absolute right-3 top-1 rounded-full bg-rose-600 px-1.5 text-[10px] text-white">{openComplaints}</span>}
          </Link>
        ))}
      </div>
    </nav>
  );
}

export function SideNav({ openComplaints }: { openComplaints: number }) {
  const path = usePathname();
  return (
    <nav className="no-print hidden gap-1 md:flex">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={`rounded-lg px-3 py-2 text-sm font-semibold ${active(path, t.href) ? "bg-brand-50 text-brand-700" : "text-stone-600 hover:bg-stone-100"}`}>
          {t.label}
          {t.href === "/owner/complaints" && openComplaints > 0 && <span className="ml-1 rounded-full bg-rose-600 px-1.5 text-[10px] text-white">{openComplaints}</span>}
        </Link>
      ))}
    </nav>
  );
}

export function ScopeSwitcher({ value, options }: { value: string; options: { id: number; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (options.length < 2) return <div className="truncate text-sm font-semibold text-stone-700">{options[0]?.name ?? "No properties yet"}</div>;
  return (
    <select
      aria-label="Property"
      className={`max-w-[60vw] truncate rounded-lg border border-stone-300 bg-white py-1.5 pl-2 pr-7 text-sm font-semibold ${pending ? "opacity-60" : ""}`}
      value={value}
      onChange={(e) =>
        start(async () => {
          await setScope(e.target.value);
          router.refresh();
        })
      }
    >
      <option value="all">All properties</option>
      {options.map((o) => (
        <option key={o.id} value={String(o.id)}>
          {o.name}
        </option>
      ))}
    </select>
  );
}
