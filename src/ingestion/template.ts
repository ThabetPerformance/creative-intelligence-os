/**
 * Single source of truth for the File Mode workbook contract.
 * Used by the template generator, the demo generator, client-side validation and server import.
 */

export type ColType = "date" | "number" | "int" | "string" | "rate" | "enum" | "list";

export interface ColumnSpec {
  name: string;
  type: ColType;
  required?: boolean;
  description: string;
  enum?: string[];
  example?: string | number;
}

export const SHEETS = {
  readme: "00_README",
  config: "01_ACCOUNT_CONFIG",
  targets: "02_TARGETS_HISTORY",
  library: "03_CREATIVE_LIBRARY",
  daily: "04_RAW_CREATIVE_DAILY",
  events: "05_CREATIVE_EVENTS",
  tags: "06_OPTIONAL_TAGS",
  notes: "07_SOURCE_NOTES",
} as const;

export const PLATFORMS = ["meta", "tiktok", "snapchat", "google"] as const;

export const PLATFORM_ALIASES: Record<string, string> = {
  meta: "meta",
  facebook: "meta",
  fb: "meta",
  instagram: "meta",
  ig: "meta",
  "meta ads": "meta",
  tiktok: "tiktok",
  "tiktok ads": "tiktok",
  snapchat: "snapchat",
  snap: "snapchat",
  google: "google",
  "google ads": "google",
  youtube: "google",
};

export const EVENT_TYPES = [
  "Creative Launch",
  "Budget Change",
  "Creative Refresh",
  "Copy Change",
  "Hook Change",
  "CTA Change",
  "Offer Change",
  "Landing Page Change",
  "Tracking Fix",
  "Pause",
  "Relaunch",
  "Other",
];

export const CONFIG_FIELDS: ColumnSpec[] = [
  { name: "brand_name", type: "string", required: true, description: "Account / brand display name.", example: "Northwind Outfitters (Synthetic)" },
  { name: "currency", type: "string", required: true, description: "ISO currency of all spend and revenue (e.g. USD, SAR, EUR).", example: "USD" },
  { name: "timezone", type: "string", description: "IANA timezone of the ad accounts.", example: "UTC" },
  { name: "primary_conversion", type: "string", description: "Primary conversion event.", example: "purchase" },
  { name: "target_roas", type: "number", required: true, description: "Current target ROAS (purchase value ÷ spend).", example: 2.5 },
  { name: "cpo_guardrail", type: "number", description: "Maximum acceptable cost per order / acquisition.", example: 28 },
  { name: "gross_margin", type: "rate", description: "Optional gross margin (0–1).", example: 0.6 },
  { name: "min_purchases", type: "int", description: "Minimum purchases for hard classification.", example: 10 },
  { name: "min_evidence_spend", type: "number", description: "Minimum spend before a creative can be judged.", example: 280 },
  { name: "evidence_spend_multiple", type: "number", description: "Optional: evidence spend = CPO guardrail × this multiple (overrides min_evidence_spend).", example: "" },
  { name: "min_days_live", type: "int", description: "Minimum days live before hard classification.", example: 5 },
  { name: "freshness_window_days", type: "int", description: "Days a creative counts as new.", example: 30 },
  { name: "fatigue_sensitivity", type: "enum", enum: ["LOW", "MEDIUM", "HIGH"], description: "How quickly declines count as fatigue.", example: "MEDIUM" },
  { name: "default_analysis_window", type: "enum", enum: ["7d", "10d", "14d", "30d", "60d", "90d", "180d", "6m", "lifetime"], description: "Default date range.", example: "30d" },
  { name: "default_comparison_window", type: "enum", enum: ["prev", "prev7", "prev14", "prev30", "prevMonth", "prevYear", "best", "cohort"], description: "Default comparison.", example: "prev" },
  { name: "platforms", type: "list", description: "Comma separated: meta, tiktok, snapchat, google.", example: "meta, tiktok, snapchat" },
  { name: "active_products", type: "list", description: "Comma separated active product names.", example: "" },
  { name: "notes", type: "string", description: "Free notes.", example: "" },
];

export const TARGET_COLUMNS: ColumnSpec[] = [
  { name: "start_date", type: "date", required: true, description: "First day the target applied (YYYY-MM-DD)." },
  { name: "end_date", type: "date", description: "Last day (blank = still active)." },
  { name: "target_roas", type: "number", required: true, description: "Target ROAS in this regime." },
  { name: "cpo_guardrail", type: "number", description: "CPO / CPA guardrail in this regime." },
  { name: "optional_margin", type: "rate", description: "Optional gross margin (0–1)." },
  { name: "notes", type: "string", description: "Why the target changed." },
];

export const LIBRARY_COLUMNS: ColumnSpec[] = [
  { name: "creative_variant_id", type: "string", required: true, description: "Canonical creative variant (asset + copy + headline + offer + landing page). Join key to daily data." },
  { name: "creative_group_id", type: "string", description: "Underlying concept / asset family. Links the same asset across platforms. Never auto-merged by name." },
  { name: "platform_creative_id", type: "string", description: "Platform-level creative entity (one creative can run in many ads)." },
  { name: "platform", type: "string", description: "meta | tiktok | snapchat | google." },
  { name: "creative_name", type: "string", description: "Human name." },
  { name: "asset_type", type: "string", description: "video | image | carousel | collection …" },
  { name: "format", type: "string", description: "UGC, Static, Carousel, Product Demo, Founder, Review, Animation … (custom allowed)." },
  { name: "creator", type: "string", description: "Creator / talent." },
  { name: "concept", type: "string", description: "Creative concept." },
  { name: "angle", type: "string", description: "Messaging angle (Problem / Solution, Social Proof, Price / Offer …, custom allowed)." },
  { name: "hook_tactic", type: "string", description: "Opening hook tactic (Question, Bold claim, Pattern interrupt …)." },
  { name: "body_tactic", type: "string", description: "Body structure tactic." },
  { name: "headline_tactic", type: "string", description: "Headline tactic." },
  { name: "primary_copy", type: "string", description: "Primary text (or a short label for it)." },
  { name: "headline", type: "string", description: "Headline." },
  { name: "cta", type: "string", description: "Call to action." },
  { name: "offer", type: "string", description: "Offer." },
  { name: "product_id", type: "string", description: "Product ID." },
  { name: "product_name", type: "string", description: "Product name." },
  { name: "persona", type: "string", description: "Target persona." },
  { name: "landing_page", type: "string", description: "Landing page URL or label." },
  { name: "batch", type: "string", description: "Creative batch / sprint label (for launch cohorts)." },
  { name: "launch_date", type: "date", description: "Launch date (defaults to first spend date)." },
  { name: "thumbnail_url", type: "string", description: "Public thumbnail URL (optional)." },
  { name: "media_url", type: "string", description: "Public media URL (optional)." },
  { name: "manual_tags", type: "list", description: "Comma separated free tags." },
  { name: "notes", type: "string", description: "Notes." },
];

export const DAILY_COLUMNS: ColumnSpec[] = [
  { name: "date", type: "date", required: true, description: "Calendar day (YYYY-MM-DD). Grain is DATE × AD." },
  { name: "account_id", type: "string", description: "Platform ad account ID (informational)." },
  { name: "platform", type: "string", required: true, description: "meta | tiktok | snapchat | google." },
  { name: "currency", type: "string", description: "Currency of spend / value. Must match the account currency." },
  { name: "campaign_id", type: "string", description: "Campaign ID." },
  { name: "campaign_name", type: "string", description: "Campaign name." },
  { name: "campaign_objective", type: "string", description: "Campaign objective." },
  { name: "adset_id", type: "string", description: "Ad set / ad group ID." },
  { name: "adset_name", type: "string", description: "Ad set / ad group name." },
  { name: "ad_id", type: "string", required: true, description: "Ad ID — the delivery instance. Not the same as a creative." },
  { name: "ad_name", type: "string", description: "Ad name." },
  { name: "platform_creative_id", type: "string", description: "Platform creative ID." },
  { name: "creative_variant_id", type: "string", description: "Canonical creative variant ID (recommended). Falls back to platform_creative_id, then ad_id, with a warning." },
  { name: "creative_group_id", type: "string", description: "Concept / asset family ID." },
  { name: "creative_name", type: "string", description: "Creative name." },
  { name: "launch_date", type: "date", description: "Creative launch date." },
  { name: "ad_status", type: "string", description: "ACTIVE / PAUSED …" },
  { name: "spend", type: "number", required: true, description: "Spend in account currency." },
  { name: "impressions", type: "int", description: "Impressions." },
  { name: "reach", type: "int", description: "Reach." },
  { name: "frequency", type: "number", description: "Platform frequency." },
  { name: "clicks", type: "int", description: "All clicks (or link clicks, as exported — note in 07_SOURCE_NOTES)." },
  { name: "outbound_clicks", type: "int", description: "Outbound / link clicks." },
  { name: "landing_page_views", type: "int", description: "Landing page views." },
  { name: "add_to_cart", type: "int", description: "Adds to cart." },
  { name: "checkouts", type: "int", description: "Checkouts initiated." },
  { name: "purchases", type: "number", description: "Purchases (platform-attributed). Blank = UNAVAILABLE, not 0." },
  { name: "purchase_value", type: "number", description: "Purchase value (platform-attributed)." },
  { name: "video_1s", type: "int", description: "1-second (or 2s) video views." },
  { name: "video_3s", type: "int", description: "3-second video views." },
  { name: "video_25", type: "int", description: "25% video views." },
  { name: "video_50", type: "int", description: "50% video views." },
  { name: "video_75", type: "int", description: "75% video views." },
  { name: "video_100", type: "int", description: "100% video views." },
  { name: "hook_rate", type: "rate", description: "Platform-native hook rate (0–1, or %). Optional if video_3s is provided." },
  { name: "hold_rate", type: "rate", description: "Platform-native hold rate (0–1, or %)." },
  { name: "thumbnail_url", type: "string", description: "Thumbnail URL." },
  { name: "media_url", type: "string", description: "Media URL." },
  { name: "landing_page", type: "string", description: "Landing page." },
  { name: "source", type: "string", description: "Where the row came from (e.g. Meta Ads export)." },
];

export const EVENT_COLUMNS: ColumnSpec[] = [
  { name: "date", type: "date", required: true, description: "Event date." },
  { name: "creative_variant_id", type: "string", description: "Creative the event applies to (blank = account-wide)." },
  { name: "platform", type: "string", description: "Platform of the creative." },
  { name: "event_type", type: "enum", required: true, enum: EVENT_TYPES, description: "Event type." },
  { name: "description", type: "string", description: "What changed." },
];

export const TAG_COLUMNS: ColumnSpec[] = [
  { name: "creative_variant_id", type: "string", required: true, description: "Creative variant." },
  { name: "tag_type", type: "string", required: true, description: "A library field (concept, angle, hook_tactic, format, creator, offer, cta, persona …) or any custom tag type." },
  { name: "tag_value", type: "string", required: true, description: "Tag value." },
];

export const NOTE_COLUMNS: ColumnSpec[] = [
  { name: "source", type: "string", description: "Source / export name." },
  { name: "platform", type: "string", description: "Platform." },
  { name: "attribution_setting", type: "string", description: "Attribution window used in the export (e.g. 7-day click, 1-day view)." },
  { name: "notes", type: "string", description: "Metric definitions, known issues." },
];

export const README_LINES = [
  "CREATIVE INTELLIGENCE OS — FILE MODE TEMPLATE",
  "Know what wins. Know why. Know what to make next.",
  "",
  "HOW TO USE",
  "1. Fill 01_ACCOUNT_CONFIG (optional: the app's Account Settings take precedence unless you choose to apply the file config).",
  "2. Fill 02_TARGETS_HISTORY when targets changed over time. Historical analysis uses the target active on each date.",
  "3. Fill 03_CREATIVE_LIBRARY: one row per creative variant with its metadata (creator, concept, angle, hook tactic, format…).",
  "4. Fill 04_RAW_CREATIVE_DAILY at DATE × AD grain. Do NOT paste lifetime totals — daily rows are required for timelines and fatigue.",
  "5. Optional: 05_CREATIVE_EVENTS (refreshes, offer / landing / tracking changes), 06_OPTIONAL_TAGS, 07_SOURCE_NOTES.",
  "6. Upload in Import Data → Validate → Import. Re-uploading the same DATE × AD rows updates them (no duplicates).",
  "",
  "RULES",
  "• Blank metric cells mean UNAVAILABLE, never zero. Leave cells blank if a platform does not report a metric.",
  "• Dates: YYYY-MM-DD or real Excel dates.",
  "• Rates (hook_rate, hold_rate, gross margin): 0–1 or percentages (25 or 25%).",
  "• creative_variant_id is the join key between the library and daily rows. The same creative can run through several ads.",
  "• creative_group_id links the same asset across platforms. Assets are never merged automatically by similar names.",
  "• Revenue is platform-attributed. It is never summed across platforms into business revenue.",
];
