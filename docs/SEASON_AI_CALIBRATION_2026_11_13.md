# TestFlight Package 9: season AI capability

The new policy applies to newly launched competitions in active Classic runs,
including Vox Populi, Cupid, premium variants, native sessions and Battle Back.
It does not enable stronger AI in Surveyeval or unscoped Lab/demo sessions.

## Meaning of the increase

Capability is 1.2. Profile-based engines multiply physical, mental, precision,
nerve, consistency, clutch and overall by 1.2, capped at 100. Choke propensity
divides by 1.2. Luck is unchanged. Feature-owned engines instead increase their
own bounded ability or reduce modeled errors/latency. They do not also receive
a boosted precomputed profile score. AI-only runs with no feature engine use
the effective profile at the central simulation boundary.

Base and effective profiles are captured in saved runtime state at launch.
Rerenders, reloads and retries reuse the snapshot. Profiles in the contestant
roster are unchanged. Older active attempts without a snapshot keep their
existing difficulty. Battle Back captures once when its competition opens.

The exhaustive owner inventory is `src/ai/competition/seasonAiOwners.ts`.
A registry test requires an entry for every game and checks retired status.
Human rules, fair wheel/card/door/dice draws, prizes and paid access are not
capability inputs. Fixed optimal policies, such as Percentage Panic's midpoint
duel and Chain of Greed's public-odds Solo Rush choices, remain unchanged.
Social/pact decisions and deliberate competition-throw intentions are unchanged.

## Deterministic measurements

The paired runs below use the same seeds and participant identity, with base
profile bands 25/50/75 and their bounded effective profiles. Each measurement
uses 1,000 seeds per band, except VIP Quick Tap, which uses 100. These are
simulation outcomes, not physical-device or real-player win-rate measurements.

| Native simulator                                           | Base skill | Mean before | Mean after |
| ---------------------------------------------------------- | ---------: | ----------: | ---------: |
| Tilt Labyrinth, 100 route cells, seconds (lower is better) |         25 |      125.84 |     121.40 |
| Tilt Labyrinth, seconds                                    |         50 |      105.89 |      97.25 |
| Tilt Labyrinth, seconds                                    |         75 |       86.02 |      72.90 |
| Snake, score                                               |         25 |      741.96 |     745.85 |
| Snake, score                                               |         50 |      809.26 |     834.14 |
| Snake, score                                               |         75 |      865.53 |     902.09 |
| VIP Quick Tap, score                                       |         25 |      843.78 |     844.67 |
| VIP Quick Tap, score                                       |         50 |      876.65 |     885.85 |
| VIP Quick Tap, score                                       |         75 |      908.65 |     926.21 |

Additional 1,000-seed checks at base skill 50:

| Resolver                                                            | Mean before | Mean after |
| ------------------------------------------------------------------- | ----------: | ---------: |
| Quick Tap, score                                                    |      205.74 |     207.19 |
| Quick Tap Seasons, score                                            |      278.01 |     292.90 |
| Estimation generic model, score                                     |       67.91 |      72.40 |
| Crystal Path, rows reached                                          |       42.48 |      43.86 |
| Memory Colors, rounds cleared                                       |        9.12 |      10.17 |
| Percentage Panic, absolute percentage-point error (lower is better) |       23.76 |      20.40 |

The generic-model matrix also covers all three profile bands. A separate hybrid
direction test covers casts of 2/6/12/16 across 100 seeds each. The Risk Wheel
fairness test confirms identical sector draws, score changes and RNG counts
for 1,000 identical spin inputs. Castle difficulty remains tiered; bounded
profiles do not promise a tier change for every contestant.

A 20% capability increase is not a 20% final-score increase or a guaranteed
20-percentage-point win-rate change. Specialist decisions can consume later RNG
differently; a stronger input need not win every paired seed. A preliminary
100-seed Snake sample was noisy; the 1,000-seed comparison above improves in
all profile bands. No leaderboard score is rewritten after display.

## Related contract repairs and limits

Higher skill now nudges lower-is-better hybrid results toward shorter times.
Crystal Path receives the captured profile, uses 0..100 nerve thresholds, and
uses mental/precision skill in actual side decisions.

Legacy score completions preserve the human metric and the already simulated
AI metrics in one receipt. This restores organic last-place retry eligibility;
an all-player first-place tie is excluded. Placement games still require their
explicit result contract. Wildcard completion expectations now reflect host-owned
awards and the last-place receipt. The premium presentation assertion reflects
the shared Premium Challenges/VIP access gate.

Physical iPhone verification and the independent Democracia top-gap investigation
remain open. This package does not upload a TestFlight build or merge the PR stack.
