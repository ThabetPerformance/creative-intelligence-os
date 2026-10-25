import { describe, expect, it } from "vitest";
import { DEFAULT_FIELD_MAPS, toTemplateRows } from "@/windsor/client";
import { validateDaily } from "@/ingestion/validate";

describe("Windsor mapping (offline; no live API call)", () => {
  it("maps Meta rows to template rows that pass validation", () => {
    const raw = [
      { date: "2026-10-01", campaign: "Prospecting", campaign_id: "c1", adset_id: "s1", adset_name: "Broad", ad_id: "a1", ad_name: "UGC 1", creative_id: "cr1", account_currency: "USD", spend: 120.5, impressions: 10000, clicks: 150, link_clicks: 120, actions_landing_page_view: 100, actions_omni_purchase: 4, action_values_omni_purchase: 360 },
    ];
    const rows = toTemplateRows(raw, "meta", DEFAULT_FIELD_MAPS.facebook.map);
    const v = validateDaily(rows, "USD");
    expect(v.rejected).toBe(0);
    expect(v.rows[0]).toMatchObject({ platform: "meta", adId: "a1", creativeVariantId: "cr1", spend: 120.5, purchases: 4, purchaseValue: 360, landingPageViews: 100, outboundClicks: 120 });
  });

  it("falls back to ad_id as the variant when the connector has no creative id", () => {
    const rows = toTemplateRows([{ date: "2026-10-01", ad_id: "t9", ad_name: "x", spend: 5 }], "tiktok", DEFAULT_FIELD_MAPS.tiktok.map);
    expect(rows[0].creative_variant_id).toBe("t9");
  });

  it("never exposes the API key through the default maps", () => {
    expect(JSON.stringify(DEFAULT_FIELD_MAPS)).not.toMatch(/api_key/i);
  });
});
