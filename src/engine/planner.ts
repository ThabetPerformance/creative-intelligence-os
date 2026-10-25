import { median } from "./stats";
import { WINNER_CLASSES } from "./types";
import type { AnalysisContext, CreativeAnalysis } from "./model";
import type { GroupRow } from "./groups";
import type { Portfolio } from "./portfolio";

export interface LearningRef {
  id: number;
  learning: string;
  evidenceStatus: string;
  concept: string | null;
  angle: string | null;
  hookTactic: string | null;
  format: string | null;
  creator: string | null;
  creativeKey: string | null;
  creativeGroupId: string | null;
}

export interface PlanItem {
  kind: string;
  title: string;
  why: string;
  evidence: string[];
  creativeKeys: string[];
  priority: "HIGH" | "MEDIUM" | "LOW";
  learnings: LearningRef[];
}

export interface CapacityEstimate {
  label: "PLANNING ESTIMATE";
  activeWinnersNeeded: number;
  medianWinnerLifespanDays: number | null;
  hitRate: number | null;
  launchesPerWeek: number | null;
  text: string;
}

export interface ReplacementRisk {
  status: "HEALTHY_PIPELINE" | "THIN_PIPELINE" | "REPLACEMENT_RISK" | "CRITICAL_CREATIVE_PIPELINE";
  majorWinners: number;
  atRisk: number;
  replacements: number;
  text: string;
}

export function relevantLearnings(c: CreativeAnalysis, learnings: LearningRef[]): LearningRef[] {
  return learnings.filter(
    (l) =>
      (l.creativeKey && l.creativeKey === c.key) ||
      (l.creativeGroupId && l.creativeGroupId === c.meta.creativeGroupId) ||
      (l.concept && l.concept === c.meta.concept) ||
      (l.hookTactic && l.hookTactic === c.meta.hookTactic && l.angle && l.angle === c.meta.angle),
  );
}

/** "What should we make next?" (spec §86). Every item carries the evidence that produced it. */
export function buildPlan(
  all: CreativeAnalysis[],
  ctx: AnalysisContext,
  portfolio: Portfolio,
  groups: { concept: GroupRow[]; format: GroupRow[]; hookTactic: GroupRow[] },
  learnings: LearningRef[],
): { items: PlanItem[]; capacity: CapacityEstimate; replacement: ReplacementRisk } {
  const active = all.filter((c) => c.activeInWindow);
  const items: PlanItem[] = [];
  const cur = ctx.currency;
  const accRate = portfolio.hitRate.current;

  for (const c of active.filter((x) => x.classification === "FATIGUED_WINNER" || x.classification === "FATIGUE_WATCH").sort((a, b) => b.window.spend - a.window.spend).slice(0, 4)) {
    items.push({
      kind: "Refresh fatigued winning concept",
      title: `Refresh "${c.meta.concept ?? c.meta.creativeName}" (${c.meta.creativeName})`,
      why: "A proven concept whose current execution is declining.",
      evidence: [
        `Peak 7D ROAS ${c.peaks.best7d?.roas?.toFixed(2) ?? "n/a"}x → current 7D ${c.peaks.currentRoas7d?.toFixed(2) ?? "n/a"}x (${pctS(c.fatigue.signals.roasVsBest7)}).`,
        `Spend at risk ${cur} ${Math.round(c.fatigue.spendAtRisk).toLocaleString("en-US")}; ${c.fatigue.daysInDecline ?? "?"} days in decline.`,
      ],
      creativeKeys: [c.key],
      priority: c.classification === "FATIGUED_WINNER" ? "HIGH" : "MEDIUM",
      learnings: relevantLearnings(c, learnings),
    });
  }
  for (const c of active.filter((x) => x.classification === "HIDDEN_WINNER" || x.classification === "HOOK_OPPORTUNITY").sort((a, b) => b.commercialScore - a.commercialScore).slice(0, 4)) {
    items.push({
      kind: "Create new hooks for a strong converter",
      title: `New hooks for "${c.meta.creativeName}"`,
      why: "Conversion core works; opening attention is the bottleneck.",
      evidence: [`${c.window.roas?.toFixed(2)}x ROAS, ${c.window.purchases} purchases.`, c.diagnosis.attention],
      creativeKeys: [c.key],
      priority: c.classification === "HIDDEN_WINNER" ? "HIGH" : "MEDIUM",
      learnings: relevantLearnings(c, learnings),
    });
  }
  for (const g of groups.concept.filter((x) => x.value !== "(untagged)" && x.eligible >= 3 && accRate !== null && (x.winnerRate ?? 0) >= accRate * 1.5).slice(0, 3)) {
    items.push({
      kind: "Produce more variants of a high-hit-rate concept",
      title: `More variants of concept "${g.value}"`,
      why: "Concept is associated with a higher winner rate in this account/sample.",
      evidence: [`${pctS(g.winnerRate, false)} winner rate across ${g.eligible} eligible vs ${pctS(accRate, false)} account.`, `${g.metrics.roas?.toFixed(2) ?? "n/a"}x ROAS on ${g.metrics.purchases ?? 0} purchases.`],
      creativeKeys: g.topCreativeKeys,
      priority: "HIGH",
      learnings: learnings.filter((l) => l.concept === g.value),
    });
  }
  for (const g of groups.format.filter((x) => x.value !== "(untagged)" && x.eligible >= 5 && accRate !== null && (x.winnerRate ?? 0) <= accRate * 0.5).slice(0, 2)) {
    items.push({
      kind: "Stop overproducing a weak format",
      title: `Reduce production of "${g.value}"`,
      why: "Format is associated with a low winner rate in this account/sample.",
      evidence: [`${pctS(g.winnerRate, false)} winner rate across ${g.eligible} eligible vs ${pctS(accRate, false)} account.`, `Decision-ready waste ${cur} ${Math.round(g.decisionReadyWaste).toLocaleString("en-US")}.`],
      creativeKeys: [],
      priority: "MEDIUM",
      learnings: learnings.filter((l) => l.format === g.value),
    });
  }
  const top3 = portfolio.concentration.find((c) => c.n === 3);
  const winnersAging = active.filter((c) => WINNER_CLASSES.includes(c.classification) && c.volume.purchaseShare >= 0.1);
  const lifespan = median(all.filter((c) => c.milestones.firstWinnerDate && !c.milestones.lifespanCensored).map((c) => c.milestones.winnerLifespanDays));
  if (top3 && top3.purchaseShare >= 0.5 && winnersAging.length) {
    const old = winnersAging.filter((c) => lifespan !== null && c.milestones.firstWinnerDate && c.ageDays >= lifespan * 0.7);
    if (old.length) {
      items.push({
        kind: "Replace aging concentration risk",
        title: `Brief replacements for ${old.length} aging top winner(s)`,
        why: "A few aging creatives carry most purchases.",
        evidence: [`Top 3 creatives carry ${pctS(top3.purchaseShare, false)} of purchases.`, `Median winner lifespan ${lifespan} days; these are ${old.map((c) => c.ageDays).join(", ")} days old.`],
        creativeKeys: old.map((c) => c.key),
        priority: "HIGH",
        learnings: [],
      });
    }
  }
  for (const c of active.filter((x) => x.decision === "ITERATE_CTA").slice(0, 2)) {
    items.push({
      kind: "Test alternative CTA",
      title: `New CTA / offer framing for "${c.meta.creativeName}"`,
      why: "Content holds attention but does not motivate the click.",
      evidence: [c.diagnosis.attention],
      creativeKeys: [c.key],
      priority: "MEDIUM",
      learnings: relevantLearnings(c, learnings),
    });
  }
  for (const c of active.filter((x) => x.classification === "ATTENTION_WINNER").sort((a, b) => b.window.spend - a.window.spend).slice(0, 2)) {
    items.push({
      kind: "Rebuild post-hook on an attention winner",
      title: `Keep the hook of "${c.meta.creativeName}", rebuild the body`,
      why: "Strong attention mechanism, weak commercial conversion.",
      evidence: [c.diagnosis.attention, c.diagnosis.conversion],
      creativeKeys: [c.key],
      priority: "MEDIUM",
      learnings: relevantLearnings(c, learnings),
    });
  }

  // capacity estimate (spec §87)
  const activeWinners = active.filter((c) => WINNER_CLASSES.includes(c.classification)).length;
  const needed = Math.max(activeWinners, 3);
  const rate = portfolio.hitRate.months.length ? avgRate(portfolio.hitRate.months) : accRate;
  let launchesPerWeek: number | null = null;
  if (lifespan && lifespan > 0 && rate && rate > 0) launchesPerWeek = needed / (lifespan / 7) / rate;
  const capacity: CapacityEstimate = {
    label: "PLANNING ESTIMATE",
    activeWinnersNeeded: needed,
    medianWinnerLifespanDays: lifespan,
    hitRate: rate,
    launchesPerWeek,
    text:
      launchesPerWeek === null
        ? "Not enough completed winner lifecycles to estimate production needs yet."
        : `To sustain ~${needed} active winners with a ${lifespan}-day median lifespan and a ${(rate! * 100).toFixed(0)}% hit rate, launch ≈ ${launchesPerWeek.toFixed(1)} eligible creatives per week. Planning estimate, not a guaranteed outcome.`,
  };

  // replacement risk (spec §88)
  const major = active.filter((c) => (WINNER_CLASSES.includes(c.classification) || c.classification === "FATIGUE_WATCH" || c.classification === "FATIGUED_WINNER") && c.volume.purchaseShare >= 0.05);
  const atRisk = major.filter(
    (c) => c.classification === "FATIGUE_WATCH" || c.classification === "FATIGUED_WINNER" || (lifespan !== null && c.milestones.firstWinnerDate !== null && c.milestones.winnerLifespanDays !== null && c.milestones.winnerLifespanDays >= lifespan * 0.75),
  ).length;
  const replacements = active.filter((c) => c.classification === "EMERGING_WINNER" || c.classification === "SCALE_CANDIDATE").length;
  const ratio = atRisk === 0 ? Infinity : replacements / atRisk;
  const status: ReplacementRisk["status"] = ratio >= 1.5 ? "HEALTHY_PIPELINE" : ratio >= 1 ? "THIN_PIPELINE" : ratio >= 0.5 ? "REPLACEMENT_RISK" : "CRITICAL_CREATIVE_PIPELINE";
  const replacement: ReplacementRisk = {
    status,
    majorWinners: major.length,
    atRisk,
    replacements,
    text: `${atRisk} of ${major.length} major winners may fatigue soon; ${replacements} emerging / scale candidates exist to replace them.`,
  };
  return { items, capacity, replacement };
}

function avgRate(points: { rate: number | null; eligible: number; winners: number }[]): number | null {
  const el = points.reduce((s, p) => s + p.eligible, 0);
  const w = points.reduce((s, p) => s + p.winners, 0);
  return el ? w / el : null;
}

function pctS(v: number | null, signed = true): string {
  if (v === null) return "n/a";
  const r = Math.round(v * 100);
  return signed ? `${r >= 0 ? "+" : ""}${r}%` : `${r}%`;
}
