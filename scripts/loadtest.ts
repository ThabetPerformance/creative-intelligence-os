import "./env";
/**
 * 1,000-creative load test (spec §105). Exercises the real HTTP import path the browser uses
 * (parse workbook → POST start → POST chunks → POST finish), then times server analysis and page
 * renders, then re-imports the same file to prove idempotency.
 *
 * Usage: npm run fixture:1000 && npm run loadtest -- http://localhost:3000
 * Needs DATABASE_URL (to create the account and count rows) and a running app at BASE_URL.
 */
import fs from "node:fs";
import { readXlsx } from "../src/ingestion/xlsx-reader";
import { SHEETS } from "../src/ingestion/template";
import { createAccount } from "../src/server/accounts";
import { getPool } from "../src/lib/db/client";

const BASE = process.argv[2] ?? process.env.BASE_URL ?? "http://localhost:3000";
const FILE = process.argv[3] ?? "fixtures/Creative_Intelligence_LOADTEST_1000.xlsx";
const CHUNK = 2500;

async function post(path: string, body: unknown) {
  const res = await fetch(BASE + path, { method: "POST", headers: { "content-type": "application/json", cookie: process.env.LOADTEST_COOKIE ?? "" }, body: JSON.stringify(body) });
  const j = await res.json();
  if (!res.ok) throw new Error(`${path} → ${res.status} ${JSON.stringify(j)}`);
  return j;
}

async function importFile(accountId: string, sheets: Record<string, Record<string, unknown>[]>, label: string) {
  const t0 = Date.now();
  const daily = sheets[SHEETS.daily];
  const start = await post(`/api/accounts/${accountId}/import/start`, {
    fileName: label,
    applyConfig: true,
    replaceTargets: true,
    dailyRowsExpected: daily.length,
    sheets: { config: sheets[SHEETS.config] ?? [], targets: sheets[SHEETS.targets] ?? [], library: sheets[SHEETS.library] ?? [], tags: sheets[SHEETS.tags] ?? [], events: sheets[SHEETS.events] ?? [] },
  });
  let maxBody = 0;
  for (let i = 0; i < daily.length; i += CHUNK) {
    const body = { runId: start.runId, index: i / CHUNK, rows: daily.slice(i, i + CHUNK) };
    maxBody = Math.max(maxBody, JSON.stringify(body).length);
    await post(`/api/accounts/${accountId}/import/chunk`, body);
  }
  const fin = await post(`/api/accounts/${accountId}/import/finish`, { runId: start.runId });
  return { ms: Date.now() - t0, chunks: Math.ceil(daily.length / CHUNK), maxChunkBodyMB: +(maxBody / 1024 / 1024).toFixed(2), ...fin };
}

async function timePage(path: string) {
  const t0 = Date.now();
  const res = await fetch(BASE + path, { headers: { cookie: process.env.LOADTEST_COOKIE ?? "" } });
  await res.text();
  return { path, status: res.status, ms: Date.now() - t0 };
}

async function main() {
  const report: Record<string, unknown> = { base: BASE, file: FILE };
  let t = Date.now();
  const sheets = readXlsx(new Uint8Array(fs.readFileSync(FILE)));
  report.parse = { ms: Date.now() - t, dailyRows: sheets[SHEETS.daily].length, libraryRows: sheets[SHEETS.library]?.length, heapMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) };
  const accountId = await createAccount({ name: `Load test ${new Date().toISOString().slice(0, 16)}`, currency: "USD", timezone: "UTC", targetRoas: 2.5, cpoGuardrail: 28, platforms: ["meta", "tiktok", "snapchat"] });
  report.accountId = accountId;
  report.import1 = await importFile(accountId, sheets, "LOADTEST_1000 (first import)");
  const pool = getPool();
  const count1 = (await pool.query("SELECT count(*)::int AS n FROM creative_ad_daily WHERE account_id=$1", [accountId])).rows[0].n;

  // cold analysis (first page render computes; later renders hit the cache)
  const pages = ["command-center", "leaderboard", "leaderboard?page=10", "leaderboard?view=cut&sort=spend", "fatigue", "cohorts", "concepts", "hooks", "creators", "planner", "data-quality"];
  report.pagesCold = [await timePage(`/a/${accountId}/command-center`)];
  const warm = [];
  for (const p of pages) warm.push(await timePage(`/a/${accountId}/${p}`));
  report.pagesWarm = warm;
  const key = (await pool.query("SELECT platform || ':' || creative_variant_id AS k FROM creative_ad_daily WHERE account_id=$1 GROUP BY 1 ORDER BY sum(spend) DESC LIMIT 1", [accountId])).rows[0].k;
  report.creativeDetail = await timePage(`/a/${accountId}/creative/${encodeURIComponent(key)}`);
  report.periodChange = await timePage(`/a/${accountId}/command-center?range=90d&cmp=prevYear`);

  t = Date.now();
  report.import2 = await importFile(accountId, sheets, "LOADTEST_1000 (re-import, idempotency check)");
  const count2 = (await pool.query("SELECT count(*)::int AS n FROM creative_ad_daily WHERE account_id=$1", [accountId])).rows[0].n;
  report.idempotent = { rowsAfterFirst: count1, rowsAfterSecond: count2, pass: count1 === count2 && count1 === sheets[SHEETS.daily].length };
  console.log(JSON.stringify(report, null, 2));
  fs.mkdirSync("fixtures", { recursive: true });
  fs.writeFileSync("fixtures/loadtest-report.json", JSON.stringify(report, null, 2));
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
