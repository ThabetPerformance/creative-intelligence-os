import Link from "next/link";
import type { GroupRow } from "@/engine/groups";
import type { CreativeAnalysis } from "@/engine/model";
import type { SearchParams } from "@/lib/period";
import { withPeriod } from "@/lib/period";
import { fmtMoney, fmtNum, fmtPct, fmtX, Pill } from "./ui";
import { creativeHref } from "./page-kit";

/** Dimension performance table. Commercial metrics first; language is associative, not causal. */
export function GroupTable({ rows, cur, accountId, sp, byKey, filterParam }: { rows: GroupRow[]; cur: string; accountId: string; sp: SearchParams; byKey: Map<string, CreativeAnalysis>; filterParam?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            {["Value", "Creatives", "Active", "Reached evidence", "Winners now", "Winner rate", "Ever-winner rate", "Spend", "Spend share", "Purchases", "Purchase share", "ROAS", "CPO", "CVR", "CTR", "Hook", "Days → winner", "Winner lifespan", "Decision-ready waste", "Top creatives", "Notes"].map((h) => (
              <th key={h} className="th">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.value} className="hover:bg-canvas">
              <td className="td font-medium">
                {filterParam && g.value !== "(untagged)" ? (
                  <Link className="hover:underline" href={withPeriod(`/a/${accountId}/leaderboard?${filterParam}=${encodeURIComponent(g.value)}`, sp)}>
                    {g.value}
                  </Link>
                ) : (
                  g.value
                )}
              </td>
              <td className="td num">{g.creatives}</td>
              <td className="td num">{g.activeCreatives}</td>
              <td className="td num">{g.eligible}</td>
              <td className="td num">{g.winners}</td>
              <td className="td num">{fmtPct(g.winnerRate, 0)}</td>
              <td className="td num">{fmtPct(g.everWinnerRate, 0)}</td>
              <td className="td num">{fmtMoney(g.metrics.spend, cur)}</td>
              <td className="td num">{fmtPct(g.spendShare, 0)}</td>
              <td className="td num">{fmtNum(g.metrics.purchases)}</td>
              <td className="td num">{fmtPct(g.purchaseShare, 0)}</td>
              <td className="td num">{fmtX(g.metrics.roas)}</td>
              <td className="td num">{fmtMoney(g.metrics.cpo, cur)}</td>
              <td className="td num">{fmtPct(g.metrics.cvr, 2)}</td>
              <td className="td num">{fmtPct(g.metrics.ctr, 2)}</td>
              <td className="td num">{fmtPct(g.metrics.hookRate, 0)}</td>
              <td className="td num">{fmtNum(g.medianTimeToWinner)}</td>
              <td className="td num">{fmtNum(g.medianWinnerLifespan)}</td>
              <td className="td num">{g.decisionReadyWaste ? fmtMoney(g.decisionReadyWaste, cur) : "—"}</td>
              <td className="td text-xs">
                {g.topCreativeKeys.slice(0, 3).map((k) => {
                  const c = byKey.get(k);
                  return c ? (
                    <Link key={k} href={creativeHref(accountId, k, sp)} className="block max-w-[200px] truncate hover:underline">
                      {c.meta.creativeName}
                    </Link>
                  ) : null;
                })}
              </td>
              <td className="td max-w-[280px] whitespace-normal text-xs">
                {g.sampleWarning && <Pill tone="yellow">{g.sampleWarning}</Pill>} {g.association}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
