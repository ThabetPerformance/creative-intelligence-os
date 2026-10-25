import "server-only";
import { analyzeAccount, type AnalysisResult } from "@/engine/analyze";
import { parsePeriod, resolveWindow, type SearchParams, type PeriodParams } from "@/lib/period";
import { getAccount, toEngineSettings, toRegimes, type Account, type AccountSettings } from "./accounts";
import { dataBounds, loadCreativeInputs, loadEvents, loadLearnings } from "./load";
import { memo } from "./cache";
import type { CreativeInput } from "@/engine/types";

export interface AccountAnalysis {
  account: Account;
  settings: AccountSettings;
  period: PeriodParams;
  bounds: { start: string | null; through: string | null; rows: number };
  result: AnalysisResult | null;
  loadMs: number;
}

async function inputsFor(accountId: string, version: number, currency: string): Promise<CreativeInput[]> {
  return memo(`${accountId}|inputs|${version}`, () => loadCreativeInputs(accountId, currency));
}

/**
 * Database-only analysis for a page render (spec §100). Results are cached per data version,
 * period and comparison.
 */
export async function getAnalysis(accountId: string, sp: SearchParams): Promise<AccountAnalysis | null> {
  const t0 = Date.now();
  const acc = await getAccount(accountId);
  if (!acc) return null;
  const { account, settings, targets } = acc;
  const period = parsePeriod(sp, { range: settings.defaultAnalysisWindow, cmp: settings.defaultComparisonWindow });
  const bounds = await memo(`${accountId}|bounds|${account.dataVersion}`, () => dataBounds(accountId));
  if (!bounds.through) return { account, settings, period, bounds, result: null, loadMs: Date.now() - t0 };
  const { window, asOf, custom } = resolveWindow(period, bounds.start, bounds.through);
  const key = `${accountId}|analysis|${account.dataVersion}|${settings.updatedAt?.toISOString?.() ?? ""}|${targets.length}|${window.from}|${window.to}|${asOf}|${period.cmp}|${custom?.from ?? ""}|${custom?.to ?? ""}`;
  const result = await memo(key, async () => {
    const [inputs, events, learnings] = await Promise.all([inputsFor(accountId, account.dataVersion, account.currency), loadEvents(accountId), loadLearnings(accountId)]);
    return analyzeAccount({
      accountId,
      currency: account.currency,
      settings: toEngineSettings(account, settings),
      regimes: toRegimes(targets),
      creatives: inputs,
      events,
      learnings,
      window,
      asOf,
      comparison: period.cmp,
      customComparison: custom,
    });
  });
  return { account, settings, period, bounds, result, loadMs: Date.now() - t0 };
}

export async function getCreativeSeries(accountId: string, version: number, currency: string, key: string): Promise<CreativeInput | null> {
  const all = await inputsFor(accountId, version, currency);
  return all.find((c) => c.meta.key === key) ?? null;
}
