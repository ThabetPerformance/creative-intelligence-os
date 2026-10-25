CREATE TABLE "account_settings" (
	"account_id" text PRIMARY KEY NOT NULL,
	"target_roas" double precision NOT NULL,
	"cpo_guardrail" double precision,
	"gross_margin" double precision,
	"min_purchases" integer DEFAULT 10 NOT NULL,
	"min_evidence_spend" double precision NOT NULL,
	"evidence_spend_multiple" double precision,
	"min_days_live" integer DEFAULT 5 NOT NULL,
	"freshness_window_days" integer DEFAULT 30 NOT NULL,
	"fatigue_sensitivity" text DEFAULT 'MEDIUM' NOT NULL,
	"default_analysis_window" text DEFAULT '30d' NOT NULL,
	"default_comparison_window" text DEFAULT 'prev' NOT NULL,
	"custom_notes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"primary_conversion" text DEFAULT 'purchase' NOT NULL,
	"data_mode" text DEFAULT 'FILE' NOT NULL,
	"platforms" text[] DEFAULT '{}' NOT NULL,
	"active_products" text[] DEFAULT '{}' NOT NULL,
	"notes" text,
	"data_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creative_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"experiment_id" integer,
	"creative_key" text,
	"creative_name" text,
	"priority" text DEFAULT 'MEDIUM' NOT NULL,
	"diagnosis" text,
	"decision" text,
	"action" text NOT NULL,
	"primary_kpi" text,
	"secondary_kpi" text,
	"baseline" text,
	"target_guardrail" text,
	"validation_window" text,
	"owner" text,
	"status" text DEFAULT 'TO DO' NOT NULL,
	"start_date" date,
	"end_date" date,
	"observed_result" text,
	"decision_outcome" text,
	"learning" text,
	"next_step" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creative_ad_daily" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"date" date NOT NULL,
	"platform" text NOT NULL,
	"currency" text,
	"campaign_id" text,
	"campaign_name" text,
	"campaign_objective" text,
	"adset_id" text,
	"adset_name" text,
	"ad_id" text NOT NULL,
	"ad_name" text,
	"platform_creative_id" text,
	"creative_variant_id" text NOT NULL,
	"creative_group_id" text,
	"creative_name" text,
	"launch_date" date,
	"ad_status" text,
	"spend" double precision DEFAULT 0 NOT NULL,
	"impressions" double precision,
	"reach" double precision,
	"frequency" double precision,
	"clicks" double precision,
	"outbound_clicks" double precision,
	"landing_page_views" double precision,
	"add_to_cart" double precision,
	"checkouts" double precision,
	"purchases" double precision,
	"purchase_value" double precision,
	"video_1s" double precision,
	"video_3s" double precision,
	"video_25" double precision,
	"video_50" double precision,
	"video_75" double precision,
	"video_100" double precision,
	"hook_rate" double precision,
	"hold_rate" double precision,
	"thumbnail_url" text,
	"media_url" text,
	"landing_page" text,
	"source" text DEFAULT 'FILE' NOT NULL,
	"native_metrics" jsonb,
	"ingestion_run_id" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creative_cohort_snapshots" (
	"account_id" text NOT NULL,
	"cohort_type" text NOT NULL,
	"cohort_key" text NOT NULL,
	"as_of_date" date NOT NULL,
	"metrics" jsonb NOT NULL,
	CONSTRAINT "creative_cohort_snapshots_account_id_cohort_type_cohort_key_as_of_date_pk" PRIMARY KEY("account_id","cohort_type","cohort_key","as_of_date")
);
--> statement-breakpoint
CREATE TABLE "creative_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"creative_variant_id" text,
	"experiment_id" integer,
	"date" date NOT NULL,
	"event_type" text NOT NULL,
	"description" text,
	"source" text DEFAULT 'FILE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creative_experiments" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"code" text NOT NULL,
	"hypothesis" text,
	"control_creative_key" text,
	"test_creative_keys" text[] DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'TO DO' NOT NULL,
	"start_date" date,
	"end_date" date,
	"result" text,
	"decision_outcome" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creative_learnings" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"action_id" integer,
	"creative_key" text,
	"creative_group_id" text,
	"concept" text,
	"angle" text,
	"hook_tactic" text,
	"format" text,
	"creator" text,
	"learning" text NOT NULL,
	"evidence_status" text DEFAULT 'HYPOTHESIS' NOT NULL,
	"outcome" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creative_library" (
	"account_id" text NOT NULL,
	"creative_variant_id" text NOT NULL,
	"creative_group_id" text,
	"platform_creative_id" text,
	"platform" text,
	"creative_name" text,
	"asset_type" text,
	"format" text,
	"creator" text,
	"concept" text,
	"angle" text,
	"hook_tactic" text,
	"body_tactic" text,
	"headline_tactic" text,
	"primary_copy" text,
	"headline" text,
	"cta" text,
	"offer" text,
	"product_id" text,
	"product_name" text,
	"persona" text,
	"landing_page" text,
	"batch" text,
	"launch_date" date,
	"thumbnail_url" text,
	"media_url" text,
	"manual_tags" text[] DEFAULT '{}' NOT NULL,
	"notes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creative_library_account_id_creative_variant_id_pk" PRIMARY KEY("account_id","creative_variant_id")
);
--> statement-breakpoint
CREATE TABLE "creative_lifecycle_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"creative_key" text NOT NULL,
	"stage" text NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "creative_rank_history" (
	"account_id" text NOT NULL,
	"creative_key" text NOT NULL,
	"week_end" date NOT NULL,
	"rank" integer NOT NULL,
	"score" double precision NOT NULL,
	CONSTRAINT "creative_rank_history_account_id_creative_key_week_end_pk" PRIMARY KEY("account_id","creative_key","week_end")
);
--> statement-breakpoint
CREATE TABLE "creative_status_snapshots" (
	"account_id" text NOT NULL,
	"creative_key" text NOT NULL,
	"as_of_date" date NOT NULL,
	"classification" text NOT NULL,
	"decision" text NOT NULL,
	"confidence" text NOT NULL,
	"lifecycle" text,
	"evidence" text NOT NULL,
	"fatigue_status" text,
	"target_roas_used" double precision,
	"cpo_guardrail_used" double precision,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "creative_status_snapshots_account_id_creative_key_as_of_date_pk" PRIMARY KEY("account_id","creative_key","as_of_date")
);
--> statement-breakpoint
CREATE TABLE "ingestion_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"source" text NOT NULL,
	"kind" text DEFAULT 'IMPORT' NOT NULL,
	"file_name" text,
	"status" text DEFAULT 'RUNNING' NOT NULL,
	"rows_total" integer DEFAULT 0 NOT NULL,
	"rows_imported" integer DEFAULT 0 NOT NULL,
	"rows_rejected" integer DEFAULT 0 NOT NULL,
	"date_from" date,
	"date_to" date,
	"chunk_start" date,
	"chunk_end" date,
	"attempts" integer DEFAULT 1 NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "source_account_mappings" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"platform" text NOT NULL,
	"connector" text NOT NULL,
	"external_account_id" text NOT NULL,
	"label" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"field_map" jsonb,
	"discovered_fields" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'NOT_CONNECTED' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_status" (
	"account_id" text NOT NULL,
	"source" text NOT NULL,
	"rows" integer DEFAULT 0 NOT NULL,
	"first_date" date,
	"latest_date" date,
	"last_imported_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"trust" text DEFAULT 'UNKNOWN' NOT NULL,
	CONSTRAINT "source_status_account_id_source_pk" PRIMARY KEY("account_id","source")
);
--> statement-breakpoint
CREATE TABLE "targets_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"target_roas" double precision NOT NULL,
	"cpo_guardrail" double precision,
	"optional_margin" double precision,
	"notes" text
);
--> statement-breakpoint
ALTER TABLE "account_settings" ADD CONSTRAINT "account_settings_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_actions" ADD CONSTRAINT "creative_actions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_actions" ADD CONSTRAINT "creative_actions_experiment_id_creative_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."creative_experiments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_ad_daily" ADD CONSTRAINT "creative_ad_daily_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_cohort_snapshots" ADD CONSTRAINT "creative_cohort_snapshots_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_events" ADD CONSTRAINT "creative_events_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_experiments" ADD CONSTRAINT "creative_experiments_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_learnings" ADD CONSTRAINT "creative_learnings_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_library" ADD CONSTRAINT "creative_library_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_lifecycle_history" ADD CONSTRAINT "creative_lifecycle_history_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_rank_history" ADD CONSTRAINT "creative_rank_history_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_status_snapshots" ADD CONSTRAINT "creative_status_snapshots_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_runs" ADD CONSTRAINT "ingestion_runs_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_account_mappings" ADD CONSTRAINT "source_account_mappings_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_connections" ADD CONSTRAINT "source_connections_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_status" ADD CONSTRAINT "source_status_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "targets_history" ADD CONSTRAINT "targets_history_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "creative_actions_account_idx" ON "creative_actions" USING btree ("account_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "creative_ad_daily_grain_uq" ON "creative_ad_daily" USING btree ("account_id","platform","ad_id","date");--> statement-breakpoint
CREATE INDEX "creative_ad_daily_account_date_idx" ON "creative_ad_daily" USING btree ("account_id","date");--> statement-breakpoint
CREATE INDEX "creative_ad_daily_variant_idx" ON "creative_ad_daily" USING btree ("account_id","creative_variant_id","date");--> statement-breakpoint
CREATE INDEX "creative_ad_daily_pcid_idx" ON "creative_ad_daily" USING btree ("account_id","platform_creative_id");--> statement-breakpoint
CREATE INDEX "creative_ad_daily_group_idx" ON "creative_ad_daily" USING btree ("account_id","creative_group_id");--> statement-breakpoint
CREATE INDEX "creative_ad_daily_platform_idx" ON "creative_ad_daily" USING btree ("account_id","platform","date");--> statement-breakpoint
CREATE INDEX "creative_events_variant_idx" ON "creative_events" USING btree ("account_id","creative_variant_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "creative_experiments_code_uq" ON "creative_experiments" USING btree ("account_id","code");--> statement-breakpoint
CREATE INDEX "creative_learnings_account_idx" ON "creative_learnings" USING btree ("account_id","concept");--> statement-breakpoint
CREATE INDEX "creative_library_group_idx" ON "creative_library" USING btree ("account_id","creative_group_id");--> statement-breakpoint
CREATE INDEX "creative_library_pcid_idx" ON "creative_library" USING btree ("account_id","platform_creative_id");--> statement-breakpoint
CREATE INDEX "creative_library_launch_idx" ON "creative_library" USING btree ("account_id","launch_date");--> statement-breakpoint
CREATE INDEX "creative_lifecycle_history_idx" ON "creative_lifecycle_history" USING btree ("account_id","creative_key","from_date");--> statement-breakpoint
CREATE INDEX "creative_rank_history_week_idx" ON "creative_rank_history" USING btree ("account_id","week_end","rank");--> statement-breakpoint
CREATE INDEX "creative_status_snapshots_class_idx" ON "creative_status_snapshots" USING btree ("account_id","as_of_date","classification");--> statement-breakpoint
CREATE INDEX "ingestion_runs_account_idx" ON "ingestion_runs" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "source_account_mappings_uq" ON "source_account_mappings" USING btree ("account_id","connector","external_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_connections_account_source_uq" ON "source_connections" USING btree ("account_id","source");--> statement-breakpoint
CREATE INDEX "targets_history_account_idx" ON "targets_history" USING btree ("account_id","start_date");