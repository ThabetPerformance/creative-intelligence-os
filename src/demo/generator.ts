/**
 * Synthetic demo data generator. 100% fictional brand, creators and products — no client data.
 * Deterministic (seeded) so tests and screenshots are reproducible.
 */
import { addDays, diffDays, isoWeekLabel, weekStart } from "../engine/dates";

export const DEMO_AS_OF = "2026-10-20";
export const DEMO_START = "2026-04-01";
export const DEMO_CURRENCY = "USD";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Rng {
  private r: () => number;
  constructor(seed: number) {
    this.r = mulberry32(seed);
  }
  next() {
    return this.r();
  }
  range(a: number, b: number) {
    return a + (b - a) * this.r();
  }
  int(a: number, b: number) {
    return Math.floor(this.range(a, b + 1));
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.r() * arr.length)];
  }
  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    const total = weights.reduce((s, w) => s + w, 0);
    let x = this.r() * total;
    for (let i = 0; i < items.length; i++) {
      x -= weights[i];
      if (x <= 0) return items[i];
    }
    return items[items.length - 1];
  }
  normal(mu = 0, sd = 1) {
    const u = Math.max(1e-9, this.r());
    const v = this.r();
    return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  poisson(lambda: number) {
    if (lambda <= 0) return 0;
    if (lambda > 40) return Math.max(0, Math.round(this.normal(lambda, Math.sqrt(lambda))));
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= this.r();
    } while (p > L);
    return k - 1;
  }
}

export const CONCEPTS = ["Problem Solver", "Before / After", "Customer Review Montage", "Morning Routine", "Founder Story", "Unboxing", "Comparison vs Competitor", "Price Drop", "Lifestyle Aesthetic", "How It's Made"] as const;
const CONCEPT_WIN = [5, 4, 4, 3, 2, 2, 2, 1, 1, 1];
const CONCEPT_LOSE = [1, 1, 1, 2, 2, 2, 2, 4, 5, 4];
export const CREATORS = ["Maya R.", "Priya S.", "Jonas K.", "Leo M.", "Amara D.", "Chen W.", "Sofia L.", "Studio In-House"] as const;
const CREATOR_WIN = [5, 4, 2, 2, 2, 1, 1, 1];
const CREATOR_LOSE = [1, 1, 2, 2, 2, 3, 3, 4];
const FORMATS = ["UGC", "Review", "Product Demo", "Founder", "Animation", "Static", "Carousel"] as const;
const FORMAT_WIN = [5, 3, 3, 2, 1, 1, 1];
const FORMAT_LOSE = [2, 1, 2, 2, 3, 4, 3];
const ANGLES = ["Problem / Solution", "Social Proof", "Price / Offer", "Quality", "Convenience", "Lifestyle", "Comparison", "Urgency"] as const;
const HOOKS = ["Question", "Bold Claim", "Pattern Interrupt", "Problem Callout", "Social Proof Open", "Price Reveal", "Demo First", "Testimonial Quote"] as const;
const PRODUCTS = [
  { id: "P-100", name: "AeroBottle", aov: 58 },
  { id: "P-200", name: "TrailPack 20L", aov: 96 },
  { id: "P-300", name: "ThermoMug", aov: 44 },
  { id: "P-400", name: "FlexBelt", aov: 72 },
  { id: "P-500", name: "CloudSock 3-Pack", aov: 38 },
] as const;
const OFFERS = ["20% off first order", "Free shipping", "Bundle & save", "No offer"] as const;
const CTAS = ["Shop Now", "Learn More", "Get Offer"] as const;
const PERSONAS = ["Commuter", "Weekend Hiker", "Gym Regular", "Gift Buyer", "Parent"] as const;
const BODY = ["Demo walkthrough", "Testimonial stack", "Feature list", "Story arc", "Myth vs fact"] as const;
const HEADLINE_T = ["Benefit-led", "Offer-led", "Question", "Social proof"] as const;

const PLATFORM_CPM: Record<string, number> = { meta: 11, tiktok: 7.5, snapchat: 6 };
const PLATFORM_CTR_SCALE: Record<string, number> = { meta: 1, tiktok: 0.85, snapchat: 0.7 };
const PLATFORM_HOOK_SCALE: Record<string, number> = { meta: 1, tiktok: 1.15, snapchat: 1.1 };

export type Archetype =
  | "PROVEN"
  | "VOLUME"
  | "SCALE"
  | "EMERGING"
  | "HIDDEN"
  | "HOOK_OPP"
  | "ATTENTION"
  | "RECOVER_HOOK"
  | "RECOVER_CVR"
  | "RECOVER_HOLD"
  | "WATCH"
  | "WATCH_THIN"
  | "FATIGUED"
  | "LOSER"
  | "KILL"
  | "NEW"
  | "TINY_SAMPLE_12X"
  | "INSUFFICIENT"
  | "TRACKING_ZERO"
  | "TRACKING_CURRENCY"
  | "HIST_WINNER"
  | "HIST_LOSER"
  | "HIST_MEH"
  | "RELAUNCH"
  | "VOLUME_PROOF_6X";

interface Profile {
  /** desired ROAS as a multiple of target, as a function of t (days since launch) and days-to-asOf u */
  eff: (t: number, u: number) => number;
  spend: (t: number, u: number) => number;
  hook: number; // base 3s / impressions
  ctr: number; // base all-click CTR
  hold: number; // 50% / 3s
  freq: (t: number) => number;
  attentionDecay?: (t: number, u: number) => number;
  video: boolean;
}

export interface GeneratedCreative {
  variantId: string;
  groupId: string;
  platform: string;
  archetype: Archetype;
  name: string;
  launch: string;
  end: string; // last delivery day
}

export interface DemoData {
  config: Record<string, unknown>;
  targets: Record<string, unknown>[];
  library: Record<string, unknown>[];
  daily: Record<string, unknown>[];
  events: Record<string, unknown>[];
  tags: Record<string, unknown>[];
  notes: Record<string, unknown>[];
  creatives: GeneratedCreative[];
}

const TARGET_NOW = 2.5;

function profileFor(a: Archetype, rng: Rng, life: number): Profile {
  const flat = (v: number) => () => v;
  const jitter = (base: number, pct: number) => base * rng.range(1 - pct, 1 + pct);
  const fr = (start: number, perDay: number) => (t: number) => Math.min(6, start + perDay * t);
  switch (a) {
    case "PROVEN":
      return { eff: flat(jitter(1.42, 0.08)), spend: (t) => jitter(300, 0.25) * Math.min(1, 0.4 + t / 20), hook: 0.3, ctr: 0.0135, hold: 0.34, freq: fr(1.3, 0.008), video: true };
    case "VOLUME":
      return { eff: flat(jitter(0.96, 0.02)), spend: (t) => jitter(800, 0.2) * Math.min(1, 0.3 + t / 25), hook: 0.27, ctr: 0.012, hold: 0.3, freq: fr(1.4, 0.006), video: true };
    case "VOLUME_PROOF_6X":
      return { eff: flat(2.4), spend: () => 95, hook: 0.29, ctr: 0.013, hold: 0.33, freq: fr(1.3, 0.004), video: true };
    case "SCALE":
      return { eff: flat(jitter(1.55, 0.08)), spend: () => jitter(45, 0.25), hook: 0.28, ctr: 0.013, hold: 0.32, freq: fr(1.2, 0.003), video: true };
    case "EMERGING":
      return { eff: (t) => 0.88 + t * 0.026, spend: (t) => 25 + t * jitter(6, 0.3), hook: 0.31, ctr: 0.0135, hold: 0.33, freq: fr(1.1, 0.01), video: true };
    case "HIDDEN":
      return { eff: flat(jitter(1.38, 0.06)), spend: () => jitter(160, 0.2), hook: 0.12, ctr: 0.0068, hold: 0.24, freq: fr(1.3, 0.006), video: true };
    case "HOOK_OPP":
      return { eff: flat(jitter(1.35, 0.05)), spend: () => jitter(8.6, 0.1), hook: 0.11, ctr: 0.0105, hold: 0.28, freq: fr(1.1, 0.002), video: true };
    case "ATTENTION":
      return { eff: flat(jitter(0.55, 0.08)), spend: () => jitter(75, 0.25), hook: 0.44, ctr: 0.025, hold: 0.41, freq: fr(1.2, 0.006), video: true };
    case "RECOVER_HOOK":
      return { eff: flat(jitter(0.85, 0.02)), spend: () => jitter(55, 0.2), hook: 0.43, ctr: 0.0125, hold: 0.3, freq: fr(1.2, 0.006), video: true };
    case "RECOVER_CVR":
      return { eff: flat(jitter(0.85, 0.02)), spend: () => jitter(55, 0.2), hook: 0.13, ctr: 0.0065, hold: 0.27, freq: fr(1.2, 0.006), video: true };
    case "RECOVER_HOLD":
      return { eff: flat(jitter(0.85, 0.02)), spend: () => jitter(50, 0.2), hook: 0.29, ctr: 0.0068, hold: 0.5, freq: fr(1.2, 0.006), video: true };
    case "WATCH":
      return { eff: (_t, u) => (u > 11 ? 1.5 : 1.5 * 0.76), spend: (t) => jitter(220, 0.2) * Math.min(1, 0.4 + t / 20), hook: 0.3, ctr: 0.0135, hold: 0.33, freq: fr(1.3, 0.012), video: true };
    case "WATCH_THIN":
      return { eff: (_t, u) => (u > 12 ? 1.45 : 0.9), spend: (_t, u) => (u > 12 ? jitter(160, 0.2) : 6), hook: 0.3, ctr: 0.013, hold: 0.33, freq: fr(1.3, 0.01), video: true };
    case "FATIGUED":
      return {
        eff: (_t, u) => (u > 20 ? 1.5 : Math.max(0.6, 1.5 - (20 - u) * 0.05)),
        spend: (t) => jitter(260, 0.2) * Math.min(1, 0.4 + t / 20),
        hook: 0.32,
        ctr: 0.014,
        hold: 0.34,
        freq: (t) => Math.min(6, 1.3 + t * 0.03),
        attentionDecay: (_t, u) => (u > 20 ? 1 : 1 - (20 - u) * 0.015),
        video: true,
      };
    case "LOSER":
      return { eff: flat(jitter(0.5, 0.1)), spend: (t) => (t < 5 ? 9 : jitter(75, 0.15)), hook: 0.24, ctr: 0.0115, hold: 0.3, freq: fr(1.2, 0.01), video: rng.next() < 0.6 };
    case "KILL":
      return { eff: flat(jitter(0.42, 0.15)), spend: () => jitter(65, 0.3), hook: 0.23, ctr: 0.011, hold: 0.28, freq: fr(1.2, 0.01), video: rng.next() < 0.6 };
    case "NEW":
      return { eff: flat(jitter(1.0, 0.5)), spend: () => jitter(35, 0.4), hook: rng.range(0.18, 0.36), ctr: rng.range(0.009, 0.016), hold: 0.3, freq: fr(1.05, 0.02), video: rng.next() < 0.8 };
    case "TINY_SAMPLE_12X":
      return { eff: flat(4.8), spend: () => 12, hook: 0.3, ctr: 0.013, hold: 0.3, freq: fr(1.05, 0.01), video: true };
    case "INSUFFICIENT":
      return { eff: flat(jitter(1.0, 0.4)), spend: () => (rng.next() < 0.45 ? jitter(4, 0.6) : 0), hook: rng.range(0.18, 0.34), ctr: rng.range(0.009, 0.015), hold: 0.3, freq: fr(1.05, 0.003), video: rng.next() < 0.6 };
    case "TRACKING_ZERO":
    case "TRACKING_CURRENCY":
      return { eff: flat(jitter(1.2, 0.08)), spend: () => jitter(110, 0.2), hook: 0.28, ctr: 0.0125, hold: 0.31, freq: fr(1.2, 0.006), video: true };
    case "HIST_WINNER":
      return {
        eff: (t) => (t < life * 0.65 ? 1.45 : Math.max(0.55, 1.45 - (t - life * 0.65) * 0.045)),
        spend: (t) => jitter(220, 0.25) * Math.min(1, 0.4 + t / 15),
        hook: 0.31,
        ctr: 0.0135,
        hold: 0.33,
        freq: (t) => Math.min(6, 1.3 + t * 0.03),
        attentionDecay: (t) => (t < life * 0.65 ? 1 : 0.85),
        video: true,
      };
    case "HIST_LOSER":
      return { eff: flat(jitter(0.45, 0.15)), spend: () => jitter(70, 0.3), hook: rng.range(0.18, 0.3), ctr: rng.range(0.009, 0.013), hold: 0.29, freq: fr(1.2, 0.01), video: rng.next() < 0.5 };
    case "HIST_MEH":
      return { eff: flat(jitter(0.85, 0.1)), spend: () => jitter(25, 0.4), hook: rng.range(0.2, 0.3), ctr: rng.range(0.01, 0.013), hold: 0.3, freq: fr(1.2, 0.008), video: rng.next() < 0.6 };
    case "RELAUNCH":
      return { eff: (t) => (t < 55 ? 1.45 : t < 76 ? 0.7 : 1.4), spend: (t) => (t >= 76 && t < 97 ? 0 : jitter(170, 0.2)), hook: 0.3, ctr: 0.0135, hold: 0.33, freq: (t) => (t < 97 ? Math.min(5, 1.3 + t * 0.03) : 1.3 + (t - 97) * 0.01), video: true };
  }
}

interface Plan {
  archetype: Archetype;
  launchOffset: number; // days before asOf
  life: number; // active days
  platform?: string;
}

function curatedPlans(rng: Rng): Plan[] {
  const P: Plan[] = [];
  const add = (archetype: Archetype, n: number, offset: [number, number], life: [number, number] | "toEnd", platform?: string) => {
    for (let i = 0; i < n; i++) {
      const lo = rng.int(offset[0], offset[1]);
      const lf = life === "toEnd" ? lo + 1 : rng.int(life[0], life[1]);
      P.push({ archetype, launchOffset: lo, life: lf, platform });
    }
  };
  add("PROVEN", 6, [65, 130], "toEnd");
  add("VOLUME", 4, [55, 120], "toEnd");
  add("VOLUME_PROOF_6X", 1, [60, 60], "toEnd");
  add("SCALE", 5, [50, 110], "toEnd");
  add("EMERGING", 6, [14, 26], "toEnd");
  add("HIDDEN", 4, [50, 100], "toEnd");
  add("HOOK_OPP", 4, [50, 90], "toEnd");
  add("ATTENTION", 5, [40, 90], "toEnd");
  add("RECOVER_HOOK", 2, [40, 80], "toEnd", "meta");
  add("RECOVER_CVR", 2, [40, 80], "toEnd", "meta");
  add("RECOVER_HOLD", 2, [40, 80], "toEnd", "meta");
  add("WATCH", 2, [70, 110], "toEnd");
  add("WATCH_THIN", 2, [70, 110], "toEnd");
  add("FATIGUED", 5, [75, 140], "toEnd");
  add("LOSER", 8, [9, 10], "toEnd");
  add("KILL", 6, [35, 70], "toEnd");
  add("NEW", 8, [0, 3], "toEnd");
  add("TINY_SAMPLE_12X", 1, [9, 9], "toEnd");
  add("INSUFFICIENT", 8, [45, 150], "toEnd");
  add("TRACKING_ZERO", 2, [40, 90], "toEnd");
  add("TRACKING_CURRENCY", 1, [40, 90], "toEnd");
  add("HIST_WINNER", 9, [120, 200], [45, 85]);
  add("HIST_LOSER", 11, [90, 200], [16, 40]);
  add("HIST_MEH", 6, [90, 200], [15, 45]);
  add("RELAUNCH", 1, [150, 150], "toEnd");
  return P;
}

function fixturePlans(rng: Rng, n: number): Plan[] {
  const mix: [Archetype, number][] = [
    ["PROVEN", 4],
    ["VOLUME", 2],
    ["SCALE", 5],
    ["EMERGING", 4],
    ["HIDDEN", 3],
    ["HOOK_OPP", 3],
    ["ATTENTION", 6],
    ["RECOVER_HOOK", 3],
    ["RECOVER_CVR", 3],
    ["RECOVER_HOLD", 2],
    ["WATCH", 2],
    ["FATIGUED", 4],
    ["LOSER", 6],
    ["KILL", 8],
    ["NEW", 4],
    ["INSUFFICIENT", 12],
    ["TRACKING_ZERO", 1],
    ["HIST_WINNER", 8],
    ["HIST_LOSER", 14],
    ["HIST_MEH", 10],
  ];
  const items = mix.map((m) => m[0]);
  const weights = mix.map((m) => m[1]);
  const P: Plan[] = [];
  for (let i = 0; i < n; i++) {
    const a = rng.weighted(items, weights);
    let launchOffset: number;
    let life: number;
    if (a.startsWith("HIST")) {
      launchOffset = rng.int(60, 364);
      life = Math.min(launchOffset - 20, rng.int(15, 110));
    } else if (a === "EMERGING") {
      launchOffset = rng.int(14, 26);
      life = launchOffset + 1;
    } else if (a === "NEW") {
      launchOffset = rng.int(0, 3);
      life = launchOffset + 1;
    } else if (a === "LOSER") {
      launchOffset = rng.int(9, 11);
      life = launchOffset + 1;
    } else {
      launchOffset = rng.int(35, 300);
      life = launchOffset + 1;
    }
    P.push({ archetype: a, launchOffset, life: Math.max(5, life) });
  }
  return P;
}

const WINNERISH: Archetype[] = ["PROVEN", "VOLUME", "SCALE", "EMERGING", "HIDDEN", "HOOK_OPP", "WATCH", "WATCH_THIN", "FATIGUED", "HIST_WINNER", "RELAUNCH", "VOLUME_PROOF_6X"];

export function generateDemo(opts: { fixture1000?: boolean; seed?: number } = {}): DemoData {
  const rng = new Rng(opts.seed ?? (opts.fixture1000 ? 1000 : 42));
  const asOf = DEMO_AS_OF;
  const startLimit = opts.fixture1000 ? addDays(asOf, -364) : DEMO_START;
  const plans = opts.fixture1000 ? fixturePlans(rng, 1000) : curatedPlans(rng);

  const library: Record<string, unknown>[] = [];
  const daily: Record<string, unknown>[] = [];
  const events: Record<string, unknown>[] = [];
  const tags: Record<string, unknown>[] = [];
  const creatives: GeneratedCreative[] = [];
  const campaigns: Record<string, { id: string; name: string; objective: string; adsets: { id: string; name: string }[] }> = {};
  for (const pl of ["meta", "tiktok", "snapchat"]) {
    campaigns[pl] = {
      id: `${pl.toUpperCase()}-C1`,
      name: `${pl === "meta" ? "Meta" : pl === "tiktok" ? "TikTok" : "Snap"} | Prospecting | Purchases`,
      objective: "SALES",
      adsets: [
        { id: `${pl.toUpperCase()}-AS1`, name: "Broad 18-54" },
        { id: `${pl.toUpperCase()}-AS2`, name: "Interest Stack" },
        { id: `${pl.toUpperCase()}-AS3`, name: "Lookalike 1-3%" },
      ],
    };
  }

  let seq = 0;
  for (const plan of plans) {
    seq++;
    const a = plan.archetype;
    let launch = addDays(asOf, -plan.launchOffset);
    if (launch < startLimit) launch = startLimit;
    const lifeDays = Math.max(1, plan.life);
    let end = addDays(launch, lifeDays - 1);
    if (end > asOf) end = asOf;
    const platform = plan.platform ?? rng.weighted(["meta", "tiktok", "snapchat"], [7, 2, 1]);
    const win = WINNERISH.includes(a);
    const prof0 = profileFor(a, rng, lifeDays);
    const format = prof0.video ? rng.weighted(FORMATS.slice(0, 5), (win ? FORMAT_WIN : FORMAT_LOSE).slice(0, 5)) : rng.pick(["Static", "Carousel"] as const);
    const prof = prof0;
    const concept = rng.weighted(CONCEPTS, win ? CONCEPT_WIN : CONCEPT_LOSE);
    const creator = format === "Static" || format === "Carousel" || format === "Animation" ? "Studio In-House" : rng.weighted(CREATORS, win ? CREATOR_WIN : CREATOR_LOSE);
    const product = rng.pick(PRODUCTS);
    const hookT = a === "HIDDEN" || a === "HOOK_OPP" || a === "RECOVER_CVR" ? rng.pick(["Demo First", "Price Reveal"] as const) : a === "ATTENTION" || a === "RECOVER_HOOK" ? rng.pick(["Pattern Interrupt", "Bold Claim"] as const) : rng.pick(HOOKS);
    const angle = rng.pick(ANGLES);
    const offer = rng.pick(OFFERS);
    const variantId = `CV-${String(seq).padStart(4, "0")}`;
    const groupId = `CG-${String(seq).padStart(4, "0")}`;
    const pcid = `${platform.slice(0, 2).toUpperCase()}CR-${100000 + seq}`;
    const name = `${concept} — ${product.name} — ${format}${a === "TINY_SAMPLE_12X" ? " (12x tiny sample)" : a === "VOLUME_PROOF_6X" ? " (6x volume proof)" : ""} #${seq}`;
    const batch = `${isoWeekLabel(weekStart(launch))} Sprint`;
    const lp = rng.pick([`/products/${product.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, "/collections/bestsellers", "/lp/bundle"]);
    library.push({
      creative_variant_id: variantId,
      creative_group_id: groupId,
      platform_creative_id: pcid,
      platform,
      creative_name: name,
      asset_type: prof.video ? "video" : format === "Carousel" ? "carousel" : "image",
      format,
      creator,
      concept,
      angle,
      hook_tactic: prof.video ? hookT : null,
      body_tactic: rng.pick(BODY),
      headline_tactic: rng.pick(HEADLINE_T),
      primary_copy: `${angle} copy v${rng.int(1, 4)}`,
      headline: `${product.name}: ${rng.pick(["built for everyday", "the upgrade you notice", "rated 4.8 by 2,000+ buyers", "now with free shipping"])}`,
      cta: rng.pick(CTAS),
      offer,
      product_id: product.id,
      product_name: product.name,
      persona: rng.pick(PERSONAS),
      landing_page: lp,
      batch,
      launch_date: launch,
      thumbnail_url: null,
      media_url: null,
      manual_tags: a === "TRACKING_ZERO" || a === "TRACKING_CURRENCY" ? "pixel-review" : "",
      notes: opts.fixture1000 ? null : `Synthetic archetype: ${a}`,
    });
    creatives.push({ variantId, groupId, platform, archetype: a, name, launch, end });
    if (!opts.fixture1000 && rng.next() < 0.25) tags.push({ creative_variant_id: variantId, tag_type: "visual_theme", tag_value: rng.pick(["Bright studio", "Outdoor", "Kitchen", "Gym", "Desk setup"]) });

    // ads: 1-3 ads per creative across ad sets
    const nAds = a === "TINY_SAMPLE_12X" ? 1 : a === "PROVEN" || a === "VOLUME" || a === "FATIGUED" ? rng.int(2, 3) : rng.weighted([1, 2], [3, 1]);
    const camp = campaigns[platform];
    const adShares = Array.from({ length: nAds }, () => rng.range(0.6, 1.4));
    const shareSum = adShares.reduce((s, x) => s + x, 0);
    const aov = product.aov;
    const cpmBase = PLATFORM_CPM[platform];
    const ctrBase = prof.ctr * PLATFORM_CTR_SCALE[platform];
    const hookBase = Math.min(0.6, prof.hook * PLATFORM_HOOK_SCALE[platform]);
    const totalDays = diffDays(end, launch) + 1;
    for (let t = 0; t < totalDays; t++) {
      const date = addDays(launch, t);
      const u = diffDays(asOf, date);
      const targetAtDate = date < "2026-07-01" ? 2.2 : TARGET_NOW;
      let spendDay = prof.spend(t, u) * rng.range(0.88, 1.12);
      if (a === "INSUFFICIENT" && spendDay <= 0) continue;
      if (spendDay <= 0.01) continue;
      // relaunch pause window
      if (a === "RELAUNCH" && t >= 76 && t < 97) continue;
      spendDay = Math.round(spendDay * 100) / 100;
      const eff = prof.eff(t, u) * rng.range(0.93, 1.07);
      const attn = prof.attentionDecay ? prof.attentionDecay(t, u) : 1;
      const cpm = cpmBase * rng.range(0.9, 1.1) * (1 + Math.max(0, prof.freq(t) - 2) * 0.05);
      const ctr = ctrBase * attn * rng.range(0.92, 1.08);
      const hook = hookBase * attn * rng.range(0.94, 1.06);
      const desiredRoas = TARGET_NOW * eff;
      // cvr derived so expected ROAS ≈ desired (ROAS = 1000·ctr·0.78·0.82·cvr·aov / cpm)
      const cvr = Math.min(0.6, (desiredRoas * cpm) / (1000 * ctr * 0.78 * 0.82 * aov));
      void targetAtDate;
      for (let k = 0; k < nAds; k++) {
        const spend = Math.round(spendDay * (adShares[k] / shareSum) * 100) / 100;
        if (spend <= 0) continue;
        const impressions = Math.max(1, Math.round((spend / cpm) * 1000));
        const clicks = Math.round(impressions * ctr);
        const outbound = Math.round(clicks * 0.78);
        const lpv = Math.round(outbound * 0.82);
        let purchases = rng.poisson(lpv * cvr);
        if (a === "TINY_SAMPLE_12X") purchases = t === 3 || t === 7 ? 1 : 0;
        let value = purchases > 0 ? Math.round(purchases * aov * Math.exp(rng.normal(0, 0.12)) * 100) / 100 : 0;
        if (a === "TINY_SAMPLE_12X" && purchases > 0) value = 720;
        const freq = prof.freq(t) * rng.range(0.95, 1.05);
        let currency = DEMO_CURRENCY;
        if (a === "TRACKING_ZERO" && u <= 8) value = 0; // purchase value parameter dropped
        if (a === "TRACKING_CURRENCY" && u <= 10) {
          currency = "EUR";
          value = Math.round(value * 0.92 * 100) / 100;
        }
        const v3 = prof.video ? Math.round(impressions * hook) : null;
        const v1 = v3 !== null ? Math.round(v3 * rng.range(1.5, 1.8)) : null;
        const v25 = v3 !== null ? Math.round(v3 * rng.range(0.42, 0.52) * (prof.hold / 0.3) ** 0.5) : null;
        const v50 = v3 !== null ? Math.round(v3 * prof.hold * attn * rng.range(0.94, 1.06)) : null;
        const v75 = v50 !== null ? Math.round(v50 * rng.range(0.55, 0.65)) : null;
        const v100 = v75 !== null ? Math.round(v75 * rng.range(0.45, 0.6)) : null;
        const adset = camp.adsets[k % camp.adsets.length];
        daily.push({
          date,
          account_id: `${platform.toUpperCase()}-ACT-001`,
          platform,
          currency,
          campaign_id: camp.id,
          campaign_name: camp.name,
          campaign_objective: camp.objective,
          adset_id: adset.id,
          adset_name: adset.name,
          ad_id: `${variantId}-AD${k + 1}`,
          ad_name: `${name} | ${adset.name}`,
          platform_creative_id: pcid,
          creative_variant_id: variantId,
          creative_group_id: groupId,
          creative_name: name,
          launch_date: launch,
          ad_status: end < asOf ? "PAUSED" : "ACTIVE",
          spend,
          impressions,
          reach: Math.round(impressions / freq),
          frequency: Math.round(freq * 100) / 100,
          clicks,
          outbound_clicks: outbound,
          landing_page_views: lpv,
          add_to_cart: Math.round(purchases * rng.range(2.5, 3.5) + lpv * 0.02),
          checkouts: Math.round(purchases * rng.range(1.4, 1.8)),
          purchases,
          purchase_value: value,
          video_1s: v1,
          video_3s: v3,
          video_25: v25,
          video_50: v50,
          video_75: v75,
          video_100: v100,
          hook_rate: null,
          hold_rate: null,
          thumbnail_url: null,
          media_url: null,
          landing_page: lp,
          source: "Synthetic demo export",
        });
      }
    }
    // events
    if (!opts.fixture1000 || rng.next() < 0.1) {
      if (end < asOf) events.push({ date: addDays(end, 1), creative_variant_id: variantId, platform, event_type: "Pause", description: "Paused by media buyer" });
      if (a === "TRACKING_ZERO") events.push({ date: addDays(asOf, -8), creative_variant_id: variantId, platform, event_type: "Tracking Fix", description: "Checkout update: purchase value parameter missing (under investigation)" });
      if (a === "FATIGUED" && rng.next() < 0.5) events.push({ date: addDays(asOf, -14), creative_variant_id: variantId, platform, event_type: "Offer Change", description: "Free-shipping threshold raised" });
      if (a === "PROVEN" || a === "VOLUME") events.push({ date: addDays(launch, 20), creative_variant_id: variantId, platform, event_type: "Budget Change", description: "Budget raised after first winner read" });
      if (a === "RELAUNCH") {
        events.push({ date: addDays(launch, 76), creative_variant_id: variantId, platform, event_type: "Pause", description: "Paused — fatigue" });
        events.push({ date: addDays(launch, 96), creative_variant_id: variantId, platform, event_type: "Creative Refresh", description: "New opening 3 seconds, same body" });
        events.push({ date: addDays(launch, 97), creative_variant_id: variantId, platform, event_type: "Relaunch", description: "Relaunched with refreshed hook" });
      }
    }
  }

  // cross-platform siblings: same creative group on TikTok for a few winners (curated only)
  if (!opts.fixture1000) {
    const meta = creatives.filter((c) => c.platform === "meta" && (c.archetype === "PROVEN" || c.archetype === "SCALE")).slice(0, 3);
    for (const m of meta) {
      const src = library.find((l) => l.creative_variant_id === m.variantId)!;
      const vid = `${m.variantId}-TT`;
      const launch = addDays(m.launch, 10);
      library.push({ ...src, creative_variant_id: vid, platform: "tiktok", platform_creative_id: `TTCR-${vid}`, creative_name: `${src.creative_name} (TikTok cut)`, launch_date: launch, notes: "Same asset family as Meta original (shared creative_group_id)" });
      creatives.push({ ...m, variantId: vid, platform: "tiktok", launch, archetype: "SCALE" });
      const days = diffDays(asOf, launch) + 1;
      for (let t = 0; t < days; t++) {
        const date = addDays(launch, t);
        const spend = Math.round(rng.range(30, 50) * 100) / 100;
        const impressions = Math.round((spend / 7.5) * 1000);
        const clicks = Math.round(impressions * 0.0115);
        const outbound = Math.round(clicks * 0.78);
        const lpv = Math.round(outbound * 0.82);
        const purchases = rng.poisson(lpv * 0.05);
        const v3 = Math.round(impressions * 0.34);
        daily.push({
          date,
          account_id: "TIKTOK-ACT-001",
          platform: "tiktok",
          currency: DEMO_CURRENCY,
          campaign_id: "TIKTOK-C1",
          campaign_name: "TikTok | Prospecting | Purchases",
          campaign_objective: "SALES",
          adset_id: "TIKTOK-AS1",
          adset_name: "Broad 18-54",
          ad_id: `${vid}-AD1`,
          ad_name: `${src.creative_name} (TikTok cut)`,
          platform_creative_id: `TTCR-${vid}`,
          creative_variant_id: vid,
          creative_group_id: m.groupId,
          creative_name: `${src.creative_name} (TikTok cut)`,
          launch_date: launch,
          ad_status: "ACTIVE",
          spend,
          impressions,
          reach: Math.round(impressions / 1.4),
          frequency: 1.4,
          clicks,
          outbound_clicks: outbound,
          landing_page_views: lpv,
          add_to_cart: purchases * 3,
          checkouts: Math.round(purchases * 1.6),
          purchases,
          purchase_value: Math.round(purchases * 70 * Math.exp(rng.normal(0, 0.12)) * 100) / 100,
          video_1s: Math.round(v3 * 1.6),
          video_3s: v3,
          video_25: Math.round(v3 * 0.45),
          video_50: Math.round(v3 * 0.3),
          video_75: Math.round(v3 * 0.18),
          video_100: Math.round(v3 * 0.09),
          hook_rate: null,
          hold_rate: null,
          thumbnail_url: null,
          media_url: null,
          landing_page: src.landing_page,
          source: "Synthetic demo export",
        });
      }
    }
  }

  const config = {
    brand_name: opts.fixture1000 ? "Load Test Co. (Synthetic 1,000 creatives)" : "Northwind Outfitters (Synthetic Demo)",
    currency: DEMO_CURRENCY,
    timezone: "UTC",
    primary_conversion: "purchase",
    target_roas: TARGET_NOW,
    cpo_guardrail: 28,
    gross_margin: 0.62,
    min_purchases: 10,
    min_evidence_spend: 280,
    evidence_spend_multiple: null,
    min_days_live: 5,
    freshness_window_days: 30,
    fatigue_sensitivity: "MEDIUM",
    default_analysis_window: "30d",
    default_comparison_window: "prev",
    platforms: "meta, tiktok, snapchat",
    active_products: PRODUCTS.map((p) => p.name).join(", "),
    notes: "Synthetic data generated by Creative Intelligence OS. Not real performance.",
  };
  const targets = [
    { start_date: opts.fixture1000 ? addDays(asOf, -364) : DEMO_START, end_date: "2026-06-30", target_roas: 2.2, cpo_guardrail: 32, optional_margin: 0.6, notes: "Launch season: lower target while scaling" },
    { start_date: "2026-07-01", end_date: null, target_roas: TARGET_NOW, cpo_guardrail: 28, optional_margin: 0.62, notes: "Profitability push from Q3" },
  ];
  const notes = [
    { source: "Synthetic demo export", platform: "meta", attribution_setting: "7-day click, 1-day view", notes: "Hook rate derived from 3s views ÷ impressions." },
    { source: "Synthetic demo export", platform: "tiktok", attribution_setting: "7-day click, 1-day view", notes: "TikTok 2s/6s views mapped to video_1s; 3s views provided. Definitions differ from Meta." },
    { source: "Synthetic demo export", platform: "snapchat", attribution_setting: "28-day swipe, 1-day view", notes: "Snap attribution window differs; compare target-relative." },
  ];
  return { config, targets, library, daily, events, tags, notes, creatives };
}
