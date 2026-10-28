# Profiles, season contestants, and performance

Measured 28 October 2026 (Europe/Sofia). Keep three optional profiles. The final
simulated mobile comparison shows a clear improvement to returning-player startup.
Continue Last improved modestly, with substantial variation, and still takes about
three seconds. These results do not establish physical-phone performance or
justify reducing the profile cap to one or two.

## Main integration

The measurements below were collected in the original benchmark checkout, before
integration onto main at `c907c1312`. Integration retains main's newer 35-look
character catalog, Changing room, weather-permission flow, gameplay changes, and
launch analytics. The integrated version is validated separately; these timings
are historical measurements, not a new benchmark of that combined version.

Integration validation passed: `npm run check:pr` (170 core lifecycle tests,
65 marketplace tests, 11 marketplace-policy tests, formatting, ESLint, and
TypeScript), 83 focused feature tests, and five compact-mobile save/launch/resume
journeys. The production dependency audit found zero vulnerabilities. Live and
saved photo retention is covered by a focused profile-edit regression. The Git
hook installer also handles worktree metadata while keeping pre-push checks active.

## Controlled loading comparison

Seven observations per build, three populated profiles, 20 archives per profile.
The control restores the previous loading paths while retaining the same profile
and season ownership rules. Both builds were measured after host memory recovered,
sequentially, without compilation or tests competing for resources.

| Measurement                        | Previous loading | Final loading | Observed change           |
| ---------------------------------- | ---------------- | ------------- | ------------------------- |
| Warm visible startup, median       | 2.42 s           | 1.72 s        | 28.9% lower; about 0.70 s |
| Continue Last to game, median      | 3.21 s           | 2.95 s        | 8.1% lower; about 0.26 s  |
| Full Play-to-game interval, median | 3.50 s           | 3.39 s        | 3.1% lower; about 0.11 s  |
| Restore saved state, median        | 83.0 ms          | 83.0 ms       | Unchanged                 |
| Synchronous autosave p95           | 11.4 ms          | 9.8 ms        | Save path unchanged       |
| Asynchronous flush p95             | 13.3 ms          | 13.4 ms       | Essentially unchanged     |
| Resumed app JavaScript heap        | 14.11 MB         | 14.02 MB      | Essentially unchanged     |

Startup ranges were 1.79–2.87 s before and 1.37–1.77 s after. This is the strongest
result. Continue Last ranges overlap: 2.41–5.51 s before and 2.27–3.63 s after.
The observed resume improvement is not a promise of a consistent 8% gain or
sub-three-second phone performance. Measuring the full Play-to-game interval also
prevents shifting work before Continue Last from appearing to be an overall gain.

Startup means a warmed reload to the returning-player menu. The first-session
splash retains its existing five-second minimum; this is not a cold-first-launch
comparison. Incidental autosave timing differences are not attributed to the UI changes.

## Loading changes retained

- Return visits use the existing loading screen while required assets become ready,
  avoiding repeated launch-artwork decoding and its exit animation. Image progress
  updates yield to urgent rendering.
- Release builds avoid loading unavailable debug panels and their observers.
- Screen-specific House of Cards and Game Over styles load with their owning
  screens, preserving stylesheet order. The entry stylesheet shrank from 159,103
  to 109,063 bytes, or 31.5% uncompressed. This is an asset-size measurement.
- The roster no longer measures height for a CSS variable that no stylesheet used.
  Initial layout measurements remain immediate; subsequent resize/observer work is
  coalesced, and unchanged dock styles are not rewritten.
- The public-favorite overlay loads when its existing display condition is reached.
  Its rewards, power callbacks, and eligibility rules are unchanged.

Speculative route preloading and deferring a shared animation dependency were not
retained because trials did not establish a reliable overall improvement. The
performance follow-up leaves persistence APIs and gameplay rules unchanged. Earlier
profile work also removed a duplicate IndexedDB scan and eager public-image globs.

## Implemented profile and character behavior

- New profile creation is capped at three. Existing fourth/fifth profiles and their
  saves remain available; new creation requires being below the cap.
- Character changes are optional for each new season. Start Season reuses the
  remembered contestant without opening the editing form. Successful launches
  remember the selection; explicit profile edits update future-season defaults.
- Each saved season retains its own contestant, including gameplay-related age,
  sex, hometown, profession, backstory, and story roles. Editing defaults cannot
  rewrite an active save. Legacy saves derive their contestant from the saved
  player. Real-player admission remains separate from fictional character age.
- Wallets and continuing progression remain profile-owned. Guest adoption retains
  the season's contestant, and photo cleanup preserves references from saved runs.
- Paid launch gates, power limits, and offers remain unchanged. The marketplace
  maintenance log records the review.

## Benchmark method and limits

Production builds, Chromium 156.0.8078.47, 360 × 800 touch viewport, sixfold CPU
slowdown on an Intel Core Ultra 7 155H host with approximately 16.7 GB RAM. Each
observation uses a fresh browser context; scenario order rotates. App assets are
warmed before the measured reload, permissions are resolved, and cast randomness
is fixed. JavaScript heap is sampled after forced garbage collection.

Each profile has two generated populated run slots, 400 feed entries per slot,
normally initialized game/social structures, and 100 wallet records. The populated
fixture has 20 completed-season archives per profile and seven observations per
profile count. The maximum-history fixture has 1,000 archives and three observations.
Each observation includes 12 isolated autosaves. Classic is resumed; the second
slot supplies inactive save volume, not a Surveyeval gameplay benchmark.

Continue Last measures the click to visible Main navigation, not native app
foregrounding. Full entry also includes opening the mode menu. Autosave p95 measures
synchronous snapshot construction/serialization/save work; asynchronous flush is
reported separately. Times below are medians unless marked p95. Heap uses decimal MB.

This synthetic fixture does not replay hundreds of seasons, include uploaded photos,
or reproduce growing late-game Reality fact stores. CPU slowdown is not a calibrated
phone. Heap excludes browser-process, native, and GPU memory. Frame gaps do not
establish physical-device gameplay FPS. No controlled pre-optimization
maximum-history rerun was collected; the stress table assesses the final build.

## Final build: 20 completed seasons per profile

| Profiles | Visible startup | Continue Last | Full Play-to-game | State restore | Autosave p95 | App JS heap |
| -------- | --------------- | ------------- | ----------------- | ------------- | ------------ | ----------- |
| 1        | 1.74 s          | 2.94 s        | 3.33 s            | 81.7 ms       | 11.3 ms      | 12.54 MB    |
| 2        | 1.81 s          | 3.02 s        | 3.73 s            | 82.3 ms       | 11.4 ms      | 13.26 MB    |
| 3        | 1.72 s          | 2.95 s        | 3.39 s            | 83.0 ms       | 9.8 ms       | 14.02 MB    |
| 5        | 1.62 s          | 2.96 s        | 3.47 s            | 84.0 ms       | 9.9 ms       | 15.35 MB    |

Three versus one adds approximately 1.49 MB of retained JavaScript heap. Storage
initialization rises from 24.6 to 35.5 ms. Profile count does not multiply the active
simulation; restoration and autosave work remain similar. Visible timings are not
monotonic with count, so these differences do not establish a speed benefit from
limiting players to one or two profiles.

## Final build: 1,000 completed seasons per profile

| Profiles | Storage initialization | Visible startup | Continue Last | Full Play-to-game | Autosave p95 | App JS heap |
| -------- | ---------------------- | --------------- | ------------- | ----------------- | ------------ | ----------- |
| 1        | 46.4 ms                | 1.67 s          | 2.87 s        | 3.17 s            | 11.6 ms      | 15.16 MB    |
| 2        | 66.5 ms                | 1.69 s          | 3.24 s        | 3.54 s            | 10.4 ms      | 18.40 MB    |
| 3        | 92.3 ms                | 1.74 s          | 3.30 s        | 3.70 s            | 11.0 ms      | 21.68 MB    |
| 5        | 138.0 ms               | 1.69 s          | 2.78 s        | 3.10 s            | 8.2 ms       | 28.35 MB    |

Three versus one adds approximately 6.52 MB of JavaScript heap in this stress case.
Serialized-cache estimates are 5.88 MB for one, 17.65 MB for three, and 29.42 MB for
five; these are not additional measured process RAM. Across the final matrices,
asynchronous flush p95 ranges from 11.6 to 17.5 ms.

The remaining profile-related cost is retained inactive save/history data: the
persistence cache currently reads all records at startup. Loading inactive payloads
on demand is a possible future improvement requiring separate save-safety work.
Actual long-season saves and physical low-end devices should guide that decision.
The present measurements support keeping three profiles, not another cap reduction.

## Benchmark-checkout validation and reproducibility

- `npm run check:pr` passed after the final code edit: formatting, focused/disabled
  test guard, zero-warning ESLint, TypeScript, marketplace checks, 157 core lifecycle
  tests, 69 marketplace tests, nine character-catalog tests, and 11 marketplace-policy tests.
- Production dependency audit passed with zero vulnerabilities.
- The final focused profile/contestant/roster run passed 43 tests.
- Five compact-mobile browser journeys passed: new-player launch, exact-phase
  save/reload/resume, retained contestant after edits/reload, legacy five-profile
  preservation with the three-profile creation cap, and abandon-season cleanup.
- A broader run passed 113 tests and failed 18: 14 announcement expectations, one
  action-bar live-vote expectation, and three responsive-layout budget expectations.
  These same failures were reproduced against the previous loading sources. The
  entire repository suite is not claimed to pass. Local evidence is retained in
  `.tmp-loading-broader-final.log`, `.tmp-loading-baseline-tests.log`, and
  `.tmp-loading-layout-baseline-tests.log`.

Final raw results:
[fresh unchanged-loading control](../artifacts/profile-performance/loading-control-recovered.json),
[populated profiles](../artifacts/profile-performance/loading-final-populated.json),
and [maximum history](../artifacts/profile-performance/loading-final-max-history.json).
Commands and measurement definitions are in the
[benchmark README](../scripts/profile-performance/README.md).

The original profile-count assessment remains in `mobile-populated.json` and
`mobile-max-history.json`. Exploratory trial results are excluded from the final
comparison. The older `baseline.json` uses a different, smaller runtime-only fixture
and is not a valid before/after comparator for these tables.
