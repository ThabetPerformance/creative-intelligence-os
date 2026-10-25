import type { Metrics } from "./metrics";
import type { CreativeEventInput, Reason } from "./types";

export interface TrackingResult {
  risk: boolean;
  /** ROAS must not be trusted for this creative in this window. */
  roasUnreliable: boolean;
  flags: Reason[];
}

/**
 * Measurement gate (spec §94). Runs before ROAS is trusted. When ROAS is unreliable the creative
 * becomes TRACKING RISK and decisions fall back to purchases / CPO / CVR.
 */
export function measurementGate(
  win: Metrics,
  c7: Metrics,
  lifetime: Metrics,
  evidenceSpend: number,
  events: CreativeEventInput[],
  window: { from: string; to: string },
): TrackingResult {
  const flags: Reason[] = [];
  let roasUnreliable = false;
  const purchases = win.purchases ?? 0;

  if (purchases > 0 && (win.purchaseValue === null || win.purchaseValue === 0)) {
    flags.push({ text: `${purchases} purchases recorded but purchase value is ${win.purchaseValue === null ? "missing" : "0"}.`, status: "FACT" });
    roasUnreliable = true;
  } else if (purchases >= 3 && win.valueGap) {
    flags.push({ text: "Purchase value missing or zero on some purchase days — ROAS understated.", status: "FACT" });
    roasUnreliable = true;
  }
  if ((c7.purchases ?? 0) >= 5 && c7.aov !== null && lifetime.aov !== null && lifetime.aov > 0 && c7.aov < lifetime.aov * 0.25) {
    flags.push({ text: `Purchase value collapse: 7D AOV is ${Math.round((c7.aov / lifetime.aov) * 100)}% of lifetime AOV.`, status: "FACT" });
    roasUnreliable = true;
  }
  if (win.currencyMismatch) {
    flags.push({ text: "Rows reported in a currency different from the account currency.", status: "FACT" });
    roasUnreliable = true;
  }
  if (win.purchases === null && win.spend >= evidenceSpend) {
    flags.push({ text: "Purchase events missing (UNAVAILABLE) despite meaningful spend.", status: "FACT" });
    roasUnreliable = true;
  }
  if (win.clicks !== null && win.impressions !== null && win.clicks > win.impressions) {
    flags.push({ text: "Impossible rate: clicks exceed impressions.", status: "FACT" });
  }
  if (win.ctr !== null && win.ctr > 0.5) flags.push({ text: "Impossible rate: CTR above 50%.", status: "FACT" });
  if (win.cvr !== null && win.cvr > 1) {
    flags.push({ text: "Impossible rate: more purchases than CVR denominator.", status: "FACT" });
    roasUnreliable = true;
  }
  for (const e of events) {
    if (/tracking/i.test(e.eventType) && e.date >= window.from && e.date <= window.to) {
      flags.push({ text: `Tracking change logged on ${e.date}: possible discontinuity.`, status: "FACT" });
    }
  }
  return { risk: roasUnreliable, roasUnreliable, flags };
}
