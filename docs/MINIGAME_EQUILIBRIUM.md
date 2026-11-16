# Minigame equilibrium contract

Audit baseline: `e2585a16f1d8884da2675e72fcab27623c628a97` (16 November 2026).
Implementation includes main's subsequent cinematic Skip fix at
`c70a8e4355bda94b1d78038cb1f333d20c45f5c7`.
Recovered work is integrated with main's Eyeros/changing-room updates at
`d41693d8ab5d14142275c958915246dafdde26de` (17 November continuation).

The aim is competitive, learnable games. A competent player can earn a win and
can lose; neither human status nor roster position should determine the result.
Synthetic contestants are test strategies, not measured average humans.

## Shared rules

- Use the same native score formula, resource budget, completion requirements,
  penalties and available information for both kinds of contestant.
- Keep hidden answers out of AI decisions. Outcome resolution may inspect the
  hidden board after a choice, just as it does for a human choice.
- Model memory and knowledge with plausible mistakes, rather than perfect
  lookup tables or personality biases that override impossible outcomes.
- Compare active decision time. Presentation waits do not count for only one
  contestant, and simulation safety limits must not create a different game.
- Resolve ties explicitly using shared rules and seeded randomness. Never use
  human status or array order to choose the winner.
- Do not adjust opponents after observing the human score to force a result.
- Preserve character strengths, intentional game-specific risk, premium variant
  identities, entitlements, rewards, and season result contracts.

## Calibration interpretation

Equal-strength entrants have a neutral individual win reference of 1/N, not a
universal 50%. Check head-to-head and full-field contests separately. Compare
practice, knowledge, motor speed and actual device input independently.

For relevant simulations, vary supported entrant counts, weaker/neutral/stronger
profiles, standard and premium variants, and the existing mode capability rules.
Use fixed seeds and report score/time/attempt distributions, completion rates,
tie rates and skill trends. A deterministic regression can establish rule parity;
it cannot establish the win rate of an average-intelligence human cohort.

## Scope and evidence

The implementation review covers active base games, both premium Twin remasters,
Quick Tap variants, Final Three Circuit and Down Memory Lane. Fit Me In remains
relevant through Survival. Unused legacy score paths are not evidence that a live
game is unbalanced.

Retain games without an established defect. In particular, Color Match's exact
feedback is a purchased hint with a score penalty; Percentage Panic's midpoint
guess uses public bounds and is a valid hidden-number strategy. Neither finding
justifies an automatic AI strength increase.

Focused regression suites accompany each changed engine. Run the repository's
`npm run check:pr` after the final edit as well as the affected minigame tests.
The final implementation notes record concrete changes and the remaining human
playtesting limits; passing simulations must not be presented as player telemetry.

## Implementation coverage

| Game or variant                                       | Disposition                                                                                                             |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Deck of Light                                         | Shared completion rule, coherent fallible recall, and removal of overlapping memory discounts.                          |
| Deck of Darkness                                      | Equivalent charm access, complete-board recovery, damage resolution, and memory progression.                            |
| Memory Colors                                         | Same five-mistake replay/termination loop and ranking meaning; existing mode capability remains effective.              |
| Final Three Circuit                                   | Signal search and puzzle completion use their native scoring and stage-specific clocks; no blanket Part 2 score cut.    |
| Verdict Board                                         | Finale decisions reflect visible progress, difficulty and season capability, without receiving the hidden answer.       |
| Hold the Wall                                         | Common 120-second ending, genuinely surviving rivals, and seeded single-winner resolution of survivor ties.             |
| Quick Tap Race                                        | Seed-matched booster effects; content-blind decisions before an unknown booster is opened.                              |
| Seasons and VIP Quick Tap                             | Sustained motor cadence calibrated separately from box strategy; imperfect responses retained.                          |
| Timing Bar                                            | AI position error responds to the same accelerating bar speed.                                                          |
| Chain of Greed                                        | Probability-zero calls excluded; personality cannot overwhelm public odds; active decision budget shared.               |
| Blackjack Tournament                                  | Standing opponent's visible total informs hit/stand decisions, including drawing to tie a standing 21.                  |
| Boxpocalypse                                          | Main contest preserved; arithmetic ties include exact knowledge and two-sided estimation errors.                        |
| Majority Rules                                        | Live final-dice starting player varies by seed independently of roster order.                                           |
| Risk Wheel                                            | Exact final-score ties explicitly resolved independently of roster order.                                               |
| Battery Low                                           | Forced offer-presentation waits excluded from the active tiebreak clock.                                                |
| VIP Twin remasters                                    | Seeded routes including explicit seed 0; Lost Again AI uses its own point economy and retry budget.                     |
| Original Crystal Path                                 | Both sides interpret the same deterministic public hint.                                                                |
| Crystal Path: Infinity                                | Blind choices do not inspect the safe side; hints and overlapping SP effects use equivalent rules and cadence.          |
| Number Trivia                                         | Six feedback-aware attempts, bounded fatigue, and familiar headline dates assigned consistent difficulty.               |
| Famous Figures                                        | First-clue knowledge is possible; stable recognition can improve as clues are revealed in live and fast-forwarded play. |
| Minesweeps                                            | Visible-clue solver, native partial-loss scoring, and reading/deduction/flag time instead of guaranteed clears.         |
| Vault Cracker                                         | Attempt model retained; seeded field-size benchmark records the difficulty cliff without inventing random AI failures.  |
| Color Match                                           | Paid-only exact feedback and its penalty retained; added regression.                                                    |
| Percentage Panic                                      | Public-bounds midpoint strategy retained; hidden-answer independence covered.                                           |
| Down Memory Lane                                      | Existing answer-window and buzzing behavior retained; ability/difficulty timing trends covered.                         |
| Don't Go Over                                         | No established motor-specific defect; current slower opening input model retained.                                      |
| Bigg Gates, Capitalization, Estimation                | No established live scoring defect; retained. Obsolete Estimation session envelope is outside current campaign scoring. |
| Trap Auction, Mystic Chamber, Silent Saboteur         | Contextual risk/social models retained; no demonstrated general scoring mismatch.                                       |
| Pressure Plank, Tilt Labyrinth, Serpentine, Fit Me In | Existing engine, ranking, timing or skill-trend checks retained and exercised. Fit Me In remains Survival eligible.     |
| Standard Twin games                                   | Classic scoring retained; shared scorer defaults remain backward compatible.                                            |

## Seeded calibration evidence

These measurements use explicitly defined synthetic inputs. They do not measure
the performance of people with any particular intelligence level.

- Memory Colors: 500 seeds per capability; mean furthest rounds at capabilities
  0.4/0.65/1/1.2 were 5.824/6.628/8.088/8.812. Every run ended at five mistakes.
- Deck of Light: 500 ten-pair boards per ability; mean mistakes at abilities
  25/55/85 were 8.34/7.60/7.07. All boards completed, with no perfect runs in
  that sample. Completion is possible because both sides can continue trying.
- Deck of Darkness: 500 six-round runs per ability; full-run survivors at
  25/55/85 were 40/56/106. Survival is not the same as winning: a contestant
  can win before round six if the rest of the field has been eliminated.
- Final Three Circuit: 1,200 seeds per input profile. At raw input 225, Part 2
  Signal/Sequence/Risk means were 77.38/64.51/70.43. Sequence completed both
  boards in 52.6% of runs; those completers averaged 92.24, using the same
  formula as the representative 92-point human completion. Failures remain
  sharply separated from full completions, as in the interactive rules.
- Hold the Wall: 500 seeded fields, conditional on a synthetic player holding
  perfectly until the limit. That player won 74.6%/58.0%/41.8% with 2/6/16
  entrants. This demonstrates possible wins and losses, not a population target.
- Vault Cracker: 1,000 seeded matches per field size. Best rival median attempts
  were 9/6/4 with 1/5/15 rivals; a rival at six attempts or fewer appeared in
  19.7%/63.9%/94.5% of fields. This remains a calibration concern, not proof that
  random failure should be added to otherwise unlimited deduction attempts.
- Minesweeps: 300 runs per explicit skill. Clear rates at 0.2/0.5/0.8 were
  69%/75%/78%; median successful times were 107.3/98.0/88.9 seconds. Median
  native scores were 786/822/849. Across 100 neutral fifteen-rival fields, the
  best-score median was 947 and 15% of fields reached the 980 ceiling.
- Number Trivia: 1,000 runs per difficulty in a controlled answer-size fixture.
  First-attempt/full-six-attempt success was 95.7%/97.7% (easy), 80.1%/91.7%
  (medium), 57.6%/84.3% (hard), and 34.9%/80.8% (very hard). This fixture varies
  the knowledge band explicitly; it does not assign one fact all four labels.

## Remaining limits

Search speed, knowledge, memory, tapping cadence and sanctum combat are heuristic
performance models. Native formulas and information parity are regression
checked, but a real human cohort is still needed to validate average-player win
rates. In particular, remeasure Vault Cracker attempts, mobile numeric entry,
practiced puzzle completion, and the high variance of larger fields. The tuning
does not impose a universal win quota or read the human's final score to choose
an opponent result.
