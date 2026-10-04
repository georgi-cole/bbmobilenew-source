# Confessional and Big Eye messaging audit

## Finding

The reported double welcome came from separate effects in `DiaryRoom.tsx`: session initialization created a greeting, then a 600 ms mission timer appended another welcome. Reward introductions and nomination education could add more messages. These producers had no common priority policy. Shortening the response bank alone would not fix that behavior.

The standard conversation is local (`services/bigBrother.ts`); VIP replies use a separate optional service. `localBigEyeDirector.ts` already filters recent similar responses and varies question cadence. TV announcements have day/phase scoping and consumed-event handling in `presentationConsistencyMiddleware.ts`, `TvZone.tsx`, and `confessionalBroadcastReceipt.ts`. Those are useful foundations, but they do not arbitrate the independent Confessional entry producers.

## Changes implemented

| Situation                        | Delivery rule                                                                                                                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Required decision                | Show the required prompt and its controls. Suppress mission controls and automatic rewards during the decision; avoid an extra generic acknowledgment when another decision follows.                                |
| Ordinary entry                   | Choose one prompt: earned reward → offered mission → pending nomination education → fresh game observation → brief greeting.                                                                                        |
| Mission refusal                  | Re-offer only on a later game day, within the mission window, with the existing two-offer limit.                                                                                                                    |
| Authored multi-line answer       | Deliver one bubble with the distinct lines, after one short typing beat.                                                                                                                                            |
| User submission                  | Allow one turn at a time, including repeated form events before the UI updates. Keep the next draft intact.                                                                                                         |
| Context changes                  | Discard late dialogue and memory updates after leaving, changing game/player/day/phase, elimination, or a new required decision.                                                                                    |
| Reward becomes ready during chat | Wait for 1.2 seconds of idle time; defer while typing, awaiting a reply, playing a game, viewing the wallet, or responding to a decision. A ceremony visit does not release a backlog of reward messages afterward. |
| Long visit                       | Show the latest 12 messages by default. Earlier messages remain available on request.                                                                                                                               |
| New visit                        | Clear the visible transcript and old action-confirmation questions; retain compact semantic memory and rapport.                                                                                                     |
| Storage                          | Prevent older asynchronous encryption writes from overtaking newer writes or restoring chat after exit. Emit the generic public visit summary from a synchronous flag.                                              |
| Observations                     | Do not replay an unchanged return announcement. Positive affinity determines the closest bond; an intense rivalry is not described as closeness. Jury elimination is not described as surviving nomination.         |

Mission copy now states the available action directly. It no longer assumes the player needs cheering up, adds a second welcome, or asks whether they want to hear an offer while already displaying Accept/Decline controls.

## Recommended next work

1. **Give each narrative event one identity across surfaces.** Share a key such as game/day/event/subject between the TV call-in, Confessional prompt, and completion receipt. Keep the TV invitation brief and put the actual question in the room. Consume each stage explicitly. Extend the existing broadcast receipt mechanism; do not suppress required decisions using text similarity.
2. **Use silence deliberately.** Optional banter should require a new meaningful event or user input. Expire optional observations when their game context changes, and discard superseded observations instead of draining a queue. Use game days for mission cooldowns and real time only for delivery beats. Background/resume should never replay missed chatter.
3. **Set a content budget at authorship.** Aim for one to three sentences and at most one focused question in ordinary dialogue. Allow longer answers when the user asks for rules or history. The VIP prompt currently requests 35–110 words, which can create a large mobile bubble even for a simple acknowledgment. Reduce its default budget and validate complete sentences rather than clipping text mid-sentence.
4. **Keep claims grounded.** Describe observed nominations, wins, votes, or relationship changes. Ask about feelings instead of asserting them. Distinguish game knowledge from predictions and avoid presenting other players’ hidden motives as facts. Use durable event IDs for return callbacks when available; legacy text recognition remains a fallback.
5. **Make continuity explicit.** Remember facts and topics across visits, but only treat a short yes/no as an answer to a question the player can currently see. If a thread resumes, restate its subject once. Keep greetings neutral when there is no new evidence of change.
6. **Check pacing without storing private dialogue.** Track counts of suppressed duplicate prompts, expired optional messages, interrupted turns, and consecutive unsolicited messages. Extend Confessional Lab with scripted scenarios for rapid navigation, long VIP latency, returning with multiple powers, nomination pressure, and game resume. Compare mobile reading time and usefulness before adding more proactive messages.

## Additional calibration findings

The broader calibration suite exposed three existing contract-scenario failures. These scenarios exercise unchanged comprehension/director code and do not call the modified salience function:

- `knowledge-remaining`: the fixture contains nine housemates, but the expectation still asks for seven. The reply correctly counts the supplied list; update the fixture expectation.
- `continuity-distrust-to-trust`: a reversal from stored distrust of Maya to trust does not produce the expected explicit callback. Investigate memory contradiction detection and response selection.
- `regression-pronoun-keeps-nico`: the scenario switches focus from Nico to Lia. Prioritize entity recognition and pronoun continuity before expanding proactive dialogue; a concise answer about the wrong person still feels unrealistic.

These remain follow-up work, separate from the delivery fixes. The two Big Eye service test suites pass. The Confessional, observation, local director, and decision integration suites pass all 121 tests, and `npm run check:pr` passes, including 99 core lifecycle tests. The broader calibration suite has three passing tests and one failing test encompassing the three scenarios above.

## Scope

This change fixes Confessional delivery and the listed observation issues. The broader TV/event coordination and VIP authoring changes above remain recommendations. It does not change mission rewards, ceremony outcomes, or the VIP service contract. Regression tests cover entry priority, effect replay, refusals, repeated sends, stale replies, one-bubble authored delivery, old confirmations, and optional access to earlier chat.
