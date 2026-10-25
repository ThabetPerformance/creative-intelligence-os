import { loadPage, NoData, CreativeCell, type PageProps } from "@/components/page-kit";
import { Card, ClassBadge, DecisionBadge, Kpi, PageHeader, Pill, fmtDelta, fmtMoney, fmtNum, fmtX, type Tone } from "@/components/ui";
import { SHIFT_KINDS } from "@/engine/shifts";
import { median } from "@/engine/stats";
import { creativeHref } from "@/components/page-kit";
import Link from "next/link";

const FT: Record<string, Tone> = { SEVERE: "red", MATERIAL: "orange", WATCH: "yellow", HEALTHY: "green" };
const SHIFT_LABEL: Record<string, string> = {
  NEW_WINNERS: "New winners",
  SCALING: "Scaling",
  DECLINING: "Declining",
  FATIGUING: "Fatiguing",
  RECOVERING: "Recovering",
  PAUSED_WINNERS: "Paused winners",
  HIDDEN_OPPORTUNITIES: "Hidden opportunities",
  NEW_LOSERS: "New losers",
};

export default async function FatiguePage(props: PageProps) {
  const { accountId, sp, a, r } = await loadPage(props);
  if (!r) return <NoData accountId={accountId} />;
  const cur = a.account.currency;
  const everWinners = r.creatives.filter((c) => c.fatigue.eligible);
  const fatiguing = everWinners.filter((c) => ["WATCH", "MATERIAL", "SEVERE"].includes(c.fatigue.status)).sort((x, y) => y.fatigue.spendAtRisk - x.fatigue.spendAtRisk);
  const lifespans = r.creatives.map((c) => c.milestones.winnerLifespanDays).filter((x): x is number => x !== null);
  const completed = r.creatives.filter((c) => c.milestones.winnerLifespanDays !== null && !c.milestones.lifespanCensored).map((c) => c.milestones.winnerLifespanDays!);
  const stageCounts = new Map<string, number>();
  for (const c of r.creatives.filter((x) => x.lifetime.spend > 0)) stageCounts.set(c.lifecycleStage, (stageCounts.get(c.lifecycleStage) ?? 0) + 1);
  const atRisk = fatiguing.reduce((s, c) => s + c.fatigue.spendAtRisk, 0);

  return (
    <div className="space-y-4">
      <PageHeader title="Fatigue & Lifecycle" question="Which winners are wearing out, how long do winners last, and what changed this week?" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <Kpi label="Ever winners" value={everWinners.length} />
        <Kpi label="Severe" value={everWinners.filter((c) => c.fatigue.status === "SEVERE").length} tone="red" />
        <Kpi label="Material" value={everWinners.filter((c) => c.fatigue.status === "MATERIAL").length} tone="orange" />
        <Kpi label="Watch" value={everWinners.filter((c) => c.fatigue.status === "WATCH").length} tone="yellow" />
        <Kpi label="Spend at risk (7D)" value={fmtMoney(atRisk, cur)} tone="red" />
        <Kpi label="Median winner lifespan" value={`${fmtNum(median(completed))} d`} sub={`${completed.length} completed, ${lifespans.length - completed.length} still running (censored)`} />
      </div>

      <Card question="Which winners are fatiguing?" title="Compared with each creative's own winner-era normal, with a noise check on purchases. Causes are hypotheses.">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {["Creative", "Fatigue", "Class", "Decision", "Started", "Days", "ROAS 7D", "vs winner normal", "vs best 7D", "CPO 7D vs prev", "CTR vs prev", "Freq. change", "z (14D purchases)", "Spend at risk", "Likely cause (hypothesis)"].map((h) => (
                  <th key={h} className="th">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fatiguing.length === 0 && (
                <tr>
                  <td className="td text-ink-muted" colSpan={15}>
                    No winner shows statistically meaningful decline in this period.
                  </td>
                </tr>
              )}
              {fatiguing.map((c) => (
                <tr key={c.key}>
                  <td className="td">
                    <CreativeCell c={c} accountId={accountId} sp={sp} />
                  </td>
                  <td className="td">
                    <Pill tone={FT[c.fatigue.status] ?? "gray"}>{c.fatigue.status}</Pill>
                  </td>
                  <td className="td">
                    <ClassBadge c={c.classification} />
                  </td>
                  <td className="td">
                    <DecisionBadge d={c.decision} />
                  </td>
                  <td className="td text-xs">{c.fatigue.startDate ?? "—"}</td>
                  <td className="td num">{c.fatigue.daysInDecline ?? "—"}</td>
                  <td className="td num">{fmtX(c.c7.roas)}</td>
                  <td className="td num text-kill">{fmtDelta(c.fatigue.signals.roas7VsWinnerNormal)}</td>
                  <td className="td num">{fmtDelta(c.fatigue.signals.roasVsBest7)}</td>
                  <td className="td num">{fmtDelta(c.fatigue.signals.cpoVsPrev7)}</td>
                  <td className="td num">{fmtDelta(c.fatigue.signals.ctrVsPrev7)}</td>
                  <td className="td num">{fmtDelta(c.fatigue.signals.frequencyChange)}</td>
                  <td className="td num">{c.fatigue.signals.purchasesZ14?.toFixed(1) ?? "—"}</td>
                  <td className="td num">{fmtMoney(c.fatigue.spendAtRisk, cur)}</td>
                  <td className="td max-w-[280px] whitespace-normal text-xs">{c.fatigue.hypotheses[0]?.text ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card question="What changed this week?" title="Current 7D vs previous 7D performance shifts">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {SHIFT_KINDS.map((k) => (
            <div key={k} className="rounded-lg border border-line p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-semibold">{SHIFT_LABEL[k]}</span>
                <span className="num text-sm">{r.shifts[k].length}</span>
              </div>
              <ul className="space-y-1 text-xs">
                {r.shifts[k].slice(0, 6).map((s) => (
                  <li key={s.key}>
                    <Link className="font-medium hover:underline" href={creativeHref(accountId, s.key, sp)}>
                      {s.name}
                    </Link>
                    <div className="text-ink-muted">{s.detail}</div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card question="Where is every creative in its lifecycle?" title="Creatives with any spend, by current lifecycle stage">
          <table className="w-full">
            <tbody>
              {[...stageCounts.entries()]
                .sort((x, y) => y[1] - x[1])
                .map(([s, n]) => (
                  <tr key={s}>
                    <td className="td">{s.replaceAll("_", " ")}</td>
                    <td className="td num text-right">{n}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Card>
        <Card question="How long do winners last?" title="Winner lifespan = first winner day to fatigue or retirement; running winners are censored (lower bounds).">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Creative</th>
                <th className="th">First winner</th>
                <th className="th text-right">Lifespan</th>
                <th className="th">Status</th>
              </tr>
            </thead>
            <tbody>
              {r.creatives
                .filter((c) => c.milestones.winnerLifespanDays !== null)
                .sort((x, y) => (y.milestones.winnerLifespanDays ?? 0) - (x.milestones.winnerLifespanDays ?? 0))
                .slice(0, 25)
                .map((c) => (
                  <tr key={c.key}>
                    <td className="td">
                      <CreativeCell c={c} accountId={accountId} sp={sp} />
                    </td>
                    <td className="td text-xs">{c.milestones.firstWinnerDate}</td>
                    <td className="td num text-right">
                      {c.milestones.winnerLifespanDays}d{c.milestones.lifespanCensored ? "+" : ""}
                    </td>
                    <td className="td text-xs">{c.lifecycleStage.replaceAll("_", " ")}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
