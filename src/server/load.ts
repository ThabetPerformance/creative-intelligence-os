import "server-only";
import { getPool } from "@/lib/db/client";
import type { DayRow } from "@/engine/metrics";
import type { CreativeEventInput, CreativeInput, CreativeMeta } from "@/engine/types";
import type { LearningRef } from "@/engine/planner";
import { creativeKey } from "@/ingestion/to-engine";

/**
 * Loads DATE × CREATIVE series for the engine. Aggregation across ads happens in SQL, so the
 * engine (and never the browser) receives compact per-creative daily rows.
 */
export async function loadCreativeInputs(accountId: string, currency: string, asOf?: string, onlyKeys?: string[]): Promise<CreativeInput[]> {
  const pool = getPool();
  const params: unknown[] = [accountId, currency.toUpperCase(), asOf ?? "9999-12-31"];
  let keyFilter = "";
  if (onlyKeys && onlyKeys.length) {
    params.push(onlyKeys);
    keyFilter = `AND (platform || ':' || creative_variant_id) = ANY($4)`;
  }
  const daily = await pool.query({
    text: `SELECT platform, creative_variant_id AS v, date::text AS d,
        sum(spend) AS spend, sum(impressions) AS impressions, sum(reach) AS reach, sum(clicks) AS clicks,
        sum(outbound_clicks) AS outbound, sum(landing_page_views) AS lpv, sum(add_to_cart) AS atc, sum(checkouts) AS co,
        sum(purchases) AS purchases, sum(purchase_value) AS value,
        sum(video_1s) AS v1, sum(video_3s) AS v3, sum(video_25) AS v25, sum(video_50) AS v50, sum(video_75) AS v75, sum(video_100) AS v100,
        sum(hook_rate * impressions) FILTER (WHERE hook_rate IS NOT NULL) / NULLIF(sum(impressions) FILTER (WHERE hook_rate IS NOT NULL), 0) AS hook,
        sum(hold_rate * impressions) FILTER (WHERE hold_rate IS NOT NULL) / NULLIF(sum(impressions) FILTER (WHERE hold_rate IS NOT NULL), 0) AS hold,
        sum(frequency * impressions) FILTER (WHERE frequency IS NOT NULL) / NULLIF(sum(impressions) FILTER (WHERE frequency IS NOT NULL), 0) AS freq,
        bool_or(currency IS NOT NULL AND upper(currency) <> $2) AS cm
      FROM creative_ad_daily
      WHERE account_id = $1 AND date <= $3::date ${keyFilter}
      GROUP BY platform, creative_variant_id, date
      ORDER BY platform, creative_variant_id, date`,
    values: params,
    rowMode: "array",
  });
  const metaQ = await pool.query(
    `SELECT d.platform, d.creative_variant_id AS v,
        max(d.creative_group_id) AS grp, max(d.platform_creative_id) AS pcid, max(d.creative_name) AS name, min(d.launch_date)::text AS launch,
        max(d.thumbnail_url) AS thumb, max(d.media_url) AS media, max(d.landing_page) AS lp,
        array_agg(DISTINCT d.campaign_name) FILTER (WHERE d.campaign_name IS NOT NULL) AS campaigns,
        array_agg(DISTINCT d.adset_name) FILTER (WHERE d.adset_name IS NOT NULL) AS adsets,
        array_agg(DISTINCT d.ad_id) AS ads
      FROM creative_ad_daily d WHERE d.account_id = $1 AND d.date <= $2::date ${onlyKeys && onlyKeys.length ? `AND (d.platform || ':' || d.creative_variant_id) = ANY($3)` : ""}
      GROUP BY d.platform, d.creative_variant_id`,
    onlyKeys && onlyKeys.length ? [accountId, asOf ?? "9999-12-31", onlyKeys] : [accountId, asOf ?? "9999-12-31"],
  );
  const lib = await pool.query(`SELECT * FROM creative_library WHERE account_id = $1`, [accountId]);
  const libMap = new Map<string, Record<string, unknown>>();
  for (const l of lib.rows) libMap.set(l.creative_variant_id as string, l);

  const metas = new Map<string, CreativeMeta>();
  for (const m of metaQ.rows) {
    const key = creativeKey(m.platform, m.v);
    const l = libMap.get(m.v);
    const s = (k: string) => (l && l[k] !== null && l[k] !== undefined ? (l[k] instanceof Date ? (l[k] as Date).toISOString().slice(0, 10) : String(l[k])) : null);
    metas.set(key, {
      key,
      creativeVariantId: m.v,
      platform: m.platform,
      creativeGroupId: s("creative_group_id") ?? m.grp,
      platformCreativeId: s("platform_creative_id") ?? m.pcid,
      creativeName: s("creative_name") ?? m.name ?? m.v,
      launchDate: s("launch_date") ?? m.launch,
      assetType: s("asset_type"),
      format: s("format"),
      creator: s("creator"),
      concept: s("concept"),
      angle: s("angle"),
      hookTactic: s("hook_tactic"),
      bodyTactic: s("body_tactic"),
      headlineTactic: s("headline_tactic"),
      primaryCopy: s("primary_copy"),
      headline: s("headline"),
      cta: s("cta"),
      offer: s("offer"),
      productId: s("product_id"),
      productName: s("product_name"),
      persona: s("persona"),
      landingPage: s("landing_page") ?? m.lp,
      batch: s("batch"),
      thumbnailUrl: s("thumbnail_url") ?? m.thumb,
      mediaUrl: s("media_url") ?? m.media,
      manualTags: (l?.manual_tags as string[]) ?? [],
      campaigns: m.campaigns ?? [],
      adsets: m.adsets ?? [],
      adIds: m.ads ?? [],
      inLibrary: !!l,
    });
  }
  const out = new Map<string, DayRow[]>();
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  for (const r of daily.rows as unknown[][]) {
    const key = creativeKey(r[0] as string, r[1] as string);
    let arr = out.get(key);
    if (!arr) {
      arr = [];
      out.set(key, arr);
    }
    arr.push({
      date: r[2] as string,
      spend: Number(r[3]) || 0,
      impressions: num(r[4]),
      reach: num(r[5]),
      clicks: num(r[6]),
      outboundClicks: num(r[7]),
      landingPageViews: num(r[8]),
      addToCart: num(r[9]),
      checkouts: num(r[10]),
      purchases: num(r[11]),
      purchaseValue: num(r[12]),
      video1s: num(r[13]),
      video3s: num(r[14]),
      video25: num(r[15]),
      video50: num(r[16]),
      video75: num(r[17]),
      video100: num(r[18]),
      hookRate: num(r[19]),
      holdRate: num(r[20]),
      frequency: num(r[21]),
      currencyMismatch: r[22] === true,
    });
  }
  const res: CreativeInput[] = [];
  for (const [key, rows] of out) {
    const meta = metas.get(key);
    if (meta) res.push({ meta, rows });
  }
  return res;
}

export async function loadEvents(accountId: string): Promise<CreativeEventInput[]> {
  const r = await getPool().query(
    `SELECT e.creative_variant_id AS v, e.date::text AS d, e.event_type AS t, e.description AS descr,
            (SELECT platform FROM creative_ad_daily x WHERE x.account_id = e.account_id AND x.creative_variant_id = e.creative_variant_id LIMIT 1) AS platform
     FROM creative_events e WHERE e.account_id = $1 ORDER BY e.date`,
    [accountId],
  );
  return r.rows.map((e) => ({
    creativeKey: e.v && e.platform ? creativeKey(e.platform, e.v) : null,
    creativeVariantId: e.v,
    date: e.d,
    eventType: e.t,
    description: e.descr,
  }));
}

export async function loadLearnings(accountId: string): Promise<LearningRef[]> {
  const r = await getPool().query(`SELECT * FROM creative_learnings WHERE account_id = $1 ORDER BY created_at DESC`, [accountId]);
  return r.rows.map((l) => ({
    id: l.id,
    learning: l.learning,
    evidenceStatus: l.evidence_status,
    concept: l.concept,
    angle: l.angle,
    hookTactic: l.hook_tactic,
    format: l.format,
    creator: l.creator,
    creativeKey: l.creative_key,
    creativeGroupId: l.creative_group_id,
  }));
}

export async function dataBounds(accountId: string): Promise<{ start: string | null; through: string | null; rows: number }> {
  const r = await getPool().query(`SELECT min(date)::text AS s, max(date)::text AS t, count(*)::int AS n FROM creative_ad_daily WHERE account_id = $1`, [accountId]);
  return { start: r.rows[0].s, through: r.rows[0].t, rows: r.rows[0].n };
}
