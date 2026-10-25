import "./env";
import { generateDemo, DEMO_AS_OF } from "../src/demo/generator";
import { validateDaily, validateLibrary, validateTargets, validateConfig } from "../src/ingestion/validate";
import { buildCreativeInputs } from "../src/ingestion/to-engine";
import { analyzeAccount } from "../src/engine/analyze";
import { addDays } from "../src/engine/dates";
import { CLASSIFICATIONS } from "../src/engine/types";

const fixture = process.argv.includes("--fixture1000");
const t0 = Date.now();
const demo = generateDemo({ fixture1000: fixture });
const withRow = (rows: Record<string, unknown>[]) => rows.map((r, i) => ({ ...r, __row: i + 2 }));
const d = validateDaily(withRow(demo.daily), "USD");
const lib = validateLibrary(withRow(demo.library));
const tg = validateTargets(withRow(demo.targets));
const cfgRows = Object.entries(demo.config).map(([field, value]) => ({ field, value }));
const cfg = validateConfig(cfgRows).config;
console.log(`rows ${demo.daily.length}, valid ${d.rows.length}, rejected ${d.rejected}, warnings ${d.issues.length}, creatives ${demo.library.length}, gen ${Date.now() - t0}ms`);
const inputs = buildCreativeInputs(d.rows, lib.rows, "USD");
const t1 = Date.now();
const res = analyzeAccount({
  accountId: "demo",
  currency: "USD",
  settings: {
    currency: "USD",
    targetRoas: cfg.targetRoas!,
    cpoGuardrail: cfg.cpoGuardrail ?? null,
    grossMargin: null,
    minPurchases: cfg.minPurchases!,
    minEvidenceSpend: cfg.minEvidenceSpend!,
    evidenceSpendMultiple: null,
    minDaysLive: cfg.minDaysLive!,
    freshnessWindowDays: cfg.freshnessWindowDays!,
    fatigueSensitivity: "MEDIUM",
  },
  regimes: tg.rows.map((r) => ({ ...r })),
  creatives: inputs,
  events: [],
  window: { from: addDays(DEMO_AS_OF, -29), to: DEMO_AS_OF },
  asOf: DEMO_AS_OF,
  comparison: "prev",
});
console.log(`analysis ${Date.now() - t1}ms (engine ${res.timingMs}ms)`);
const counts: Record<string, number> = {};
for (const c of res.creatives.filter((x) => x.activeInWindow)) counts[c.classification] = (counts[c.classification] ?? 0) + 1;
for (const k of CLASSIFICATIONS) console.log(k.padEnd(20), counts[k] ?? 0);
if (!fixture) {
  const gen = new Map(demo.creatives.map((c) => [c.variantId, c.archetype]));
  const byArch: Record<string, Record<string, number>> = {};
  for (const c of res.creatives) {
    const a = gen.get(c.meta.creativeVariantId) ?? "?";
    byArch[a] ??= {};
    const k = c.activeInWindow ? c.classification : "(inactive)";
    byArch[a][k] = (byArch[a][k] ?? 0) + 1;
  }
  for (const [a, m] of Object.entries(byArch)) console.log(a.padEnd(18), JSON.stringify(m));
}
console.log("story:", res.portfolio.story.map((s) => s.text));
