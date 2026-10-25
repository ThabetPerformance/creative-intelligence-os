import Link from "next/link";
import { loadPage, NoData, creativeHref, type PageProps } from "@/components/page-kit";
import { Card, PageHeader, ClassBadge, fmtX, fmtMoney } from "@/components/ui";
import { CompareChart } from "@/components/charts";
import { TIMELINE_METRICS } from "@/lib/timeline-metrics";
import { creativeTimeline, TIMELINE_RANGES, type TimelineRange } from "@/server/timeline";
import type { TlPoint } from "@/components/charts";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function TimelinePage(props: PageProps) {
  const { accountId, sp, a, r } = await loadPage(props);
  if (!r) return <NoData accountId={accountId} />;
  const cur = a.account.currency;
  const metric = TIMELINE_METRICS.includes(one(sp.metric)) ? one(sp.metric) : "roas7";
  const axis = one(sp.axis) === "calendar" ? "calendar" : "launch";
  const tl = (TIMELINE_RANGES.find((x) => x.key === one(sp.tl))?.key ?? (axis === "launch" ? "launch60" : "last90")) as TimelineRange;
  const ranked = r.creatives.filter((c) => c.lifetime.spend > 0).sort((x, y) => y.commercialScore - x.commercialScore);
  const keys = (one(sp.keys) ? one(sp.keys).split(",") : ranked.slice(0, 4).map((c) => c.key)).slice(0, 6);
  const chosen = keys.map((k) => r.creatives.find((c) => c.key === k)).filter((c): c is NonNullable<typeof c> => !!c);
  const series = await Promise.all(
    chosen.map(async (c) => {
      const t = await creativeTimeline(accountId, a.account.dataVersion, cur, r, c, tl);
      return { key: c.key, name: c.meta.creativeName, href: creativeHref(accountId, c.key, sp), points: (t?.points ?? []) as unknown as TlPoint[] };
    }),
  );
  const keep = ["range", "from", "to", "asOf", "cmp"].filter((k) => one(sp[k]));
  return (
    <div className="space-y-4">
      <PageHeader title="Creative Timeline" question="How do creatives evolve, and how do new launches compare with past winners at the same age?" />
      <Card>
        <form method="GET" className="flex flex-wrap items-end gap-3">
          {keep.map((k) => (
            <input key={k} type="hidden" name={k} value={one(sp[k])} />
          ))}
          <label className="flex flex-col gap-0.5">
            <span className="label">Metric</span>
            <select name="metric" defaultValue={metric} className="input">
              {TIMELINE_METRICS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="label">X-axis</span>
            <select name="axis" defaultValue={axis} className="input">
              <option value="launch">Days since launch (aligned)</option>
              <option value="calendar">Calendar date</option>
            </select>
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="label">Range</span>
            <select name="tl" defaultValue={tl} className="input">
              {TIMELINE_RANGES.map((x) => (
                <option key={x.key} value={x.key}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-[320px] flex-1 flex-col gap-0.5">
            <span className="label">Creatives (up to 6, by key, comma separated)</span>
            <input name="keys" defaultValue={keys.join(",")} className="input font-mono text-xs" />
          </label>
          <button className="btn-primary">Compare</button>
        </form>
      </Card>
      <Card question={`${metric} by ${axis === "launch" ? "days since launch" : "calendar date"}`} title="Days without delivery appear as gaps (ratios unavailable, not zero).">
        {series.length ? <CompareChart series={series} metric={metric} currency={cur} axis={axis} /> : <p className="sub">Pick at least one creative.</p>}
      </Card>
      <Card question="Add creatives to the comparison" title="Top creatives by commercial value (lifetime spend > 0)">
        <div className="max-h-96 overflow-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Creative</th>
                <th className="th">Class</th>
                <th className="th">Launched</th>
                <th className="th text-right">Lifetime spend</th>
                <th className="th text-right">Lifetime ROAS</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody>
              {ranked.slice(0, 60).map((c) => {
                const on = keys.includes(c.key);
                const next = on ? keys.filter((k) => k !== c.key) : [...keys, c.key].slice(-6);
                const q = new URLSearchParams();
                for (const k of [...keep, "metric", "axis", "tl"]) if (one(sp[k])) q.set(k, one(sp[k]));
                q.set("keys", next.join(","));
                return (
                  <tr key={c.key}>
                    <td className="td">
                      <Link className="hover:underline" href={creativeHref(accountId, c.key, sp)}>
                        {c.meta.creativeName}
                      </Link>
                    </td>
                    <td className="td">
                      <ClassBadge c={c.classification} />
                    </td>
                    <td className="td text-xs">{c.launchDate}</td>
                    <td className="td num text-right">{fmtMoney(c.lifetime.spend, cur)}</td>
                    <td className="td num text-right">{fmtX(c.lifetime.roas)}</td>
                    <td className="td text-right">
                      <Link className="btn py-0.5 text-xs" href={`?${q.toString()}`}>
                        {on ? "Remove" : "Add"}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
