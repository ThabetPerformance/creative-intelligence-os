import { CONFIG_FIELDS, DAILY_COLUMNS, EVENT_COLUMNS, EVENT_TYPES, LIBRARY_COLUMNS, PLATFORM_ALIASES, SHEETS, TAG_COLUMNS, TARGET_COLUMNS, type ColumnSpec } from "./template";

/**
 * Pure validation + normalization for File Mode. Runs in the browser (preview) and on the
 * server (authoritative). Malformed rows are rejected with a row-level reason — never dropped
 * silently.
 */

export type Severity = "error" | "warning" | "info";
export interface Issue {
  sheet: string;
  row?: number;
  field?: string;
  code: string;
  message: string;
  severity: Severity;
}

export type RawRow = Record<string, unknown> & { __row?: number };

export interface NormalizedDaily {
  date: string;
  platform: string;
  accountRef: string | null;
  currency: string | null;
  campaignId: string | null;
  campaignName: string | null;
  campaignObjective: string | null;
  adsetId: string | null;
  adsetName: string | null;
  adId: string;
  adName: string | null;
  platformCreativeId: string | null;
  creativeVariantId: string;
  creativeGroupId: string | null;
  creativeName: string | null;
  launchDate: string | null;
  adStatus: string | null;
  spend: number;
  impressions: number | null;
  reach: number | null;
  frequency: number | null;
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
  hookRate: number | null;
  holdRate: number | null;
  thumbnailUrl: string | null;
  mediaUrl: string | null;
  landingPage: string | null;
  source: string | null;
  nativeMetrics: Record<string, unknown> | null;
}

export interface NormalizedLibrary {
  creativeVariantId: string;
  creativeGroupId: string | null;
  platformCreativeId: string | null;
  platform: string | null;
  creativeName: string | null;
  assetType: string | null;
  format: string | null;
  creator: string | null;
  concept: string | null;
  angle: string | null;
  hookTactic: string | null;
  bodyTactic: string | null;
  headlineTactic: string | null;
  primaryCopy: string | null;
  headline: string | null;
  cta: string | null;
  offer: string | null;
  productId: string | null;
  productName: string | null;
  persona: string | null;
  landingPage: string | null;
  batch: string | null;
  launchDate: string | null;
  thumbnailUrl: string | null;
  mediaUrl: string | null;
  manualTags: string[];
  notes: string | null;
}

export interface NormalizedTarget {
  startDate: string;
  endDate: string | null;
  targetRoas: number;
  cpoGuardrail: number | null;
  optionalMargin: number | null;
  notes: string | null;
}

export interface NormalizedEvent {
  date: string;
  creativeVariantId: string | null;
  platform: string | null;
  eventType: string;
  description: string | null;
}

export interface NormalizedTag {
  creativeVariantId: string;
  tagType: string;
  tagValue: string;
}

export interface NormalizedConfig {
  brandName?: string;
  currency?: string;
  timezone?: string;
  primaryConversion?: string;
  targetRoas?: number;
  cpoGuardrail?: number | null;
  grossMargin?: number | null;
  minPurchases?: number;
  minEvidenceSpend?: number;
  evidenceSpendMultiple?: number | null;
  minDaysLive?: number;
  freshnessWindowDays?: number;
  fatigueSensitivity?: "LOW" | "MEDIUM" | "HIGH";
  defaultAnalysisWindow?: string;
  defaultComparisonWindow?: string;
  platforms?: string[];
  activeProducts?: string[];
  notes?: string;
}

// ---------------------------------------------------------------- primitives

export function normKey(k: string): string {
  return k
    .trim()
    .toLowerCase()
    .replace(/[%()]/g, "")
    .replace(/[\s\-/.]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

const HEADER_ALIASES: Record<string, string> = {
  day: "date",
  reporting_starts: "date",
  amount_spent: "spend",
  cost: "spend",
  link_clicks: "outbound_clicks",
  outbound_clicks_total: "outbound_clicks",
  lpv: "landing_page_views",
  website_purchases: "purchases",
  conversions: "purchases",
  purchase_conversion_value: "purchase_value",
  website_purchases_conversion_value: "purchase_value",
  conversion_value: "purchase_value",
  revenue: "purchase_value",
  adds_to_cart: "add_to_cart",
  checkouts_initiated: "checkouts",
  video_plays_3s: "video_3s",
  three_second_video_plays: "video_3s",
  "3_second_video_plays": "video_3s",
  video_plays_at_25: "video_25",
  video_plays_at_50: "video_50",
  video_plays_at_75: "video_75",
  video_plays_at_100: "video_100",
  ad_set_id: "adset_id",
  ad_set_name: "adset_name",
  ad_group_id: "adset_id",
  ad_group_name: "adset_name",
  creative_id: "platform_creative_id",
  variant_id: "creative_variant_id",
  group_id: "creative_group_id",
};

/** Re-key a raw row to canonical snake_case column names. */
export function canonicalizeRow(row: RawRow): RawRow {
  const out: RawRow = { __row: row.__row };
  for (const [k, v] of Object.entries(row)) {
    if (k === "__row") continue;
    const nk = normKey(k);
    out[HEADER_ALIASES[nk] ?? nk] = v;
  }
  return out;
}

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

function excelSerialToIso(n: number): string {
  const ms = Math.round((n - 25569) * 86_400_000);
  return new Date(ms).toISOString().slice(0, 10);
}

export function parseDate(v: unknown): { value: string | null; error?: string } {
  if (isBlank(v)) return { value: null };
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return { value: null, error: "Invalid date" };
    return { value: v.toISOString().slice(0, 10) };
  }
  if (typeof v === "number") {
    if (v > 20000 && v < 80000) return { value: excelSerialToIso(v) };
    return { value: null, error: `Unrecognised date number ${v}` };
  }
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/.exec(s);
  if (m) return validYmd(+m[1], +m[2], +m[3], s);
  m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(s);
  if (m) return validYmd(+m[1], +m[2], +m[3], s);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    if (a > 12 && b <= 12) return validYmd(+m[3], b, a, s); // dd/mm/yyyy
    if (b > 12 && a <= 12) return validYmd(+m[3], a, b, s); // mm/dd/yyyy
    if (a === b) return validYmd(+m[3], a, b, s);
    return { value: null, error: `Ambiguous date "${s}" — use YYYY-MM-DD` };
  }
  return { value: null, error: `Unparseable date "${s}"` };
}

function validYmd(y: number, mo: number, d: number, raw: string): { value: string | null; error?: string } {
  const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const dt = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== iso) return { value: null, error: `Invalid date "${raw}"` };
  return { value: iso };
}

export function parseNumber(v: unknown): { value: number | null; error?: string } {
  if (isBlank(v)) return { value: null };
  if (typeof v === "number") return Number.isFinite(v) ? { value: v } : { value: null, error: "Non-finite number" };
  let s = String(v).trim().replace(/[\s,]/g, "");
  s = s.replace(/^[A-Z]{3}/i, "").replace(/^[$€£]/, "");
  if (s === "-" || s.toLowerCase() === "n/a" || s.toLowerCase() === "na") return { value: null };
  const n = Number(s);
  if (!Number.isFinite(n)) return { value: null, error: `Invalid number "${String(v)}"` };
  return { value: n };
}

export function parseRate(v: unknown): { value: number | null; error?: string; converted?: boolean } {
  if (isBlank(v)) return { value: null };
  const str = typeof v === "string" ? v.trim() : null;
  const r = parseNumber(str ? str.replace(/%$/, "") : v);
  if (r.error || r.value === null) return r;
  if ((str && str.endsWith("%")) || r.value > 1) {
    if (r.value > 100) return { value: null, error: `Rate ${r.value} is above 100%` };
    return { value: r.value / 100, converted: true };
  }
  if (r.value < 0) return { value: null, error: "Negative rate" };
  return { value: r.value };
}

function str(v: unknown): string | null {
  if (isBlank(v)) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  return String(v).trim();
}

/** IDs exported from spreadsheets often arrive as numbers (or 1.2E+17). Keep them as exact strings. */
function idStr(v: unknown): string | null {
  if (isBlank(v)) return null;
  if (typeof v === "number") return Number.isSafeInteger(v) ? String(v) : BigInt(Math.round(v)).toString();
  return String(v).trim();
}

export function normalizePlatform(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  return PLATFORM_ALIASES[s.toLowerCase()] ?? s.toLowerCase();
}

function list(v: unknown): string[] {
  const s = str(v);
  if (!s) return [];
  return s
    .split(/[,;|]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function checkHeaders(sheet: string, rows: RawRow[], cols: ColumnSpec[]): Issue[] {
  const issues: Issue[] = [];
  if (rows.length === 0) return issues;
  const present = new Set<string>();
  for (const r of rows.slice(0, 50)) for (const k of Object.keys(r)) present.add(k);
  for (const c of cols) {
    if (c.required && !present.has(c.name)) {
      issues.push({ sheet, code: "MISSING_COLUMN", field: c.name, message: `Required column "${c.name}" is missing.`, severity: "error" });
    }
  }
  return issues;
}

// ---------------------------------------------------------------- daily

export interface DailyValidation {
  rows: NormalizedDaily[];
  issues: Issue[];
  rejected: number;
  duplicates: number;
  dateFrom: string | null;
  dateTo: string | null;
  summary: {
    missingCreativeIds: number;
    missingPurchaseValue: number;
    missingPurchases: number;
    currencyIssues: number;
    invalidRates: number;
    convertedRates: number;
  };
}

const NUM_FIELDS: [string, keyof NormalizedDaily, "number" | "int"][] = [
  ["impressions", "impressions", "int"],
  ["reach", "reach", "int"],
  ["frequency", "frequency", "number"],
  ["clicks", "clicks", "int"],
  ["outbound_clicks", "outboundClicks", "int"],
  ["landing_page_views", "landingPageViews", "int"],
  ["add_to_cart", "addToCart", "int"],
  ["checkouts", "checkouts", "int"],
  ["purchases", "purchases", "number"],
  ["purchase_value", "purchaseValue", "number"],
  ["video_1s", "video1s", "int"],
  ["video_3s", "video3s", "int"],
  ["video_25", "video25", "int"],
  ["video_50", "video50", "int"],
  ["video_75", "video75", "int"],
  ["video_100", "video100", "int"],
];

const KNOWN_DAILY = new Set(DAILY_COLUMNS.map((c) => c.name));

export function validateDaily(rawRows: RawRow[], accountCurrency: string, opts: { maxIssues?: number } = {}): DailyValidation {
  const sheet = SHEETS.daily;
  const maxIssues = opts.maxIssues ?? 500;
  const issues: Issue[] = [];
  const push = (i: Issue) => {
    if (issues.length < maxIssues) issues.push(i);
  };
  const rows = rawRows.map(canonicalizeRow);
  issues.push(...checkHeaders(sheet, rows, DAILY_COLUMNS));
  if (issues.some((i) => i.severity === "error")) {
    return { rows: [], issues, rejected: rows.length, duplicates: 0, dateFrom: null, dateTo: null, summary: emptySummary() };
  }
  const out = new Map<string, NormalizedDaily>();
  let rejected = 0;
  let duplicates = 0;
  const summary = emptySummary();
  let dateFrom: string | null = null;
  let dateTo: string | null = null;

  for (const r of rows) {
    const rowNo = r.__row;
    const errs: string[] = [];
    const d = parseDate(r.date);
    if (d.error || !d.value) errs.push(d.error ?? "Missing date");
    const platform = normalizePlatform(r.platform);
    if (!platform) errs.push("Missing platform");
    const adId = idStr(r.ad_id);
    if (!adId) errs.push("Missing ad_id");
    const spendR = parseNumber(r.spend);
    if (spendR.error) errs.push(`spend: ${spendR.error}`);
    if (spendR.value !== null && spendR.value < 0) errs.push("Negative spend");
    const nums: Partial<Record<keyof NormalizedDaily, number | null>> = {};
    for (const [col, key, kind] of NUM_FIELDS) {
      const p = parseNumber(r[col]);
      if (p.error) errs.push(`${col}: ${p.error}`);
      else if (p.value !== null && p.value < 0) errs.push(`${col}: negative value`);
      else nums[key] = p.value;
      void kind;
    }
    const hook = parseRate(r.hook_rate);
    const hold = parseRate(r.hold_rate);
    if (hook.error) errs.push(`hook_rate: ${hook.error}`);
    if (hold.error) errs.push(`hold_rate: ${hold.error}`);
    if (hook.converted || hold.converted) summary.convertedRates++;
    const launch = parseDate(r.launch_date);
    if (launch.error) errs.push(`launch_date: ${launch.error}`);

    if (errs.length) {
      rejected++;
      push({ sheet, row: rowNo, code: "ROW_REJECTED", message: errs.join("; "), severity: "error" });
      continue;
    }
    let variant = idStr(r.creative_variant_id);
    const pcid = idStr(r.platform_creative_id);
    if (!variant) {
      summary.missingCreativeIds++;
      variant = pcid ?? adId!;
      push({
        sheet,
        row: rowNo,
        field: "creative_variant_id",
        code: "MISSING_CREATIVE_MAPPING",
        message: `creative_variant_id missing — using ${pcid ? "platform_creative_id" : "ad_id"} "${variant}".`,
        severity: "warning",
      });
    }
    const currency = str(r.currency)?.toUpperCase() ?? null;
    if (currency && currency !== accountCurrency.toUpperCase()) {
      summary.currencyIssues++;
      push({ sheet, row: rowNo, field: "currency", code: "CURRENCY_MISMATCH", message: `Row currency ${currency} ≠ account currency ${accountCurrency}. Imported and flagged as TRACKING RISK.`, severity: "warning" });
    }
    const purchases = nums.purchases ?? null;
    const value = nums.purchaseValue ?? null;
    if (purchases === null) summary.missingPurchases++;
    if (purchases !== null && purchases > 0 && (value === null || value === 0)) {
      summary.missingPurchaseValue++;
      push({ sheet, row: rowNo, field: "purchase_value", code: "MISSING_PURCHASE_VALUE", message: `${purchases} purchases but purchase_value is ${value === null ? "blank" : "0"}.`, severity: "warning" });
    }
    const impr = nums.impressions ?? null;
    const clicks = nums.clicks ?? null;
    if (impr !== null && clicks !== null && clicks > impr) {
      summary.invalidRates++;
      push({ sheet, row: rowNo, code: "IMPOSSIBLE_RATE", message: "clicks exceed impressions.", severity: "warning" });
    }
    if (purchases !== null && nums.landingPageViews != null && nums.landingPageViews > 0 && purchases > nums.landingPageViews * 1.5) {
      summary.invalidRates++;
      push({ sheet, row: rowNo, code: "IMPOSSIBLE_RATE", message: "purchases far exceed landing page views.", severity: "warning" });
    }
    const native: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) if (k !== "__row" && !KNOWN_DAILY.has(k) && !isBlank(v)) native[k] = v;
    const rec: NormalizedDaily = {
      date: d.value!,
      platform: platform!,
      accountRef: str(r.account_id),
      currency,
      campaignId: idStr(r.campaign_id),
      campaignName: str(r.campaign_name),
      campaignObjective: str(r.campaign_objective),
      adsetId: idStr(r.adset_id),
      adsetName: str(r.adset_name),
      adId: adId!,
      adName: str(r.ad_name),
      platformCreativeId: pcid,
      creativeVariantId: variant,
      creativeGroupId: idStr(r.creative_group_id),
      creativeName: str(r.creative_name),
      launchDate: launch.value,
      adStatus: str(r.ad_status),
      spend: spendR.value ?? 0,
      impressions: impr,
      reach: nums.reach ?? null,
      frequency: nums.frequency ?? null,
      clicks,
      outboundClicks: nums.outboundClicks ?? null,
      landingPageViews: nums.landingPageViews ?? null,
      addToCart: nums.addToCart ?? null,
      checkouts: nums.checkouts ?? null,
      purchases,
      purchaseValue: value,
      video1s: nums.video1s ?? null,
      video3s: nums.video3s ?? null,
      video25: nums.video25 ?? null,
      video50: nums.video50 ?? null,
      video75: nums.video75 ?? null,
      video100: nums.video100 ?? null,
      hookRate: hook.value,
      holdRate: hold.value,
      thumbnailUrl: str(r.thumbnail_url),
      mediaUrl: str(r.media_url),
      landingPage: str(r.landing_page),
      source: str(r.source),
      nativeMetrics: Object.keys(native).length ? native : null,
    };
    const key = `${rec.platform}|${rec.adId}|${rec.date}`;
    if (out.has(key)) {
      duplicates++;
      push({ sheet, row: rowNo, code: "DUPLICATE_ROW", message: `Duplicate DATE × AD (${rec.date}, ${rec.adId}) in this file — the later row replaces the earlier one.`, severity: "warning" });
    }
    out.set(key, rec);
    if (!dateFrom || rec.date < dateFrom) dateFrom = rec.date;
    if (!dateTo || rec.date > dateTo) dateTo = rec.date;
  }
  if (summary.convertedRates) push({ sheet, code: "RATES_CONVERTED", message: `${summary.convertedRates} rate values given as percentages were converted to 0–1.`, severity: "info" });
  return { rows: [...out.values()], issues, rejected, duplicates, dateFrom, dateTo, summary };
}

function emptySummary(): DailyValidation["summary"] {
  return { missingCreativeIds: 0, missingPurchaseValue: 0, missingPurchases: 0, currencyIssues: 0, invalidRates: 0, convertedRates: 0 };
}

/** Missing calendar dates between first and last date, per platform (date coverage check). */
export function dateCoverage(rows: { date: string; platform: string }[]): { platform: string; from: string; to: string; days: number; missing: string[] }[] {
  const byPlatform = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!byPlatform.has(r.platform)) byPlatform.set(r.platform, new Set());
    byPlatform.get(r.platform)!.add(r.date);
  }
  const res = [];
  for (const [platform, set] of byPlatform) {
    const dates = [...set].sort();
    const from = dates[0];
    const to = dates[dates.length - 1];
    const missing: string[] = [];
    let cur = new Date(from + "T00:00:00Z");
    const end = new Date(to + "T00:00:00Z");
    while (cur <= end) {
      const iso = cur.toISOString().slice(0, 10);
      if (!set.has(iso)) missing.push(iso);
      cur = new Date(cur.getTime() + 86_400_000);
    }
    res.push({ platform, from, to, days: dates.length, missing });
  }
  return res;
}

// ---------------------------------------------------------------- library, targets, events, tags, config

export function validateLibrary(rawRows: RawRow[]): { rows: NormalizedLibrary[]; issues: Issue[]; rejected: number } {
  const sheet = SHEETS.library;
  const rows = rawRows.map(canonicalizeRow);
  const issues = checkHeaders(sheet, rows, LIBRARY_COLUMNS);
  if (issues.some((i) => i.severity === "error")) return { rows: [], issues, rejected: rows.length };
  const out = new Map<string, NormalizedLibrary>();
  let rejected = 0;
  for (const r of rows) {
    const id = idStr(r.creative_variant_id);
    const launch = parseDate(r.launch_date);
    if (!id || launch.error) {
      rejected++;
      issues.push({ sheet, row: r.__row, code: "ROW_REJECTED", message: !id ? "Missing creative_variant_id" : `launch_date: ${launch.error}`, severity: "error" });
      continue;
    }
    if (out.has(id)) issues.push({ sheet, row: r.__row, code: "DUPLICATE_ROW", message: `Duplicate creative_variant_id ${id} — later row wins.`, severity: "warning" });
    out.set(id, {
      creativeVariantId: id,
      creativeGroupId: idStr(r.creative_group_id),
      platformCreativeId: idStr(r.platform_creative_id),
      platform: normalizePlatform(r.platform),
      creativeName: str(r.creative_name),
      assetType: str(r.asset_type),
      format: str(r.format),
      creator: str(r.creator),
      concept: str(r.concept),
      angle: str(r.angle),
      hookTactic: str(r.hook_tactic),
      bodyTactic: str(r.body_tactic),
      headlineTactic: str(r.headline_tactic),
      primaryCopy: str(r.primary_copy),
      headline: str(r.headline),
      cta: str(r.cta),
      offer: str(r.offer),
      productId: idStr(r.product_id),
      productName: str(r.product_name),
      persona: str(r.persona),
      landingPage: str(r.landing_page),
      batch: str(r.batch),
      launchDate: launch.value,
      thumbnailUrl: str(r.thumbnail_url),
      mediaUrl: str(r.media_url),
      manualTags: list(r.manual_tags),
      notes: str(r.notes),
    });
  }
  return { rows: [...out.values()], issues, rejected };
}

export function validateTargets(rawRows: RawRow[]): { rows: NormalizedTarget[]; issues: Issue[]; rejected: number } {
  const sheet = SHEETS.targets;
  const rows = rawRows.map(canonicalizeRow);
  const issues = checkHeaders(sheet, rows, TARGET_COLUMNS);
  if (issues.some((i) => i.severity === "error")) return { rows: [], issues, rejected: rows.length };
  const out: NormalizedTarget[] = [];
  let rejected = 0;
  for (const r of rows) {
    const s = parseDate(r.start_date);
    const e = parseDate(r.end_date);
    const t = parseNumber(r.target_roas);
    const c = parseNumber(r.cpo_guardrail);
    const m = parseRate(r.optional_margin);
    const errs = [s.error, e.error, t.error, c.error, m.error].filter(Boolean) as string[];
    if (!s.value) errs.push("Missing start_date");
    if (t.value === null || t.value <= 0) errs.push("target_roas must be > 0");
    if (s.value && e.value && e.value < s.value) errs.push("end_date before start_date");
    if (errs.length) {
      rejected++;
      issues.push({ sheet, row: r.__row, code: "ROW_REJECTED", message: errs.join("; "), severity: "error" });
      continue;
    }
    out.push({ startDate: s.value!, endDate: e.value, targetRoas: t.value!, cpoGuardrail: c.value, optionalMargin: m.value, notes: str(r.notes) });
  }
  out.sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
  for (let i = 1; i < out.length; i++) {
    const prev = out[i - 1];
    if (prev.endDate === null || prev.endDate >= out[i].startDate) {
      issues.push({ sheet, code: "OVERLAPPING_TARGETS", message: `Target regimes starting ${prev.startDate} and ${out[i].startDate} overlap — the later start wins on overlapping dates.`, severity: "warning" });
    }
  }
  return { rows: out, issues, rejected };
}

export function validateEvents(rawRows: RawRow[]): { rows: NormalizedEvent[]; issues: Issue[]; rejected: number } {
  const sheet = SHEETS.events;
  const rows = rawRows.map(canonicalizeRow);
  const issues = checkHeaders(sheet, rows, EVENT_COLUMNS);
  if (issues.some((i) => i.severity === "error")) return { rows: [], issues, rejected: rows.length };
  const out: NormalizedEvent[] = [];
  let rejected = 0;
  for (const r of rows) {
    const d = parseDate(r.date);
    const type = str(r.event_type);
    if (!d.value || !type) {
      rejected++;
      issues.push({ sheet, row: r.__row, code: "ROW_REJECTED", message: d.error ?? (!d.value ? "Missing date" : "Missing event_type"), severity: "error" });
      continue;
    }
    const known = EVENT_TYPES.find((e) => e.toLowerCase() === type.toLowerCase());
    if (!known) issues.push({ sheet, row: r.__row, code: "UNKNOWN_EVENT_TYPE", message: `Unknown event_type "${type}" — stored as given.`, severity: "info" });
    out.push({ date: d.value, creativeVariantId: idStr(r.creative_variant_id), platform: normalizePlatform(r.platform), eventType: known ?? type, description: str(r.description) });
  }
  return { rows: out, issues, rejected };
}

export function validateTags(rawRows: RawRow[]): { rows: NormalizedTag[]; issues: Issue[]; rejected: number } {
  const sheet = SHEETS.tags;
  const rows = rawRows.map(canonicalizeRow);
  const issues = checkHeaders(sheet, rows, TAG_COLUMNS);
  if (issues.some((i) => i.severity === "error")) return { rows: [], issues, rejected: rows.length };
  const out: NormalizedTag[] = [];
  let rejected = 0;
  for (const r of rows) {
    const id = idStr(r.creative_variant_id);
    const t = str(r.tag_type);
    const v = str(r.tag_value);
    if (!id || !t || !v) {
      rejected++;
      issues.push({ sheet, row: r.__row, code: "ROW_REJECTED", message: "creative_variant_id, tag_type and tag_value are required.", severity: "error" });
      continue;
    }
    out.push({ creativeVariantId: id, tagType: normKey(t), tagValue: v });
  }
  return { rows: out, issues, rejected };
}

export function validateConfig(rawRows: RawRow[]): { config: NormalizedConfig; issues: Issue[] } {
  const sheet = SHEETS.config;
  const issues: Issue[] = [];
  const kv = new Map<string, unknown>();
  for (const r0 of rawRows) {
    const r = canonicalizeRow(r0);
    const key = str(r.field ?? r.key ?? r.setting);
    if (key) kv.set(normKey(key), r.value);
  }
  const cfg: NormalizedConfig = {};
  for (const f of CONFIG_FIELDS) {
    const v = kv.get(f.name);
    if (isBlank(v)) continue;
    const bad = (msg: string) => issues.push({ sheet, field: f.name, code: "INVALID_CONFIG", message: `${f.name}: ${msg}`, severity: "warning" });
    switch (f.name) {
      case "brand_name":
        cfg.brandName = str(v)!;
        break;
      case "currency":
        cfg.currency = str(v)!.toUpperCase();
        break;
      case "timezone":
        cfg.timezone = str(v)!;
        break;
      case "primary_conversion":
        cfg.primaryConversion = str(v)!;
        break;
      case "notes":
        cfg.notes = str(v)!;
        break;
      case "platforms":
        cfg.platforms = list(v).map((p) => normalizePlatform(p)!).filter(Boolean);
        break;
      case "active_products":
        cfg.activeProducts = list(v);
        break;
      case "gross_margin": {
        const p = parseRate(v);
        if (p.error) bad(p.error);
        else cfg.grossMargin = p.value;
        break;
      }
      case "fatigue_sensitivity": {
        const s = str(v)!.toUpperCase();
        if (s === "LOW" || s === "MEDIUM" || s === "HIGH") cfg.fatigueSensitivity = s;
        else bad("must be LOW, MEDIUM or HIGH");
        break;
      }
      case "default_analysis_window":
        cfg.defaultAnalysisWindow = str(v)!;
        break;
      case "default_comparison_window":
        cfg.defaultComparisonWindow = str(v)!;
        break;
      default: {
        const p = parseNumber(v);
        if (p.error || p.value === null) {
          bad(p.error ?? "blank");
          break;
        }
        const n = p.value;
        if (f.name === "target_roas") cfg.targetRoas = n;
        if (f.name === "cpo_guardrail") cfg.cpoGuardrail = n;
        if (f.name === "min_purchases") cfg.minPurchases = Math.round(n);
        if (f.name === "min_evidence_spend") cfg.minEvidenceSpend = n;
        if (f.name === "evidence_spend_multiple") cfg.evidenceSpendMultiple = n;
        if (f.name === "min_days_live") cfg.minDaysLive = Math.round(n);
        if (f.name === "freshness_window_days") cfg.freshnessWindowDays = Math.round(n);
      }
    }
  }
  return { config: cfg, issues };
}

/** Apply 06_OPTIONAL_TAGS to library rows: known fields set the field, others become manual tags. */
export function applyTags(library: Map<string, Partial<NormalizedLibrary>>, tags: NormalizedTag[]): void {
  const fieldMap: Record<string, keyof NormalizedLibrary> = {
    concept: "concept",
    angle: "angle",
    hook_tactic: "hookTactic",
    hook: "hookTactic",
    format: "format",
    creator: "creator",
    offer: "offer",
    cta: "cta",
    persona: "persona",
    asset_type: "assetType",
    body_tactic: "bodyTactic",
    headline_tactic: "headlineTactic",
    product_name: "productName",
    product: "productName",
    batch: "batch",
  };
  for (const t of tags) {
    const rec = library.get(t.creativeVariantId) ?? { creativeVariantId: t.creativeVariantId, manualTags: [] };
    const f = fieldMap[t.tagType];
    if (f) (rec as Record<string, unknown>)[f] = t.tagValue;
    else rec.manualTags = [...new Set([...(rec.manualTags ?? []), `${t.tagType}:${t.tagValue}`])];
    library.set(t.creativeVariantId, rec);
  }
}
