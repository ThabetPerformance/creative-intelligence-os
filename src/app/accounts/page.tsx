import Link from "next/link";
import { listAccounts } from "@/server/accounts";
import { getPool } from "@/lib/db/client";
import { createAccountAction, createDemoAccountAction } from "../actions";
import { PLATFORMS } from "@/ingestion/template";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function AccountsPage() {
  const accounts = await listAccounts();
  const stats = await getPool().query(
    `SELECT account_id, sum(rows)::int AS rows, max(latest_date)::text AS latest FROM source_status GROUP BY account_id`,
  );
  const byId = new Map(stats.rows.map((r) => [r.account_id as string, r]));
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8">
        <div className="text-sm font-bold tracking-tight">CREATIVE INTELLIGENCE OS</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Know what wins. Know why. Know what to make next.</h1>
        <p className="sub mt-1">Pick an account, create one, or load the synthetic demo to explore every classification.</p>
      </div>

      <section className="mb-8">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="h2">Accounts</h2>
          <div className="flex gap-2">
            <a className="btn" href="/demo/Creative_Intelligence_TEMPLATE.xlsx" download>
              Download template
            </a>
            <a className="btn" href="/demo/Creative_Intelligence_DEMO.xlsx" download>
              Download demo workbook
            </a>
          </div>
        </div>
        {accounts.length === 0 ? (
          <div className="card p-6 text-sm text-ink-muted">No accounts yet. Create one below or load the demo account.</div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Account</th>
                  <th className="th">Currency</th>
                  <th className="th">Mode</th>
                  <th className="th">Platforms</th>
                  <th className="th text-right">Daily rows</th>
                  <th className="th">Data through</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => {
                  const s = byId.get(a.id);
                  return (
                    <tr key={a.id} className="hover:bg-canvas">
                      <td className="td">
                        <Link className="font-medium text-ink hover:underline" href={`/a/${a.id}/command-center`}>
                          {a.name}
                        </Link>
                      </td>
                      <td className="td">{a.currency}</td>
                      <td className="td">{a.dataMode}</td>
                      <td className="td">{a.platforms.join(", ")}</td>
                      <td className="td num text-right">{(s?.rows ?? 0).toLocaleString("en-US")}</td>
                      <td className="td">{s?.latest ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-[1fr_320px]">
        <section id="create" className="card p-5">
          <h2 className="h2">Create account</h2>
          <p className="sub mb-4">Targets can change over time later in Account Settings → Targets history.</p>
          <form action={createAccountAction} className="grid grid-cols-2 gap-3">
            <label className="col-span-2 flex flex-col gap-1">
              <span className="label">Account name</span>
              <input name="name" required className="input" placeholder="Brand name" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label">Currency (ISO)</span>
              <input name="currency" required defaultValue="USD" maxLength={3} className="input uppercase" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label">Timezone</span>
              <input name="timezone" defaultValue="UTC" className="input" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label">Target ROAS</span>
              <input name="targetRoas" type="number" step="0.01" min="0.01" required defaultValue="2" className="input" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label">CPO guardrail (optional)</span>
              <input name="cpoGuardrail" type="number" step="0.01" min="0" className="input" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label">Min purchases for evidence</span>
              <input name="minPurchases" type="number" min="1" defaultValue="10" className="input" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label">Min days live</span>
              <input name="minDaysLive" type="number" min="0" defaultValue="5" className="input" />
            </label>
            <fieldset className="col-span-2 flex flex-wrap gap-3">
              <legend className="label mb-1">Platforms</legend>
              {PLATFORMS.map((p) => (
                <label key={p} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" name="platforms" value={p} defaultChecked={p === "meta"} /> {p}
                </label>
              ))}
            </fieldset>
            <div className="col-span-2">
              <SubmitButton className="btn-primary">Create account</SubmitButton>
            </div>
          </form>
        </section>
        <section className="card flex flex-col gap-3 p-5">
          <h2 className="h2">Demo account</h2>
          <p className="sub">
            Generates a synthetic brand with 6+ months of data, 100+ creatives and every classification, then imports it through the same server pipeline as a real upload. All numbers are fake.
          </p>
          <form action={createDemoAccountAction}>
            <SubmitButton className="btn-primary w-full" pendingText="Generating demo…">
              Create demo account
            </SubmitButton>
          </form>
        </section>
      </div>
    </div>
  );
}
