import { describe, expect, it } from "vitest";
import { addDays } from "../src/engine/dates";
import { AS_OF, find, meta, peers, run, series } from "./helpers";
import type { CreativeInput } from "../src/engine/types";

const start30 = addDays(AS_OF, -29);

describe("winner test (spec §130): 12x/2 purchases vs 6x/250 purchases", () => {
  const A: CreativeInput = {
    meta: meta("A-12x", addDays(AS_OF, -9)),
    rows: series(addDays(AS_OF, -9), 10, () => ({ spend: 10, purchases: 0.2, value: 120 })),
  };
  const B: CreativeInput = {
    meta: meta("B-6x", start30),
    rows: series(start30, 30, () => ({ spend: 240, purchases: 250 / 30, value: 1440 })),
  };
  const res = run([...peers(), A, B]);
  const a = find(res, "A-12x");
  const b = find(res, "B-6x");
  it("A is promising but not a winner — insufficient scale proof", () => {
    expect(a.window.roas).toBeCloseTo(12, 5);
    expect(["NEW_LEARNING", "INSUFFICIENT_DATA"]).toContain(a.classification);
    expect(a.flags).toContain("PROMISING_LOW_SAMPLE");
    expect(a.reasons.map((r) => r.text).join(" ")).toMatch(/only 2 purchase/);
  });
  it("B is a proven winner with far stronger commercial volume", () => {
    expect(["PROVEN_WINNER", "VOLUME_WINNER"]).toContain(b.classification);
    expect(b.evidence.level).toBe("HIGH");
    expect(b.commercialScore).toBeGreaterThan(a.commercialScore * 50);
    expect(b.priorityScore).toBeGreaterThan(a.priorityScore);
    expect(b.rank.current).toBe(1);
  });
});

describe("attention trap (spec §131)", () => {
  const trap: CreativeInput = {
    meta: meta("trap", start30),
    rows: series(start30, 30, () => ({ spend: 60, hook: 0.48, ctr: 0.03, cvr: 0.006 })),
  };
  const res = run([...peers(), trap]);
  const c = find(res, "trap");
  it("is an ATTENTION WINNER, not a business winner", () => {
    expect(c.classification).toBe("ATTENTION_WINNER");
    expect(c.econ.tier === "MATERIAL" || c.econ.tier === "SEVERE" || c.econ.tier === "BELOW").toBe(true);
    expect(["ITERATE_BODY", "ITERATE_LANDING_ALIGNMENT", "ITERATE_OFFER"]).toContain(c.decision);
    expect(c.flags).toContain("REUSABLE_HOOK");
    expect(c.diagnosis.reusableElement).toMatch(/hook/i);
    expect(c.hookMatrix).toBe("ATTENTION_TRAP");
  });
});

describe("hidden winner (spec §132)", () => {
  const hidden: CreativeInput = {
    meta: meta("hidden", start30),
    rows: series(start30, 30, () => ({ spend: 80, hook: 0.12, ctr: 0.0075, cvr: 0.16, aov: 70 })),
  };
  const res = run([...peers(), hidden]);
  const c = find(res, "hidden");
  it("is a HIDDEN WINNER with a hook opportunity, never killed", () => {
    expect(c.window.roas!).toBeGreaterThan(2);
    expect(c.classification).toBe("HIDDEN_WINNER");
    expect(c.flags).toContain("HOOK_OPPORTUNITY");
    expect(c.decision).toBe("ITERATE_HOOK");
    expect(c.diagnosis.reusableElement).toMatch(/conversion core/i);
    expect(c.hookMatrix).toBe("HOOK_OPPORTUNITY");
  });
});

describe("hook opportunity: strong economics, medium evidence, weak hook", () => {
  const ho: CreativeInput = {
    meta: meta("hookopp", addDays(AS_OF, -49)),
    rows: series(addDays(AS_OF, -49), 50, (i) => ({ spend: i >= 20 ? 8 : 0.0001, hook: 0.1, ctr: 0.011, cvr: 0.2, aov: 70 })),
  };
  const res = run([...peers(), ho]);
  const c = find(res, "hookopp");
  it("is a HOOK OPPORTUNITY", () => {
    expect(c.evidence.level).toBe("MEDIUM");
    expect(c.classification).toBe("HOOK_OPPORTUNITY");
    expect(c.decision).toBe("ITERATE_HOOK");
  });
});

describe("fatigue (spec §133)", () => {
  const start = addDays(AS_OF, -89);
  const mk = (key: string, lateSpend: number): CreativeInput => ({
    meta: meta(key, start),
    rows: series(start, 90, (i) =>
      i < 72
        ? { spend: 150, cvr: 0.11, ctr: 0.014, hook: 0.3, freq: 1.6 }
        : { spend: lateSpend, cvr: 0.035, ctr: 0.011, hook: 0.24, freq: 3.2 },
    ),
  });
  it("historical winner + adequate sample + material decline = FATIGUED WINNER", () => {
    const res = run([...peers(), mk("fat", 150)]);
    const c = find(res, "fat");
    expect(c.milestones.firstWinnerDate).not.toBeNull();
    expect(["MATERIAL", "SEVERE"]).toContain(c.fatigue.status);
    expect(c.fatigue.adequateSample).toBe(true);
    expect(c.classification).toBe("FATIGUED_WINNER");
    expect(c.decision).toBe("REFRESH");
    expect(c.fatigue.startDate).not.toBeNull();
    expect(c.fatigue.signals.cpoVsPrev7 === null || c.fatigue.signals.cpoVsBest7! > 0).toBe(true);
    expect(c.fatigue.hypotheses.every((h) => h.status === "HYPOTHESIS")).toBe(true);
  });
  it("same decline on an inadequate current sample = FATIGUE WATCH", () => {
    const res = run([...peers(), mk("thin", 12)]);
    const c = find(res, "thin");
    expect(c.fatigue.adequateSample).toBe(false);
    expect(c.classification).toBe("FATIGUE_WATCH");
  });
  it("a historically weak creative is never called fatigued", () => {
    const weak: CreativeInput = { meta: meta("weakhist", start), rows: series(start, 90, (i) => ({ spend: 60, cvr: i < 72 ? 0.02 : 0.012 })) };
    const c = find(run([...peers(), weak]), "weakhist");
    expect(c.fatigue.status).toBe("NOT_APPLICABLE");
    expect(["FATIGUED_WINNER", "FATIGUE_WATCH"]).not.toContain(c.classification);
  });
});

describe("kill candidate (spec §134) and loser", () => {
  it("persistent failure across consecutive windows = KILL CANDIDATE", () => {
    const k: CreativeInput = { meta: meta("kill", start30), rows: series(start30, 30, () => ({ spend: 50, cvr: 0.012 })) };
    const c = find(run([...peers(), k]), "kill");
    expect(c.evidence.canJudgeFailure).toBe(true);
    expect(c.classification).toBe("KILL_CANDIDATE");
    expect(c.decision).toBe("KILL");
  });
  it("material failure without persistence = LOSER (not kill)", () => {
    const start = addDays(AS_OF, -13);
    const l: CreativeInput = {
      meta: meta("loser", start),
      rows: series(start, 14, (i) => (i < 7 ? { spend: 15, cvr: 0.06 } : { spend: 60, cvr: 0.014 })),
    };
    const c = find(run([...peers(), l]), "loser");
    expect(c.classification).toBe("LOSER");
    expect(c.decision).toBe("CUT");
  });
  it("new creatives are not called losers prematurely", () => {
    const start = addDays(AS_OF, -2);
    const n: CreativeInput = { meta: meta("new", start), rows: series(start, 3, () => ({ spend: 120, cvr: 0 })) };
    const c = find(run([...peers(), n]), "new");
    expect(c.classification).toBe("NEW_LEARNING");
  });
});

describe("tracking risk (spec §135)", () => {
  it("20 purchases with value 0 is TRACKING RISK, not a 0x loser", () => {
    const t: CreativeInput = { meta: meta("track", start30), rows: series(start30, 30, () => ({ spend: 40, purchases: 20 / 30, zeroValue: true })) };
    const c = find(run([...peers(), t]), "track");
    expect(c.window.purchases).toBeCloseTo(20, 6);
    expect(c.classification).toBe("TRACKING_RISK");
    expect(c.decision).toBe("VALIDATE");
    expect(c.econ.roasRatio).toBeNull();
  });
});

describe("scale candidate, volume winner, emerging, recoverable", () => {
  it("strong economics on low spend share = SCALE CANDIDATE with controlled scale, never a fixed % rule", () => {
    const big: CreativeInput = { meta: meta("big", start30), rows: series(start30, 30, () => ({ spend: 900, cvr: 0.05 })) };
    const sc: CreativeInput = { meta: meta("scale", start30), rows: series(start30, 30, () => ({ spend: 25, cvr: 0.12, ctr: 0.014 })) };
    const res = run([...peers(), big, sc]);
    const c = find(res, "scale");
    expect(c.classification).toBe("SCALE_CANDIDATE");
    expect(c.decision).toBe("CONTROLLED_SCALE");
    expect(c.diagnosis.recommendation).not.toMatch(/\+\s?(20|30)%/);
  });
  it("near-target economics with large purchase volume = VOLUME WINNER", () => {
    const v: CreativeInput = { meta: meta("volume", start30), rows: series(start30, 30, () => ({ spend: 700, cvr: 0.046 })) };
    const res = run([...peers(), v]);
    const c = find(res, "volume");
    expect(c.econ.tier).toBe("ACCEPTABLE");
    expect(c.classification).toBe("VOLUME_WINNER");
    expect(c.decision).toBe("PROTECT");
  });
  it("new, evidence-eligible and improving = EMERGING WINNER", () => {
    const start = addDays(AS_OF, -13);
    const e: CreativeInput = { meta: meta("emerging", start), rows: series(start, 14, (i) => ({ spend: 20 + i * 6, cvr: 0.06 + i * 0.003 })) };
    const c = find(run([...peers(), e]), "emerging");
    expect(c.trend.label).toBe("IMPROVING");
    expect(c.classification).toBe("EMERGING_WINNER");
  });
  it("loser with a strong hook = RECOVERABLE, keep hook and rebuild body", () => {
    const r: CreativeInput = { meta: meta("recover", start30), rows: series(start30, 30, () => ({ spend: 40, hook: 0.45, hold: 0.3, ctr: 0.012, cvr: 0.04 })) };
    const c = find(run([...peers(), r]), "recover");
    expect(c.classification).toBe("RECOVERABLE");
    expect(c.diagnosis.reusableElement).toMatch(/hook/i);
  });
});

describe("default sorting is decision priority, not ROAS", () => {
  it("ranks by commercial score so tiny samples never top the board", () => {
    const tiny: CreativeInput = { meta: meta("tiny", addDays(AS_OF, -20)), rows: series(addDays(AS_OF, -20), 21, () => ({ spend: 2, purchases: 0.1, value: 30 })) };
    const solid: CreativeInput = { meta: meta("solid", start30), rows: series(start30, 30, () => ({ spend: 300, cvr: 0.07 })) };
    const res = run([...peers(), tiny, solid]);
    const sorted = [...res.creatives].sort((a, b) => b.priorityScore - a.priorityScore);
    expect(sorted.findIndex((c) => c.key === "meta:solid")).toBeLessThan(sorted.findIndex((c) => c.key === "meta:tiny"));
  });
});
