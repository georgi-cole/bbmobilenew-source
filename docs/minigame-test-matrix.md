# Active minigame test matrix

## How this stays complete

This matrix covers the active release-test registry entries. Retired and legacy games are excluded; zero-weight inactive entries are also excluded unless they have an explicit active VIP or finale route. CI runs a seeded visible-control full playthrough at each in-scope game’s minimum and declared maximum player counts on desktop (using four players when a maximum is not declared), plus mount, exit, and visual checks at desktop, Pixel 7, and 320×568 phone sizes. Its executable source is `tests/helpers/minigameQualityMatrix.ts`; the completeness test uses the shared predicate in `tests/helpers/minigameCertificationScope.ts`, verifies cited files exist, and checks that every in-scope key appears in this document.

Evidence codes: **L** logic/rules, **C** real component, **H** host/integration, **B** registry-driven Playwright. `B configured` records the baseline before the execution entry below; executed results are listed separately.

## Browser journey scenario policy

The full-playthrough suite runs each in-scope active game through real Minigame Lab controls and checks the parent host receives one complete result. Standard games use the declared minimum and maximum roster sizes at separate deterministic seeds when those endpoints differ; games without a declared maximum use four players as the default upper scenario. The builder removes duplicate player-count scenarios. Those endpoints exercise roster boundaries, while focused rule tests own the exact tie, timeout, elimination, invalid-input, power, and duplicate-callback branches.

Three deliberate cost/fixture exceptions are explicit in the executable scenario builder: Deck of Light (Card Clash) and the four Find Your Twin editions use one four-player journey because their rounds/embedded platform runtime are substantially slower; Chain of Greed uses its minimum two-player roster because its multi-round duel can take several minutes. Chain rules are covered at two through six players in the seeded logic suite. These exceptions remain visible in the nightly and release artifacts; they must not be described as maximum-player browser coverage.

Responsive coverage mounts every playable entry, checks instructions, host exit/partial-result behavior, exactly-once Continue, and horizontal overflow at desktop, Pixel 7, and 320×568 viewports. Complete seeded journeys run on desktop Chromium. Native Android/iOS hardware, sensor input, and operating-system interruption/resume are outside Playwright emulation and still need device validation.

## Contracts common to every row

| Field              | Current contract                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supported modes    | Season competition through MinigameHost and registry-backed Minigame Lab. The surrounding season engine decides LOH/POS or special-prize context. |
| Human path         | The real interactive React component is mounted by MinigameHost.                                                                                  |
| AI path            | Seeded competition AI supplies participant results under the same ranking contract.                                                               |
| Spectator path     | Host/spectator outcome uses the same participants and authoritative-result contract; dedicated presentation varies by game.                       |
| Partial completion | Exit is visible as partial and explicit Continue is required before parent acceptance.                                                            |
| Retry/dismissal    | Retry resets one attempt; dismissal, rerender, and late callbacks cannot commit twice.                                                            |
| Result shape       | Authoritative games return a finite value and participant-owned winner; raw games return a finite human value for host ranking.                   |
| Season effects     | Result, announcement, reward, history, and phase transition are applied exactly once by the parent.                                               |

The active registry currently omits game-specific participant bounds for most games. The runtime default is minimum 1 with no registry maximum, while the QA lab constrains interactive previews to 2–16. This is recorded as a shared design gap; the matrix does not pretend the default is a verified game-specific maximum.

## Rules, input, timing, and ties

| Registry ID               | Display name                 | Primary input           | Direction   |    Registry timeout | Tie / qualification policy                                           |
| ------------------------- | ---------------------------- | ----------------------- | ----------- | ------------------: | -------------------------------------------------------------------- |
| `quickTap`                | Quick Tap Race               | rapid tap               | higher      |                30 s | effective taps, lower tiebreaker, stable order                       |
| `quickTapSeasons`         | Quick Tap Race 2: Seasons    | rapid tap/season choice | higher      |                40 s | season-adjusted points; seeded participant order                     |
| `memoryMatch`             | Memory Colors                | ordered colors          | placement   |               owned | furthest round, fewer mistakes, faster time                          |
| `timingBar`               | Timing Bar                   | stop and lock           | higher      |               owned | locked accuracy, authoritative secondary result                      |
| `estimationGame`          | Estimation                   | numeric submit          | higher      |               owned | average accuracy, lower tiebreaker                                   |
| `holdWall`                | Hold the Wall                | press and hold          | survival    |               owned | last holding; seeded drop order at boundary                          |
| `famousFigures`           | Famous Figures               | guess/hints             | higher      |               owned | total clue score, authoritative result                               |
| `silentSaboteur`          | Silent Saboteur              | target/vote             | elimination |               owned | victim decides ordinary tie; final-two jury rule                     |
| `majorityRules`           | Majority Rules               | choice/vote             | elimination |               owned | authoritative seeded round policy                                    |
| `pressurePlank`           | Pressure Plank               | timed balance           | higher      |               owned | raw score, lower tiebreaker                                          |
| `colorMatch`              | Color Match                  | color choice            | higher      |                25 s | accuracy, lower tiebreaker                                           |
| `logicLocks`              | Vault Cracker                | lock controls           | higher      |               owned | completion, then seeded duration/accuracy                            |
| `snake`                   | Serpentine                   | direction               | higher      |               owned | score, seeded tiebreak data                                          |
| `cardClash`               | Deck of Light                | card/peek               | bracket     |               owned | authoritative seeded bracket                                         |
| `hangman`                 | Verdict Board                | letters                 | higher      |               owned | round score, deterministic engine order                              |
| `tiltLabyrinth`           | Tilt Labyrinth               | tilt/drag/keys          | lower       |               owned | fastest valid completion                                             |
| `threeDigitsQuiz`         | Number Trivia                | numeric choice          | higher      |               owned | correctness/speed, lower tiebreaker                                  |
| `capitalization`          | Capitalization               | text entry              | higher      |               owned | component-owned full standings                                       |
| `tetris`                  | Fit Me In                    | move/rotate             | higher      |               owned | authoritative score/order                                            |
| `minesweeps`              | Minesweeps                   | reveal/flag             | higher      |               owned | authoritative solve/accuracy                                         |
| `dontGoOver`              | Don't go over                | numeric estimate        | elimination |               owned | over loses; equal valid guess loses on slower time; all-over repeats |
| `blackjackTournament`     | Blackjack Tournament         | card actions            | bracket     |               owned | tournament push/bracket rules                                        |
| `riskWheel`               | Risk Wheel                   | spin/decision           | placement   |               owned | seeded authoritative bracket                                         |
| `wildcardWestern`         | Wildcard Western             | choice/duel             | placement   |               owned | seeded authoritative duel                                            |
| `castleRescue`            | Find Your Twin               | platform controls       | higher      |               150 s | rescue score, lower tiebreaker                                       |
| `castleRescue2`           | Find Your Twin 2: Lost Again | platform controls       | higher      |               150 s | rescue score, lower tiebreaker                                       |
| `glass_bridge_brutal`     | The Crystal Path             | path choice             | elimination | dynamic; 160 s base | survival and deterministic finish order                              |
| `crystal_path_shattered`  | Crystal Path: Infinity       | path choice             | elimination |               160 s | authoritative survival/order                                         |
| `trapAuction`             | Trap Auction                 | bid/target              | custom      |               owned | authoritative auction tie rule                                       |
| `chainOfGreed`            | Chain of Greed               | split/steal/vote/duel   | placement   |               owned | only a genuinely tied vote enters deterministic duel                 |
| `batteryLow`              | Battery Low                  | charge allocation       | survival    |               owned | authoritative charge/elimination result                              |
| `houseOfDarkness`         | Deck of Darkness             | memory-card selection   | survival    |               owned | rounds, lifespan, damage, mistakes, time, stable order               |
| `castleRescueRemastered`  | Find Your Twin               | movement/touch          | higher      |               150 s | rescue score, deterministic tiebreaker                               |
| `castleRescue2Remastered` | Find Your Twin 2: Lost Again | movement/touch          | higher      |               150 s | rescue score, deterministic tiebreaker                               |
| `mysticChamber`           | Mystic Chamber               | powers/target/box       | higher      |               owned | final Power, Round 6 gain, seeded sigil                              |
| `finalThreeCircuit`       | Final Three Circuit          | finale stages           | higher      |             dynamic | total score across six authoritative stages                          |
| `downMemoryLane`          | Down Memory Lane             | buzz and answer         | custom      |               owned | first player to lose all five lives loses                            |

?Owned? means the component has no registry-wide timeout; its round state machine owns timing. Late timers still cannot overwrite an accepted result.

## Baseline evidence and previously identified per-game risk

| Registry ID               | Logic evidence                            | Component evidence       | Host/integration evidence   | Browser      | Highest uncovered risk                                    |
| ------------------------- | ----------------------------------------- | ------------------------ | --------------------------- | ------------ | --------------------------------------------------------- |
| `quickTap`                | quickTapRaceCanvasEngine                  | quickTapRace.component   | ?                           | B configured | dedicated real-host Vitest                                |
| `quickTapSeasons`         | quickTapSeasonsExperiment                 | QuickTapSeasons          | ?                           | B configured | season and mystery-box choices need focused host evidence |
| `memoryMatch`             | memoryColors.competition                  | styles only              | ?                           | B configured | interactive component completion                          |
| `timingBar`               | timingBar.logic                           | timingBar.component      | ?                           | B configured | real-host callback/store                                  |
| `estimationGame`          | estimationGame.competition                | ?                        | minigameHost.estimationGame | B configured | focused component path                                    |
| `holdWall`                | holdTheWallSlice                          | hold timeout/effects     | minigameHost.holdWall       | B configured | background visibility                                     |
| `famousFigures`           | scoring + match flow                      | FamousFiguresComp        | ?                           | B configured | real-host callback/store                                  |
| `silentSaboteur`          | rules/helpers                             | SilentSaboteurComp       | integration + final two     | B configured | mobile final-two presentation                             |
| `majorityRules`           | rules/logic                               | majorityRules.component  | host seed + integration     | B configured | long mobile rounds                                        |
| `pressurePlank`           | competition                               | ?                        | ?                           | B configured | raw result/store consistency                              |
| `colorMatch`              | rules/react                               | colorMatch.component     | host seed                   | B configured | low                                                       |
| `logicLocks`              | canvas engine                             | CodeBreakerComp          | minigameHost.codeBreaker    | B configured | short canvas viewport                                     |
| `snake`                   | competition + AI                          | results component        | minigameHost.snake          | B configured | simultaneous key/touch                                    |
| `cardClash`               | competition                               | peek component           | host seed                   | B configured | late animation after exit                                 |
| `hangman`                 | engine                                    | HangmanChallengeComp     | minigameHost.hangman        | B configured | key/touch overlap                                         |
| `tiltLabyrinth`           | integration/collision                     | TiltLabyrinthComp        | integration                 | B configured | native motion sensor                                      |
| `threeDigitsQuiz`         | numberTrivia                              | ?                        | minigameHost.numberTrivia   | B configured | focused component path                                    |
| `capitalization`          | capitalization.logic                      | capitalization.component | ?                           | B configured | callback/store consistency                                |
| `tetris`                  | rules                                     | ?                        | integration                 | B configured | held-key/touch geometry                                   |
| `minesweeps`              | rules/react                               | explosion/results        | minigameHost.minesweeps     | B configured | long-press/right-click parity                             |
| `dontGoOver`              | outcome/helpers                           | spectator                | host + integration          | B configured | full three-life final E2E                                 |
| `blackjackTournament`     | rules/slice                               | styles only              | integration                 | B configured | interactive mobile completion                             |
| `riskWheel`               | rules/slice/idempotency                   | completion               | host seed                   | B configured | reduced-motion correctness                                |
| `wildcardWestern`         | helpers/slice                             | completion               | ?                           | B configured | real-host callback/store                                  |
| `castleRescue`            | ranking/rules/timeout                     | continue component       | ?                           | B configured | long canvas lifecycle                                     |
| `castleRescue2`           | shared ranking/rules                      | continue component       | ?                           | B configured | second variant host and long canvas lifecycle             |
| `glass_bridge_brutal`     | The Crystal Path rules and parallel turns | interactive component    | host seed                   | B configured | short viewport/final-minute concurrency                   |
| `crystal_path_shattered`  | logic                                     | async flow               | integration                 | B configured | delayed timer after unmount                               |
| `trapAuction`             | logic/rules                               | trapAuction.component    | ?                           | B configured | bid/store idempotency                                     |
| `chainOfGreed`            | logic/rules                               | ChainOfGreed.component   | integration                 | B configured | double-vote/duel input                                    |
| `batteryLow`              | batteryLow.logic                          | ?                        | ?                           | B configured | component/store/host coverage                             |
| `houseOfDarkness`         | survival rules + AI                       | HouseOfDarknessComp      | registry integration        | B configured | long browser terminal path                                |
| `castleRescueRemastered`  | castle-rescue rules                       | remasteredRuntime        | ?                           | B configured | iframe success/timeout and phone-sized result             |
| `castleRescue2Remastered` | shared rescue rules                       | remasteredRuntime        | ?                           | B configured | Part 2 iframe success/timeout and phone-sized result      |
| `mysticChamber`           | seeded action/box matrix                  | ?                        | registry only               | B configured | six-round real-component completion and season result     |
| `finalThreeCircuit`       | stage scoring and puzzles                 | FinalOverrideChallenge   | ?                           | B configured | every finale stage through the real host                  |
| `downMemoryLane`          | life and question rules                   | ?                        | registry evidence           | B configured | five-life duel and season result                          |

## Interpretation

`quickTapSeasons` is covered by the same seeded AI-audit contract as the original Quick Tap game, with its season modifiers documented in the registry quality profile.
`castleRescue2` is the second registry variant of Find Your Twin and shares the documented ranking and continuation contract.

The catalog proves registry completeness and keeps the known evidence/gaps visible. The execution record below separates completed browser checks from remaining game and device risks.

## Full active challenge-map execution — 2026-10-21

The shared certification predicate selected 37 active registry entries, excluding retired, legacy, and inactive games. Four games already completed earlier in this thread—The Crystal Path, Crystal Path: Infinity, Majority Rules, and Quick Tap Race—were reused rather than rerun. The remaining 33 active games received 59 seeded full-playthrough scenarios on desktop Chromium, plus the driver-registry completeness assertion. All 59 gameplay scenarios and the completeness assertion passed.

The 33 remaining games also passed 99 responsive checks: start and partial-result screens, host exit/Continue behavior, and horizontal overflow on desktop Chromium, Pixel 7-sized Chromium, and a 320×568 Chromium viewport. Earlier responsive evidence for the four reused games was not repeated. The focused matrix completeness test passed 6/6 checks. The previously run minigame rule/component suite was reused rather than repeated.

## Focused active-map follow-up — 2026-10-21

To add coverage without replaying completed journeys, Mystic Chamber received two focused checks. Its seeded gameplay suite passed 10/10 tests, forcing every offered power, all six Forbidden Box result branches, targeted twists, protection and doubled-effect cases, final-score ties, and rosters of two through five across seven seeds. A real Minigame Lab phone-sized Chromium run at 390×844 passed the power selection, target/confirmation, visible result/Continue, and horizontal-overflow checks. Physical Android/iOS sensor behavior and OS interruption/resume still require device testing.

This establishes seeded browser evidence for the covered journeys, not a mathematical guarantee over every random state or every combination of special powers. Exact rule branches remain owned by the focused logic/component tests. Playwright viewports do not validate physical-device sensors, touch hardware, or operating-system interruption and resume; no physical Android or iOS device was connected.
