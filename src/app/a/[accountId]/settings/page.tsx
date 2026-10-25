import { notFound } from "next/navigation";
import { getAccount } from "@/server/accounts";
import { Card, PageHeader, Pill } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { addTargetAction, deleteTargetAction, saveSettingsAction } from "@/app/account-actions";
import { deleteAccountAction } from "@/app/actions";
import { PLATFORMS } from "@/ingestion/template";
import { COMPARISONS, RANGE_PRESETS } from "@/lib/period";

function F({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-ink-faint">{hint}</span>}
    </label>
  );
}

export default async function SettingsPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  const acc = await getAccount(accountId);
  if (!acc) notFound();
  const { account: a, settings: s, targets } = acc;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="space-y-4">
      <PageHeader title="Account Settings" question="Targets, evidence thresholds and defaults used by every decision in this account." />
      <Card title="Changes apply on the next page load; cached analysis is invalidated.">
        <form action={saveSettingsAction.bind(null, accountId)} className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <F label="Account name">
            <input name="name" defaultValue={a.name} className="input" required />
          </F>
          <F label="Currency">
            <input name="currency" defaultValue={a.currency} className="input uppercase" maxLength={3} required />
          </F>
          <F label="Timezone">
            <input name="timezone" defaultValue={a.timezone} className="input" />
          </F>
          <F label="Primary conversion">
            <input name="primaryConversion" defaultValue={a.primaryConversion} className="input" />
          </F>
          <F label="Data mode">
            <select name="dataMode" defaultValue={a.dataMode} className="input">
              <option>FILE</option>
              <option>WINDSOR</option>
              <option>HYBRID</option>
            </select>
          </F>
          <F label="Default period">
            <select name="defaultAnalysisWindow" defaultValue={s.defaultAnalysisWindow} className="input">
              {RANGE_PRESETS.filter((p) => p.key !== "custom").map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </F>
          <F label="Default comparison">
            <select name="defaultComparisonWindow" defaultValue={s.defaultComparisonWindow} className="input">
              {COMPARISONS.filter((p) => p.key !== "custom").map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </F>
          <F label="Fatigue sensitivity">
            <select name="fatigueSensitivity" defaultValue={s.fatigueSensitivity} className="input">
              <option>LOW</option>
              <option>MEDIUM</option>
              <option>HIGH</option>
            </select>
          </F>
          <F label="Fallback target ROAS" hint="Used for dates not covered by targets history">
            <input name="targetRoas" type="number" step="0.01" defaultValue={s.targetRoas} className="input" required />
          </F>
          <F label="Fallback CPO guardrail">
            <input name="cpoGuardrail" type="number" step="0.01" defaultValue={s.cpoGuardrail ?? ""} className="input" />
          </F>
          <F label="Gross margin (0–1, optional)">
            <input name="grossMargin" type="number" step="0.01" min="0" max="1" defaultValue={s.grossMargin ?? ""} className="input" />
          </F>
          <F label="Freshness window (days)">
            <input name="freshnessWindowDays" type="number" defaultValue={s.freshnessWindowDays} className="input" />
          </F>
          <F label="Min purchases for evidence">
            <input name="minPurchases" type="number" defaultValue={s.minPurchases} className="input" />
          </F>
          <F label="Min evidence spend">
            <input name="minEvidenceSpend" type="number" step="0.01" defaultValue={s.minEvidenceSpend} className="input" />
          </F>
          <F label="Evidence spend × CPO (optional)" hint="If set, evidence spend = CPO guardrail × this">
            <input name="evidenceSpendMultiple" type="number" step="0.1" defaultValue={s.evidenceSpendMultiple ?? ""} className="input" />
          </F>
          <F label="Min days live">
            <input name="minDaysLive" type="number" defaultValue={s.minDaysLive} className="input" />
          </F>
          <fieldset className="col-span-2 flex flex-wrap items-center gap-3">
            <span className="label">Platforms</span>
            {PLATFORMS.map((p) => (
              <label key={p} className="flex items-center gap-1 text-sm">
                <input type="checkbox" name="platforms" value={p} defaultChecked={a.platforms.includes(p)} /> {p}
              </label>
            ))}
          </fieldset>
          <div className="col-span-2">
            <F label="Notes">
              <input name="notes" defaultValue={a.notes ?? ""} className="input" />
            </F>
          </div>
          <div className="col-span-2 md:col-span-4">
            <SubmitButton className="btn-primary">Save settings</SubmitButton>
          </div>
        </form>
      </Card>

      <Card question="Targets history" title="Each creative is judged against the target active on each date. Historical classifications are never rewritten with today's target.">
        <table className="mb-3 w-full">
          <thead>
            <tr>
              {["Start", "End", "Target ROAS", "CPO guardrail", "Margin", "Notes", ""].map((h) => (
                <th key={h} className="th">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {targets.length === 0 && (
              <tr>
                <td className="td text-ink-muted" colSpan={7}>
                  No regimes — the fallback target above applies to all dates.
                </td>
              </tr>
            )}
            {targets.map((t) => {
              const active = t.startDate <= today && (!t.endDate || t.endDate >= today);
              return (
                <tr key={t.id}>
                  <td className="td">{t.startDate}</td>
                  <td className="td">{t.endDate ?? "open"}</td>
                  <td className="td num">{t.targetRoas.toFixed(2)}x</td>
                  <td className="td num">{t.cpoGuardrail ?? "—"}</td>
                  <td className="td num">{t.optionalMargin ?? "—"}</td>
                  <td className="td text-xs">
                    {t.notes} {active && <Pill tone="green">active today</Pill>}
                  </td>
                  <td className="td">
                    <form action={deleteTargetAction.bind(null, accountId)}>
                      <input type="hidden" name="id" value={t.id} />
                      <SubmitButton className="text-xs text-kill underline">Remove</SubmitButton>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <form action={addTargetAction.bind(null, accountId)} className="grid grid-cols-2 gap-2 md:grid-cols-7">
          <F label="Start">
            <input name="startDate" type="date" required className="input" />
          </F>
          <F label="End (optional)">
            <input name="endDate" type="date" className="input" />
          </F>
          <F label="Target ROAS">
            <input name="targetRoas" type="number" step="0.01" required className="input" />
          </F>
          <F label="CPO guardrail">
            <input name="cpoGuardrail" type="number" step="0.01" className="input" />
          </F>
          <F label="Margin">
            <input name="optionalMargin" type="number" step="0.01" className="input" />
          </F>
          <F label="Notes">
            <input name="notes" className="input" />
          </F>
          <div className="flex items-end">
            <SubmitButton className="btn-primary">Add regime</SubmitButton>
          </div>
        </form>
      </Card>

      <Card question="Danger zone" title="Deletes the account and all its data (daily rows, library, actions, learnings). Cannot be undone.">
        <form action={deleteAccountAction} className="flex items-center gap-2">
          <input type="hidden" name="id" value={accountId} />
          <input name="confirm" placeholder="Type DELETE" className="input w-32" />
          <SubmitButton className="btn text-kill">Delete account</SubmitButton>
        </form>
      </Card>
    </div>
  );
}
