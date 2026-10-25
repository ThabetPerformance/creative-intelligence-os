import Link from "next/link";
import { loadPage, NoData, creativeHref, byKey, type PageProps } from "@/components/page-kit";
import { Card, Kpi, PageHeader, Pill, StatusTag, fmtNum, fmtPct } from "@/components/ui";

export default async function PlannerPage(props: PageProps) {
  const { accountId, sp, r } = await loadPage(props);
  if (!r) return <NoData accountId={accountId} />;
  const map = byKey(r);
  const { items, capacity, replacement } = r.plan;
  return (
    <div className="space-y-4">
      <PageHeader title="What To Make Next" question="What should the creative team produce this week, and why?" />
      <div className="grid gap-3 md:grid-cols-5">
        <Kpi label="Active winners needed" value={capacity.activeWinnersNeeded} sub={capacity.label} />
        <Kpi label="Median winner lifespan" value={`${fmtNum(capacity.medianWinnerLifespanDays)} d`} />
        <Kpi label="Hit rate" value={fmtPct(capacity.hitRate, 0)} tone="purple" />
        <Kpi label="Launches per week needed" value={fmtNum(capacity.launchesPerWeek, 1)} tone="yellow" sub={capacity.label} />
        <Kpi label="Pipeline" value={replacement.status.replaceAll("_", " ")} sub={replacement.text} />
      </div>
      <p className="text-sm text-ink-soft">
        <Pill tone="yellow">PLANNING ESTIMATE</Pill> {capacity.text}
      </p>
      <div className="grid gap-3 lg:grid-cols-2">
        {items.length === 0 && <p className="sub">No brief meets the evidence rules yet. Import more history or wait for more creatives to reach evidence.</p>}
        {items.map((it, i) => (
          <Card key={i} title={it.kind} question={it.title} right={<Pill tone={it.priority === "HIGH" ? "red" : it.priority === "MEDIUM" ? "yellow" : "gray"}>{it.priority}</Pill>}>
            <p className="text-sm">{it.why}</p>
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-ink-muted">
              {it.evidence.map((e, j) => (
                <li key={j}>{e}</li>
              ))}
            </ul>
            {it.creativeKeys.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1 text-xs">
                {it.creativeKeys.slice(0, 6).map((k) => (
                  <Link key={k} href={creativeHref(accountId, k, sp)} className="rounded border border-line px-1.5 py-0.5 hover:bg-canvas">
                    {map.get(k)?.meta.creativeName ?? k}
                  </Link>
                ))}
              </div>
            )}
            {it.learnings.length > 0 && (
              <div className="mt-2 space-y-1 border-t border-line-soft pt-2 text-xs">
                <div className="label">Relevant learnings</div>
                {it.learnings.map((l) => (
                  <div key={l.id} className="flex gap-1.5">
                    <StatusTag s={l.evidenceStatus} /> {l.learning}
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
