# Nemesis storyline: product and consistency contract

## Purpose

A Nemesis must be an antagonist with a grounded motive, observable actions, an eventual explanation, and gameplay consequences. It must **not** be a randomly assigned hidden tag that stays invisible for an entire season. Nor may the profile reveal an AI's private thoughts before the player has evidence.

## Lifecycle

1. **Grounded formation (private):** Drama Social may create one active anti-player objective when a real hostility threshold is met (significant negative relationship anchors or a serious outstanding grievance). Existing genuine allies require a concrete betrayal before an autonomous Nemesis can start. A provocateur's first disagreement with a genuine ally strains the pact but does not itself establish a permanent enemy.
2. **Observable warning:** At the next eligible social phase, the antagonist takes a real private undermining action. The player receives an anonymous Faux-TV warning about a brewing campaign. The warning is recorded in the player's Reality events but never contains the hidden actor's ID or name. The private action is not visible to the player. If the player has _already_ witnessed the antagonist's confrontation, that incident substitutes for the anonymous warning.
3. **Named reveal:** At an eligible social phase on a later numbered day, the game reveals the Nemesis, states the real motive, records the reveal as a player-readable event, and applies an observable trust/tension consequence. A previously witnessed confrontation can proceed directly to this beat at the next eligible phase. Direct pacts become strained; larger groups keep their formal membership but the revealed conflict affects their viability.
4. **Closure protection:** If either the opponent leaves or the human joins the Tribunal before the ordinary reveal, the game uses a retrospective Big Eye reveal at the next valid end-of-day/endgame checkpoint, then closes the executable objective. A final-three/endgame transition reveals an unfinished story before normal social windows disappear. If a genuine reconciliation happened first, the game shows a retrospective **resolved-rivalry epilogue** rather than a stale active-Nemesis announcement.
5. **Reconciliation:** Voluntary Safety rescue or a documented two-day sequence of accepted, reciprocal repair plus improved hostile-player trust can resolve the Nemesis. The underlying undermining intent and thread close. Reconciliation does not erase the historical event or instantly restore a fractured pact.

## Motive accuracy

The persisted `reason` category belongs to the AI's **perception** and must be presented as such. It does not prove the human actually acted badly.

When a recorded nomination, betrayal, or broken plan is identified, mention its actual day from that event. Never reuse the later provocateur scene's day as if it were the date of the earlier nomination. If the historical evidence was compacted or missing, use a careful undated statement of the character's perceived motive rather than fabricate a specific action.

The final reveal has a durable `NEMESIS_REVEALED` Reality event (or `NEMESIS_RECONCILIATION_REVEALED` for an earlier resolved secret feud) whose `reason` contains the explanation. It remains in the history even if the source event is later compacted.

## Information boundaries

- The private `NEMESIS_OBJECTIVE_FORMED` and `NEMESIS_PRIVATE_PRESSURE` events are readable by the antagonist, not by the target.
- The `NEMESIS_ANONYMOUS_CLUE` has no actor ID in player-visible text or its own event metadata.
- Generic conflicts do **not** automatically disclose a private Nemesis objective. `Nemesis` becomes the canonical relationship label after a persisted named reveal, or an older directly witnessed source provocation that explicitly introduced the hostility.
- Player-facing Reality Ledger threads must respect the same discovery rule; they cannot use any unrelated relationship evidence to expose the private objective.

## Delivery and idempotency

The Nemesis director runs on persisted Redux phase changes, not timer-based AI ticks or capacity-limited Incoming Interactions. The normal beats are restricted to social windows. Fallback closure uses endgame or departure boundaries.

Each objective retains the unique clue/reveal event IDs and their day/phase. Once written, replaying an action, remounting the screen or hydrating a saved season cannot produce a second copy. Force-to-TV broadcasts are phase/day scoped and obey the existing user-driven Play/consume mechanism. The original objective never overrides the actual legal nominations, Safety or vote results.

## Acceptance scenarios

- Private Echo objective + current pact: anonymous clue, then named Echo reveal with specific motive and strained pact, with no leaked identity in between.
- Already witnessed hostility: no redundant anonymous hint; named explanation arrives in the next eligible social window.
- Documented nomination: reveal uses the real nomination day; if it is missing, no invented date.
- Safety or accepted two-day repair: objectives and undermining behavior close; the player receives one truthful retrospective epilogue explaining the former rival's motive and how the relationship healed, never an active antagonist label.
- Eviction/endgame: unfinished stories resolve, without continuing enemy actions from an evicted AI.
- Normal Social/survival modes: no Nemesis scenes.
- Replayed phases and saved seasons: no duplicate events or broadcasts; Reality Ledger and the roster agree on what the player knows.

## Scope and safeguards

This is a storyline/relationship feature and must not change LOH/POS eligibility, nomination outcomes, vote resolution, profile storage, or #1702's broadcast fix. Tests should run as required PR regressions, followed by TypeScript, lint, formatting, production/mobile builds, and an actual browser journey before merging.
