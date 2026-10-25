import Link from "next/link";
import { loadPage, NoData, CreativeCell, creativeHref, type PageProps } from "@/components/page-kit";
import { ClassBadge, ConfidenceBadge, DecisionBadge, PageHeader, Pill, Thumb, fmtDelta, fmtMoney, fmtNum, fmtPct, fmtX } from "@/components/ui";
import { CLASSIFICATIONS, CLASSIFICATION_LABEL, DECISIONS, DECISION_LABEL, LOSER_CLASSES, WINNER_CLASSES, type Classification } from "@/engine/types";
import type { CreativeAnalysis } from "@/engine/model";
import type { SearchParams } from "@/lib/period";

const VIEWS: { key: string; label: string; classes?: Classification[] }[] = [
  { key: "all", label: "All active" },
  { key: "winners", label: "Winners", classes: [...WINNER_CLASSES, "EMERGING_WINNER"] },
  { key: "scale", label: "Scale", classes: ["SCALE_CANDIDATE", "HIDDEN_WINNER", "EMERGING_WINNER"] },
  { key: "fix", label: "Fix", classes: ["HOOK_OPPORTUNITY", "ATTENTION_WINNER", "RECOVERABLE"] },
  { key: "fatigue", label: "Fatigue", classes: ["FATIGUE_WATCH", "FATIGUED_WINNER"] },
  { key: "cut", label: "Cut", classes: [...LOSER_CLASSES] },
  { key: "learning", label: "Learning", classes: ["NEW_LEARNING", "INSUFFICIENT_DATA"] },
  { key: "tracking", label: "Tracking risk", classes: ["TRACKING_RISK"] },
  { key: "history", label: "Incl. paused (lifetime)" },
];

type Col = { key: string; label: string; get: (c: CreativeAnalysis) => number | string | null; fmt: (c: CreativeAnalysis, cur: string) => React.ReactNode; right?: boolean };

const COLS: Col[] = [
  { key: "spend", label: "Spend", get: (c) => c.window.spend, fmt: (c, cur) => fmtMoney(c.window.spend, cur), right: true },
  { key: "spendShare", label: "Spend share", get: (c) => c.volume.spendShare, fmt: (c) => fmtPct(c.volume.spendShare), right: true },
  { key: "purchases", label: "Purchases", get: (c) => c.window.purchases, fmt: (c) => fmtNum(c.window.purchases), right: true },
  { key: "revenue", label: "Revenue", get: (c) => c.window.purchaseValue, fmt: (c, cur) => fmtMoney(c.window.purchaseValue, cur), right: true },
  { key: "roas", label: "ROAS", get: (c) => c.window.roas, fmt: (c) => fmtX(c.window.roas), right: true },
  { key: "roasVsTarget", label: "vs target", get: (c) => c.roasVsTarget, fmt: (c) => <Delta v={c.roasVsTarget} />, right: true },
  { key: "cpo", label: "CPO", get: (c) => c.window.cpo, fmt: (c, cur) => fmtMoney(c.window.cpo, cur), right: true },
  { key: "cvr", label: "CVR", get: (c) => c.window.cvr, fmt: (c) => fmtPct(c.window.cvr, 2), right: true },
  { key: "ctr", label: "CTR", get: (c) => c.window.ctr, fmt: (c) => fmtPct(c.window.ctr, 2), right: true },
  { key: "hook", label: "Hook", get: (c) => c.window.hookRate, fmt: (c) => fmtPct(c.window.hookRate), right: true },
  { key: "hold", label: "Hold", get: (c) => c.window.holdRate, fmt: (c) => fmtPct(c.window.holdRate), right: true },
  { key: "cpm", label: "CPM", get: (c) => c.window.cpm, fmt: (c, cur) => fmtMoney(c.window.cpm, cur), right: true },
  { key: "freq", label: "Freq.", get: (c) => c.window.frequency, fmt: (c) => fmtNum(c.window.frequency, 2), right: true },
  { key: "roas7", label: "ROAS 7D", get: (c) => c.c7.roas, fmt: (c) => fmtX(c.c7.roas), right: true },
  { key: "trend", label: "7D vs prev 7D", get: (c) => c.trend.roas7dChange, fmt: (c) => <Delta v={c.trend.roas7dChange} />, right: true },
  { key: "cmp", label: "ROAS vs comparison", get: (c) => (c.comparison?.roas && c.window.roas ? c.window.roas / c.comparison.roas - 1 : null), fmt: (c) => <Delta v={c.comparison?.roas && c.window.roas ? c.window.roas / c.comparison.roas - 1 : null} />, right: true },
  { key: "age", label: "Age (d)", get: (c) => c.ageDays, fmt: (c) => fmtNum(c.ageDays), right: true },
  { key: "fatigue", label: "Fatigue", get: (c) => c.fatigue.status, fmt: (c) => (c.fatigue.status === "NOT_APPLICABLE" ? "—" : c.fatigue.status) },
  { key: "scale", label: "Scale evidence", get: (c) => c.scale.evidence, fmt: (c) => c.scale.evidence.replaceAll("_", " ") },
  { key: "evidence", label: "Evidence", get: (c) => c.evidence.level, fmt: (c) => c.evidence.level },
  { key: "waste", label: "Decision-ready waste", get: (c) => c.decisionReadyWaste, fmt: (c, cur) => (c.decisionReadyWaste ? fmtMoney(c.decisionReadyWaste, cur) : "—"), right: true },
  { key: "rank", label: "Rank", get: (c) => c.rank.current, fmt: (c) => (c.rank.current ? `#${c.rank.current}` : "—"), right: true },
  { key: "creator", label: "Creator", get: (c) => c.meta.creator, fmt: (c) => c.meta.creator ?? "—" },
  { key: "concept", label: "Concept", get: (c) => c.meta.concept, fmt: (c) => c.meta.concept ?? "—" },
  { key: "format", label: "Format", get: (c) => c.meta.format, fmt: (c) => c.meta.format ?? "—" },
  { key: "launch", label: "Launched", get: (c) => c.launchDate, fmt: (c) => c.launchDate ?? "—" },
];
const DEFAULT_COLS = ["spend", "spendShare", "purchases", "roas", "roasVsTarget", "cpo", "cvr", "trend", "age", "fatigue"];

function Delta({ v }: { v: number | null }) {
  if (v === null || !Number.isFinite(v)) return <span className="text-ink-faint">—</span>;
  return <span className={v >= 0 ? "text-win" : "text-kill"}>{fmtDelta(v)}</span>;
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

function qs(sp: SearchParams, patch: Record<string, string | null>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach((x) => q.append(k, x));
    else q.set(k, v);
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === "") q.delete(k);
    else q.set(k, v);
  }
  const s = q.toString();
  return s ? `?${s}` : "?";
}

export default async function Leaderboard(props: PageProps) {
  const { accountId, sp, a, r } = await loadPage(props);
  if (!r) return <NoData accountId={accountId} />;
  const cur = a.account.currency;
  const view = VIEWS.find((v) => v.key === one(sp.view)) ?? VIEWS[0];
  const f = {
    cls: one(sp.class),
    platform: one(sp.platform),
    decision: one(sp.decision),
    confidence: one(sp.confidence),
    creator: one(sp.creator),
    concept: one(sp.concept),
    format: one(sp.format),
    q: one(sp.q).toLowerCase(),
    minSpend: Number(one(sp.minSpend)) || 0,
  };
  const sort = one(sp.sort) || "priority";
  const dir = one(sp.dir) === "asc" ? 1 : -1;
  const layout = one(sp.layout) === "cards" ? "cards" : "table";
  const picked = Array.isArray(sp.col) ? sp.col : sp.col ? [sp.col] : null;
  const cols = (picked ?? DEFAULT_COLS).filter((k) => COLS.some((c) => c.key === k));
  const size = Math.min(200, Math.max(10, Number(one(sp.size)) || 50));
  const page = Math.max(1, Number(one(sp.page)) || 1);

  let list = r.creatives.filter((c) => (view.key === "history" ? c.lifetime.spend > 0 : c.activeInWindow));
  if (view.classes) list = list.filter((c) => view.classes!.includes(c.classification));
  if (f.cls) list = list.filter((c) => c.classification === f.cls);
  if (f.platform) list = list.filter((c) => c.meta.platform === f.platform);
  if (f.decision) list = list.filter((c) => c.decision === f.decision);
  if (f.confidence) list = list.filter((c) => c.confidence === f.confidence);
  if (f.creator) list = list.filter((c) => c.meta.creator === f.creator);
  if (f.concept) list = list.filter((c) => c.meta.concept === f.concept);
  if (f.format) list = list.filter((c) => c.meta.format === f.format);
  if (f.minSpend) list = list.filter((c) => c.window.spend >= f.minSpend);
  if (f.q) list = list.filter((c) => `${c.meta.creativeName} ${c.meta.creativeVariantId} ${c.meta.creativeGroupId ?? ""} ${c.meta.adIds.join(" ")} ${c.meta.campaigns.join(" ")}`.toLowerCase().includes(f.q));

  const getter = sort === "priority" ? (c: CreativeAnalysis) => c.priorityScore : sort === "commercial" ? (c: CreativeAnalysis) => c.commercialScore : COLS.find((c) => c.key === sort)?.get ?? ((c: CreativeAnalysis) => c.priorityScore);
  list.sort((x, y) => {
    const a1 = getter(x);
    const b1 = getter(y);
    if (a1 === b1) return y.window.spend - x.window.spend;
    if (a1 === null || a1 === undefined) return 1;
    if (b1 === null || b1 === undefined) return -1;
    return (a1 < b1 ? -1 : 1) * dir;
  });
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const rows = list.slice((page - 1) * size, page * size);

  const uniq = (fn: (c: CreativeAnalysis) => string | null) => [...new Set(r.creatives.map(fn).filter((x): x is string => !!x))].sort();
  const sortLink = (key: string) => qs(sp, { sort: key, dir: sort === key && dir === -1 ? "asc" : null, page: null });

  return (
    <div className="space-y-4">
      <PageHeader title="Creative Leaderboard" question="Which creatives need a decision first? Default sort is decision priority: class urgency × money at stake × confidence.">
        <div className="flex gap-1">
          <Link className={layout === "table" ? "btn-primary" : "btn"} href={qs(sp, { layout: null })}>
            Table
          </Link>
          <Link className={layout === "cards" ? "btn-primary" : "btn"} href={qs(sp, { layout: "cards" })}>
            Cards
          </Link>
          <Link className="btn" href={`/a/${accountId}/timeline${qs(sp, { keys: rows.slice(0, 5).map((c) => c.key).join(","), page: null })}`}>
            Compare top 5 on timeline
          </Link>
        </div>
      </PageHeader>

      <div className="flex flex-wrap gap-1">
        {VIEWS.map((v) => (
          <Link key={v.key} href={qs(sp, { view: v.key === "all" ? null : v.key, page: null, class: null })} className={`rounded-lg border px-2.5 py-1 text-sm ${v.key === view.key ? "border-ink bg-ink text-white" : "border-line bg-white hover:bg-canvas"}`}>
            {v.label}
          </Link>
        ))}
      </div>

      <form className="card flex flex-wrap items-end gap-2 p-3" method="GET">
        {["range", "from", "to", "asOf", "cmp", "cfrom", "cto", "view", "layout", "sort", "dir"].map((k) => (one(sp[k]) ? <input key={k} type="hidden" name={k} value={one(sp[k])} /> : null))}
        {cols.map((k) => (picked ? <input key={k} type="hidden" name="col" value={k} /> : null))}
        <Field label="Search">
          <input name="q" defaultValue={one(sp.q)} placeholder="name, id, ad id, campaign" className="input w-56" />
        </Field>
        <Select label="Class" name="class" value={f.cls} options={CLASSIFICATIONS.map((c) => [c, CLASSIFICATION_LABEL[c]])} />
        <Select label="Decision" name="decision" value={f.decision} options={DECISIONS.map((d) => [d, DECISION_LABEL[d]])} />
        <Select label="Confidence" name="confidence" value={f.confidence} options={[["HIGH", "High"], ["MEDIUM", "Medium"], ["LOW", "Low"]]} />
        <Select label="Platform" name="platform" value={f.platform} options={uniq((c) => c.meta.platform).map((x) => [x, x])} />
        <Select label="Creator" name="creator" value={f.creator} options={uniq((c) => c.meta.creator).map((x) => [x, x])} />
        <Select label="Concept" name="concept" value={f.concept} options={uniq((c) => c.meta.concept).map((x) => [x, x])} />
        <Select label="Format" name="format" value={f.format} options={uniq((c) => c.meta.format).map((x) => [x, x])} />
        <Field label={`Min spend (${cur})`}>
          <input name="minSpend" type="number" min="0" defaultValue={one(sp.minSpend)} className="input w-24" />
        </Field>
        <button className="btn-primary" type="submit">
          Apply
        </button>
        <Link className="btn" href={qs({}, { view: view.key === "all" ? null : view.key })}>
          Reset
        </Link>
      </form>

      <details className="card p-3 text-sm">
        <summary className="cursor-pointer font-medium">Columns ({cols.length})</summary>
        <form method="GET" className="mt-2 flex flex-wrap gap-3">
          {Object.entries(sp).map(([k, v]) => (k !== "col" && k !== "page" && v ? <input key={k} type="hidden" name={k} value={one(v)} /> : null))}
          {COLS.map((c) => (
            <label key={c.key} className="flex items-center gap-1 text-xs">
              <input type="checkbox" name="col" value={c.key} defaultChecked={cols.includes(c.key)} /> {c.label}
            </label>
          ))}
          <ColsSubmit />
        </form>
      </details>

      <div className="flex items-center justify-between text-xs text-ink-muted">
        <span>
          {total.toLocaleString("en-US")} creatives · page {page} of {pages} · sorted by {sort === "priority" ? "decision priority" : sort} {dir === 1 ? "↑" : "↓"}
        </span>
        <Pager sp={sp} page={page} pages={pages} />
      </div>

      {layout === "table" ? (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">#</th>
                <th className="th">Creative</th>
                <th className="th">
                  <Link href={sortLink("priority")}>Class</Link>
                </th>
                <th className="th">Decision</th>
                <th className="th">Confidence</th>
                {cols.map((k) => {
                  const c = COLS.find((x) => x.key === k)!;
                  return (
                    <th key={k} className={`th ${c.right ? "text-right" : ""}`}>
                      <Link href={sortLink(k)}>
                        {c.label}
                        {sort === k ? (dir === 1 ? " ↑" : " ↓") : ""}
                      </Link>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((c, i) => (
                <tr key={c.key} className="hover:bg-canvas">
                  <td className="td num text-xs text-ink-muted">{(page - 1) * size + i + 1}</td>
                  <td className="td">
                    <CreativeCell c={c} accountId={accountId} sp={sp} sub={`${c.meta.platform} · ${c.meta.creativeVariantId}${c.meta.adIds.length > 1 ? ` · ${c.meta.adIds.length} ads` : ""}`} />
                  </td>
                  <td className="td">
                    <ClassBadge c={c.classification} />
                  </td>
                  <td className="td">
                    <DecisionBadge d={c.decision} />
                  </td>
                  <td className="td">
                    <ConfidenceBadge c={c.confidence} />
                  </td>
                  {cols.map((k) => {
                    const col = COLS.find((x) => x.key === k)!;
                    return (
                      <td key={k} className={`td num ${col.right ? "text-right" : ""}`}>
                        {col.fmt(c, cur)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((c) => (
            <Link key={c.key} href={creativeHref(accountId, c.key, sp)} className="card block p-3 hover:border-ink-faint">
              <div className="flex gap-3">
                <Thumb url={c.meta.thumbnailUrl} label={c.meta.creativeName} size={56} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{c.meta.creativeName}</div>
                  <div className="text-[11px] text-ink-muted">
                    {c.meta.platform} · {c.meta.format ?? "—"} · {c.ageDays}d old
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <ClassBadge c={c.classification} />
                    <DecisionBadge d={c.decision} />
                  </div>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-4 gap-1 text-center text-xs">
                <Stat l="Spend" v={fmtMoney(c.window.spend, cur)} />
                <Stat l="ROAS" v={fmtX(c.window.roas)} />
                <Stat l="CPO" v={fmtMoney(c.window.cpo, cur)} />
                <Stat l="Purch." v={fmtNum(c.window.purchases)} />
              </div>
              <p className="mt-2 line-clamp-2 text-xs text-ink-soft">{c.diagnosis.recommendation}</p>
              <div className="mt-1 flex items-center justify-between">
                <ConfidenceBadge c={c.confidence} />
                {c.fatigue.status !== "NOT_APPLICABLE" && c.fatigue.status !== "HEALTHY" && <Pill tone="orange">Fatigue {c.fatigue.status}</Pill>}
              </div>
            </Link>
          ))}
        </div>
      )}
      <div className="flex justify-end">
        <Pager sp={sp} page={page} pages={pages} />
      </div>
    </div>
  );
}

function Stat({ l, v }: { l: string; v: string }) {
  return (
    <div className="rounded-md bg-canvas px-1 py-1">
      <div className="text-[10px] text-ink-muted">{l}</div>
      <div className="num font-semibold">{v}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

function Select({ label, name, value, options }: { label: string; name: string; value: string; options: string[][] }) {
  return (
    <Field label={label}>
      <select name={name} defaultValue={value} className="input max-w-[170px]">
        <option value="">All</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </Field>
  );
}

function Pager({ sp, page, pages }: { sp: SearchParams; page: number; pages: number }) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center gap-1">
      {page > 1 && (
        <Link className="btn py-0.5 text-xs" href={qs(sp, { page: String(page - 1) })}>
          ← Prev
        </Link>
      )}
      {page < pages && (
        <Link className="btn py-0.5 text-xs" href={qs(sp, { page: String(page + 1) })}>
          Next →
        </Link>
      )}
    </div>
  );
}

function ColsSubmit() {
  return (
    <button className="btn py-0.5 text-xs" type="submit" formAction="">
      Apply columns
    </button>
  );
}
