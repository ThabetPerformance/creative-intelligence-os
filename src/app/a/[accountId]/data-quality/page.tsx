import Link from "next/link";
import { notFound } from "next/navigation";
import { getPool } from "@/lib/db/client";
import { getAnalysis } from "@/server/analysis";
import { Card, Kpi, PageHeader, Pill, fmtMoney, type Tone } from "@/components/ui";
import { creativeHref, type PageProps } from "@/components/page-kit";

export default async function DataQualityPage({ params, searchParams }: PageProps) {
  const { accountId } = await params;
  const sp = await searchParams;
  const a = await getAnalysis(accountId, sp);
  if (!a) notFound();
  const pool = getPool();
  const cur = a.account.currency;
  const [checks, coverage, names, lib, runs] = await Promise.all([
    pool.query(
      `SELECT count(*)::int AS rows,
          count(*) FILTER (WHERE purchases > 0 AND (purchase_value IS NULL OR purchase_value = 0))::int AS value_missing,
          count(*) FILTER (WHERE purchases IS NULL)::int AS purchases_missing,
          count(*) FILTER (WHERE currency IS NOT NULL AND upper(currency) <> $2)::int AS currency_mismatch,
          count(*) FILTER (WHERE clicks > impressions)::int AS clicks_gt_impr,
          count(*) FILTER (WHERE purchases > clicks AND clicks > 0)::int AS purch_gt_clicks,
          count(*) FILTER (WHERE impressions IS NULL)::int AS impr_missing,
          count(*) FILTER (WHERE landing_page_views IS NULL)::int AS lpv_missing,
          count(*) FILTER (WHERE video_3s IS NULL AND hook_rate IS NULL)::int AS video_missing,
          count(*) FILTER (WHERE spend = 0 AND impressions > 0)::int AS zero_spend_delivery,
          count(DISTINCT platform || ':' || ad_id)::int AS ads,
          count(DISTINCT platform || ':' || creative_variant_id)::int AS creatives,
          count(*) FILTER (WHERE creative_variant_id = ad_id)::int AS variant_from_ad
       FROM creative_ad_daily WHERE account_id=$1`,
      [accountId, cur],
    ),
    pool.query(
      `WITH d AS (SELECT platform, date FROM creative_ad_daily WHERE account_id=$1 GROUP BY platform, date),
            b AS (SELECT platform, min(date) AS f, max(date) AS l, count(*)::int AS n FROM d GROUP BY platform)
       SELECT platform, f::text AS f, l::text AS l, n, (l - f + 1 - n)::int AS missing FROM b ORDER BY platform`,
      [accountId],
    ),
    pool.query(
      `SELECT creative_name, count(DISTINCT platform || ':' || creative_variant_id)::int AS n FROM creative_ad_daily WHERE account_id=$1 AND creative_name IS NOT NULL GROUP BY creative_name HAVING count(DISTINCT platform || ':' || creative_variant_id) > 1 ORDER BY n DESC LIMIT 20`,
      [accountId],
    ),
    pool.query(
      `SELECT count(DISTINCT d.creative_variant_id) FILTER (WHERE l.creative_variant_id IS NULL)::int AS not_in_library,
              (SELECT count(*)::int FROM creative_library x WHERE x.account_id=$1 AND NOT EXISTS (SELECT 1 FROM creative_ad_daily y WHERE y.account_id=$1 AND y.creative_variant_id=x.creative_variant_id)) AS library_without_data,
              (SELECT count(*)::int FROM creative_library x WHERE x.account_id=$1 AND x.concept IS NULL) AS untagged_concept
       FROM creative_ad_daily d LEFT JOIN creative_library l ON l.account_id=d.account_id AND l.creative_variant_id=d.creative_variant_id WHERE d.account_id=$1`,
      [accountId],
    ),
    pool.query("SELECT status, count(*)::int AS n FROM ingestion_runs WHERE account_id=$1 GROUP BY status", [accountId]),
  ]);
  const c = checks.rows[0];
  const l = lib.rows[0];
  const r = a.result;
  const tracking = r ? r.creatives.filter((x) => x.classification === "TRACKING_RISK" || x.tracking.flags.length) : [];
  const pctRows = (n: number) => (c.rows ? `${((n / c.rows) * 100).toFixed(1)}% of rows` : "");
  const tone = (n: number, bad = 0): Tone => (n === 0 ? "green" : n > bad ? "red" : "yellow");
  const items: [string, number, string, Tone][] = [
    ["Purchases with missing or zero value", c.value_missing, "ROAS understated; affected creatives are flagged as tracking risk.", tone(c.value_missing, c.rows * 0.01)],
    ["Purchases not reported", c.purchases_missing, "Shown as unavailable, never as 0.", tone(c.purchases_missing, c.rows * 0.05)],
    ["Currency differs from account", c.currency_mismatch, `Rows not in ${cur}. Values are not converted.`, tone(c.currency_mismatch)],
    ["Clicks > impressions", c.clicks_gt_impr, "Impossible rate; source export problem.", tone(c.clicks_gt_impr)],
    ["Purchases > clicks", c.purch_gt_clicks, "Can be view-through attribution; CVR is capped in judgement.", c.purch_gt_clicks ? "yellow" : "green"],
    ["Spend 0 with impressions", c.zero_spend_delivery, "Usually bonus delivery; harmless.", c.zero_spend_delivery ? "yellow" : "green"],
    ["Impressions missing", c.impr_missing, "CTR/CPM unavailable for those days.", c.impr_missing ? "yellow" : "green"],
    ["Landing page views missing", c.lpv_missing, "CVR falls back to outbound clicks or clicks (one definition per account).", c.lpv_missing ? "yellow" : "green"],
    ["No video metrics", c.video_missing, "Hook/hold analysis skipped for those rows (fine for static ads).", "gray"],
    ["Variant id defaulted to ad id", c.variant_from_ad, "No creative_variant_id provided; each ad treated as its own creative.", c.variant_from_ad ? "yellow" : "green"],
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Data Quality" question="Can we trust the numbers behind each decision?" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <Kpi label="Daily rows" value={c.rows.toLocaleString("en-US")} />
        <Kpi label="Creatives" value={c.creatives} />
        <Kpi label="Ads" value={c.ads} />
        <Kpi label="Not in library" value={l.not_in_library} tone={l.not_in_library ? "yellow" : "green"} sub="metadata from ads only" />
        <Kpi label="Tracking-risk creatives" value={tracking.length} tone={tracking.length ? "red" : "green"} />
        <Kpi label="Import runs" value={runs.rows.map((x) => `${x.n} ${x.status.toLowerCase()}`).join(" · ") || "none"} />
      </div>
      {r && (
        <Card title="Metric definitions chosen for this account (one per account, never switched silently)">
          <div className="flex flex-wrap gap-2 text-sm">
            <Pill tone="purple">CVR = {r.ctx.labels.cvr}</Pill>
            <Pill tone="purple">CTR = {r.ctx.labels.ctr}</Pill>
            <Pill tone="purple">Hook = {r.ctx.labels.hook}</Pill>
            <Pill tone="purple">Hold = {r.ctx.labels.hold}</Pill>
          </div>
        </Card>
      )}
      <Card question="Checks" title="Computed from stored daily rows">
        <table className="w-full">
          <tbody>
            {items.map(([label, n, note, t]) => (
              <tr key={label}>
                <td className="td">
                  <Pill tone={t}>{n === 0 ? "OK" : n.toLocaleString("en-US")}</Pill>
                </td>
                <td className="td font-medium">{label}</td>
                <td className="td text-xs text-ink-muted">{pctRows(n)}</td>
                <td className="td whitespace-normal text-xs">{note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card question="Is every day present?" title="Date coverage per platform">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Platform</th>
                <th className="th">From</th>
                <th className="th">To</th>
                <th className="th text-right">Days</th>
                <th className="th text-right">Missing days</th>
              </tr>
            </thead>
            <tbody>
              {coverage.rows.map((x) => (
                <tr key={x.platform}>
                  <td className="td">{x.platform}</td>
                  <td className="td">{x.f}</td>
                  <td className="td">{x.l}</td>
                  <td className="td num text-right">{x.n}</td>
                  <td className="td num text-right">
                    <Pill tone={x.missing ? "yellow" : "green"}>{x.missing}</Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card question="Same name, different creatives" title="Creatives are never merged by name. These names map to several variants — check that this is intended.">
          {names.rows.length ? (
            <ul className="space-y-1 text-sm">
              {names.rows.map((x) => (
                <li key={x.creative_name} className="flex justify-between">
                  <span className="truncate">{x.creative_name}</span>
                  <span className="num">{x.n} variants</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sub">Every name maps to one variant.</p>
          )}
          <p className="mt-2 text-xs text-ink-muted">
            Library rows without data: {l.library_without_data} · library rows without a concept tag: {l.untagged_concept}
          </p>
        </Card>
      </div>
      <Card question="Which creatives have tracking problems?" title="ROAS is not trusted for these until measurement is fixed">
        {tracking.length ? (
          <table className="w-full">
            <tbody>
              {tracking.map((x) => (
                <tr key={x.key}>
                  <td className="td">
                    <Link className="hover:underline" href={creativeHref(accountId, x.key, sp)}>
                      {x.meta.creativeName}
                    </Link>
                  </td>
                  <td className="td num">{fmtMoney(x.window.spend, cur)}</td>
                  <td className="td whitespace-normal text-xs">{x.tracking.flags.map((f) => f.text).join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="sub">None.</p>
        )}
      </Card>
    </div>
  );
}
