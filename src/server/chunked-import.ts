import "server-only";
import { z } from "zod";
import { getPool } from "@/lib/db/client";
import { SHEETS } from "@/ingestion/template";
import { validateConfig, validateDaily, validateEvents, validateLibrary, validateTags, validateTargets, type Issue, type RawRow } from "@/ingestion/validate";
import { appendRunProgress, applyConfig, finishRun, insertEvents, replaceTargets, startRun, upsertDaily, upsertLibrary } from "./import";
import { getAccount } from "./accounts";

/**
 * Chunked File Mode import (spec §88–93). The browser parses the workbook and posts the small
 * sheets once, then the daily rows in chunks that stay well under Vercel's request body limit.
 * The server re-validates everything: the browser preview is a convenience, never trusted.
 */

export const MAX_CHUNK_ROWS = 4000;

const Row = z.record(z.string(), z.unknown());
const Rows = z.array(Row).max(20_000);

export const StartBody = z.object({
  fileName: z.string().max(260).nullable(),
  applyConfig: z.boolean().default(false),
  replaceTargets: z.boolean().default(true),
  sheets: z
    .object({
      config: Rows.optional(),
      targets: Rows.optional(),
      library: Rows.optional(),
      tags: Rows.optional(),
      events: Rows.optional(),
    })
    .default({}),
  dailyRowsExpected: z.number().int().min(0),
});

export const ChunkBody = z.object({
  runId: z.number().int().positive(),
  index: z.number().int().min(0),
  rows: z.array(Row).max(MAX_CHUNK_ROWS),
});

export const FinishBody = z.object({ runId: z.number().int().positive(), aborted: z.boolean().optional() });

async function runFor(accountId: string, runId: number) {
  const r = await getPool().query("SELECT id, status, summary FROM ingestion_runs WHERE id=$1 AND account_id=$2", [runId, accountId]);
  return r.rows[0] as { id: number; status: string; summary: Record<string, unknown> } | undefined;
}

const countBy = (issues: Issue[]) => ({
  errors: issues.filter((i) => i.severity === "error").length,
  warnings: issues.filter((i) => i.severity === "warning").length,
});

export async function startImport(accountId: string, body: z.infer<typeof StartBody>) {
  const acc = await getAccount(accountId);
  if (!acc) throw new HttpError(404, "Account not found");
  let currency = acc.account.currency;
  const runId = await startRun(accountId, "FILE", body.fileName);
  const issues: Issue[] = [];
  const s = body.sheets;
  const asRows = (list?: Record<string, unknown>[]) => (list ?? []) as RawRow[];
  try {
    if (body.applyConfig && s.config?.length) {
      const c = validateConfig(asRows(s.config));
      issues.push(...c.issues);
      await applyConfig(accountId, c.config);
      if (c.config.currency) currency = c.config.currency;
    }
    let targets = 0;
    if (body.replaceTargets && s.targets?.length) {
      const t = validateTargets(asRows(s.targets));
      issues.push(...t.issues);
      targets = await replaceTargets(accountId, t.rows);
    }
    const lib = validateLibrary(asRows(s.library));
    const tags = validateTags(asRows(s.tags));
    issues.push(...lib.issues, ...tags.issues);
    const libraryRows = await upsertLibrary(accountId, lib.rows, tags.rows);
    const ev = validateEvents(asRows(s.events));
    issues.push(...ev.issues);
    const events = await insertEvents(accountId, ev.rows);
    await appendRunProgress(runId, {
      total: 0,
      imported: 0,
      rejected: 0,
      warnings: issues.filter((i) => i.severity !== "error"),
      errors: issues.filter((i) => i.severity === "error"),
      dateFrom: null,
      dateTo: null,
    });
    await getPool().query("UPDATE ingestion_runs SET summary = summary || $2::jsonb WHERE id=$1", [
      runId,
      JSON.stringify({ currency, libraryRows, targets, events, dailyRowsExpected: body.dailyRowsExpected, chunks: 0, duplicates: 0 }),
    ]);
    return { runId, currency, libraryRows, targets, events, ...countBy(issues), issues: issues.slice(0, 100) };
  } catch (e) {
    await finishRun(accountId, runId, "FILE", { error: String(e) }, true);
    throw e;
  }
}

export async function importChunk(accountId: string, body: z.infer<typeof ChunkBody>) {
  const run = await runFor(accountId, body.runId);
  if (!run) throw new HttpError(404, "Import run not found");
  if (run.status !== "RUNNING") throw new HttpError(409, `Import run is ${run.status}`);
  const currency = String(run.summary.currency ?? "USD");
  const v = validateDaily(body.rows as RawRow[], currency, { maxIssues: 200 });
  const imported = await upsertDaily(accountId, v.rows, body.runId, "FILE");
  await appendRunProgress(body.runId, {
    total: body.rows.length,
    imported,
    rejected: v.rejected,
    warnings: v.issues.filter((i) => i.severity !== "error"),
    errors: v.issues.filter((i) => i.severity === "error"),
    dateFrom: v.dateFrom,
    dateTo: v.dateTo,
  });
  const sumKeys = Object.entries(v.summary);
  await getPool().query(
    `UPDATE ingestion_runs SET summary = summary || jsonb_build_object(
        'chunks', COALESCE((summary->>'chunks')::int, 0) + 1,
        'duplicates', COALESCE((summary->>'duplicates')::int, 0) + $2::int
        ${sumKeys.map(([k], i) => `, '${k}', COALESCE((summary->>'${k}')::int, 0) + $${i + 3}::int`).join("")})
     WHERE id=$1`,
    [body.runId, v.duplicates, ...sumKeys.map(([, n]) => n)],
  );
  return { index: body.index, received: body.rows.length, imported, rejected: v.rejected, duplicates: v.duplicates, ...countBy(v.issues), issues: v.issues.slice(0, 50) };
}

export async function finishImport(accountId: string, body: z.infer<typeof FinishBody>) {
  const run = await runFor(accountId, body.runId);
  if (!run) throw new HttpError(404, "Import run not found");
  if (run.status !== "RUNNING") return { runId: body.runId, status: run.status };
  const status = await finishRun(accountId, body.runId, "FILE", body.aborted ? { aborted: true } : {}, !!body.aborted);
  const r = await getPool().query("SELECT rows_total, rows_imported, rows_rejected, date_from::text AS df, date_to::text AS dt, summary FROM ingestion_runs WHERE id=$1", [body.runId]);
  const x = r.rows[0];
  return { runId: body.runId, status, rowsTotal: x.rows_total, rowsImported: x.rows_imported, rowsRejected: x.rows_rejected, dateFrom: x.df, dateTo: x.dt, summary: x.summary };
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Shared JSON route wrapper: zod validation, typed errors, no stack traces to the client. */
export async function jsonRoute<T>(req: Request, schema: z.ZodType<T>, fn: (body: T) => Promise<unknown>): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "Invalid request", details: parsed.error.issues.slice(0, 10) }, { status: 400 });
  try {
    return Response.json(await fn(parsed.data));
  } catch (e) {
    if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
    console.error("[import] failed:", e instanceof Error ? e.message : "unknown error");
    return Response.json({ error: "Import step failed on the server. Check the import history for details." }, { status: 500 });
  }
}

export { SHEETS };
