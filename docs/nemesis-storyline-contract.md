# Nemesis storyline: product and consistency contract

## Purpose

A Nemesis must be an antagonist with a grounded motive, observable actions, an eventual explanation, and gameplay consequences. It must **not** be a randomly assigned hidden tag that stays invisible for an entire season. Nor may the profile reveal an AI's private thoughts before the player has evidence.

## Lifecycle

1. **Grounded formation (private):** Drama Social may create one active anti-player objective when a real hostility threshold is met (significant negative relationship anchors or a serious outstanding grievance). Existing genuine allies require a concrete betrayal before an autonomous Nemesis can start. A provocateur's first disagreement with a genuine ally strains the pact but does not itself establish a permanent enemy.
2. **Observable warning:** At the next eligible social phase, the antagonist takes a real private undermining action. The player receives an anonymous Faux-TV warning about a brewing campaign. The warning is recorded in the player's Reality events but never contains the hidden actor's ID or name. The private action is not visible to the player. If the player has _already_ witnessed the antagonist's confrontation, that incident substitutes for the anonymous warning.
3. **Named reveal:** At an eligible Social phase on a later day, a short, natural Faux TV line identifies the Nemesis and directs the player to Social. The detailed motive is stored in the Reality event and the persistent relationship record, not narrated in full on Faux TV. An already witnessed confrontation skips the anonymous warning. Revealed hostility breaks every shared **personal pact** automatically; group alliances are strained while their membership and existing manual leave/kick controls remain intact.
4. **Closure protection:** If the rival exits, the player joins Tribunal, or the game enters Final Three/Jury before discovery, a short retrospective Faux TV update closes the unfinished arc. A reconciliation before exposure produces a concise **resolved-rivalry epilogue**, never an incorrect active-Nemesis label. The detailed reasons remain in the event history.
5. **Reconciliation:** Voluntary Safety rescue or a documented two-day sequence of accepted, reciprocal repair plus improved hostile-player trust can resolve the Nemesis. The underlying undermining intent and thread close. Reconciliation does not erase the historical event or instantly restore a fractured pact.

## Faux TV and private dialogue

Faux TV is an **event ticker**, not a paragraph-long explanation. No messages may start with an all-caps "THE BIG EYE —" header. Examples:

- Anonymous clue: "Someone in the Hub is quietly questioning your game behind your back."
- Named reveal: "Echo has turned against you. Your personal pact has ended. Ask Echo why in Social."
- Reconciled secret rivalry: "Echo once saw you as a rival, but your Safety rescue helped change their mind."
- Evicted rival: "After Echo's exit, you learn they were secretly working against you."

A short **Ask Why** card under Social → Strategy (also visible in All) provides the private explanation as a native Social action result. It uses a normal receipt and main-log entry, not a new modal or Faux TV line. Answers are character dialogue with deterministic, save-persisted outcomes.

## Motive accuracy

The persisted `reason` category belongs to the AI's **perception** and must be presented as such. It does not prove the human actually acted badly.

When a recorded nomination, betrayal, or broken plan is identified, mention its actual day from that event. Never reuse the later provocateur scene's day as if it were the date of the earlier nomination. If the historical evidence was compacted or missing, use a careful undated statement of the character's perceived motive rather than fabricate a specific action.

The reveal has a durable `NEMESIS_REVEALED` Reality event (or `NEMESIS_RECONCILIATION_REVEALED` for an earlier resolved feud) whose `reason` holds the detailed explanation. The action's private conversation records `NEMESIS_REASON_EXPLAINED` or `NEMESIS_REASON_REFUSED`, also as persisted player-readable evidence. If a source event has been compacted, its exact day or details must not be invented.

## Information boundaries

- The private `NEMESIS_OBJECTIVE_FORMED` and `NEMESIS_PRIVATE_PRESSURE` events are readable by the antagonist, not by the target.
- The `NEMESIS_ANONYMOUS_CLUE` has no actor ID in player-visible text or its own event metadata.
- Generic conflicts do **not** automatically disclose a private Nemesis objective. `Nemesis` becomes the canonical relationship label after a persisted named reveal, or an older directly witnessed source provocation that explicitly introduced the hostility.
- Player-facing Reality Ledger threads must respect the same discovery rule; they cannot use any unrelated relationship evidence to expose the private objective.

## Delivery and idempotency

The Nemesis director runs on persisted Redux phase changes, not timer-based AI ticks or capacity-limited Incoming Interactions. The normal beats are restricted to social windows. Fallback closure uses endgame or departure boundaries.

Each objective retains the unique clue/reveal event IDs and their day/phase. Once written, replaying an action, remounting the screen or hydrating a saved season cannot produce a second copy. Force-to-TV broadcasts are phase/day scoped and obey the existing user-driven Play/consume mechanism. The original objective never overrides the actual legal nominations, Safety or vote results.

## Acceptance scenarios

- Private Echo objective + current pact: anonymous clue, then a short named Echo reveal, **auto-ended personal pact**, updated Nemesis relationship label and private `Ask Why` card (⚡1) with no leaked identity beforehand.
- Already witnessed hostility: no redundant anonymous hint; named explanation arrives in the next eligible social window.
- Documented nomination: reveal uses the real nomination day; if it is missing, no invented date.
- Safety or accepted two-day repair: objectives and undermining behavior close. The player receives a brief retrospective TV epilogue without a false active Nemesis label; detailed context remains in Reality history.
- Eviction/endgame: unfinished stories resolve, without continuing enemy actions from an evicted AI.
- Normal Social/survival modes: no Nemesis scenes.
- The contextual `Ask Why` action appears only for a revealed **active** Nemesis selected in regular Drama Social. It costs exactly 1 energy (even on refusal), allows only one attempt per day, retries on a later day after refusal, and disappears after a real explanation or reconciliation. It cannot be batched or bypassed through a price override.
- Replies normally use the objective's actual triggering event (nomination, actual alliance Safety failure, verified plan defiance, proven opposed recruit) or a grounded motive. Refusal is uncommon and influenced by tension; a small minority of ambition-driven archetypes can admit pure strategy when no concrete betrayal was established.
- A revealed Nemesis cannot create a new personal pact until resolved; larger group alliances remain manageable through existing group commands.
- Replayed phases and saved seasons: no duplicate events, charged questions, or broadcasts; the Reality Ledger and the roster agree on what the player knows.

## Scope and safeguards

This is a storyline/relationship feature and must not change LOH/POS eligibility, nomination outcomes, vote resolution, profile storage, or #1702's broadcast fix. Tests should run as required PR regressions, followed by TypeScript, lint, formatting, production/mobile builds, and an actual browser journey before merging.
