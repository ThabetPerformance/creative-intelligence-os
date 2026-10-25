import { describe, expect, it } from "vitest";
import { addDays, diffDays } from "../src/engine/dates";
import { AS_OF, find, meta, peers, run, series, SETTINGS } from "./helpers";
import { CreativeSeries } from "../src/engine/series";
import { decisionReadyWaste, learningSpend, scanMilestones } from "../src/engine/history";
import { configFor } from "../src/engine/econ";
import { analyzePeaks } from "../src/engine/peaks";
import { F, chooseDefinitions } from "../src/engine/metrics";
import { analyzeScale } from "../src/engine/scale";
import { buildTimeline } from "../src/engine/timeline";
import { buildCohorts, testingEfficiency } from "../src/engine/cohorts";
import type { CreativeInput } from "../src/engine/types";

const cfg = configFor("MEDIUM");

describe("decision-ready waste (spec §136)", () => {
  // evidence spend 300, min days 5. $50/day at ~0.4x target → kill-ready once cumulative spend ≥ 300 (day 6).
  const start = "2026-06-01";
  const rows = series(start, 14, () => ({ spend: 50, cvr: 0.012 }));
  const s = new CreativeSeries(rows);
  const asOf = addDays(start, 13);
  const ms = scanMilestones(s, start, asOf, SETTINGS, [], cfg, []);
  it("finds the decision-ready day and counts only post-evidence spend", () => {
    expect(ms.killReadyDate).toBe(addDays(start, 5));
    const waste = decisionReadyWaste(s, ms, start, asOf);
    // days 7..14 (8 days × $50) — spend before and on the decision-ready day is learning, not waste
    expect(waste).toBeCloseTo(8 * 50, 6);
    expect(learningSpend(s, ms, start, asOf)).toBeCloseTo(14 * 50, 6); // never reached purchase evidence
  });
  it("spec example: kill-ready on Day 8, spending through Day 14 → only Days 9–14 count", () => {
    const rows2 = series(start, 14, (i) => ({ spend: i < 7 ? 40 : 60, cvr: 0.01 }));
    const s2 = new CreativeSeries(rows2);
    const settings = { ...SETTINGS, minEvidenceSpend: 330 };
    const ms2 = scanMilestones(s2, start, asOf, settings, [], cfg, []);
    expect(ms2.killReadyDate).toBe(addDays(start, 7)); // Day 8
    expect(decisionReadyWaste(s2, ms2, start, asOf)).toBeCloseTo(6 * 60, 6);
  });
});

describe("milestones: time to winner, lifespan", () => {
  const start = "2026-03-01";
  const rows = series(start, 80, (i) => (i < 60 ? { spend: 100, cvr: 0.1 } : { spend: 100, cvr: 0.02 }));
  const s = new CreativeSeries(rows);
  const asOf = addDays(start, 79);
  const ms = scanMilestones(s, start, asOf, SETTINGS, [], cfg, []);
  it("time to winner and spend to winner", () => {
    expect(ms.firstWinnerDate).not.toBeNull();
    expect(ms.daysToWinner).toBe(diffDays(ms.firstWinnerDate!, start));
    expect(ms.spendToWinner).toBeCloseTo((ms.daysToWinner! + 1) * 100, 6);
  });
  it("winner lifespan ends at fatigue", () => {
    expect(ms.fatigueDate).not.toBeNull();
    expect(ms.fatigueDate! > addDays(start, 59)).toBe(true);
    expect(ms.winnerLifespanDays).toBe(diffDays(ms.fatigueDate!, ms.firstWinnerDate!));
    expect(ms.lifespanCensored).toBe(false);
  });
  it("uses the target regime active at the time (date-aware targets)", () => {
    const strict = scanMilestones(s, start, asOf, SETTINGS, [{ startDate: "2026-01-01", endDate: null, targetRoas: 10, cpoGuardrail: 5 }], cfg, []);
    expect(strict.firstWinnerDate).toBeNull();
  });
});

describe("peak analysis", () => {
  const start = "2026-04-01";
  const rows = series(start, 40, (i) => ({ spend: 100, cvr: i >= 10 && i < 17 ? 0.15 : 0.05 }));
  const s = new CreativeSeries(rows);
  const asOf = addDays(start, 39);
  const p = analyzePeaks(s, asOf, 300, F.lpv, F.purchLpv);
  it("finds best 7D window and days since peak", () => {
    expect(p.best7d!.from).toBe(addDays(start, 10));
    expect(p.best7d!.to).toBe(addDays(start, 16));
    expect(p.daysSincePeak).toBe(diffDays(asOf, addDays(start, 16)));
    expect(p.currentVsPeakRoas!).toBeLessThan(-0.5);
    expect(p.best3d!.roas!).toBeGreaterThanOrEqual(p.best7d!.roas! - 1e-9);
  });
});

describe("scale evidence", () => {
  it("untested when spend never steps up", () => {
    const s = new CreativeSeries(series("2026-04-01", 42, () => ({ spend: 100, cvr: 0.08 })));
    const a = analyzeScale(s, "2026-05-12", 300, 2, F.purchLpv, F.lpv);
    expect(a.evidence).toBe("SCALE_UNTESTED");
    expect(a.response.status).toBe("INSUFFICIENT_VARIATION");
  });
  it("tolerant when ROAS holds through step-ups", () => {
    const steps = [1, 1.4, 1.2, 1.8, 1.3, 2.2];
    const s = new CreativeSeries(series("2026-04-01", 42, (i) => ({ spend: 60 * steps[Math.floor(i / 7)], cvr: 0.08 })));
    const a = analyzeScale(s, "2026-05-12", 300, 2, F.purchLpv, F.lpv);
    expect(["SCALE_TOLERANT", "PROVEN_AT_SCALE"]).toContain(a.evidence);
    expect(a.response.status).toBe("DIRECTIONAL_SCALE_RESPONSE");
  });
  it("fragile when ROAS collapses as spend rises", () => {
    const s = new CreativeSeries(series("2026-04-01", 42, (i) => {
      const w = Math.floor(i / 7);
      return { spend: 60 * Math.pow(1.4, w), cvr: 0.1 * Math.pow(0.65, w) };
    }));
    const a = analyzeScale(s, "2026-05-12", 300, 2, F.purchLpv, F.lpv);
    expect(a.evidence).toBe("SCALE_FRAGILE");
  });
});

describe("timeline (spec §137)", () => {
  const launch = "2026-01-01";
  const rows = series(launch, 180, (i) => ({ spend: 100, cvr: i < 120 ? 0.1 : 0.03, freq: i < 120 ? 1.5 : 3 }));
  const s = new CreativeSeries(rows);
  const asOf = addDays(launch, 179);
  const ms = scanMilestones(s, launch, asOf, SETTINGS, [{ startDate: "2026-03-01", endDate: null, targetRoas: 2.4, cpoGuardrail: 28 }], cfg, []);
  const peaks = analyzePeaks(s, asOf, 300, F.lpv, F.purchLpv);
  const defs = chooseDefinitions(s.agg({ from: launch, to: asOf }));
  for (const days of [7, 10, 14, 30, 90, 180]) {
    it(`range ${days}D has one point per calendar day`, () => {
      const t = buildTimeline(s, { from: addDays(asOf, -(days - 1)), to: asOf }, launch, defs, SETTINGS, [], ms, peaks, []);
      expect(t.points.length).toBe(days);
    });
  }
  const t = buildTimeline(s, { from: launch, to: asOf }, launch, defs, SETTINGS, [{ startDate: "2026-03-01", endDate: null, targetRoas: 2.4, cpoGuardrail: 28 }], ms, peaks, []);
  it("days-since-launch axis starts at Day 0", () => {
    expect(t.points[0].day).toBe(0);
    expect(t.points[30].day).toBe(30);
  });
  it("rolling ROAS equals window sums", () => {
    const p = t.points[10];
    const sp = rows.slice(4, 11).reduce((a, r) => a + r.spend, 0);
    const v = rows.slice(4, 11).reduce((a, r) => a + (r.purchaseValue ?? 0), 0);
    expect(p.roas7).toBeCloseTo(v / sp, 9);
    const sp3 = rows.slice(8, 11).reduce((a, r) => a + r.spend, 0);
    const v3 = rows.slice(8, 11).reduce((a, r) => a + (r.purchaseValue ?? 0), 0);
    expect(p.roas3).toBeCloseTo(v3 / sp3, 9);
    expect(p.roas).toBeCloseTo((rows[10].purchaseValue ?? 0) / rows[10].spend, 9);
  });
  it("target line is date-aware", () => {
    expect(t.points[0].targetRoas).toBe(SETTINGS.targetRoas);
    expect(t.points.find((p) => p.date === "2026-03-15")!.targetRoas).toBe(2.4);
  });
  it("shows peak and fatigue markers", () => {
    const types = t.markers.map((m) => m.type);
    expect(types).toContain("LAUNCH");
    expect(types).toContain("PEAK");
    expect(types).toContain("FIRST_WINNER");
    expect(types).toContain("FATIGUE");
  });
  it("paused days show spend 0 and UNAVAILABLE ROAS", () => {
    const gappy = new CreativeSeries([...series(launch, 5, () => ({ spend: 50 })), ...series(addDays(launch, 8), 5, () => ({ spend: 50 }))]);
    const tl = buildTimeline(gappy, { from: launch, to: addDays(launch, 12) }, launch, defs, SETTINGS, [], ms, peaks, []);
    expect(tl.points[6].spend).toBe(0);
    expect(tl.points[6].roas).toBeNull();
  });
});

describe("cohorts, hit rate and testing efficiency (spec §138)", () => {
  // batch A (Jan): 4 of 5 judged creatives win; batch B (Feb): 1 of 5
  const mk = (key: string, launch: string, win: boolean, batch: string): CreativeInput => ({
    meta: meta(key, launch, { batch }),
    rows: series(launch, 40, () => ({ spend: 60, cvr: win ? 0.12 : 0.015 })),
  });
  const asOf = "2026-04-30";
  const creatives: CreativeInput[] = [];
  for (let i = 0; i < 5; i++) creatives.push(mk(`a${i}`, "2026-01-05", i < 4, "Batch A"));
  for (let i = 0; i < 5; i++) creatives.push(mk(`b${i}`, "2026-02-09", i < 1, "Batch B"));
  // never-judged creative: must not enter the hit-rate denominator
  creatives.push({ meta: meta("tinyB", "2026-02-09", { batch: "Batch B" }), rows: series("2026-02-09", 5, () => ({ spend: 5 })) });
  const res = run(creatives, { asOf, window: { from: "2026-01-01", to: asOf } });
  const rows = buildCohorts(res.creatives, "batch");
  it("winner rate per batch uses eligible creatives only", () => {
    const a = rows.find((r) => r.key === "Batch A")!;
    const b = rows.find((r) => r.key === "Batch B")!;
    expect(a.winnerRate).toBeCloseTo(0.8, 6);
    expect(b.launched).toBe(6);
    expect(b.eligible).toBe(5);
    expect(b.winnerRate).toBeCloseTo(0.2, 6);
    expect(a.medianDaysToWinner).not.toBeNull();
    expect(a.medianSpendToWinner).not.toBeNull();
    expect(a.roas!).toBeGreaterThan(b.roas!);
  });
  it("monthly cohorts split by launch month", () => {
    const m = buildCohorts(res.creatives, "month");
    expect(m.map((r) => r.key).sort()).toEqual(["2026-01", "2026-02"]);
  });
  it("testing efficiency: cost to find a winner is learning spend / winners", () => {
    const te = testingEfficiency(res.creatives, "2026-01-01", "2026-03-01");
    expect(te.tested).toBe(11);
    expect(te.winnersFound).toBe(5);
    expect(te.hitRate).toBeCloseTo(0.5, 6);
    expect(te.costToFindWinner).toBeCloseTo(te.learningSpend / 5, 6);
  });
});

describe("date control (spec §139)", () => {
  const all = [...peers(), { meta: meta("long", addDays(AS_OF, -179)), rows: series(addDays(AS_OF, -179), 180, (i) => ({ spend: 50 + i, cvr: 0.06 })) }];
  it("30D → 90D → 180D changes portfolio and creative totals", () => {
    const r30 = run(all, { window: { from: addDays(AS_OF, -29), to: AS_OF } });
    const r90 = run(all, { window: { from: addDays(AS_OF, -89), to: AS_OF } });
    const r180 = run(all, { window: { from: addDays(AS_OF, -179), to: AS_OF } });
    expect(r90.portfolio.totals.spend).toBeGreaterThan(r30.portfolio.totals.spend);
    expect(r180.portfolio.totals.spend).toBeGreaterThan(r90.portfolio.totals.spend);
    expect(find(r180, "long").window.spend).toBeCloseTo(series(addDays(AS_OF, -179), 180, (i) => ({ spend: 50 + i })).reduce((a, r) => a + r.spend, 0), 6);
    expect(r30.groups.format[0].metrics.spend).toBeLessThan(r180.groups.format[0].metrics.spend);
  });
});

describe("hit rate excludes creatives without enough sample", () => {
  it("current hit rate denominator = eligible creatives", () => {
    const res = run([...peers(), { meta: meta("tiny", addDays(AS_OF, -20)), rows: series(addDays(AS_OF, -20), 21, () => ({ spend: 1 })) }]);
    expect(res.portfolio.hitRate.eligible).toBe(res.creatives.filter((c) => c.activeInWindow && c.evidence.level !== "LOW").length);
    expect(find(res, "tiny").evidence.level).toBe("LOW");
  });
});
