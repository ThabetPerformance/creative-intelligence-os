import { addDays, monthKey } from "./dates";
import { median, mean } from "./stats";
import { CLASSIFICATIONS, LOSER_CLASSES, WINNER_CLASSES, type Classification, type Reason } from "./types";
import type { AnalysisContext, CreativeAnalysis } from "./model";
import { everEligible } from "./cohorts";
import { addAgg, emptyAgg, metricsFromAgg, type Metrics } from "./metrics";
import type { GroupRow } from "./groups";

export interface StoryItem {
  text: string;
  status: "FACT";
  tone: "good" | "watch" | "fix" | "bad" | "neutral";
  evidence: string;
}

export interface Opportunity {
  kind: string;
  title: string;
  creativeKey: string | null;
  evidence: string;
  potential: string;
  risk: string;
  action: string;
}

export interface WasteItem {
  kind: string;
  title: string;
  creativeKey: string | null;
  amount: number;
  evidence: string;
  action: string;
}

export interface HitRatePoint {
  cohort: string;
  launched: number;
  eligible: number;
  winners: number;
  rate: number | null;
}

export interface Portfolio {
  counts: Record<Classification, number>;
  totalCreatives: number;
  activeCreatives: number;
  eligibleCreatives: number;
  totals: Metrics;
  comparisonTotals: Metrics | null;
  shares: {
    winnerSpend: number;
    winnerPurchases: number;
    loserSpend: number;
    killSpend: number;
    fatiguedWinnerSpend: number;
    scaleCandidateSpend: number;
    trackingRiskSpend: number;
  };
  decisionReadyWaste: number;
  learningSpend: number;
  concentration: { n: number; spendShare: number; purchaseShare: number }[];
  purchaseDependence: { creatives: number; share: number; medianAge: number | null };
  freshness: { days: number; spendShare: number }[];
  ages: { avg: number | null; median: number | null; avgWinner: number | null; medianWinner: number | null };
  hitRate: {
    current: number | null;
    eligible: number;
    winners: number;
    currentCohort: HitRatePoint | null;
    previousCohort: HitRatePoint | null;
    months: HitRatePoint[];
  };
  story: StoryItem[];
  opportunities: Opportunity[];
  waste: WasteItem[];
  wasteTotal: number;
}

const pct = (v: number, d = 0) => `${(v * 100).toFixed(d)}%`;

export function buildPortfolio(all: CreativeAnalysis[], ctx: AnalysisContext, groups: { creator: GroupRow[]; concept: GroupRow[] }): Portfolio {
  const active = all.filter((c) => c.activeInWindow);
  const counts = Object.fromEntries(CLASSIFICATIONS.map((k) => [k, 0])) as Record<Classification, number>;
  for (const c of active) counts[c.classification]++;
  const totalAgg = emptyAgg();
  for (const c of active) addAgg(totalAgg, c.windowAgg);
  const totals = metricsFromAgg(totalAgg, ctx.definitions);
  const hasComp = all.some((c) => c.comparison);
  const comparisonTotals = hasComp ? sumMetrics(all.map((c) => c.comparison).filter((m): m is Metrics => !!m)) : null;
  const S = totals.spend || 1;
  const P = totals.purchases || 0;
  const spendOf = (pred: (c: CreativeAnalysis) => boolean) => active.filter(pred).reduce((s, c) => s + c.window.spend, 0);
  const purchOf = (pred: (c: CreativeAnalysis) => boolean) => active.filter(pred).reduce((s, c) => s + (c.window.purchases ?? 0), 0);
  const isWinner = (c: CreativeAnalysis) => WINNER_CLASSES.includes(c.classification);
  const shares = {
    winnerSpend: spendOf(isWinner) / S,
    winnerPurchases: P ? purchOf(isWinner) / P : 0,
    loserSpend: spendOf((c) => LOSER_CLASSES.includes(c.classification)) / S,
    killSpend: spendOf((c) => c.classification === "KILL_CANDIDATE") / S,
    fatiguedWinnerSpend: spendOf((c) => c.classification === "FATIGUED_WINNER") / S,
    scaleCandidateSpend: spendOf((c) => c.classification === "SCALE_CANDIDATE") / S,
    trackingRiskSpend: spendOf((c) => c.classification === "TRACKING_RISK") / S,
  };
  const decisionReadyWaste = all.reduce((s, c) => s + c.decisionReadyWaste, 0);
  const learningSpend = active.reduce((s, c) => s + c.learningSpend, 0);

  const bySpend = [...active].sort((a, b) => b.window.spend - a.window.spend);
  const byPurch = [...active].sort((a, b) => (b.window.purchases ?? 0) - (a.window.purchases ?? 0));
  const concentration = [1, 3, 5, 10].map((n) => ({
    n,
    spendShare: bySpend.slice(0, n).reduce((s, c) => s + c.window.spend, 0) / S,
    purchaseShare: P ? byPurch.slice(0, n).reduce((s, c) => s + (c.window.purchases ?? 0), 0) / P : 0,
  }));
  // smallest set of creatives carrying ≥70% of purchases
  let acc = 0;
  const dep: CreativeAnalysis[] = [];
  for (const c of byPurch) {
    if (P === 0 || acc / P >= 0.7) break;
    acc += c.window.purchases ?? 0;
    dep.push(c);
  }
  const purchaseDependence = { creatives: dep.length, share: P ? acc / P : 0, medianAge: median(dep.map((c) => c.ageDays)) };

  const freshness = [7, 14, 30, 60, 90].map((days) => ({
    days,
    spendShare: spendOf((c) => !!c.launchDate && c.launchDate > addDays(ctx.asOf, -days)) / S,
  }));
  const winners = active.filter(isWinner);
  const ages = {
    avg: mean(active.map((c) => c.ageDays)),
    median: median(active.map((c) => c.ageDays)),
    avgWinner: mean(winners.map((c) => c.ageDays)),
    medianWinner: median(winners.map((c) => c.ageDays)),
  };

  const eligible = active.filter((c) => c.evidence.level !== "LOW");
  const eligibleWinners = eligible.filter(isWinner);
  const months = new Map<string, CreativeAnalysis[]>();
  for (const c of all) {
    if (!c.launchDate || c.launchDate > ctx.asOf) continue;
    const k = monthKey(c.launchDate);
    if (!months.has(k)) months.set(k, []);
    months.get(k)!.push(c);
  }
  const monthPoints: HitRatePoint[] = [...months.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([cohort, list]) => {
      const el = list.filter(everEligible);
      const w = el.filter((c) => c.milestones.firstWinnerDate !== null);
      return { cohort, launched: list.length, eligible: el.length, winners: w.length, rate: el.length ? w.length / el.length : null };
    })
    .slice(-6);
  const cohortPoint = (from: string, to: string, label: string): HitRatePoint => {
    const list = all.filter((c) => c.launchDate && c.launchDate >= from && c.launchDate <= to);
    const el = list.filter(everEligible);
    const w = el.filter((c) => c.milestones.firstWinnerDate !== null);
    return { cohort: label, launched: list.length, eligible: el.length, winners: w.length, rate: el.length ? w.length / el.length : null };
  };
  const hitRate = {
    current: eligible.length ? eligibleWinners.length / eligible.length : null,
    eligible: eligible.length,
    winners: eligibleWinners.length,
    currentCohort: cohortPoint(addDays(ctx.asOf, -29), ctx.asOf, "Launched last 30D"),
    previousCohort: cohortPoint(addDays(ctx.asOf, -59), addDays(ctx.asOf, -30), "Launched 30–60D ago"),
    months: monthPoints,
  };

  // ---------------------------------------------------------------- story
  const story: StoryItem[] = [];
  if (P > 0 && dep.length > 0) {
    const aging = (purchaseDependence.medianAge ?? 0) >= 45;
    story.push({
      text: `${pct(purchaseDependence.share)} of purchases depend on ${dep.length} creative${dep.length === 1 ? "" : "s"}${purchaseDependence.medianAge !== null ? ` (median age ${Math.round(purchaseDependence.medianAge)} days)` : ""}.`,
      status: "FACT",
      tone: dep.length <= 5 && aging ? "fix" : dep.length <= 3 ? "watch" : "neutral",
      evidence: `Top ${dep.length} of ${active.length} active creatives by purchases.`,
    });
  }
  if (counts.SCALE_CANDIDATE > 0) {
    story.push({
      text: `${counts.SCALE_CANDIDATE} scale candidate${counts.SCALE_CANDIDATE === 1 ? "" : "s"} receive only ${pct(shares.scaleCandidateSpend, 1)} of spend.`,
      status: "FACT",
      tone: shares.scaleCandidateSpend < 0.1 ? "good" : "neutral",
      evidence: "Strong economics with adequate evidence and low spend share.",
    });
  }
  if (shares.killSpend > 0.005) {
    story.push({
      text: `${pct(shares.killSpend, 1)} of current spend is allocated to kill candidates; ${ctx.currency} ${Math.round(decisionReadyWaste).toLocaleString("en-US")} was spent after the evidence was decision-ready.`,
      status: "FACT",
      tone: "bad",
      evidence: `${counts.KILL_CANDIDATE} kill candidates with persistent failure across windows.`,
    });
  }
  if (shares.fatiguedWinnerSpend > 0.01) {
    story.push({
      text: `${pct(shares.fatiguedWinnerSpend, 1)} of spend sits on ${counts.FATIGUED_WINNER} fatigued winner${counts.FATIGUED_WINNER === 1 ? "" : "s"}.`,
      status: "FACT",
      tone: "fix",
      evidence: "Historical winners with material deterioration on an adequate current sample.",
    });
  }
  const rated = monthPoints.filter((m) => m.rate !== null && m.eligible >= 3);
  if (rated.length >= 3) {
    const last3 = rated.slice(-3);
    const r = last3.map((m) => m.rate as number);
    if (r[0] > r[1] && r[1] > r[2]) {
      story.push({
        text: `Winner production has declined for three launch cohorts (${last3.map((m) => `${m.cohort} ${pct(m.rate as number)}`).join(" → ")}).`,
        status: "FACT",
        tone: "fix",
        evidence: "Winners ÷ eligible creatives per launch month.",
      });
    } else if (r[0] < r[1] && r[1] < r[2]) {
      story.push({
        text: `Winner hit rate improved for three launch cohorts (${last3.map((m) => `${m.cohort} ${pct(m.rate as number)}`).join(" → ")}).`,
        status: "FACT",
        tone: "good",
        evidence: "Winners ÷ eligible creatives per launch month.",
      });
    }
  }
  const c7 = sumMetrics(active.map((c) => c.c7));
  const p7 = sumMetrics(active.map((c) => c.p7));
  const ch = (a: number | null, b: number | null) => (a !== null && b ? a / b - 1 : null);
  const ctrCh = ch(c7.ctr, p7.ctr);
  const roasCh = ch(c7.roas, p7.roas);
  const cvrCh = ch(c7.cvr, p7.cvr);
  if (ctrCh !== null && roasCh !== null && Math.abs(ctrCh) < 0.08 && roasCh <= -0.12) {
    story.push({
      text: `Attention remains healthy (CTR ${signed(ctrCh)}), but conversion economics are deteriorating (ROAS ${signed(roasCh)}${cvrCh !== null ? `, CVR ${signed(cvrCh)}` : ""}).`,
      status: "FACT",
      tone: "fix",
      evidence: "Last 7D vs previous 7D, all active creatives.",
    });
  } else if (roasCh !== null && Math.abs(roasCh) >= 0.1) {
    story.push({
      text: `Portfolio ROAS ${signed(roasCh)} over the last 7 days vs the previous 7 days.`,
      status: "FACT",
      tone: roasCh > 0 ? "good" : "watch",
      evidence: "Platform-attributed revenue ÷ spend, all active creatives.",
    });
  }
  const fresh30 = freshness.find((f) => f.days === 30)!.spendShare;
  story.push({
    text: `${pct(fresh30)} of spend is on creatives launched in the last 30 days.`,
    status: "FACT",
    tone: fresh30 < 0.15 ? "watch" : "neutral",
    evidence: `Freshness window; median active creative age ${ages.median === null ? "n/a" : Math.round(ages.median)} days.`,
  });

  // ---------------------------------------------------------------- opportunities
  const opportunities: Opportunity[] = [];
  const cur = ctx.currency;
  const scale = active.filter((c) => c.classification === "SCALE_CANDIDATE").sort((a, b) => b.commercialScore - a.commercialScore);
  for (const c of scale.slice(0, 2)) {
    const eb = c.scale.earnedBudget;
    opportunities.push({
      kind: "Underfunded Winner",
      title: c.meta.creativeName,
      creativeKey: c.key,
      evidence: `${c.window.roas?.toFixed(2)}x ROAS (${signed((c.econ.roasRatio ?? 1) - 1)} vs target) on ${c.window.purchases} purchases with ${pct(c.volume.spendShare, 1)} of spend. Scale evidence: ${c.scale.evidence.replace(/_/g, " ").toLowerCase()}.`,
      potential: eb
        ? `Earned budget ≈ ${cur} ${Math.round(eb.earnedWeeklySpend).toLocaleString("en-US")}/week vs ${Math.round(eb.currentWeeklySpend).toLocaleString("en-US")} now (PLANNING ESTIMATE).`
        : "Headroom to earn budget in controlled steps.",
      risk: c.scale.evidence === "SCALE_UNTESTED" ? "Never tested at higher spend — efficiency may decay." : c.scale.text,
      action: "Controlled scale test; stop on CPO guardrail breach.",
    });
  }
  for (const c of active.filter((x) => x.classification === "HIDDEN_WINNER").slice(0, 1)) {
    opportunities.push({
      kind: "Hidden Winner",
      title: c.meta.creativeName,
      creativeKey: c.key,
      evidence: `${c.window.roas?.toFixed(2)}x ROAS, ${c.window.purchases} purchases, CVR ${pct(c.window.cvr ?? 0, 2)} — but hook ${c.attention.hookPct !== null ? `bottom ${Math.round(c.attention.hookPct * 100)}%` : "UNAVAILABLE"}.`,
      potential: "A stronger opening can lift reach at the same conversion quality.",
      risk: "New hooks may change the audience that arrives.",
      action: "Keep the conversion core; test 3 new hooks.",
    });
  }
  for (const c of active.filter((x) => x.classification === "EMERGING_WINNER").sort((a, b) => b.commercialScore - a.commercialScore).slice(0, 1)) {
    opportunities.push({
      kind: "New Emerging Winner",
      title: c.meta.creativeName,
      creativeKey: c.key,
      evidence: `${c.daysLive} days live, ${c.window.roas?.toFixed(2)}x ROAS, purchases ${signed(c.trend.purchases7dChange ?? 0)} week over week.`,
      potential: "Next replacement for aging winners.",
      risk: `${c.evidence.level} evidence — still confirming.`,
      action: "Test scale gradually; brief variants.",
    });
  }
  const topCreator = groups.creator.filter((g) => !g.sampleWarning && g.value !== "(untagged)" && (g.winnerRate ?? 0) > (hitRate.current ?? 0) * 1.3).sort((a, b) => (b.winnerRate ?? 0) - (a.winnerRate ?? 0))[0];
  if (topCreator) {
    opportunities.push({
      kind: "High-performing Creator",
      title: topCreator.value,
      creativeKey: null,
      evidence: `${pct(topCreator.winnerRate ?? 0)} winner rate across ${topCreator.eligible} eligible creatives vs ${pct(hitRate.current ?? 0)} account.`,
      potential: "Associated with a higher hit rate in this account/sample.",
      risk: "Association, not causation; check concept mix.",
      action: "Brief more concepts with this creator.",
    });
  }
  const topConcept = groups.concept.filter((g) => !g.sampleWarning && g.value !== "(untagged)" && (g.winnerRate ?? 0) > (hitRate.current ?? 0) * 1.3).sort((a, b) => (b.winnerRate ?? 0) - (a.winnerRate ?? 0))[0];
  if (topConcept) {
    opportunities.push({
      kind: "Winning Concept",
      title: topConcept.value,
      creativeKey: null,
      evidence: `${pct(topConcept.winnerRate ?? 0)} winner rate, ${topConcept.metrics.roas?.toFixed(2)}x ROAS, ${topConcept.metrics.purchases} purchases.`,
      potential: "More variants on a concept associated with winners.",
      risk: "Concept fatigue if overproduced.",
      action: "Produce new variants (new hooks, creators) on this concept.",
    });
  }
  for (const c of active.filter((x) => x.classification === "HOOK_OPPORTUNITY").slice(0, 1)) {
    opportunities.push({
      kind: "Hook Opportunity",
      title: c.meta.creativeName,
      creativeKey: c.key,
      evidence: `${c.window.roas?.toFixed(2)}x ROAS with weak opening attention.`,
      potential: "Better hook could unlock volume.",
      risk: `${c.evidence.level} evidence.`,
      action: "Test new first 3 seconds.",
    });
  }
  for (const c of active.filter((x) => x.classification === "PROVEN_WINNER" && x.flags.includes("SCALE_TOLERANT") && x.decision === "CONTROLLED_SCALE").slice(0, 1)) {
    opportunities.push({
      kind: "Scale-Tolerant Creative",
      title: c.meta.creativeName,
      creativeKey: c.key,
      evidence: `${c.scale.text} ${c.scale.response.status === "DIRECTIONAL_SCALE_RESPONSE" ? c.scale.response.text : ""}`.trim(),
      potential: c.scale.earnedBudget ? `Earned budget multiple ${c.scale.earnedBudget.multiple.toFixed(2)}× (PLANNING ESTIMATE).` : "Has absorbed past spend increases.",
      risk: "Past scale tolerance does not guarantee future tolerance.",
      action: "Controlled scale step.",
    });
  }

  // ---------------------------------------------------------------- waste
  const waste: WasteItem[] = [];
  for (const c of [...all].filter((x) => x.decisionReadyWaste > 0).sort((a, b) => b.decisionReadyWaste - a.decisionReadyWaste).slice(0, 5)) {
    waste.push({
      kind: "Post-evidence loser spend",
      title: c.meta.creativeName,
      creativeKey: c.key,
      amount: c.decisionReadyWaste,
      evidence: `Decision-ready for KILL/CUT since ${c.milestones.killReadyDate}; ${cur} ${Math.round(c.learningSpend).toLocaleString("en-US")} before that was learning spend (not waste).`,
      action: c.window.spend > 0 ? "Stop spend now." : "Already stopped — record the learning.",
    });
  }
  for (const c of active.filter((x) => x.classification === "FATIGUED_WINNER" && x.c7.spend > 0).sort((a, b) => b.c7.spend - a.c7.spend).slice(0, 3)) {
    waste.push({
      kind: "Fatigued winner still spending",
      title: c.meta.creativeName,
      creativeKey: c.key,
      amount: c.fatigue.spendAtRisk,
      evidence: c.fatigue.text,
      action: "Refresh and shift budget to replacements.",
    });
  }
  for (const c of active.filter((x) => x.classification === "TRACKING_RISK").sort((a, b) => b.window.spend - a.window.spend).slice(0, 3)) {
    waste.push({
      kind: "Tracking-risk creative consuming budget",
      title: c.meta.creativeName,
      creativeKey: c.key,
      amount: c.window.spend,
      evidence: c.tracking.flags.map((f) => f.text).join(" "),
      action: "Validate measurement before deciding.",
    });
  }
  const wasteTotal = decisionReadyWaste;

  return {
    counts,
    totalCreatives: all.length,
    activeCreatives: active.length,
    eligibleCreatives: eligible.length,
    totals,
    comparisonTotals,
    shares,
    decisionReadyWaste,
    learningSpend,
    concentration,
    purchaseDependence,
    freshness,
    ages,
    hitRate,
    story,
    opportunities,
    waste,
    wasteTotal,
  };
}

export function sumMetrics(list: Metrics[]): Metrics {
  // Re-aggregating finished metrics: sums are exact, ratios recomputed from sums.
  const s = (k: keyof Metrics) => {
    let any = false;
    let t = 0;
    for (const m of list) {
      const v = m[k];
      if (typeof v === "number") {
        any = true;
        t += v;
      }
    }
    return any ? t : null;
  };
  const spend = s("spend") ?? 0;
  const impressions = s("impressions");
  const clicks = s("clicks");
  const purchases = s("purchases");
  const value = s("purchaseValue");
  const w = (k: "ctr" | "cvr" | "hookRate" | "holdRate", den: "impressions" | "clicks") => {
    let num = 0;
    let d = 0;
    for (const m of list) {
      const v = m[k];
      const dd = k === "cvr" ? (m.cvr !== null && m.purchases !== null && m.cvr > 0 ? m.purchases / m.cvr : null) : m[den];
      if (v !== null && dd !== null && dd > 0) {
        num += v * dd;
        d += dd;
      }
    }
    return d > 0 ? num / d : null;
  };
  return {
    spend,
    impressions,
    reach: s("reach"),
    clicks,
    outboundClicks: s("outboundClicks"),
    landingPageViews: s("landingPageViews"),
    addToCart: s("addToCart"),
    checkouts: s("checkouts"),
    purchases,
    purchaseValue: value,
    roas: value !== null && spend > 0 ? value / spend : null,
    cpo: purchases ? spend / purchases : null,
    cpc: clicks ? spend / clicks : null,
    cpm: impressions ? (spend / impressions) * 1000 : null,
    ctr: w("ctr", "impressions"),
    cvr: w("cvr", "clicks"),
    aov: purchases && value !== null ? value / purchases : null,
    hookRate: w("hookRate", "impressions"),
    holdRate: w("holdRate", "impressions"),
    frequency: null,
    video1s: s("video1s"),
    video3s: s("video3s"),
    video25: s("video25"),
    video50: s("video50"),
    video75: s("video75"),
    video100: s("video100"),
    activeDays: 0,
    valueGap: list.some((m) => m.valueGap),
    currencyMismatch: list.some((m) => m.currencyMismatch),
  };
}

function signed(v: number): string {
  return `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`;
}

export type { Reason };
