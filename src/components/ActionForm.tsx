import { createActionAction } from "@/app/account-actions";
import { SubmitButton } from "./SubmitButton";
import type { CreativeAnalysis } from "@/engine/model";
import { DECISION_LABEL } from "@/engine/types";

/** Turn a diagnosis into a tracked action (spec §95). Pre-filled from the engine's output. */
export function ActionForm({ accountId, c, currency }: { accountId: string; c?: CreativeAnalysis; currency: string }) {
  const baseline = c ? `ROAS ${c.window.roas?.toFixed(2) ?? "n/a"}x · CPO ${c.window.cpo !== null ? `${currency} ${c.window.cpo.toFixed(2)}` : "n/a"} · ${c.window.purchases ?? 0} purchases (${c.window.activeDays}d)` : "";
  return (
    <form action={createActionAction.bind(null, accountId)} className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
      <input type="hidden" name="creativeKey" value={c?.key ?? ""} />
      <input type="hidden" name="creativeName" value={c?.meta.creativeName ?? ""} />
      <label className="col-span-2 flex flex-col gap-0.5 md:col-span-4">
        <span className="label">Action</span>
        <input name="action" required className="input" defaultValue={c ? c.diagnosis.recommendation : ""} />
      </label>
      <label className="flex flex-col gap-0.5">
        <span className="label">Decision</span>
        <input name="decision" className="input" defaultValue={c ? DECISION_LABEL[c.decision] : ""} />
      </label>
      <label className="flex flex-col gap-0.5">
        <span className="label">Priority</span>
        <select name="priority" className="input" defaultValue={c && ["KILL_CANDIDATE", "FATIGUED_WINNER", "SCALE_CANDIDATE"].includes(c.classification) ? "HIGH" : "MEDIUM"}>
          <option>HIGH</option>
          <option>MEDIUM</option>
          <option>LOW</option>
        </select>
      </label>
      <label className="flex flex-col gap-0.5">
        <span className="label">Owner</span>
        <input name="owner" className="input" />
      </label>
      <label className="flex flex-col gap-0.5">
        <span className="label">Start date</span>
        <input name="startDate" type="date" className="input" />
      </label>
      <label className="col-span-2 flex flex-col gap-0.5">
        <span className="label">Diagnosis</span>
        <input name="diagnosis" className="input" defaultValue={c ? `${c.diagnosis.commercial} ${c.diagnosis.trend}` : ""} />
      </label>
      <label className="flex flex-col gap-0.5">
        <span className="label">Primary KPI</span>
        <input name="primaryKpi" className="input" defaultValue="ROAS" />
      </label>
      <label className="flex flex-col gap-0.5">
        <span className="label">Secondary KPI</span>
        <input name="secondaryKpi" className="input" defaultValue="CPO" />
      </label>
      <label className="col-span-2 flex flex-col gap-0.5">
        <span className="label">Baseline</span>
        <input name="baseline" className="input" defaultValue={baseline} />
      </label>
      <label className="flex flex-col gap-0.5">
        <span className="label">Target / guardrail</span>
        <input name="targetGuardrail" className="input" />
      </label>
      <label className="flex flex-col gap-0.5">
        <span className="label">Validation window</span>
        <input name="validationWindow" className="input" defaultValue={c?.diagnosis.validationWindow ?? "7 days"} />
      </label>
      <div className="col-span-2 md:col-span-4">
        <SubmitButton className="btn-primary">Create action</SubmitButton>
      </div>
    </form>
  );
}
