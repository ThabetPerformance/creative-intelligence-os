import { addDays, isIsoDate, type DateWindow } from "@/engine/dates";
import type { ComparisonKind } from "@/engine/analyze";

/** Global analysis period (spec §55–56). Lives in the URL so links are shareable. */

export const RANGE_PRESETS = [
  { key: "7d", label: "Last 7 Days", days: 7 },
  { key: "10d", label: "Last 10 Days", days: 10 },
  { key: "14d", label: "Last 14 Days", days: 14 },
  { key: "30d", label: "Last 30 Days", days: 30 },
  { key: "60d", label: "Last 60 Days", days: 60 },
  { key: "90d", label: "Last 90 Days", days: 90 },
  { key: "180d", label: "Last 180 Days", days: 180 },
  { key: "6m", label: "Last 6 Months", days: 0 },
  { key: "lifetime", label: "Lifetime", days: 0 },
  { key: "custom", label: "Custom", days: 0 },
] as const;
export type RangeKey = (typeof RANGE_PRESETS)[number]["key"];

export const COMPARISONS: { key: ComparisonKind; label: string }[] = [
  { key: "prev", label: "Previous Equal Period" },
  { key: "prev7", label: "Previous 7D" },
  { key: "prev14", label: "Previous 14D" },
  { key: "prev30", label: "Previous 30D" },
  { key: "prevMonth", label: "Previous Month Same Days" },
  { key: "prevYear", label: "Same Period Prior Year" },
  { key: "best", label: "Best Historical Period" },
  { key: "cohort", label: "Launch Cohort Baseline" },
  { key: "custom", label: "Custom Comparison" },
  { key: "none", label: "No Comparison" },
];

export interface PeriodParams {
  range: RangeKey;
  from?: string;
  to?: string;
  asOf?: string;
  cmp: ComparisonKind;
  cfrom?: string;
  cto?: string;
}

export type SearchParams = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parsePeriod(sp: SearchParams, defaults: { range?: string; cmp?: string } = {}): PeriodParams {
  const r = one(sp.range) ?? defaults.range ?? "30d";
  const range = (RANGE_PRESETS.some((p) => p.key === r) ? r : "30d") as RangeKey;
  const c = one(sp.cmp) ?? defaults.cmp ?? "prev";
  const cmp = (COMPARISONS.some((p) => p.key === c) ? c : "prev") as ComparisonKind;
  const d = (k: string) => {
    const v = one(sp[k]);
    return v && isIsoDate(v) ? v : undefined;
  };
  return { range, from: d("from"), to: d("to"), asOf: d("asOf"), cmp, cfrom: d("cfrom"), cto: d("cto") };
}

export function resolveWindow(p: PeriodParams, dataStart: string | null, dataThrough: string | null): { window: DateWindow; asOf: string; custom: DateWindow | null } {
  const fallback = new Date().toISOString().slice(0, 10);
  let asOf = p.asOf ?? dataThrough ?? fallback;
  if (p.range === "custom" && p.to) asOf = p.to;
  const start = dataStart ?? addDays(asOf, -29);
  let from: string;
  switch (p.range) {
    case "lifetime":
      from = start;
      break;
    case "6m": {
      const d = new Date(asOf + "T00:00:00Z");
      d.setUTCMonth(d.getUTCMonth() - 6);
      from = addDays(d.toISOString().slice(0, 10), 1);
      break;
    }
    case "custom":
      from = p.from ?? addDays(asOf, -29);
      break;
    default: {
      const days = RANGE_PRESETS.find((x) => x.key === p.range)?.days ?? 30;
      from = addDays(asOf, -(days - 1));
    }
  }
  if (from > asOf) from = asOf;
  const custom = p.cmp === "custom" && p.cfrom && p.cto ? { from: p.cfrom, to: p.cto } : null;
  return { window: { from, to: asOf }, asOf, custom };
}

/** Serialize period params for links (keeps global date context across pages). */
export function periodQuery(p: Partial<PeriodParams>): string {
  const q = new URLSearchParams();
  if (p.range && p.range !== "30d") q.set("range", p.range);
  if (p.from && p.range === "custom") q.set("from", p.from);
  if (p.to && p.range === "custom") q.set("to", p.to);
  if (p.asOf) q.set("asOf", p.asOf);
  if (p.cmp && p.cmp !== "prev") q.set("cmp", p.cmp);
  if (p.cfrom && p.cmp === "custom") q.set("cfrom", p.cfrom);
  if (p.cto && p.cmp === "custom") q.set("cto", p.cto);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function withPeriod(href: string, sp: SearchParams): string {
  const keep = new URLSearchParams();
  for (const k of ["range", "from", "to", "asOf", "cmp", "cfrom", "cto"]) {
    const v = one(sp[k]);
    if (v) keep.set(k, v);
  }
  const s = keep.toString();
  if (!s) return href;
  return href + (href.includes("?") ? "&" : "?") + s;
}
