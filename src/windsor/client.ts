import "server-only";

/**
 * Windsor.ai connector client (spec §98–102). Server-side only: the API key is read from
 * WINDSOR_API_KEY on the server and never returned to the browser, logged, or put in errors.
 *
 * STATUS: written against Windsor's documented connector URL pattern and field ids discovered for
 * Meta, TikTok and Snapchat. It has NOT been exercised against a live Windsor account in this
 * build — see docs/WINDSOR_SETUP.md before relying on it.
 */

const BASE = "https://connectors.windsor.ai";

export function windsorConfigured(): boolean {
  return typeof process.env.WINDSOR_API_KEY === "string" && process.env.WINDSOR_API_KEY.trim().length > 0;
}

function key(): string {
  const k = process.env.WINDSOR_API_KEY?.trim();
  if (!k) throw new WindsorError("WINDSOR_API_KEY is not set on the server.");
  return k;
}

export class WindsorError extends Error {}

/** Strip the key from anything that might be surfaced (defence in depth). */
function scrub(s: string): string {
  const k = process.env.WINDSOR_API_KEY?.trim();
  let out = s.replace(/api_key=[^&\s"]+/gi, "api_key=***");
  if (k) out = out.split(k).join("***");
  return out;
}

export interface FetchParams {
  connector: string;
  accountId: string;
  fields: string[];
  dateFrom: string;
  dateTo: string;
}

export async function fetchWindsor(p: FetchParams, opts: { timeoutMs?: number; retries?: number } = {}): Promise<Record<string, unknown>[]> {
  const url = new URL(`${BASE}/${encodeURIComponent(p.connector)}`);
  url.searchParams.set("api_key", key());
  url.searchParams.set("date_from", p.dateFrom);
  url.searchParams.set("date_to", p.dateTo);
  url.searchParams.set("fields", p.fields.join(","));
  url.searchParams.set("select_accounts", p.accountId);
  const retries = opts.retries ?? 2;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 45_000);
    try {
      const res = await fetch(url, { signal: ctrl.signal, cache: "no-store", headers: { accept: "application/json" } });
      if (res.status === 429 || res.status >= 500) throw new WindsorError(`Windsor responded ${res.status}`);
      if (!res.ok) {
        const text = scrub((await res.text()).slice(0, 300));
        throw new WindsorError(`Windsor responded ${res.status}: ${text}`);
      }
      const json = (await res.json()) as { data?: unknown };
      if (!Array.isArray(json.data)) throw new WindsorError("Unexpected Windsor response: no data array.");
      return json.data as Record<string, unknown>[];
    } catch (e) {
      lastErr = e;
      const retryable = !(e instanceof WindsorError) || /responded (429|5\d\d)/.test(e.message);
      if (!retryable || attempt === retries) break;
      await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new WindsorError(scrub(lastErr instanceof Error ? lastErr.message : "Windsor request failed"));
}

/** Field discovery. Returns null if Windsor's field listing is unavailable. */
export async function discoverFields(connector: string): Promise<string[] | null> {
  try {
    const url = new URL(`${BASE}/${encodeURIComponent(connector)}/fields`);
    url.searchParams.set("api_key", key());
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as unknown;
    const list = Array.isArray(json) ? json : Array.isArray((json as { data?: unknown }).data) ? ((json as { data: unknown[] }).data as unknown[]) : null;
    if (!list) return null;
    return list.map((f) => (typeof f === "string" ? f : String((f as { id?: string; name?: string }).id ?? (f as { name?: string }).name ?? ""))).filter(Boolean);
  } catch {
    return null;
  }
}

/**
 * Default template-column → Windsor-field maps. Field ids verified with Windsor's field catalogue
 * for these connectors. Stored per mapping in the DB and editable on the Windsor page.
 */
export const DEFAULT_FIELD_MAPS: Record<string, { platform: string; map: Record<string, string> }> = {
  facebook: {
    platform: "meta",
    map: {
      date: "date",
      campaign_id: "campaign_id",
      campaign_name: "campaign",
      adset_id: "adset_id",
      adset_name: "adset_name",
      ad_id: "ad_id",
      ad_name: "ad_name",
      platform_creative_id: "creative_id",
      creative_variant_id: "creative_id",
      creative_name: "ad_name",
      currency: "account_currency",
      ad_status: "effective_status",
      spend: "spend",
      impressions: "impressions",
      reach: "reach",
      frequency: "frequency",
      clicks: "clicks",
      outbound_clicks: "link_clicks",
      landing_page_views: "actions_landing_page_view",
      add_to_cart: "actions_add_to_cart",
      checkouts: "actions_initiate_checkout",
      purchases: "actions_omni_purchase",
      purchase_value: "action_values_omni_purchase",
      video_3s: "actions_video_view",
      video_25: "video_p25_watched_actions_video_view",
      video_50: "video_p50_watched_actions_video_view",
      video_75: "video_p75_watched_actions_video_view",
      video_100: "video_p100_watched_actions_video_view",
      thumbnail_url: "thumbnail_url",
      landing_page: "link_url_asset_website_url",
    },
  },
  tiktok: {
    platform: "tiktok",
    map: {
      date: "date",
      campaign_id: "campaign_id",
      campaign_name: "campaign_name",
      ad_id: "ad_id",
      ad_name: "ad_name",
      platform_creative_id: "video_id",
      creative_name: "ad_name",
      currency: "currency",
      spend: "spend",
      impressions: "impressions",
      reach: "reach",
      frequency: "frequency",
      clicks: "clicks",
      checkouts: "initiate_checkout",
      purchases: "complete_payment",
      purchase_value: "total_complete_payment_rate",
    },
  },
  snapchat: {
    platform: "snapchat",
    map: {
      date: "date",
      campaign_id: "campaign_id",
      adset_id: "ad_squad_id",
      adset_name: "ad_squad_name",
      ad_id: "ad_id",
      ad_name: "ad_name",
      platform_creative_id: "creative_id",
      creative_variant_id: "creative_id",
      creative_name: "ad_name",
      currency: "currency",
      spend: "spend",
      impressions: "impressions",
      frequency: "frequency",
      clicks: "swipes",
      landing_page_views: "conversion_page_views",
      add_to_cart: "conversion_add_cart",
      checkouts: "conversion_start_checkout",
      purchases: "conversion_purchases",
      purchase_value: "conversion_purchases_value",
      video_1s: "video_views",
      video_25: "quartile_1",
      video_50: "quartile_2",
      video_75: "quartile_3",
      video_100: "view_completion",
    },
  },
};

/** Convert Windsor rows into template-shaped raw rows, so they go through the same validator. */
export function toTemplateRows(rows: Record<string, unknown>[], platform: string, fieldMap: Record<string, string>): Record<string, unknown>[] {
  return rows.map((r, i) => {
    const out: Record<string, unknown> = { __row: i + 1, platform };
    for (const [col, field] of Object.entries(fieldMap)) out[col] = r[field] ?? null;
    if (!out.creative_variant_id) out.creative_variant_id = out.platform_creative_id ?? out.ad_id;
    return out;
  });
}
