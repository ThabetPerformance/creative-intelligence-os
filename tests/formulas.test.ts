import { describe, expect, it } from "vitest";
import { cpc, cpm, cpo, ctr, roas, safeDiv, metricsFromAgg, emptyAgg, addDayToAgg, chooseDefinitions, CVR_LABEL } from "../src/engine/metrics";
import { evidenceGate } from "../src/engine/evidence";
import { resolveTarget, evidenceSpendThreshold } from "../src/engine/targets";
import { day, SETTINGS } from "./helpers";
import { median, percentileRank, quantile } from "../src/engine/stats";

describe("core formulas", () => {
  it("ROAS = purchase_value / spend", () => {
    expect(roas(500, 100)).toBe(5);
    expect(roas(null, 100)).toBeNull();
    expect(roas(100, 0)).toBeNull();
  });
  it("CPO = spend / purchases", () => {
    expect(cpo(300, 10)).toBe(30);
    expect(cpo(300, 0)).toBeNull();
    expect(cpo(300, null)).toBeNull();
  });
  it("CPC, CPM, CTR", () => {
    expect(cpc(50, 100)).toBe(0.5);
    expect(cpm(12, 1000)).toBe(12);
    expect(ctr(15, 1000)).toBe(0.015);
    expect(ctr(null, 1000)).toBeNull();
  });
  it("safeDiv never returns Infinity or NaN", () => {
    expect(safeDiv(1, 0)).toBeNull();
    expect(safeDiv(Number.NaN, 1)).toBeNull();
  });
});

describe("metric aggregation and definitions", () => {
  it("prefers LPV as CVR denominator when available, and labels it", () => {
    const a = emptyAgg();
    addDayToAgg(a, day("2026-01-01", { spend: 100 }));
    const defs = chooseDefinitions(a);
    expect(defs.cvr).toBe("LPV");
    expect(CVR_LABEL[defs.cvr]).toBe("Purchases ÷ Landing Page Views");
    const m = metricsFromAgg(a, defs);
    expect(m.cvr).toBeCloseTo(0.045, 6);
    expect(defs.ctr).toBe("OUTBOUND");
  });
  it("falls back to outbound clicks, then clicks, when LPV is unavailable", () => {
    const a = emptyAgg();
    addDayToAgg(a, { ...day("2026-01-01", { spend: 100 }), landingPageViews: null });
    expect(chooseDefinitions(a).cvr).toBe("OUTBOUND");
    const b = emptyAgg();
    addDayToAgg(b, { ...day("2026-01-01", { spend: 100 }), landingPageViews: null, outboundClicks: null });
    expect(chooseDefinitions(b).cvr).toBe("CLICKS");
    expect(chooseDefinitions(b).ctr).toBe("ALL_CLICKS");
  });
  it("missing metrics stay UNAVAILABLE (null), never 0", () => {
    const a = emptyAgg();
    addDayToAgg(a, { ...day("2026-01-01", { spend: 100 }), video3s: null, video50: null, hookRate: null, holdRate: null });
    const defs = chooseDefinitions(a);
    const m = metricsFromAgg(a, defs);
    expect(m.hookRate).toBeNull();
    expect(m.holdRate).toBeNull();
  });
  it("only pairs numerators with denominators reported on the same days", () => {
    const a = emptyAgg();
    addDayToAgg(a, day("2026-01-01", { spend: 100, cvr: 0.05 }));
    addDayToAgg(a, { ...day("2026-01-02", { spend: 100, cvr: 0.05 }), landingPageViews: null });
    const m = metricsFromAgg(a, { cvr: "LPV", ctr: "OUTBOUND", hook: "VIDEO_3S_PER_IMPRESSION", hold: "VIDEO_50_PER_3S" });
    expect(m.cvr).toBeCloseTo(0.05, 6);
  });
});

describe("evidence gate", () => {
  const t = { minPurchases: 10, evidenceSpend: 300, minDaysLive: 5 };
  it("HIGH when both thresholds are met", () => expect(evidenceGate({ purchases: 12, spend: 400, daysLive: 10 }, t).level).toBe("HIGH"));
  it("MEDIUM when one threshold is met", () => {
    expect(evidenceGate({ purchases: 12, spend: 100, daysLive: 10 }, t).level).toBe("MEDIUM");
    expect(evidenceGate({ purchases: 2, spend: 500, daysLive: 10 }, t).level).toBe("MEDIUM");
  });
  it("LOW when neither is met", () => expect(evidenceGate({ purchases: 2, spend: 50, daysLive: 10 }, t).level).toBe("LOW"));
  it("can judge failure only with spend and days", () => {
    expect(evidenceGate({ purchases: 0, spend: 500, daysLive: 10 }, t).canJudgeFailure).toBe(true);
    expect(evidenceGate({ purchases: 0, spend: 500, daysLive: 3 }, t).canJudgeFailure).toBe(false);
  });
});

describe("target resolution", () => {
  const regimes = [
    { startDate: "2026-01-01", endDate: "2026-03-31", targetRoas: 2.5, cpoGuardrail: 25 },
    { startDate: "2026-04-01", endDate: null, targetRoas: 3.0, cpoGuardrail: 22 },
  ];
  it("uses the regime active on the date", () => {
    expect(resolveTarget("2026-02-15", regimes, SETTINGS).targetRoas).toBe(2.5);
    expect(resolveTarget("2026-05-01", regimes, SETTINGS).targetRoas).toBe(3.0);
    expect(resolveTarget("2026-05-01", regimes, SETTINGS).source).toBe("TARGETS_HISTORY");
  });
  it("falls back to account settings outside any regime", () => {
    const r = resolveTarget("2025-12-01", regimes, SETTINGS);
    expect(r.targetRoas).toBe(SETTINGS.targetRoas);
    expect(r.source).toBe("ACCOUNT_SETTINGS");
  });
  it("derives evidence spend from CPO × multiple when configured", () => {
    const r = resolveTarget("2026-05-01", regimes, SETTINGS);
    expect(evidenceSpendThreshold({ ...SETTINGS, evidenceSpendMultiple: 4 }, r)).toBe(88);
    expect(evidenceSpendThreshold(SETTINGS, r)).toBe(300);
  });
});

describe("stats", () => {
  it("median / quantile / percentile rank", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(quantile([0, 10], 0.5)).toBe(5);
    expect(percentileRank([1, 2, 3, 4], 4)).toBe(0.875);
  });
});
