import Link from "next/link";
import type { ReactNode } from "react";
import { CLASSIFICATION_LABEL, DECISION_LABEL, type Classification, type Confidence, type Decision } from "@/engine/types";

// ---------------------------------------------------------------- formatting
export function fmtMoney(v: number | null | undefined, cur: string, digits?: number): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const d = digits ?? (Math.abs(v) >= 1000 ? 0 : Math.abs(v) >= 100 ? 0 : 2);
  const s = Math.abs(v) >= 1_000_000 ? `${(v / 1_000_000).toFixed(2)}M` : Math.abs(v) >= 10_000 ? `${(v / 1000).toFixed(1)}k` : v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  return `${cur} ${s}`;
}
export function fmtNum(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  if (Math.abs(v) >= 10_000) return `${(v / 1000).toFixed(1)}k`;
  return v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
export function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}
export function fmtX(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${v.toFixed(digits)}x`;
}
export function fmtDelta(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const p = (v * 100).toFixed(digits);
  return `${v >= 0 ? "+" : ""}${p}%`;
}
/** Explicit UNAVAILABLE marker for missing metrics (never 0). */
export function Unavail({ value, children }: { value: unknown; children: ReactNode }) {
  if (value === null || value === undefined) return <span className="text-[11px] font-medium uppercase tracking-wide text-ink-faint" title="Metric not reported by the source">n/a</span>;
  return <>{children}</>;
}

// ---------------------------------------------------------------- status colours (spec §147)
export type Tone = "green" | "yellow" | "orange" | "red" | "purple" | "gray";
export const TONE: Record<Tone, string> = {
  green: "bg-win-bg text-win border-win-line",
  yellow: "bg-watch-bg text-watch border-watch-line",
  orange: "bg-fix-bg text-fix border-fix-line",
  red: "bg-kill-bg text-kill border-kill-line",
  purple: "bg-base-bg text-base border-base-line",
  gray: "bg-hist-bg text-hist border-hist-line",
};
export const TONE_HEX: Record<Tone, string> = {
  green: "#15803d",
  yellow: "#ca8a04",
  orange: "#ea580c",
  red: "#dc2626",
  purple: "#7c3aed",
  gray: "#9ca3af",
};

export function classTone(c: Classification): Tone {
  switch (c) {
    case "PROVEN_WINNER":
    case "SCALE_CANDIDATE":
    case "VOLUME_WINNER":
    case "EMERGING_WINNER":
    case "HIDDEN_WINNER":
      return "green";
    case "FATIGUE_WATCH":
    case "NEW_LEARNING":
      return "yellow";
    case "HOOK_OPPORTUNITY":
    case "ATTENTION_WINNER":
    case "RECOVERABLE":
    case "FATIGUED_WINNER":
    case "LOSER":
      return "orange";
    case "KILL_CANDIDATE":
    case "TRACKING_RISK":
      return "red";
    default:
      return "gray";
  }
}

export function decisionTone(d: Decision): Tone {
  if (d === "SCALE" || d === "CONTROLLED_SCALE" || d === "PROTECT" || d === "TEST_SCALE") return "green";
  if (d === "HOLD" || d === "VALIDATE") return "yellow";
  if (d === "KILL") return "red";
  if (d === "NO_ACTION") return "gray";
  return "orange";
}

export function Pill({ tone, children, title }: { tone: Tone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${TONE[tone]}`}>
      {children}
    </span>
  );
}

export function ClassBadge({ c }: { c: Classification }) {
  return <Pill tone={classTone(c)}>{CLASSIFICATION_LABEL[c]}</Pill>;
}
export function DecisionBadge({ d }: { d: Decision }) {
  return <Pill tone={decisionTone(d)}>{DECISION_LABEL[d]}</Pill>;
}
export function ConfidenceBadge({ c }: { c: Confidence }) {
  const tone: Tone = c === "HIGH" ? "purple" : c === "MEDIUM" ? "gray" : "yellow";
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${tone === "purple" ? "text-base" : tone === "yellow" ? "text-watch" : "text-ink-muted"}`} title="Confidence: sample size, measurement quality, consistency across windows and history">
      <span className="flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className={`h-2.5 w-1 rounded-sm ${i < (c === "HIGH" ? 3 : c === "MEDIUM" ? 2 : 1) ? "bg-current" : "bg-line"}`} />
        ))}
      </span>
      {c}
    </span>
  );
}
export function StatusTag({ s }: { s: "FACT" | "HYPOTHESIS" | "VALIDATED_FINDING" | string }) {
  const tone: Tone = s === "FACT" ? "gray" : s === "HYPOTHESIS" ? "yellow" : "purple";
  return <Pill tone={tone}>{s.replace("_", " ")}</Pill>;
}

// ---------------------------------------------------------------- layout primitives
export function Card({ title, question, children, right, className = "" }: { title?: ReactNode; question?: string; children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <section className={`card p-4 ${className}`}>
      {(title || question || right) && (
        <header className="mb-3 flex items-start justify-between gap-3">
          <div>
            {question && <h3 className="h2">{question}</h3>}
            {title && <div className={question ? "sub mt-0.5" : "h2"}>{title}</div>}
          </div>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value, sub, tone, href, big }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; href?: string; big?: boolean }) {
  const body = (
    <div className={`card h-full p-3 ${href ? "transition hover:border-ink-faint" : ""}`}>
      <div className="flex items-center gap-1.5">
        {tone && <span className="h-2 w-2 rounded-full" style={{ background: TONE_HEX[tone] }} />}
        <span className="label">{label}</span>
      </div>
      <div className={`num mt-1 font-semibold tracking-tight text-ink ${big ? "text-2xl" : "text-lg"}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ink-muted">{sub}</div>}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

export function PageHeader({ title, question, children }: { title: string; question?: string; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="h1">{title}</h1>
        {question && <p className="sub mt-0.5">{question}</p>}
      </div>
      {children}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center justify-center gap-2 p-10 text-center">
      <div className="h2">{title}</div>
      {children && <div className="sub max-w-lg">{children}</div>}
    </div>
  );
}

export function Thumb({ url, label, size = 40 }: { url: string | null; label: string; size?: number }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-md border border-line object-cover" style={{ width: size, height: size }} loading="lazy" />;
  }
  const initials = label
    .split(/[\s—-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  let h = 0;
  for (const ch of label) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return (
    <div className="flex shrink-0 items-center justify-center rounded-md border border-line text-[10px] font-bold text-ink-soft" style={{ width: size, height: size, background: `hsl(${h} 30% 94%)` }} title="No media URL provided">
      {initials}
    </div>
  );
}

export function Bar({ value, max, tone = "gray" }: { value: number; max: number; tone?: Tone }) {
  const w = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-full rounded-full bg-line-soft">
      <div className="h-1.5 rounded-full" style={{ width: `${w}%`, background: TONE_HEX[tone] }} />
    </div>
  );
}
