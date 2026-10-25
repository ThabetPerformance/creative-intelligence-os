import { addAgg, emptyAgg, metricsFromAgg, type Definitions, type Metrics } from "./metrics";
import { median } from "./stats";
import { WINNER_CLASSES } from "./types";
import type { CreativeAnalysis } from "./model";
import type { CreativeMeta } from "./types";

export const DIMENSIONS = {
  creator: "Creator",
  concept: "Concept",
  angle: "Angle",
  format: "Format",
  assetType: "Asset Type",
  hookTactic: "Hook Tactic",
  bodyTactic: "Body Tactic",
  headlineTactic: "Headline Tactic",
  primaryCopy: "Primary Copy",
  headline: "Headline",
  cta: "CTA",
  offer: "Offer",
  landingPage: "Landing Page",
  productName: "Product",
  persona: "Persona",
  platform: "Platform",
  batch: "Creative Batch",
} as const satisfies Partial<Record<keyof CreativeMeta, string>>;
export type Dimension = keyof typeof DIMENSIONS;

export interface GroupRow {
  dimension: Dimension;
  value: string;
  creatives: number;
  activeCreatives: number;
  eligible: number;
  winners: number;
  everWinners: number;
  winnerRate: number | null;
  everWinnerRate: number | null;
  volumeWinners: number;
  metrics: Metrics;
  spendShare: number;
  purchaseShare: number;
  medianTimeToWinner: number | null;
  medianWinnerLifespan: number | null;
  medianSpendToWinner: number | null;
  decisionReadyWaste: number;
  sampleWarning: string | null;
  association: string | null;
  topCreativeKeys: string[];
}

/**
 * Group creatives by a metadata dimension. Commercial metrics first. Language is associative,
 * never causal (spec §81, §123).
 */
export function groupBy(
  creatives: CreativeAnalysis[],
  dim: Dimension,
  defs: Definitions,
  accountWinnerRate: number | null,
  accountRoas: number | null,
): GroupRow[] {
  const groups = new Map<string, CreativeAnalysis[]>();
  for (const c of creatives) {
    const raw = c.meta[dim as keyof CreativeMeta];
    const v = typeof raw === "string" && raw.trim() ? raw.trim() : "(untagged)";
    if (!groups.has(v)) groups.set(v, []);
    groups.get(v)!.push(c);
  }
  const totalSpend = creatives.reduce((s, c) => s + c.window.spend, 0);
  const totalPurch = creatives.reduce((s, c) => s + (c.window.purchases ?? 0), 0);
  const rows: GroupRow[] = [];
  for (const [value, list] of groups) {
    const agg = emptyAgg();
    for (const c of list) if (c.activeInWindow) addAgg(agg, c.windowAgg);
    const m = metricsFromAgg(agg, defs);
    const active = list.filter((c) => c.activeInWindow);
    const eligible = active.filter((c) => c.evidence.level !== "LOW");
    const winners = eligible.filter((c) => WINNER_CLASSES.includes(c.classification));
    const everJudged = list.filter((c) => c.milestones.evidenceDate !== null || c.lifetimeEvidence.canJudgeFailure);
    const everWinners = list.filter((c) => c.milestones.firstWinnerDate !== null);
    const winnerRate = eligible.length ? winners.length / eligible.length : null;
    const everWinnerRate = everJudged.length ? everWinners.length / everJudged.length : null;
    let sampleWarning: string | null = null;
    if (eligible.length < 3 && everJudged.length < 3) sampleWarning = `Small sample: ${Math.max(eligible.length, everJudged.length)} eligible creative(s).`;
    else if (eligible.length < 5) sampleWarning = `Limited sample: ${eligible.length} eligible creatives in this period.`;
    let association: string | null = null;
    if (!sampleWarning && accountWinnerRate !== null && winnerRate !== null && accountRoas !== null && m.roas !== null) {
      const dir = m.roas >= accountRoas ? "stronger" : "weaker";
      association = `${DIMENSIONS[dim]} "${value}" is associated with ${dir} ROAS (${m.roas.toFixed(2)}x vs ${accountRoas.toFixed(2)}x account) and a ${(winnerRate * 100).toFixed(0)}% winner rate across ${eligible.length} eligible creatives (account ${(accountWinnerRate * 100).toFixed(0)}%), in this account/sample.`;
    }
    rows.push({
      dimension: dim,
      value,
      creatives: list.length,
      activeCreatives: active.length,
      eligible: eligible.length,
      winners: winners.length,
      everWinners: everWinners.length,
      winnerRate,
      everWinnerRate,
      volumeWinners: active.filter((c) => c.classification === "VOLUME_WINNER" || (c.classification === "PROVEN_WINNER" && c.volume.tier === "HIGH")).length,
      metrics: m,
      spendShare: totalSpend > 0 ? m.spend / totalSpend : 0,
      purchaseShare: totalPurch > 0 ? (m.purchases ?? 0) / totalPurch : 0,
      medianTimeToWinner: median(everWinners.map((c) => c.milestones.daysToWinner)),
      medianWinnerLifespan: median(everWinners.filter((c) => !c.milestones.lifespanCensored).map((c) => c.milestones.winnerLifespanDays)),
      medianSpendToWinner: median(everWinners.map((c) => c.milestones.spendToWinner)),
      decisionReadyWaste: list.reduce((s, c) => s + c.decisionReadyWaste, 0),
      sampleWarning,
      association,
      topCreativeKeys: [...active].sort((a, b) => b.commercialScore - a.commercialScore).slice(0, 5).map((c) => c.key),
    });
  }
  // Commercial ordering: target-relative purchase value, not ROAS alone.
  return rows.sort((a, b) => (b.metrics.purchases ?? 0) * (b.metrics.roas ?? 0) - (a.metrics.purchases ?? 0) * (a.metrics.roas ?? 0));
}
