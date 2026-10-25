"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { readXlsx } from "@/ingestion/xlsx-reader";
import { parseCsv } from "@/ingestion/workbook-io";
import { SHEETS } from "@/ingestion/template";
import { dateCoverage, validateDaily, validateLibrary, validateTargets, validateEvents, validateTags, type Issue, type RawRow } from "@/ingestion/validate";

const CHUNK = 2500;

interface Preview {
  fileName: string;
  sheets: Record<string, RawRow[]>;
  daily: RawRow[];
  accepted: number;
  rejected: number;
  duplicates: number;
  creatives: number;
  ads: number;
  dateFrom: string | null;
  dateTo: string | null;
  coverage: { platform: string; from: string; to: string; days: number; missing: string[] }[];
  issues: Issue[];
  summary: Record<string, number>;
  other: { library: number; targets: number; events: number; tags: number; hasConfig: boolean };
  parseMs: number;
}

type Phase = { kind: "idle" } | { kind: "parsing" } | { kind: "preview"; p: Preview } | { kind: "importing"; p: Preview; done: number; total: number; log: string[] } | { kind: "done"; result: Record<string, unknown>; log: string[] } | { kind: "error"; message: string };

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}

/**
 * File Mode import (spec §88–93): parse and preview in the browser, then send the rows to the
 * server in chunks. The server re-validates every row; nothing here is trusted.
 */
export function ImportClient({ accountId, currency }: { accountId: string; currency: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [applyConfig, setApplyConfig] = useState(false);
  const [replaceTargets, setReplaceTargets] = useState(true);

  async function onFile(f: File) {
    setPhase({ kind: "parsing" });
    await new Promise((r) => setTimeout(r, 30));
    try {
      const t0 = performance.now();
      let sheets: Record<string, RawRow[]>;
      if (/\.csv$/i.test(f.name)) sheets = { [SHEETS.daily]: parseCsv(await f.text()) };
      else if (/\.xlsx$/i.test(f.name)) sheets = readXlsx(new Uint8Array(await f.arrayBuffer()));
      else throw new Error("Upload a .xlsx workbook (from the template) or a .csv of 04_RAW_CREATIVE_DAILY rows.");
      const daily = sheets[SHEETS.daily] ?? [];
      if (!daily.length) throw new Error(`No rows found in ${SHEETS.daily}. Check the sheet name and the header row.`);
      const v = validateDaily(daily, currency, { maxIssues: 300 });
      const lib = validateLibrary(sheets[SHEETS.library] ?? []);
      const tg = validateTargets(sheets[SHEETS.targets] ?? []);
      const ev = validateEvents(sheets[SHEETS.events] ?? []);
      const tags = validateTags(sheets[SHEETS.tags] ?? []);
      const creatives = new Set(v.rows.map((r) => `${r.platform}:${r.creativeVariantId}`));
      const ads = new Set(v.rows.map((r) => `${r.platform}:${r.adId}`));
      setPhase({
        kind: "preview",
        p: {
          fileName: f.name,
          sheets,
          daily,
          accepted: v.rows.length,
          rejected: v.rejected,
          duplicates: v.duplicates,
          creatives: creatives.size,
          ads: ads.size,
          dateFrom: v.dateFrom,
          dateTo: v.dateTo,
          coverage: dateCoverage(v.rows),
          issues: [...v.issues, ...lib.issues, ...tg.issues, ...ev.issues, ...tags.issues],
          summary: v.summary,
          other: { library: lib.rows.length, targets: tg.rows.length, events: ev.rows.length, tags: tags.rows.length, hasConfig: (sheets[SHEETS.config] ?? []).length > 0 },
          parseMs: Math.round(performance.now() - t0),
        },
      });
    } catch (e) {
      setPhase({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  async function runImport(p: Preview) {
    const base = `/api/accounts/${accountId}/import`;
    const log: string[] = [];
    const total = Math.ceil(p.daily.length / CHUNK);
    setPhase({ kind: "importing", p, done: 0, total, log });
    let runId: number | null = null;
    try {
      const start = await post(`${base}/start`, {
        fileName: p.fileName,
        applyConfig,
        replaceTargets,
        dailyRowsExpected: p.daily.length,
        sheets: {
          config: p.sheets[SHEETS.config] ?? [],
          targets: p.sheets[SHEETS.targets] ?? [],
          library: p.sheets[SHEETS.library] ?? [],
          tags: p.sheets[SHEETS.tags] ?? [],
          events: p.sheets[SHEETS.events] ?? [],
        },
      });
      runId = start.runId;
      log.push(`Run #${runId} started: ${start.libraryRows} library rows, ${start.targets} target regimes, ${start.events} events.`);
      for (let i = 0; i < total; i++) {
        const rows = p.daily.slice(i * CHUNK, (i + 1) * CHUNK);
        let attempt = 0;
        for (;;) {
          try {
            const r = await post(`${base}/chunk`, { runId, index: i, rows });
            if (r.rejected) log.push(`Chunk ${i + 1}: ${r.rejected} row(s) rejected.`);
            break;
          } catch (e) {
            if (++attempt >= 3) throw e;
            await new Promise((res) => setTimeout(res, 800 * attempt));
          }
        }
        setPhase({ kind: "importing", p, done: i + 1, total, log: [...log] });
      }
      const fin = await post(`${base}/finish`, { runId });
      log.push(`Finished with status ${fin.status}.`);
      setPhase({ kind: "done", result: fin, log });
      router.refresh();
    } catch (e) {
      if (runId) await post(`${base}/finish`, { runId, aborted: true }).catch(() => undefined);
      setPhase({ kind: "error", message: e instanceof Error ? e.message : String(e) });
      router.refresh();
    }
  }

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="h2">Upload a workbook</h2>
          <p className="sub">
            Use the template (.xlsx) or a CSV of {SHEETS.daily} rows. Re-uploading the same file is safe: rows are keyed by DATE × AD and updated in place.
          </p>
        </div>
        <div className="flex gap-2">
          <a className="btn" href="/demo/Creative_Intelligence_TEMPLATE.xlsx" download>
            Template
          </a>
          <a className="btn" href="/demo/Creative_Intelligence_DEMO.xlsx" download>
            Demo workbook
          </a>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <input
          type="file"
          accept=".xlsx,.csv"
          className="text-sm"
          disabled={phase.kind === "parsing" || phase.kind === "importing"}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
            e.target.value = "";
          }}
        />
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={applyConfig} onChange={(e) => setApplyConfig(e.target.checked)} /> Apply {SHEETS.config} to account settings
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={replaceTargets} onChange={(e) => setReplaceTargets(e.target.checked)} /> Replace targets history from {SHEETS.targets}
        </label>
      </div>

      {phase.kind === "parsing" && <p className="mt-4 text-sm text-ink-muted">Parsing and validating in your browser…</p>}
      {phase.kind === "error" && <p className="mt-4 rounded-lg border border-kill-line bg-kill-bg p-3 text-sm text-kill">{phase.message}</p>}
      {(phase.kind === "preview" || phase.kind === "importing") && <PreviewView p={phase.p} />}
      {phase.kind === "preview" && (
        <div className="mt-4 flex items-center gap-3">
          <button className="btn-primary" disabled={phase.p.accepted === 0} onClick={() => void runImport(phase.p)}>
            Import {phase.p.accepted.toLocaleString("en-US")} rows
          </button>
          <button className="btn" onClick={() => setPhase({ kind: "idle" })}>
            Cancel
          </button>
          {phase.p.rejected > 0 && <span className="text-sm text-fix">{phase.p.rejected.toLocaleString("en-US")} rejected rows will not be imported (reasons below).</span>}
        </div>
      )}
      {phase.kind === "importing" && (
        <div className="mt-4">
          <div className="h-2 w-full rounded-full bg-line-soft">
            <div className="h-2 rounded-full bg-ink transition-all" style={{ width: `${(phase.done / Math.max(1, phase.total)) * 100}%` }} />
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            Uploading chunk {phase.done} / {phase.total}… keep this tab open.
          </p>
        </div>
      )}
      {phase.kind === "done" && (
        <div className="mt-4 rounded-lg border border-win-line bg-win-bg p-3 text-sm">
          <b>Import {String(phase.result.status)}.</b> {Number(phase.result.rowsImported).toLocaleString("en-US")} rows imported, {Number(phase.result.rowsRejected).toLocaleString("en-US")} rejected, covering {String(phase.result.dateFrom)} → {String(phase.result.dateTo)}.
          <ul className="mt-1 list-disc pl-5 text-xs text-ink-muted">
            {phase.log.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function PreviewView({ p }: { p: Preview }) {
  const errors = p.issues.filter((i) => i.severity === "error");
  const warnings = p.issues.filter((i) => i.severity !== "error");
  return (
    <div className="mt-4 space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
        {[
          ["Rows found", p.daily.length],
          ["Accepted", p.accepted],
          ["Rejected", p.rejected],
          ["Duplicates (later wins)", p.duplicates],
          ["Creatives", p.creatives],
          ["Ads", p.ads],
        ].map(([l, v]) => (
          <div key={String(l)} className="rounded-lg border border-line p-2">
            <div className="label">{l}</div>
            <div className="num text-lg font-semibold">{Number(v).toLocaleString("en-US")}</div>
          </div>
        ))}
      </div>
      <p className="text-xs text-ink-muted">
        {p.fileName} · parsed in {p.parseMs} ms · {p.dateFrom ?? "—"} → {p.dateTo ?? "—"} · library {p.other.library}, targets {p.other.targets}, events {p.other.events}, tags {p.other.tags}
        {p.other.hasConfig ? ", account config present" : ""} · missing creative ids {p.summary.missingCreativeIds}, missing purchase value {p.summary.missingPurchaseValue}, currency issues {p.summary.currencyIssues}, rates converted from % {p.summary.convertedRates}
      </p>
      {p.coverage.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="th">Platform</th>
              <th className="th">From</th>
              <th className="th">To</th>
              <th className="th text-right">Days with data</th>
              <th className="th">Missing days</th>
            </tr>
          </thead>
          <tbody>
            {p.coverage.map((c) => (
              <tr key={c.platform}>
                <td className="td">{c.platform}</td>
                <td className="td">{c.from}</td>
                <td className="td">{c.to}</td>
                <td className="td num text-right">{c.days}</td>
                <td className="td text-xs">{c.missing.length ? `${c.missing.length}: ${c.missing.slice(0, 6).join(", ")}${c.missing.length > 6 ? "…" : ""}` : "none"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {(errors.length > 0 || warnings.length > 0) && (
        <details open={errors.length > 0} className="rounded-lg border border-line">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
            {errors.length} error(s), {warnings.length} warning(s){p.issues.length >= 300 ? " (first 300 shown)" : ""}
          </summary>
          <div className="max-h-72 overflow-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Severity</th>
                  <th className="th">Sheet</th>
                  <th className="th">Row</th>
                  <th className="th">Field</th>
                  <th className="th">Reason</th>
                </tr>
              </thead>
              <tbody>
                {p.issues.slice(0, 300).map((i, k) => (
                  <tr key={k}>
                    <td className={`td text-xs font-semibold ${i.severity === "error" ? "text-kill" : "text-watch"}`}>{i.severity}</td>
                    <td className="td text-xs">{i.sheet}</td>
                    <td className="td num text-xs">{i.row ?? ""}</td>
                    <td className="td text-xs">{i.field ?? ""}</td>
                    <td className="td whitespace-normal text-xs">{i.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
