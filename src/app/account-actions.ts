"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getPool } from "@/lib/db/client";
import { invalidateAccount } from "@/server/cache";
import { recalculateAccount } from "@/server/snapshots";
import { getAccount } from "@/server/accounts";
import { ACTION_STATUSES, OUTCOMES } from "@/lib/action-meta";

/** Mutations scoped to one account. Each one invalidates the analysis cache for that account. */

const id = z.string().min(1).max(64);
const optNum = z.union([z.literal("").transform(() => null), z.coerce.number()]).nullable();
const optStr = z
  .string()
  .max(2000)
  .transform((s) => (s.trim() === "" ? null : s.trim()))
  .nullable();
const str = (f: FormData, k: string) => (f.get(k) === null ? null : String(f.get(k)));

async function bump(accountId: string) {
  await getPool().query("UPDATE accounts SET data_version = data_version + 1, updated_at = now() WHERE id=$1", [accountId]);
  invalidateAccount(accountId);
  revalidatePath(`/a/${accountId}`, "layout");
}

async function mustExist(accountId: string) {
  const a = await getAccount(id.parse(accountId));
  if (!a) throw new Error("Account not found");
  return a;
}

// ---------------------------------------------------------------- data management
export async function recalculateAction(accountId: string) {
  await mustExist(accountId);
  const r = await recalculateAccount(accountId);
  await getPool().query(
    "INSERT INTO ingestion_runs (account_id, source, kind, status, summary, finished_at) VALUES ($1,'FILE','RECALCULATE','SUCCESS',$2,now())",
    [accountId, JSON.stringify(r)],
  );
  revalidatePath(`/a/${accountId}`, "layout");
}

export async function reprocessAction(accountId: string) {
  await mustExist(accountId);
  await bump(accountId);
}

export async function deleteRunRowsAction(accountId: string, form: FormData) {
  await mustExist(accountId);
  const runId = z.coerce.number().int().parse(form.get("runId"));
  if (form.get("confirm") !== "DELETE") throw new Error("Type DELETE to confirm.");
  await getPool().query("DELETE FROM creative_ad_daily WHERE account_id=$1 AND ingestion_run_id=$2", [accountId, runId]);
  await getPool().query("UPDATE ingestion_runs SET summary = summary || '{\"rowsDeleted\":true}'::jsonb WHERE id=$1 AND account_id=$2", [runId, accountId]);
  const { refreshSourceStatus } = await import("@/server/import");
  await refreshSourceStatus(accountId, "FILE");
  await bump(accountId);
}

// ---------------------------------------------------------------- settings
const Settings = z.object({
  name: z.string().trim().min(1).max(120),
  currency: z.string().trim().length(3),
  timezone: z.string().trim().min(1).max(64),
  primaryConversion: z.string().trim().min(1).max(64),
  dataMode: z.enum(["FILE", "WINDSOR", "HYBRID"]),
  platforms: z.array(z.string()).default([]),
  notes: optStr,
  targetRoas: z.coerce.number().positive(),
  cpoGuardrail: optNum,
  grossMargin: optNum,
  minPurchases: z.coerce.number().int().min(1),
  minEvidenceSpend: z.coerce.number().min(0),
  evidenceSpendMultiple: optNum,
  minDaysLive: z.coerce.number().int().min(0),
  freshnessWindowDays: z.coerce.number().int().min(1).max(365),
  fatigueSensitivity: z.enum(["LOW", "MEDIUM", "HIGH"]),
  defaultAnalysisWindow: z.string().max(16),
  defaultComparisonWindow: z.string().max(16),
});

export async function saveSettingsAction(accountId: string, form: FormData) {
  await mustExist(accountId);
  const s = Settings.parse({
    ...Object.fromEntries(["name", "currency", "timezone", "primaryConversion", "dataMode", "notes", "targetRoas", "cpoGuardrail", "grossMargin", "minPurchases", "minEvidenceSpend", "evidenceSpendMultiple", "minDaysLive", "freshnessWindowDays", "fatigueSensitivity", "defaultAnalysisWindow", "defaultComparisonWindow"].map((k) => [k, str(form, k) ?? ""])),
    platforms: form.getAll("platforms").map(String),
  });
  const pool = getPool();
  await pool.query("UPDATE accounts SET name=$2, currency=upper($3), timezone=$4, primary_conversion=$5, data_mode=$6, platforms=$7, notes=$8, updated_at=now() WHERE id=$1", [
    accountId,
    s.name,
    s.currency,
    s.timezone,
    s.primaryConversion,
    s.dataMode,
    s.platforms,
    s.notes,
  ]);
  await pool.query(
    `UPDATE account_settings SET target_roas=$2, cpo_guardrail=$3, gross_margin=$4, min_purchases=$5, min_evidence_spend=$6, evidence_spend_multiple=$7,
       min_days_live=$8, freshness_window_days=$9, fatigue_sensitivity=$10, default_analysis_window=$11, default_comparison_window=$12, updated_at=now() WHERE account_id=$1`,
    [accountId, s.targetRoas, s.cpoGuardrail, s.grossMargin, s.minPurchases, s.minEvidenceSpend, s.evidenceSpendMultiple, s.minDaysLive, s.freshnessWindowDays, s.fatigueSensitivity, s.defaultAnalysisWindow, s.defaultComparisonWindow],
  );
  await bump(accountId);
}

const Target = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.union([z.literal("").transform(() => null), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).nullable(),
  targetRoas: z.coerce.number().positive(),
  cpoGuardrail: optNum,
  optionalMargin: optNum,
  notes: optStr,
});

export async function addTargetAction(accountId: string, form: FormData) {
  await mustExist(accountId);
  const t = Target.parse(Object.fromEntries(["startDate", "endDate", "targetRoas", "cpoGuardrail", "optionalMargin", "notes"].map((k) => [k, str(form, k) ?? ""])));
  if (t.endDate && t.endDate < t.startDate) throw new Error("End date is before start date.");
  await getPool().query("INSERT INTO targets_history (account_id, start_date, end_date, target_roas, cpo_guardrail, optional_margin, notes) VALUES ($1,$2,$3,$4,$5,$6,$7)", [
    accountId,
    t.startDate,
    t.endDate,
    t.targetRoas,
    t.cpoGuardrail,
    t.optionalMargin,
    t.notes,
  ]);
  await bump(accountId);
}

export async function deleteTargetAction(accountId: string, form: FormData) {
  await mustExist(accountId);
  await getPool().query("DELETE FROM targets_history WHERE account_id=$1 AND id=$2", [accountId, z.coerce.number().int().parse(form.get("id"))]);
  await bump(accountId);
}

// ---------------------------------------------------------------- action & learning

const ActionInput = z.object({
  creativeKey: optStr,
  creativeName: optStr,
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]).default("MEDIUM"),
  diagnosis: optStr,
  decision: optStr,
  action: z.string().trim().min(1).max(2000),
  primaryKpi: optStr,
  secondaryKpi: optStr,
  baseline: optStr,
  targetGuardrail: optStr,
  validationWindow: optStr,
  owner: optStr,
  startDate: optStr,
  endDate: optStr,
});
const ACTION_FIELDS = ["creativeKey", "creativeName", "priority", "diagnosis", "decision", "action", "primaryKpi", "secondaryKpi", "baseline", "targetGuardrail", "validationWindow", "owner", "startDate", "endDate"];

export async function createActionAction(accountId: string, form: FormData) {
  await mustExist(accountId);
  const a = ActionInput.parse(Object.fromEntries(ACTION_FIELDS.map((k) => [k, str(form, k) ?? ""])));
  await getPool().query(
    `INSERT INTO creative_actions (account_id, creative_key, creative_name, priority, diagnosis, decision, action, primary_kpi, secondary_kpi, baseline, target_guardrail, validation_window, owner, start_date, end_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::date,$15::date)`,
    [accountId, a.creativeKey, a.creativeName, a.priority, a.diagnosis, a.decision, a.action, a.primaryKpi, a.secondaryKpi, a.baseline, a.targetGuardrail, a.validationWindow, a.owner, a.startDate, a.endDate],
  );
  revalidatePath(`/a/${accountId}/actions`);
  if (a.creativeKey) revalidatePath(`/a/${accountId}/creative/${encodeURIComponent(a.creativeKey)}`);
}

const ActionUpdate = z.object({
  id: z.coerce.number().int(),
  status: z.enum(ACTION_STATUSES),
  observedResult: optStr,
  decisionOutcome: z.union([z.literal("").transform(() => null), z.enum(OUTCOMES)]).nullable(),
  learning: optStr,
  nextStep: optStr,
  owner: optStr,
  learningStatus: z.enum(["FACT", "HYPOTHESIS", "VALIDATED_FINDING"]).default("HYPOTHESIS"),
});

/** Updating an action with a learning also records it in the learning library (spec §95–97). */
export async function updateActionAction(accountId: string, form: FormData) {
  await mustExist(accountId);
  const u = ActionUpdate.parse(Object.fromEntries(["id", "status", "observedResult", "decisionOutcome", "learning", "nextStep", "owner", "learningStatus"].map((k) => [k, str(form, k) ?? ""])));
  const pool = getPool();
  const r = await pool.query(
    `UPDATE creative_actions SET status=$3, observed_result=$4, decision_outcome=$5, learning=$6, next_step=$7, owner=COALESCE($8, owner), updated_at=now(),
       end_date = CASE WHEN $3='DONE' AND end_date IS NULL THEN current_date ELSE end_date END
     WHERE account_id=$1 AND id=$2 RETURNING creative_key`,
    [accountId, u.id, u.status, u.observedResult, u.decisionOutcome, u.learning, u.nextStep, u.owner],
  );
  if (u.learning && r.rows[0]) {
    const existing = await pool.query("SELECT id FROM creative_learnings WHERE account_id=$1 AND action_id=$2", [accountId, u.id]);
    const key: string | null = r.rows[0].creative_key;
    const meta = key ? await creativeMetaFor(accountId, key) : null;
    if (existing.rows[0]) {
      await pool.query("UPDATE creative_learnings SET learning=$3, evidence_status=$4, outcome=$5 WHERE account_id=$1 AND id=$2", [accountId, existing.rows[0].id, u.learning, u.learningStatus, u.decisionOutcome]);
    } else {
      await pool.query(
        `INSERT INTO creative_learnings (account_id, action_id, creative_key, creative_group_id, concept, angle, hook_tactic, format, creator, learning, evidence_status, outcome)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [accountId, u.id, key, meta?.creative_group_id ?? null, meta?.concept ?? null, meta?.angle ?? null, meta?.hook_tactic ?? null, meta?.format ?? null, meta?.creator ?? null, u.learning, u.learningStatus, u.decisionOutcome],
      );
    }
  }
  await bump(accountId);
}

async function creativeMetaFor(accountId: string, key: string) {
  const v = key.slice(key.indexOf(":") + 1);
  const r = await getPool().query("SELECT creative_group_id, concept, angle, hook_tactic, format, creator FROM creative_library WHERE account_id=$1 AND creative_variant_id=$2", [accountId, v]);
  return r.rows[0] as Record<string, string | null> | undefined;
}

export async function deleteActionAction(accountId: string, form: FormData) {
  await mustExist(accountId);
  await getPool().query("DELETE FROM creative_actions WHERE account_id=$1 AND id=$2", [accountId, z.coerce.number().int().parse(form.get("id"))]);
  revalidatePath(`/a/${accountId}/actions`);
}

const LearningInput = z.object({
  learning: z.string().trim().min(1).max(2000),
  evidenceStatus: z.enum(["FACT", "HYPOTHESIS", "VALIDATED_FINDING"]),
  creativeKey: optStr,
  concept: optStr,
  angle: optStr,
  hookTactic: optStr,
  format: optStr,
  creator: optStr,
});

export async function createLearningAction(accountId: string, form: FormData) {
  await mustExist(accountId);
  const l = LearningInput.parse(Object.fromEntries(["learning", "evidenceStatus", "creativeKey", "concept", "angle", "hookTactic", "format", "creator"].map((k) => [k, str(form, k) ?? ""])));
  const meta = l.creativeKey ? await creativeMetaFor(accountId, l.creativeKey) : null;
  await getPool().query(
    `INSERT INTO creative_learnings (account_id, creative_key, creative_group_id, concept, angle, hook_tactic, format, creator, learning, evidence_status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [accountId, l.creativeKey, meta?.creative_group_id ?? null, l.concept ?? meta?.concept ?? null, l.angle ?? meta?.angle ?? null, l.hookTactic ?? meta?.hook_tactic ?? null, l.format ?? meta?.format ?? null, l.creator ?? meta?.creator ?? null, l.learning, l.evidenceStatus],
  );
  await bump(accountId);
}

export async function updateLearningStatusAction(accountId: string, form: FormData) {
  await mustExist(accountId);
  const lid = z.coerce.number().int().parse(form.get("id"));
  const st = z.enum(["FACT", "HYPOTHESIS", "VALIDATED_FINDING", "DELETE"]).parse(form.get("evidenceStatus"));
  if (st === "DELETE") await getPool().query("DELETE FROM creative_learnings WHERE account_id=$1 AND id=$2", [accountId, lid]);
  else await getPool().query("UPDATE creative_learnings SET evidence_status=$3 WHERE account_id=$1 AND id=$2", [accountId, lid, st]);
  await bump(accountId);
}

// ---------------------------------------------------------------- experiments
export async function createExperimentAction(accountId: string, form: FormData) {
  await mustExist(accountId);
  const e = z
    .object({ code: z.string().trim().min(1).max(40), hypothesis: optStr, controlCreativeKey: optStr, testCreativeKeys: z.string().max(4000) })
    .parse({ code: str(form, "code") ?? "", hypothesis: str(form, "hypothesis") ?? "", controlCreativeKey: str(form, "controlCreativeKey") ?? "", testCreativeKeys: str(form, "testCreativeKeys") ?? "" });
  await getPool().query(
    "INSERT INTO creative_experiments (account_id, code, hypothesis, control_creative_key, test_creative_keys, start_date) VALUES ($1,$2,$3,$4,$5,current_date) ON CONFLICT (account_id, code) DO UPDATE SET hypothesis=EXCLUDED.hypothesis, control_creative_key=EXCLUDED.control_creative_key, test_creative_keys=EXCLUDED.test_creative_keys",
    [accountId, e.code, e.hypothesis, e.controlCreativeKey, e.testCreativeKeys.split(/[\s,]+/).filter(Boolean)],
  );
  revalidatePath(`/a/${accountId}/actions`);
}

// ---------------------------------------------------------------- windsor (server-only key)
const MappingInput = z.object({
  connector: z.enum(["facebook", "tiktok", "snapchat"]),
  externalAccountId: z.string().trim().min(1).max(128),
  label: optStr,
  fieldMap: z.string().max(20_000),
});

export async function saveMappingAction(accountId: string, form: FormData) {
  await mustExist(accountId);
  const { DEFAULT_FIELD_MAPS } = await import("@/windsor/client");
  const m = MappingInput.parse({ connector: str(form, "connector") ?? "", externalAccountId: str(form, "externalAccountId") ?? "", label: str(form, "label") ?? "", fieldMap: str(form, "fieldMap") ?? "" });
  let fieldMap: Record<string, string> | null = null;
  if (m.fieldMap.trim()) {
    const parsed = z.record(z.string(), z.string()).safeParse(JSON.parse(m.fieldMap));
    if (!parsed.success) throw new Error("Field map must be a JSON object of template column → Windsor field.");
    fieldMap = parsed.data;
  }
  await getPool().query(
    `INSERT INTO source_account_mappings (account_id, platform, connector, external_account_id, label, field_map) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (account_id, connector, external_account_id) DO UPDATE SET label=EXCLUDED.label, field_map=EXCLUDED.field_map, enabled=true`,
    [accountId, DEFAULT_FIELD_MAPS[m.connector].platform, m.connector, m.externalAccountId, m.label, fieldMap ? JSON.stringify(fieldMap) : null],
  );
  revalidatePath(`/a/${accountId}/windsor`);
}

export async function toggleMappingAction(accountId: string, form: FormData) {
  await mustExist(accountId);
  const mid = z.coerce.number().int().parse(form.get("id"));
  if (form.get("op") === "delete") await getPool().query("DELETE FROM source_account_mappings WHERE account_id=$1 AND id=$2", [accountId, mid]);
  else await getPool().query("UPDATE source_account_mappings SET enabled = NOT enabled WHERE account_id=$1 AND id=$2", [accountId, mid]);
  revalidatePath(`/a/${accountId}/windsor`);
}

export async function startBackfillAction(accountId: string, form: FormData) {
  await mustExist(accountId);
  const d = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
  const from = d.parse(form.get("from"));
  const to = d.parse(form.get("to"));
  const chunk = z.coerce.number().int().min(1).max(31).parse(form.get("chunkDays") || 14);
  const { startBackfill } = await import("@/windsor/sync");
  await startBackfill(accountId, from, to, chunk);
  revalidatePath(`/a/${accountId}/windsor`);
}

export async function stepBackfillAction(accountId: string) {
  await mustExist(accountId);
  const { stepBackfill } = await import("@/windsor/sync");
  await stepBackfill(accountId);
  revalidatePath(`/a/${accountId}`, "layout");
}

export async function refreshWindsorAction(accountId: string) {
  await mustExist(accountId);
  const { refreshRecent } = await import("@/windsor/sync");
  await refreshRecent(accountId, 3);
  revalidatePath(`/a/${accountId}`, "layout");
}
