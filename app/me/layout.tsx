import { requireResident } from "@/lib/auth";
import { ResidentNav } from "./nav";

export default async function ResidentLayout({ children }: { children: React.ReactNode }) {
  await requireResident();
  return (
    <div className="pb-24">
      <main className="mx-auto max-w-md px-4 py-5">{children}</main>
      <ResidentNav />
    </div>
  );
}
