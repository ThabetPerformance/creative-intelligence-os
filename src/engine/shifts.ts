import { addDays } from "./dates";
import { assessEconomics, isFailure, tierAtLeast, type EngineConfig } from "./econ";
import type { AnalysisContext, CreativeAnalysis } from "./model";

export const SHIFT_KINDS = [
  "NEW_WINNERS",
  "SCALING",
  "DECLINING",
  "FATIGUING",
  "RECOVERING",
  "PAUSED_WINNERS",
  "HIDDEN_OPPORTUNITIES",
  "NEW_LOSERS",
] as const;
export type ShiftKind = (typeof SHIFT_KINDS)[number];

export interface ShiftEntry {
  key: string;
  name: string;
  detail: string;
}

/** Performance shifts, current 7D vs previous 7D (spec §72). */
export function performanceShifts(all: CreativeAnalysis[], ctx: AnalysisContext, cfg: EngineConfig): Record<ShiftKind, ShiftEntry[]> {
  const out = Object.fromEntries(SHIFT_KINDS.map((k) => [k, [] as ShiftEntry[]])) as Record<ShiftKind, ShiftEntry[]>;
  const weekAgo = addDays(ctx.asOf, -7);
  const twoWeeksAgo = addDays(ctx.asOf, -14);
  const minSpend = ctx.evidenceSpend * 0.25;
  const pc = (v: number | null) => (v === null ? "n/a" : `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`);
  for (const c of all) {
    const e7 = assessEconomics(c.c7, ctx.target, cfg, c.tracking.roasUnreliable);
    const ep7 = assessEconomics(c.p7, ctx.target, cfg, c.tracking.roasUnreliable);
    const roasCh = c.c7.roas !== null && c.p7.roas ? c.c7.roas / c.p7.roas - 1 : null;
    const spendCh = c.p7.spend > 0 ? c.c7.spend / c.p7.spend - 1 : null;
    const name = c.meta.creativeName;
    if (c.milestones.firstWinnerDate && c.milestones.firstWinnerDate > weekAgo) out.NEW_WINNERS.push({ key: c.key, name, detail: `Qualified as winner on ${c.milestones.firstWinnerDate}.` });
    if (c.c7.spend >= minSpend && spendCh !== null && spendCh >= 0.3 && roasCh !== null && roasCh >= -0.1 && tierAtLeast(e7.tier, "ACCEPTABLE"))
      out.SCALING.push({ key: c.key, name, detail: `Spend ${pc(spendCh)}, ROAS ${pc(roasCh)}.` });
    if (c.c7.spend >= minSpend && c.p7.spend >= minSpend && roasCh !== null && roasCh <= -0.2 && c.fatigue.status === "NOT_APPLICABLE")
      out.DECLINING.push({ key: c.key, name, detail: `7D ROAS ${pc(roasCh)} vs previous 7D.` });
    if (c.fatigue.eligible && (c.fatigue.status === "WATCH" || c.fatigue.status === "MATERIAL" || c.fatigue.status === "SEVERE"))
      out.FATIGUING.push({ key: c.key, name, detail: c.fatigue.text });
    if (c.c7.spend >= minSpend && c.p7.spend >= minSpend && (isFailure(ep7.tier) || ep7.tier === "BELOW") && tierAtLeast(e7.tier, "ACCEPTABLE"))
      out.RECOVERING.push({ key: c.key, name, detail: `Economics ${ep7.tier.toLowerCase()} → ${e7.tier.toLowerCase()}.` });
    if (c.milestones.firstWinnerDate && c.c7.spend === 0 && c.milestones.lastSpendDate && c.milestones.lastSpendDate >= addDays(ctx.asOf, -30))
      out.PAUSED_WINNERS.push({ key: c.key, name, detail: `Historical winner, last spend ${c.milestones.lastSpendDate}.` });
    if (c.activeInWindow && (c.classification === "HIDDEN_WINNER" || c.classification === "HOOK_OPPORTUNITY"))
      out.HIDDEN_OPPORTUNITIES.push({ key: c.key, name, detail: c.diagnosis.recommendation });
    if (c.milestones.killReadyDate && c.milestones.killReadyDate > twoWeeksAgo && c.c7.spend > 0)
      out.NEW_LOSERS.push({ key: c.key, name, detail: `Became decision-ready to cut on ${c.milestones.killReadyDate}.` });
  }
  return out;
}
