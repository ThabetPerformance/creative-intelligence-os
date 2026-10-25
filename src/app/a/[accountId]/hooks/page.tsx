import { loadPage, NoData, byKey, MiniCreativeList, type PageProps } from "@/components/page-kit";
import { Card, PageHeader, fmtPct, fmtX } from "@/components/ui";
import { GroupTable } from "@/components/GroupTable";
import { median } from "@/engine/stats";
import type { HookMatrixCell } from "@/engine/model";

const CELLS: { key: HookMatrixCell; title: string; text: string }[] = [
  { key: "TRUE_WINNING_HOOK", title: "True winning hooks", text: "High hook rate and strong conversion: reuse the opening." },
  { key: "ATTENTION_TRAP", title: "Attention traps", text: "Stops the scroll but does not sell: keep the opening, rebuild body/offer." },
  { key: "HOOK_OPPORTUNITY", title: "Hook opportunities", text: "Converts well, weak opening: test new first 3 seconds." },
  { key: "WEAK", title: "Weak on both", text: "Low attention and low conversion." },
];
const STAGES: Record<string, string> = { WEAK_OPENING: "Weak opening", POST_HOOK_DROP: "Post-hook drop", MID_VIDEO_DROP: "Mid-video drop", CTA_DROP: "Drop before CTA" };

export default async function HooksPage(props: PageProps) {
  const { accountId, sp, a, r } = await loadPage(props);
  if (!r) return <NoData accountId={accountId} />;
  const active = r.creatives.filter((c) => c.activeInWindow && c.hookMatrix);
  const video = r.creatives.filter((c) => c.activeInWindow && c.video);
  const stageCount = new Map<string, number>();
  for (const c of video) if (c.video!.weakestStage) stageCount.set(c.video!.weakestStage, (stageCount.get(c.video!.weakestStage) ?? 0) + 1);
  return (
    <div className="space-y-4">
      <PageHeader title="Hooks & Video" question="Which openings earn attention that converts, and where do viewers drop off?" />
      <Card question="Hook × conversion matrix" title={`Hook rate and ${r.ctx.labels.cvr} percentiles vs the creative's platform baseline (median hook ${fmtPct(median(active.map((c) => c.window.hookRate)))}). Only creatives with video metrics.`}>
        <div className="grid gap-3 md:grid-cols-2">
          {CELLS.map((cell) => {
            const list = active.filter((c) => c.hookMatrix === cell.key).sort((x, y) => y.window.spend - x.window.spend);
            return (
              <div key={cell.key} className="rounded-lg border border-line p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{cell.title}</span>
                  <span className="num">{list.length}</span>
                </div>
                <p className="mb-1 text-xs text-ink-muted">{cell.text}</p>
                <MiniCreativeList accountId={accountId} sp={sp} list={list.slice(0, 6)} right={(c) => <span className="num">hook {fmtPct(c.window.hookRate, 0)} · {fmtX(c.window.roas)}</span>} />
              </div>
            );
          })}
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <Card question="Where do videos lose people?" title={`Weakest retention stage across ${video.length} active video creatives`}>
          <table className="w-full">
            <tbody>
              {Object.entries(STAGES).map(([k, l]) => (
                <tr key={k}>
                  <td className="td">{l}</td>
                  <td className="td num text-right">{stageCount.get(k) ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card question="Hook tactics" title="Performance by hook tactic (tag in the creative library)">
          <GroupTable rows={r.groups.hookTactic} cur={a.account.currency} accountId={accountId} sp={sp} byKey={byKey(r)} />
        </Card>
      </div>
    </div>
  );
}
