import type { DayRow } from "../engine/metrics";
import type { CreativeInput, CreativeMeta } from "../engine/types";
import type { NormalizedDaily, NormalizedLibrary } from "./validate";

export function creativeKey(platform: string, variantId: string): string {
  return `${platform}:${variantId}`;
}

const add = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : a + b);

/**
 * Collapse DATE × AD rows into DATE × CREATIVE series for the engine (in-memory path used by
 * scripts and tests; the server does the same aggregation in SQL).
 */
export function buildCreativeInputs(daily: NormalizedDaily[], library: NormalizedLibrary[], accountCurrency: string): CreativeInput[] {
  const lib = new Map(library.map((l) => [l.creativeVariantId, l]));
  const byKey = new Map<string, { meta: CreativeMeta; days: Map<string, DayRow & { _hookImpr: number; _holdImpr: number; _freqImpr: number }> }>();
  for (const r of daily) {
    const key = creativeKey(r.platform, r.creativeVariantId);
    let entry = byKey.get(key);
    if (!entry) {
      entry = { meta: metaFrom(key, r, lib.get(r.creativeVariantId) ?? null), days: new Map() };
      byKey.set(key, entry);
    }
    const m = entry.meta;
    if (r.campaignName && !m.campaigns.includes(r.campaignName)) m.campaigns.push(r.campaignName);
    if (r.adsetName && !m.adsets.includes(r.adsetName)) m.adsets.push(r.adsetName);
    if (!m.adIds.includes(r.adId)) m.adIds.push(r.adId);
    let d = entry.days.get(r.date);
    if (!d) {
      d = {
        date: r.date,
        spend: 0,
        impressions: null,
        reach: null,
        clicks: null,
        outboundClicks: null,
        landingPageViews: null,
        addToCart: null,
        checkouts: null,
        purchases: null,
        purchaseValue: null,
        video1s: null,
        video3s: null,
        video25: null,
        video50: null,
        video75: null,
        video100: null,
        hookRate: null,
        holdRate: null,
        frequency: null,
        currencyMismatch: false,
        _hookImpr: 0,
        _holdImpr: 0,
        _freqImpr: 0,
      };
      entry.days.set(r.date, d);
    }
    d.spend += r.spend;
    d.impressions = add(d.impressions, r.impressions);
    d.reach = add(d.reach, r.reach);
    d.clicks = add(d.clicks, r.clicks);
    d.outboundClicks = add(d.outboundClicks, r.outboundClicks);
    d.landingPageViews = add(d.landingPageViews, r.landingPageViews);
    d.addToCart = add(d.addToCart, r.addToCart);
    d.checkouts = add(d.checkouts, r.checkouts);
    d.purchases = add(d.purchases, r.purchases);
    d.purchaseValue = add(d.purchaseValue, r.purchaseValue);
    d.video1s = add(d.video1s, r.video1s);
    d.video3s = add(d.video3s, r.video3s);
    d.video25 = add(d.video25, r.video25);
    d.video50 = add(d.video50, r.video50);
    d.video75 = add(d.video75, r.video75);
    d.video100 = add(d.video100, r.video100);
    const imp = r.impressions ?? 0;
    if (r.hookRate !== null && imp > 0) {
      d.hookRate = ((d.hookRate ?? 0) * d._hookImpr + r.hookRate * imp) / (d._hookImpr + imp);
      d._hookImpr += imp;
    }
    if (r.holdRate !== null && imp > 0) {
      d.holdRate = ((d.holdRate ?? 0) * d._holdImpr + r.holdRate * imp) / (d._holdImpr + imp);
      d._holdImpr += imp;
    }
    if (r.frequency !== null && imp > 0) {
      d.frequency = ((d.frequency ?? 0) * d._freqImpr + r.frequency * imp) / (d._freqImpr + imp);
      d._freqImpr += imp;
    }
    if (r.currency && r.currency.toUpperCase() !== accountCurrency.toUpperCase()) d.currencyMismatch = true;
  }
  return [...byKey.values()].map((e) => ({
    meta: e.meta,
    rows: [...e.days.values()].map(({ _hookImpr, _holdImpr, _freqImpr, ...rest }) => {
      void _hookImpr;
      void _holdImpr;
      void _freqImpr;
      return rest;
    }),
  }));
}

export function metaFrom(key: string, r: Pick<NormalizedDaily, "platform" | "creativeVariantId" | "creativeGroupId" | "platformCreativeId" | "creativeName" | "launchDate" | "thumbnailUrl" | "mediaUrl" | "landingPage">, l: NormalizedLibrary | null): CreativeMeta {
  return {
    key,
    creativeVariantId: r.creativeVariantId,
    platform: r.platform,
    creativeGroupId: l?.creativeGroupId ?? r.creativeGroupId ?? null,
    platformCreativeId: l?.platformCreativeId ?? r.platformCreativeId ?? null,
    creativeName: l?.creativeName ?? r.creativeName ?? r.creativeVariantId,
    launchDate: l?.launchDate ?? r.launchDate ?? null,
    assetType: l?.assetType ?? null,
    format: l?.format ?? null,
    creator: l?.creator ?? null,
    concept: l?.concept ?? null,
    angle: l?.angle ?? null,
    hookTactic: l?.hookTactic ?? null,
    bodyTactic: l?.bodyTactic ?? null,
    headlineTactic: l?.headlineTactic ?? null,
    primaryCopy: l?.primaryCopy ?? null,
    headline: l?.headline ?? null,
    cta: l?.cta ?? null,
    offer: l?.offer ?? null,
    productId: l?.productId ?? null,
    productName: l?.productName ?? null,
    persona: l?.persona ?? null,
    landingPage: l?.landingPage ?? r.landingPage ?? null,
    batch: l?.batch ?? null,
    thumbnailUrl: l?.thumbnailUrl ?? r.thumbnailUrl ?? null,
    mediaUrl: l?.mediaUrl ?? r.mediaUrl ?? null,
    manualTags: l?.manualTags ?? [],
    campaigns: [],
    adsets: [],
    adIds: [],
    inLibrary: !!l,
  };
}
