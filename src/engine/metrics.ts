/**
 * Metric engine — deterministic formulas.
 *
 * Missing source data is UNAVAILABLE (null), never 0. Every ratio only pairs a numerator with
 * the denominator from the same days on which both were reported.
 */

/** One day of (creative × date) performance, already summed across the ads of that creative. */
export interface DayRow {
  date: string;
  spend: number;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  outboundClicks: number | null;
  landingPageViews: number | null;
  addToCart: number | null;
  checkouts: number | null;
  purchases: number | null;
  purchaseValue: number | null;
  video1s: number | null;
  video3s: number | null;
  video25: number | null;
  video50: number | null;
  video75: number | null;
  video100: number | null;
  /** Native platform hook rate (0..1), impression-weighted when several ads are combined. */
  hookRate: number | null;
  /** Native platform hold rate (0..1). */
  holdRate: number | null;
  /** Native platform frequency. */
  frequency: number | null;
  /** True when any underlying row had a currency different from the account currency. */
  currencyMismatch?: boolean;
}

/** Field layout of the aggregate vector. Kept flat so prefix sums are cheap. */
export const F = {
  spend: 0,
  impressions: 1,
  reach: 2,
  clicks: 3,
  outbound: 4,
  lpv: 5,
  atc: 6,
  checkouts: 7,
  purchases: 8,
  value: 9,
  v1s: 10,
  v3s: 11,
  v25: 12,
  v50: 13,
  v75: 14,
  v100: 15,
  imprV3: 16,
  hookNum: 17,
  hookDen: 18,
  holdNum: 19,
  holdDen: 20,
  freqNum: 21,
  freqDen: 22,
  purchLpv: 23,
  purchOut: 24,
  purchClk: 25,
  imprOut: 26,
  imprClk: 27,
  activeDays: 28,
  // availability counters (number of days the field was reported)
  nImpressions: 29,
  nReach: 30,
  nClicks: 31,
  nOutbound: 32,
  nLpv: 33,
  nAtc: 34,
  nCheckouts: 35,
  nPurchases: 36,
  nValue: 37,
  nV1s: 38,
  nV3s: 39,
  nV25: 40,
  nV50: 41,
  nV75: 42,
  nV100: 43,
  purchWithValue: 44,
  zeroValuePurchDays: 45,
  currencyMismatchDays: 46,
  imprReach: 47,
} as const;
export const FIELD_COUNT = 48;

export type Agg = Float64Array;

export function emptyAgg(): Agg {
  return new Float64Array(FIELD_COUNT);
}

export function addDayToAgg(a: Agg, d: DayRow): void {
  const n = (v: number | null) => (v === null || v === undefined || Number.isNaN(v) ? null : v);
  const spend = d.spend || 0;
  a[F.spend] += spend;
  if (spend > 0) a[F.activeDays] += 1;
  const impr = n(d.impressions);
  if (impr !== null) {
    a[F.impressions] += impr;
    a[F.nImpressions] += 1;
  }
  const reach = n(d.reach);
  if (reach !== null) {
    a[F.reach] += reach;
    a[F.nReach] += 1;
    if (impr !== null) a[F.imprReach] += impr;
  }
  const clicks = n(d.clicks);
  if (clicks !== null) {
    a[F.clicks] += clicks;
    a[F.nClicks] += 1;
    if (impr !== null) a[F.imprClk] += impr;
  }
  const out = n(d.outboundClicks);
  if (out !== null) {
    a[F.outbound] += out;
    a[F.nOutbound] += 1;
    if (impr !== null) a[F.imprOut] += impr;
  }
  const lpv = n(d.landingPageViews);
  if (lpv !== null) {
    a[F.lpv] += lpv;
    a[F.nLpv] += 1;
  }
  const atc = n(d.addToCart);
  if (atc !== null) {
    a[F.atc] += atc;
    a[F.nAtc] += 1;
  }
  const co = n(d.checkouts);
  if (co !== null) {
    a[F.checkouts] += co;
    a[F.nCheckouts] += 1;
  }
  const p = n(d.purchases);
  if (p !== null) {
    a[F.purchases] += p;
    a[F.nPurchases] += 1;
    if (lpv !== null) a[F.purchLpv] += p;
    if (out !== null) a[F.purchOut] += p;
    if (clicks !== null) a[F.purchClk] += p;
  }
  const v = n(d.purchaseValue);
  if (v !== null) {
    a[F.value] += v;
    a[F.nValue] += 1;
    if (p !== null) a[F.purchWithValue] += p;
    if (p !== null && p > 0 && v === 0) a[F.zeroValuePurchDays] += 1;
  }
  const vids: [keyof DayRow, number, number][] = [
    ["video1s", F.v1s, F.nV1s],
    ["video3s", F.v3s, F.nV3s],
    ["video25", F.v25, F.nV25],
    ["video50", F.v50, F.nV50],
    ["video75", F.v75, F.nV75],
    ["video100", F.v100, F.nV100],
  ];
  for (const [k, fi, ni] of vids) {
    const x = n(d[k] as number | null);
    if (x !== null) {
      a[fi] += x;
      a[ni] += 1;
    }
  }
  if (n(d.video3s) !== null && impr !== null) a[F.imprV3] += impr;
  const hr = n(d.hookRate);
  if (hr !== null && impr !== null) {
    a[F.hookNum] += hr * impr;
    a[F.hookDen] += impr;
  }
  const hd = n(d.holdRate);
  if (hd !== null && impr !== null) {
    a[F.holdNum] += hd * impr;
    a[F.holdDen] += impr;
  }
  const fq = n(d.frequency);
  if (fq !== null && impr !== null) {
    a[F.freqNum] += fq * impr;
    a[F.freqDen] += impr;
  }
  if (d.currencyMismatch) a[F.currencyMismatchDays] += 1;
}

export function addAgg(target: Agg, src: Agg): void {
  for (let i = 0; i < FIELD_COUNT; i++) target[i] += src[i];
}

/** Safe division. Returns null when the denominator is 0 or either side is unavailable. */
export function safeDiv(num: number | null, den: number | null): number | null {
  if (num === null || den === null || !Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
  return num / den;
}

// ---------------------------------------------------------------------------
// Core formulas (spec §19). Exported individually so they can be unit tested.
// ---------------------------------------------------------------------------
export const roas = (purchaseValue: number | null, spend: number) => safeDiv(purchaseValue, spend);
export const cpo = (spend: number, purchases: number | null) => safeDiv(spend, purchases);
export const cpc = (spend: number, clicks: number | null) => safeDiv(spend, clicks);
export const cpm = (spend: number, impressions: number | null) => {
  const r = safeDiv(spend, impressions);
  return r === null ? null : r * 1000;
};
export const ctr = (clicks: number | null, impressions: number | null) => safeDiv(clicks, impressions);

export type CvrDefinition = "LPV" | "OUTBOUND" | "CLICKS";
export type CtrDefinition = "OUTBOUND" | "ALL_CLICKS";
export type HookDefinition = "VIDEO_3S_PER_IMPRESSION" | "NATIVE";
export type HoldDefinition = "NATIVE" | "VIDEO_50_PER_3S";

export const CVR_LABEL: Record<CvrDefinition, string> = {
  LPV: "Purchases ÷ Landing Page Views",
  OUTBOUND: "Purchases ÷ Outbound Clicks",
  CLICKS: "Purchases ÷ Clicks",
};
export const CTR_LABEL: Record<CtrDefinition, string> = {
  OUTBOUND: "Outbound Clicks ÷ Impressions",
  ALL_CLICKS: "Clicks ÷ Impressions",
};
export const HOOK_LABEL: Record<HookDefinition, string> = {
  VIDEO_3S_PER_IMPRESSION: "3-second views ÷ Impressions",
  NATIVE: "Platform-native hook rate",
};
export const HOLD_LABEL: Record<HoldDefinition, string> = {
  NATIVE: "Platform-native hold rate",
  VIDEO_50_PER_3S: "50% views ÷ 3-second views",
};

export interface Definitions {
  cvr: CvrDefinition;
  ctr: CtrDefinition;
  hook: HookDefinition;
  hold: HoldDefinition;
}

/**
 * Choose one CVR / CTR / hook / hold definition per scope (account or platform) and keep it.
 * Preferred CVR: LPV, fallback Outbound, fallback Clicks. A definition is chosen when its
 * denominator was reported on at least 80% of the purchase-reporting days.
 */
export function chooseDefinitions(total: Agg): Definitions {
  const base = Math.max(1, total[F.nPurchases]);
  const cvr: CvrDefinition =
    total[F.nLpv] / base >= 0.8 && total[F.lpv] > 0 ? "LPV" : total[F.nOutbound] / base >= 0.8 && total[F.outbound] > 0 ? "OUTBOUND" : "CLICKS";
  const ctrDef: CtrDefinition = total[F.nOutbound] / Math.max(1, total[F.nImpressions]) >= 0.8 && total[F.outbound] > 0 ? "OUTBOUND" : "ALL_CLICKS";
  const hook: HookDefinition = total[F.imprV3] >= total[F.hookDen] && total[F.imprV3] > 0 ? "VIDEO_3S_PER_IMPRESSION" : "NATIVE";
  const hold: HoldDefinition = total[F.holdDen] > 0 ? "NATIVE" : "VIDEO_50_PER_3S";
  return { cvr, ctr: ctrDef, hook, hold };
}

export interface Metrics {
  spend: number;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  outboundClicks: number | null;
  landingPageViews: number | null;
  addToCart: number | null;
  checkouts: number | null;
  purchases: number | null;
  purchaseValue: number | null;
  roas: number | null;
  cpo: number | null;
  cpc: number | null;
  cpm: number | null;
  ctr: number | null;
  cvr: number | null;
  aov: number | null;
  hookRate: number | null;
  holdRate: number | null;
  frequency: number | null;
  video1s: number | null;
  video3s: number | null;
  video25: number | null;
  video50: number | null;
  video75: number | null;
  video100: number | null;
  activeDays: number;
  /** True when purchases exist but purchase value is missing or zero on purchase days. */
  valueGap: boolean;
  currencyMismatch: boolean;
}

const nz = (sum: number, count: number) => (count > 0 ? sum : null);

export function metricsFromAgg(a: Agg, defs: Definitions): Metrics {
  const spend = a[F.spend];
  const impressions = nz(a[F.impressions], a[F.nImpressions]);
  const clicks = nz(a[F.clicks], a[F.nClicks]);
  const outbound = nz(a[F.outbound], a[F.nOutbound]);
  const lpv = nz(a[F.lpv], a[F.nLpv]);
  const purchases = nz(a[F.purchases], a[F.nPurchases]);
  const value = nz(a[F.value], a[F.nValue]);
  const v3 = nz(a[F.v3s], a[F.nV3s]);
  const v50 = nz(a[F.v50], a[F.nV50]);

  let cvrVal: number | null = null;
  if (defs.cvr === "LPV") cvrVal = a[F.nLpv] > 0 ? safeDiv(a[F.purchLpv], a[F.lpv]) : null;
  else if (defs.cvr === "OUTBOUND") cvrVal = a[F.nOutbound] > 0 ? safeDiv(a[F.purchOut], a[F.outbound]) : null;
  else cvrVal = a[F.nClicks] > 0 ? safeDiv(a[F.purchClk], a[F.clicks]) : null;

  const ctrVal =
    defs.ctr === "OUTBOUND"
      ? a[F.nOutbound] > 0
        ? safeDiv(a[F.outbound], a[F.imprOut])
        : null
      : a[F.nClicks] > 0
        ? safeDiv(a[F.clicks], a[F.imprClk])
        : null;

  let hook: number | null = null;
  if (defs.hook === "VIDEO_3S_PER_IMPRESSION") hook = a[F.nV3s] > 0 ? safeDiv(a[F.v3s], a[F.imprV3]) : null;
  else hook = safeDiv(a[F.hookNum], a[F.hookDen]);

  let hold: number | null = null;
  if (defs.hold === "NATIVE") hold = safeDiv(a[F.holdNum], a[F.holdDen]);
  else hold = v3 !== null && v50 !== null ? safeDiv(v50, v3) : null;

  const frequency = a[F.freqDen] > 0 ? safeDiv(a[F.freqNum], a[F.freqDen]) : a[F.nReach] > 0 ? safeDiv(a[F.imprReach], a[F.reach]) : null;

  const valueGap = (purchases ?? 0) > 0 && (value === null || a[F.zeroValuePurchDays] > 0 || a[F.purchWithValue] < (purchases ?? 0));
  // ROAS is only computed on the purchase value that was actually reported.
  const roasVal = value === null ? null : roas(value, spend);

  return {
    spend,
    impressions,
    reach: nz(a[F.reach], a[F.nReach]),
    clicks,
    outboundClicks: outbound,
    landingPageViews: lpv,
    addToCart: nz(a[F.atc], a[F.nAtc]),
    checkouts: nz(a[F.checkouts], a[F.nCheckouts]),
    purchases,
    purchaseValue: value,
    roas: roasVal,
    cpo: cpo(spend, purchases),
    cpc: cpc(spend, defs.ctr === "OUTBOUND" ? outbound : clicks),
    cpm: cpm(spend, impressions),
    ctr: ctrVal,
    cvr: cvrVal,
    aov: safeDiv(value, a[F.purchWithValue] || null),
    hookRate: hook,
    holdRate: hold,
    frequency,
    video1s: nz(a[F.v1s], a[F.nV1s]),
    video3s: v3,
    video25: nz(a[F.v25], a[F.nV25]),
    video50: v50,
    video75: nz(a[F.v75], a[F.nV75]),
    video100: nz(a[F.v100], a[F.nV100]),
    activeDays: a[F.activeDays],
    valueGap,
    currencyMismatch: a[F.currencyMismatchDays] > 0,
  };
}

/** Relative change (current / previous − 1). Null when previous is unavailable or zero. */
export function pctChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return current / previous - 1;
}
