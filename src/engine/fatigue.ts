import { metricsFromAgg, pctChange, type Definitions, type Metrics, F } from "./metrics";
import type { CreativeSeries } from "./series";
import { addDays, fromDayNumber, toDayNumber } from "./dates";
import { median } from "./stats";
import type { CreativeEventInput, FatigueStatus, Reason } from "./types";
import type { PeakAnalysis } from "./peaks";

export interface FatigueSignals {
  roasVsPrev7: number | null;
  roasVsBest7: number | null;
  roas14VsPrev14: number | null;
  roas30VsNormal: number | null;
  cpoVsPrev7: number | null;
  cpoVsBest7: number | null;
  cvrVsPrev7: number | null;
  ctrVsPrev7: number | null;
  hookVsPrev7: number | null;
  holdVsPrev7: number | null;
  frequencyChange: number | null;
  impressionsChange: number | null;
  purchasesChange: number | null;
  spendChange: number | null;
  /** Current 7D / 14D ROAS vs the creative's own winner-era normal. */
  roas7VsWinnerNormal: number | null;
  roas14VsWinnerNormal: number | null;
  /** Poisson z-score of current-14D purchases vs what winner-era CPO would have produced. */
  purchasesZ14: number | null;
  winnerNormalRoas: number | null;
}

export interface FatigueResult {
  status: FatigueStatus;
  eligible: boolean;
  adequateSample: boolean;
  signals: FatigueSignals;
  startDate: string | null;
  daysInDecline: number | null;
  spendAtRisk: number;
  hypotheses: Reason[];
  facts: Reason[];
  text: string;
}

export interface FatigueParams {
  asOf: string;
  wasWinner: boolean;
  evidenceSpend: number;
  minPurchases: number;
  targetRoas: number;
  factor: number; // sensitivity multiplier on thresholds
  defs: Definitions;
  peaks: PeakAnalysis;
  events: CreativeEventInput[];
  winnerSince: string | null;
}

const notApplicable = (text: string, signals: FatigueSignals): FatigueResult => ({
  status: "NOT_APPLICABLE",
  eligible: false,
  adequateSample: false,
  signals,
  startDate: null,
  daysInDecline: null,
  spendAtRisk: 0,
  hypotheses: [],
  facts: [],
  text,
});

/**
 * Fatigue engine (spec §68–71). A creative can only fatigue if it was historically successful.
 * Compares current 7D vs previous 7D, vs best 7D, current 14D vs previous 14D and current 30D vs
 * the creative's historical normal. Reasons are labelled HYPOTHESIS unless validated.
 */
export function analyzeFatigue(s: CreativeSeries, p: FatigueParams): FatigueResult {
  const end = toDayNumber(p.asOf);
  const m = (from: number, to: number): Metrics => metricsFromAgg(s.aggDays(from, to), p.defs);
  const c7 = m(end - 6, end);
  const p7 = m(end - 13, end - 7);
  const c14 = m(end - 13, end);
  const p14 = m(end - 27, end - 14);
  const c30 = m(end - 29, end);

  // Historical normal: median rolling-7D ROAS before the current 30 days.
  const first = s.firstSpendDate();
  const rolling: number[] = [];
  if (first) {
    for (let d = toDayNumber(first) + 6; d <= end - 30; d++) {
      const sp = s.sumField(F.spend, d - 6, d);
      if (sp >= p.evidenceSpend * 0.5) rolling.push(s.sumField(F.value, d - 6, d) / sp);
    }
  }
  const normal = median(rolling);
  const best7 = p.peaks.best7d;

  // Winner-era normal: what this creative delivered while it was a winner (before the current 14D).
  let eraFrom = p.winnerSince ? toDayNumber(p.winnerSince) : first ? toDayNumber(first) : end;
  let eraSpend = s.sumField(F.spend, eraFrom, end - 14);
  if (eraSpend < p.evidenceSpend && first) {
    eraFrom = toDayNumber(first);
    eraSpend = s.sumField(F.spend, eraFrom, end - 14);
  }
  const eraValue = s.sumField(F.value, eraFrom, end - 14);
  const eraPurch = s.sumField(F.purchases, eraFrom, end - 14);
  const eraRoas = eraSpend > 0 ? eraValue / eraSpend : null;
  const eraCpo = eraPurch > 0 ? eraSpend / eraPurch : null;
  const zScore = (spend: number, purchases: number | null) => {
    if (!eraCpo || purchases === null || spend <= 0) return null;
    const exp = spend / eraCpo;
    return (purchases - exp) / Math.sqrt(Math.max(exp, 1));
  };

  const signals: FatigueSignals = {
    roasVsPrev7: pctChange(c7.roas, p7.roas),
    roasVsBest7: best7?.roas ? pctChange(c7.roas, best7.roas) : null,
    roas14VsPrev14: pctChange(c14.roas, p14.roas),
    roas30VsNormal: pctChange(c30.roas, normal),
    cpoVsPrev7: pctChange(c7.cpo, p7.cpo),
    cpoVsBest7: pctChange(c7.cpo, p.peaks.best7dCpo),
    cvrVsPrev7: pctChange(c7.cvr, p7.cvr),
    ctrVsPrev7: pctChange(c7.ctr, p7.ctr),
    hookVsPrev7: pctChange(c7.hookRate, p7.hookRate),
    holdVsPrev7: pctChange(c7.holdRate, p7.holdRate),
    frequencyChange: pctChange(c7.frequency, p7.frequency),
    impressionsChange: pctChange(c7.impressions, p7.impressions),
    purchasesChange: pctChange(c7.purchases, p7.purchases),
    spendChange: pctChange(c7.spend, p7.spend),
    roas7VsWinnerNormal: pctChange(c7.roas, eraRoas),
    roas14VsWinnerNormal: pctChange(c14.roas, eraRoas),
    purchasesZ14: zScore(c14.spend, c14.purchases),
    winnerNormalRoas: eraRoas,
  };

  if (!p.wasWinner) return notApplicable("Not applicable — this creative was never a winner, so a decline is not fatigue.", signals);
  if (c7.spend <= 0) return notApplicable("No delivery in the last 7 days.", signals);

  const k = p.factor;
  const adequateSample = c7.spend >= p.evidenceSpend * 0.5 && (c7.purchases ?? 0) >= Math.max(3, Math.round(p.minPurchases * 0.3));
  const le = (v: number | null, t: number) => v !== null && v <= t;
  const ge = (v: number | null, t: number) => v !== null && v >= t;

  const supporting = [
    ge(signals.cpoVsPrev7, 0.1 * k) || ge(signals.cpoVsBest7, 0.2 * k),
    le(signals.cvrVsPrev7, -0.1 * k),
    le(signals.ctrVsPrev7, -0.1 * k),
    le(signals.hookVsPrev7, -0.1 * k),
    ge(signals.frequencyChange, 0.15 * k),
    le(signals.purchasesChange, -0.15 * k),
  ].filter(Boolean).length;
  const commercialSupport = ge(signals.cpoVsPrev7, 0.1 * k) || ge(signals.cpoVsBest7, 0.25 * k) || le(signals.cvrVsPrev7, -0.1 * k) || le(signals.purchasesChange, -0.2 * k);

  const c7Ratio = c7.roas !== null && p.targetRoas > 0 ? c7.roas / p.targetRoas : null;
  const recentDecline = le(signals.roasVsPrev7, -0.1 * k) || le(signals.roas14VsPrev14, -0.15 * k) || le(signals.roas30VsNormal, -0.2 * k);

  // Noise-aware rule: a decline only counts when it is large relative to the creative's own
  // winner-era normal AND statistically unlikely from purchase-count noise alone (Poisson z-test).
  const d7 = signals.roas7VsWinnerNormal;
  const d14 = signals.roas14VsWinnerNormal;
  const z = signals.purchasesZ14;
  const zSig = (t: number) => z !== null && z <= t;
  let status: FatigueStatus = "HEALTHY";
  if (le(d7, -0.45 * k) && le(d14, -0.3 * k) && zSig(-2.5) && commercialSupport && c7Ratio !== null && c7Ratio < 0.85) status = "SEVERE";
  else if (le(d7, -0.3 * k) && le(d14, -0.2 * k) && zSig(-2) && (commercialSupport || recentDecline)) status = "MATERIAL";
  else if ((le(d7, -0.2 * k) || le(d14, -0.15 * k)) && zSig(-1.5)) status = "WATCH";
  else if (!adequateSample && le(d7, -0.3 * k) && (le(signals.roasVsPrev7, -0.15 * k) || le(d14, -0.2 * k))) status = "WATCH";
  void supporting;

  // Decline start: the day after the last day rolling-7D ROAS was at a healthy level relative to peak.
  let startDate: string | null = null;
  let daysInDecline: number | null = null;
  if (status !== "HEALTHY" && best7?.roas && eraRoas) {
    const threshold = eraRoas * (1 - 0.15 * k);
    const peakEnd = toDayNumber(best7.to);
    let lastHealthy = peakEnd;
    for (let d = peakEnd + 1; d <= end; d++) {
      const sp = s.sumField(F.spend, d - 6, d);
      if (sp <= 0) continue;
      const r = s.sumField(F.value, d - 6, d) / sp;
      if (r >= threshold) lastHealthy = d;
    }
    if (lastHealthy < end) {
      startDate = fromDayNumber(lastHealthy + 1);
      daysInDecline = end - lastHealthy;
    }
  }

  const facts: Reason[] = [];
  const pc = (v: number | null) => (v === null ? "UNAVAILABLE" : `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`);
  facts.push({ text: `7D ROAS ${pc(signals.roasVsPrev7)} vs previous 7D, ${pc(signals.roasVsBest7)} vs best 7D, ${pc(d7)} vs its winner-era normal (${eraRoas === null ? "n/a" : eraRoas.toFixed(2) + "x"}).`, status: "FACT" });
  if (z !== null) facts.push({ text: `Current 14D purchases are ${z.toFixed(1)} standard deviations from what winner-era CPO predicts.`, status: "FACT" });
  if (signals.cpoVsPrev7 !== null) facts.push({ text: `7D CPO ${pc(signals.cpoVsPrev7)} vs previous 7D.`, status: "FACT" });
  if (signals.cvrVsPrev7 !== null) facts.push({ text: `7D CVR ${pc(signals.cvrVsPrev7)} vs previous 7D.`, status: "FACT" });
  if (signals.frequencyChange !== null) facts.push({ text: `Frequency ${pc(signals.frequencyChange)} vs previous 7D.`, status: "FACT" });

  const hypotheses: Reason[] = [];
  if (status !== "HEALTHY") {
    if (le(signals.hookVsPrev7, -0.1) || le(signals.ctrVsPrev7, -0.1)) hypotheses.push({ text: "Creative wear-out: attention (hook/CTR) is falling alongside efficiency.", status: "HYPOTHESIS" });
    if (ge(signals.frequencyChange, 0.15)) hypotheses.push({ text: "Audience saturation: frequency rose while efficiency fell.", status: "HYPOTHESIS" });
    if (ge(signals.spendChange, 0.4)) hypotheses.push({ text: "Scale decay: spend rose sharply in the same period.", status: "HYPOTHESIS" });
    if (le(signals.cvrVsPrev7, -0.1) && !le(signals.ctrVsPrev7, -0.05)) hypotheses.push({ text: "Traffic-quality, offer or landing change: clicks held but conversion fell.", status: "HYPOTHESIS" });
    const recentFrom = addDays(p.asOf, -21);
    for (const e of p.events) {
      if (e.date < recentFrom || e.date > p.asOf) continue;
      if (/offer/i.test(e.eventType)) hypotheses.push({ text: `Offer change on ${e.date} may explain the shift.`, status: "HYPOTHESIS" });
      if (/landing/i.test(e.eventType)) hypotheses.push({ text: `Landing page change on ${e.date} may explain the shift.`, status: "HYPOTHESIS" });
      if (/tracking/i.test(e.eventType)) hypotheses.push({ text: `Tracking change on ${e.date}: measurement issue possible.`, status: "HYPOTHESIS" });
    }
    if (hypotheses.length === 0) hypotheses.push({ text: "Cause not identifiable from the data; review placements, audience and measurement.", status: "HYPOTHESIS" });
  }

  const spendAtRisk = status === "MATERIAL" || status === "SEVERE" ? c7.spend : status === "WATCH" ? c7.spend * 0.5 : 0;
  const text =
    status === "HEALTHY"
      ? "Historical winner with no material deterioration."
      : `${status === "WATCH" ? "Early decline" : status === "MATERIAL" ? "Material fatigue" : "Severe fatigue"}: 7D ROAS ${pc(d7)} vs winner-era normal, ${pc(signals.roasVsBest7)} vs best 7D${adequateSample ? "" : " (current sample is thin)"}.`;
  return { status, eligible: true, adequateSample, signals, startDate, daysInDecline, spendAtRisk, hypotheses, facts, text };
}
