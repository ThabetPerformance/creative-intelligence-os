import type { DayRow, Metrics } from "./metrics";

export const CLASSIFICATIONS = [
  "PROVEN_WINNER",
  "SCALE_CANDIDATE",
  "VOLUME_WINNER",
  "EMERGING_WINNER",
  "HIDDEN_WINNER",
  "HOOK_OPPORTUNITY",
  "ATTENTION_WINNER",
  "RECOVERABLE",
  "FATIGUE_WATCH",
  "FATIGUED_WINNER",
  "LOSER",
  "KILL_CANDIDATE",
  "NEW_LEARNING",
  "INSUFFICIENT_DATA",
  "TRACKING_RISK",
] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

export const CLASSIFICATION_LABEL: Record<Classification, string> = {
  PROVEN_WINNER: "Proven Winner",
  SCALE_CANDIDATE: "Scale Candidate",
  VOLUME_WINNER: "Volume Winner",
  EMERGING_WINNER: "Emerging Winner",
  HIDDEN_WINNER: "Hidden Winner",
  HOOK_OPPORTUNITY: "Hook Opportunity",
  ATTENTION_WINNER: "Attention Winner",
  RECOVERABLE: "Recoverable",
  FATIGUE_WATCH: "Fatigue Watch",
  FATIGUED_WINNER: "Fatigued Winner",
  LOSER: "Loser",
  KILL_CANDIDATE: "Kill Candidate",
  NEW_LEARNING: "New / Learning",
  INSUFFICIENT_DATA: "Insufficient Data",
  TRACKING_RISK: "Tracking Risk",
};

/** Classifications that count as a "winner" for hit rate, shares and lifespan. */
export const WINNER_CLASSES: Classification[] = ["PROVEN_WINNER", "SCALE_CANDIDATE", "VOLUME_WINNER", "HIDDEN_WINNER"];
export const LOSER_CLASSES: Classification[] = ["LOSER", "KILL_CANDIDATE"];

export const DECISIONS = [
  "SCALE",
  "CONTROLLED_SCALE",
  "PROTECT",
  "HOLD",
  "TEST_SCALE",
  "ITERATE_HOOK",
  "ITERATE_BODY",
  "ITERATE_CTA",
  "ITERATE_OFFER",
  "ITERATE_LANDING_ALIGNMENT",
  "REFRESH",
  "RELAUNCH",
  "CUT",
  "KILL",
  "VALIDATE",
  "NO_ACTION",
] as const;
export type Decision = (typeof DECISIONS)[number];

export const DECISION_LABEL: Record<Decision, string> = {
  SCALE: "Scale",
  CONTROLLED_SCALE: "Controlled Scale Test",
  PROTECT: "Protect",
  HOLD: "Hold",
  TEST_SCALE: "Test Scale",
  ITERATE_HOOK: "Iterate Hook",
  ITERATE_BODY: "Iterate Body",
  ITERATE_CTA: "Iterate CTA",
  ITERATE_OFFER: "Iterate Offer",
  ITERATE_LANDING_ALIGNMENT: "Iterate Landing Alignment",
  REFRESH: "Refresh",
  RELAUNCH: "Relaunch",
  CUT: "Cut",
  KILL: "Kill",
  VALIDATE: "Validate",
  NO_ACTION: "No Action",
};

export type Confidence = "HIGH" | "MEDIUM" | "LOW";
export type EvidenceLevel = "HIGH" | "MEDIUM" | "LOW";
export type EvidenceStatus = "FACT" | "HYPOTHESIS" | "VALIDATED_FINDING";
export type FatigueStatus = "HEALTHY" | "WATCH" | "MATERIAL" | "SEVERE" | "NOT_APPLICABLE";
export type ScaleEvidence = "SCALE_UNTESTED" | "SCALE_TOLERANT" | "PROVEN_AT_SCALE" | "MARGINAL_DECAY" | "SCALE_FRAGILE" | "UNKNOWN";
export type TrendLabel = "IMPROVING" | "STABLE" | "DECLINING" | "INSUFFICIENT";
export type LifecycleStage =
  | "NEW"
  | "LEARNING"
  | "EMERGING"
  | "WINNER"
  | "SCALING"
  | "MATURE"
  | "FATIGUE_WATCH"
  | "FATIGUED"
  | "RETIRED"
  | "REFRESHED"
  | "RELAUNCHED"
  | "WINNER_V2"
  | "NOT_WINNING";
export type FatigueSensitivity = "LOW" | "MEDIUM" | "HIGH";

export interface AccountSettingsInput {
  currency: string;
  targetRoas: number;
  cpoGuardrail: number | null;
  grossMargin: number | null;
  minPurchases: number;
  minEvidenceSpend: number;
  evidenceSpendMultiple: number | null;
  minDaysLive: number;
  freshnessWindowDays: number;
  fatigueSensitivity: FatigueSensitivity;
}

export interface TargetRegime {
  startDate: string;
  endDate: string | null;
  targetRoas: number;
  cpoGuardrail: number | null;
  optionalMargin?: number | null;
  notes?: string | null;
}

export interface ResolvedTarget {
  targetRoas: number;
  cpoGuardrail: number | null;
  source: "TARGETS_HISTORY" | "ACCOUNT_SETTINGS";
  regimeStart: string | null;
}

export interface CreativeMeta {
  key: string; // `${platform}:${creativeVariantId}`
  creativeVariantId: string;
  platform: string;
  creativeGroupId: string | null;
  platformCreativeId: string | null;
  creativeName: string;
  launchDate: string | null;
  assetType: string | null;
  format: string | null;
  creator: string | null;
  concept: string | null;
  angle: string | null;
  hookTactic: string | null;
  bodyTactic: string | null;
  headlineTactic: string | null;
  primaryCopy: string | null;
  headline: string | null;
  cta: string | null;
  offer: string | null;
  productId: string | null;
  productName: string | null;
  persona: string | null;
  landingPage: string | null;
  batch: string | null;
  thumbnailUrl: string | null;
  mediaUrl: string | null;
  manualTags: string[];
  campaigns: string[];
  adsets: string[];
  adIds: string[];
  inLibrary: boolean;
}

export interface CreativeInput {
  meta: CreativeMeta;
  rows: DayRow[];
}

export interface CreativeEventInput {
  creativeKey: string | null;
  creativeVariantId: string | null;
  date: string;
  eventType: string;
  description: string | null;
}

export interface Reason {
  text: string;
  status: EvidenceStatus;
}

export interface Diagnosis {
  commercial: string;
  volume: string;
  trend: string;
  attention: string;
  conversion: string;
  reusableElement: string | null;
  weakElement: string | null;
  recommendation: string;
  validationWindow: string;
  explanation: string[];
}

export type { DayRow, Metrics };
