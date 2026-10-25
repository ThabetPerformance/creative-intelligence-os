import { F } from "./metrics";
import type { CreativeSeries } from "./series";
import { fromDayNumber, toDayNumber } from "./dates";
import type { AccountSettingsInput, CreativeEventInput, LifecycleStage, TargetRegime } from "./types";
import { evidenceSpendThreshold, resolveTarget } from "./targets";
import type { EngineConfig } from "./econ";

export interface Milestones {
  launchDate: string | null;
  firstSpendDate: string | null;
  firstPurchaseDate: string | null;
  evidenceDate: string | null;
  daysToEvidence: number | null;
  spendToEvidence: number | null;
  emergingDate: string | null;
  firstWinnerDate: string | null;
  daysToWinner: number | null;
  spendToWinner: number | null;
  targetAtWinner: number | null;
  firstScaleDate: string | null;
  peakDate: string | null;
  fatigueWatchDate: string | null;
  fatigueDate: string | null;
  killReadyDate: string | null;
  lastSpendDate: string | null;
  retiredDate: string | null;
  relaunchDates: string[];
  winnerAgainDate: string | null;
  winnerLifespanDays: number | null;
  lifespanCensored: boolean;
  /** Days on which the creative remained decision-ready for KILL / CUT (after evidence). */
  killReadyDays: Set<number>;
}

export interface LifecyclePeriod {
  stage: LifecycleStage;
  from: string;
  to: string | null;
  reason: string;
}

/**
 * Scan the whole history day by day (cumulative and trailing windows) to find milestones.
 * Uses the target regime active on each day (date-aware targets, spec §128).
 */
export function scanMilestones(
  s: CreativeSeries,
  launchDate: string | null,
  asOf: string,
  settings: AccountSettingsInput,
  regimes: TargetRegime[],
  cfg: EngineConfig,
  events: CreativeEventInput[],
): Milestones {
  const res: Milestones = {
    launchDate,
    firstSpendDate: s.firstSpendDate(),
    firstPurchaseDate: null,
    evidenceDate: null,
    daysToEvidence: null,
    spendToEvidence: null,
    emergingDate: null,
    firstWinnerDate: null,
    daysToWinner: null,
    spendToWinner: null,
    targetAtWinner: null,
    firstScaleDate: null,
    peakDate: null,
    fatigueWatchDate: null,
    fatigueDate: null,
    killReadyDate: null,
    lastSpendDate: s.lastSpendDate(asOf),
    retiredDate: null,
    relaunchDates: [],
    winnerAgainDate: null,
    winnerLifespanDays: null,
    lifespanCensored: false,
    killReadyDays: new Set(),
  };
  if (!res.firstSpendDate || res.firstSpendDate > asOf) return res;
  const start = toDayNumber(launchDate && launchDate < res.firstSpendDate ? launchDate : res.firstSpendDate);
  const firstSpend = toDayNumber(res.firstSpendDate);
  const end = toDayNumber(asOf);
  const k = cfg.fatigueFactor;

  let best7: number | null = null;
  let bestRoasDay: number | null = null;
  let prevWeekSpend: number | null = null;
  let lastSpendDay: number | null = null;
  let phaseStart = start; // resets on relaunch
  let winnerSeen = false;
  let fatigued = false;

  for (let d = firstSpend; d <= end; d++) {
    const daySpend = s.sumField(F.spend, d, d);
    if (daySpend > 0) {
      if (lastSpendDay !== null && d - lastSpendDay >= 14) {
        res.relaunchDates.push(fromDayNumber(d));
        phaseStart = d;
        best7 = null;
      }
      lastSpendDay = d;
    }
    const date = fromDayNumber(d);
    const t = resolveTarget(date, regimes, settings);
    const evSpend = evidenceSpendThreshold(settings, t);
    const cumSpend = s.sumField(F.spend, start, d);
    const cumP = s.sumField(F.purchases, start, d);
    const cumV = s.sumField(F.value, start, d);
    if (res.firstPurchaseDate === null && cumP > 0) res.firstPurchaseDate = date;
    const daysLive = d - start + 1;

    if (res.evidenceDate === null && cumP >= settings.minPurchases && cumSpend >= evSpend) {
      res.evidenceDate = date;
      res.daysToEvidence = d - start;
      res.spendToEvidence = cumSpend;
    }

    // trailing 14D (current phase) and cumulative (current phase) economics
    const from14 = Math.max(phaseStart, d - 13);
    const sp14 = s.sumField(F.spend, from14, d);
    const p14 = s.sumField(F.purchases, from14, d);
    const v14 = s.sumField(F.value, from14, d);
    const phSpend = s.sumField(F.spend, phaseStart, d);
    const phP = s.sumField(F.purchases, phaseStart, d);
    const phV = s.sumField(F.value, phaseStart, d);
    const strong = (spend: number, p: number, v: number) =>
      spend > 0 && p > 0 && v / spend >= t.targetRoas * cfg.strongRoasRatio && (!t.cpoGuardrail || spend / p <= t.cpoGuardrail * cfg.strongCpoRatio);
    const acceptable = (spend: number, p: number, v: number) =>
      spend > 0 && p > 0 && v / spend >= t.targetRoas * cfg.acceptableRoasRatio && (!t.cpoGuardrail || spend / p <= t.cpoGuardrail * cfg.acceptableCpoRatio);
    const failing = (spend: number, p: number, v: number) =>
      spend > 0 && (p === 0 ? !!t.cpoGuardrail && spend / t.cpoGuardrail > cfg.belowCpoRatio : v / spend < t.targetRoas * cfg.belowRoasRatio || (!!t.cpoGuardrail && spend / p > t.cpoGuardrail * cfg.belowCpoRatio));

    const winnerToday =
      (phP >= settings.minPurchases && phSpend >= evSpend && strong(phSpend, phP, phV)) ||
      (p14 >= settings.minPurchases && sp14 >= evSpend && strong(sp14, p14, v14));

    if (res.emergingDate === null && !winnerSeen && daysLive <= settings.freshnessWindowDays + cfg.emergingExtraDays) {
      if ((cumP >= settings.minPurchases || cumSpend >= evSpend) && acceptable(cumSpend, cumP, cumV)) res.emergingDate = date;
    }

    if (winnerToday) {
      if (!winnerSeen) {
        winnerSeen = true;
        res.firstWinnerDate = date;
        res.daysToWinner = d - start;
        res.spendToWinner = cumSpend;
        res.targetAtWinner = t.targetRoas;
      } else if (fatigued && res.relaunchDates.length > 0 && res.winnerAgainDate === null && d >= toDayNumber(res.relaunchDates[res.relaunchDates.length - 1])) {
        res.winnerAgainDate = date;
      }
    }

    // weekly spend step-up after first winner → first scale date
    if (winnerSeen && res.firstScaleDate === null && (d - firstSpend) % 7 === 6) {
      const wk = s.sumField(F.spend, d - 6, d);
      if (prevWeekSpend !== null && prevWeekSpend > 0 && wk >= prevWeekSpend * (1 + cfg.scaleStepPct) && acceptable(wk, s.sumField(F.purchases, d - 6, d), s.sumField(F.value, d - 6, d))) {
        res.firstScaleDate = date;
      }
      prevWeekSpend = wk;
    } else if ((d - firstSpend) % 7 === 6) prevWeekSpend = s.sumField(F.spend, d - 6, d);

    // fatigue watch / fatigue dates: trailing 14D vs the expanding winner-era normal, noise-aware
    const sp7 = s.sumField(F.spend, d - 6, d);
    const spR = s.sumField(F.spend, d - 13, d);
    if (spR > 0) {
      const rR = s.sumField(F.value, d - 13, d) / spR;
      if (spR >= evSpend * 0.75 && (best7 === null || rR > best7)) {
        best7 = rR;
        bestRoasDay = d;
      }
      if (winnerSeen && !fatigued && res.firstWinnerDate) {
        const ws = toDayNumber(res.firstWinnerDate);
        const eraSpend = s.sumField(F.spend, Math.min(ws, d - 28), d - 14);
        const eraP = s.sumField(F.purchases, Math.min(ws, d - 28), d - 14);
        const eraV = s.sumField(F.value, Math.min(ws, d - 28), d - 14);
        if (eraSpend >= evSpend && eraP > 0) {
          const eraRoas = eraV / eraSpend;
          const exp = spR / (eraSpend / eraP);
          const z = (s.sumField(F.purchases, d - 13, d) - exp) / Math.sqrt(Math.max(1, exp));
          const decline = rR / eraRoas - 1;
          const p7 = s.sumField(F.purchases, d - 6, d);
          const r7 = sp7 > 0 ? s.sumField(F.value, d - 6, d) / sp7 : null;
          if (res.fatigueWatchDate === null && decline <= -0.15 * k && z <= -1.5) res.fatigueWatchDate = date;
          if (decline <= -0.25 * k && z <= -2 && r7 !== null && r7 < t.targetRoas && p7 >= Math.max(3, settings.minPurchases * 0.3)) {
            res.fatigueDate = date;
            fatigued = true;
          }
        }
      }
    }

    // decision-ready kill: after evidence spend and minimum days, cumulative AND trailing 7D failing
    if (!winnerSeen && daysLive >= settings.minDaysLive && cumSpend >= evSpend) {
      const p7 = s.sumField(F.purchases, d - 6, d);
      const v7 = s.sumField(F.value, d - 6, d);
      const trailingFailing = sp7 >= evSpend * 0.3 ? failing(sp7, p7, v7) : failing(cumSpend, cumP, cumV);
      if (failing(cumSpend, cumP, cumV) && trailingFailing) {
        if (res.killReadyDate === null) res.killReadyDate = date;
        res.killReadyDays.add(d);
      }
    }
  }
  res.peakDate = bestRoasDay !== null ? fromDayNumber(bestRoasDay) : null;
  if (lastSpendDay !== null && end - lastSpendDay >= 14) res.retiredDate = fromDayNumber(lastSpendDay + 1);

  if (res.firstWinnerDate) {
    const endLife = res.fatigueDate ?? res.retiredDate;
    res.winnerLifespanDays = (endLife ? toDayNumber(endLife) : end) - toDayNumber(res.firstWinnerDate);
    res.lifespanCensored = !endLife;
  }
  void events;
  return res;
}

/** Spend that occurred after the creative was decision-ready for KILL/CUT, inside a window (spec §36). */
export function decisionReadyWaste(s: CreativeSeries, ms: Milestones, from: string, to: string): number {
  if (!ms.killReadyDate) return 0;
  const a = toDayNumber(from);
  const b = toDayNumber(to);
  let waste = 0;
  for (const d of ms.killReadyDays) {
    // spend on the day evidence became clear contributed to that evidence; count the days after.
    if (d + 1 >= a && d + 1 <= b && ms.killReadyDays.has(d)) waste += s.sumField(F.spend, d + 1, d + 1);
  }
  return waste;
}

/** Learning spend: spend before (and on) the day the creative reached sufficient evidence. */
export function learningSpend(s: CreativeSeries, ms: Milestones, from: string, to: string): number {
  const a = toDayNumber(from);
  const b = toDayNumber(to);
  const limit = ms.evidenceDate ? Math.min(b, toDayNumber(ms.evidenceDate)) : b;
  if (limit < a) return 0;
  return s.sumField(F.spend, a, limit);
}

/** Lifecycle periods reconstructed from milestones and refresh events (spec §38). */
export function buildLifecycle(ms: Milestones, asOf: string, events: CreativeEventInput[], minDaysLive: number): LifecyclePeriod[] {
  const marks: { date: string; stage: LifecycleStage; reason: string }[] = [];
  const start = ms.launchDate && ms.firstSpendDate && ms.launchDate < ms.firstSpendDate ? ms.launchDate : ms.firstSpendDate;
  if (!start) return [];
  marks.push({ date: start, stage: "NEW", reason: "Launched" });
  const learnFrom = fromDayNumber(toDayNumber(start) + minDaysLive);
  if (learnFrom <= asOf) marks.push({ date: learnFrom, stage: "LEARNING", reason: `Past ${minDaysLive} days live, accumulating evidence` });
  if (ms.emergingDate && (!ms.firstWinnerDate || ms.emergingDate < ms.firstWinnerDate)) marks.push({ date: ms.emergingDate, stage: "EMERGING", reason: "Early evidence with acceptable economics" });
  if (ms.evidenceDate && !ms.firstWinnerDate) marks.push({ date: ms.evidenceDate, stage: "NOT_WINNING", reason: "Reached evidence without winner economics" });
  if (ms.firstWinnerDate) marks.push({ date: ms.firstWinnerDate, stage: "WINNER", reason: "First qualified as winner" });
  if (ms.firstScaleDate) marks.push({ date: ms.firstScaleDate, stage: "SCALING", reason: "Weekly spend stepped up ≥30% with acceptable economics" });
  if (ms.firstWinnerDate) {
    const mature = fromDayNumber(toDayNumber(ms.firstWinnerDate) + 45);
    if (mature <= asOf && (!ms.fatigueWatchDate || mature < ms.fatigueWatchDate)) marks.push({ date: mature, stage: "MATURE", reason: "45+ days as a winner" });
  }
  if (ms.fatigueWatchDate) marks.push({ date: ms.fatigueWatchDate, stage: "FATIGUE_WATCH", reason: "Rolling 7D ROAS ≥20% below best" });
  if (ms.fatigueDate) marks.push({ date: ms.fatigueDate, stage: "FATIGUED", reason: "Rolling 7D ROAS ≥30% below best and under target" });
  for (const e of events) {
    if (/refresh/i.test(e.eventType) && e.date <= asOf) marks.push({ date: e.date, stage: "REFRESHED", reason: e.description ?? "Creative refreshed" });
  }
  for (const r of ms.relaunchDates) marks.push({ date: r, stage: "RELAUNCHED", reason: "Spend resumed after ≥14 days paused" });
  if (ms.winnerAgainDate) marks.push({ date: ms.winnerAgainDate, stage: "WINNER_V2", reason: "Qualified as winner again after relaunch" });
  if (ms.retiredDate && ms.retiredDate <= asOf) marks.push({ date: ms.retiredDate, stage: "RETIRED", reason: "No spend for 14+ days" });

  marks.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const periods: LifecyclePeriod[] = [];
  for (let i = 0; i < marks.length; i++) {
    const next = marks[i + 1];
    periods.push({ stage: marks[i].stage, from: marks[i].date, to: next ? fromDayNumber(toDayNumber(next.date) - 1) : null, reason: marks[i].reason });
  }
  return periods.filter((p) => p.to === null || p.to >= p.from);
}
