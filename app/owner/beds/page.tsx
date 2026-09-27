import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { scopeIds } from "@/lib/scope";
import { BED_STATUS } from "@/lib/format";
import { BedGrid, BedLegend, bedCounts } from "@/components/bed-grid";
import { PageHeader, Empty } from "@/components/ui";

export default async function Beds({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const u = await requireStaff();
  const { ids } = await scopeIds(u);
  const valid = status && status in BED_STATUS ? status : undefined;
  const counts = await bedCounts(ids);
  return (
    <>
      <PageHeader
        title="Beds"
        subtitle="Tap a vacant bed to add a resident"
        action={
          u.role === "owner" && (
            <Link href="/owner/properties" className="btn-secondary btn-sm">
              Properties
            </Link>
          )
        }
      />
      {ids.length === 0 ? (
        <Empty title="No properties yet" />
      ) : (
        <>
          <BedLegend counts={counts} active={valid} base="/owner/beds" />
          <BedGrid propertyIds={ids} status={valid} />
        </>
      )}
    </>
  );
}
