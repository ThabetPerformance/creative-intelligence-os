import type { EvidenceLevel } from "./types";

export interface EvidenceInput {
  purchases: number | null;
  spend: number;
  daysLive: number;
}

export interface EvidenceThresholds {
  minPurchases: number;
  evidenceSpend: number;
  minDaysLive: number;
}

export interface EvidenceResult {
  level: EvidenceLevel;
  purchasesMet: boolean;
  spendMet: boolean;
  daysMet: boolean;
  /** Enough spend to judge failure even without purchases (losers rarely reach the purchase threshold). */
  canJudgeFailure: boolean;
  text: string;
}

/**
 * Evidence gate (spec §22).
 * HIGH: purchases ≥ threshold AND spend ≥ evidence spend. MEDIUM: one of the two. LOW: neither.
 */
export function evidenceGate(input: EvidenceInput, t: EvidenceThresholds): EvidenceResult {
  const purchasesMet = (input.purchases ?? 0) >= t.minPurchases;
  const spendMet = input.spend >= t.evidenceSpend;
  const daysMet = input.daysLive >= t.minDaysLive;
  const level: EvidenceLevel = purchasesMet && spendMet ? "HIGH" : purchasesMet || spendMet ? "MEDIUM" : "LOW";
  const p = input.purchases === null ? "purchases UNAVAILABLE" : `${fmt(input.purchases)} purchases (threshold ${t.minPurchases})`;
  const s = `spend ${fmt(input.spend)} (evidence spend ${fmt(t.evidenceSpend)})`;
  return {
    level,
    purchasesMet,
    spendMet,
    daysMet,
    canJudgeFailure: spendMet && daysMet,
    text: `${level} evidence — ${p}; ${s}; ${input.daysLive} days live (min ${t.minDaysLive}).`,
  };
}

function fmt(n: number): string {
  return Math.abs(n) >= 100 ? Math.round(n).toLocaleString("en-US") : String(Math.round(n * 100) / 100);
}
