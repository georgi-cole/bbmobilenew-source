# Deck of Light and Deck of Darkness: execution plan

Status: implementation authorized by the user and applied in the source checkout. Focused rule/AI tests and the app TypeScript check pass. Balance values and full visual behavior still need playtesting in the Lab. This document preserves the original design rationale and the remaining manual verification checklist.

## 1. Product decisions

- Rename the original game from Deck of Cards to **Deck of Light**. Its sibling stays **Deck of Darkness**.
- Keep Darkness's survival-memory identity: lifespan, rising danger, round omens, six-round Depth Run, and Endless mode.
- Keep Light's memory tournament: four preliminary boards, delayed eliminations, then a shared-board duel between two finalists. Add decisions inside that structure.
- All players receive the gameplay changes and portrait finales. Standard users retain the existing visual presentation. VIP users receive a complete premium presentation, including setup, active play, transitions, round results, and final results. Presentation must never change information, rules, luck, rewards, or AI strength.
- Use plain labels. Darkness's Ward becomes **Shield**. Light currently has a Wager, rather than Ward; replace that label/mechanic with **Bonus Bet**, integrated into the round-tool choice below.
- The user explicitly wants AI contestants to think strategically, have lucky draws, and make plausible mistakes in their decisions. This is a requirement for both games, not an optional polish step.

## 2. Source baseline and findings

Actual source checkout:

`C:/Users/georg/Documents/Codex/2026-07-05/work-on-githut-directly-no-local/work/bbmobilenew`

At assessment, the active branch is `codex/weekend-redesign-assets-loading`. The preceding upgrade remains in uncommitted modifications across the game components, utilities, AI, registry, and styling. Preserve these modifications. Do not reset the checkout, replace them with the collection workspace's other copies, or assume the committed HEAD contains the current games.

Inspect `AGENTS.md` before execution. Before any eventual PR or push, the repository requires `npm run check:pr` after the final code edit. This document does not request a PR, push, or execution now.

### Balance and fairness findings

1. **Bargain is too broadly attractive.** Existing Mend restores 10; Bargain restores 18 and adds 2 damage per error. With the normal 20% damage refund, and ignoring death and the 100-health cap, Bargain's advantage over Mend is `8 - 1.6 * mistakes`. It wins below five mistakes. Its intended risk needs a sharper boundary.
2. Existing Shield/Ward reduces only the first error by 8. Curse/Hex inflicts only 6 raw damage spread over a rival's next two errors, with no self-heal. The choices have different effective values, timing, and eligibility; matching their headline numbers would not balance them.
3. **Human Hex is currently queued twice.** `finishRound` includes the human target separately and again through the human's `RoundResult`. Fix this before measuring balance. Apply each cast exactly once; distinct casts must remain distinguishable.
4. Darkness's AI chooses from hard-coded preference lists. Replace these with contextual, imperfect decisions. Take a round-start snapshot so the human's already-played damage does not change the AI's supposedly simultaneous choice or targeting information.
5. **Light's opening blind wager has unfair odds.** A human's blind first-pair success probability is `1 / (tiles - 1)`, while the AI wager function independently rolls a much higher success probability. The AI's wager outcome is also disconnected from its simulated first attempt. Replace this mechanic through shared action resolution.
6. Light has portrait-board construction and avatar rendering already, but the lab builds synthetic players with `avatar: undefined`. Trace the live host, roster, final phase, and avatar resolver before concluding why the user saw emojis. Do not claim a runtime diagnosis from source inspection alone.
7. Neither game currently receives the host's premium-presentation choice. `MinigameHost` already calculates `usePremiumPresentation`, and Minigame Lab already has `vipPreview` and a preview toggle. Reuse these.
8. Light has several global CSS layers, including `#root` priority selectors. An unscoped premium stylesheet can be overridden or accidentally restyle standard users.
9. Light's private glimpse currently adds the human's peek to the shared AI memory. Decide and enforce observation ownership: private reveals go only to their owner; public flips are observed by everyone.
10. Darkness silently revives the pre-round leader at 1 lifespan if the final AI group all falls. Replace this hidden preference with an explicit, consistent endgame tiebreak. Authoritative ranking and numeric completion results must agree, including very long Endless runs.

## 3. Darkness: a contextual charm draft

Retain the familiar flow: see the omen and danger, choose one of three charms, then play the memory board. Show the benefit, cost, and remaining use clearly on each choice.

Start with this seven-charm pool. These numbers are **initial tuning values**, not a claim that balance has been established.

| Charm       | Initial effect                                                                                                               | Strategic niche and limitation                                                                                                                                                   |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Heal        | Restore 8 lifespan after completing the board.                                                                               | Reliable recovery; cannot prevent a lethal error and can be wasted at the health cap.                                                                                            |
| Shield      | Reduce each of the first two errors by up to 5 damage; minimum hit remains 1.                                                | Prevents immediate danger; unused protection is lost. With both blocks fully used it preserves about 8 net lifespan after the normal refund.                                     |
| Bargain     | Restore 14 after completing the board; every error deals 3 extra damage.                                                     | Confident play. Compared with Heal, its uncapped advantage is `6 - 2.4 * mistakes`: better at zero to two errors, worse at three or more. Extra damage can kill before recovery. |
| Peek        | Once this board, choose one hidden card to reveal privately for about one second.                                            | Information instead of healing. Valuable when a costly guess can be avoided; no automatic match or accuracy bonus.                                                               |
| Curse       | Choose a living rival before the board. Their next two errors, starting on the next board, deal 4 extra damage each.         | Targeted pressure, especially in a close endgame; no healing and no instant damage. Perfect play can delay it.                                                                   |
| Cleanse     | Remove queued Curse charges from yourself before the board.                                                                  | A specific answer to sustained pressure, rather than another generic heal. Offer only when at least one living contestant has queued charges.                                    |
| Last Chance | Once this board, survive one otherwise lethal error at 1 lifespan. All board-completion recovery is disabled for that board. | Emergency gamble. A second lethal error still eliminates the player. Any unused protection expires with the board; it cannot be saved or stacked.                                |

### Offer generation and targeting

- Draw one sustain choice, one protection choice, and one information/tactical choice, using a seeded draw among eligible charms. Keep all three available to every contestant that round.
- Sustain pool: Heal / Bargain. Protection pool: Shield / eligible Last Chance. Tactical pool: Peek / eligible Curse / eligible Cleanse.
- Curse is initially eligible when four or fewer contestants remain, when harming one rival becomes a meaningful alternative to self-preservation. Never offer it on Depth Run's sixth board, where a next-board effect cannot pay off. In earlier rounds, an unexpected immediate ending can still waste a cast; the AI should consider that risk. Revisit eligibility only if balance evidence supports an earlier role.
- Last Chance becomes eligible when at least one living contestant is at 25 lifespan or less. It may return in a later draft, but protects against only one lethal error on the current board and grants no recovery. All contestants keep the same three usable offers; there is no individual reroll or permanent reserve of protection.
- Seed the offer once, independently of presentation and render timing. Do not change offers when opening a tooltip or toggling VIP preview.
- For Curse, the human selects a rival; AI selects under the same targeting restrictions. Show current queued charges so a player can choose pressure versus another target.
- Cap queued Curse charges at four. Each affected error gets one +4 modifier, not multiple simultaneous +4 stacks. Extra casts can extend duration only up to the cap. Log accepted and wasted charges.
- A cast has a source ID and target ID. Apply each cast once. Clearing a curse must remove the actual queued effect, not just its label.
- Do not add forced purchase rerolls, unrestricted charm stacking, permanent power accumulation, or extra currencies.

### Resolution and tuning

Extract one pure round/effect resolver used by human event streams and AI simulations. It must own damage, blocks, curse consumption, lethal checks, Last Chance, normal recovery, charm recovery, and health caps.

Damage prevention happens before lethal checks. Last Chance happens at the lethal check. Completion recovery happens only if the board was completed alive and recovery is enabled. Keep actual damage taken separate from incoming overkill damage, so a lethal safeguard cannot manufacture an oversized refund.

Summaries should say what happened: blocked damage, added damage, healed lifespan, revealed card use, and curse target/charges. Use the same units and rounding everywhere.

Evaluate health 15/35/60/90/100; rounds 1/3/6/10/20; zero through eight errors; every omen; two/four/eight/twelve contestants; and zero/two/four curse charges. Include health caps and death, not just average net healing. Compare survival, final lifespan, and impact on placement. A niche charm can have a low overall pick rate; it still needs reachable situations where it is a good choice. Flag any charm that is dominated across its eligible situations or broadly beats everything else. Retune numbers rather than concealing dominance with arbitrary AI choices.

Keep the eight-pair board cap and continually rising Endless damage. If the human dies, simulate remaining rounds in cancellable batches so a pathological run cannot block the browser. Do not revive the former leader to manufacture an ending. If everyone in the final group falls, use recorded survival progress and a published tiebreak order; report the winner as last to fall if necessary. Keep completion ranking consistent with the displayed outcome. Prefer the host's supported `authoritativeRankedIds` contract over relying on unbounded round-count arithmetic to encode the entire placement order.

## 4. Light: decisions during the memory tournament

Rename visible copy to **Deck of Light**. Preserve saved keys such as `cardClash`, reducer keys, component identifiers, and route compatibility. Renaming internal directories is unnecessary scope.

### One round tool, chosen before each preliminary board

Replace the isolated first-blind-match wager with a three-way choice. Each contestant gets exactly one tool for that round:

| Tool      | Initial rule                                                                                                                                      | Choice it creates                                                               |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Peek      | Reveal one chosen hidden card privately for one second, once.                                                                                     | Spend the round advantage to improve information.                               |
| Shield    | The next mismatch still reveals both cards and counts in accuracy statistics, but loses no mismatch points and does not break the scoring streak. | Protect a fragile combo or a risky exploration attempt.                         |
| Bonus Bet | Arm before the first flip of any eligible pair attempt. Match: +150 bonus points. Miss: -120. It is consumed on that attempt.                     | Reward confidence in remembered information; no independent lucky success roll. |

Keep choices exclusive. A player cannot Peek and then use Bonus Bet on the same board. Disable tool actions during flips, mismatch resolution, completed boards, and transitions. Tool deliberation/reveal time follows the same scoring-clock policy for human and AI; do not charge the human for choosing while granting AI instant planning.

### A visible objective: the Bright Pair

- Before a preliminary board starts, show one target symbol as the Bright Pair.
- Matching that pair within the first half of the board's pair completions awards +120 points. Afterwards it is an ordinary pair.
- This creates a choice between taking a known safe match and exploring for an expiring bonus. It must not reveal the target's location.
- Draw the target with the same seeded rule for every contestant. Limit to one target and one award per contestant per board.
- Show the objective and its remaining window beside the chosen tool. The round result breaks out base performance, streak, tool, and Bright Pair bonuses.
- Keep tool and objective bonuses bounded. They should change close placements without erasing substantially better memory performance.

### A more deliberate shared-board finale

- Both finalists start with zero final pairs; preliminary totals retain their existing tie-break purpose.
- The better preliminary performer chooses whether to open the duel or let the rival open. AI makes this decision with uncertainty, not a fixed always-best rule.
- Keep the maximum two matched pairs per turn and pass on a miss.
- Each finalist receives one decision token for the entire finale. At the start of one of their turns, they may spend it on **Peek** (one private card) or **Pass** (cede the turn without exposing cards). One token total, not one of each.
- Pass is unavailable if two or fewer unmatched pairs remain. Peek never exposes a card to the opponent's memory.
- Show turn ownership, pairs claimed this turn, final score, and each contestant's remaining token clearly. Do not add free steals or random point reversals.

### Shared scoring and AI outcomes

Use a shared score resolver for human and AI. Extend simulated round output with the facts scoring requires: actual miss count, scoring misses after Shield, best streak, pair completion order/target completion index, tool choice/use/outcome, and time. Derive Bonus Bet success from the chosen attempt and Bright Pair success from the sequence; do not independently roll bonus payouts.

A plausible simulated sequence is acceptable for private AI preliminary boards. It must be internally consistent and generated after the AI commits its strategy. The AI must not inspect that future sequence to select its tool. Public finale play continues to select actual cards from fallible remembered information.

## 5. AI: strategy, personality, imperfect reflection, and luck

This requirement applies to every new decision in both games: charm/tool draft, tactical target, when to spend a Peek or Bonus Bet, opening order, and the finale token.

1. **Equal rules and draws.** All contestants receive the same public offer and omen rules, targeting limits, use limits, information windows, and scoring. Luck comes from seeded offers, board arrangements, variable form, and imperfect choices, not secret AI-only bonuses.
2. **Commit before outcome generation.** At round start, snapshot the public standings, health, queued effects, and offer. Estimate a distribution of likely errors from ability and previous observed play. Do not query the already-seeded future error count, hidden board, future death, or winner to choose a strategy.
3. **Contextual reasoning.** Consider immediate death risk, recoverable health, wasted healing at the cap, expected error cost, current omen, number of rivals, credible targets, and remaining opportunities. Give aggression more relative value in a close two-player ending than in a crowded opening.
4. **Bounded reflection.** Update an estimate over a few recent rounds with smoothing. A rough round can make an AI more cautious; one lucky flawless round should not make it assume permanent perfection. Include uncertainty so different choices remain plausible.
5. **Stable character differences.** Draw reproducible risk tolerance, aggression, caution, and confidence traits from a player-specific seed. Avoid tying all strategic intelligence directly to memory skill; a good memorizer may still be reckless.
6. **Imperfect selection.** Score choices using the estimate, add modest seeded estimation noise, and sample among plausible near-best choices. Start with roughly an 80% preference for contextually competitive options and a 20% exploratory/lapse channel, excluding illegal actions. Treat this as tuning, not a universal difficulty setting. Do not force a useless choice just to satisfy a quota.
7. **Human-like information.** Maintain separate memory per finalist. Everyone can remember public flips, with bounded recall; only the owner sees a private Peek. An AI may forget a revealed card or misjudge a risk. It must not accidentally match remembered indexes against stale or newly shuffled positions.
8. **Reproducible luck.** Separate RNG streams for offers, board layout, strategy, performance, and presentation. A visual particle or rerender cannot consume gameplay RNG. Seed zero is valid. The same seed and decisions produce the same result in standard and VIP skins.
9. **Readable outcomes.** Display a short action/result in the round summary, e.g. "AI 3 chose Shield: blocked 8" or "AI 2 risked Bonus Bet and missed." Optional development-only reasoning can record the estimates; production players should not see implementation scores or hidden card knowledge.

Validation must show both context sensitivity and fallibility: identical inputs can choose differently across strategy seeds, the same seed repeats exactly, low health usually changes the preference, poor estimates occasionally lead to bad choices, and a weaker contestant can beat a stronger one through choices and luck without a forced comeback script.

## 6. Portrait finales for both games

### When portraits appear

- **Light:** the entire shared-board finale.
- **Darkness Depth Run:** round six, or the next board after the living field reaches two, whichever comes first.
- **Darkness Endless:** the final-two stage, starting on the next board after two remain. Retain portrait cards for subsequent boards until resolution.
- Endless has no predetermined last round. Do not pre-read simulated deaths to decide which board should use portraits. If a larger field collapses directly to one, finish the game normally and use portraits in the winner reveal; do not force an extra board for a sole survivor.

### Shared portrait-pair builder

- Extract/reuse one helper that accepts desired pair count, original participant roster, priority finalist IDs, and seed. Matching uses a stable pair ID, independently of display text or image URL.
- Use actual contestant photos through `ResolvedAvatarImage`, including the human's local profile photo and existing avatar fallbacks. No emoji substitute for a missing photo: use an initials/silhouette fallback with the player's name.
- Include the human and living finalists before filling from the original roster. Never truncate them away by taking the first roster entries.
- Darkness keeps its current round's pair count, including the eight-pair cap. Light uses at least six and at most twelve portrait pairs, rather than collapsing a two-player finale to two pairs.
- If the original roster has fewer people than required pairs, use clearly labeled portrait variants: player plus a corner letter/shape badge. Each variant has exactly two cards. Matching requires both the face and badge; explain this once. Badge identity must be equally readable in standard and VIP versions and cannot rely on color alone.
- Preload the finale's portrait candidates before activating its board. Loading failures must never change pair identities, shuffle the board, or restart timers. A user's image data stays local and is not uploaded.

### Lab support

Add an opt-in, deterministic local portrait roster fixture for these games. The current generic `You / AI N` records with missing avatars cannot prove real photo handling. Reuse local houseguest assets, without modifying the saved season roster.

Add development-only phase fixtures for Light's finale, Darkness round six, and Darkness's final-two Endless stage. They must create consistent game state, not bypass production eligibility or purchases. The user should be able to verify faces without replaying every preliminary round.

## 7. VIP visual direction

Create a related premium family with a distinct mood for each game:

| Surface       | Deck of Light VIP                                                             | Deck of Darkness VIP                                                                           |
| ------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Stage         | Opal and pearl glass, champagne highlights, restrained cyan/lilac refraction. | Smoked obsidian glass, violet depth, ruby highlights and pale metallic type.                   |
| Cards         | Layered translucent edges, subtle foil backs, crisp inset portraits.          | Dark polished faces, spectral glass backs, controlled crimson damage accents.                  |
| HUD           | Clear glass score rail, readable tool chip, bright target portrait/symbol.    | Glass lifespan rail, omen and charm chips, readable curse counters and rival portraits.        |
| State effects | A short specular match sweep, clean combo pulse, restrained finale entrance.  | A brief impact ripple, shield fracture, curse trail, and a controlled final showdown entrance. |
| Results       | Editorial portrait podium with clear score explanation.                       | Portrait survival lineup with lifespan, chosen powers, and damage/recovery explanation.        |

Apply the art direction to mode selection, choice screens, active board, tool use, transitions, round summaries, and final standings. Avoid adding decorative panels around every line of text. Controls and the board remain the primary hierarchy.

### Technical presentation contract

- Add an optional `premiumPresentation` prop to both games. Feed it from `MinigameHost`'s existing `usePremiumPresentation`, including the generic Darkness path through `GenericMinigameProps`.
- Production follows the existing effective VIP selector. The standalone Premium Challenges entitlement is not itself a VIP visual entitlement. Do not add a new purchase, replacement game key, or permanent unlock mechanism.
- In Lab, the existing `premiumPresentationOverride` and `vipPreview` remain authoritative. They must support explicit true and false regardless of the developer entitlement bypass.
- Give every game surface, including both kinds of result screen, an explicit classic/premium marker. Scope the current Light priority CSS to classic presentation so it cannot override VIP; ensure the standard appearance remains intact.
- Share game state and handlers between both skins. Do not create parallel engines, change RNG, or alter reveal durations, hit boxes, font legibility, or available information to make VIP feel special.
- Keep card backs fully opaque to their concealed face. Glass edges and foil reflections must never leak a hidden portrait or symbol before the same flip/reveal event used by the standard skin.
- Use semantic spacing, focus, and motion tokens from `docs/GAME_DESIGN_SYSTEM.md` where applicable. Keep contrast readable over a stable panel backing; glass must not make labels disappear over the scene.
- Prefer CSS/SVG for these effects. Limit backdrop blur to a few large surfaces, not every animated card. Animate transforms and opacity; avoid continuously animating blur or large shadows. Use event-driven effects rather than constant distracting movement over the board.
- Support reduced motion, touch targets of at least 44px, visible keyboard focus, and a solid-surface fallback when blur is unsupported or expensive. Premium effects must not delay input or reveal cards longer than standard presentation.

## 8. Execution order and file map

Work in reviewable stages. Keep each stage's rules, AI, UI, and focused checks together before adding the next layer.

1. **Baseline and shared rules.** Preserve the previous working changes; confirm host routes. Correct duplicate Curse, round-start snapshots, and result/ranking consistency. Centralize Darkness effect resolution and Light score calculation. Rename visible Light/Shield/Bonus Bet copy.
2. **Darkness draft and AI.** Implement the seven charms, eligibility, targeted Curse, charge caps, per-board consumption, contextual AI estimates, seeded imperfect choice, and readable summaries. Tune with a small deterministic balance harness.
3. **Light strategy layer.** Implement exclusive round tools, Bright Pair objective, AI outcome parity, private memory, opening-order decision, and one finale token. Preserve the tournament structure and completion plumbing.
4. **Portrait stages and Lab fixtures.** Share the portrait builder, retain challenge at small player counts, protect finalist inclusion, handle local photos/fallbacks, and provide reachable development previews.
5. **Premium family.** Thread the existing entitlement/presentation flag. Complete all VIP surfaces and effects. Scope classic styles and verify the standard skin remains usable and visually consistent.
6. **Integrated verification and handoff.** Exercise actual host mounting, both skins, both Darkness modes, AI-only continuation after human elimination, normal completion, retries, and seed replay. Report real results and limitations; do not label tuning complete merely because TypeScript passes.

Primary existing files:

- `src/components/HouseOfDarknessComp/HouseOfDarknessComp.tsx`
- `src/components/HouseOfDarknessComp/houseOfDarknessUtils.ts`
- `src/components/HouseOfDarknessComp/houseOfDarknessAiBalance.ts`
- `src/components/HouseOfDarknessComp/HouseOfDarknessComp.css`
- `src/components/HouseOfCardsComp/HouseOfCardsComp.tsx`
- `src/components/HouseOfCardsComp/houseOfCardsUtils.ts`
- `src/components/HouseOfCardsComp/HouseOfCardsComp.css`
- `src/features/houseOfCards/houseOfCardsAi.ts`
- `src/components/MinigameHost/MinigameHost.tsx`
- `src/minigames/reactComponents.ts`
- `src/minigames/registryBase.ts` and `src/ai/competition/minigameAiRegistry.ts`
- `src/screens/MinigameLab/MinigameLab.tsx`
- `src/styles/houseOfCardsBrightTheme.css`, `houseOfCardsBrightThemePriority.css`, and `houseOfCardsInteractionFix.css`
- `src/components/ResolvedAvatarImage/ResolvedAvatarImage.tsx` is the existing avatar renderer; reuse its contract rather than creating a separate resolver.

Suggested new small modules: shared portrait-pair builder, Darkness charm/effect resolver and choice evaluator, Light tool/objective score resolver, and scoped premium CSS. Keep these focused; a generalized minigame framework is outside this task.

## 9. Acceptance and validation checklist

The implementation covers the core gameplay changes, portrait boards, VIP presentation path, and focused deterministic rule/AI tests. The broader checklist below remains useful for manual review and balance tuning; passing the unit tests does not establish visual polish or balance.

### Meaningful behavior checks

- Duplicate casts are prevented without deduplicating legitimate casts from different contestants. Charge cap, target death, clearing effects, minimum damage, and health caps behave consistently.
- Bargain has an actual low-error advantage and a high-error penalty. Shield, Peek, and situational powers each have favorable reachable cases. Last Chance cannot trigger twice on the same board or heal through its recovery restriction.
- Human and AI produce the same result from the same action/mistake stream. No AI-only bonus-roll advantage or foreknowledge. Memory ownership is correct for public and private reveals.
- Choice seeds replay; strategy seeds produce plausible variation; visual rendering consumes no gameplay randomness. Seed zero works. Lab passes an explicit seed to Light; the current dedicated host branch omits it.
- Bright Pair windows, exact one-use limits, Bonus Bet arming, score/streak bookkeeping, turns, tokens, and completion callbacks are covered. No double clicks or delayed timers can spend twice or update a completed/unmounted game.
- Portrait pairs have stable identity, exactly two cards per pair, correct finalist inclusion, legible variants for small rosters, and safe loading fallback. Cover 2/4/8/12 participants.
- Darkness portrait activation covers depth six and final-two Endless without predicting future deaths. Larger-field early collapse resolves honestly.
- VIP/classic fixtures resolve identical outcomes from identical actions. Both flags reach the actual game and every result/setup surface. Production access remains tied to the existing VIP entitlement.

### Visual and manual checks

Compare standard and VIP for both games at 320x568, 360x640, 390x844, and desktop. Inspect setup, choices, active board, mismatch, ability use, portrait finale, round summary, and final results. Verify reduced motion, keyboard focus, photo loading failure, local profile photos, and result scrolling. No horizontal overflow, inaccessible controls, hover-only information, or important card content hidden under effects.

Use the existing Lab previews:

`http://127.0.0.1:5173/bbmobilenew/#/minigame-lab?game=cardClash&seed=424242&players=8&vipPreview=1&stage=final`

`http://127.0.0.1:5173/bbmobilenew/#/minigame-lab?game=houseOfDarkness&seed=424242&players=8&vipPreview=1&stage=round6`

For Darkness's final-two Endless board, use `stage=final2`. Repeat with `vipPreview=0`. Keep saved identifiers and existing routes valid after the Light rename.

Focused tests currently cover charm eligibility and caps, damage/Shield/Last Chance ordering, healing caps, portrait pair identity, seeded Bright Pair objectives, score consistency, imperfect deterministic AI decisions, and Darkness AI receiving Peek only when selected. The full host and responsive visual checklist above remains for manual Lab review. Run `npm run check:pr` before any eventual PR/push, per `AGENTS.md`.

## 10. Implementation record

The code implements Deck of Light's added round decisions, Darkness's expanded contextual charm pool, fallible strategic AI with seeded luck, portrait finales, VIP glass presentation, and development Lab fixtures. Initial balance values remain candidates for tuning. Preserve the existing game keys and tournament/survival identities while reviewing or iterating on the changes.
