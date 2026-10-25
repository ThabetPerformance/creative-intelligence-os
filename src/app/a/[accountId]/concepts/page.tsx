import Link from "next/link";
import { loadPage, NoData, byKey, type PageProps } from "@/components/page-kit";
import { Card, PageHeader } from "@/components/ui";
import { GroupTable } from "@/components/GroupTable";
import { DIMENSIONS, groupBy, type Dimension } from "@/engine/groups";
import { withPeriod } from "@/lib/period";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const FILTERABLE: Partial<Record<Dimension, string>> = { concept: "concept", creator: "creator", format: "format", platform: "platform" };

export default async function ConceptsPage(props: PageProps) {
  const { accountId, sp, a, r } = await loadPage(props);
  if (!r) return <NoData accountId={accountId} />;
  const dim = (one(sp.dim) in DIMENSIONS ? one(sp.dim) : "concept") as Dimension;
  const rows = groupBy(r.creatives, dim, r.ctx.definitions, r.portfolio.hitRate.current, r.portfolio.totals.roas);
  return (
    <div className="space-y-4">
      <PageHeader title="Concepts & Angles" question="Which concepts, angles, formats, offers and tactics are associated with winners?" />
      <div className="flex flex-wrap gap-1">
        {(Object.keys(DIMENSIONS) as Dimension[]).map((d) => (
          <Link key={d} href={withPeriod(`?dim=${d}`, sp)} className={`rounded-lg border px-2.5 py-1 text-sm ${d === dim ? "border-ink bg-ink text-white" : "border-line bg-white hover:bg-canvas"}`}>
            {DIMENSIONS[d]}
          </Link>
        ))}
      </div>
      <Card question={`Performance by ${DIMENSIONS[dim]}`} title="Tag creatives in 03_CREATIVE_LIBRARY or 06_OPTIONAL_TAGS to populate dimensions. Untagged creatives are grouped separately.">
        <GroupTable rows={rows} cur={a.account.currency} accountId={accountId} sp={sp} byKey={byKey(r)} filterParam={FILTERABLE[dim]} />
      </Card>
    </div>
  );
}
