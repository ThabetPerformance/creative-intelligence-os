import type { Metrics } from "./metrics";
import type { FatigueSensitivity, ResolvedTarget } from "./types";

/**
 * Engine configuration. These are starting bands relative to the account's own target,
 * never universal currency or ROAS thresholds. Documented in CREATIVE_CLASSIFICATION_ENGINE.md.
 */
export interface EngineConfig {
  strongRoasRatio: number;
  acceptableRoasRatio: number;
  belowRoasRatio: number;
  severeRoasRatio: number;
  strongCpoRatio: number;
  acceptableCpoRatio: number;
  belowCpoRatio: number;
  severeCpoRatio: number;
  highPct: number;
  lowPct: number;
  volumeShareHigh: number;
  volumePctHigh: number;
  scaleStepPct: number;
  emergingExtraDays: number;
  fatigueFactor: number;
}

export const DEFAULT_CONFIG: EngineConfig = {
  strongRoasRatio: 1.0, // ROAS ≥ target
  acceptableRoasRatio: 0.9, // within 10% of target
  belowRoasRatio: 0.7, // 70–90% of target = below but not material
  severeRoasRatio: 0.5,
  strongCpoRatio: 1.0,
  acceptableCpoRatio: 1.15,
  belowCpoRatio: 1.4,
  severeCpoRatio: 2.0,
  highPct: 0.65,
  lowPct: 0.35,
  volumeShareHigh: 0.05,
  volumePctHigh: 0.8,
  scaleStepPct: 0.3,
  emergingExtraDays: 7,
  fatigueFactor: 1,
};

export function configFor(sensitivity: FatigueSensitivity): EngineConfig {
  const fatigueFactor = sensitivity === "LOW" ? 1.3 : sensitivity === "HIGH" ? 0.75 : 1;
  return { ...DEFAULT_CONFIG, fatigueFactor };
}

export type EconTier = "STRONG" | "ACCEPTABLE" | "BELOW" | "MATERIAL" | "SEVERE" | "UNKNOWN";

export interface EconResult {
  tier: EconTier;
  roasRatio: number | null;
  cpoRatio: number | null;
  /** True when CPO had to be bounded from spend because there were no purchases. */
  cpoLowerBound: boolean;
}

const TIER_ORDER: Record<EconTier, number> = { STRONG: 5, ACCEPTABLE: 4, BELOW: 3, MATERIAL: 2, SEVERE: 1, UNKNOWN: 0 };

export function tierAtLeast(t: EconTier, min: EconTier): boolean {
  return t !== "UNKNOWN" && TIER_ORDER[t] >= TIER_ORDER[min];
}

export function isFailure(t: EconTier): boolean {
  return t === "MATERIAL" || t === "SEVERE";
}

/**
 * Business economics vs the active target. ROAS and CPO are both assessed; strength needs both,
 * failure needs either. When ROAS is untrustworthy (ignoreRoas), CPO alone decides.
 */
export function assessEconomics(m: Metrics, target: ResolvedTarget, cfg: EngineConfig, ignoreRoas = false): EconResult {
  const roasRatio = !ignoreRoas && m.roas !== null && target.targetRoas > 0 ? m.roas / target.targetRoas : null;
  let cpoRatio: number | null = null;
  let cpoLowerBound = false;
  if (target.cpoGuardrail && target.cpoGuardrail > 0) {
    if (m.cpo !== null) cpoRatio = m.cpo / target.cpoGuardrail;
    else if (m.purchases === 0 && m.spend > 0) {
      cpoRatio = m.spend / target.cpoGuardrail; // at least this bad
      cpoLowerBound = true;
    }
  }
  if (roasRatio === null && cpoRatio === null) return { tier: "UNKNOWN", roasRatio, cpoRatio, cpoLowerBound };

  const r = roasRatio;
  const c = cpoRatio;
  const roasTier: EconTier | null =
    r === null ? null : r >= cfg.strongRoasRatio ? "STRONG" : r >= cfg.acceptableRoasRatio ? "ACCEPTABLE" : r >= cfg.belowRoasRatio ? "BELOW" : r >= cfg.severeRoasRatio ? "MATERIAL" : "SEVERE";
  let cpoTier: EconTier | null =
    c === null ? null : c <= cfg.strongCpoRatio ? "STRONG" : c <= cfg.acceptableCpoRatio ? "ACCEPTABLE" : c <= cfg.belowCpoRatio ? "BELOW" : c <= cfg.severeCpoRatio ? "MATERIAL" : "SEVERE";
  // A lower-bound CPO (no purchases yet) can only prove failure, not success.
  if (cpoLowerBound && cpoTier && TIER_ORDER[cpoTier] > TIER_ORDER.BELOW) cpoTier = null;

  let tier: EconTier;
  if (roasTier && cpoTier) tier = TIER_ORDER[roasTier] <= TIER_ORDER[cpoTier] ? roasTier : cpoTier;
  else tier = (roasTier ?? cpoTier) as EconTier;
  if (!tier) tier = "UNKNOWN";
  return { tier, roasRatio, cpoRatio, cpoLowerBound };
}
