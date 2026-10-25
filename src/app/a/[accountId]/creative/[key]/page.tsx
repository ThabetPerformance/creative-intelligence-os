import Link from "next/link";
import { notFound } from "next/navigation";
import { getAnalysis } from "@/server/analysis";
import { creativeTimeline, TIMELINE_RANGES, type TimelineRange } from "@/server/timeline";
import { snapshotHistory } from "@/server/snapshots";
import { getPool } from "@/lib/db/client";
import { withPeriod, type SearchParams } from "@/lib/period";
import { relevantLearnings } from "@/engine/planner";
import type { Metrics } from "@/engine/metrics";
import { CLASSIFICATION_LABEL, DECISION_LABEL, type Classification } from "@/engine/types";
import { Card, ClassBadge, ConfidenceBadge, DecisionBadge, Kpi, Pill, StatusTag, Thumb, fmtDelta, fmtMoney, fmtNum, fmtPct, fmtX, classTone } from "@/components/ui";
import { CreativeTimelineChart } from "@/components/charts";
import { ActionForm } from "@/components/ActionForm";
import { creativeHref, NoData } from "@/components/page-kit";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function CreativeDetail({ params, searchParams }: { params: Promise<{ accountId: string; key: string }>; searchParams: Promise<SearchParams> }) {
  const { accountId, key: rawKey } = await params;
  const sp = await searchParams;
  const key = decodeURIComponent(rawKey);
  const a = await getAnalysis(accountId, sp);
  if (!a) notFound();
  const r = a.result;
  if (!r) return <NoData accountId={accountId} />;
  const c = r.creatives.find((x) => x.key === key);
  if (!c) notFound();
  const cur = a.account.currency;
  const tl = (TIMELINE_RANGES.find((x) => x.key === one(sp.tl))?.key ?? "lifetime") as TimelineRange;
  const axis = one(sp.axis) === "launch" ? "launch" : "calendar";
  const [timeline, snaps, actions, learningsQ] = await Promise.all([
    creativeTimeline(accountId, a.account.dataVersion, cur, r, c, tl),
    snapshotHistory(accountId, key),
    getPool().query("SELECT * FROM creative_actions WHERE account_id=$1 AND creative_key=$2 ORDER BY created_at DESC", [accountId, key]),
    getPool().query("SELECT id, learning, evidence_status, concept, angle, hook_tactic, format, creator, creative_key, creative_group_id FROM creative_learnings WHERE account_id=$1", [accountId]),
  ]);
  const learnings = relevantLearnings(
    c,
    learningsQ.rows.map((l) => ({ id: l.id, learning: l.learning, evidenceStatus: l.evidence_status, concept: l.concept, angle: l.angle, hookTactic: l.hook_tactic, format: l.format, creator: l.creator, creativeKey: l.creative_key, creativeGroupId: l.creative_group_id })),
  );
  const siblings = c.meta.creativeGroupId ? r.creatives.filter((x) => x.key !== c.key && x.meta.creativeGroupId === c.meta.creativeGroupId) : [];
  const ms = c.milestones;
  const link = (patch: Record<string, string>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v) q.set(k, one(v));
    for (const [k, v] of Object.entries(patch)) q.set(k, v);
    return `?${q.toString()}`;
  };
  const m = c.meta;

  return (
    <div className="space-y-4">
      <Link href={withPeriod(`/a/${accountId}/leaderboard`, sp)} className="text-xs text-ink-muted hover:underline">
        ← Leaderboard
      </Link>
      <div className="card flex flex-wrap items-start gap-4 p-4">
        {m.mediaUrl && /\.(mp4|webm|mov)(\?|$)/i.test(m.mediaUrl) ? (
          <video src={m.mediaUrl} poster={m.thumbnailUrl ?? undefined} className="h-28 w-28 rounded-lg border border-line object-cover" controls muted preload="none" />
        ) : (
          <Thumb url={m.thumbnailUrl} label={m.creativeName} size={112} />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="h1">{m.creativeName}</h1>
          <div className="mt-0.5 text-xs text-ink-muted">
            {m.platform} · variant <span className="font-mono">{m.creativeVariantId}</span>
            {m.platformCreativeId && (
              <>
                {" "}
                · platform creative <span className="font-mono">{m.platformCreativeId}</span>
              </>
            )}
            {m.creativeGroupId && (
              <>
                {" "}
                · group <span className="font-mono">{m.creativeGroupId}</span>
              </>
            )}{" "}
            · {m.adIds.length} ad(s) · launched {c.launchDate ?? "unknown"} ({c.ageDays} days ago) · {c.daysLive} days with spend
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <ClassBadge c={c.classification} />
            <DecisionBadge d={c.decision} />
            <ConfidenceBadge c={c.confidence} />
            <Pill tone="gray">Lifecycle: {c.lifecycleStage.replaceAll("_", " ")}</Pill>
            <Pill tone="gray">Evidence: {c.evidence.level}</Pill>
            {c.fatigue.status !== "NOT_APPLICABLE" && <Pill tone={c.fatigue.status === "HEALTHY" ? "green" : c.fatigue.status === "WATCH" ? "yellow" : "orange"}>Fatigue: {c.fatigue.status}</Pill>}
            <Pill tone="gray">Scale: {c.scale.evidence.replaceAll("_", " ")}</Pill>
            {c.rank.current && <Pill tone="purple">Rank #{c.rank.current}</Pill>}
            {c.flags.map((f) => (
              <Pill key={f} tone="gray">
                {f.replaceAll("_", " ")}
              </Pill>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1 text-[11px] text-ink-muted">
            {[
              ["Format", m.format],
              ["Asset", m.assetType],
              ["Creator", m.creator],
              ["Concept", m.concept],
              ["Angle", m.angle],
              ["Hook", m.hookTactic],
              ["Body", m.bodyTactic],
              ["Headline tactic", m.headlineTactic],
              ["CTA", m.cta],
              ["Offer", m.offer],
              ["Product", m.productName],
              ["Persona", m.persona],
              ["Batch", m.batch],
            ]
              .filter(([, v]) => v)
              .map(([l, v]) => (
                <span key={l} className="rounded border border-line px-1.5 py-0.5">
                  {l}: <b className="text-ink-soft">{v}</b>
                </span>
              ))}
            {m.manualTags.map((t) => (
              <span key={t} className="rounded border border-line bg-canvas px-1.5 py-0.5">
                #{t}
              </span>
            ))}
            {!m.inLibrary && <span className="rounded border border-watch-line bg-watch-bg px-1.5 py-0.5 text-watch">Not in creative library (metadata from ads only)</span>}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <a href="#action" className="btn-primary">
            Create action
          </a>
          <Link className="btn" href={withPeriod(`/a/${accountId}/timeline?keys=${encodeURIComponent(c.key)}`, sp)}>
            Compare on timeline
          </Link>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <Card question="Why this classification?" title={c.evidence.text}>
          <dl className="grid gap-2 text-sm">
            {(
              [
                ["Commercial", c.diagnosis.commercial],
                ["Volume", c.diagnosis.volume],
                ["Trend", c.diagnosis.trend],
                ["Attention", c.diagnosis.attention],
                ["Conversion", c.diagnosis.conversion],
                ["Reusable element", c.diagnosis.reusableElement],
                ["Weak element", c.diagnosis.weakElement],
              ] as const
            )
              .filter(([, v]) => v)
              .map(([l, v]) => (
                <div key={l} className="grid grid-cols-[120px_1fr] gap-2">
                  <dt className="label pt-0.5">{l}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
          </dl>
          <div className="mt-3 rounded-lg border border-line bg-canvas p-3 text-sm">
            <div className="label mb-0.5">Recommendation</div>
            <div className="font-medium">{c.diagnosis.recommendation}</div>
            <div className="mt-0.5 text-xs text-ink-muted">Validation window: {c.diagnosis.validationWindow}</div>
          </div>
          <ul className="mt-3 space-y-1 text-sm">
            {c.reasons.map((x, i) => (
              <li key={i} className="flex items-start gap-2">
                <StatusTag s={x.status} />
                <span>{x.text}</span>
              </li>
            ))}
            {c.tracking.flags.map((x, i) => (
              <li key={`t${i}`} className="flex items-start gap-2">
                <Pill tone="red">TRACKING</Pill>
                <span>{x.text}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card question="How does it compare?" title={`${r.ctx.window.from} → ${r.ctx.window.to}${r.ctx.comparisonWindow ? ` vs ${r.ctx.comparisonWindow.from} → ${r.ctx.comparisonWindow.to}` : ""}`}>
          <MetricTable cur={cur} cvrLabel={r.ctx.labels.cvr} cols={[["Period", c.window], ["Comparison", c.comparison], ["Last 7D", c.c7], ["Prev 7D", c.p7], ["Last 14D", c.c14], ["Lifetime", c.lifetime]]} target={r.ctx.target.targetRoas} />
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Kpi label="ROAS vs target" value={fmtDelta(c.roasVsTarget)} tone={c.roasVsTarget !== null && c.roasVsTarget >= 0 ? "green" : "orange"} />
            <Kpi label="Spend share" value={fmtPct(c.volume.spendShare)} sub={`purchases ${fmtPct(c.volume.purchaseShare)}`} />
            <Kpi label="Decision-ready waste" value={fmtMoney(c.decisionReadyWaste, cur)} tone={c.decisionReadyWaste > 0 ? "red" : undefined} />
          </div>
        </Card>
      </div>

      <Card
        question="What happened, day by day?"
        title={`Calendar-based: every day is shown, including days without delivery. Targets follow the targets history.`}
        right={
          <div className="flex flex-wrap gap-1">
            {TIMELINE_RANGES.map((x) => (
              <Link key={x.key} href={link({ tl: x.key })} className={`rounded-md border px-2 py-0.5 text-xs ${tl === x.key ? "border-ink bg-ink text-white" : "border-line"}`}>
                {x.label}
              </Link>
            ))}
            <span className="mx-1 w-px bg-line" />
            <Link href={link({ axis: "calendar" })} className={`rounded-md border px-2 py-0.5 text-xs ${axis === "calendar" ? "border-ink bg-ink text-white" : "border-line"}`}>
              Calendar
            </Link>
            <Link href={link({ axis: "launch" })} className={`rounded-md border px-2 py-0.5 text-xs ${axis === "launch" ? "border-ink bg-ink text-white" : "border-line"}`}>
              Days since launch
            </Link>
          </div>
        }
      >
        {timeline ? (
          <>
            <CreativeTimelineChart
              currency={cur}
              axis={axis}
              points={timeline.points.map((p) => ({ ...p }) as unknown as import("@/components/charts").TlPoint)}
              markers={timeline.markers.map((x) => ({ date: x.date, day: x.day, label: x.label, type: x.type }))}
              phases={timeline.phases}
            />
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium">Markers ({timeline.markers.length}) and daily table</summary>
              <ul className="mt-2 grid gap-1 text-xs md:grid-cols-2">
                {timeline.markers.map((x, i) => (
                  <li key={i}>
                    <b>{x.date}</b> (D{x.day}) · {x.label} <span className="text-ink-faint">{x.source === "EVENT" ? "logged event" : "derived"}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 max-h-96 overflow-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      {["Date", "Day", "Spend", "Purch.", "ROAS", "ROAS 7D", "CPO 7D", "CVR 7D", "CTR", "Freq.", "Target"].map((h) => (
                        <th key={h} className="th">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...timeline.points].reverse().map((p) => (
                      <tr key={p.date} className={p.spend === 0 ? "text-ink-faint" : ""}>
                        <td className="td text-xs">{p.date}</td>
                        <td className="td num text-xs">{p.day}</td>
                        <td className="td num text-xs">{fmtMoney(p.spend, cur)}</td>
                        <td className="td num text-xs">{fmtNum(p.purchases)}</td>
                        <td className="td num text-xs">{fmtX(p.roas)}</td>
                        <td className="td num text-xs">{fmtX(p.roas7)}</td>
                        <td className="td num text-xs">{fmtMoney(p.cpo7, cur)}</td>
                        <td className="td num text-xs">{fmtPct(p.cvr7, 2)}</td>
                        <td className="td num text-xs">{fmtPct(p.ctr, 2)}</td>
                        <td className="td num text-xs">{fmtNum(p.frequency, 2)}</td>
                        <td className="td num text-xs">{fmtX(p.targetRoas)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        ) : (
          <p className="sub">No daily rows in this range.</p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card question="When was it at its best?" title={c.peaks.daysSincePeak !== null ? `${c.peaks.daysSincePeak} days since the best 7-day window` : "Not enough spend for a meaningful peak"}>
          <table className="w-full text-sm">
            <tbody>
              {(
                [
                  ["Best day", c.peaks.bestDay],
                  ["Best 3D", c.peaks.best3d],
                  ["Best 7D", c.peaks.best7d],
                  ["Best 14D", c.peaks.best14d],
                  ["Best 30D", c.peaks.best30d],
                  ["Peak purchases 7D", c.peaks.peakPurchases7d],
                ] as const
              ).map(([l, p]) => (
                <tr key={l}>
                  <td className="td text-xs text-ink-muted">{l}</td>
                  <td className="td text-xs">{p ? `${p.from}${p.to !== p.from ? ` → ${p.to}` : ""}` : "—"}</td>
                  <td className="td num text-right text-xs">{p ? fmtX(p.roas) : ""}</td>
                  <td className="td num text-right text-xs">{p ? `${fmtNum(p.purchases)} p` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-ink-muted">
            Current 7D vs peak ROAS {fmtDelta(c.peaks.currentVsPeakRoas)} · CPO vs best {fmtDelta(c.peaks.currentVsBestCpo)} · CVR vs best {fmtDelta(c.peaks.currentVsBestCvr)}
          </p>
        </Card>
        <Card question="Is it fatiguing?" title={c.fatigue.text}>
          {c.fatigue.eligible ? (
            <>
              <table className="w-full text-xs">
                <tbody>
                  {(
                    [
                      ["ROAS 7D vs winner-era normal", c.fatigue.signals.roas7VsWinnerNormal],
                      ["ROAS 14D vs winner-era normal", c.fatigue.signals.roas14VsWinnerNormal],
                      ["ROAS 7D vs previous 7D", c.fatigue.signals.roasVsPrev7],
                      ["ROAS 7D vs best 7D", c.fatigue.signals.roasVsBest7],
                      ["CPO 7D vs previous 7D", c.fatigue.signals.cpoVsPrev7],
                      ["CVR 7D vs previous 7D", c.fatigue.signals.cvrVsPrev7],
                      ["CTR 7D vs previous 7D", c.fatigue.signals.ctrVsPrev7],
                      ["Hook 7D vs previous 7D", c.fatigue.signals.hookVsPrev7],
                      ["Frequency change", c.fatigue.signals.frequencyChange],
                    ] as const
                  ).map(([l, v]) => (
                    <tr key={l}>
                      <td className="td text-xs text-ink-muted">{l}</td>
                      <td className={`td num text-right text-xs ${v !== null && v < 0 ? "text-kill" : ""}`}>{fmtDelta(v)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="td text-xs text-ink-muted">Purchases 14D z-score vs winner-era CPO</td>
                    <td className="td num text-right text-xs">{c.fatigue.signals.purchasesZ14?.toFixed(2) ?? "—"}</td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-2 text-xs text-ink-muted">
                {c.fatigue.startDate ? `Decline started ${c.fatigue.startDate} (${c.fatigue.daysInDecline} days). ` : ""}
                {c.fatigue.spendAtRisk ? `Spend at risk: ${fmtMoney(c.fatigue.spendAtRisk, cur)}.` : ""}
              </p>
              <ul className="mt-2 space-y-1 text-xs">
                {[...c.fatigue.facts, ...c.fatigue.hypotheses].map((x, i) => (
                  <li key={i} className="flex gap-1.5">
                    <StatusTag s={x.status} /> {x.text}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="sub">Only creatives that were winners can fatigue.</p>
          )}
        </Card>
        <Card question="Does it hold up when spend rises?" title={c.scale.text}>
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="th">Week</th>
                <th className="th text-right">Spend</th>
                <th className="th text-right">ROAS</th>
                <th className="th text-right">CPO</th>
              </tr>
            </thead>
            <tbody>
              {c.scale.weeks.slice(-8).map((w) => (
                <tr key={w.from}>
                  <td className="td text-xs">{w.from.slice(5)}</td>
                  <td className="td num text-right text-xs">{fmtMoney(w.spend, cur)}</td>
                  <td className="td num text-right text-xs">{fmtX(w.roas)}</td>
                  <td className="td num text-right text-xs">{fmtMoney(w.cpo, cur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-ink-muted">{c.scale.response.text}</p>
          {c.scale.earnedBudget && (
            <p className="mt-1 text-xs">
              <Pill tone="yellow">PLANNING ESTIMATE</Pill> Earned weekly budget ≈ {fmtMoney(c.scale.earnedBudget.earnedWeeklySpend, cur)} (now {fmtMoney(c.scale.earnedBudget.currentWeeklySpend, cur)}). {c.scale.earnedBudget.basis}
            </p>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card question="How did its life unfold?" title="Lifecycle periods (derived from daily history)">
          <ol className="space-y-1.5 text-sm">
            {c.lifecycle.map((p, i) => (
              <li key={i} className="flex gap-2">
                <span className="w-44 shrink-0 text-xs text-ink-muted">
                  {p.from} → {p.to ?? "now"}
                </span>
                <span>
                  <b>{p.stage.replaceAll("_", " ")}</b> <span className="text-xs text-ink-muted">{p.reason}</span>
                </span>
              </li>
            ))}
          </ol>
        </Card>
        <Card question="Milestones" title="Days and spend it took to reach each stage">
          <table className="w-full text-xs">
            <tbody>
              {(
                [
                  ["First spend", ms.firstSpendDate],
                  ["First purchase", ms.firstPurchaseDate],
                  ["Reached evidence", ms.evidenceDate && `${ms.evidenceDate} · ${ms.daysToEvidence}d · ${fmtMoney(ms.spendToEvidence, cur)}`],
                  ["Emerging", ms.emergingDate],
                  ["First winner", ms.firstWinnerDate && `${ms.firstWinnerDate} · ${ms.daysToWinner}d · ${fmtMoney(ms.spendToWinner, cur)} (target then ${fmtX(ms.targetAtWinner)})`],
                  ["First scale step", ms.firstScaleDate],
                  ["Peak (best 7D end)", ms.peakDate],
                  ["Fatigue watch", ms.fatigueWatchDate],
                  ["Fatigued", ms.fatigueDate],
                  ["Kill-ready", ms.killReadyDate],
                  ["Last spend", ms.lastSpendDate],
                  ["Retired", ms.retiredDate],
                  ["Relaunched", ms.relaunchDates.join(", ") || null],
                  ["Winner again", ms.winnerAgainDate],
                  ["Winner lifespan", ms.winnerLifespanDays !== null ? `${ms.winnerLifespanDays} days${ms.lifespanCensored ? " (still running)" : ""}` : null],
                ] as const
              ).map(([l, v]) => (
                <tr key={l}>
                  <td className="td text-xs text-ink-muted">{l}</td>
                  <td className="td text-xs">{v ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card question="What did the system say before?" title="Stored weekly snapshots (Recalculate rebuilds them using only data known at each date)">
          {snaps.length ? (
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="th">As of</th>
                  <th className="th">Class</th>
                  <th className="th">Decision</th>
                  <th className="th text-right">Target</th>
                </tr>
              </thead>
              <tbody>
                {[...snaps].reverse().map((s) => (
                  <tr key={s.d}>
                    <td className="td text-xs">{s.d}</td>
                    <td className="td text-xs">
                      <span className="font-medium" style={{ color: undefined }}>
                        {CLASSIFICATION_LABEL[s.classification as Classification] ?? s.classification}
                      </span>
                    </td>
                    <td className="td text-xs">{DECISION_LABEL[s.decision as keyof typeof DECISION_LABEL] ?? s.decision}</td>
                    <td className="td num text-right text-xs">{fmtX(s.target_roas_used)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="sub">No snapshots yet. Run “Recalculate history snapshots” on the Import page.</p>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card question="Where does attention drop?" title={c.video?.text ?? "No video metrics for this creative."}>
          {c.video && (
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="th">Stage</th>
                  <th className="th text-right">This creative</th>
                  <th className="th text-right">Platform median</th>
                </tr>
              </thead>
              <tbody>
                {c.video.stages.map((s) => (
                  <tr key={s.key}>
                    <td className="td text-xs">{s.label}</td>
                    <td className="td num text-right text-xs">{fmtPct(s.rate)}</td>
                    <td className="td num text-right text-xs">{fmtPct(s.platformMedian)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-2 text-xs text-ink-muted">
            Hook matrix: <b>{c.hookMatrix ? c.hookMatrix.replaceAll("_", " ") : "n/a"}</b> · hook pct {fmtPct(c.attention.hookPct, 0)} · CTR pct {fmtPct(c.attention.ctrPct, 0)} · CVR pct {fmtPct(c.attention.cvrPct, 0)} ({c.attention.baselineScope})
          </p>
        </Card>
        <Card question="Where does it run?" title={`${m.campaigns.length} campaign(s), ${m.adsets.length} ad set(s), ${m.adIds.length} ad(s) — aggregated by creative variant, never by name`}>
          <div className="max-h-48 space-y-1 overflow-auto text-xs">
            {m.campaigns.map((x) => (
              <div key={x}>📁 {x}</div>
            ))}
            {m.adsets.map((x) => (
              <div key={x} className="pl-3 text-ink-muted">
                {x}
              </div>
            ))}
            <div className="pt-1 font-mono text-[11px] text-ink-muted">{m.adIds.join(", ")}</div>
          </div>
          {m.landingPage && <p className="mt-2 truncate text-xs">Landing page: {m.landingPage}</p>}
        </Card>
        <Card question="Same creative elsewhere" title="Variants sharing this creative group (cross-platform)">
          {siblings.length ? (
            <ul className="space-y-1.5 text-sm">
              {siblings.map((s) => (
                <li key={s.key} className="flex items-center justify-between gap-2">
                  <Link className="truncate hover:underline" href={creativeHref(accountId, s.key, sp)}>
                    {s.meta.platform} · {s.meta.creativeName}
                  </Link>
                  <span className="flex items-center gap-1 text-xs">
                    {fmtX(s.window.roas)} <ClassBadge c={s.classification} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sub">No other variant in this group.</p>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card question="What are we doing about it?" title="Actions for this creative" className="scroll-mt-24">
          <div id="action" />
          {actions.rows.length > 0 && (
            <ul className="mb-3 space-y-1 text-sm">
              {actions.rows.map((x) => (
                <li key={x.id} className="flex items-center gap-2">
                  <Pill tone={x.status === "DONE" ? "green" : x.status === "VALIDATING" ? "yellow" : "gray"}>{x.status}</Pill>
                  <span className="truncate">{x.action}</span>
                  {x.decision_outcome && <Pill tone="purple">{x.decision_outcome}</Pill>}
                </li>
              ))}
            </ul>
          )}
          <ActionForm accountId={accountId} c={c} currency={cur} />
        </Card>
        <Card question="What have we learned that applies here?" title="Learnings matched by creative, group, concept, or hook × angle">
          {learnings.length ? (
            <ul className="space-y-2 text-sm">
              {learnings.map((l) => (
                <li key={l.id} className="flex gap-2">
                  <StatusTag s={l.evidenceStatus} />
                  <span>{l.learning}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sub">No recorded learnings match this creative yet.</p>
          )}
          <Link className="mt-2 inline-block text-sm underline" href={withPeriod(`/a/${accountId}/actions`, sp)}>
            Action & Learning →
          </Link>
        </Card>
      </div>
      <span className="hidden" data-tone={classTone(c.classification)} />
    </div>
  );
}

function MetricTable({ cols, cur, cvrLabel, target }: { cols: [string, Metrics | null][]; cur: string; cvrLabel: string; target: number }) {
  const rows: [string, (m: Metrics) => string][] = [
    ["Spend", (m) => fmtMoney(m.spend, cur)],
    ["Purchases", (m) => fmtNum(m.purchases)],
    ["Revenue", (m) => fmtMoney(m.purchaseValue, cur)],
    [`ROAS (target ${target.toFixed(2)}x)`, (m) => fmtX(m.roas)],
    ["CPO", (m) => fmtMoney(m.cpo, cur)],
    ["AOV", (m) => fmtMoney(m.aov, cur)],
    [cvrLabel, (m) => fmtPct(m.cvr, 2)],
    ["CTR", (m) => fmtPct(m.ctr, 2)],
    ["CPC", (m) => fmtMoney(m.cpc, cur)],
    ["CPM", (m) => fmtMoney(m.cpm, cur)],
    ["Hook rate", (m) => fmtPct(m.hookRate)],
    ["Hold rate", (m) => fmtPct(m.holdRate)],
    ["Frequency", (m) => fmtNum(m.frequency, 2)],
    ["Active days", (m) => String(m.activeDays)],
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="th" />
            {cols.map(([l]) => (
              <th key={l} className="th text-right">
                {l}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([l, f]) => (
            <tr key={l}>
              <td className="td text-xs text-ink-muted">{l}</td>
              {cols.map(([k, m]) => (
                <td key={k} className="td num text-right text-xs">
                  {m ? f(m) : "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
