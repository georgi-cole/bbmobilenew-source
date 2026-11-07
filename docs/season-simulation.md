# Season simulation

The season simulator has a browser path for testing visible gameplay and a faster headless path for comparing seeded season outcomes. Both record the roster, season, and player-action seeds.

Run one full season with:

```bash
npm run test:season-sim -- --full-season
```

Run ten independently seeded seasons with:

```bash
npm run test:season-sim -- --runs=10
```

Full-season runs skip competitions through the game's visible forfeit menu and skip optional Confessional visits. Required votes and ceremony decisions still go through the normal UI. Batches use the lower-cost compact mobile viewport by default; pass `--viewport=iphone-17` for the iPhone 17 viewport. The default batch budget is 420 actions and 40 in-game weeks. Override it with `--max-actions=600` or `--max-days=50` if a mode needs more time. `--mode=classic|voxPopuli|cupidArrow|survival` selects a mode, and `--persona=strategic-operator` selects the simulated human's play style.

For fast Classic batches that do not launch a browser, use:

```bash
npm run test:season-sim -- --headless --runs=50 --seed=12345
```

Headless runs advance the real season reducers and AI strategy systems directly, including synchronous AI social turns in both weekly social phases. Relationship actions affect the season, and reports count those actions and alliance, pact, strategy-meeting, defection, leak, and romance events. They replace visible LOH minigames with seeded scores based on the selected human competition skill and each AI's competition identity. Safety and Final 3 outcomes use the game's seeded fast paths. The runner auto-resolves required human choices, skips optional confessionals, weekends, and presentation delays, and does not spend the human's social budget or answer incoming conversations. Use it to compare AI political behavior and broad season outcomes quickly; use the browser path when evaluating a human social-action strategy or visual gameplay.

The runner assigns each repeat a stable, distinct roster, season, and action seed. Set `SEASON_SIM_ROSTER_SEED`, `SEASON_SIM_SEASON_SEED`, and `SEASON_SIM_ACTOR_SEED` to replay a known batch. Pass `--batch-id=my-change-10-run` to choose a readable batch name.

Each run writes a compact JSON report and a progress file under `test-results`. The batch summary is written to `test-results/season-simulation-batches/<batch-id>.md` and `.json`. To rebuild a summary from saved reports, run:

```bash
node scripts/summarize-season-simulations.mjs --batch-id my-change-10-run
```

The summary reports wins, placements, jury and Final 3 rates, human competition wins and nominations, AI-only factions and pacts, strategic meetings, coordinated target moves, defections, leaks, romances, terminal reasons, and missing runs. A known elimination counts as a human loss and records the player's placement. Classic mode ends the human's session when they are eliminated, so the runner may not reach the AI champion; the summary calls this out separately from a fully recorded season winner. Runs that stop at their action or week budget are marked incomplete rather than counted as losses.

## Late-season browser checkpoints

The opt-in late-game journey samples Days 5–15 and continues finite seasons through the finale. It saves real browser profile and durable-run records at Day 5, Day 10, and Final 3 states. Vox checkpoints can capture the mode's visible spectator path after the player leaves. Cupid checkpoints can capture the test-only spectator path used to inspect a full AI finale after the player leaves; this does not change the player's normal season ending. Surveyeval checkpoints require an active player. Its Day 5 checkpoint uses the first autosaved phase after the QA-assisted setup, which can be an announcement rather than `week_start`. Checkpoints live in `.cache/season-checkpoints/` and are reusable across Playwright runs. Their metadata records the mode, three seeds, exact phase, player status, and whether QA controls accelerated the opening setup. The test skips minigame play through visible exit controls.

In PowerShell, generate or refresh checkpoints for a mode with:

```powershell
$env:RUN_LATE_GAME_PERFORMANCE = '1'
npx playwright test e2e/playwright/late-game-performance.spec.ts --project=compact-mobile-chromium --grep voxPopuli
```

Replay from a saved Day 10 or finale checkpoint. The checkpoint supplies its
mode and three seeds, so the runner selects the matching journey automatically:

```powershell
$env:SEASON_SIM_RESUME_CHECKPOINT = '.cache/season-checkpoints/voxPopuli-day-10.json'
npx playwright test e2e/playwright/late-game-performance.spec.ts --project=compact-mobile-chromium
```

Replay restores the saved browser records in an isolated test context, opens the Play menu, and uses **Continue Last** (or Surveyeval's **Resume**). It validates mode, day, phase, player status, and game/run ID before continuing. Set `SEASON_SIM_CHECKPOINT_DIR` to use another cache directory. If a game rule or save format changes, regenerate the checkpoint from a visible journey.

Set `SEASON_SIM_REPLAY_MAX_DAYS=11` for a short Day 10 replay smoke test. Set `SEASON_SIM_REPLAY_ACCELERATE_TO_DAY=10` to advance a restored Day 5 checkpoint with QA controls before resuming visible play. Set `SEASON_SIM_CAPTURE_ON_REPLAY=1` to create later checkpoints while continuing from an earlier one. A replayed finale checkpoint runs to season completion.

The JSON report includes state-section sizes, slow Redux actions, social and
alliance phase steps, long browser tasks, and React render times for the game
route and finale overlays. Set `SEASON_SIM_PROFILE_PRODUCTION=1` to disable
Redux development checks and DevTools during this diagnostic replay. It still
runs a development React build, so compare the same checkpoint and browser
configuration rather than treating its timings as production-device numbers.
When the jury path runs, Playwright attaches `jury-transition.json` with phase
changes, visible controls, pending juror work, and scheduled, completed,
cancelled, or overdue animation timers. These diagnostics run only with
`debugPerformance=1`.

The separate opt-in Surveyeval seed search reports whether each seed still has
an active human at Day 15. Set `SURVIVAL_DISCOVERY_VISIBLE_FROM_DAY=5` to play
the late days through the visible controls after a QA-assisted opening. The
default value, 15, uses rapid QA cycles for broad screening; its outcomes can
differ from visible play and must be verified with the visible setting. The
normal season helper never chooses an ad recovery. Tests of that paid recovery
must call its dedicated helper explicitly.

For a quick Day 5 Surveyeval checkpoint, set `SURVIVAL_DISCOVERY_VISIBLE_FROM_DAY=5` and `SURVIVAL_DISCOVERY_SETUP_ONLY=1`. Replay reads its seeds from the checkpoint. To verify a seed with no assisted setup, set `SURVIVAL_DISCOVERY_VISIBLE_FROM_DAY=1` and `SURVIVAL_DISCOVERY_CAPTURE_CHECKPOINTS=1`. The fully visible late-day seed recorded on 6 November 2026 uses roster `757093529`, season `3359619948`, and action `2649029611`; it reached Day 13 without ad recovery. Its Day 5 and Day 10 checkpoints are in `.cache/season-checkpoints/full-visible-candidate17/`.
