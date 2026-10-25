import { notFound } from "next/navigation";
import { getAccount } from "@/server/accounts";
import { getPool } from "@/lib/db/client";
import { Card, PageHeader, Pill } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { DEFAULT_FIELD_MAPS, windsorConfigured } from "@/windsor/client";
import { backfillState, mappings } from "@/windsor/sync";
import { refreshWindsorAction, saveMappingAction, startBackfillAction, stepBackfillAction, toggleMappingAction } from "@/app/account-actions";

// server actions on this page (recalculate, Windsor chunks) can run for tens of seconds
export const maxDuration = 60;

export default async function WindsorPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  const acc = await getAccount(accountId);
  if (!acc) notFound();
  const configured = windsorConfigured();
  const [maps, bf, runs] = await Promise.all([
    mappings(accountId),
    backfillState(accountId),
    getPool().query(
      "SELECT id, kind, file_name, status, rows_imported, chunk_start::text AS cs, chunk_end::text AS ce, summary->>'error' AS err, created_at FROM ingestion_runs WHERE account_id=$1 AND source='WINDSOR' ORDER BY created_at DESC LIMIT 30",
      [accountId],
    ),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const yearAgo = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  return (
    <div className="space-y-4">
      <PageHeader title="Windsor Connection" question="Optional: pull daily ad data automatically. File Mode keeps working without it." />
      <Card title="Status">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Pill tone={configured ? "green" : "gray"}>{configured ? "API key present on server" : "WINDSOR_API_KEY not set"}</Pill>
          <Pill tone="yellow">Integration not verified against a live Windsor account in this build</Pill>
          <span className="text-ink-muted">The key is read only on the server (environment variable). It is never sent to the browser, stored in the database, or logged.</span>
        </div>
      </Card>

      <Card question="Which ad accounts map to this account?" title="Mappings and field maps are stored in the database. Leave the field map empty to use the default for the connector.">
        <table className="mb-3 w-full">
          <thead>
            <tr>
              {["Connector", "Platform", "External account", "Label", "Field map", "Enabled", ""].map((h) => (
                <th key={h} className="th">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {maps.length === 0 && (
              <tr>
                <td className="td text-ink-muted" colSpan={7}>
                  No mappings yet.
                </td>
              </tr>
            )}
            {maps.map((m) => (
              <tr key={m.id}>
                <td className="td">{m.connector}</td>
                <td className="td">{m.platform}</td>
                <td className="td font-mono text-xs">{m.external_account_id}</td>
                <td className="td">{m.label}</td>
                <td className="td text-xs">{m.field_map ? `custom (${Object.keys(m.field_map).length} columns)` : "default"}</td>
                <td className="td">
                  <Pill tone={m.enabled ? "green" : "gray"}>{m.enabled ? "yes" : "no"}</Pill>
                </td>
                <td className="td">
                  <form action={toggleMappingAction.bind(null, accountId)} className="flex gap-2">
                    <input type="hidden" name="id" value={m.id} />
                    <SubmitButton className="text-xs underline" name="op" value="toggle">
                      {m.enabled ? "Disable" : "Enable"}
                    </SubmitButton>
                    <SubmitButton className="text-xs text-kill underline" name="op" value="delete">
                      Delete
                    </SubmitButton>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <form action={saveMappingAction.bind(null, accountId)} className="grid gap-2 md:grid-cols-4">
          <select name="connector" className="input">
            {Object.keys(DEFAULT_FIELD_MAPS).map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
          <input name="externalAccountId" required placeholder="Windsor account id (e.g. act_123…)" className="input font-mono text-xs" />
          <input name="label" placeholder="Label" className="input" />
          <SubmitButton className="btn-primary">Save mapping</SubmitButton>
          <textarea name="fieldMap" rows={3} placeholder='Optional JSON, e.g. {"purchases":"actions_purchase"}' className="input font-mono text-xs md:col-span-4" />
        </form>
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer font-medium">Default field maps</summary>
          <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-canvas p-3">{JSON.stringify(DEFAULT_FIELD_MAPS, null, 2)}</pre>
        </details>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card question="Backfill history" title="Runs in date chunks; each chunk is a separate run so failures resume where they stopped.">
          {bf ? (
            <p className="mb-2 text-sm">
              {bf.from} → {bf.to} in {bf.chunkDays}-day chunks · next chunk: <b>{bf.next ?? "complete"}</b> · failures {bf.failures}
            </p>
          ) : (
            <p className="sub mb-2">No backfill started.</p>
          )}
          <form action={startBackfillAction.bind(null, accountId)} className="mb-2 flex flex-wrap items-end gap-2">
            <input type="date" name="from" defaultValue={yearAgo} className="input" />
            <input type="date" name="to" defaultValue={today} className="input" />
            <input type="number" name="chunkDays" defaultValue={14} min={1} max={31} className="input w-20" />
            <SubmitButton className="btn" pendingText="Saving…">
              {bf ? "Restart backfill" : "Plan backfill"}
            </SubmitButton>
          </form>
          <form action={stepBackfillAction.bind(null, accountId)}>
            <SubmitButton className="btn-primary" pendingText="Fetching chunks (up to ~40s)…">
              Run next chunks
            </SubmitButton>
          </form>
          <p className="mt-2 text-xs text-ink-muted">The daily cron (vercel.json) also advances unfinished backfills and refreshes the last 3 days.</p>
        </Card>
        <Card question="Refresh" title="Re-pull the last 3 days (platforms restate recent conversions). Idempotent on DATE × AD.">
          <form action={refreshWindsorAction.bind(null, accountId)}>
            <SubmitButton className="btn-primary" pendingText="Refreshing…">
              Refresh last 3 days
            </SubmitButton>
          </form>
        </Card>
      </div>

      <Card question="Windsor runs" title="Most recent 30">
        <table className="w-full">
          <thead>
            <tr>
              {["#", "When", "Kind", "Mapping", "Chunk", "Status", "Imported", "Error"].map((h) => (
                <th key={h} className="th">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {runs.rows.length === 0 && (
              <tr>
                <td className="td text-ink-muted" colSpan={8}>
                  No Windsor runs yet.
                </td>
              </tr>
            )}
            {runs.rows.map((r) => (
              <tr key={r.id}>
                <td className="td num">{r.id}</td>
                <td className="td text-xs">{new Date(r.created_at).toISOString().slice(0, 16).replace("T", " ")}</td>
                <td className="td text-xs">{r.kind}</td>
                <td className="td text-xs">{r.file_name}</td>
                <td className="td text-xs">{r.cs ? `${r.cs} → ${r.ce}` : "—"}</td>
                <td className="td">
                  <Pill tone={r.status === "SUCCESS" ? "green" : r.status === "FAILED" ? "red" : "yellow"}>{r.status}</Pill>
                </td>
                <td className="td num">{r.rows_imported}</td>
                <td className="td max-w-[320px] truncate text-xs text-kill">{r.err}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
