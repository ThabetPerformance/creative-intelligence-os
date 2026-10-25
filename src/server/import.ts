import "server-only";
import { getPool } from "@/lib/db/client";
import type { IssueRecord } from "@/lib/db/schema";
import type { Issue, NormalizedConfig, NormalizedDaily, NormalizedEvent, NormalizedLibrary, NormalizedTag, NormalizedTarget } from "@/ingestion/validate";
import { applyTags } from "@/ingestion/validate";
import { invalidateAccount } from "./cache";

/**
 * Persistence for File Mode (and Windsor, which produces the same NormalizedDaily rows).
 * Idempotent: DATE × AD is unique, so re-uploads update rows instead of duplicating them.
 */

const DAILY_COLS: [string, keyof NormalizedDaily | null][] = [
  ["account_id", null],
  ["date", "date"],
  ["platform", "platform"],
  ["currency", "currency"],
  ["campaign_id", "campaignId"],
  ["campaign_name", "campaignName"],
  ["campaign_objective", "campaignObjective"],
  ["adset_id", "adsetId"],
  ["adset_name", "adsetName"],
  ["ad_id", "adId"],
  ["ad_name", "adName"],
  ["platform_creative_id", "platformCreativeId"],
  ["creative_variant_id", "creativeVariantId"],
  ["creative_group_id", "creativeGroupId"],
  ["creative_name", "creativeName"],
  ["launch_date", "launchDate"],
  ["ad_status", "adStatus"],
  ["spend", "spend"],
  ["impressions", "impressions"],
  ["reach", "reach"],
  ["frequency", "frequency"],
  ["clicks", "clicks"],
  ["outbound_clicks", "outboundClicks"],
  ["landing_page_views", "landingPageViews"],
  ["add_to_cart", "addToCart"],
  ["checkouts", "checkouts"],
  ["purchases", "purchases"],
  ["purchase_value", "purchaseValue"],
  ["video_1s", "video1s"],
  ["video_3s", "video3s"],
  ["video_25", "video25"],
  ["video_50", "video50"],
  ["video_75", "video75"],
  ["video_100", "video100"],
  ["hook_rate", "hookRate"],
  ["hold_rate", "holdRate"],
  ["thumbnail_url", "thumbnailUrl"],
  ["media_url", "mediaUrl"],
  ["landing_page", "landingPage"],
  ["source", "source"],
  ["native_metrics", "nativeMetrics"],
  ["ingestion_run_id", null],
];

export async function upsertDaily(accountId: string, rows: NormalizedDaily[], runId: number, sourceLabel: "FILE" | "WINDSOR"): Promise<number> {
  if (!rows.length) return 0;
  const pool = getPool();
  const batch = 700;
  let n = 0;
  const colNames = DAILY_COLS.map((c) => c[0]);
  const updateSet = colNames
    .filter((c) => !["account_id", "date", "platform", "ad_id"].includes(c))
    .map((c) => `${c} = EXCLUDED.${c}`)
    .concat(["updated_at = now()"])
    .join(", ");
  for (let i = 0; i < rows.length; i += batch) {
    const chunk = rows.slice(i, i + batch);
    const params: unknown[] = [];
    const tuples: string[] = [];
    for (const r of chunk) {
      const ph: string[] = [];
      for (const [col, key] of DAILY_COLS) {
        let v: unknown;
        if (col === "account_id") v = accountId;
        else if (col === "ingestion_run_id") v = runId;
        else if (col === "source") v = r.source ?? sourceLabel;
        else if (col === "native_metrics") v = r.nativeMetrics ? JSON.stringify(r.nativeMetrics) : null;
        else v = r[key as keyof NormalizedDaily];
        params.push(v ?? null);
        ph.push(`$${params.length}`);
      }
      tuples.push(`(${ph.join(",")})`);
    }
    await pool.query(
      `INSERT INTO creative_ad_daily (${colNames.join(",")}) VALUES ${tuples.join(",")}
       ON CONFLICT (account_id, platform, ad_id, date) DO UPDATE SET ${updateSet}`,
      params,
    );
    n += chunk.length;
  }
  return n;
}

const LIB_COLS: [string, keyof NormalizedLibrary][] = [
  ["creative_variant_id", "creativeVariantId"],
  ["creative_group_id", "creativeGroupId"],
  ["platform_creative_id", "platformCreativeId"],
  ["platform", "platform"],
  ["creative_name", "creativeName"],
  ["asset_type", "assetType"],
  ["format", "format"],
  ["creator", "creator"],
  ["concept", "concept"],
  ["angle", "angle"],
  ["hook_tactic", "hookTactic"],
  ["body_tactic", "bodyTactic"],
  ["headline_tactic", "headlineTactic"],
  ["primary_copy", "primaryCopy"],
  ["headline", "headline"],
  ["cta", "cta"],
  ["offer", "offer"],
  ["product_id", "productId"],
  ["product_name", "productName"],
  ["persona", "persona"],
  ["landing_page", "landingPage"],
  ["batch", "batch"],
  ["launch_date", "launchDate"],
  ["thumbnail_url", "thumbnailUrl"],
  ["media_url", "mediaUrl"],
  ["manual_tags", "manualTags"],
  ["notes", "notes"],
];

export async function upsertLibrary(accountId: string, rows: NormalizedLibrary[], tags: NormalizedTag[] = []): Promise<number> {
  const map = new Map<string, Partial<NormalizedLibrary>>(rows.map((r) => [r.creativeVariantId, r]));
  if (tags.length) applyTags(map, tags);
  const all = [...map.values()];
  if (!all.length) return 0;
  const pool = getPool();
  const cols = ["account_id", ...LIB_COLS.map((c) => c[0])];
  // Partial rows (from tags only) must not wipe existing metadata: COALESCE with existing values.
  const updateSet = LIB_COLS.filter((c) => c[0] !== "creative_variant_id")
    .map(([c]) => (c === "manual_tags" ? `manual_tags = (SELECT ARRAY(SELECT DISTINCT unnest(creative_library.manual_tags || EXCLUDED.manual_tags)))` : `${c} = COALESCE(EXCLUDED.${c}, creative_library.${c})`))
    .concat(["updated_at = now()"])
    .join(", ");
  for (let i = 0; i < all.length; i += 500) {
    const chunk = all.slice(i, i + 500);
    const params: unknown[] = [];
    const tuples: string[] = [];
    for (const r of chunk) {
      const ph: string[] = [];
      params.push(accountId);
      ph.push(`$${params.length}`);
      for (const [col, key] of LIB_COLS) {
        let v: unknown = (r as Record<string, unknown>)[key] ?? null;
        if (col === "manual_tags") v = (v as string[] | null) ?? [];
        params.push(v);
        ph.push(`$${params.length}`);
      }
      tuples.push(`(${ph.join(",")})`);
    }
    await pool.query(`INSERT INTO creative_library (${cols.join(",")}) VALUES ${tuples.join(",")} ON CONFLICT (account_id, creative_variant_id) DO UPDATE SET ${updateSet}`, params);
  }
  return all.length;
}

/** Targets history from a file replaces the account's history (the file is the full regime list). */
export async function replaceTargets(accountId: string, rows: NormalizedTarget[]): Promise<number> {
  if (!rows.length) return 0;
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM targets_history WHERE account_id = $1", [accountId]);
    for (const r of rows) {
      await client.query(
        "INSERT INTO targets_history (account_id, start_date, end_date, target_roas, cpo_guardrail, optional_margin, notes) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [accountId, r.startDate, r.endDate, r.targetRoas, r.cpoGuardrail, r.optionalMargin, r.notes],
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  return rows.length;
}

/** Events are append-only but de-duplicated on (date, creative, type, description). */
export async function insertEvents(accountId: string, rows: NormalizedEvent[], source = "FILE"): Promise<number> {
  let n = 0;
  const pool = getPool();
  for (const e of rows) {
    const r = await pool.query(
      `INSERT INTO creative_events (account_id, creative_variant_id, date, event_type, description, source)
       SELECT $1,$2,$3,$4,$5,$6
       WHERE NOT EXISTS (SELECT 1 FROM creative_events WHERE account_id=$1 AND creative_variant_id IS NOT DISTINCT FROM $2 AND date=$3 AND event_type=$4 AND description IS NOT DISTINCT FROM $5)`,
      [accountId, e.creativeVariantId, e.date, e.eventType, e.description, source],
    );
    n += r.rowCount ?? 0;
  }
  return n;
}

export async function applyConfig(accountId: string, c: NormalizedConfig): Promise<void> {
  const pool = getPool();
  const acc: string[] = [];
  const accP: unknown[] = [];
  const setA = (col: string, v: unknown) => {
    if (v === undefined) return;
    accP.push(v);
    acc.push(`${col} = $${accP.length}`);
  };
  setA("name", c.brandName);
  setA("currency", c.currency);
  setA("timezone", c.timezone);
  setA("primary_conversion", c.primaryConversion);
  setA("platforms", c.platforms);
  setA("active_products", c.activeProducts);
  setA("notes", c.notes);
  if (acc.length) {
    accP.push(accountId);
    await pool.query(`UPDATE accounts SET ${acc.join(", ")}, updated_at = now() WHERE id = $${accP.length}`, accP);
  }
  const st: string[] = [];
  const stP: unknown[] = [];
  const setS = (col: string, v: unknown) => {
    if (v === undefined) return;
    stP.push(v);
    st.push(`${col} = $${stP.length}`);
  };
  setS("target_roas", c.targetRoas);
  setS("cpo_guardrail", c.cpoGuardrail);
  setS("gross_margin", c.grossMargin);
  setS("min_purchases", c.minPurchases);
  setS("min_evidence_spend", c.minEvidenceSpend);
  setS("evidence_spend_multiple", c.evidenceSpendMultiple);
  setS("min_days_live", c.minDaysLive);
  setS("freshness_window_days", c.freshnessWindowDays);
  setS("fatigue_sensitivity", c.fatigueSensitivity);
  setS("default_analysis_window", c.defaultAnalysisWindow);
  setS("default_comparison_window", c.defaultComparisonWindow);
  if (st.length) {
    stP.push(accountId);
    await pool.query(`UPDATE account_settings SET ${st.join(", ")}, updated_at = now() WHERE account_id = $${stP.length}`, stP);
  }
}

export async function startRun(accountId: string, source: "FILE" | "WINDSOR", fileName: string | null, kind = "IMPORT", chunk?: { start: string; end: string }): Promise<number> {
  const r = await getPool().query(
    "INSERT INTO ingestion_runs (account_id, source, kind, file_name, status, chunk_start, chunk_end) VALUES ($1,$2,$3,$4,'RUNNING',$5,$6) RETURNING id",
    [accountId, source, kind, fileName, chunk?.start ?? null, chunk?.end ?? null],
  );
  return r.rows[0].id as number;
}

export async function appendRunProgress(runId: number, p: { total: number; imported: number; rejected: number; warnings: Issue[]; errors: Issue[]; dateFrom: string | null; dateTo: string | null }) {
  const cap = (list: Issue[]): IssueRecord[] => list.slice(0, 200).map((i) => ({ sheet: i.sheet, row: i.row, field: i.field, code: i.code, message: i.message }));
  await getPool().query(
    `UPDATE ingestion_runs SET
       rows_total = rows_total + $2, rows_imported = rows_imported + $3, rows_rejected = rows_rejected + $4,
       warnings = (CASE WHEN jsonb_array_length(warnings) > 1000 THEN warnings ELSE warnings || $5::jsonb END),
       errors = (CASE WHEN jsonb_array_length(errors) > 1000 THEN errors ELSE errors || $6::jsonb END),
       date_from = LEAST(date_from, $7::date), date_to = GREATEST(date_to, $8::date)
     WHERE id = $1`,
    [runId, p.total, p.imported, p.rejected, JSON.stringify(cap(p.warnings)), JSON.stringify(cap(p.errors)), p.dateFrom, p.dateTo],
  );
}

export async function finishRun(accountId: string, runId: number, source: "FILE" | "WINDSOR", summary: Record<string, unknown> = {}, failed = false) {
  const pool = getPool();
  const run = await pool.query("SELECT rows_total, rows_imported, rows_rejected FROM ingestion_runs WHERE id=$1", [runId]);
  const r = run.rows[0];
  const status = failed ? "FAILED" : r && r.rows_rejected > 0 ? "PARTIAL" : "SUCCESS";
  await pool.query("UPDATE ingestion_runs SET status=$2, finished_at=now(), summary = summary || $3::jsonb WHERE id=$1", [runId, status, JSON.stringify(summary)]);
  await refreshSourceStatus(accountId, source);
  // keep planner statistics current after bulk loads (fresh tables otherwise get poor plans)
  if (r && r.rows_imported > 5000) await pool.query("ANALYZE creative_ad_daily").catch(() => undefined);
  await pool.query("UPDATE accounts SET data_version = data_version + 1, updated_at = now() WHERE id=$1", [accountId]);
  invalidateAccount(accountId);
  return status;
}

export async function refreshSourceStatus(accountId: string, source: "FILE" | "WINDSOR") {
  const pool = getPool();
  const like = source === "WINDSOR" ? "WINDSOR%" : "%";
  const s = await pool.query(
    `SELECT count(*)::int AS rows, min(date)::text AS first, max(date)::text AS latest FROM creative_ad_daily WHERE account_id=$1 AND (CASE WHEN $2 = 'WINDSOR' THEN source LIKE $3 ELSE source NOT LIKE 'WINDSOR%' END)`,
    [accountId, source, like],
  );
  const row = s.rows[0];
  await pool.query(
    `INSERT INTO source_status (account_id, source, rows, first_date, latest_date, last_imported_at, last_synced_at, trust)
     VALUES ($1,$2,$3,$4,$5, CASE WHEN $2='FILE' THEN now() END, CASE WHEN $2='WINDSOR' THEN now() END, 'PENDING_CHECK')
     ON CONFLICT (account_id, source) DO UPDATE SET rows=EXCLUDED.rows, first_date=EXCLUDED.first_date, latest_date=EXCLUDED.latest_date,
       last_imported_at = COALESCE(EXCLUDED.last_imported_at, source_status.last_imported_at),
       last_synced_at = COALESCE(EXCLUDED.last_synced_at, source_status.last_synced_at)`,
    [accountId, source, row.rows, row.first, row.latest],
  );
}
