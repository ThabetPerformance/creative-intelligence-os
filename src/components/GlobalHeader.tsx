"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { COMPARISONS, RANGE_PRESETS } from "@/lib/period";

/**
 * Persistent global analysis header (spec §55–56, §108). State lives in the URL so it survives
 * navigation and links are shareable.
 */
export function GlobalHeader({ dataThrough, defaultRange, defaultCmp }: { dataThrough: string | null; defaultRange: string; defaultCmp: string }) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const range = sp.get("range") ?? defaultRange;
  const cmp = sp.get("cmp") ?? defaultCmp;
  const set = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") q.delete(k);
      else q.set(k, v);
    }
    q.delete("page");
    start(() => router.push(`${pathname}?${q.toString()}`));
  };
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label className="flex items-center gap-1.5">
        <span className="label">Period</span>
        <select className="input py-1" value={range} onChange={(e) => set({ range: e.target.value })}>
          {RANGE_PRESETS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      {range === "custom" && (
        <>
          <input type="date" className="input py-1" value={sp.get("from") ?? ""} onChange={(e) => set({ from: e.target.value })} aria-label="From" />
          <input type="date" className="input py-1" value={sp.get("to") ?? ""} onChange={(e) => set({ to: e.target.value })} aria-label="To" />
        </>
      )}
      <label className="flex items-center gap-1.5">
        <span className="label">As of</span>
        <input type="date" className="input py-1" value={sp.get("asOf") ?? dataThrough ?? ""} max={dataThrough ?? undefined} onChange={(e) => set({ asOf: e.target.value === dataThrough ? null : e.target.value })} />
      </label>
      <label className="flex items-center gap-1.5">
        <span className="label">Compare</span>
        <select className="input py-1" value={cmp} onChange={(e) => set({ cmp: e.target.value })}>
          {COMPARISONS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      {cmp === "custom" && (
        <>
          <input type="date" className="input py-1" value={sp.get("cfrom") ?? ""} onChange={(e) => set({ cfrom: e.target.value })} aria-label="Comparison from" />
          <input type="date" className="input py-1" value={sp.get("cto") ?? ""} onChange={(e) => set({ cto: e.target.value })} aria-label="Comparison to" />
        </>
      )}
      {pending && <span className="text-xs text-ink-muted">Updating…</span>}
    </div>
  );
}
