import type { DayRow } from "../src/engine/metrics";
import type { AccountSettingsInput, CreativeInput, CreativeMeta, TargetRegime } from "../src/engine/types";
import { addDays } from "../src/engine/dates";
import { analyzeAccount, type AnalyzeInput } from "../src/engine/analyze";

export const SETTINGS: AccountSettingsInput = {
  currency: "USD",
  targetRoas: 2.0,
  cpoGuardrail: 30,
  grossMargin: null,
  minPurchases: 10,
  minEvidenceSpend: 300,
  evidenceSpendMultiple: null,
  minDaysLive: 5,
  freshnessWindowDays: 30,
  fatigueSensitivity: "MEDIUM",
};

export interface DayParams {
  spend: number;
  cpm?: number;
  ctr?: number; // all clicks / impressions
  cvr?: number; // purchases / LPV
  aov?: number;
  hook?: number; // 3s / impressions
  hold?: number; // 50% / 3s
  freq?: number;
  zeroValue?: boolean;
  purchases?: number;
  value?: number;
}

/** Deterministic day row from funnel parameters. purchases = LPV × CVR (fractional is fine). */
export function day(date: string, p: DayParams): DayRow {
  const cpm = p.cpm ?? 12;
  const impressions = (p.spend / cpm) * 1000;
  const clicks = impressions * (p.ctr ?? 0.012);
  const outbound = clicks * 0.8;
  const lpv = outbound * 0.85;
  const purchases = p.purchases ?? lpv * (p.cvr ?? 0.045);
  const aov = p.aov ?? 60;
  const v3 = impressions * (p.hook ?? 0.25);
  const v25 = v3 * 0.5;
  const v50 = v3 * (p.hold ?? 0.3);
  return {
    date,
    spend: p.spend,
    impressions,
    reach: impressions / (p.freq ?? 1.5),
    clicks,
    outboundClicks: outbound,
    landingPageViews: lpv,
    addToCart: purchases * 3,
    checkouts: purchases * 1.6,
    purchases,
    purchaseValue: p.zeroValue ? 0 : (p.value ?? purchases * aov),
    video1s: impressions * 0.5,
    video3s: v3,
    video25: v25,
    video50: v50,
    video75: v50 * 0.6,
    video100: v50 * 0.35,
    hookRate: null,
    holdRate: null,
    frequency: p.freq ?? 1.5,
  };
}

export function series(start: string, days: number, f: (i: number) => DayParams): DayRow[] {
  return Array.from({ length: days }, (_, i) => day(addDays(start, i), f(i)));
}

export function meta(key: string, launchDate: string, extra: Partial<CreativeMeta> = {}): CreativeMeta {
  return {
    key: `meta:${key}`,
    creativeVariantId: key,
    platform: "meta",
    creativeGroupId: null,
    platformCreativeId: null,
    creativeName: key,
    launchDate,
    assetType: "video",
    format: "UGC",
    creator: null,
    concept: null,
    angle: null,
    hookTactic: null,
    bodyTactic: null,
    headlineTactic: null,
    primaryCopy: null,
    headline: null,
    cta: null,
    offer: null,
    productId: null,
    productName: null,
    persona: null,
    landingPage: null,
    batch: null,
    thumbnailUrl: null,
    mediaUrl: null,
    manualTags: [],
    campaigns: [],
    adsets: [],
    adIds: [],
    inLibrary: true,
    ...extra,
  };
}

export const AS_OF = "2026-06-30";

/** 12 ordinary peer creatives so platform baselines (percentiles) exist. */
export function peers(): CreativeInput[] {
  const out: CreativeInput[] = [];
  for (let k = 0; k < 12; k++) {
    const start = addDays(AS_OF, -59);
    const ctr = 0.008 + k * 0.001;
    const hook = 0.18 + k * 0.015;
    const cvr = 0.035 + (k % 4) * 0.004;
    out.push({ meta: meta(`peer-${k}`, start), rows: series(start, 60, () => ({ spend: 40, ctr, hook, cvr })) });
  }
  return out;
}

export function run(creatives: CreativeInput[], over: Partial<AnalyzeInput> = {}, regimes: TargetRegime[] = []) {
  return analyzeAccount({
    accountId: "test",
    currency: "USD",
    settings: SETTINGS,
    regimes,
    creatives,
    events: [],
    window: { from: addDays(AS_OF, -29), to: AS_OF },
    asOf: AS_OF,
    comparison: "prev",
    ...over,
  });
}

export function find(res: ReturnType<typeof run>, key: string) {
  const c = res.creatives.find((x) => x.key === `meta:${key}`);
  if (!c) throw new Error(`creative ${key} not found`);
  return c;
}
