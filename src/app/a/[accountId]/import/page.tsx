import Link from "next/link";
import { getAccount } from "@/server/accounts";
import { getPool } from "@/lib/db/client";
import { ImportClient } from "@/components/ImportClient";
import { PageHeader, Pill, type Tone } from "@/components/ui";
import { recalculateAction, reprocessAction, deleteRunRowsAction } from "@/app/account-actions";
import { SubmitButton } from "@/components/SubmitButton";

// server actions on this page (recalculate, Windsor chunks) can run for tens of seconds
export const maxDuration = 60;

const tone = (s: string): Tone => (s === "SUCCESS" ? "green" : s === "PARTIAL" ? "yellow" : s === "FAILED" ? "red" : "gray");

export default async function ImportPage({ params, searchParams }: { params: Promise<{ accountId: string }>; searchParams: Promise<{ run?: string }> }) {
  const { accountId } = await params;
  const { run } = await searchParams;
  const acc = await getAccount(accountId);
  if (!acc) return null;
  const pool = getPool();
  const runs = await pool.query(
    `SELECT id, source, kind, file_name, status, rows_total, rows_imported, rows_rejected, date_from::text AS df, date_to::text AS dt, chunk_start::text AS cs, chunk_end::text AS ce,
            jsonb_array_length(warnings) AS nw, jsonb_array_length(errors) AS ne, summary, created_at, finished_at
     FROM ingestion_runs WHERE account_id=$1 ORDER BY created_at DESC LIMIT 60`,
    [accountId],
  );
  const selected = run ? await pool.query("SELECT id, warnings, errors, summary FROM ingestion_runs WHERE account_id=$1 AND id=$2", [accountId, Number(run)]) : null;
  const sel = selected?.rows[0];
  return (
    <div className="space-y-5">
      <PageHeader title="Import Data" question="Bring daily DATE × AD performance into this account. File Mode needs no API keys.">
        <div className="flex gap-2">
          <form action={reprocessAction.bind(null, accountId)}>
            <SubmitButton pendingText="Reprocessing…">Reprocess analysis</SubmitButton>
          </form>
          <form action={recalculateAction.bind(null, accountId)}>
            <SubmitButton pendingText="Recalculating history…">Recalculate history snapshots</SubmitButton>
          </form>
        </div>
      </PageHeader>
      <ImportClient accountId={accountId} currency={acc.account.currency} />

      <section className="card overflow-hidden">
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="h2">Import history</h2>
          <span className="sub">Re-importing the same rows updates them (idempotent on account × platform × ad × date).</span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">#</th>
                <th className="th">When</th>
                <th className="th">Source</th>
                <th className="th">Kind</th>
                <th className="th">File / chunk</th>
                <th className="th">Status</th>
                <th className="th text-right">Rows</th>
                <th className="th text-right">Imported</th>
                <th className="th text-right">Rejected</th>
                <th className="th">Dates</th>
                <th className="th text-right">Warn / Err</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody>
              {runs.rows.length === 0 && (
                <tr>
                  <td className="td text-ink-muted" colSpan={12}>
                    No imports yet.
                  </td>
                </tr>
              )}
              {runs.rows.map((r) => (
                <tr key={r.id} className={sel?.id === r.id ? "bg-canvas" : ""}>
                  <td className="td num">{r.id}</td>
                  <td className="td text-xs">{new Date(r.created_at).toISOString().slice(0, 16).replace("T", " ")}</td>
                  <td className="td text-xs">{r.source}</td>
                  <td className="td text-xs">{r.kind}</td>
                  <td className="td max-w-[220px] truncate text-xs">{r.file_name ?? (r.cs ? `${r.cs} → ${r.ce}` : "—")}</td>
                  <td className="td">
                    <Pill tone={tone(r.status)}>{r.status}</Pill>
                  </td>
                  <td className="td num text-right">{Number(r.rows_total).toLocaleString("en-US")}</td>
                  <td className="td num text-right">{Number(r.rows_imported).toLocaleString("en-US")}</td>
                  <td className="td num text-right">{Number(r.rows_rejected).toLocaleString("en-US")}</td>
                  <td className="td text-xs">{r.df ? `${r.df} → ${r.dt}` : "—"}</td>
                  <td className="td num text-right text-xs">
                    {r.nw} / {r.ne}
                  </td>
                  <td className="td text-xs">
                    <Link className="underline" href={`?run=${r.id}`}>
                      Inspect
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {sel && (
        <section className="card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="h2">Run #{sel.id}</h2>
            <form action={deleteRunRowsAction.bind(null, accountId)} className="flex items-center gap-2">
              <input type="hidden" name="runId" value={sel.id} />
              <input name="confirm" placeholder="Type DELETE" className="input w-28 py-1 text-xs" />
              <SubmitButton className="btn text-kill">Delete rows last written by this run</SubmitButton>
            </form>
          </div>
          <pre className="mb-3 overflow-x-auto rounded-lg bg-canvas p-3 text-xs">{JSON.stringify(sel.summary, null, 2)}</pre>
          <IssueTable title="Errors (rejected rows)" list={sel.errors} />
          <IssueTable title="Warnings" list={sel.warnings} />
        </section>
      )}
    </div>
  );
}

function IssueTable({ title, list }: { title: string; list: { sheet?: string; row?: number; field?: string; code: string; message: string }[] }) {
  if (!list?.length) return <p className="sub mb-2">{title}: none.</p>;
  return (
    <details className="mb-2 rounded-lg border border-line" open>
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
        {title}: {list.length}
        {list.length >= 1000 ? "+ (capped)" : ""}
      </summary>
      <div className="max-h-80 overflow-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Sheet</th>
              <th className="th">Row</th>
              <th className="th">Field</th>
              <th className="th">Code</th>
              <th className="th">Message</th>
            </tr>
          </thead>
          <tbody>
            {list.slice(0, 500).map((i, k) => (
              <tr key={k}>
                <td className="td text-xs">{i.sheet}</td>
                <td className="td num text-xs">{i.row}</td>
                <td className="td text-xs">{i.field}</td>
                <td className="td text-xs">{i.code}</td>
                <td className="td whitespace-normal text-xs">{i.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
