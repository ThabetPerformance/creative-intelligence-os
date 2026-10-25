import type { AccountSettingsInput, ResolvedTarget, TargetRegime } from "./types";

/**
 * Resolve the business target that was active on a date (spec §9, §128).
 * The regime with the latest start date that covers the date wins. When no regime covers
 * the date, the account's current settings are used and the source says so.
 */
export function resolveTarget(date: string, regimes: TargetRegime[], settings: Pick<AccountSettingsInput, "targetRoas" | "cpoGuardrail">): ResolvedTarget {
  let best: TargetRegime | null = null;
  for (const r of regimes) {
    if (r.startDate <= date && (r.endDate === null || r.endDate >= date)) {
      if (!best || r.startDate > best.startDate) best = r;
    }
  }
  if (best) {
    return { targetRoas: best.targetRoas, cpoGuardrail: best.cpoGuardrail ?? settings.cpoGuardrail, source: "TARGETS_HISTORY", regimeStart: best.startDate };
  }
  return { targetRoas: settings.targetRoas, cpoGuardrail: settings.cpoGuardrail, source: "ACCOUNT_SETTINGS", regimeStart: null };
}

/** Evidence spend threshold (spec §23): explicit spend, or Target CPO × configurable multiple. */
export function evidenceSpendThreshold(settings: AccountSettingsInput, target: ResolvedTarget): number {
  if (settings.evidenceSpendMultiple && settings.evidenceSpendMultiple > 0 && target.cpoGuardrail && target.cpoGuardrail > 0) {
    return target.cpoGuardrail * settings.evidenceSpendMultiple;
  }
  return settings.minEvidenceSpend;
}
