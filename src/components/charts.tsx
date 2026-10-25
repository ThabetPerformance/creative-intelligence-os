"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { TIMELINE_METRICS } from "@/lib/timeline-metrics";

/**
 * Chart primitives. One measure per chart (no dual axes); thin marks; recessive grid; text in ink
 * tokens; status colours only for status. Every chart has a hover tooltip.
 */

const INK_MUTED = "#6b7280";
const GRID = "#eef0f2";
const SERIES = "#374151";
const ACCENT = "#2563eb";
const tick = { fontSize: 11, fill: INK_MUTED };

function Tip({ active, payload, label, fmt, labelFmt }: { active?: boolean; payload?: { name?: string; value?: number | null; color?: string; dataKey?: string }[]; label?: string | number; fmt: (v: number | null | undefined, key?: string) => string; labelFmt?: (l: string | number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs shadow-sm">
      <div className="mb-0.5 font-semibold text-ink">{labelFmt ? labelFmt(label ?? "") : label}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-1.5 text-ink-soft">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span>{p.name}</span>
          <b className="num ml-auto pl-3 text-ink">{fmt(p.value, p.dataKey)}</b>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- portfolio map
export interface MapPoint {
  key: string;
  name: string;
  x: number; // spend
  y: number | null; // roas
  z: number; // purchases
  cls: string;
  color: string;
  href: string;
}

export function PortfolioMap({ points, targetRoas, currency, legend }: { points: MapPoint[]; targetRoas: number; currency: string; legend: { label: string; color: string }[] }) {
  const data = points.filter((p) => p.y !== null && p.x > 0);
  const groups = useMemo(() => {
    const m = new Map<string, MapPoint[]>();
    for (const p of data) {
      if (!m.has(p.color)) m.set(p.color, []);
      m.get(p.color)!.push(p);
    }
    return [...m.entries()];
  }, [data]);
  const yMax = Math.max(targetRoas * 2, ...data.map((d) => Math.min(d.y ?? 0, targetRoas * 4)));
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-3 text-xs text-ink-soft">
        {legend.map((l) => (
          <span key={l.label} className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />
            {l.label}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="h-0 w-4 border-t-2 border-dashed border-ink-muted" /> Target ROAS {targetRoas.toFixed(2)}x
        </span>
      </div>
      <div className="h-72">
        <ResponsiveContainer>
          <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid stroke={GRID} />
            <XAxis type="number" dataKey="x" name="Spend" scale="log" domain={["auto", "auto"]} tick={tick} tickFormatter={(v) => compact(v)} label={{ value: `Spend (${currency}, log)`, position: "insideBottom", offset: -4, fontSize: 11, fill: INK_MUTED }} />
            <YAxis type="number" dataKey="y" name="ROAS" domain={[0, Math.ceil(yMax)]} allowDataOverflow tick={tick} tickFormatter={(v) => `${v}x`} width={40} />
            <ZAxis type="number" dataKey="z" range={[40, 320]} name="Purchases" />
            <ReferenceLine y={targetRoas} stroke={INK_MUTED} strokeDasharray="4 4" />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                const p = active && payload?.[0]?.payload ? (payload[0].payload as MapPoint) : null;
                if (!p) return null;
                return (
                  <div className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs shadow-sm">
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-ink-muted">{p.cls}</div>
                    <div className="num">
                      Spend {currency} {compact(p.x)} · ROAS {p.y?.toFixed(2)}x · {p.z} purchases
                    </div>
                  </div>
                );
              }}
            />
            {groups.map(([color, pts]) => (
              <Scatter key={color} data={pts} fill={color} fillOpacity={0.8} stroke="#fff" strokeWidth={1.5} onClick={(d: unknown) => {
                const h = (d as { payload?: MapPoint })?.payload?.href;
                if (h) window.location.href = h;
              }} style={{ cursor: "pointer" }} />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function compact(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (a >= 1000) return `${(v / 1000).toFixed(a >= 10_000 ? 0 : 1)}k`;
  return a >= 100 ? v.toFixed(0) : v.toFixed(a >= 10 ? 0 : 1);
}

// ---------------------------------------------------------------- simple bar / line
export function MiniBars({ data, x, y, fmt, height = 160, color = SERIES, refY }: { data: Record<string, unknown>[]; x: string; y: string; fmt: "pct" | "money" | "num"; height?: number; color?: string; refY?: number }) {
  const f = (v: number | null | undefined) => (v === null || v === undefined ? "—" : fmt === "pct" ? `${(v * 100).toFixed(0)}%` : compact(v));
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey={x} tick={tick} interval="preserveStartEnd" tickLine={false} />
          <YAxis tick={tick} tickFormatter={(v) => f(v)} width={40} tickLine={false} axisLine={false} />
          {refY !== undefined && <ReferenceLine y={refY} stroke={INK_MUTED} strokeDasharray="4 4" />}
          <Tooltip cursor={{ fill: "#f3f4f6" }} content={<Tip fmt={(v) => f(v)} />} />
          <Bar dataKey={y} name={y} fill={color} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------- creative timeline
export interface TlPoint {
  date: string;
  day: number;
  [k: string]: number | string | null;
}
export interface TlMarker {
  date: string;
  day: number;
  label: string;
  type: string;
}
export interface TlPhase {
  phase: string;
  from: string;
  to: string;
}

const PHASE_FILL: Record<string, string> = {
  LAUNCH: "#f3f4f6",
  LEARNING: "#f3f4f6",
  BREAKOUT: "#ecfdf3",
  SCALING: "#ecfdf3",
  STABLE: "#f8fafc",
  DECAY: "#fefce8",
  FATIGUE: "#fff7ed",
};

const METRIC_DEFS: Record<string, { label: string; fmt: (v: number | null | undefined, cur: string) => string; ref?: string }> = {
  spend: { label: "Spend", fmt: (v, c) => (v == null ? "—" : `${c} ${compact(v)}`) },
  roas: { label: "ROAS (daily)", fmt: (v) => (v == null ? "—" : `${v.toFixed(2)}x`), ref: "targetRoas" },
  roas7: { label: "ROAS (rolling 7D)", fmt: (v) => (v == null ? "—" : `${v.toFixed(2)}x`), ref: "targetRoas" },
  roas3: { label: "ROAS (rolling 3D)", fmt: (v) => (v == null ? "—" : `${v.toFixed(2)}x`), ref: "targetRoas" },
  cpo7: { label: "CPO (rolling 7D)", fmt: (v, c) => (v == null ? "—" : `${c} ${v.toFixed(2)}`), ref: "cpoGuardrail" },
  cpo: { label: "CPO (daily)", fmt: (v, c) => (v == null ? "—" : `${c} ${v.toFixed(2)}`), ref: "cpoGuardrail" },
  purchases: { label: "Purchases", fmt: (v) => (v == null ? "—" : v.toFixed(0)) },
  purchases7: { label: "Purchases (rolling 7D)", fmt: (v) => (v == null ? "—" : v.toFixed(0)) },
  cvr7: { label: "CVR (rolling 7D)", fmt: (v) => (v == null ? "—" : `${(v * 100).toFixed(2)}%`) },
  cvr: { label: "CVR (daily)", fmt: (v) => (v == null ? "—" : `${(v * 100).toFixed(2)}%`) },
  ctr: { label: "CTR", fmt: (v) => (v == null ? "—" : `${(v * 100).toFixed(2)}%`) },
  cpm: { label: "CPM", fmt: (v, c) => (v == null ? "—" : `${c} ${v.toFixed(2)}`) },
  frequency: { label: "Frequency", fmt: (v) => (v == null ? "—" : v.toFixed(2)) },
  hookRate: { label: "Hook rate", fmt: (v) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`) },
  holdRate: { label: "Hold rate", fmt: (v) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`) },
  aov: { label: "AOV", fmt: (v, c) => (v == null ? "—" : `${c} ${v.toFixed(2)}`) },
};



/**
 * Creative timeline (spec §58–67): stacked small multiples sharing one x-axis (calendar date or
 * days since launch). Each panel has a single y-scale; targets are date-aware step lines.
 */
export function CreativeTimelineChart({ points, markers, phases, currency, axis, initial = ["spend", "roas7", "cpo7", "cvr7"] }: { points: TlPoint[]; markers: TlMarker[]; phases: TlPhase[]; currency: string; axis: "calendar" | "launch"; initial?: string[] }) {
  const [metrics, setMetrics] = useState<string[]>(initial);
  const xKey = axis === "launch" ? "day" : "date";
  const markerX = (m: TlMarker) => (axis === "launch" ? m.day : m.date);
  const toggle = (k: string) => setMetrics((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {TIMELINE_METRICS.map((k) => (
          <button key={k} onClick={() => toggle(k)} className={`rounded-md border px-2 py-0.5 text-xs ${metrics.includes(k) ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-soft hover:bg-canvas"}`}>
            {METRIC_DEFS[k].label}
          </button>
        ))}
      </div>
      <div className="space-y-1">
        {metrics.map((k, i) => {
          const def = METRIC_DEFS[k];
          const isBar = k === "spend" || k === "purchases";
          const last = i === metrics.length - 1;
          const common = (
            <>
              <CartesianGrid stroke={GRID} vertical={false} />
              {phases.map((p, j) => {
                const a = axis === "launch" ? points.find((x) => x.date === p.from)?.day : p.from;
                const b = axis === "launch" ? points.find((x) => x.date === p.to)?.day : p.to;
                return a !== undefined && b !== undefined ? <ReferenceArea key={j} x1={a} x2={b} fill={PHASE_FILL[p.phase] ?? "#f8fafc"} fillOpacity={0.9} ifOverflow="hidden" /> : null;
              })}
              <XAxis dataKey={xKey} tick={last ? tick : false} height={last ? 24 : 4} interval="preserveStartEnd" minTickGap={40} tickLine={false} tickFormatter={(v) => (axis === "launch" ? `D${v}` : String(v).slice(5))} />
              <YAxis tick={tick} width={52} tickLine={false} axisLine={false} tickFormatter={(v) => def.fmt(v, "").trim()} />
              {markers.map((m, j) => (
                <ReferenceLine key={j} x={markerX(m)} stroke="#c7cbd1" strokeDasharray="2 3" label={i === 0 ? { value: m.label, position: "insideTopLeft", fontSize: 9, fill: INK_MUTED, angle: -90, offset: 8 } : undefined} />
              ))}
              <Tooltip content={<Tip fmt={(v, key) => (key && METRIC_DEFS[key] ? METRIC_DEFS[key].fmt(v, currency) : key && key.startsWith("target") ? (v == null ? "—" : `${v}`) : String(v))} labelFmt={(l) => (axis === "launch" ? `Day ${l}` : String(l))} />} />
            </>
          );
          return (
            <div key={k}>
              <div className="flex items-center justify-between">
                <span className="label">{def.label}</span>
                {def.ref && <span className="text-[10px] text-ink-faint">dashed = {def.ref === "targetRoas" ? "target ROAS active on that date" : "CPO guardrail active on that date"}</span>}
              </div>
              <div className={last ? "h-36" : "h-28"}>
                <ResponsiveContainer>
                  {isBar ? (
                    <BarChart data={points} syncId="tl" margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barCategoryGap={1}>
                      {common}
                      <Bar dataKey={k} name={def.label} fill={SERIES} radius={[2, 2, 0, 0]} isAnimationActive={false} />
                    </BarChart>
                  ) : (
                    <LineChart data={points} syncId="tl" margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                      {common}
                      {def.ref && <Line type="stepAfter" dataKey={def.ref} name={def.ref === "targetRoas" ? "Target ROAS" : "CPO guardrail"} stroke={INK_MUTED} strokeDasharray="4 4" dot={false} strokeWidth={1.5} isAnimationActive={false} />}
                      <Line type="monotone" dataKey={k} name={def.label} stroke={ACCENT} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
                    </LineChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-ink-muted">
        {Object.entries(PHASE_FILL)
          .filter(([p]) => phases.some((x) => x.phase === p))
          .map(([p, c]) => (
            <span key={p} className="flex items-center gap-1">
              <span className="h-2.5 w-4 rounded-sm border border-line" style={{ background: c }} />
              {p}
            </span>
          ))}
        <span>Gaps in lines = no delivery that day (ratios are unavailable, not zero).</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- multi-creative comparison
const CAT = ["#2563eb", "#d97706", "#059669", "#db2777", "#7c3aed", "#0891b2"];

export function CompareChart({ series, metric, currency, axis }: { series: { key: string; name: string; href: string; points: TlPoint[] }[]; metric: string; currency: string; axis: "calendar" | "launch" }) {
  const def = METRIC_DEFS[metric] ?? METRIC_DEFS.roas7;
  const xKey = axis === "launch" ? "day" : "date";
  const merged = useMemo(() => {
    const m = new Map<string | number, Record<string, unknown>>();
    series.forEach((s, i) => {
      for (const p of s.points) {
        const x = p[xKey] as string | number;
        if (!m.has(x)) m.set(x, { [xKey]: x });
        m.get(x)![`s${i}`] = p[metric];
      }
    });
    return [...m.values()].sort((a, b) => (a[xKey]! < b[xKey]! ? -1 : 1));
  }, [series, metric, xKey]);
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-3 text-xs">
        {series.map((s, i) => (
          <Link key={s.key} href={s.href} className="flex items-center gap-1 hover:underline">
            <span className="h-0 w-4 border-t-2" style={{ borderColor: CAT[i % CAT.length] }} />
            {s.name}
          </Link>
        ))}
      </div>
      <div className="h-80">
        <ResponsiveContainer>
          <LineChart data={merged} margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey={xKey} tick={tick} interval="preserveStartEnd" minTickGap={40} tickFormatter={(v) => (axis === "launch" ? `D${v}` : String(v).slice(5))} />
            <YAxis tick={tick} width={52} tickFormatter={(v) => def.fmt(v, "").trim()} />
            <Tooltip content={<Tip fmt={(v) => def.fmt(v, currency)} labelFmt={(l) => (axis === "launch" ? `Day ${l}` : String(l))} />} />
            {series.map((s, i) => (
              <Line key={s.key} dataKey={`s${i}`} name={s.name} stroke={CAT[i % CAT.length]} strokeWidth={2} dot={false} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
