# Creative classification engine

Code: `src/engine/classify.ts` (rules), `econ.ts` (economics tiers), `evidence.ts` (evidence gate), `tracking.ts` (measurement gate), `analyze.ts` (orchestration). Tests: `tests/classification.test.ts`.

Every creative active in the selected period gets exactly one **classification**, one **decision**, a **confidence**, a list of **reasons** (each labelled FACT or HYPOTHESIS) and a written **diagnosis** (commercial, volume, trend, attention, conversion, reusable element, weak element, recommendation, validation window).

## Inputs per creative

- Period metrics (selected window), current 7D, previous 7D, current 14D, previous 14D, lifetime — all computed from prefix sums of the daily series.
- The **target regime active on the as-of date** (targets history, else account settings).
- Account-level metric definitions: CVR uses landing page views when ≥80% of spend has LPV, else outbound clicks, else clicks. CTR likewise. One definition per account, shown on the Data Quality page.
- Percentile ranks of hook rate, hold rate, CTR, CVR, CPC and AOV against the creative's **platform** baseline (account baseline when the platform has fewer than 8 judged creatives).
- Volume context: spend share, purchase share, purchase percentile.

## 1. Measurement gate → TRACKING RISK

ROAS is not trusted when purchases exist but value is missing/zero, value collapses while purchases continue, currency does not match the account, purchases are unreported, rates are impossible, or a tracking-issue event was logged. Such creatives are `TRACKING_RISK` / `VALIDATE` and are judged on purchases, CPO and CVR only.

## 2. Evidence gate

| Level | Rule |
|---|---|
| HIGH | purchases ≥ min purchases **and** spend ≥ evidence spend |
| MEDIUM | one of the two |
| LOW | neither |

Evidence spend = `min_evidence_spend`, or CPO guardrail × `evidence_spend_multiple` if set. `canJudgeFailure` = evidence spend reached **and** min days live reached (losers rarely reach the purchase threshold, so failure can be judged on spend).

## 3. Economics tier

ROAS ratio = ROAS / target. CPO ratio = CPO / guardrail. Tiers (defaults in `DEFAULT_CONFIG`):

| Tier | ROAS ratio | CPO ratio |
|---|---|---|
| STRONG | ≥ 1.00 | ≤ 1.00 |
| ACCEPTABLE | ≥ 0.90 | ≤ 1.15 |
| BELOW | ≥ 0.70 | ≤ 1.40 |
| MATERIAL | ≥ 0.50 | ≤ 2.00 |
| SEVERE | < 0.50 | > 2.00 |

The tier is the **worse** of the ROAS and CPO tiers. With zero purchases, spend ÷ guardrail is used as a lower bound on CPO; it can prove failure but never success.

## 4. Rules (first match wins)

1. **TRACKING RISK** — measurement gate failed.
2. **NEW / LEARNING** — fewer than min days live and evidence not HIGH. Decision HOLD.
3. LOW evidence → **NEW / LEARNING** (young) or **INSUFFICIENT DATA**. A very high ROAS on a handful of purchases is flagged `PROMISING_LOW_SAMPLE` with an explicit small-sample warning — it is never called a winner.
4. Former winner with MATERIAL/SEVERE fatigue (adequate sample) → **FATIGUED WINNER** / REFRESH. Any fatigue status → **FATIGUE WATCH** / HOLD.
5. Acceptable economics, young, improving → **EMERGING WINNER** / TEST SCALE.
6. Strong economics with HIGH evidence:
   - weak attention, conversion not weak → **HIDDEN WINNER** / ITERATE HOOK (never killed on CTR)
   - low spend share → **SCALE CANDIDATE** / CONTROLLED SCALE
   - high volume and ROAS ≥ account median → **PROVEN WINNER** / PROTECT (CONTROLLED SCALE if past scale steps held up)
   - otherwise SCALE CANDIDATE, VOLUME WINNER or PROVEN WINNER by volume.
7. Acceptable economics, HIGH evidence, high volume → **VOLUME WINNER** / PROTECT.
8. Strong economics, MEDIUM evidence → **HOOK OPPORTUNITY** (weak hook) or SCALE CANDIDATE / TEST SCALE.
9. Otherwise (weak or near-target):
   - strong attention but weak commerce → **ATTENTION WINNER** (iterate body, offer or landing alignment; hook flagged reusable)
   - failing with **persistent** failure (current and previous 7D both failing with meaningful spend, or current and previous 14D) or **overwhelming** evidence (≥3× evidence spend at severe economics or zero purchases) → **KILL CANDIDATE** / KILL
   - failing with no strong element → **LOSER** / CUT
   - otherwise → **RECOVERABLE** with an iteration decision chosen from which element is weak (hook, body, CTA, landing alignment, offer).

## Confidence

Points: evidence (HIGH 2 / MEDIUM 1), consistency of 7D and previous 7D with the period verdict (+1 / −1), clean measurement (+1 / −1), long HIGH-evidence history (+1). HIGH ≥ 4, MEDIUM ≥ 2, else LOW. New and insufficient creatives are always LOW.

## Ranking

- **Decision priority** (leaderboard default): class urgency weight (KILL 92 … INSUFFICIENT 20) + 40·√min(1, 4·spend share) + 3·confidence. Puts expensive, urgent decisions first.
- **Commercial value**: purchases × clamp(ROAS ratio, 0, 2.5) × evidence factor. A 6× ROAS on 250 purchases vastly outranks 12× on 2 purchases.

## Decision-ready waste

For every day after a creative first became kill-ready (failing on cumulative and trailing-7D economics after evidence, never a winner), the next day's spend counts as decision-ready waste. Spend needed to reach evidence is **learning spend**, never waste.

## Language

Group analysis (creators, concepts, angles…) uses associative language ("associated with", "in this account/sample"), never causal claims. Fatigue causes are HYPOTHESIS. Earned budgets and capacity estimates are labelled PLANNING ESTIMATE.
