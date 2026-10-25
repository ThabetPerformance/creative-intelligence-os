import "server-only";
import { buildTimeline, type Timeline } from "@/engine/timeline";
import { CreativeSeries } from "@/engine/series";
import { addDays } from "@/engine/dates";
import type { CreativeAnalysis } from "@/engine/model";
import type { AnalysisResult } from "@/engine/analyze";
import { getAccount, toEngineSettings, toRegimes } from "./accounts";
import { getCreativeSeries } from "./analysis";
import { loadEvents } from "./load";
import { memo } from "./cache";

export type TimelineRange = "lifetime" | "launch30" | "launch60" | "last90" | "last30" | "window";
export const TIMELINE_RANGES: { key: TimelineRange; label: string }[] = [
  { key: "lifetime", label: "Lifetime" },
  { key: "launch30", label: "First 30 days" },
  { key: "launch60", label: "First 60 days" },
  { key: "last90", label: "Last 90 days" },
  { key: "last30", label: "Last 30 days" },
  { key: "window", label: "Selected period" },
];

/** Day-by-day timeline for one creative, computed from the stored daily facts (spec §58–67). */
export async function creativeTimeline(accountId: string, version: number, currency: string, r: AnalysisResult, c: CreativeAnalysis, range: TimelineRange): Promise<Timeline | null> {
  const input = await getCreativeSeries(accountId, version, currency, c.key);
  if (!input || !input.rows.length) return null;
  const acc = await getAccount(accountId);
  if (!acc) return null;
  const events = await memo(`${accountId}|events|${version}`, () => loadEvents(accountId));
  const s = new CreativeSeries(input.rows);
  const launch = c.launchDate ?? s.firstDate!;
  const asOf = r.ctx.asOf;
  const lifeFrom = launch < s.firstDate! ? launch : s.firstDate!;
  const win =
    range === "launch30"
      ? { from: launch, to: minDate(addDays(launch, 29), asOf) }
      : range === "launch60"
        ? { from: launch, to: minDate(addDays(launch, 59), asOf) }
        : range === "last90"
          ? { from: maxDate(lifeFrom, addDays(asOf, -89)), to: asOf }
          : range === "last30"
            ? { from: maxDate(lifeFrom, addDays(asOf, -29)), to: asOf }
            : range === "window"
              ? r.ctx.window
              : { from: lifeFrom, to: asOf };
  if (win.from > win.to) return null;
  const evs = events.filter((e) => e.creativeKey === c.key || (!e.creativeKey && !e.creativeVariantId));
  return buildTimeline(s, win, launch, r.ctx.definitions, toEngineSettings(acc.account, acc.settings), toRegimes(acc.targets), c.milestones, c.peaks, evs);
}

const minDate = (a: string, b: string) => (a < b ? a : b);
const maxDate = (a: string, b: string) => (a > b ? a : b);
