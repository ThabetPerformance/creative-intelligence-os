# Fatigue engine

Code: `src/engine/fatigue.ts` (current status), `history.ts` (historical fatigue dates). Tests: `tests/lifecycle.test.ts`.

## Who can fatigue

Only creatives that **were winners** (first winner date at least 7 days before the as-of date). A creative that never won is a loser or recoverable, not fatigued.

## Reference: the winner-era normal

Comparing against the best 7 days is biased (the max of noisy windows is always high), so stable winners would look fatigued. The engine compares against the creative's own **winner-era normal**: ROAS and CPO across the period it was winning. Signals:

| Signal | Meaning |
|---|---|
| ROAS 7D / 14D vs winner-era normal | main decline measure |
| Purchases z-score (14D) | Poisson test: purchases observed vs what winner-era CPO would have produced at current spend |
| ROAS 7D vs previous 7D, vs best 7D; 14D vs previous 14D; 30D vs normal | supporting |
| CPO, CVR, CTR, hook, hold vs previous 7D; frequency, impressions, spend, purchases change | diagnosis |

## Status (k = sensitivity factor: LOW 1.3, MEDIUM 1.0, HIGH 0.75)

| Status | Rule |
|---|---|
| SEVERE | 7D ≤ −45%·k and 14D ≤ −30%·k vs normal, z ≤ −2.5, commercial support, current 7D below 85% of target |
| MATERIAL | 7D ≤ −30%·k and 14D ≤ −20%·k, z ≤ −2, and commercial support or a recent decline |
| WATCH | 7D ≤ −20%·k or 14D ≤ −15%·k with z ≤ −1.5, or a large decline on a thin sample |
| HEALTHY | none of the above |

MATERIAL/SEVERE with an adequate sample → **FATIGUED WINNER** / REFRESH. WATCH (or MATERIAL/SEVERE on a thin sample) → **FATIGUE WATCH** / HOLD.

## Outputs

Start date of the decline, days in decline, spend at risk (current 7D spend when MATERIAL/SEVERE, half of it when WATCH), facts, and **hypotheses** about the cause, always labelled HYPOTHESIS: creative wear-out (hook/CTR falling with efficiency), audience saturation (frequency up ≥15%), scale decay (spend up ≥40%), traffic-quality/offer/landing change (clicks held, conversion fell), and logged offer, landing-page or tracking events in the window. If none apply: "cause not identifiable from the data".

## Lifespan

Winner lifespan = first winner day → fatigue date or retirement. Winners still running are censored (shown as "N+ days"). The Fatigue page reports the median of completed lifespans separately from running ones; the planner uses it to estimate how many launches are needed.
