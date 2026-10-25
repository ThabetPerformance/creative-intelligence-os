import { mean, median } from "./stats";
import { monthKey, weekStart } from "./dates";
import { LOSER_CLASSES, WINNER_CLASSES } from "./types";
import type { CreativeAnalysis } from "./model";

export type CohortType = "week" | "month" | "batch";

export interface CohortRow {
  type: CohortType;
  key: string;
  launched: number;
  eligible: number;
  winners: number;
  volumeWinners: number;
  scaleCandidates: number;
  emerging: number;
  losers: number;
  killCandidates: number;
  winnerRate: number | null;
  medianDaysToEvidence: number | null;
  medianDaysToWinner: number | null;
  medianSpendToEvidence: number | null;
  medianSpendToWinner: number | null;
  medianWinnerLifespan: number | null;
  spend: number;
  purchases: number;
  roas: number | null;
}

export function cohortKey(c: CreativeAnalysis, type: CohortType): string | null {
  const d = c.launchDate;
  if (type === "batch") return c.meta.batch ?? (d ? `(no batch) ${monthKey(d)}` : null);
  if (!d) return null;
  return type === "week" ? weekStart(d) : monthKey(d);
}

/** "Eligible" for hit rate = reached evidence, or spent enough to judge failure (spec §42). */
export function everEligible(c: CreativeAnalysis): boolean {
  return c.milestones.evidenceDate !== null || c.lifetimeEvidence.canJudgeFailure;
}

/**
 * Launch cohorts (spec §74). Outcome metrics are measured lifetime-to-asOf, so a cohort keeps
 * its result even after its creatives stop delivering.
 */
export function buildCohorts(creatives: CreativeAnalysis[], type: CohortType, launchedFrom?: string, launchedTo?: string): CohortRow[] {
  const groups = new Map<string, CreativeAnalysis[]>();
  for (const c of creatives) {
    if (!c.launchDate) continue;
    if (launchedFrom && c.launchDate < launchedFrom) continue;
    if (launchedTo && c.launchDate > launchedTo) continue;
    const k = cohortKey(c, type);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(c);
  }
  const rows: CohortRow[] = [];
  for (const [key, list] of groups) {
    const eligible = list.filter(everEligible);
    const winners = list.filter((c) => c.milestones.firstWinnerDate !== null);
    const spend = list.reduce((s, c) => s + c.lifetime.spend, 0);
    const value = list.reduce((s, c) => s + (c.lifetime.purchaseValue ?? 0), 0);
    rows.push({
      type,
      key,
      launched: list.length,
      eligible: eligible.length,
      winners: winners.length,
      volumeWinners: list.filter((c) => c.classification === "VOLUME_WINNER").length,
      scaleCandidates: list.filter((c) => c.classification === "SCALE_CANDIDATE").length,
      emerging: list.filter((c) => c.classification === "EMERGING_WINNER").length,
      losers: list.filter((c) => c.classification === "LOSER" || (!c.activeInWindow && c.milestones.killReadyDate !== null && !LOSER_CLASSES.includes(c.classification))).length,
      killCandidates: list.filter((c) => c.classification === "KILL_CANDIDATE").length,
      winnerRate: eligible.length ? winners.filter(everEligible).length / eligible.length : null,
      medianDaysToEvidence: median(list.map((c) => c.milestones.daysToEvidence)),
      medianDaysToWinner: median(winners.map((c) => c.milestones.daysToWinner)),
      medianSpendToEvidence: median(list.map((c) => c.milestones.spendToEvidence)),
      medianSpendToWinner: median(winners.map((c) => c.milestones.spendToWinner)),
      medianWinnerLifespan: median(winners.filter((c) => !c.milestones.lifespanCensored).map((c) => c.milestones.winnerLifespanDays)),
      spend,
      purchases: list.reduce((s, c) => s + (c.lifetime.purchases ?? 0), 0),
      roas: spend > 0 ? value / spend : null,
    });
  }
  return rows.sort((a, b) => (a.key < b.key ? 1 : -1));
}

export interface TestingEfficiency {
  tested: number;
  eligible: number;
  winnersFound: number;
  hitRate: number | null;
  avgSpendToEvidence: number | null;
  medianSpendToEvidence: number | null;
  avgSpendToWinner: number | null;
  costToFindWinner: number | null;
  medianDaysToClassification: number | null;
  learningSpend: number;
  text: string;
}

/** Creative testing efficiency (spec §77). Necessary evidence spend is not waste. */
export function testingEfficiency(creatives: CreativeAnalysis[], launchedFrom: string, launchedTo: string): TestingEfficiency {
  const tested = creatives.filter((c) => c.launchDate && c.launchDate >= launchedFrom && c.launchDate <= launchedTo);
  const eligible = tested.filter(everEligible);
  const winners = tested.filter((c) => c.milestones.firstWinnerDate !== null);
  const learning = tested.reduce((s, c) => s + (c.milestones.spendToEvidence ?? c.lifetime.spend), 0);
  const hitRate = eligible.length ? winners.filter(everEligible).length / eligible.length : null;
  return {
    tested: tested.length,
    eligible: eligible.length,
    winnersFound: winners.length,
    hitRate,
    avgSpendToEvidence: mean(tested.map((c) => c.milestones.spendToEvidence)),
    medianSpendToEvidence: median(tested.map((c) => c.milestones.spendToEvidence)),
    avgSpendToWinner: mean(winners.map((c) => c.milestones.spendToWinner)),
    costToFindWinner: winners.length ? learning / winners.length : null,
    medianDaysToClassification: median(tested.map((c) => c.milestones.daysToEvidence)),
    learningSpend: learning,
    text: winners.length
      ? `Testing ${tested.length} creatives found ${winners.length} winner(s); learning spend per winner found is ${Math.round(learning / winners.length).toLocaleString("en-US")}.`
      : `Testing ${tested.length} creatives has not produced a winner yet.`,
  };
}

export { WINNER_CLASSES };
