import { F, safeDiv } from "./metrics";
import type { CreativeSeries } from "./series";
import { fromDayNumber, toDayNumber } from "./dates";

export interface PeakWindow {
  from: string;
  to: string;
  roas: number | null;
  spend: number;
  purchases: number;
}

export interface PeakAnalysis {
  bestDay: PeakWindow | null;
  best3d: PeakWindow | null;
  best7d: PeakWindow | null;
  best14d: PeakWindow | null;
  best30d: PeakWindow | null;
  peakPurchases7d: PeakWindow | null;
  peakSpendDay: { date: string; spend: number } | null;
  best7dCpo: number | null;
  best7dCvr: number | null;
  currentRoas7d: number | null;
  currentCpo7d: number | null;
  currentCvr7d: number | null;
  currentVsPeakRoas: number | null;
  currentVsBestCpo: number | null;
  currentVsBestCvr: number | null;
  daysSincePeak: number | null;
}

/**
 * Rolling-window peak scan up to asOf (spec §66). A window qualifies only when it carried enough
 * spend to be meaningful, so a single lucky purchase day cannot become "the peak".
 */
export function analyzePeaks(
  s: CreativeSeries,
  asOf: string,
  evidenceSpend: number,
  cvrDen: number,
  cvrNum: number,
): PeakAnalysis {
  const end = toDayNumber(asOf);
  const startDate = s.firstSpendDate();
  const empty: PeakAnalysis = {
    bestDay: null,
    best3d: null,
    best7d: null,
    best14d: null,
    best30d: null,
    peakPurchases7d: null,
    peakSpendDay: null,
    best7dCpo: null,
    best7dCvr: null,
    currentRoas7d: null,
    currentCpo7d: null,
    currentCvr7d: null,
    currentVsPeakRoas: null,
    currentVsBestCpo: null,
    currentVsBestCvr: null,
    daysSincePeak: null,
  };
  if (!startDate) return empty;
  const start = toDayNumber(startDate);
  if (start > end) return empty;

  const scan = (len: number, minSpend: number) => {
    let best: PeakWindow | null = null;
    for (let d = start + len - 1; d <= end; d++) {
      const spend = s.sumField(F.spend, d - len + 1, d);
      if (spend < minSpend || spend <= 0) continue;
      const value = s.sumField(F.value, d - len + 1, d);
      const purchases = s.sumField(F.purchases, d - len + 1, d);
      if (purchases <= 0) continue;
      const r = value / spend;
      if (!best || (best.roas ?? -1) < r) best = { from: fromDayNumber(d - len + 1), to: fromDayNumber(d), roas: r, spend, purchases };
    }
    return best;
  };

  const res: PeakAnalysis = { ...empty };
  res.bestDay = scan(1, evidenceSpend * 0.05);
  res.best3d = scan(3, evidenceSpend * 0.25);
  res.best7d = scan(7, evidenceSpend * 0.5);
  res.best14d = scan(14, evidenceSpend * 0.75);
  res.best30d = end - start + 1 >= 30 ? scan(30, evidenceSpend) : null;

  let bestCpo: number | null = null;
  let bestCvr: number | null = null;
  let peakP: PeakWindow | null = null;
  for (let d = start + 6; d <= end; d++) {
    const spend = s.sumField(F.spend, d - 6, d);
    const purchases = s.sumField(F.purchases, d - 6, d);
    if (!peakP || purchases > peakP.purchases) {
      const value = s.sumField(F.value, d - 6, d);
      peakP = { from: fromDayNumber(d - 6), to: fromDayNumber(d), roas: safeDiv(value, spend), spend, purchases };
    }
    if (spend >= evidenceSpend * 0.5 && purchases > 0) {
      const c = spend / purchases;
      if (bestCpo === null || c < bestCpo) bestCpo = c;
      const den = s.sumField(cvrDen, d - 6, d);
      const num = s.sumField(cvrNum, d - 6, d);
      if (den > 0) {
        const cv = num / den;
        if (bestCvr === null || cv > bestCvr) bestCvr = cv;
      }
    }
  }
  res.peakPurchases7d = peakP && peakP.purchases > 0 ? peakP : null;
  res.best7dCpo = bestCpo;
  res.best7dCvr = bestCvr;

  let peakSpend: { date: string; spend: number } | null = null;
  for (const r of s.rows) {
    if (r.date > asOf) break;
    if (!peakSpend || r.spend > peakSpend.spend) peakSpend = { date: r.date, spend: r.spend };
  }
  res.peakSpendDay = peakSpend;

  const cs = s.sumField(F.spend, end - 6, end);
  const cp = s.sumField(F.purchases, end - 6, end);
  const cv = s.sumField(F.value, end - 6, end);
  const cDen = s.sumField(cvrDen, end - 6, end);
  const cNum = s.sumField(cvrNum, end - 6, end);
  res.currentRoas7d = cs > 0 ? cv / cs : null;
  res.currentCpo7d = cp > 0 ? cs / cp : null;
  res.currentCvr7d = cDen > 0 ? cNum / cDen : null;
  res.currentVsPeakRoas = res.best7d?.roas && res.currentRoas7d !== null ? res.currentRoas7d / res.best7d.roas - 1 : null;
  res.currentVsBestCpo = bestCpo && res.currentCpo7d !== null ? res.currentCpo7d / bestCpo - 1 : null;
  res.currentVsBestCvr = bestCvr && res.currentCvr7d !== null ? res.currentCvr7d / bestCvr - 1 : null;
  res.daysSincePeak = res.best7d ? end - toDayNumber(res.best7d.to) : null;
  return res;
}
