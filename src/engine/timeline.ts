import { F, safeDiv, type Definitions } from "./metrics";
import type { CreativeSeries } from "./series";
import { fromDayNumber, toDayNumber, type DateWindow } from "./dates";
import { median } from "./stats";
import { resolveTarget } from "./targets";
import type { AccountSettingsInput, CreativeEventInput, TargetRegime } from "./types";
import type { Milestones } from "./history";
import type { PeakAnalysis } from "./peaks";

export interface TimelinePoint {
  date: string;
  day: number; // days since launch (Day 0 = launch)
  spend: number;
  impressions: number | null;
  reach: number | null;
  frequency: number | null;
  cpm: number | null;
  clicks: number | null;
  outboundClicks: number | null;
  lpv: number | null;
  ctr: number | null;
  cpc: number | null;
  purchases: number | null;
  purchaseValue: number | null;
  roas: number | null;
  roas3: number | null;
  roas7: number | null;
  cpo: number | null;
  cpo7: number | null;
  cvr: number | null;
  cvr7: number | null;
  aov: number | null;
  purchases7: number | null;
  hookRate: number | null;
  holdRate: number | null;
  video1s: number | null;
  video3s: number | null;
  video25: number | null;
  video50: number | null;
  video75: number | null;
  video100: number | null;
  targetRoas: number;
  cpoGuardrail: number | null;
}

export interface TimelineMarker {
  date: string;
  day: number;
  type: string;
  label: string;
  source: "DERIVED" | "EVENT";
}

export interface TimelinePhase {
  phase: "LAUNCH" | "LEARNING" | "BREAKOUT" | "SCALING" | "STABLE" | "DECAY" | "FATIGUE";
  from: string;
  to: string;
}

export interface Timeline {
  points: TimelinePoint[];
  markers: TimelineMarker[];
  phases: TimelinePhase[];
  creativeMedianCvr: number | null;
  launchDate: string;
}

function cvrPair(defs: Definitions): [number, number] {
  return defs.cvr === "LPV" ? [F.purchLpv, F.lpv] : defs.cvr === "OUTBOUND" ? [F.purchOut, F.outbound] : [F.purchClk, F.clicks];
}

/**
 * Creative timeline (spec §58–67). Every calendar day in range is present; days without delivery
 * carry spend 0 and UNAVAILABLE ratios so pauses are visible. Rolling series are calendar based.
 */
export function buildTimeline(
  s: CreativeSeries,
  range: DateWindow,
  launchDate: string,
  defs: Definitions,
  settings: AccountSettingsInput,
  regimes: TargetRegime[],
  ms: Milestones | Omit<Milestones, "killReadyDays">,
  peaks: PeakAnalysis,
  events: CreativeEventInput[],
): Timeline {
  const launch = toDayNumber(launchDate);
  const a = toDayNumber(range.from);
  const b = toDayNumber(range.to);
  const [cn, cd] = cvrPair(defs);
  const byDay = new Map<number, (typeof s.rows)[number]>();
  for (let i = 0; i < s.rows.length; i++) byDay.set(s.dayNums[i], s.rows[i]);
  const points: TimelinePoint[] = [];
  const dailyCvr: number[] = [];
  for (let d = a; d <= b; d++) {
    const r = byDay.get(d);
    const date = fromDayNumber(d);
    const t = resolveTarget(date, regimes, settings);
    const sp7 = s.sumField(F.spend, d - 6, d);
    const sp3 = s.sumField(F.spend, d - 2, d);
    const p7 = s.sumField(F.purchases, d - 6, d);
    const den7 = s.sumField(cd, d - 6, d);
    const spend = r?.spend ?? 0;
    const purchases = r ? r.purchases : null;
    const value = r ? r.purchaseValue : null;
    const impr = r?.impressions ?? null;
    const clicksBase = defs.ctr === "OUTBOUND" ? (r?.outboundClicks ?? null) : (r?.clicks ?? null);
    const cvrDen = r ? (defs.cvr === "LPV" ? r.landingPageViews : defs.cvr === "OUTBOUND" ? r.outboundClicks : r.clicks) : null;
    const cvr = safeDiv(purchases, cvrDen);
    if (cvr !== null) dailyCvr.push(cvr);
    let hook: number | null = null;
    if (r) hook = defs.hook === "VIDEO_3S_PER_IMPRESSION" ? safeDiv(r.video3s, impr) : r.hookRate;
    let hold: number | null = null;
    if (r) hold = defs.hold === "NATIVE" ? r.holdRate : safeDiv(r.video50, r.video3s);
    points.push({
      date,
      day: d - launch,
      spend,
      impressions: impr,
      reach: r?.reach ?? null,
      frequency: r?.frequency ?? (r && r.reach ? safeDiv(impr, r.reach) : null),
      cpm: impr ? (spend / impr) * 1000 : null,
      clicks: r?.clicks ?? null,
      outboundClicks: r?.outboundClicks ?? null,
      lpv: r?.landingPageViews ?? null,
      ctr: safeDiv(clicksBase, impr),
      cpc: safeDiv(spend, clicksBase),
      purchases,
      purchaseValue: value,
      roas: spend > 0 ? safeDiv(value, spend) : null,
      roas3: sp3 > 0 ? s.sumField(F.value, d - 2, d) / sp3 : null,
      roas7: sp7 > 0 ? s.sumField(F.value, d - 6, d) / sp7 : null,
      cpo: safeDiv(spend, purchases || null),
      cpo7: p7 > 0 ? sp7 / p7 : null,
      cvr,
      cvr7: den7 > 0 ? s.sumField(cn, d - 6, d) / den7 : null,
      aov: safeDiv(value, purchases || null),
      purchases7: s.sumField(F.nPurchases, d - 6, d) > 0 ? p7 : null,
      hookRate: hook,
      holdRate: hold,
      video1s: r?.video1s ?? null,
      video3s: r?.video3s ?? null,
      video25: r?.video25 ?? null,
      video50: r?.video50 ?? null,
      video75: r?.video75 ?? null,
      video100: r?.video100 ?? null,
      targetRoas: t.targetRoas,
      cpoGuardrail: t.cpoGuardrail,
    });
  }

  const markers: TimelineMarker[] = [];
  const add = (date: string | null | undefined, type: string, label: string, source: "DERIVED" | "EVENT" = "DERIVED") => {
    if (!date) return;
    const d = toDayNumber(date);
    if (d < a || d > b) return;
    markers.push({ date, day: d - launch, type, label, source });
  };
  add(launchDate, "LAUNCH", "Launch");
  add(ms.firstPurchaseDate, "FIRST_PURCHASE", "First purchase");
  add(ms.evidenceDate, "EVIDENCE", "Evidence threshold reached");
  add(ms.firstWinnerDate, "FIRST_WINNER", "First winner classification");
  add(ms.firstScaleDate, "FIRST_SCALE", "First scale step");
  add(peaks.best7d?.to, "PEAK", `Peak 7D ROAS ${peaks.best7d?.roas?.toFixed(2) ?? ""}x`);
  add(ms.fatigueWatchDate, "FATIGUE_WATCH", "Fatigue watch");
  add(ms.fatigueDate, "FATIGUE", "Fatigue detected");
  add(ms.killReadyDate, "KILL_READY", "Decision-ready to cut");
  add(ms.retiredDate, "PAUSED", "Paused / retired");
  for (const r of ms.relaunchDates) add(r, "RELAUNCH", "Relaunched");
  // detected budget increases: daily spend ≥ 1.5× trailing 7D average
  for (let d = Math.max(a, launch + 7); d <= b; d++) {
    const today = s.sumField(F.spend, d, d);
    const avg = s.sumField(F.spend, d - 7, d - 1) / 7;
    if (avg > 0 && today >= avg * 1.5 && today - avg >= 20) {
      add(fromDayNumber(d), "BUDGET_INCREASE", `Spend jump ×${(today / avg).toFixed(1)}`);
      d += 6;
    }
  }
  for (const e of events) add(e.date, e.eventType.toUpperCase().replace(/\s+/g, "_"), e.description ? `${e.eventType}: ${e.description}` : e.eventType, "EVENT");
  markers.sort((x, y) => (x.date < y.date ? -1 : 1));

  // descriptive phases
  const cuts: { date: string; phase: TimelinePhase["phase"] }[] = [{ date: launchDate, phase: "LAUNCH" }];
  const plus = (iso: string, n: number) => fromDayNumber(toDayNumber(iso) + n);
  cuts.push({ date: plus(launchDate, 3), phase: "LEARNING" });
  if (ms.firstWinnerDate) cuts.push({ date: ms.firstWinnerDate, phase: "BREAKOUT" });
  else if (ms.emergingDate) cuts.push({ date: ms.emergingDate, phase: "BREAKOUT" });
  if (ms.firstScaleDate) cuts.push({ date: ms.firstScaleDate, phase: "SCALING" });
  const stable = ms.firstScaleDate ? plus(ms.firstScaleDate, 14) : ms.firstWinnerDate ? plus(ms.firstWinnerDate, 14) : null;
  if (stable && (!ms.fatigueWatchDate || stable < ms.fatigueWatchDate)) cuts.push({ date: stable, phase: "STABLE" });
  if (ms.fatigueWatchDate) cuts.push({ date: ms.fatigueWatchDate, phase: "DECAY" });
  if (ms.fatigueDate) cuts.push({ date: ms.fatigueDate, phase: "FATIGUE" });
  cuts.sort((x, y) => (x.date < y.date ? -1 : 1));
  const phases: TimelinePhase[] = [];
  for (let i = 0; i < cuts.length; i++) {
    const from = cuts[i].date;
    const to = i + 1 < cuts.length ? plus(cuts[i + 1].date, -1) : fromDayNumber(b);
    if (to < from) continue;
    const f = from < range.from ? range.from : from;
    const tt = to > range.to ? range.to : to;
    if (tt < f) continue;
    phases.push({ phase: cuts[i].phase, from: f, to: tt });
  }
  return { points, markers, phases, creativeMedianCvr: median(dailyCvr), launchDate };
}
