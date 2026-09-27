import Link from "next/link";
import { requireStaff, inList } from "@/lib/auth";
import { get } from "@/lib/db";
import { scopeIds, propertyList } from "@/lib/scope";
import { BottomNav, SideNav, ScopeSwitcher } from "./nav";

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const u = await requireStaff();
  const { selected } = await scopeIds(u);
  const open = get<{ n: number }>(`SELECT COUNT(*) n FROM complaints WHERE status IN ('open','in_progress') AND property_id IN (${inList(u.propertyIds)})`, ...u.propertyIds)!.n;
  return (
    <div className="pb-24 md:pb-10">
      <header className="no-print sticky top-0 z-10 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5">
          <Link href="/owner" className="flex items-center gap-2 font-bold">
            <img src="/icon.svg" alt="" className="h-7 w-7" />
            <span className="hidden sm:inline">StayEasy</span>
          </Link>
          <SideNav openComplaints={open} />
          <ScopeSwitcher value={selected} options={propertyList(u.propertyIds)} />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-5">{children}</main>
      <BottomNav openComplaints={open} />
    </div>
  );
}
