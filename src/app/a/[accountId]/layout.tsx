import { notFound } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { getAccount, listAccounts } from "@/server/accounts";
import { getPool } from "@/lib/db/client";
import { GlobalHeader } from "@/components/GlobalHeader";
import { NavLink } from "@/components/NavLink";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import { Pill } from "@/components/ui";

export const dynamic = "force-dynamic";

const NAV: { group: string; items: { href: string; label: string; n?: string }[] }[] = [
  {
    group: "Observe",
    items: [
      { href: "command-center", label: "Creative Command Center", n: "01" },
      { href: "leaderboard", label: "Creative Leaderboard", n: "02" },
      { href: "timeline", label: "Creative Timeline", n: "03" },
    ],
  },
  {
    group: "Diagnose",
    items: [
      { href: "fatigue", label: "Fatigue & Lifecycle", n: "04" },
      { href: "cohorts", label: "Launch Cohorts", n: "05" },
      { href: "hooks", label: "Hooks & Video", n: "06" },
      { href: "creators", label: "Creators", n: "07" },
      { href: "concepts", label: "Concepts & Angles", n: "08" },
    ],
  },
  {
    group: "Learn",
    items: [
      { href: "actions", label: "Action & Learning", n: "09" },
      { href: "planner", label: "What To Make Next", n: "10" },
    ],
  },
  {
    group: "System",
    items: [
      { href: "import", label: "Import Data" },
      { href: "data-quality", label: "Data Quality" },
      { href: "settings", label: "Account Settings" },
      { href: "windsor", label: "Windsor Connection" },
    ],
  },
];

function freshness(latest: string | null): { label: string; tone: "green" | "yellow" | "red" | "gray" } {
  if (!latest) return { label: "No data", tone: "gray" };
  const days = Math.floor((Date.now() - new Date(latest + "T00:00:00Z").getTime()) / 86_400_000);
  if (days <= 2) return { label: `${days}d old`, tone: "green" };
  if (days <= 7) return { label: `${days}d old`, tone: "yellow" };
  return { label: `${days}d old`, tone: "red" };
}

export default async function AccountLayout({ children, params }: { children: React.ReactNode; params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  const acc = await getAccount(accountId);
  if (!acc) notFound();
  const accounts = await listAccounts();
  const pool = getPool();
  const [status, lastRun] = await Promise.all([
    pool.query(`SELECT source, rows, first_date::text AS first, latest_date::text AS latest, last_imported_at, last_synced_at FROM source_status WHERE account_id=$1`, [accountId]),
    pool.query(`SELECT status, created_at FROM ingestion_runs WHERE account_id=$1 ORDER BY created_at DESC LIMIT 1`, [accountId]),
  ]);
  const file = status.rows.find((r) => r.source === "FILE");
  const windsor = status.rows.find((r) => r.source === "WINDSOR");
  const latest = [file?.latest, windsor?.latest].filter(Boolean).sort().pop() ?? null;
  const mode = file && windsor ? "HYBRID" : windsor ? "WINDSOR" : file ? "FILE" : acc.account.dataMode;
  const fr = freshness(latest);
  const runStatus: string | undefined = lastRun.rows[0]?.status;
  const trust = !latest ? "NO DATA" : runStatus === "FAILED" ? "FAILED" : runStatus === "PARTIAL" ? "PARTIAL" : "VERIFIED IMPORT";

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-3 overflow-y-auto border-r border-line bg-canvas px-3 py-4 lg:flex">
        <Link href="/accounts" className="px-2">
          <div className="text-[13px] font-bold tracking-tight text-ink">CREATIVE INTELLIGENCE OS</div>
          <div className="text-[11px] text-ink-muted">Know what wins. Know why. Know what to make next.</div>
        </Link>
        <AccountSwitcher accounts={accounts.map((a) => ({ id: a.id, name: a.name }))} current={accountId} />
        <nav className="flex flex-col gap-3">
          {NAV.map((g) => (
            <div key={g.group}>
              <div className="label px-2 pb-1">{g.group}</div>
              <div className="flex flex-col">
                {g.items.map((it) => (
                  <Suspense key={it.href} fallback={<span className="px-2 py-1.5 text-[13px] text-ink-soft">{it.label}</span>}>
                    <NavLink href={`/a/${accountId}/${it.href}`}>
                      {it.n && <span className="num w-5 text-[11px] opacity-60">{it.n}</span>}
                      <span>{it.label}</span>
                    </NavLink>
                  </Suspense>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-line bg-white/95 px-4 py-2 backdrop-blur lg:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-ink lg:hidden">{acc.account.name}</span>
              <Pill tone="purple" title="Data mode">{mode}</Pill>
              <span className="text-ink-muted">
                Data through <b className="text-ink">{latest ?? "—"}</b>
              </span>
              <Pill tone={fr.tone}>{fr.label}</Pill>
              <span className="text-ink-muted">Last imported {file?.last_imported_at ? new Date(file.last_imported_at).toISOString().slice(0, 16).replace("T", " ") : "—"}</span>
              <span className="text-ink-muted">Last synced {windsor?.last_synced_at ? new Date(windsor.last_synced_at).toISOString().slice(0, 16).replace("T", " ") : "—"}</span>
              <Pill tone={trust === "VERIFIED IMPORT" ? "green" : trust === "NO DATA" ? "gray" : "yellow"} title="Trust is based on the latest ingestion run and the data-quality checks">
                {trust}
              </Pill>
            </div>
            <Suspense>
              <GlobalHeader dataThrough={latest} defaultRange={acc.settings.defaultAnalysisWindow} defaultCmp={acc.settings.defaultComparisonWindow} />
            </Suspense>
          </div>
          <nav className="mt-2 flex gap-1 overflow-x-auto pb-1 lg:hidden">
            {NAV.flatMap((g) => g.items).map((it) => (
              <Link key={it.href} href={`/a/${accountId}/${it.href}`} className="whitespace-nowrap rounded-md border border-line px-2 py-1 text-xs">
                {it.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="min-w-0 flex-1 px-4 py-5 lg:px-6">{children}</main>
      </div>
    </div>
  );
}
