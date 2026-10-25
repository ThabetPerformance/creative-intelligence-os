import Link from "next/link";
import { notFound } from "next/navigation";
import { getPool } from "@/lib/db/client";
import { getAnalysis } from "@/server/analysis";
import { Card, Kpi, PageHeader, Pill, StatusTag, type Tone } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { createExperimentAction, createLearningAction, deleteActionAction, updateActionAction, updateLearningStatusAction } from "@/app/account-actions";
import { ACTION_STATUSES, LEARNING_STATUSES, OUTCOMES } from "@/lib/action-meta";
import { creativeHref, type PageProps } from "@/components/page-kit";
import { CLASSIFICATION_LABEL } from "@/engine/types";

const ST: Record<string, Tone> = { "TO DO": "gray", "IN PROGRESS": "yellow", VALIDATING: "purple", DONE: "green" };

export default async function ActionsPage({ params, searchParams }: PageProps) {
  const { accountId } = await params;
  const sp = await searchParams;
  const a = await getAnalysis(accountId, sp);
  if (!a) notFound();
  const pool = getPool();
  const [actions, learnings, experiments] = await Promise.all([
    pool.query("SELECT *, start_date::text AS sd, end_date::text AS ed FROM creative_actions WHERE account_id=$1 ORDER BY CASE status WHEN 'IN PROGRESS' THEN 0 WHEN 'VALIDATING' THEN 1 WHEN 'TO DO' THEN 2 ELSE 3 END, created_at DESC", [accountId]),
    pool.query("SELECT * FROM creative_learnings WHERE account_id=$1 ORDER BY created_at DESC", [accountId]),
    pool.query("SELECT * FROM creative_experiments WHERE account_id=$1 ORDER BY created_at DESC", [accountId]),
  ]);
  const byKey = new Map((a.result?.creatives ?? []).map((c) => [c.key, c]));
  const cnt = (s: string) => actions.rows.filter((x) => x.status === s).length;

  return (
    <div className="space-y-4">
      <PageHeader title="Action & Learning" question="What did we decide, what happened, and what did we learn?" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {ACTION_STATUSES.map((s) => (
          <Kpi key={s} label={s} value={cnt(s)} tone={ST[s]} />
        ))}
        <Kpi label="Learnings" value={learnings.rows.length} />
        <Kpi label="Validated findings" value={learnings.rows.filter((l) => l.evidence_status === "VALIDATED_FINDING").length} tone="purple" />
      </div>

      <Card question="Action log" title="Every action carries a baseline, KPI and validation window. The current engine reading is shown next to each so you can judge the outcome.">
        <div className="space-y-3">
          {actions.rows.length === 0 && <p className="sub">No actions yet. Create one from a creative page or below.</p>}
          {actions.rows.map((x) => {
            const c = x.creative_key ? byKey.get(x.creative_key) : null;
            return (
              <details key={x.id} className="rounded-lg border border-line" open={x.status !== "DONE"}>
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2">
                  <Pill tone={ST[x.status] ?? "gray"}>{x.status}</Pill>
                  <Pill tone={x.priority === "HIGH" ? "red" : x.priority === "MEDIUM" ? "yellow" : "gray"}>{x.priority}</Pill>
                  <span className="text-sm font-medium">{x.action}</span>
                  {x.creative_key && (
                    <Link className="text-xs text-ink-muted underline" href={creativeHref(accountId, x.creative_key, sp)}>
                      {x.creative_name ?? x.creative_key}
                    </Link>
                  )}
                  {x.decision_outcome && <Pill tone="purple">Outcome: {x.decision_outcome}</Pill>}
                  <span className="ml-auto text-xs text-ink-muted">#{x.id} · {x.owner ?? "no owner"}</span>
                </summary>
                <div className="grid gap-3 border-t border-line-soft p-3 md:grid-cols-[1fr_1.2fr]">
                  <dl className="grid grid-cols-[130px_1fr] gap-x-2 gap-y-1 text-xs">
                    {(
                      [
                        ["Decision", x.decision],
                        ["Diagnosis", x.diagnosis],
                        ["Primary KPI", x.primary_kpi],
                        ["Secondary KPI", x.secondary_kpi],
                        ["Baseline", x.baseline],
                        ["Target / guardrail", x.target_guardrail],
                        ["Validation window", x.validation_window],
                        ["Dates", `${x.sd ?? "—"} → ${x.ed ?? "—"}`],
                        ["Now (engine)", c ? `${CLASSIFICATION_LABEL[c.classification]} · ROAS ${c.window.roas?.toFixed(2) ?? "n/a"}x · 7D ROAS ${c.c7.roas?.toFixed(2) ?? "n/a"}x · ${c.window.purchases ?? 0} purchases` : "—"],
                      ] as const
                    ).map(([l, v]) => (
                      <div key={l} className="contents">
                        <dt className="text-ink-muted">{l}</dt>
                        <dd>{v ?? "—"}</dd>
                      </div>
                    ))}
                  </dl>
                  <form action={updateActionAction.bind(null, accountId)} className="grid grid-cols-2 gap-2 text-sm">
                    <input type="hidden" name="id" value={x.id} />
                    <label className="flex flex-col gap-0.5">
                      <span className="label">Status</span>
                      <select name="status" defaultValue={x.status} className="input">
                        {ACTION_STATUSES.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-0.5">
                      <span className="label">Outcome</span>
                      <select name="decisionOutcome" defaultValue={x.decision_outcome ?? ""} className="input">
                        <option value="">—</option>
                        {OUTCOMES.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                    <label className="col-span-2 flex flex-col gap-0.5">
                      <span className="label">Observed result</span>
                      <input name="observedResult" defaultValue={x.observed_result ?? ""} className="input" />
                    </label>
                    <label className="flex flex-col gap-0.5">
                      <span className="label">Learning</span>
                      <input name="learning" defaultValue={x.learning ?? ""} className="input" />
                    </label>
                    <label className="flex flex-col gap-0.5">
                      <span className="label">Learning status</span>
                      <select name="learningStatus" defaultValue="HYPOTHESIS" className="input">
                        {LEARNING_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s.replace("_", " ")}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-0.5">
                      <span className="label">Next step</span>
                      <input name="nextStep" defaultValue={x.next_step ?? ""} className="input" />
                    </label>
                    <label className="flex flex-col gap-0.5">
                      <span className="label">Owner</span>
                      <input name="owner" defaultValue={x.owner ?? ""} className="input" />
                    </label>
                    <div className="col-span-2 flex gap-2">
                      <SubmitButton className="btn-primary">Save</SubmitButton>
                    </div>
                  </form>
                  <form action={deleteActionAction.bind(null, accountId)}>
                    <input type="hidden" name="id" value={x.id} />
                    <SubmitButton className="text-xs text-kill underline">Delete action</SubmitButton>
                  </form>
                </div>
              </details>
            );
          })}
        </div>
      </Card>

      <Card question="New action" title="Not tied to one creative (e.g. a concept test). Creative-specific actions are best created from the creative page.">
        <ActionForm accountId={accountId} currency={a.account.currency} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card question="Learning library" title="FACT = observed in data · HYPOTHESIS = plausible explanation · VALIDATED FINDING = confirmed by a controlled test. The planner reuses these.">
          <ul className="divide-y divide-line-soft">
            {learnings.rows.length === 0 && <li className="sub py-2">No learnings yet.</li>}
            {learnings.rows.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <StatusTag s={l.evidence_status} />
                <span className="flex-1">{l.learning}</span>
                <span className="text-xs text-ink-muted">{[l.concept, l.angle, l.hook_tactic, l.format, l.creator].filter(Boolean).join(" · ")}</span>
                <form action={updateLearningStatusAction.bind(null, accountId)} className="flex gap-1">
                  <input type="hidden" name="id" value={l.id} />
                  <select name="evidenceStatus" defaultValue={l.evidence_status} className="input py-0.5 text-xs">
                    {LEARNING_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s.replace("_", " ")}
                      </option>
                    ))}
                    <option value="DELETE">Delete</option>
                  </select>
                  <SubmitButton className="btn py-0.5 text-xs">Set</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
          <form action={createLearningAction.bind(null, accountId)} className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3 text-sm md:grid-cols-4">
            <label className="col-span-2 flex flex-col gap-0.5 md:col-span-4">
              <span className="label">Learning</span>
              <input name="learning" required className="input" placeholder="e.g. Founder-led openings outperform product-only openings for ThermoMug" />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="label">Status</span>
              <select name="evidenceStatus" className="input" defaultValue="HYPOTHESIS">
                {LEARNING_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            {(["concept", "angle", "hookTactic", "format", "creator", "creativeKey"] as const).map((k) => (
              <label key={k} className="flex flex-col gap-0.5">
                <span className="label">{k}</span>
                <input name={k} className="input" />
              </label>
            ))}
            <div className="col-span-2 md:col-span-4">
              <SubmitButton className="btn-primary">Add learning</SubmitButton>
            </div>
          </form>
        </Card>
        <Card question="Experiments" title="Group a control and test creatives under one hypothesis">
          <ul className="mb-3 space-y-2 text-sm">
            {experiments.rows.length === 0 && <li className="sub">No experiments yet.</li>}
            {experiments.rows.map((e) => (
              <li key={e.id} className="rounded-lg border border-line p-2">
                <div className="flex items-center gap-2">
                  <b>{e.code}</b>
                  <Pill tone={ST[e.status] ?? "gray"}>{e.status}</Pill>
                </div>
                <div className="text-xs">{e.hypothesis}</div>
                <div className="text-xs text-ink-muted">
                  Control: {e.control_creative_key ?? "—"} · Tests: {(e.test_creative_keys as string[]).join(", ") || "—"}
                </div>
              </li>
            ))}
          </ul>
          <form action={createExperimentAction.bind(null, accountId)} className="grid gap-2 text-sm">
            <input name="code" required placeholder="Code, e.g. EXP-001" className="input" />
            <input name="hypothesis" placeholder="Hypothesis" className="input" />
            <input name="controlCreativeKey" placeholder="Control creative key (platform:variant)" className="input font-mono text-xs" />
            <input name="testCreativeKeys" placeholder="Test creative keys, comma separated" className="input font-mono text-xs" />
            <SubmitButton className="btn-primary">Save experiment</SubmitButton>
          </form>
        </Card>
      </div>
    </div>
  );
}
