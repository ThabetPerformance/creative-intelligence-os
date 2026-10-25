import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateDemo } from "@/demo/generator";
import { createAccount, deleteAccount, getAccount } from "@/server/accounts";
import { demoToSheets, importSheets } from "@/server/workbook-import";
import { finishImport, importChunk, startImport } from "@/server/chunked-import";
import { recalculateAccount } from "@/server/snapshots";
import { getAnalysis } from "@/server/analysis";
import { getPool } from "@/lib/db/client";
import { SHEETS } from "@/ingestion/template";

/**
 * Integration tests against a real Postgres (DATABASE_URL). Skipped when no database is set.
 * They create throwaway accounts and delete them afterwards.
 */
const hasDb = !!process.env.DATABASE_URL;
const d = describe.skipIf(!hasDb);

d("File Mode import (Postgres)", () => {
  const demo = generateDemo();
  const sheets = demoToSheets(demo);
  const created: string[] = [];
  let id = "";
  const count = async (acc: string) => (await getPool().query("SELECT count(*)::int AS n FROM creative_ad_daily WHERE account_id=$1", [acc])).rows[0].n as number;

  beforeAll(async () => {
    id = await createAccount({ name: "it-demo", currency: "USD", timezone: "UTC", targetRoas: 2.5, cpoGuardrail: 28 });
    created.push(id);
  });
  afterAll(async () => {
    for (const a of created) await deleteAccount(a);
    await getPool().end();
  });

  it("imports the demo workbook and every row lands once", async () => {
    const out = await importSheets(id, "USD", sheets, "it-demo", { applyConfig: true });
    expect(out.status).toBe("SUCCESS");
    expect(out.rejected).toBe(0);
    expect(await count(id)).toBe(demo.daily.length);
  });

  it("re-importing the same rows is idempotent (DATE × AD unique, values updated)", async () => {
    const before = await count(id);
    const out = await importSheets(id, "USD", sheets, "it-demo-again", { applyConfig: true });
    expect(out.status).toBe("SUCCESS");
    expect(await count(id)).toBe(before);
    const events = (await getPool().query("SELECT count(*)::int AS n FROM creative_events WHERE account_id=$1", [id])).rows[0].n;
    expect(events).toBe(demo.events.length);
  });

  it("applies targets history from the workbook (date-aware targets)", async () => {
    const acc = await getAccount(id);
    expect(acc!.targets.length).toBe(demo.targets.length);
    expect(acc!.targets.map((t) => t.targetRoas)).toEqual(demo.targets.map((t) => Number(t.target_roas)));
  });

  it("analysis from the database finds every classification", async () => {
    const a = await getAnalysis(id, {});
    const classes = new Set(a!.result!.creatives.filter((c) => c.activeInWindow).map((c) => c.classification));
    for (const k of ["PROVEN_WINNER", "SCALE_CANDIDATE", "VOLUME_WINNER", "EMERGING_WINNER", "HIDDEN_WINNER", "HOOK_OPPORTUNITY", "ATTENTION_WINNER", "RECOVERABLE", "FATIGUE_WATCH", "FATIGUED_WINNER", "LOSER", "KILL_CANDIDATE", "NEW_LEARNING", "INSUFFICIENT_DATA", "TRACKING_RISK"]) {
      expect(classes, k).toContain(k);
    }
  });

  it("chunked HTTP-style import rejects bad rows with reasons and keeps good ones", async () => {
    const acc = await createAccount({ name: "it-chunks", currency: "USD", timezone: "UTC", targetRoas: 2, cpoGuardrail: null });
    created.push(acc);
    const rows = sheets[SHEETS.daily].slice(0, 500).map((r) => ({ ...r }));
    rows[3] = { ...rows[3], date: "not-a-date" };
    rows[7] = { ...rows[7], spend: -5 };
    rows[9] = { ...rows[9], ad_id: null };
    const start = await startImport(acc, { fileName: "chunks", applyConfig: false, replaceTargets: true, sheets: { library: sheets[SHEETS.library] }, dailyRowsExpected: rows.length });
    const c1 = await importChunk(acc, { runId: start.runId, index: 0, rows: rows.slice(0, 250) });
    const c2 = await importChunk(acc, { runId: start.runId, index: 1, rows: rows.slice(250) });
    expect(c1.rejected + c2.rejected).toBe(3);
    const fin = await finishImport(acc, { runId: start.runId });
    expect(fin.status).toBe("PARTIAL");
    expect(fin.rowsImported).toBe(497);
    expect(await count(acc)).toBe(497);
    const errs = (await getPool().query("SELECT errors FROM ingestion_runs WHERE id=$1", [start.runId])).rows[0].errors as { row: number }[];
    expect(errs.map((e) => e.row).sort((a, b) => a - b)).toEqual([rows[3].__row, rows[7].__row, rows[9].__row].sort((a, b) => (a as number) - (b as number)));
    // chunks after finish are refused
    await expect(importChunk(acc, { runId: start.runId, index: 2, rows: rows.slice(0, 10) })).rejects.toThrow(/SUCCESS|PARTIAL/);
  });

  it("recalculate stores point-in-time snapshots using the target active on each date", async () => {
    const r = await recalculateAccount(id, 20);
    expect(r.snapshots).toBeGreaterThan(500);
    const t = await getPool().query("SELECT DISTINCT target_roas_used AS t FROM creative_status_snapshots WHERE account_id=$1 ORDER BY 1", [id]);
    // demo has 2.2 until 2026-06-30 and 2.5 after; 20 weekly snapshots reach back past the change
    expect(t.rows.map((x) => x.t)).toEqual([2.2, 2.5]);
  });
});
