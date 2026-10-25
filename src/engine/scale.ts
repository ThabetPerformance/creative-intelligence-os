import { F } from "./metrics";
import type { CreativeSeries } from "./series";
import { fromDayNumber, toDayNumber } from "./dates";
import { median, olsSlope, stdev } from "./stats";
import type { ScaleEvidence } from "./types";

export interface WeekBlock {
  from: string;
  to: string;
  spend: number;
  purchases: number;
  value: number;
  roas: number | null;
  cpo: number | null;
  cvr: number | null;
}

export interface ScaleStep {
  from: WeekBlock;
  to: WeekBlock;
  spendChange: number;
  roasChange: number | null;
  cpoChange: number | null;
  purchasesChange: number | null;
  cvrChange: number | null;
}

export interface DirectionalResponse {
  status: "DIRECTIONAL_SCALE_RESPONSE" | "INSUFFICIENT_VARIATION" | "INSUFFICIENT_DATA";
  pairs: number;
  roasElasticity: number | null;
  purchaseElasticity: number | null;
  cpoElasticity: number | null;
  text: string;
}

export interface EarnedBudget {
  label: "PLANNING ESTIMATE";
  currentWeeklySpend: number;
  earnedWeeklySpend: number;
  multiple: number;
  basis: string;
}

export interface ScaleAnalysis {
  evidence: ScaleEvidence;
  weeks: WeekBlock[];
  steps: ScaleStep[];
  maxWeeklySpend: number;
  medianWeeklySpend: number | null;
  response: DirectionalResponse;
  earnedBudget: EarnedBudget | null;
  text: string;
}

/**
 * Scale evidence (spec §28–29). Descriptive only: it reports what happened to efficiency when
 * spend moved, never an incremental causal effect.
 */
export function analyzeScale(
  s: CreativeSeries,
  asOf: string,
  evidenceSpend: number,
  targetRoas: number,
  cvrNum: number,
  cvrDen: number,
  stepPct = 0.3,
): ScaleAnalysis {
  const end = toDayNumber(asOf);
  const first = s.firstSpendDate();
  const weeks: WeekBlock[] = [];
  if (first) {
    const start = toDayNumber(first);
    for (let to = end; to - 6 >= start - 6 && to >= start; to -= 7) {
      const from = to - 6;
      const spend = s.sumField(F.spend, from, to);
      const purchases = s.sumField(F.purchases, from, to);
      const value = s.sumField(F.value, from, to);
      const den = s.sumField(cvrDen, from, to);
      const num = s.sumField(cvrNum, from, to);
      weeks.unshift({
        from: fromDayNumber(from),
        to: fromDayNumber(to),
        spend,
        purchases,
        value,
        roas: spend > 0 ? value / spend : null,
        cpo: purchases > 0 ? spend / purchases : null,
        cvr: den > 0 ? num / den : null,
      });
    }
  }
  const minWeekSpend = evidenceSpend * 0.2;
  const valid = (w: WeekBlock) => w.spend >= minWeekSpend && w.purchases >= 2;
  const steps: ScaleStep[] = [];
  const pairs: { x: number; yr: number; yp: number; yc: number }[] = [];
  for (let i = 1; i < weeks.length; i++) {
    const a = weeks[i - 1];
    const b = weeks[i];
    if (!valid(a) || !valid(b)) continue;
    const spendChange = b.spend / a.spend - 1;
    const roasChange = a.roas && b.roas !== null ? b.roas / a.roas - 1 : null;
    const cpoChange = a.cpo && b.cpo !== null ? b.cpo / a.cpo - 1 : null;
    pairs.push({
      x: Math.log(b.spend / a.spend),
      yr: a.roas && b.roas ? Math.log(b.roas / a.roas) : 0,
      yp: Math.log(b.purchases / a.purchases),
      yc: a.cpo && b.cpo ? Math.log(b.cpo / a.cpo) : 0,
    });
    if (spendChange >= stepPct) {
      steps.push({
        from: a,
        to: b,
        spendChange,
        roasChange,
        cpoChange,
        purchasesChange: a.purchases > 0 ? b.purchases / a.purchases - 1 : null,
        cvrChange: a.cvr && b.cvr !== null ? b.cvr / a.cvr - 1 : null,
      });
    }
  }
  const validWeeks = weeks.filter(valid);
  const maxWeeklySpend = validWeeks.reduce((m, w) => Math.max(m, w.spend), 0);
  const medianWeeklySpend = median(validWeeks.map((w) => w.spend));

  let evidence: ScaleEvidence;
  const avgRoasChange = steps.length ? steps.reduce((acc, st) => acc + (st.roasChange ?? 0), 0) / steps.length : null;
  if (validWeeks.length < 3) evidence = "UNKNOWN";
  else if (steps.length === 0) evidence = "SCALE_UNTESTED";
  else {
    const topWeek = validWeeks.reduce((m, w) => (w.spend > m.spend ? w : m), validWeeks[0]);
    const provenAtScale =
      medianWeeklySpend !== null && maxWeeklySpend >= 2.5 * medianWeeklySpend && (topWeek.roas ?? 0) >= 0.9 * targetRoas && (avgRoasChange ?? 0) >= -0.15;
    if (provenAtScale) evidence = "PROVEN_AT_SCALE";
    else if ((avgRoasChange ?? 0) >= -0.1) evidence = "SCALE_TOLERANT";
    else if ((avgRoasChange ?? 0) >= -0.25) evidence = "MARGINAL_DECAY";
    else evidence = "SCALE_FRAGILE";
  }

  // Directional response: log-log slope of week-over-week changes.
  let response: DirectionalResponse;
  if (pairs.length < 4) {
    response = { status: "INSUFFICIENT_DATA", pairs: pairs.length, roasElasticity: null, purchaseElasticity: null, cpoElasticity: null, text: "Fewer than 4 comparable week pairs." };
  } else {
    const xs = pairs.map((p) => p.x);
    const sd = stdev(xs) ?? 0;
    if (sd < 0.15) {
      response = {
        status: "INSUFFICIENT_VARIATION",
        pairs: pairs.length,
        roasElasticity: null,
        purchaseElasticity: null,
        cpoElasticity: null,
        text: "Weekly spend barely changed, so the spend-to-efficiency relationship cannot be read.",
      };
    } else {
      const er = olsSlope(xs, pairs.map((p) => p.yr));
      const ep = olsSlope(xs, pairs.map((p) => p.yp));
      const ec = olsSlope(xs, pairs.map((p) => p.yc));
      response = {
        status: "DIRECTIONAL_SCALE_RESPONSE",
        pairs: pairs.length,
        roasElasticity: er,
        purchaseElasticity: ep,
        cpoElasticity: ec,
        text:
          er === null
            ? "No usable slope."
            : `Across ${pairs.length} week pairs, a 10% spend increase was associated with ROAS ${fmtPct(Math.pow(1.1, er) - 1)} and purchases ${fmtPct(Math.pow(1.1, ep ?? 0) - 1)}. Directional, not causal.`,
      };
    }
  }

  const last = weeks[weeks.length - 1];
  let earnedBudget: EarnedBudget | null = null;
  if (last && valid(last) && last.roas !== null && targetRoas > 0) {
    const ratio = last.roas / targetRoas;
    if (ratio > 1.05 && (evidence === "SCALE_TOLERANT" || evidence === "PROVEN_AT_SCALE" || evidence === "SCALE_UNTESTED" || evidence === "MARGINAL_DECAY")) {
      const e = response.roasElasticity;
      let multiple: number;
      let basis: string;
      if (e !== null && e < -0.02) {
        multiple = Math.pow(ratio, 1 / -e);
        basis = `Observed ROAS elasticity ${e.toFixed(2)}: projected spend at which ROAS reaches target.`;
      } else {
        const tested = medianWeeklySpend ? maxWeeklySpend / Math.max(1, last.spend) : 1;
        multiple = Math.max(1.15, Math.min(1.5, tested));
        basis = "No measurable decay in tested range: capped step within previously tested spend.";
      }
      multiple = Math.max(1, Math.min(3, multiple));
      earnedBudget = { label: "PLANNING ESTIMATE", currentWeeklySpend: last.spend, earnedWeeklySpend: last.spend * multiple, multiple, basis };
    }
  }

  const text =
    evidence === "UNKNOWN"
      ? "Not enough weekly history to describe scale behaviour."
      : evidence === "SCALE_UNTESTED"
        ? "Spend has never stepped up ≥30% week over week — scale is untested."
        : `${steps.length} spend step-up(s); average ROAS change on step-ups ${fmtPct(avgRoasChange ?? 0)}.`;
  return { evidence, weeks, steps, maxWeeklySpend, medianWeeklySpend, response, earnedBudget, text };
}

function fmtPct(x: number): string {
  const v = Math.round(x * 1000) / 10;
  return `${v >= 0 ? "+" : ""}${v}%`;
}
