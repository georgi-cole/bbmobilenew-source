# Human-like season simulation

The season simulator is a Playwright framework that plays through visible player controls and produces a replayable evidence report. It extends the existing browser journeys rather than adding a game-engine shortcut: a detached development-only state probe verifies what the UI did, but tests cannot dispatch actions or set winners through it.

## What is included

- Fifteen reusable personas with seeded decision tendencies.
- Mode adapters for Classic, Vox Populi, Cupid's Arrow, and Surveyeval.
- A coverage ledger that distinguishes verified, missed, invalid, and assisted objectives.
- A registry-complete minigame driver table covering every current playable game, including both premium remasters and the two finale-only games.
- An auditor for state consistency, participant/nominee validity, phase/day progression, duplicate feed identities, browser errors, enabled-control visibility, and horizontal overflow.
- JSON and Markdown reports, a final screenshot, exact roster/season/actor seeds, and an action timeline as Playwright test artifacts.

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
