# Secret missions reference

Source of truth: `src/bb/secretMission.ts`, `src/store/gameSlice.ts`, and
`src/store/secretMissionMiddleware.ts`. Review this reference when changing
objectives, mode rules, social receipts, competition results, or the season calendar.

## Calendar and completion

Missions contain survival plus four objectives selected from eligible families.
The Silent Witness, Pressure Cooker, and Big Eye Gambit last three numbered days;
Public Operator and Social Engine last four. Acceptance starts a fresh window;
the template must fit before Final Five. Stale offers expire. Numbered deadline
days are inclusive. Day settlement closes the final day's remaining objectives.
An unfinished mission expires when the player leaves the house. Completed missions
remain claimable until their reward is collected.

Completing an optional easter egg substitutes for one incomplete required task.
Otherwise all required tasks must complete. Competition receipts are deduplicated
by run ID; replaying a result grants no additional credit.

## Objectives

| Objective             | Requirement and event                                                                                           | Dependencies                                                                                                                                                           |
| --------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Survive               | Remain in the house until the final mission day; daily settlement advances the task.                            | An evicted or jury player cannot keep progressing.                                                                                                                     |
| Competition placement | Top two or three in a completed competition; uses ranked results, with a known winner also proving first place. | Human must participate; skipped/interrupted games give no credit. Results must deliver placements for nonwinner credit.                                                |
| Avoid last            | Two completed competitions with a known last finisher other than the human.                                     | Human participation and a valid completion receipt.                                                                                                                    |
| Public approval       | Gain five or seven percentage points from acceptance approval.                                                  | Public Mode enabled; requirement adjusts near the ceiling. Losses can reduce progress.                                                                                 |
| Energy streak         | Spend the final unit of ordinary Social Energy on two or three consecutive numbered days.                       | A paid manual action receipt proves depletion; a later energy grant does not erase it. Zero without player activity gives no credit.                                   |
| Social set            | Perform each of three distinct listed actions.                                                                  | Manual social action receipts; repeating one action cannot replace another. Backfires still count as performing the action.                                            |
| Incoming streak       | Answer all required requests on two or three consecutive numbered days.                                         | Delivered requests determine the day; ignoring/dismissing breaks it. Quiet days qualify.                                                                               |
| Easter egg            | Discover a hidden Big Eye chat trigger.                                                                         | Optional; discovery can be repeated after an offer-stage discovery. Deduplicated within the task.                                                                      |
| Marked nomination     | One of two marked houseguests becomes nominated, initially or as a replacement.                                 | Classic nomination system; at least two eligible candidates. Excludes current nominees and LOH at assignment; unavailable targets are replaced from the eligible pool. |
| Vox ballot            | Submit the next valid secret nomination ballot with two eligible choices.                                       | Active Vox Populi; counts submission regardless of the resulting nominees. Replaces the Classic nomination objective.                                                  |

Social sets currently include:

- Compliment, Whisper, Group Chat.
- Reassure, Clear the Air (`apologize`), Confront.
- Reassure, Compliment, Whisper.
- Group Chat, Apologize, Reassure.

Older Vote Rally sets use the player-facing Rally Votes Against action. Unfinished
legacy Confessional visit/conversation-turn tasks migrate to a supported social set.

## Weekends

Weekend interludes after numbered Days 5 and 10 pause the numbered mission clock.
They neither consume deadline days nor provide extra streak days. Weekend social
actions can satisfy action sets. Weekend wallet receipts (`weekend_day_*`) cannot
prove ordinary weekday energy depletion. Optional weekend requests do not break
the required-response streak. Weekend activities without season competition
completion receipts do not provide competition credit.

## Modes and rewards

Classic uses marked nominations. Active Vox uses secret ballots; Public Mode is a
separate capability controlling approval tasks. Cupid locking prevents mission
activation. Season-director kill switches, mission count, remaining players,
week-start timing, and competing twist presentation can prevent activation.
Consult `tryActivateSecretMission` for the complete live scheduling guard list.
Do not infer mission availability from VIP ownership alone.

Reward boxes and paid access remain governed by the existing marketplace and
mission reward rules. Double Vote, Vote Deduction, and immunity have phase,
eligibility, conflict, and Final Four guards; finishing a task does not bypass them.
