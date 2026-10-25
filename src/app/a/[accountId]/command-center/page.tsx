import Link from "next/link";
import { Card, Kpi, PageHeader, Pill, fmtDelta, fmtMoney, fmtNum, fmtPct, fmtX, TONE_HEX, classTone, ConfidenceBadge, DecisionBadge, type Tone } from "@/components/ui";
import { loadPage, NoData, creativeHref, MiniCreativeList, byKey, type PageProps } from "@/components/page-kit";
import { PortfolioMap, MiniBars } from "@/components/charts";
import { CLASSIFICATIONS, CLASSIFICATION_LABEL, WINNER_CLASSES } from "@/engine/types";
import { withPeriod } from "@/lib/period";
import { pctChange } from "@/engine/metrics";

const STORY_TONE: Record<string, Tone> = { good: "green", watch: "yellow", fix: "orange", bad: "red", neutral: "gray" };
const RISK_TONE: Record<string, Tone> = { HEALTHY_PIPELINE: "green", THIN_PIPELINE: "yellow", REPLACEMENT_RISK: "orange", CRITICAL_CREATIVE_PIPELINE: "red" };

export default async function CommandCenter(props: PageProps) {
  const { accountId, sp, a, r } = await loadPage(props);
  if (!r) return <NoData accountId={accountId} />;
  const cur = a.account.currency;
  const p = r.portfolio;
  const t = p.totals;
  const c = p.comparisonTotals;
  const tgt = r.ctx.target;
  const map = byKey(r);
  const active = r.creatives.filter((x) => x.activeInWindow);
  const delta = (x: number | null | undefined, y: number | null | undefined, invert = false) => {
    const d = pctChange(x ?? null, y ?? null);
    if (d === null) return null;
    const good = invert ? d < 0 : d > 0;
    return <span className={good ? "text-win" : "text-kill"}>{fmtDelta(d)} vs comparison</span>;
  };
  const lb = (q: string) => withPeriod(`/a/${accountId}/leaderboard?${q}`, sp);
  const top = (pred: (x: (typeof active)[number]) => boolean, n = 5) => active.filter(pred).sort((x, y) => y.priorityScore - x.priorityScore).slice(0, n);

  return (
    <div className="space-y-5">
      <PageHeader title="Creative Command Center" question="What is winning, what is wasting money, and what needs a decision today?">
        <span className="text-xs text-ink-muted">
          {r.ctx.window.from} → {r.ctx.window.to} · target {fmtX(tgt.targetRoas)} {tgt.cpoGuardrail ? `/ CPO ${fmtMoney(tgt.cpoGuardrail, cur)}` : ""} ({tgt.source === "TARGETS_HISTORY" ? `targets history from ${tgt.regimeStart}` : "account settings"}) · evidence ≥ {fmtMoney(r.ctx.evidenceSpend, cur)} or {r.ctx.minPurchases} purchases · computed in {r.timingMs} ms
        </span>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Spend" value={fmtMoney(t.spend, cur)} sub={delta(t.spend, c?.spend)} big />
        <Kpi label="Purchases" value={fmtNum(t.purchases)} sub={delta(t.purchases, c?.purchases)} big />
        <Kpi label="Revenue" value={fmtMoney(t.purchaseValue, cur)} sub={delta(t.purchaseValue, c?.purchaseValue)} big />
        <Kpi label="ROAS" value={fmtX(t.roas)} tone={t.roas !== null && t.roas >= tgt.targetRoas ? "green" : "orange"} sub={<>target {fmtX(tgt.targetRoas)} · {delta(t.roas, c?.roas)}</>} big />
        <Kpi label="CPO" value={fmtMoney(t.cpo, cur)} tone={tgt.cpoGuardrail && t.cpo !== null ? (t.cpo <= tgt.cpoGuardrail ? "green" : "orange") : undefined} sub={<>{tgt.cpoGuardrail ? `guardrail ${fmtMoney(tgt.cpoGuardrail, cur)} · ` : ""}{delta(t.cpo, c?.cpo, true)}</>} big />
        <Kpi label={r.ctx.labels.cvr} value={fmtPct(t.cvr, 2)} sub={delta(t.cvr, c?.cvr)} big />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Kpi label="Active creatives" value={p.activeCreatives} sub={`${p.eligibleCreatives} with enough evidence`} />
        <Kpi label="Winners" value={WINNER_CLASSES.reduce((s, k) => s + p.counts[k], 0)} tone="green" href={lb("view=winners")} sub={`${fmtPct(p.shares.winnerSpend, 0)} of spend · ${fmtPct(p.shares.winnerPurchases, 0)} of purchases`} />
        <Kpi label="Scale candidates" value={p.counts.SCALE_CANDIDATE} tone="green" href={lb("class=SCALE_CANDIDATE")} sub={`${fmtPct(p.shares.scaleCandidateSpend, 0)} of spend`} />
        <Kpi label="Fatigued winners" value={p.counts.FATIGUED_WINNER} tone="orange" href={lb("class=FATIGUED_WINNER")} sub={`${fmtPct(p.shares.fatiguedWinnerSpend, 0)} of spend`} />
        <Kpi label="Kill candidates" value={p.counts.KILL_CANDIDATE} tone="red" href={lb("class=KILL_CANDIDATE")} sub={`${fmtPct(p.shares.killSpend, 0)} of spend`} />
        <Kpi label="Decision-ready waste" value={fmtMoney(p.decisionReadyWaste, cur)} tone="red" sub="spend after a kill/cut was already justified" />
        <Kpi label="Learning spend" value={fmtMoney(p.learningSpend, cur)} tone="gray" sub="needed to reach evidence; not waste" />
        <Kpi label="Hit rate" value={fmtPct(p.hitRate.current, 0)} tone="purple" href={withPeriod(`/a/${accountId}/cohorts`, sp)} sub={`${p.hitRate.winners} winners / ${p.hitRate.eligible} judged`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card question="What is the story of this period?" title="Every statement is computed from the data (FACT).">
          <ul className="space-y-2">
            {p.story.map((s, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: TONE_HEX[STORY_TONE[s.tone] ?? "gray"] }} />
                <span>
                  {s.text} <span className="text-xs text-ink-muted">({s.evidence})</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card question="Where are creatives right now?" title="Active creatives by classification">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {CLASSIFICATIONS.map((k) => (
              <Link key={k} href={lb(`class=${k}`)} className="flex items-center justify-between rounded px-1 py-0.5 text-sm hover:bg-canvas">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: TONE_HEX[classTone(k)] }} />
                  {CLASSIFICATION_LABEL[k]}
                </span>
                <b className="num">{p.counts[k]}</b>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <Card question="Which creatives carry the account, and which only spend?" title="Each dot is a creative active in the period · size = purchases · click to open">
        <PortfolioMap
          currency={cur}
          targetRoas={tgt.targetRoas}
          legend={[
            { label: "Winning", color: TONE_HEX.green },
            { label: "Watch / learning", color: TONE_HEX.yellow },
            { label: "Fix", color: TONE_HEX.orange },
            { label: "Kill / tracking risk", color: TONE_HEX.red },
            { label: "Insufficient data", color: TONE_HEX.gray },
          ]}
          points={active.map((x) => ({ key: x.key, name: x.meta.creativeName, x: x.window.spend, y: x.window.roas, z: x.window.purchases ?? 0, cls: CLASSIFICATION_LABEL[x.classification], color: TONE_HEX[classTone(x.classification)], href: creativeHref(accountId, x.key, sp) }))}
        />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card question="Where can we make more money?" title="Opportunities, each with its evidence">
          {p.opportunities.length === 0 && <p className="sub">No opportunity meets the evidence rules in this period.</p>}
          <ul className="space-y-3">
            {p.opportunities.slice(0, 8).map((o, i) => {
              const cr = o.creativeKey ? map.get(o.creativeKey) : null;
              return (
                <li key={i} className="rounded-lg border border-line p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Pill tone="green">{o.kind}</Pill>
                    {cr && (
                      <span className="flex items-center gap-2">
                        <DecisionBadge d={cr.decision} />
                        <ConfidenceBadge c={cr.confidence} />
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-sm font-medium">{cr ? <Link className="hover:underline" href={creativeHref(accountId, cr.key, sp)}>{o.title}</Link> : o.title}</div>
                  <div className="mt-0.5 text-xs text-ink-muted">Evidence: {o.evidence}</div>
                  <div className="text-xs text-ink-muted">Potential: {o.potential} · Risk: {o.risk}</div>
                  <div className="mt-1 text-xs">
                    <b>Action:</b> {o.action}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card question="Where are we wasting money?" title={`Decision-ready waste in period: ${fmtMoney(p.wasteTotal, cur)}`}>
          {p.waste.length === 0 && <p className="sub">No spend continued after a cut was justified.</p>}
          <ul className="space-y-3">
            {p.waste.slice(0, 8).map((w, i) => {
              const cr = w.creativeKey ? map.get(w.creativeKey) : null;
              return (
                <li key={i} className="rounded-lg border border-line p-3">
                  <div className="flex items-center justify-between">
                    <Pill tone="red">{w.kind}</Pill>
                    <b className="num text-sm">{fmtMoney(w.amount, cur)}</b>
                  </div>
                  <div className="mt-1 text-sm font-medium">{cr ? <Link className="hover:underline" href={creativeHref(accountId, cr.key, sp)}>{w.title}</Link> : w.title}</div>
                  <div className="mt-0.5 text-xs text-ink-muted">{w.evidence}</div>
                  <div className="mt-1 text-xs">
                    <b>Action:</b> {w.action}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card question="Decide today: scale" title="Highest-priority scale and protect decisions">
          <MiniCreativeList accountId={accountId} sp={sp} list={top((x) => ["SCALE_CANDIDATE", "PROVEN_WINNER", "VOLUME_WINNER", "HIDDEN_WINNER", "EMERGING_WINNER"].includes(x.classification))} right={(x) => <span className="num">{fmtX(x.window.roas)}</span>} />
        </Card>
        <Card question="Decide today: refresh" title="Fatigue and watch">
          <MiniCreativeList accountId={accountId} sp={sp} list={top((x) => x.classification === "FATIGUED_WINNER" || x.classification === "FATIGUE_WATCH")} right={(x) => <span className="num">{fmtDelta(x.fatigue.signals.roas7VsWinnerNormal)}</span>} />
        </Card>
        <Card question="Decide today: cut" title="Kill candidates and losers still spending">
          <MiniCreativeList accountId={accountId} sp={sp} list={top((x) => x.classification === "KILL_CANDIDATE" || x.classification === "LOSER" || x.classification === "TRACKING_RISK")} right={(x) => <span className="num">{fmtMoney(x.c7.spend, cur)} 7D</span>} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card question="How concentrated is performance?" title={`${p.purchaseDependence.creatives} creative(s) carry ${fmtPct(p.purchaseDependence.share, 0)} of purchases (median age ${fmtNum(p.purchaseDependence.medianAge)} days)`}>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="th">Top N</th>
                <th className="th text-right">Spend share</th>
                <th className="th text-right">Purchase share</th>
              </tr>
            </thead>
            <tbody>
              {p.concentration.map((x) => (
                <tr key={x.n}>
                  <td className="td">Top {x.n}</td>
                  <td className="td num text-right">{fmtPct(x.spendShare, 0)}</td>
                  <td className="td num text-right">{fmtPct(x.purchaseShare, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card question="How fresh is the spend?" title={`Average creative age ${fmtNum(p.ages.avg)} days · winners ${fmtNum(p.ages.avgWinner)} days`}>
          <MiniBars data={p.freshness.map((f) => ({ label: `≤${f.days}d`, share: f.spendShare }))} x="label" y="share" fmt="pct" />
          <p className="mt-1 text-xs text-ink-muted">Share of period spend on creatives launched within N days of {r.ctx.asOf}.</p>
        </Card>
        <Card question="Can the pipeline replace today's winners?" title={r.plan.replacement.text}>
          <div className="mb-2">
            <Pill tone={RISK_TONE[r.plan.replacement.status] ?? "gray"}>{r.plan.replacement.status.replaceAll("_", " ")}</Pill>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Kpi label="Major winners" value={r.plan.replacement.majorWinners} />
            <Kpi label="At risk" value={r.plan.replacement.atRisk} tone="orange" />
            <Kpi label="Replacements" value={r.plan.replacement.replacements} tone="green" />
          </div>
          <Link href={withPeriod(`/a/${accountId}/planner`, sp)} className="mt-3 inline-block text-sm underline">
            What to make next →
          </Link>
        </Card>
      </div>

      <Card question="Are we getting better at finding winners?" title="Hit rate by launch month (winners ÷ creatives that reached evidence)">
        <MiniBars data={p.hitRate.months.map((m) => ({ month: m.cohort, rate: m.rate ?? 0, launched: m.launched }))} x="month" y="rate" fmt="pct" color="#6d28d9" />
      </Card>
    </div>
  );
}
