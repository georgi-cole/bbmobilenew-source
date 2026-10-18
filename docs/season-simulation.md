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
