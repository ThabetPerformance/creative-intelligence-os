import type { Agg, Definitions, Metrics } from "./metrics";
import type { EvidenceResult } from "./evidence";
import type { EconResult } from "./econ";
import type { FatigueResult } from "./fatigue";
import type { PeakAnalysis } from "./peaks";
import type { ScaleAnalysis } from "./scale";
import type { LifecyclePeriod, Milestones } from "./history";
import type { AttentionContext, Flag, TrendInfo, VolumeContext } from "./classify";
import type { TrackingResult } from "./tracking";
import type { DateWindow } from "./dates";
import type {
  Classification,
  Confidence,
  CreativeMeta,
  Decision,
  Diagnosis,
  LifecycleStage,
  Reason,
  ResolvedTarget,
} from "./types";

export type HookMatrixCell = "TRUE_WINNING_HOOK" | "ATTENTION_TRAP" | "HOOK_OPPORTUNITY" | "WEAK";

export interface VideoDropoff {
  stages: { key: string; label: string; rate: number | null; platformMedian: number | null }[];
  weakestStage: "WEAK_OPENING" | "POST_HOOK_DROP" | "MID_VIDEO_DROP" | "CTA_DROP" | null;
  text: string;
}

export interface RankInfo {
  current: number | null;
  previous: number | null;
  peak: number | null;
  weeksInTop10: number;
  firstTop10: string | null;
  lastTop10: string | null;
}

export interface CreativeAnalysis {
  key: string;
  meta: CreativeMeta;
  activeInWindow: boolean;
  windowAgg: Agg;
  window: Metrics;
  comparison: Metrics | null;
  c7: Metrics;
  p7: Metrics;
  c14: Metrics;
  lifetime: Metrics;
  daysLive: number;
  ageDays: number;
  launchDate: string | null;
  evidence: EvidenceResult;
  lifetimeEvidence: EvidenceResult;
  econ: EconResult;
  classification: Classification;
  decision: Decision;
  confidence: Confidence;
  flags: Flag[];
  reasons: Reason[];
  diagnosis: Diagnosis;
  trend: TrendInfo;
  fatigue: FatigueResult;
  peaks: PeakAnalysis;
  scale: ScaleAnalysis;
  tracking: TrackingResult;
  milestones: Omit<Milestones, "killReadyDays">;
  lifecycleStage: LifecycleStage;
  lifecycle: LifecyclePeriod[];
  attention: AttentionContext;
  volume: VolumeContext;
  decisionReadyWaste: number;
  learningSpend: number;
  priorityScore: number;
  commercialScore: number;
  rank: RankInfo;
  hookMatrix: HookMatrixCell | null;
  video: VideoDropoff | null;
  roasVsTarget: number | null;
  cpoVsGuardrail: number | null;
}

export interface AnalysisContext {
  accountId: string;
  currency: string;
  asOf: string;
  dataStart: string | null;
  dataThrough: string | null;
  window: DateWindow;
  comparisonWindow: DateWindow | null;
  comparisonKind: string;
  target: ResolvedTarget;
  evidenceSpend: number;
  minPurchases: number;
  minDaysLive: number;
  freshnessWindowDays: number;
  definitions: Definitions;
  labels: { cvr: string; ctr: string; hook: string; hold: string };
}
