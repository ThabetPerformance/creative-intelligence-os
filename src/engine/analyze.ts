import {
  addAgg,
  chooseDefinitions,
  CTR_LABEL,
  CVR_LABEL,
  emptyAgg,
  F,
  HOLD_LABEL,
  HOOK_LABEL,
  metricsFromAgg,
  safeDiv,
  type Definitions,
  type Metrics,
} from "./metrics";
import { CreativeSeries } from "./series";
import { addDays, diffDays, monthKey, previousEqualWindow, toDayNumber, fromDayNumber, windowDays, type DateWindow } from "./dates";
import { evidenceSpendThreshold, resolveTarget } from "./targets";
import { evidenceGate } from "./evidence";
import { configFor, tierAtLeast, type EngineConfig } from "./econ";
import { analyzePeaks } from "./peaks";
import { analyzeScale } from "./scale";
import { analyzeFatigue } from "./fatigue";
import { measurementGate } from "./tracking";
import { buildLifecycle, decisionReadyWaste, learningSpend, scanMilestones } from "./history";
import { classifyCreative, commercialValueScore, trendFrom, type AttentionContext, type VolumeContext } from "./classify";
import { median, percentileRank, sortedNumbers } from "./stats";
import { groupBy, type GroupRow } from "./groups";
import { buildPortfolio, sumMetrics, type Portfolio } from "./portfolio";
import { performanceShifts, type ShiftEntry, type ShiftKind } from "./shifts";
import { buildPlan, type CapacityEstimate, type LearningRef, type PlanItem, type ReplacementRisk } from "./planner";
import type { AnalysisContext, CreativeAnalysis, HookMatrixCell, RankInfo, VideoDropoff } from "./model";
import type { AccountSettingsInput, CreativeEventInput, CreativeInput, LifecycleStage, TargetRegime } from "./types";

export type ComparisonKind = "prev" | "prev7" | "prev14" | "prev30" | "prevMonth" | "prevYear" | "best" | "cohort" | "custom" | "none";

export interface AnalyzeInput {
  accountId: string;
  currency: string;
  settings: AccountSettingsInput;
  regimes: TargetRegime[];
  creatives: CreativeInput[];
  events: CreativeEventInput[];
  learnings?: LearningRef[];
  window: DateWindow;
  asOf: string;
  comparison: ComparisonKind;
  customComparison?: DateWindow | null;
  /** Skip portfolio-level extras (used by historical snapshot reconstruction). */
  light?: boolean;
}

export interface AnalysisResult {
  ctx: AnalysisContext;
  config: EngineConfig;
  creatives: CreativeAnalysis[];
  portfolio: Portfolio;
  shifts: Record<ShiftKind, ShiftEntry[]>;
  groups: { creator: GroupRow[]; concept: GroupRow[]; format: GroupRow[]; hookTactic: GroupRow[]; angle: GroupRow[] };
  plan: { items: PlanItem[]; capacity: CapacityEstimate; replacement: ReplacementRisk };
  baselines: Record<string, PlatformBaseline>;
  timingMs: number;
}

export interface PlatformBaseline {
  scope: string;
  n: number;
  hook: number[];
  hold: number[];
  ctr: number[];
  cvr: number[];
  cpc: number[];
  aov: number[];
  stages: Record<string, number[]>;
}

export function resolveComparisonWindow(kind: ComparisonKind, w: DateWindow, custom?: DateWindow | null): DateWindow | null {
  const before = (len: number): DateWindow => ({ from: addDays(w.from, -len), to: addDays(w.from, -1) });
  switch (kind) {
    case "prev":
      return previousEqualWindow(w);
    case "prev7":
      return before(7);
    case "prev14":
      return before(14);
    case "prev30":
      return before(30);
    case "prevMonth": {
      const shift = (iso: string) => {
        const d = new Date(iso + "T00:00:00Z");
        d.setUTCMonth(d.getUTCMonth() - 1);
        return d.toISOString().slice(0, 10);
      };
      return { from: shift(w.from), to: shift(w.to) };
    }
    case "prevYear":
      return { from: addDays(w.from, -364), to: addDays(w.to, -364) };
    case "custom":
      return custom ?? null;
    default:
      return null;
  }
}

const STAGES: { key: string; label: string; num: number; den: number }[] = [
  { key: "hook", label: "Impression → 3s", num: F.v3s, den: F.imprV3 },
  { key: "post", label: "3s → 25%", num: F.v25, den: F.v3s },
  { key: "mid1", label: "25% → 50%", num: F.v50, den: F.v25 },
  { key: "mid2", label: "50% → 75%", num: F.v75, den: F.v50 },
  { key: "end", label: "75% → 100%", num: F.v100, den: F.v75 },
];

interface Partial1 {
  input: CreativeInput;
  series: CreativeSeries;
  launch: string;
  windowAgg: Float64Array;
  win: Metrics;
  comparison: Metrics | null;
  c7: Metrics;
  p7: Metrics;
  c14: Metrics;
  p14: Metrics;
  lifetime: Metrics;
  ms: ReturnType<typeof scanMilestones>;
  peaks: ReturnType<typeof analyzePeaks>;
  scale: ReturnType<typeof analyzeScale>;
  fatigue: ReturnType<typeof analyzeFatigue>;
  tracking: ReturnType<typeof measurementGate>;
  daysLive: number;
  events: CreativeEventInput[];
}

/**
 * Full analysis of an account for a window ending at asOf. Pure function: no I/O.
 * DATA → DIAGNOSIS → DECISION happens here; persistence and presentation live elsewhere.
 */
export function analyzeAccount(input: AnalyzeInput): AnalysisResult {
  const t0 = Date.now();
  const { settings, regimes, asOf } = input;
  const cfg = configFor(settings.fatigueSensitivity);
  const window: DateWindow = { from: input.window.from, to: input.window.to > asOf ? asOf : input.window.to };
  const target = resolveTarget(asOf, regimes, settings);
  const evidenceSpend = evidenceSpendThreshold(settings, target);
  const thresholds = { minPurchases: settings.minPurchases, evidenceSpend, minDaysLive: settings.minDaysLive };
  const asOfDay = toDayNumber(asOf);

  const eventsByKey = new Map<string, CreativeEventInput[]>();
  for (const e of input.events) {
    const k = e.creativeKey ?? "";
    if (!eventsByKey.has(k)) eventsByKey.set(k, []);
    eventsByKey.get(k)!.push(e);
  }

  // ---- account-level definitions (one per account, never silently switched)
  const seriesList: { input: CreativeInput; series: CreativeSeries }[] = [];
  const totalAgg = emptyAgg();
  let dataStart: string | null = null;
  let dataThrough: string | null = null;
  for (const c of input.creatives) {
    const s = new CreativeSeries(c.rows);
    seriesList.push({ input: c, series: s });
    if (s.length === 0) continue;
    addAgg(totalAgg, s.agg({ from: "1900-01-01", to: asOf }));
    const f = s.firstDate!;
    const l = s.lastDate!;
    if (!dataStart || f < dataStart) dataStart = f;
    if (!dataThrough || l > dataThrough) dataThrough = l;
  }
  const defs: Definitions = chooseDefinitions(totalAgg);
  const cvrNum = defs.cvr === "LPV" ? F.purchLpv : defs.cvr === "OUTBOUND" ? F.purchOut : F.purchClk;
  const cvrDen = defs.cvr === "LPV" ? F.lpv : defs.cvr === "OUTBOUND" ? F.outbound : F.clicks;
  const compWindow = resolveComparisonWindow(input.comparison, window, input.customComparison);

  const ctx: AnalysisContext = {
    accountId: input.accountId,
    currency: input.currency,
    asOf,
    dataStart,
    dataThrough,
    window,
    comparisonWindow: compWindow,
    comparisonKind: input.comparison,
    target,
    evidenceSpend,
    minPurchases: settings.minPurchases,
    minDaysLive: settings.minDaysLive,
    freshnessWindowDays: settings.freshnessWindowDays,
    definitions: defs,
    labels: { cvr: CVR_LABEL[defs.cvr], ctr: CTR_LABEL[defs.ctr], hook: HOOK_LABEL[defs.hook], hold: HOLD_LABEL[defs.hold] },
  };

  // ---- pass 1: per-creative facts
  const parts: Partial1[] = [];
  const m = (s: CreativeSeries, from: number, to: number) => metricsFromAgg(s.aggDays(from, to), defs);
  for (const { input: ci, series: s } of seriesList) {
    const first = s.firstSpendDate();
    if (!first || first > asOf) continue;
    const launch = ci.meta.launchDate && ci.meta.launchDate <= first ? ci.meta.launchDate : first;
    const events = eventsByKey.get(ci.meta.key) ?? [];
    const windowAgg = s.agg(window);
    const win = metricsFromAgg(windowAgg, defs);
    let comparison: Metrics | null = null;
    if (compWindow) comparison = metricsFromAgg(s.agg(compWindow), defs);
    const c7 = m(s, asOfDay - 6, asOfDay);
    const p7 = m(s, asOfDay - 13, asOfDay - 7);
    const c14 = m(s, asOfDay - 13, asOfDay);
    const p14 = m(s, asOfDay - 27, asOfDay - 14);
    const lifetime = m(s, toDayNumber(launch), asOfDay);
    const ms = scanMilestones(s, launch, asOf, settings, regimes, cfg, events);
    const peaks = analyzePeaks(s, asOf, evidenceSpend, cvrDen, cvrNum);
    const scale = analyzeScale(s, asOf, evidenceSpend, target.targetRoas, cvrNum, cvrDen, cfg.scaleStepPct);
    const wasWinner = !!ms.firstWinnerDate && ms.firstWinnerDate <= addDays(asOf, -7);
    const fatigue = analyzeFatigue(s, {
      asOf,
      wasWinner,
      evidenceSpend,
      minPurchases: settings.minPurchases,
      targetRoas: target.targetRoas,
      factor: cfg.fatigueFactor,
      defs,
      peaks,
      events,
      winnerSince: ms.firstWinnerDate,
    });
    const tracking = measurementGate(win, c7, lifetime, evidenceSpend, events, window);
    if (input.comparison === "best") {
      const len = windowDays(window);
      let best: Metrics | null = null;
      for (let d = toDayNumber(launch) + len - 1; d <= asOfDay - len; d += Math.max(1, Math.floor(len / 7))) {
        const mm = m(s, d - len + 1, d);
        if (mm.spend >= evidenceSpend * 0.5 && mm.roas !== null && (!best || (best.roas ?? 0) < mm.roas)) best = mm;
      }
      comparison = best;
    }
    parts.push({ input: ci, series: s, launch, windowAgg, win, comparison, c7, p7, c14, p14, lifetime, ms, peaks, scale, fatigue, tracking, daysLive: diffDays(asOf, launch) + 1, events });
  }

  // ---- baselines per platform (stable sample) with account fallback
  const pool = (list: Partial1[], scope: string): PlatformBaseline => {
    const stable = list.filter((p) => p.win.spend >= evidenceSpend * 0.5);
    const stages: Record<string, number[]> = {};
    for (const st of STAGES) stages[st.key] = sortedNumbers(stable.map((p) => safeDiv(p.windowAgg[st.num], p.windowAgg[st.den])));
    return {
      scope,
      n: stable.length,
      hook: sortedNumbers(stable.map((p) => p.win.hookRate)),
      hold: sortedNumbers(stable.map((p) => p.win.holdRate)),
      ctr: sortedNumbers(stable.map((p) => p.win.ctr)),
      cvr: sortedNumbers(stable.map((p) => p.win.cvr)),
      cpc: sortedNumbers(stable.map((p) => p.win.cpc)),
      aov: sortedNumbers(stable.map((p) => p.win.aov)),
      stages,
    };
  };
  const activeParts = parts.filter((p) => p.win.spend > 0);
  const accountBaseline = pool(activeParts, "account");
  const baselines: Record<string, PlatformBaseline> = { __account: accountBaseline };
  const platforms = [...new Set(activeParts.map((p) => p.input.meta.platform))];
  for (const pl of platforms) {
    const b = pool(
      activeParts.filter((p) => p.input.meta.platform === pl),
      `${pl} creatives`,
    );
    baselines[pl] = b.n >= 8 ? b : { ...accountBaseline, scope: `account (too few ${pl} creatives for a platform baseline)` };
  }

  // ---- volume context
  const totalSpend = activeParts.reduce((s, p) => s + p.win.spend, 0);
  const totalPurch = activeParts.reduce((s, p) => s + (p.win.purchases ?? 0), 0);
  const evid = new Map<Partial1, ReturnType<typeof evidenceGate>>();
  for (const p of parts) evid.set(p, evidenceGate({ purchases: p.win.purchases, spend: p.win.spend, daysLive: p.daysLive }, thresholds));
  const eligible = activeParts.filter((p) => evid.get(p)!.level !== "LOW");
  const eligiblePurch = sortedNumbers(eligible.map((p) => p.win.purchases ?? 0));
  const accountMedianRoas = median(activeParts.filter((p) => evid.get(p)!.level === "HIGH" && !p.tracking.roasUnreliable).map((p) => p.win.roas));

  // ---- ranks: current window, previous (shifted 7d), weekly trailing-28D history
  const len = windowDays(window);
  const scoreFor = (s: CreativeSeries, from: number, to: number, t: { targetRoas: number }, ev: number) => {
    const spend = s.sumField(F.spend, from, to);
    if (spend <= 0) return null;
    const p = s.sumField(F.purchases, from, to);
    const v = s.sumField(F.value, from, to);
    const lvl = p >= settings.minPurchases && spend >= ev ? "HIGH" : p >= settings.minPurchases || spend >= ev ? "MEDIUM" : "LOW";
    if (lvl === "LOW") return null;
    return commercialValueScore(p, v / spend / t.targetRoas, lvl);
  };
  const rankOf = (scores: (number | null)[]) => {
    const idx = scores.map((s, i) => ({ s, i })).filter((x) => x.s !== null) as { s: number; i: number }[];
    idx.sort((a, b) => b.s - a.s);
    const r: (number | null)[] = scores.map(() => null);
    idx.forEach((x, k) => (r[x.i] = k + 1));
    return r;
  };
  const wFrom = toDayNumber(window.from);
  const wTo = toDayNumber(window.to);
  const curRanks = rankOf(parts.map((p) => scoreFor(p.series, wFrom, wTo, target, evidenceSpend)));
  const prevRanks = rankOf(parts.map((p) => scoreFor(p.series, wFrom - 7, wTo - 7, target, evidenceSpend)));
  const weekly: { end: string; ranks: (number | null)[] }[] = [];
  if (!input.light) {
    for (let k = 25; k >= 0; k--) {
      const end = asOfDay - 7 * k;
      const endIso = fromDayNumber(end);
      if (dataStart && endIso < dataStart) continue;
      const t = resolveTarget(endIso, regimes, settings);
      const ev = evidenceSpendThreshold(settings, t);
      weekly.push({ end: endIso, ranks: rankOf(parts.map((p) => scoreFor(p.series, end - 27, end, t, ev))) });
    }
  }
  void len;

  // ---- pass 2: classify
  const creatives: CreativeAnalysis[] = [];
  parts.forEach((p, idx) => {
    const meta = p.input.meta;
    const base = baselines[meta.platform] ?? accountBaseline;
    const pr = (arr: number[], v: number | null) => (arr.length >= 5 ? percentileRank(arr, v) : null);
    const hookPct = pr(base.hook, p.win.hookRate);
    const ctrPct = pr(base.ctr, p.win.ctr);
    const holdPct = pr(base.hold, p.win.holdRate);
    const att = [hookPct, ctrPct, holdPct].filter((v): v is number => v !== null);
    const attention: AttentionContext = {
      hookPct,
      holdPct,
      ctrPct,
      cvrPct: pr(base.cvr, p.win.cvr),
      cpcPct: pr(base.cpc, p.win.cpc),
      aovPct: pr(base.aov, p.win.aov),
      composite: att.length ? att.reduce((s, v) => s + v, 0) / att.length : null,
      baselineScope: base.scope,
      medianCvr: median(base.cvr),
      medianHook: median(base.hook),
      medianCtr: median(base.ctr),
    };
    const E = evid.get(p)!;
    const purchasePct = E.level !== "LOW" ? percentileRank(eligiblePurch, p.win.purchases ?? 0) : null;
    const spendShare = totalSpend > 0 ? p.win.spend / totalSpend : 0;
    const purchaseShare = totalPurch > 0 ? (p.win.purchases ?? 0) / totalPurch : 0;
    const volTier: VolumeContext["tier"] =
      E.level !== "LOW" && (p.win.purchases ?? 0) >= 2 * settings.minPurchases && (purchaseShare >= cfg.volumeShareHigh || (purchasePct ?? 0) >= cfg.volumePctHigh)
        ? "HIGH"
        : (purchasePct ?? 0) >= 0.5
          ? "MEDIUM"
          : "LOW";
    const volume: VolumeContext = { spendShare, purchaseShare, purchasePct, tier: volTier, eligibleCount: eligible.length, accountMedianRoas };
    const lifetimeEvidence = evidenceGate({ purchases: p.lifetime.purchases, spend: p.lifetime.spend, daysLive: p.daysLive }, thresholds);
    const trend = trendFrom(p.c7, p.p7, p.c14, p.p14, evidenceSpend);
    const res = classifyCreative({
      win: p.win,
      c7: p.c7,
      p7: p.p7,
      c14: p.c14,
      p14: p.p14,
      lifetime: p.lifetime,
      daysLive: p.daysLive,
      target,
      evidenceSpend,
      minPurchases: settings.minPurchases,
      minDaysLive: settings.minDaysLive,
      freshnessWindowDays: settings.freshnessWindowDays,
      evidence: E,
      lifetimeEvidence,
      tracking: p.tracking,
      fatigue: p.fatigue,
      scale: p.scale,
      milestones: p.ms,
      attention,
      volume,
      trend,
      asOf,
      currency: input.currency,
      cvrLabel: ctx.labels.cvr,
      cfg,
    });
    const lifecycle = buildLifecycle(p.ms, asOf, p.events, settings.minDaysLive);
    let stage: LifecycleStage = lifecycle.length ? lifecycle[lifecycle.length - 1].stage : "NEW";
    if (res.classification === "FATIGUED_WINNER") stage = "FATIGUED";
    else if (res.classification === "FATIGUE_WATCH" && stage !== "FATIGUED") stage = "FATIGUE_WATCH";

    // rank info
    let peak: number | null = null;
    let weeksTop10 = 0;
    let firstTop10: string | null = null;
    let lastTop10: string | null = null;
    for (const w of weekly) {
      const r = w.ranks[idx];
      if (r === null) continue;
      if (peak === null || r < peak) peak = r;
      if (r <= 10) {
        weeksTop10++;
        if (!firstTop10) firstTop10 = w.end;
        lastTop10 = w.end;
      }
    }
    const rank: RankInfo = { current: curRanks[idx], previous: prevRanks[idx], peak: peak ?? curRanks[idx], weeksInTop10: weeksTop10, firstTop10, lastTop10 };

    // hook × business matrix
    let hookMatrix: HookMatrixCell | null = null;
    if (hookPct !== null && E.level !== "LOW" && !p.tracking.roasUnreliable) {
      const hookHigh = hookPct >= 0.6;
      const convHigh = tierAtLeast(res.econ.tier, "ACCEPTABLE");
      hookMatrix = hookHigh && convHigh ? "TRUE_WINNING_HOOK" : hookHigh ? "ATTENTION_TRAP" : convHigh ? "HOOK_OPPORTUNITY" : "WEAK";
    }
    const video = videoDropoff(p.windowAgg, base, ctrPct);

    const { killReadyDays, ...msRest } = p.ms;
    creatives.push({
      key: meta.key,
      meta,
      activeInWindow: p.win.spend > 0,
      windowAgg: p.windowAgg,
      window: p.win,
      comparison: p.comparison,
      c7: p.c7,
      p7: p.p7,
      c14: p.c14,
      lifetime: p.lifetime,
      daysLive: p.daysLive,
      ageDays: p.daysLive - 1,
      launchDate: p.launch,
      evidence: E,
      lifetimeEvidence,
      econ: res.econ,
      classification: res.classification,
      decision: res.decision,
      confidence: res.confidence,
      flags: res.flags,
      reasons: res.reasons,
      diagnosis: res.diagnosis,
      trend,
      fatigue: p.fatigue,
      peaks: p.peaks,
      scale: p.scale,
      tracking: p.tracking,
      milestones: msRest,
      lifecycleStage: stage,
      lifecycle,
      attention,
      volume,
      decisionReadyWaste: decisionReadyWaste(p.series, p.ms, window.from, window.to),
      learningSpend: learningSpend(p.series, p.ms, window.from, window.to),
      priorityScore: res.priorityScore,
      commercialScore: res.commercialScore,
      rank,
      hookMatrix,
      video,
      roasVsTarget: res.econ.roasRatio === null ? null : res.econ.roasRatio - 1,
      cpoVsGuardrail: res.econ.cpoRatio === null || res.econ.cpoLowerBound ? null : res.econ.cpoRatio - 1,
    });
    void killReadyDays;
  });

  // launch-cohort baseline comparison (creative-level)
  if (input.comparison === "cohort") {
    const byMonth = new Map<string, CreativeAnalysis[]>();
    for (const c of creatives) {
      if (!c.launchDate) continue;
      const k = monthKey(c.launchDate);
      if (!byMonth.has(k)) byMonth.set(k, []);
      byMonth.get(k)!.push(c);
    }
    for (const c of creatives) {
      const peers = (byMonth.get(c.launchDate ? monthKey(c.launchDate) : "") ?? []).filter((x) => x.key !== c.key && x.activeInWindow);
      c.comparison = peers.length ? sumMetrics(peers.map((x) => x.window)) : null;
    }
  }

  const accountWinnerRate = (() => {
    const el = creatives.filter((c) => c.activeInWindow && c.evidence.level !== "LOW");
    return el.length ? el.filter((c) => ["PROVEN_WINNER", "SCALE_CANDIDATE", "VOLUME_WINNER", "HIDDEN_WINNER"].includes(c.classification)).length / el.length : null;
  })();
  const accountRoas = totalSpend > 0 ? activeParts.reduce((s, p) => s + (p.win.purchaseValue ?? 0), 0) / totalSpend : null;
  const groups = {
    creator: groupBy(creatives, "creator", defs, accountWinnerRate, accountRoas),
    concept: groupBy(creatives, "concept", defs, accountWinnerRate, accountRoas),
    format: groupBy(creatives, "format", defs, accountWinnerRate, accountRoas),
    hookTactic: groupBy(creatives, "hookTactic", defs, accountWinnerRate, accountRoas),
    angle: groupBy(creatives, "angle", defs, accountWinnerRate, accountRoas),
  };
  const portfolio = buildPortfolio(creatives, ctx, groups);
  const shifts = performanceShifts(creatives, ctx, cfg);
  const plan = buildPlan(creatives, ctx, portfolio, groups, input.learnings ?? []);
  return { ctx, config: cfg, creatives, portfolio, shifts, groups, plan, baselines, timingMs: Date.now() - t0 };
}

function videoDropoff(a: Float64Array, base: PlatformBaseline, ctrPct: number | null): VideoDropoff | null {
  if (a[F.nV3s] === 0) return null;
  const stages = STAGES.map((st) => ({
    key: st.key,
    label: st.label,
    rate: safeDiv(a[st.num], a[st.den]),
    platformMedian: median(base.stages[st.key] ?? []),
  }));
  let weakest: VideoDropoff["weakestStage"] = null;
  let worst = Infinity;
  for (const st of stages) {
    if (st.rate === null || !st.platformMedian) continue;
    const rel = st.rate / st.platformMedian;
    if (rel < worst) {
      worst = rel;
      weakest = st.key === "hook" ? "WEAK_OPENING" : st.key === "post" ? "POST_HOOK_DROP" : st.key === "end" ? "CTA_DROP" : "MID_VIDEO_DROP";
    }
  }
  const end = stages[stages.length - 1];
  if (end.rate !== null && end.platformMedian && end.rate >= end.platformMedian && ctrPct !== null && ctrPct <= 0.35) weakest = "CTA_DROP";
  if (worst >= 0.95 && weakest !== "CTA_DROP") weakest = null;
  const label: Record<string, string> = {
    WEAK_OPENING: "Weak opening: fewer impressions become 3-second views than the platform norm.",
    POST_HOOK_DROP: "Post-hook drop: viewers leave right after the opening.",
    MID_VIDEO_DROP: "Mid-video drop: retention falls in the body of the video.",
    CTA_DROP: "CTA drop: viewers watch but do not act at the end.",
  };
  return { stages, weakestStage: weakest, text: weakest ? label[weakest] : "Retention is in line with the platform norm at every stage." };
}
