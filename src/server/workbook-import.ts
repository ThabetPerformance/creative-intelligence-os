import "server-only";
import { SHEETS } from "@/ingestion/template";
import { validateConfig, validateDaily, validateEvents, validateLibrary, validateTags, validateTargets, type Issue, type RawRow } from "@/ingestion/validate";
import { appendRunProgress, applyConfig, finishRun, insertEvents, replaceTargets, startRun, upsertDaily, upsertLibrary } from "./import";

export interface ImportOutcome {
  runId: number;
  status: string;
  imported: number;
  rejected: number;
  duplicates: number;
  issues: Issue[];
  dateFrom: string | null;
  dateTo: string | null;
}

/** Server-side import of an already-parsed workbook (demo seeding, scripts, load tests). */
export async function importSheets(
  accountId: string,
  currency: string,
  sheets: Record<string, RawRow[]>,
  fileName: string,
  opts: { applyConfig?: boolean } = {},
): Promise<ImportOutcome> {
  const runId = await startRun(accountId, "FILE", fileName);
  const issues: Issue[] = [];
  try {
    if (opts.applyConfig && sheets[SHEETS.config]?.length) {
      const c = validateConfig(sheets[SHEETS.config]);
      issues.push(...c.issues);
      await applyConfig(accountId, c.config);
      if (c.config.currency) currency = c.config.currency;
    }
    if (sheets[SHEETS.targets]?.length) {
      const t = validateTargets(sheets[SHEETS.targets]);
      issues.push(...t.issues);
      await replaceTargets(accountId, t.rows);
    }
    const lib = validateLibrary(sheets[SHEETS.library] ?? []);
    const tags = validateTags(sheets[SHEETS.tags] ?? []);
    issues.push(...lib.issues, ...tags.issues);
    await upsertLibrary(accountId, lib.rows, tags.rows);
    const daily = validateDaily(sheets[SHEETS.daily] ?? [], currency, { maxIssues: 400 });
    issues.push(...daily.issues);
    const imported = await upsertDaily(accountId, daily.rows, runId, "FILE");
    const ev = validateEvents(sheets[SHEETS.events] ?? []);
    issues.push(...ev.issues);
    await insertEvents(accountId, ev.rows);
    await appendRunProgress(runId, {
      total: (sheets[SHEETS.daily] ?? []).length,
      imported,
      rejected: daily.rejected,
      warnings: issues.filter((i) => i.severity !== "error"),
      errors: issues.filter((i) => i.severity === "error"),
      dateFrom: daily.dateFrom,
      dateTo: daily.dateTo,
    });
    const status = await finishRun(accountId, runId, "FILE", { duplicates: daily.duplicates, ...daily.summary, libraryRows: lib.rows.length, events: ev.rows.length });
    return { runId, status, imported, rejected: daily.rejected, duplicates: daily.duplicates, issues, dateFrom: daily.dateFrom, dateTo: daily.dateTo };
  } catch (e) {
    await finishRun(accountId, runId, "FILE", { error: String(e) }, true);
    throw e;
  }
}

export function demoToSheets(d: { config: Record<string, unknown>; targets: Record<string, unknown>[]; library: Record<string, unknown>[]; daily: Record<string, unknown>[]; events: Record<string, unknown>[]; tags: Record<string, unknown>[] }): Record<string, RawRow[]> {
  const rows = (list: Record<string, unknown>[]) => list.map((r, i) => ({ ...r, __row: i + 2 }));
  return {
    [SHEETS.config]: Object.entries(d.config).map(([field, value], i) => ({ field, value, __row: i + 2 })),
    [SHEETS.targets]: rows(d.targets),
    [SHEETS.library]: rows(d.library),
    [SHEETS.daily]: rows(d.daily),
    [SHEETS.events]: rows(d.events),
    [SHEETS.tags]: rows(d.tags),
  };
}
