# Human-like season simulation

The browser simulator plays through visible controls and produces a replayable evidence report. A separate headless Classic runner advances the production game reducers and AI systems directly for quick seeded season batches. The browser state probe remains read-only; headless automation runs inside the test process.

## What is included

- Fifteen reusable personas with seeded decision tendencies.
- Mode adapters for Classic, Vox Populi, Cupid's Arrow, and Surveyeval.
- A coverage ledger that distinguishes verified, missed, invalid, and assisted objectives.
- A registry-complete minigame driver table covering every current playable game, including both premium remasters and the two finale-only games.
- An auditor for state consistency, participant/nominee validity, phase/day progression, duplicate feed identities, browser errors, enabled-control visibility, and horizontal overflow.
- JSON and Markdown reports, a final screenshot, exact roster/season/actor seeds, and an action timeline as Playwright test artifacts.
- A headless Classic runner that skips browser startup, optional confessionals, weekends, and competition animations while preserving seeded season, AI social turns, and decision logic.

The initial smoke uses a fresh Classic profile and a Strategic Operator. It validates profile creation, season launch, and the first visible Day 1 controls within a PR-sized action budget. Longer simulations opt into Social, ceremony, minigame, and finale objectives through `SimulationRunConfig`; a partial competition is reported as partial and is never represented as a normal minigame completion.

## Commands

Run the deterministic iPhone 17-sized smoke:

```powershell
npm run test:season-sim
```

Run the smoke on both representative mobile viewports:

```powershell
npm run test:season-sim:full
```

Run fifty fast, seeded Classic seasons without opening a browser:

```powershell
npm run test:season-sim -- --headless --runs=50 --seed=12345
```

Headless runs simulate LOH results with seeded scores based on AI competition identities and the selected human skill. They run the production AI social turns synchronously in both weekly social phases, so AI relationship actions affect the season; reports include AI social-action counts and alliance, pact, meeting, defection, leak, and romance events. They resolve safety and Final 3 phases through seeded game logic, and automatically handle required human decisions. They do not model discretionary human social-budget actions or answer the human's incoming conversations. They skip visual minigame play, optional confessionals, weekends, and presentation pauses. Use these batches to compare AI political behavior and broad season outcomes; use the browser path to measure a specific human social strategy or visible gameplay.

For a live terminal display while the journey runs, use `npm run test:season-sim:watch` with the same environment variables. It refreshes the current day, phase, last action, findings, objective count, and elapsed time once per second.

Replay with another exact seed. These environment variables are read before the browser starts, so they control both season construction and the persona's separate action stream:

```powershell
$env:SEASON_SIM_ROSTER_SEED = '0x4f1bbcdc'
$env:SEASON_SIM_SEASON_SEED = '0x6d2b79f5'
$env:SEASON_SIM_ACTOR_SEED = '0x7a11ce42'
npm run test:season-sim
```

Vox Populi, Cupid's Arrow, Surveyeval, and long finale scenarios are configured through `SimulationRunConfig` in `e2e/playwright/season-sim/runner.ts`. Paid formats require the existing development entitlement build flag, for example:

```powershell
$env:VITE_VIP_DEV_ENTITLEMENT = 'true'
npm run test:season-sim:full
```

The base spec can also be configured without editing TypeScript. Valid values are `classic`, `voxPopuli`, `cupidArrow`, and `survival` for `SEASON_SIM_MODE`; any exported persona id for `SEASON_SIM_PERSONA`; `normal` or `vip` for `SEASON_SIM_ENTITLEMENT`; and `competent`, `mediocre`, or `thrower` for `SEASON_SIM_COMPETITION_SKILL`.

```powershell
$env:SEASON_SIM_MODE = 'voxPopuli'
$env:SEASON_SIM_PERSONA = 'chaos-agent'
$env:SEASON_SIM_ENTITLEMENT = 'vip'
$env:SEASON_SIM_COMPETITION_SKILL = 'competent'
$env:SEASON_SIM_MAX_ACTIONS = '1000'
$env:SEASON_SIM_MAX_DAYS = '10'
$env:VITE_VIP_DEV_ENTITLEMENT = 'true'
npm run test:season-sim:full
```

That browser flag verifies entitlement-gated product behavior. The PR-sized commands skip only the synchronous unload-autosave callback, which is tested separately because it otherwise makes browser teardown block on a full save serialization; the simulator does not alter game decisions or results. Real purchases remain native iOS/Android work because browser billing is intentionally rejected by the product. Consequently, the mid-season Normal-to-VIP purchase flow is deliberately deferred: it needs a native billing test harness or a product-approved billing seam rather than a browser-side entitlement mutation.

## Adding a scenario or game

1. Add a scenario objective in `coverage.ts`, including mode and entitlement applicability.
2. Add a persona-neutral UI action or a mode-adapter rule where it belongs.
3. Add a minigame input profile in `minigames.ts` whenever the registry changes. The simulation fails immediately if any playable registry entry lacks one.
4. Add assertions to the auditor only when their rule is valid for every mode where they run.

Use an assisted checkpoint only for rare, expensive branches such as late finale states. Mark its evidence `assisted`; it is intentionally separate from a fresh Day 1 journey.
