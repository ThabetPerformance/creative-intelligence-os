import type { Metrics } from "./metrics";
import { assessEconomics, isFailure, tierAtLeast, type EconResult, type EngineConfig } from "./econ";
import type { EvidenceResult } from "./evidence";
import type { FatigueResult } from "./fatigue";
import type { ScaleAnalysis } from "./scale";
import type { TrackingResult } from "./tracking";
import type { Milestones } from "./history";
import type {
  Classification,
  Confidence,
  Decision,
  Diagnosis,
  Reason,
  ResolvedTarget,
  TrendLabel,
} from "./types";
import { CLASSIFICATION_LABEL } from "./types";

export interface AttentionContext {
  hookPct: number | null;
  holdPct: number | null;
  ctrPct: number | null;
  cvrPct: number | null;
  cpcPct: number | null;
  aovPct: number | null;
  /** Mean of available hook / CTR / hold percentiles. */
  composite: number | null;
  baselineScope: string;
  medianCvr: number | null;
  medianHook: number | null;
  medianCtr: number | null;
}

export interface VolumeContext {
  spendShare: number;
  purchaseShare: number;
  purchasePct: number | null;
  tier: "HIGH" | "MEDIUM" | "LOW";
  eligibleCount: number;
  accountMedianRoas: number | null;
}

export interface TrendInfo {
  label: TrendLabel;
  roas7dChange: number | null;
  roas14dChange: number | null;
  purchases7dChange: number | null;
  spend7dChange: number | null;
}

export interface ClassifyInput {
  win: Metrics;
  c7: Metrics;
  p7: Metrics;
  c14: Metrics;
  p14: Metrics;
  lifetime: Metrics;
  daysLive: number;
  target: ResolvedTarget;
  evidenceSpend: number;
  minPurchases: number;
  minDaysLive: number;
  freshnessWindowDays: number;
  evidence: EvidenceResult;
  lifetimeEvidence: EvidenceResult;
  tracking: TrackingResult;
  fatigue: FatigueResult;
  scale: ScaleAnalysis;
  milestones: Milestones;
  attention: AttentionContext;
  volume: VolumeContext;
  trend: TrendInfo;
  asOf: string;
  currency: string;
  cvrLabel: string;
  cfg: EngineConfig;
}

export type Flag =
  | "HOOK_OPPORTUNITY"
  | "PROMISING_LOW_SAMPLE"
  | "SCALE_TOLERANT"
  | "REUSABLE_HOOK"
  | "REUSABLE_CONVERSION_CORE"
  | "HIGH_CONCENTRATION"
  | "WAS_WINNER"
  | "TRACKING_FLAGS";

export interface ClassifyResult {
  classification: Classification;
  decision: Decision;
  confidence: Confidence;
  flags: Flag[];
  econ: EconResult;
  reasons: Reason[];
  diagnosis: Diagnosis;
  priorityScore: number;
  commercialScore: number;
}

const CLASS_WEIGHT: Record<Classification, number> = {
  KILL_CANDIDATE: 92,
  FATIGUED_WINNER: 88,
  SCALE_CANDIDATE: 86,
  PROVEN_WINNER: 84,
  VOLUME_WINNER: 82,
  TRACKING_RISK: 80,
  HIDDEN_WINNER: 78,
  EMERGING_WINNER: 76,
  LOSER: 74,
  FATIGUE_WATCH: 72,
  HOOK_OPPORTUNITY: 66,
  ATTENTION_WINNER: 64,
  RECOVERABLE: 60,
  NEW_LEARNING: 30,
  INSUFFICIENT_DATA: 20,
};

export function trendFrom(c7: Metrics, p7: Metrics, c14: Metrics, p14: Metrics, evidenceSpend: number): TrendInfo {
  const ch = (a: number | null, b: number | null) => (a === null || b === null || b === 0 ? null : a / b - 1);
  const roas7 = c7.spend >= evidenceSpend * 0.25 && p7.spend >= evidenceSpend * 0.25 ? ch(c7.roas, p7.roas) : null;
  const roas14 = c14.spend >= evidenceSpend * 0.4 && p14.spend >= evidenceSpend * 0.4 ? ch(c14.roas, p14.roas) : null;
  const ref = roas7 ?? roas14;
  const label: TrendLabel = ref === null ? "INSUFFICIENT" : ref >= 0.1 ? "IMPROVING" : ref <= -0.1 ? "DECLINING" : "STABLE";
  return { label, roas7dChange: roas7, roas14dChange: roas14, purchases7dChange: ch(c7.purchases, p7.purchases), spend7dChange: ch(c7.spend, p7.spend) };
}

const num = (v: number | null) => (v === null ? "UNAVAILABLE" : String(Math.round(v * 10) / 10));
const pct = (v: number | null, digits = 0) => (v === null ? "UNAVAILABLE" : `${(v * 100).toFixed(digits)}%`);
const signed = (v: number | null) => (v === null ? "UNAVAILABLE" : `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`);
const x2 = (v: number | null) => (v === null ? "UNAVAILABLE" : `${v.toFixed(2)}x`);
const money = (v: number | null, cur: string) => (v === null ? "UNAVAILABLE" : `${cur} ${v >= 100 ? Math.round(v).toLocaleString("en-US") : v.toFixed(2)}`);
const rankText = (p: number | null) => (p === null ? "UNAVAILABLE" : p >= 0.5 ? `top ${Math.max(1, Math.round((1 - p) * 100))}%` : `bottom ${Math.max(1, Math.round(p * 100))}%`);

/**
 * The classification + decision engine (spec §24–35, §89–92).
 * Order of checks matters: measurement first, then sample size, then historical-winner fatigue,
 * then commercial outcome with volume, and only then attention diagnostics.
 */
export function classifyCreative(i: ClassifyInput): ClassifyResult {
  const { cfg, attention: att, volume: vol } = i;
  const econ = assessEconomics(i.win, i.target, cfg, i.tracking.roasUnreliable);
  const econC7 = assessEconomics(i.c7, i.target, cfg, i.tracking.roasUnreliable);
  const econP7 = assessEconomics(i.p7, i.target, cfg, i.tracking.roasUnreliable);
  const econC14 = assessEconomics(i.c14, i.target, cfg, i.tracking.roasUnreliable);
  const econLife = assessEconomics(i.lifetime, i.target, cfg, i.tracking.roasUnreliable);
  const econP14 = assessEconomics(i.p14, i.target, cfg, i.tracking.roasUnreliable);
  const flags: Flag[] = [];
  const reasons: Reason[] = [];
  const E = i.evidence;
  const hi = cfg.highPct;
  const lo = cfg.lowPct;
  const wasWinner = !!i.milestones.firstWinnerDate && i.milestones.firstWinnerDate <= addDaysIso(i.asOf, -7);
  if (wasWinner) flags.push("WAS_WINNER");
  if (i.tracking.flags.length) flags.push("TRACKING_FLAGS");

  reasons.push({ text: E.text, status: "FACT" });
  reasons.push({
    text: `ROAS ${x2(i.win.roas)} vs target ${x2(i.target.targetRoas)} (${econ.roasRatio === null ? "UNAVAILABLE" : signed(econ.roasRatio - 1)}); CPO ${money(i.win.cpo, i.currency)} vs guardrail ${money(i.target.cpoGuardrail, i.currency)}.`,
    status: "FACT",
  });

  let classification: Classification;
  let decision: Decision;

  const young = i.daysLive <= i.freshnessWindowDays + cfg.emergingExtraDays;
  const strong = econ.tier === "STRONG";
  const acceptable = tierAtLeast(econ.tier, "ACCEPTABLE");
  const growth =
    (i.trend.purchases7dChange !== null && i.trend.purchases7dChange >= 0.2) ||
    (i.trend.spend7dChange !== null && i.trend.spend7dChange >= 0.2 && tierAtLeast(econC7.tier, "ACCEPTABLE"));
  const improving = i.trend.label === "IMPROVING" || (i.trend.label !== "DECLINING" && growth);
  const hookWeak = att.hookPct !== null && att.hookPct <= lo;
  const attentionLow = att.composite !== null && att.composite <= lo;
  const attentionHigh = att.composite !== null && att.composite >= hi && ((att.hookPct ?? 0) >= 0.6 || (att.ctrPct ?? 0) >= hi);
  const convWeak = att.cvrPct !== null && att.cvrPct <= 0.4;
  const convStrong = att.cvrPct !== null && att.cvrPct >= 0.6;
  const spendShareLow = vol.spendShare < Math.max(0.02, vol.eligibleCount > 0 ? 1.5 / vol.eligibleCount : 0.02);

  if (i.tracking.roasUnreliable) {
    classification = "TRACKING_RISK";
    decision = "VALIDATE";
    for (const f of i.tracking.flags) reasons.push(f);
    reasons.push({
      text: `ROAS not trusted. Fallback: ${i.win.purchases ?? "UNAVAILABLE"} purchases, CPO ${money(i.win.cpo, i.currency)}, CVR ${pct(i.win.cvr, 2)} (${i.cvrLabel}).`,
      status: "FACT",
    });
  } else if (i.daysLive < i.minDaysLive && E.level !== "HIGH") {
    classification = "NEW_LEARNING";
    decision = "HOLD";
    reasons.push({ text: `Only ${i.daysLive} days live (minimum ${i.minDaysLive}). Too early to judge.`, status: "FACT" });
    if (strong && (i.win.purchases ?? 0) > 0) flags.push("PROMISING_LOW_SAMPLE");
  } else if (E.level === "LOW") {
    classification = young ? "NEW_LEARNING" : "INSUFFICIENT_DATA";
    decision = young ? "HOLD" : "NO_ACTION";
    if ((econ.roasRatio ?? 0) >= 1.5 && (i.win.purchases ?? 0) > 0) {
      flags.push("PROMISING_LOW_SAMPLE");
      reasons.push({
        text: `${x2(i.win.roas)} ROAS on only ${num(i.win.purchases)} purchase(s) — below the ${i.minPurchases}-purchase evidence threshold. Promising, but not proven: small samples produce extreme ROAS by chance.`,
        status: "FACT",
      });
    }
  } else if (wasWinner && (i.fatigue.status === "MATERIAL" || i.fatigue.status === "SEVERE") && i.fatigue.adequateSample) {
    classification = "FATIGUED_WINNER";
    decision = "REFRESH";
    reasons.push({ text: i.fatigue.text, status: "FACT" });
  } else if (wasWinner && (i.fatigue.status === "WATCH" || i.fatigue.status === "MATERIAL" || i.fatigue.status === "SEVERE")) {
    classification = "FATIGUE_WATCH";
    decision = "HOLD";
    reasons.push({ text: i.fatigue.text, status: "FACT" });
  } else if (acceptable && young && improving && !(strong && E.level === "HIGH" && attentionLow)) {
    classification = "EMERGING_WINNER";
    decision = "TEST_SCALE";
    reasons.push({ text: `${i.daysLive} days live with ${i.trend.label.toLowerCase()} trend and growing volume.`, status: "FACT" });
  } else if (strong && E.level === "HIGH") {
    if (attentionLow && !convWeak) {
      classification = "HIDDEN_WINNER";
      decision = "ITERATE_HOOK";
      flags.push("HOOK_OPPORTUNITY", "REUSABLE_CONVERSION_CORE");
      reasons.push({ text: `Commercially strong while attention is weak (attention ${rankText(att.composite)} of ${att.baselineScope}). Do not kill on CTR.`, status: "FACT" });
    } else if (spendShareLow && i.trend.label !== "DECLINING" && i.scale.evidence !== "SCALE_FRAGILE") {
      classification = "SCALE_CANDIDATE";
      decision = "CONTROLLED_SCALE";
      reasons.push({ text: `Strong economics on only ${pct(vol.spendShare, 1)} of spend — headroom to earn more budget.`, status: "FACT" });
    } else if (vol.tier === "HIGH" && (vol.accountMedianRoas === null || (i.win.roas ?? 0) >= vol.accountMedianRoas)) {
      classification = "PROVEN_WINNER";
      decision =
        (i.scale.evidence === "SCALE_TOLERANT" || i.scale.evidence === "PROVEN_AT_SCALE") && i.trend.label !== "DECLINING" && vol.spendShare < 0.25
          ? "CONTROLLED_SCALE"
          : "PROTECT";
    } else if (vol.tier !== "HIGH" && i.trend.label !== "DECLINING" && i.scale.evidence !== "SCALE_FRAGILE") {
      classification = "SCALE_CANDIDATE";
      decision = "CONTROLLED_SCALE";
      reasons.push({ text: `Strong economics with ${vol.tier.toLowerCase()} volume — room to earn more budget.`, status: "FACT" });
    } else if (vol.tier === "HIGH") {
      classification = "VOLUME_WINNER";
      decision = "PROTECT";
    } else {
      classification = "PROVEN_WINNER";
      decision = "PROTECT";
    }
    if (hookWeak && classification !== "HIDDEN_WINNER") flags.push("HOOK_OPPORTUNITY");
  } else if (acceptable && E.level === "HIGH" && vol.tier === "HIGH") {
    classification = "VOLUME_WINNER";
    decision = "PROTECT";
    reasons.push({ text: `Carries ${pct(vol.purchaseShare, 1)} of account purchases at near-target economics.`, status: "FACT" });
  } else if (strong && E.level === "MEDIUM") {
    if (hookWeak || attentionLow) {
      classification = "HOOK_OPPORTUNITY";
      decision = "ITERATE_HOOK";
      flags.push("REUSABLE_CONVERSION_CORE");
    } else {
      classification = "SCALE_CANDIDATE";
      decision = "TEST_SCALE";
      reasons.push({ text: "Strong economics but only one evidence threshold met — test scale, do not commit budget.", status: "FACT" });
    }
  } else {
    // Weak, near-target or medium-evidence economics.
    const canJudge = E.canJudgeFailure || E.level === "HIGH";
    const failure = isFailure(econ.tier);
    const persistent =
      (isFailure(econC7.tier) && isFailure(econP7.tier) && i.c7.spend >= i.evidenceSpend * 0.3 && i.p7.spend >= i.evidenceSpend * 0.3) ||
      (isFailure(econC14.tier) && isFailure(econP14.tier) && i.c14.spend >= i.evidenceSpend * 0.5 && i.p14.spend >= i.evidenceSpend * 0.3);
    const overwhelming = i.win.spend >= 3 * i.evidenceSpend && (econ.tier === "SEVERE" || (i.win.purchases ?? 0) === 0);
    const strongEl = {
      hook: att.hookPct !== null && att.hookPct >= hi,
      hold: att.holdPct !== null && att.holdPct >= hi,
      ctr: att.ctrPct !== null && att.ctrPct >= hi,
      cvr: att.cvrPct !== null && att.cvrPct >= hi,
    };
    const anyStrong = strongEl.hook || strongEl.hold || strongEl.ctr || strongEl.cvr;

    if (canJudge && attentionHigh && !acceptable && (convWeak || (econ.roasRatio ?? 1) < cfg.belowRoasRatio + 0.1)) {
      classification = "ATTENTION_WINNER";
      decision = strongEl.ctr && convWeak ? "ITERATE_LANDING_ALIGNMENT" : strongEl.hook && !strongEl.hold ? "ITERATE_BODY" : "ITERATE_OFFER";
      flags.push("REUSABLE_HOOK");
      reasons.push({ text: `Strong attention (${rankText(att.composite)} of ${att.baselineScope}) but weak commercial results — not a business winner.`, status: "FACT" });
    } else if (canJudge && failure && (persistent || overwhelming)) {
      classification = "KILL_CANDIDATE";
      decision = "KILL";
      reasons.push({
        text: persistent
          ? `Persistent failure: current 7D ${econC7.tier.toLowerCase()} and previous 7D ${econP7.tier.toLowerCase()}; current 14D ${econC14.tier.toLowerCase()} vs previous 14D ${econP14.tier.toLowerCase()}; lifetime ${econLife.tier.toLowerCase()}.`
          : `Overwhelming evidence: ${money(i.win.spend, i.currency)} spent (≥3× evidence spend) at ${econ.tier.toLowerCase()} economics.`,
        status: "FACT",
      });
      if (anyStrong) flags.push(strongEl.hook || strongEl.ctr ? "REUSABLE_HOOK" : "REUSABLE_CONVERSION_CORE");
    } else if (canJudge && failure && !anyStrong) {
      classification = "LOSER";
      decision = "CUT";
      reasons.push({ text: `Sufficient evidence and economics materially below target (${econ.tier}).`, status: "FACT" });
    } else if (canJudge || E.level === "MEDIUM") {
      classification = "RECOVERABLE";
      if (strongEl.hook && convWeak) decision = "ITERATE_BODY";
      else if (hookWeak && convStrong) decision = "ITERATE_HOOK";
      else if (strongEl.hold && att.ctrPct !== null && att.ctrPct <= lo) decision = "ITERATE_CTA";
      else if (strongEl.ctr && convWeak) decision = "ITERATE_LANDING_ALIGNMENT";
      else if (strongEl.cvr && att.cpcPct !== null && att.cpcPct >= 0.7) decision = "ITERATE_HOOK";
      else if (att.aovPct !== null && att.aovPct <= lo) decision = "ITERATE_OFFER";
      else decision = acceptable ? "HOLD" : "ITERATE_OFFER";
      if (strongEl.hook || strongEl.ctr) flags.push("REUSABLE_HOOK");
      if (strongEl.cvr) flags.push("REUSABLE_CONVERSION_CORE");
      reasons.push({
        text: failure
          ? "Below target, but contains a strong element worth reusing."
          : `Economics ${econ.tier.toLowerCase()} — close enough to target that an iteration can recover it.`,
        status: "FACT",
      });
    } else {
      classification = young ? "NEW_LEARNING" : "INSUFFICIENT_DATA";
      decision = "HOLD";
    }
  }

  if (i.scale.evidence === "SCALE_TOLERANT" || i.scale.evidence === "PROVEN_AT_SCALE") flags.push("SCALE_TOLERANT");
  if (vol.spendShare >= 0.2) flags.push("HIGH_CONCENTRATION");

  const confidence = scoreConfidence(i, classification, econ, econC7, econP7);
  const diagnosis = buildDiagnosis(i, classification, decision, econ, flags);
  const commercialScore = commercialValueScore(i.win.purchases ?? 0, econ.roasRatio, E.level);
  const confNum = confidence === "HIGH" ? 3 : confidence === "MEDIUM" ? 2 : 1;
  const priorityScore = CLASS_WEIGHT[classification] + 40 * Math.sqrt(Math.min(1, vol.spendShare * 4)) + 3 * confNum;
  return { classification, decision, confidence, flags: [...new Set(flags)], econ, reasons, diagnosis, priorityScore, commercialScore };
}

/**
 * Commercial value score used for ranking (spec §73): proven purchase volume weighted by
 * target-relative efficiency, discounted when the sample is not yet sufficient.
 * 6x / 250 purchases vastly outranks 12x / 2 purchases.
 */
export function commercialValueScore(purchases: number, roasRatio: number | null, evidence: "HIGH" | "MEDIUM" | "LOW"): number {
  const eff = Math.max(0, Math.min(2.5, roasRatio ?? 0));
  const factor = evidence === "HIGH" ? 1 : evidence === "MEDIUM" ? 0.6 : 0.25;
  return purchases * eff * factor;
}

function scoreConfidence(i: ClassifyInput, c: Classification, econ: EconResult, c7: EconResult, p7: EconResult): Confidence {
  if (c === "NEW_LEARNING" || c === "INSUFFICIENT_DATA") return "LOW";
  let pts = i.evidence.level === "HIGH" ? 2 : i.evidence.level === "MEDIUM" ? 1 : 0;
  const dir = (t: EconResult["tier"]) => (t === "STRONG" || t === "ACCEPTABLE" ? 1 : t === "UNKNOWN" ? 0 : -1);
  const d0 = dir(econ.tier);
  if (i.c7.spend > 0 && i.p7.spend > 0) {
    if (dir(c7.tier) === d0 && dir(p7.tier) === d0) pts += 1;
    else if (dir(c7.tier) !== d0 && dir(p7.tier) !== d0) pts -= 1;
  }
  if (i.tracking.flags.length === 0) pts += 1;
  else pts -= 1;
  if (i.lifetimeEvidence.level === "HIGH" && i.daysLive >= 3 * i.minDaysLive) pts += 1;
  if (c === "TRACKING_RISK") return pts >= 3 ? "MEDIUM" : "LOW";
  if (c === "FATIGUE_WATCH" && !i.fatigue.adequateSample) pts -= 1;
  return pts >= 4 ? "HIGH" : pts >= 2 ? "MEDIUM" : "LOW";
}

const VALIDATION: Partial<Record<Classification, string>> = {
  SCALE_CANDIDATE: "7 days after the budget step, or until a further minimum-purchase sample accrues",
  PROVEN_WINNER: "Weekly review of 7D ROAS vs target",
  VOLUME_WINNER: "Weekly review; protect CPO guardrail",
  EMERGING_WINNER: "Next 7 days: confirm with a full evidence sample",
  HIDDEN_WINNER: "New hook variants: 7–10 days each against this control",
  HOOK_OPPORTUNITY: "New hook variants: 7–10 days each against this control",
  ATTENTION_WINNER: "Rebuilt variant: until it reaches the evidence spend",
  RECOVERABLE: "Iteration: until it reaches the evidence spend",
  FATIGUE_WATCH: "Re-check in 3–5 days",
  FATIGUED_WINNER: "Refresh variant: 7–10 days vs the fatigued original",
  LOSER: "None — reallocate budget",
  KILL_CANDIDATE: "None — stop spend now",
  TRACKING_RISK: "Fix measurement, then re-evaluate the last 7 days",
};

function buildDiagnosis(i: ClassifyInput, c: Classification, d: Decision, econ: EconResult, flags: Flag[]): Diagnosis {
  const att = i.attention;
  const cur = i.currency;
  const roasTxt =
    econ.roasRatio === null
      ? `ROAS UNAVAILABLE${i.tracking.roasUnreliable ? " (tracking risk)" : ""}`
      : `ROAS ${x2(i.win.roas)} is ${Math.abs(Math.round((econ.roasRatio - 1) * 100))}% ${econ.roasRatio >= 1 ? "above" : "below"} the ${x2(i.target.targetRoas)} target`;
  const cpoTxt =
    econ.cpoRatio === null || i.target.cpoGuardrail === null
      ? ""
      : econ.cpoLowerBound
        ? `; no purchases on ${money(i.win.spend, cur)} spend`
        : `; CPO ${money(i.win.cpo, cur)} is ${Math.abs(Math.round((econ.cpoRatio - 1) * 100))}% ${econ.cpoRatio <= 1 ? "under" : "over"} the ${money(i.target.cpoGuardrail, cur)} guardrail`;
  const commercial = `${roasTxt}${cpoTxt}.`;
  const volume = `${i.win.purchases ?? "UNAVAILABLE"} purchases (${pct(i.volume.purchaseShare, 1)} of account) on ${money(i.win.spend, cur)} (${pct(i.volume.spendShare, 1)} of spend) — ${i.evidence.level} evidence.`;
  const trend =
    i.trend.label === "INSUFFICIENT"
      ? "Trend: not enough recent spend in both 7D windows."
      : `7D ROAS ${signed(i.trend.roas7dChange)} vs previous 7D (${i.trend.label}); purchases ${signed(i.trend.purchases7dChange)}.`;
  const attention =
    att.hookPct === null && att.ctrPct === null
      ? "Attention metrics UNAVAILABLE."
      : `Hook ${pct(i.win.hookRate, 1)} (${rankText(att.hookPct)}), CTR ${pct(i.win.ctr, 2)} (${rankText(att.ctrPct)}), hold ${pct(i.win.holdRate, 1)} (${rankText(att.holdPct)}) vs ${att.baselineScope}.`;
  const conversion =
    i.win.cvr === null
      ? `CVR UNAVAILABLE (${i.cvrLabel}).`
      : `CVR ${pct(i.win.cvr, 2)} (${i.cvrLabel})${att.medianCvr ? `, ${signed(i.win.cvr / att.medianCvr - 1)} vs ${att.baselineScope} median` : ""}.`;

  let reusable: string | null = null;
  let weak: string | null = null;
  let rec = "";
  const strongHook = (att.hookPct ?? 0) >= i.cfg.highPct || (att.ctrPct ?? 0) >= i.cfg.highPct;
  const strongConv = (att.cvrPct ?? 0) >= 0.6;
  switch (c) {
    case "PROVEN_WINNER":
    case "VOLUME_WINNER":
      reusable = "Whole creative: concept, hook and conversion structure";
      weak = flags.includes("HOOK_OPPORTUNITY") ? "Opening hook is below platform norm" : null;
      rec =
        d === "CONTROLLED_SCALE"
          ? "Run a controlled scale test in steps; keep the CPO guardrail as the stop condition."
          : "Protect: keep budget stable, avoid edits that reset learning, and prepare variants before fatigue.";
      break;
    case "SCALE_CANDIDATE":
      reusable = "Conversion structure and offer framing";
      rec = i.scale.earnedBudget
        ? `Controlled scale test toward ~${money(i.scale.earnedBudget.earnedWeeklySpend, cur)}/week (PLANNING ESTIMATE, ${i.scale.earnedBudget.multiple.toFixed(2)}× current). Stop if 7D CPO breaches guardrail.`
        : "Controlled scale test in steps; validate efficiency at each step before the next.";
      break;
    case "EMERGING_WINNER":
      reusable = "Early-winning concept — candidate for variants";
      rec = "Give it room: test scale gradually while evidence accumulates; do not edit.";
      break;
    case "HIDDEN_WINNER":
    case "HOOK_OPPORTUNITY":
      reusable = "Conversion core: body, offer, product and conversion structure";
      weak = "Initial attention (first frame / first 3 seconds)";
      rec = "Preserve the conversion core; test a new first frame, opening line, opening visual and first 3 seconds.";
      break;
    case "ATTENTION_WINNER":
      reusable = "Opening hook / attention mechanism";
      weak = "Promise-to-conversion path (post-hook, offer, landing alignment)";
      rec = "Preserve the first three seconds; rebuild body, offer framing and landing-page alignment. Review traffic quality.";
      break;
    case "RECOVERABLE":
      reusable = strongHook ? "Hook / click motivation" : strongConv ? "Conversion core" : (att.holdPct ?? 0) >= i.cfg.highPct ? "Content holds attention" : null;
      weak =
        d === "ITERATE_BODY"
          ? "Body / offer / landing alignment"
          : d === "ITERATE_HOOK"
            ? "Opening hook / click efficiency"
            : d === "ITERATE_CTA"
              ? "CTA / offer / click motivation"
              : d === "ITERATE_LANDING_ALIGNMENT"
                ? "Promise mismatch, traffic quality or landing page"
                : "Offer / price perception";
      rec = `${weak} is the weakest element — iterate it while keeping ${reusable ?? "the rest of the creative"}.`;
      break;
    case "FATIGUE_WATCH":
      reusable = "Proven concept";
      weak = "Recent efficiency";
      rec = "Monitor daily; brief a refresh now so a replacement is ready if decline continues.";
      break;
    case "FATIGUED_WINNER":
      reusable = "Proven concept and conversion structure";
      weak = "Current execution has worn out";
      rec = "Refresh: new hook/opening and visual treatment on the same concept; shift budget to replacements.";
      break;
    case "LOSER":
      weak = "Commercial outcome";
      rec = "Cut and reallocate budget to proven or emerging creatives.";
      break;
    case "KILL_CANDIDATE":
      reusable = flags.includes("REUSABLE_HOOK") ? "Hook (strong attention despite failure)" : flags.includes("REUSABLE_CONVERSION_CORE") ? "Conversion core" : null;
      weak = "Persistent commercial failure";
      rec = "Kill now. Further spend is decision-ready waste.";
      break;
    case "TRACKING_RISK":
      weak = "Measurement";
      rec = "Validate purchase value and tracking before any budget decision; judge on purchases / CPO / CVR meanwhile.";
      break;
    case "NEW_LEARNING":
      rec = "Let it learn until it reaches the evidence thresholds.";
      break;
    case "INSUFFICIENT_DATA":
      rec = "Not enough spend to judge. Either give it a fair test budget or leave it.";
      break;
  }
  const explanation = [
    `${CLASSIFICATION_LABEL[c]} because: ${i.evidence.level} evidence; economics ${econ.tier.toLowerCase()} vs active target${i.target.source === "TARGETS_HISTORY" ? ` (regime from ${i.target.regimeStart})` : ""}; volume ${i.volume.tier.toLowerCase()}.`,
  ];
  return {
    commercial,
    volume,
    trend,
    attention,
    conversion,
    reusableElement: reusable,
    weakElement: weak,
    recommendation: rec,
    validationWindow: VALIDATION[c] ?? "Re-evaluate after the next import",
    explanation,
  };
}

function addDaysIso(iso: string, days: number): string {
  const t = Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}
