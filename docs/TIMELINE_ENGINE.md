# Timeline engine

Code: `src/engine/timeline.ts`, `history.ts` (milestones, lifecycle), `peaks.ts`, `scale.ts`. Server wrapper: `src/server/timeline.ts`. UI: creative detail page and the Creative Timeline compare page.

## Daily points

`buildTimeline(series, range, launchDate, definitions, settings, regimes, milestones, peaks, events)` returns **every calendar day** in the range, including days with no delivery (spend 0, ratios UNAVAILABLE so charts show gaps, never fake zeros). Each point has:

- date and **day since launch** (Day 0 = launch date)
- spend, impressions, reach, frequency, CPM, clicks, outbound clicks, LPV, CTR, CPC
- purchases, value, ROAS, CPO, CVR, AOV, hook and hold rate, video quartiles
- rolling 3D and 7D ROAS, 7D CPO, 7D CVR, 7D purchases (calendar-based rolling windows)
- the **target ROAS and CPO guardrail active on that date** (targets history), drawn as a step line

Ranges: lifetime, first 30 / 60 days, last 90 / 30 days, selected period. X-axis: calendar date or days since launch.

## Markers

Derived from history (`scanMilestones`): first spend, first purchase, evidence reached, emerging, first winner, first scale step, peak, fatigue watch, fatigued, kill-ready, retired, relaunched, winner again. Logged events from `05_CREATIVE_EVENTS` (budget changes, edits, pauses, landing-page changes, tracking issues, …) are added with source EVENT.

## Phases

LAUNCH → LEARNING → BREAKOUT → SCALING → STABLE → DECAY → FATIGUE, shaded behind the charts.

## Milestones (scanned day by day)

`scanMilestones` walks the full history once using cumulative and trailing windows and the regime active on each day:

- evidence date, days and spend to evidence
- emerging date; first winner date (cumulative phase or trailing 14D strong with evidence), days/spend to winner, target at the time
- first scale step (weekly spend +30% with economics holding)
- fatigue watch / fatigue dates (trailing 14D vs an expanding winner-era reference with a Poisson z-test on purchases)
- kill-ready date and the set of kill-ready days (for decision-ready waste)
- retired (≥14 days without spend), relaunch dates, winner-again date
- winner lifespan (censored when still running)

## Peaks

Best day / 3D / 7D / 14D / 30D windows by ROAS, each requiring a minimum spend so one lucky day cannot become the peak; best 7D CPO and CVR; current 7D vs peak; days since peak.

## Scale evidence

Weekly blocks ending on the as-of date; steps where spend rose ≥30%; ROAS/CPO response per step; a directional log-log elasticity across week pairs (or INSUFFICIENT_VARIATION). Labels: SCALE_UNTESTED, SCALE_TOLERANT, PROVEN_AT_SCALE, MARGINAL_DECAY, SCALE_FRAGILE. An earned weekly budget (capped at 3× current) is a PLANNING ESTIMATE. All of this is descriptive, never causal.

## Compare view

Up to six creatives on one metric, aligned by days since launch so a new creative can be compared with past winners at the same age.
