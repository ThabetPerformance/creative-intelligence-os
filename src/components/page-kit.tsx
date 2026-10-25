import Link from "next/link";
import { notFound } from "next/navigation";
import { getAnalysis, type AccountAnalysis } from "@/server/analysis";
import { withPeriod, type SearchParams } from "@/lib/period";
import type { AnalysisResult } from "@/engine/analyze";
import type { CreativeAnalysis } from "@/engine/model";
import { Empty, Thumb, ClassBadge, TONE_HEX, classTone } from "./ui";
import { CLASSIFICATIONS, CLASSIFICATION_LABEL } from "@/engine/types";

export type PageProps = { params: Promise<{ accountId: string }>; searchParams: Promise<SearchParams> };

export async function loadPage(props: PageProps): Promise<{ accountId: string; sp: SearchParams; a: AccountAnalysis; r: AnalysisResult | null }> {
  const { accountId } = await props.params;
  const sp = await props.searchParams;
  const a = await getAnalysis(accountId, sp);
  if (!a) notFound();
  return { accountId, sp, a, r: a.result };
}

export function NoData({ accountId }: { accountId: string }) {
  return (
    <Empty title="No performance data yet">
      Import a workbook in{" "}
      <Link className="underline" href={`/a/${accountId}/import`}>
        Import Data
      </Link>{" "}
      or create the demo account from the accounts page. Pages read only from the database, never from an API on render.
    </Empty>
  );
}

export function creativeHref(accountId: string, key: string, sp: SearchParams) {
  return withPeriod(`/a/${accountId}/creative/${encodeURIComponent(key)}`, sp);
}

export function CreativeCell({ c, accountId, sp, sub }: { c: CreativeAnalysis; accountId: string; sp: SearchParams; sub?: React.ReactNode }) {
  return (
    <Link href={creativeHref(accountId, c.key, sp)} className="flex min-w-0 items-center gap-2 hover:underline">
      <Thumb url={c.meta.thumbnailUrl} label={c.meta.creativeName} size={32} />
      <span className="min-w-0">
        <span className="block max-w-[260px] truncate text-sm font-medium text-ink">{c.meta.creativeName}</span>
        <span className="block truncate text-[11px] text-ink-muted">{sub ?? `${c.meta.platform} · ${c.meta.creativeVariantId}`}</span>
      </span>
    </Link>
  );
}

export function ClassLegend() {
  return CLASSIFICATIONS.map((c) => ({ label: CLASSIFICATION_LABEL[c], color: TONE_HEX[classTone(c)] }));
}

export function MiniCreativeList({ list, accountId, sp, right }: { list: CreativeAnalysis[]; accountId: string; sp: SearchParams; right: (c: CreativeAnalysis) => React.ReactNode }) {
  if (!list.length) return <p className="sub">None right now.</p>;
  return (
    <ul className="divide-y divide-line-soft">
      {list.map((c) => (
        <li key={c.key} className="flex items-center justify-between gap-3 py-2">
          <CreativeCell c={c} accountId={accountId} sp={sp} />
          <div className="flex shrink-0 items-center gap-2 text-right text-xs">
            {right(c)}
            <ClassBadge c={c.classification} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export const byKey = (r: AnalysisResult) => new Map(r.creatives.map((c) => [c.key, c]));
