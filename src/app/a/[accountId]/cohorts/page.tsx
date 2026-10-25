import Link from "next/link";
import { loadPage, NoData, type PageProps } from "@/components/page-kit";
import { Card, Kpi, PageHeader, fmtMoney, fmtNum, fmtPct, fmtX } from "@/components/ui";
import { MiniBars } from "@/components/charts";
import { buildCohorts, testingEfficiency, type CohortType } from "@/engine/cohorts";
import { addDays } from "@/engine/dates";
import { withPeriod } from "@/lib/period";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function CohortsPage(props: PageProps) {
  const { accountId, sp, a, r } = await loadPage(props);
  if (!r) return <NoData accountId={accountId} />;
  const cur = a.account.currency;
  const type = (["week", "month", "batch"].includes(one(sp.type)) ? one(sp.type) : "month") as CohortType;
  const rows = buildCohorts(r.creatives, type);
  const w = r.ctx.window;
  const len = Math.round((Date.parse(w.to) - Date.parse(w.from)) / 86_400_000) + 1;
  const te = testingEfficiency(r.creatives, w.from, w.to);
  const prev = testingEfficiency(r.creatives, addDays(w.from, -len), addDays(w.from, -1));
  const chart = [...rows].reverse().map((x) => ({ cohort: x.key, rate: x.winnerRate ?? 0 }));

  return (
    <div className="space-y-4">
      <PageHeader title="Launch Cohorts" question="Are newer launches better or worse than older ones, and how efficient is our testing?">
        <div className="flex gap-1">
          {(["week", "month", "batch"] as const).map((t) => (
            <Link key={t} href={withPeriod(`?type=${t}`, sp)} className={t === type ? "btn-primary" : "btn"}>
              By {t}
            </Link>
          ))}
        </div>
      </PageHeader>

      <Card question="How efficient is creative testing?" title={`Creatives launched ${w.from} → ${w.to}, vs the previous equal period. Learning spend is the cost of reaching evidence — necessary, not waste.`}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          <Kpi label="Launched" value={te.tested} sub={`prev ${prev.tested}`} />
          <Kpi label="Reached evidence" value={te.eligible} sub={`prev ${prev.eligible}`} />
          <Kpi label="Winners found" value={te.winnersFound} tone="green" sub={`prev ${prev.winnersFound}`} />
          <Kpi label="Hit rate" value={fmtPct(te.hitRate, 0)} tone="purple" sub={`prev ${fmtPct(prev.hitRate, 0)}`} />
          <Kpi label="Median spend to evidence" value={fmtMoney(te.medianSpendToEvidence, cur)} sub={`prev ${fmtMoney(prev.medianSpendToEvidence, cur)}`} />
          <Kpi label="Learning spend per winner" value={fmtMoney(te.costToFindWinner, cur)} sub={`prev ${fmtMoney(prev.costToFindWinner, cur)}`} />
        </div>
        <p className="mt-2 text-sm text-ink-soft">{te.text}</p>
      </Card>

      <Card question="Winner rate by launch cohort" title="Winners ÷ creatives that reached evidence (ever). Young cohorts are still maturing.">
        <MiniBars data={chart} x="cohort" y="rate" fmt="pct" color="#6d28d9" height={200} />
      </Card>

      <Card question="Cohort table" title="Medians use only creatives that reached each milestone">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {["Cohort", "Launched", "Reached evidence", "Winners", "Winner rate", "Volume", "Scale cand.", "Emerging", "Losers", "Kill", "Days → evidence", "Days → winner", "Spend → evidence", "Spend → winner", "Winner lifespan", "Spend", "Purchases", "ROAS"].map((h) => (
                  <th key={h} className="th">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.key}>
                  <td className="td font-medium">{x.key}</td>
                  <td className="td num">{x.launched}</td>
                  <td className="td num">{x.eligible}</td>
                  <td className="td num">{x.winners}</td>
                  <td className="td num">{fmtPct(x.winnerRate, 0)}</td>
                  <td className="td num">{x.volumeWinners}</td>
                  <td className="td num">{x.scaleCandidates}</td>
                  <td className="td num">{x.emerging}</td>
                  <td className="td num">{x.losers}</td>
                  <td className="td num">{x.killCandidates}</td>
                  <td className="td num">{fmtNum(x.medianDaysToEvidence)}</td>
                  <td className="td num">{fmtNum(x.medianDaysToWinner)}</td>
                  <td className="td num">{fmtMoney(x.medianSpendToEvidence, cur)}</td>
                  <td className="td num">{fmtMoney(x.medianSpendToWinner, cur)}</td>
                  <td className="td num">{fmtNum(x.medianWinnerLifespan)}</td>
                  <td className="td num">{fmtMoney(x.spend, cur)}</td>
                  <td className="td num">{fmtNum(x.purchases)}</td>
                  <td className="td num">{fmtX(x.roas)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
