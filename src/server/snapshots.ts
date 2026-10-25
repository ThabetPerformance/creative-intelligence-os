import "server-only";
import { analyzeAccount } from "@/engine/analyze";
import { addDays, weekStart } from "@/engine/dates";
import { buildCohorts } from "@/engine/cohorts";
import { getPool } from "@/lib/db/client";
import { getAccount, toEngineSettings, toRegimes } from "./accounts";
import { dataBounds, loadCreativeInputs, loadEvents } from "./load";
import { invalidateAccount } from "./cache";

/**
 * Recalculate (spec §94, §104): rebuild the stored history tables from the daily facts. Status
 * snapshots are reconstructed as of each past week end using only data available up to that date
 * and the target regime active then, so history is never rewritten with hindsight.
 */
export async function recalculateAccount(accountId: string, weeks = 12): Promise<{ snapshots: number; lifecycle: number; ranks: number; cohorts: number; ms: number }> {
  const t0 = Date.now();
  const acc = await getAccount(accountId);
  if (!acc) throw new Error("Account not found");
  const bounds = await dataBounds(accountId);
  if (!bounds.through) return { snapshots: 0, lifecycle: 0, ranks: 0, cohorts: 0, ms: 0 };
  const settings = toEngineSettings(acc.account, acc.settings);
  const regimes = toRegimes(acc.targets);
  const [inputs, events] = await Promise.all([loadCreativeInputs(accountId, acc.account.currency), loadEvents(accountId)]);
  const pool = getPool();

  // week ends (Sundays) going back from data-through
  const lastWeekEnd = addDays(weekStart(bounds.through), -1);
  const asOfs = [bounds.through];
  for (let i = 0; i < weeks - 1; i++) {
    const d = addDays(lastWeekEnd, -7 * i);
    if (bounds.start && d < addDays(bounds.start, 7)) break;
    asOfs.push(d);
  }

  let snapshots = 0;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM creative_status_snapshots WHERE account_id=$1", [accountId]);
    let latest: ReturnType<typeof analyzeAccount> | null = null;
    for (const asOf of asOfs) {
      const r = analyzeAccount({
        accountId,
        currency: acc.account.currency,
        settings,
        regimes,
        creatives: inputs,
        events,
        window: { from: addDays(asOf, -29), to: asOf },
        asOf,
        comparison: "prev",
        light: asOf !== bounds.through,
      });
      if (asOf === bounds.through) latest = r;
      const rows = r.creatives.filter((c) => c.lifetime.spend > 0 && (c.launchDate ?? "") <= asOf);
      for (let i = 0; i < rows.length; i += 400) {
        const part = rows.slice(i, i + 400);
        const vals: unknown[] = [];
        const ph = part.map((c, j) => {
          const b = j * 12;
          vals.push(
            accountId,
            c.key,
            asOf,
            c.classification,
            c.decision,
            c.confidence,
            c.lifecycleStage,
            c.evidence.level,
            c.fatigue.status,
            r.ctx.target.targetRoas,
            r.ctx.target.cpoGuardrail,
            JSON.stringify({ spend: c.window.spend, purchases: c.window.purchases, roas: c.window.roas, cpo: c.window.cpo, cvr: c.window.cvr, ctr: c.window.ctr }),
          );
          return `(${Array.from({ length: 12 }, (_, k) => `$${b + k + 1}`).join(",")})`;
        });
        await client.query(
          `INSERT INTO creative_status_snapshots (account_id, creative_key, as_of_date, classification, decision, confidence, lifecycle, evidence, fatigue_status, target_roas_used, cpo_guardrail_used, metrics) VALUES ${ph.join(",")}`,
          vals,
        );
        snapshots += part.length;
      }
    }

    let lifecycle = 0;
    let ranks = 0;
    let cohorts = 0;
    if (latest) {
      await client.query("DELETE FROM creative_lifecycle_history WHERE account_id=$1", [accountId]);
      const lc = latest.creatives.flatMap((c) => c.lifecycle.map((p) => [c.key, p] as const));
      for (let i = 0; i < lc.length; i += 500) {
        const part = lc.slice(i, i + 500);
        const vals: unknown[] = [];
        const ph = part.map(([key, p], j) => {
          vals.push(accountId, key, p.stage, p.from, p.to, p.reason);
          const b = j * 6;
          return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6})`;
        });
        await client.query(`INSERT INTO creative_lifecycle_history (account_id, creative_key, stage, from_date, to_date, reason) VALUES ${ph.join(",")}`, vals);
        lifecycle += part.length;
      }

      await client.query("DELETE FROM creative_rank_history WHERE account_id=$1", [accountId]);
      // current leaderboard by commercial value (weekly ranks are also computed live in the engine)
      const ranked = [...latest.creatives].filter((c) => c.window.spend > 0).sort((a, b) => b.commercialScore - a.commercialScore).slice(0, 100);
      if (ranked.length) {
        const vals: unknown[] = [];
        const ph = ranked.map((c, j) => {
          vals.push(accountId, c.key, bounds.through, j + 1, c.commercialScore);
          const b = j * 5;
          return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5})`;
        });
        await client.query(`INSERT INTO creative_rank_history (account_id, creative_key, week_end, rank, score) VALUES ${ph.join(",")}`, vals);
        ranks = ranked.length;
      }

      await client.query("DELETE FROM creative_cohort_snapshots WHERE account_id=$1 AND as_of_date=$2", [accountId, bounds.through]);
      for (const type of ["week", "month", "batch"] as const) {
        for (const row of buildCohorts(latest.creatives, type)) {
          await client.query("INSERT INTO creative_cohort_snapshots (account_id, cohort_type, cohort_key, as_of_date, metrics) VALUES ($1,$2,$3,$4,$5)", [
            accountId,
            type,
            row.key,
            bounds.through,
            JSON.stringify({ launched: row.launched, eligible: row.eligible, winners: row.winners, winnerRate: row.winnerRate, spend: row.spend, purchases: row.purchases, roas: row.roas }),
          ]);
          cohorts++;
        }
      }
    }
    await client.query("COMMIT");
    invalidateAccount(accountId);
    return { snapshots, lifecycle, ranks, cohorts, ms: Date.now() - t0 };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/** Classification as stored on a past date (spec §104: "what did the system say then?"). */
export async function snapshotHistory(accountId: string, key: string) {
  const r = await getPool().query(
    `SELECT as_of_date::text AS d, classification, decision, confidence, lifecycle, evidence, fatigue_status, target_roas_used, metrics FROM creative_status_snapshots WHERE account_id=$1 AND creative_key=$2 ORDER BY as_of_date`,
    [accountId, key],
  );
  return r.rows as { d: string; classification: string; decision: string; confidence: string; lifecycle: string; evidence: string; fatigue_status: string; target_roas_used: number; metrics: Record<string, number | null> }[];
}
