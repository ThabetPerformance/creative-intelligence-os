import "server-only";
import { getPool } from "@/lib/db/client";
import { addDays } from "@/engine/dates";
import { validateDaily, type RawRow } from "@/ingestion/validate";
import { appendRunProgress, finishRun, startRun, upsertDaily } from "@/server/import";
import { getAccount } from "@/server/accounts";
import { DEFAULT_FIELD_MAPS, fetchWindsor, toTemplateRows, windsorConfigured } from "./client";

/**
 * Windsor ingestion (spec §99–102): chunked, resumable backfill plus a rolling refresh. Each chunk
 * is its own ingestion run, so a failed chunk can be retried without redoing finished ones. Never
 * called during page render — only from explicit user actions or the cron route.
 */

export interface BackfillState {
  from: string;
  to: string;
  chunkDays: number;
  next: string | null;
  startedAt: string;
  failures: number;
}

async function connection(accountId: string) {
  const r = await getPool().query("SELECT id, status, config FROM source_connections WHERE account_id=$1 AND source='WINDSOR'", [accountId]);
  return r.rows[0] as { id: number; status: string; config: { backfill?: BackfillState; refreshDays?: number } } | undefined;
}

async function saveConfig(accountId: string, config: Record<string, unknown>, status?: string) {
  await getPool().query(
    `INSERT INTO source_connections (account_id, source, status, config) VALUES ($1,'WINDSOR',$3,$2)
     ON CONFLICT (account_id, source) DO UPDATE SET config = $2, status = COALESCE($3, source_connections.status)`,
    [accountId, JSON.stringify(config), status ?? "CONFIGURED"],
  );
}

export async function mappings(accountId: string) {
  const r = await getPool().query("SELECT * FROM source_account_mappings WHERE account_id=$1 ORDER BY id", [accountId]);
  return r.rows as { id: number; platform: string; connector: string; external_account_id: string; label: string | null; enabled: boolean; field_map: Record<string, string> | null; discovered_fields: string[] | null }[];
}

export async function startBackfill(accountId: string, from: string, to: string, chunkDays = 14) {
  const conn = await connection(accountId);
  const state: BackfillState = { from, to, chunkDays: Math.max(1, Math.min(31, chunkDays)), next: from, startedAt: new Date().toISOString(), failures: 0 };
  await saveConfig(accountId, { ...(conn?.config ?? {}), backfill: state }, "BACKFILLING");
  return state;
}

/** Fetch and store one date range for every enabled mapping. Returns rows imported. */
async function syncRange(accountId: string, currency: string, from: string, to: string, kind: string) {
  const maps = (await mappings(accountId)).filter((m) => m.enabled);
  if (!maps.length) throw new Error("No enabled Windsor account mappings. Add one on the Windsor page.");
  let total = 0;
  let failed = 0;
  for (const m of maps) {
    const fieldMap = m.field_map ?? DEFAULT_FIELD_MAPS[m.connector]?.map;
    if (!fieldMap) throw new Error(`No field map for connector ${m.connector}.`);
    const runId = await startRun(accountId, "WINDSOR", `${m.connector}:${m.external_account_id}`, kind, { start: from, end: to });
    try {
      const raw = await fetchWindsor({ connector: m.connector, accountId: m.external_account_id, fields: [...new Set(Object.values(fieldMap))], dateFrom: from, dateTo: to });
      const rows = toTemplateRows(raw, m.platform, fieldMap) as RawRow[];
      const v = validateDaily(rows, currency, { maxIssues: 200 });
      const imported = await upsertDaily(accountId, v.rows, runId, "WINDSOR");
      await appendRunProgress(runId, { total: rows.length, imported, rejected: v.rejected, warnings: v.issues.filter((i) => i.severity !== "error"), errors: v.issues.filter((i) => i.severity === "error"), dateFrom: v.dateFrom, dateTo: v.dateTo });
      await finishRun(accountId, runId, "WINDSOR", { connector: m.connector, ...v.summary });
      total += imported;
    } catch (e) {
      failed++;
      await finishRun(accountId, runId, "WINDSOR", { error: e instanceof Error ? e.message : "failed" }, true);
    }
  }
  return { imported: total, failed };
}

/** Advance the backfill by as many chunks as fit in the time budget. Safe to call repeatedly. */
export async function stepBackfill(accountId: string, budgetMs = 40_000) {
  if (!windsorConfigured()) throw new Error("WINDSOR_API_KEY is not configured on the server.");
  const acc = await getAccount(accountId);
  if (!acc) throw new Error("Account not found");
  const conn = await connection(accountId);
  const st = conn?.config.backfill;
  if (!st || !st.next) return { done: true, chunks: 0, imported: 0, next: null as string | null };
  const t0 = Date.now();
  let chunks = 0;
  let imported = 0;
  while (st.next && Date.now() - t0 < budgetMs) {
    const start: string = st.next;
    const chunkEnd = addDays(start, st.chunkDays - 1);
    const end: string = chunkEnd < st.to ? chunkEnd : st.to;
    const r = await syncRange(accountId, acc.account.currency, start, end, "BACKFILL_CHUNK");
    chunks++;
    imported += r.imported;
    if (r.failed) {
      st.failures++;
      break; // keep `next` so the same chunk is retried on the next step
    }
    st.next = end >= st.to ? null : addDays(end, 1);
  }
  await saveConfig(accountId, { ...conn!.config, backfill: st }, st.next ? "BACKFILLING" : "CONNECTED");
  await getPool().query("UPDATE source_connections SET last_synced_at = now() WHERE account_id=$1 AND source='WINDSOR'", [accountId]);
  return { done: !st.next, chunks, imported, next: st.next, failures: st.failures };
}

/** Rolling refresh of the last N days (platforms restate recent conversions). */
export async function refreshRecent(accountId: string, days = 3) {
  if (!windsorConfigured()) throw new Error("WINDSOR_API_KEY is not configured on the server.");
  const acc = await getAccount(accountId);
  if (!acc) throw new Error("Account not found");
  const to = new Date().toISOString().slice(0, 10);
  const from = addDays(to, -(days - 1));
  const r = await syncRange(accountId, acc.account.currency, from, to, "REFRESH");
  await getPool().query("UPDATE source_connections SET last_synced_at = now() WHERE account_id=$1 AND source='WINDSOR'", [accountId]);
  return { from, to, ...r };
}

export async function backfillState(accountId: string) {
  return (await connection(accountId))?.config.backfill ?? null;
}

/** Accounts with Windsor mappings, for the cron route. */
export async function windsorAccounts(): Promise<string[]> {
  const r = await getPool().query("SELECT DISTINCT account_id FROM source_account_mappings WHERE enabled");
  return r.rows.map((x) => x.account_id as string);
}
