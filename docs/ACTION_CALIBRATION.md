# Action calibration

The first pilot covers VIP Quick Tap Race, VIP Quick Tap Seasons and Pressure
Plank. It replaces guessed opponent outcomes with legal input actions and checks
those actions against the live scoring code. It does not certify the balance of
other minigames or estimate the ability of the average human.

## Run and reproduce

```sh
node scripts/run-action-calibration.mjs --seeds=100
node scripts/run-action-calibration.mjs --seeds=1000 --first-seed=5000
node scripts/run-action-calibration.mjs --baseline-ref=origin/main --tested-ref=origin/release/testflight-equilibrium-1779
node scripts/run-action-calibration.mjs --replay=test-results/action-calibration/pressurePlank-strong-trace.json
```

The runner writes Markdown, JSON and replayable action traces into
`test-results/action-calibration`. Use `--out=path` to retain a separate batch.
Use `--baseline-ref=none` for candidate-only diagnostics. Historical comparison
loads the logic and its relative dependencies from the specified Git commit;
it does not combine an old dispatcher with new helpers. Existing Git refs and
the installed development dependencies are sufficient; no live service is used.

The committed [100-seed results](action-calibration-results.md) compare main
`d41693d8` with the tested PR #1779 code `bc2d2a03` and this candidate. The local
source snapshots for those two historical trees were `3fd2c20` and `704c516`;
these snapshot IDs are recorded in the generated JSON provenance. The names in
the report identify the corresponding upstream source commits. Scores from the
screenshots are observations under unknown seeds, not targets to fit.

## Shared rules and action traces

| Game                  | Runtime change                                                                                                              | Parity evidence                                                                                                                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VIP Quick Tap Race    | Opponents produce tapping and box-claim actions. Live input and AI use `applyQuickTapVipAction`.                            | Replay every accepted action; compare raw taps, points, round totals and claimed boxes. Drive 448 alternating three-finger touches through the React pointer handlers.                  |
| VIP Quick Tap Seasons | The same action entry point also handles season changes; opponents react after visible changes rather than previewing them. | Replay taps, claims and rerolls through winter, effect expiry and round boundaries. Test negative winter scoring and live intermissions.                                                |
| Pressure Plank        | One seeded physics engine drives the live gauge and every opponent. Survival is the engine's terminal time.                 | Replay complete controller traces and real React pointer events; compare terminal states and native survival seconds. Check frame schedules from 8 ms to a four-second suspended frame. |

Pressure Plank advances in fixed 10 ms steps. The existing spring, damping,
impulse, stability damage, narrowing zone and surge coefficients are shared by
all contestants. Rendering frequency no longer changes the physical outcome.
This replaces the previous live `Math.random()` trajectory and separately
sampled integer AI survival buckets, so old input sequences cannot recreate the
old unseeded world exactly.

The controller sees the rounded gauge, estimates its motion from prior
observations and makes a delayed correction. Its policy does not read hidden
velocity, drift, future surges or the human score. AI identity and season form
modify control ability before simulation; no multiplier edits a finished
survival time. Native results remain bounded by the real 120-second game cap.

Quick Tap mystery choices depend on visible weather, remaining time, the
opponent's own performance and its risk preferences. A box's hidden contents
are resolved only after claiming it. Input styles and simulation streams depend
on contestant identity and seed, not roster position or human performance.

## Explicit assumptions

These are inspectable design settings, not measured population statistics:

- Reference motors describe 1, 2 or 3 alternating fingers at six taps per finger
  per second, plus a practiced three-finger reference at seven. They include
  cadence variation and fatigue. Strategy pauses and penalties still apply.
- Runtime finger style is stable per contestant: seeded identity sampling uses
  weights 20% one finger, 40% two fingers and 40% three fingers. Per-finger
  cadence is `(4.1 + 3 * physical/100 + seeded[0,0.6)) * seeded[0.97,1.03)`.
  Consistency affects timing variation and fatigue. No ceiling selectively
  restricts a human's legitimate alternating-finger input.
- Plank references specify delayed/error-prone, competent, strong and practiced
  control through reaction time, observation error, prediction, deadband, lapse
  probability and wrong-direction probability. Their names describe fixtures,
  not human intelligence or population percentiles.
- Runtime plank ability combines 45% weighted profile skill with 55% stable
  game-specific aptitude. It interpolates the declared controller behaviours
  at ability anchors 0, 0.4, 0.7 and 1. This lets equally rated contestants have
  different strengths without sampling a desired finishing time.

The first automated batch exposed a tapping overcorrection: the 18 taps/second
reference won only 1% of full Race fields under the initial settings. Revising
the declared per-finger cadence before release produced the committed results.
There is no code that seeks a target win percentage or adjusts opponents after
a human plays. Separate holdout seeds must be checked after a parameter change.

## What the report measures

Each fixed world seed is evaluated with three skill profiles (all relevant
traits 30, 50 or 75), four reference behaviours, and rosters of 2, 6, 12 and 16.
Each contestant is simulated once and reused in nested roster comparisons.
Contestant identities vary with the world seed so the matrix samples different
finger styles and game-specific aptitudes as well as different random events.
The report includes individual P10/median/P90 scores, raw-tap distributions in
JSON, strongest-opponent scores, strict whole-field win rates, top ties, score
margins and relative margins. A whole-field win excludes exact ties; each game
keeps its normal deterministic tie handling.

Every candidate opponent and reference trace is replayed. Parity failures and
nonfinite scores fail the command. CI runs the pointer/logic/competition tests
and a 100-seed report automatically for changes to the covered code, then
uploads the evidence. Tests also check stronger capability profiles improve
cohort performance, increasing roster size cannot improve whole-field odds,
and roster order or removing another participant does not change a contestant.

Win rates are diagnostic evidence; they are not universal pass thresholds.
A slow one-finger strategy can lose to a fast three-finger strategy under equal
rules. A practiced plank controller can survive the full round. Both cases
must remain visible rather than being hidden by outcome manipulation.

## Extending coverage

For each additional game:

1. Identify its actual action acceptance, timer, scoring, hidden information and
   terminal rules. Use the authoritative engine when one already exists.
2. Extract a shared pure engine where live input and AI currently diverge.
3. Define imperfect reference strategies using only information a player sees.
   Add inactivity, boundary timing and relevant alternate-input patterns.
4. Add replay and actual UI input parity tests before changing ability settings.
5. Add its adapter to this report and compare complete fields across skill,
   roster and seed variations. Retain exact inputs for unusual results.
6. Keep a separate holdout seed range and review adverse tails and capped ties.

Standard Quick Tap variants, Deck of Light, the final-day number stages and the
remaining timing, memory and physics games still need their own adapters. The
earlier broad balance PR remains separate; this pilot does not import its
other score adjustments. Existing shared-engine games such as Boxpocalypse
and Bigg Gates can contribute reference policies without rewriting their rules.

This removes repeated manual gameplay from regression checking. Limited device
feedback is still needed for feel, accessibility and checking the assumptions
about real human performance. A synthetic report alone cannot establish those.
