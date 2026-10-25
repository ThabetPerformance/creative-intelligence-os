import {
  pgTable,
  text,
  integer,
  doublePrecision,
  date,
  timestamp,
  jsonb,
  boolean,
  serial,
  bigserial,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";

/**
 * Creative Intelligence OS — persistence layer.
 * Every table that holds account data carries account_id. Data is never mixed across accounts.
 * Nullable metric columns mean UNAVAILABLE, never zero.
 */

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  currency: text("currency").notNull().default("USD"),
  timezone: text("timezone").notNull().default("UTC"),
  primaryConversion: text("primary_conversion").notNull().default("purchase"),
  dataMode: text("data_mode").notNull().default("FILE"),
  platforms: text("platforms").array().notNull().default([]),
  activeProducts: text("active_products").array().notNull().default([]),
  notes: text("notes"),
  dataVersion: integer("data_version").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accountSettings = pgTable("account_settings", {
  accountId: text("account_id")
    .primaryKey()
    .references(() => accounts.id, { onDelete: "cascade" }),
  targetRoas: doublePrecision("target_roas").notNull(),
  cpoGuardrail: doublePrecision("cpo_guardrail"),
  grossMargin: doublePrecision("gross_margin"),
  minPurchases: integer("min_purchases").notNull().default(10),
  minEvidenceSpend: doublePrecision("min_evidence_spend").notNull(),
  evidenceSpendMultiple: doublePrecision("evidence_spend_multiple"),
  minDaysLive: integer("min_days_live").notNull().default(5),
  freshnessWindowDays: integer("freshness_window_days").notNull().default(30),
  fatigueSensitivity: text("fatigue_sensitivity").notNull().default("MEDIUM"),
  defaultAnalysisWindow: text("default_analysis_window").notNull().default("30d"),
  defaultComparisonWindow: text("default_comparison_window").notNull().default("prev"),
  customNotes: text("custom_notes"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const targetsHistory = pgTable(
  "targets_history",
  {
    id: serial("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    targetRoas: doublePrecision("target_roas").notNull(),
    cpoGuardrail: doublePrecision("cpo_guardrail"),
    optionalMargin: doublePrecision("optional_margin"),
    notes: text("notes"),
  },
  (t) => [index("targets_history_account_idx").on(t.accountId, t.startDate)],
);

export const sourceConnections = pgTable(
  "source_connections",
  {
    id: serial("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    source: text("source").notNull(), // FILE | WINDSOR
    status: text("status").notNull().default("NOT_CONNECTED"),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("source_connections_account_source_uq").on(t.accountId, t.source)],
);

export const sourceAccountMappings = pgTable(
  "source_account_mappings",
  {
    id: serial("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(), // meta | tiktok | snapchat | google
    connector: text("connector").notNull(), // windsor connector slug, e.g. facebook
    externalAccountId: text("external_account_id").notNull(),
    label: text("label"),
    enabled: boolean("enabled").notNull().default(true),
    fieldMap: jsonb("field_map").$type<Record<string, string>>(),
    discoveredFields: jsonb("discovered_fields").$type<string[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("source_account_mappings_uq").on(t.accountId, t.connector, t.externalAccountId)],
);

export const ingestionRuns = pgTable(
  "ingestion_runs",
  {
    id: serial("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    source: text("source").notNull(), // FILE | WINDSOR
    kind: text("kind").notNull().default("IMPORT"), // IMPORT | BACKFILL_CHUNK | REFRESH
    fileName: text("file_name"),
    status: text("status").notNull().default("RUNNING"), // RUNNING | SUCCESS | PARTIAL | FAILED
    rowsTotal: integer("rows_total").notNull().default(0),
    rowsImported: integer("rows_imported").notNull().default(0),
    rowsRejected: integer("rows_rejected").notNull().default(0),
    dateFrom: date("date_from"),
    dateTo: date("date_to"),
    chunkStart: date("chunk_start"),
    chunkEnd: date("chunk_end"),
    attempts: integer("attempts").notNull().default(1),
    warnings: jsonb("warnings").$type<IssueRecord[]>().notNull().default([]),
    errors: jsonb("errors").$type<IssueRecord[]>().notNull().default([]),
    summary: jsonb("summary").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("ingestion_runs_account_idx").on(t.accountId, t.createdAt)],
);

export type IssueRecord = { sheet?: string; row?: number; field?: string; code: string; message: string };

export const creativeLibrary = pgTable(
  "creative_library",
  {
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    creativeVariantId: text("creative_variant_id").notNull(),
    creativeGroupId: text("creative_group_id"),
    platformCreativeId: text("platform_creative_id"),
    platform: text("platform"),
    creativeName: text("creative_name"),
    assetType: text("asset_type"),
    format: text("format"),
    creator: text("creator"),
    concept: text("concept"),
    angle: text("angle"),
    hookTactic: text("hook_tactic"),
    bodyTactic: text("body_tactic"),
    headlineTactic: text("headline_tactic"),
    primaryCopy: text("primary_copy"),
    headline: text("headline"),
    cta: text("cta"),
    offer: text("offer"),
    productId: text("product_id"),
    productName: text("product_name"),
    persona: text("persona"),
    landingPage: text("landing_page"),
    batch: text("batch"),
    launchDate: date("launch_date"),
    thumbnailUrl: text("thumbnail_url"),
    mediaUrl: text("media_url"),
    manualTags: text("manual_tags").array().notNull().default([]),
    notes: text("notes"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.accountId, t.creativeVariantId] }),
    index("creative_library_group_idx").on(t.accountId, t.creativeGroupId),
    index("creative_library_pcid_idx").on(t.accountId, t.platformCreativeId),
    index("creative_library_launch_idx").on(t.accountId, t.launchDate),
  ],
);

export const creativeAdDaily = pgTable(
  "creative_ad_daily",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    platform: text("platform").notNull(),
    currency: text("currency"),
    campaignId: text("campaign_id"),
    campaignName: text("campaign_name"),
    campaignObjective: text("campaign_objective"),
    adsetId: text("adset_id"),
    adsetName: text("adset_name"),
    adId: text("ad_id").notNull(),
    adName: text("ad_name"),
    platformCreativeId: text("platform_creative_id"),
    creativeVariantId: text("creative_variant_id").notNull(),
    creativeGroupId: text("creative_group_id"),
    creativeName: text("creative_name"),
    launchDate: date("launch_date"),
    adStatus: text("ad_status"),
    spend: doublePrecision("spend").notNull().default(0),
    impressions: doublePrecision("impressions"),
    reach: doublePrecision("reach"),
    frequency: doublePrecision("frequency"),
    clicks: doublePrecision("clicks"),
    outboundClicks: doublePrecision("outbound_clicks"),
    landingPageViews: doublePrecision("landing_page_views"),
    addToCart: doublePrecision("add_to_cart"),
    checkouts: doublePrecision("checkouts"),
    purchases: doublePrecision("purchases"),
    purchaseValue: doublePrecision("purchase_value"),
    video1s: doublePrecision("video_1s"),
    video3s: doublePrecision("video_3s"),
    video25: doublePrecision("video_25"),
    video50: doublePrecision("video_50"),
    video75: doublePrecision("video_75"),
    video100: doublePrecision("video_100"),
    hookRate: doublePrecision("hook_rate"),
    holdRate: doublePrecision("hold_rate"),
    thumbnailUrl: text("thumbnail_url"),
    mediaUrl: text("media_url"),
    landingPage: text("landing_page"),
    source: text("source").notNull().default("FILE"),
    nativeMetrics: jsonb("native_metrics").$type<Record<string, unknown>>(),
    ingestionRunId: integer("ingestion_run_id"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("creative_ad_daily_grain_uq").on(t.accountId, t.platform, t.adId, t.date),
    index("creative_ad_daily_account_date_idx").on(t.accountId, t.date),
    index("creative_ad_daily_variant_idx").on(t.accountId, t.creativeVariantId, t.date),
    index("creative_ad_daily_pcid_idx").on(t.accountId, t.platformCreativeId),
    index("creative_ad_daily_group_idx").on(t.accountId, t.creativeGroupId),
    index("creative_ad_daily_platform_idx").on(t.accountId, t.platform, t.date),
  ],
);

export const creativeEvents = pgTable(
  "creative_events",
  {
    id: serial("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    creativeVariantId: text("creative_variant_id"),
    experimentId: integer("experiment_id"),
    date: date("date").notNull(),
    eventType: text("event_type").notNull(),
    description: text("description"),
    source: text("source").notNull().default("FILE"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("creative_events_variant_idx").on(t.accountId, t.creativeVariantId, t.date)],
);

export const creativeStatusSnapshots = pgTable(
  "creative_status_snapshots",
  {
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    creativeKey: text("creative_key").notNull(),
    asOfDate: date("as_of_date").notNull(),
    classification: text("classification").notNull(),
    decision: text("decision").notNull(),
    confidence: text("confidence").notNull(),
    lifecycle: text("lifecycle"),
    evidence: text("evidence").notNull(),
    fatigueStatus: text("fatigue_status"),
    targetRoasUsed: doublePrecision("target_roas_used"),
    cpoGuardrailUsed: doublePrecision("cpo_guardrail_used"),
    metrics: jsonb("metrics").$type<Record<string, number | null>>().notNull().default({}),
  },
  (t) => [
    primaryKey({ columns: [t.accountId, t.creativeKey, t.asOfDate] }),
    index("creative_status_snapshots_class_idx").on(t.accountId, t.asOfDate, t.classification),
  ],
);

export const creativeLifecycleHistory = pgTable(
  "creative_lifecycle_history",
  {
    id: serial("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    creativeKey: text("creative_key").notNull(),
    stage: text("stage").notNull(),
    fromDate: date("from_date").notNull(),
    toDate: date("to_date"),
    reason: text("reason"),
  },
  (t) => [index("creative_lifecycle_history_idx").on(t.accountId, t.creativeKey, t.fromDate)],
);

export const creativeRankHistory = pgTable(
  "creative_rank_history",
  {
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    creativeKey: text("creative_key").notNull(),
    weekEnd: date("week_end").notNull(),
    rank: integer("rank").notNull(),
    score: doublePrecision("score").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.accountId, t.creativeKey, t.weekEnd] }),
    index("creative_rank_history_week_idx").on(t.accountId, t.weekEnd, t.rank),
  ],
);

export const creativeCohortSnapshots = pgTable(
  "creative_cohort_snapshots",
  {
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    cohortType: text("cohort_type").notNull(),
    cohortKey: text("cohort_key").notNull(),
    asOfDate: date("as_of_date").notNull(),
    metrics: jsonb("metrics").$type<Record<string, number | null>>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.cohortType, t.cohortKey, t.asOfDate] })],
);

export const creativeExperiments = pgTable(
  "creative_experiments",
  {
    id: serial("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    hypothesis: text("hypothesis"),
    controlCreativeKey: text("control_creative_key"),
    testCreativeKeys: text("test_creative_keys").array().notNull().default([]),
    status: text("status").notNull().default("TO DO"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    result: text("result"),
    decisionOutcome: text("decision_outcome"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("creative_experiments_code_uq").on(t.accountId, t.code)],
);

export const creativeActions = pgTable(
  "creative_actions",
  {
    id: serial("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    experimentId: integer("experiment_id").references(() => creativeExperiments.id, { onDelete: "set null" }),
    creativeKey: text("creative_key"),
    creativeName: text("creative_name"),
    priority: text("priority").notNull().default("MEDIUM"),
    diagnosis: text("diagnosis"),
    decision: text("decision"),
    action: text("action").notNull(),
    primaryKpi: text("primary_kpi"),
    secondaryKpi: text("secondary_kpi"),
    baseline: text("baseline"),
    targetGuardrail: text("target_guardrail"),
    validationWindow: text("validation_window"),
    owner: text("owner"),
    status: text("status").notNull().default("TO DO"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    observedResult: text("observed_result"),
    decisionOutcome: text("decision_outcome"),
    learning: text("learning"),
    nextStep: text("next_step"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("creative_actions_account_idx").on(t.accountId, t.status)],
);

export const creativeLearnings = pgTable(
  "creative_learnings",
  {
    id: serial("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    actionId: integer("action_id"),
    creativeKey: text("creative_key"),
    creativeGroupId: text("creative_group_id"),
    concept: text("concept"),
    angle: text("angle"),
    hookTactic: text("hook_tactic"),
    format: text("format"),
    creator: text("creator"),
    learning: text("learning").notNull(),
    evidenceStatus: text("evidence_status").notNull().default("HYPOTHESIS"),
    outcome: text("outcome"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("creative_learnings_account_idx").on(t.accountId, t.concept)],
);

export const sourceStatus = pgTable(
  "source_status",
  {
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    rows: integer("rows").notNull().default(0),
    firstDate: date("first_date"),
    latestDate: date("latest_date"),
    lastImportedAt: timestamp("last_imported_at", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    trust: text("trust").notNull().default("UNKNOWN"),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.source] })],
);
