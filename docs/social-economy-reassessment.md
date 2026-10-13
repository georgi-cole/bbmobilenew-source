# Social economy reassessment

Reviewed on 8 October 2026 against branch commit `3d2767120`.

Status: the accepted alliance, pact, and relationship-exit prices below are implemented on this branch. Other social action prices remain at their reviewed values. The inventory uses bundled defaults; admin overrides, QA resource grants, and the separate weekend wallet can produce different balances.

## Applied changes

The existing daily Energy allowance, Group Chat audience scaling, political action prices, and other reviewed social prices remain unchanged. More people can reasonably consume more social Energy, and more consequential requests can reasonably require political Influence.

The update makes new personal pacts and group commitments cost more than a simple greeting, while keeping renewal, approval, voting, governance, and leaving accessible. “End It” now costs no Energy, so a player can end a personal relationship with an empty Energy bank.

Alliance proposal prices are enforced by the command handler, checked against the actual balances, and recorded with their real costs. This means paid proposals count toward the existing second-wind Energy threshold. AI proposal handling and relationship outcomes remain separate from player fees.

## Current budgets and earning

| Rule                                                                         | Classic / Normal | Reality / Drama |
| ---------------------------------------------------------------------------- | ---------------: | --------------: |
| Energy granted on entering the first social window                           |                5 |               7 |
| Later second wind, if at least 4 Energy was spent in the first social window |               +3 |              +3 |
| Energy accumulation cap                                                      |               20 |              30 |
| Passive daily Influence or Information allowance                             |             None |            None |

Unused resources carry forward. A normal Reality day therefore provides 7 Energy, or 10 when the second-wind condition is met, before event rewards and carried resources.

Relevant earnings include:

- A successful ordinary rapport action generally earns 3 Influence. Failure/backfire can lose Influence instead.
- A successful ordinary information-gathering action generally earns 100 Information. Snoop Around and Eavesdrop currently award 200 on success. Credible incoming intelligence can award 50 or 100.
- LOH and POS wins grant 15 and 12 Influence respectively. Competition podium Energy is 5 / 2 / 1.
- Keeping a tracked promise grants 15 Influence; breaking it can lose 25. Other event rewards, such as surviving an eviction, also contribute.
- Influence and Information currently have very high 10,000-point caps. Those are storage ceilings, not normal daily allowances.
- Weekends have a separate wallet of 30 Energy, 999 Influence, and 999 Information. That generous special-event wallet must be reviewed separately from an ordinary day.

The proposal retains the existing daily grants, Energy caps, and event rewards initially. The conditional second wind should be made visible to the player and should count all real paid social actions. Do not add passive Influence or Information merely to make poorly chosen prices affordable.

## Roles of the resources

**Energy:** the time and effort of initiating conversations, organizing commitments, and carrying out social moves.

**Influence:** political leverage spent on organization and persuasion. It should fund recruiting a coalition, changing a vote, obtaining a favour, applying public pressure, or obtaining sensitive information through a favour. It should not be a prerequisite for ending an unwanted relationship. A publicity campaign can require Influence, whereas a simple personal announcement need not.

**Information:** accumulated intelligence used in trading secrets, warnings based on evidence, rumours, deception, exposure, and an informed political pitch. Requiring Energy, Influence, and Information together can be valid when the action involves effort, leverage, and deploying intelligence. Its description should explain those roles. The current nomination/replacement descriptions mention a suggestion but do not explain their Information fee; clarify that design before deciding to remove the fee.

Spending Influence does not buy somebody's consent. Relationship history, personal goals, trust, and the actual proposal still determine acceptance.

For information requests, distinguish an ordinary question from asking somebody to reveal a sensitive plan or break a confidence. The latter can justify an Influence fee. The current Ask LOH Target and Ask Safety Plan cost only 1 Energy; a sensitive-information variant or additional Influence requirement would be a new design choice, not an existing mechanic. Before adding it, verify that low-resource players retain a useful way to gather intelligence.

## Proposed alliance prices

All amounts are the resource numbers shown to the player.

| Action                                                                         | Previous                    | Applied                            |
| ------------------------------------------------------------------------------ | --------------------------- | ---------------------------------- |
| Propose a personal pact                                                        | 1 Energy                    | 2 Energy                           |
| Found a three-person group                                                     | 2 Energy                    | 3 Energy + 5 Influence             |
| Each additional founding member                                                | +1 Energy                   | +1 Energy; no additional Influence |
| Invite a new member to an existing group                                       | 1 Energy                    | 1 Energy + 5 Influence             |
| Renew an older pact                                                            | 1 Energy                    | Keep 1 Energy                      |
| Consult an alliance                                                            | 2 Energy                    | Keep 2 Energy                      |
| Accept, decline, or vote on a proposal                                         | Free                        | Keep free                          |
| Leave/end/dissolve a commitment                                                | Free in the management flow | Keep free                          |
| Appoint/clear a co-leader, transfer leadership, remove/suggest removal, rename | Free                        | Keep free                          |

Founding groups of 3 / 4 / 5 / 6 members would therefore cost 3 / 4 / 5 / 6 Energy, plus a single 5-Influence organization cost. Only the proposer pays. Respondents should be able to decide even with empty resource banks.

Information is not required for ordinary pact or group formation. A player can form a sincere agreement without possessing a secret.

Five Influence is intentionally below the 10–20 Influence associated with stronger political persuasion. Two successful ordinary rapport moves can earn 6 Influence, so founding a small alliance remains reachable without winning a competition first.

## Full action price review

Notation: ⚡ Energy; 🤝 Influence; 💡 Information. Base prices are the authored Normal prices when an action is available; this does not imply that Reality-only actions are unlocked in Classic. Applied changes are listed for Reality actions; other reviewed prices remain as they were. The smaller Classic allowance needs separate validation before applying new prices to Classic.

| Action                               | Current base       | Previous Reality   | Applied Reality                                                                                   |
| ------------------------------------ | ------------------ | ------------------ | ------------------------------------------------------------------------------------------------- |
| Compliment                           | ⚡1                | ⚡1                | Keep ⚡1                                                                                          |
| Reassure                             | ⚡1                | ⚡1                | Keep ⚡1                                                                                          |
| Whisper                              | ⚡1                | ⚡2                | Keep ⚡2                                                                                          |
| Watch Room                           | ⚡1                | ⚡2                | Keep ⚡2 as the baseline; test its value against dedicated gathering                              |
| Group Chat                           | ⚡max(2, guests)   | Same               | Keep current audience scaling: ⚡2–8 for 2–8 guests                                               |
| Heart-to-Heart                       | ⚡2                | ⚡2                | Keep ⚡2                                                                                          |
| Open Up                              | ⚡2                | ⚡2                | Keep ⚡2                                                                                          |
| Propose Personal Pact                | ⚡1                | ⚡1                | ⚡2                                                                                               |
| Consult Alliance                     | ⚡2                | ⚡2                | Keep ⚡2                                                                                          |
| Offer Protection                     | ⚡2                | ⚡2                | Keep ⚡2                                                                                          |
| Betray Ally                          | ⚡3                | ⚡4                | Keep ⚡4; audit the separate automatic Influence loss                                             |
| Clear the Air                        | ⚡1                | ⚡2                | Keep ⚡2 as the baseline; assess repair value separately                                          |
| Share Intel                          | ⚡1 · 💡200        | ⚡2 · 💡100        | Keep ⚡2 · 💡100                                                                                  |
| Spread Rumor                         | ⚡2 · 💡100        | ⚡3 · 💡100        | Keep ⚡3 · 💡100                                                                                  |
| Start Fight                          | ⚡3                | ⚡4                | Keep ⚡4                                                                                          |
| Confront                             | ⚡2                | ⚡2                | Keep ⚡2                                                                                          |
| Request Favour                       | ⚡1 · 🤝20         | ⚡2 · 🤝20         | Keep ⚡2 · 🤝20; validate the actual favour's impact                                              |
| Pitch Target                         | ⚡2 · 🤝10 · 💡100 | ⚡3 · 🤝10 · 💡100 | Keep current price as the baseline; explain the intelligence being deployed                       |
| Suggest Replacement                  | ⚡2 · 🤝10 · 💡100 | ⚡3 · 🤝10 · 💡100 | Keep current price as the baseline; explain the intelligence being deployed                       |
| Ask to Use Safety                    | ⚡2 · 🤝10         | ⚡3 · 🤝10         | Keep ⚡3 · 🤝10                                                                                   |
| Ask Safety Plan                      | ⚡1                | ⚡1                | Keep ⚡1                                                                                          |
| Respect Nominations                  | ⚡2 · 🤝10         | Same               | Keep ⚡2 · 🤝10                                                                                   |
| Warn About Danger                    | ⚡1 · 💡100        | Same               | Keep ⚡1 · 💡100; this is an evidence-based warning                                               |
| Ask Why You Were Nominated           | ⚡1                | ⚡1                | Keep ⚡1                                                                                          |
| Ask LOH Target                       | ⚡1                | ⚡1                | Keep ⚡1                                                                                          |
| Warn About Player                    | ⚡1 · 💡100        | ⚡2 · 💡100        | Keep current price; clarify whether the warning deploys evidence or suspicion                     |
| Rally Votes Against                  | ⚡2 · 🤝20         | ⚡3 · 🤝20         | Keep ⚡3 · 🤝20                                                                                   |
| Lay Low                              | Free               | Free               | Keep free; no automatic resource payout                                                           |
| Test the Spark                       | ⚡2                | ⚡2                | Keep ⚡2                                                                                          |
| Flirt in Private                     | ⚡1                | ⚡1                | Keep ⚡1                                                                                          |
| Late-Night Talk                      | ⚡2                | ⚡2                | Keep ⚡2                                                                                          |
| Cuddle                               | ⚡1                | ⚡1                | Keep ⚡1                                                                                          |
| Secret Kiss                          | ⚡2                | ⚡2                | Keep ⚡2                                                                                          |
| Pool Makeout                         | ⚡3                | ⚡3                | Keep ⚡3                                                                                          |
| Spend the Night                      | ⚡4                | ⚡4                | Keep ⚡4                                                                                          |
| Try for a Baby                       | ⚡3                | ⚡3                | Keep ⚡3                                                                                          |
| Ask for Pregnancy Test               | Free               | Free               | Keep free; no currency reward for a diagnostic                                                    |
| Take Pregnancy Test                  | Free               | Free               | Keep free; no currency reward for a diagnostic                                                    |
| Take Paternity Test                  | Free               | Free               | Keep free; no currency reward for a diagnostic                                                    |
| Share Pregnancy News                 | ⚡1                | ⚡1                | Keep ⚡1                                                                                          |
| Go Public                            | ⚡3 · 🤝10         | Same               | Keep current price while clarifying whether this is a publicity campaign or a simple announcement |
| End It                               | ⚡2                | ⚡2                | Free; ending a personal relationship should remain possible at zero Energy                        |
| Break the Alliance                   | Free               | Free               | Keep free; contextual fallout, rather than a blanket exit penalty                                 |
| Snoop Around                         | ⚡2                | ⚡2                | Keep ⚡2                                                                                          |
| Make a Pact / ride-or-die friendship | ⚡3 · 🤝10         | Same               | Keep current price; rename to Become Ride-or-Die to distinguish it from a strategic personal pact |
| Risk the Vibe                        | ⚡2                | ⚡2                | Keep ⚡2                                                                                          |
| End the Ride-ok or-Die               | Free               | Free               | Keep free; audit the separate automatic Influence loss                                            |
| Plant a Lie                          | ⚡3 · 💡200        | Same               | Keep ⚡3 · 💡200                                                                                  |
| Trade Secrets                        | ⚡2 · 💡100        | Same               | Keep ⚡2 · 💡100                                                                                  |
| Eavesdrop                            | ⚡2                | ⚡2                | Keep ⚡2                                                                                          |
| Expose a Secret                      | ⚡4 · 💡300        | Same               | Keep ⚡4 · 💡300                                                                                  |
| Pit Them Against                     | ⚡3 · 🤝10 · 💡100 | Same               | Keep ⚡3 · 🤝10 · 💡100                                                                           |
| Call Them Out                        | ⚡4 · 🤝10         | Same               | Keep ⚡4 · 🤝10                                                                                   |
| Private Truce                        | ⚡2                | ⚡2                | Keep ⚡2                                                                                          |

AI-only compatibility actions also exist: Read the Room costs 1 Energy in the catalog, Form Alliance costs 3, Nominate Player costs 1, and Vote Rally costs 2 Energy plus 50 Influence. They are not human-facing buttons. The active AI proposal and political paths need to use the same economic policy as their human equivalents, or an explicit equivalent budget constraint. A catalog price alone does not prove an autonomous proposal actually spends it.

## Why these changes

- **Personal pact:** a lasting strategic commitment should cost more than a one-Energy greeting. Two Energy places it beside a deeper conversation while leaving it accessible at zero Influence.
- **Group founding and recruitment:** organizing multiple commitments uses time and a modest amount of political leverage. Founding scales with the number of people being approached. Routine governance remains accessible.
- **Group Chat:** the current action applies individual relationship effects to each guest and its successful Influence payout grows with audience size. Charging more Energy for a larger audience is therefore justified. Eight guests costing eight Energy can deliberately require carried Energy or the later refill. Test whether it offers distinct value beside individual conversations; do not assume a group discount is necessary.
- **Political pitches:** influencing nominations, replacements, Safety, or votes can justify 3 Energy and 10–20 Influence. Consequential decisions need not fit alongside every other desired move in one day. Information can also be justified for an informed pitch, provided the action communicates what is being deployed and delivers that benefit.
- **Information requests:** normal questions can use Energy alone; sensitive disclosures can also use Influence. Trust and loyalty should continue to affect whether somebody actually answers. Do not turn every casual question into a political purchase.
- **Repair:** assess whether two-Energy repair actions provide enough value and leave low-resource players a useful option such as Reassure. Reduce a price only if outcomes and ordinary-play budgets show a problem.
- **Major drama:** exposure, elaborate deception, public callouts, and fights can reasonably occupy much of the day. Their current 3–4 Energy prices are not automatically wrong just because routine moves are cheaper.
- **Personal boundaries:** decisions to leave or end a relationship should remain available when the player is broke. Broken promises and visible betrayal can have contextual consequences.

## Resource handling issues to fix before judging the rebalance

1. **Alliance spending is absent from the second-wind accounting.** The proposal path directly debits banks without recording a paid social action. Its later membership log has zero cost. The second-wind rule sums action-history costs, so these real expenses do not count toward the four-Energy threshold.
2. **The old alliance reward and new management flow are inconsistent.** The older relationship-tag transition can grant 20 Influence. The new group/pact manager replaces the canonical domain and bypasses that specific trigger. A shared policy must decide whether formation earns currency. Recommendation: no automatic 20-Influence bounty for creating commitments; the durable relationship and strategic benefits are the reward. Do not award currency again merely for putting existing pact partners into a group.
3. **Automatic penalties need to distinguish betrayal from a clean exit.** The generic resource-effects table includes minus 25 Influence for breaking an alliance and minus 20 for ending a ride-or-die bond. The management flow has a different path. Use one consequence policy: ordinary leaving is free; demonstrable betrayal or broken promises can damage reputation according to context.
4. **AI autonomous governance currently bypasses proposal fees.** It calls domain management directly. Apply an equivalent initiation budget rule to AI proposers; accepting an invitation remains free for everybody.
5. **Ending and recreating commitments can repeat formation boosts.** The duplicate rule covers live or pending commitments and same-day declined/expired requests. It does not by itself stop an accepted pact being ended and recreated for another bond boost. Add pair-level diminishing returns or a formation-boost cooldown without restoring a hard pact-count cap.
6. **Weekend resources are generous enough to weaken ordinary scarcity.** Review how many lasting commitments can be acquired in the separate 30 / 999 / 999 wallet. Do not make normal-day prices excessively high to compensate for a special-event budget.

These are observed code-path differences, rather than evidence that any proposed numeric price has already been validated in complete seasons.

## Example days under the proposal

These examples assume the specified interactions succeed, the player has the required known intel/relationships, and proposal costs are recorded correctly. Political spending and failed decisions still involve risk.

| Day                                   | Actions                                                                   |      Energy spent | Resource implications                                                                                                                                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------- | ----------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pact followed by a new small alliance | Two ordinary rapport moves; one personal pact; found a three-person group | 1 + 1 + 2 + 3 = 7 | The two rapport successes earn 6 Influence; founding spends 5. The later second wind leaves 3 Energy for follow-up.                                                                                                          |
| Strategic day                         | Ask LOH Target; Reassure; Consult Alliance; Pitch Target                  | 1 + 1 + 2 + 3 = 7 | Needs sufficient earned/carried Influence for the 10-point pitch. A successful target answer provides the 100 Information needed for the pitch. This is a substantial strategic day, not proof that the pitch is overpriced. |
| Major exposure day                    | Two successful Snoop Around actions, then Expose a Secret                 |     2 + 2 + 4 = 8 | The two gathers provide 400 Information; exposure spends 300. The first-window four-Energy spend unlocks the later +3, leaving 2 Energy out of a total allowance of 10. A known eligible secret is still required.           |
| Relationship repair day               | Clear the Air; Reassure; Private Truce; Watch Room                        | 2 + 1 + 2 + 2 = 7 | Several repair/observation moves use the base allowance. The later second wind provides room for another move.                                                                                                               |

## Execution and acceptance rules

- Charge the initiating player once when a valid proposal is submitted. Respondents do not pay to consent or vote.
- A completed refusal can still consume the effort of making the approach. Duplicate commands, already-pending requests, insufficient funds, and invalid actions should spend nothing.
- If a pending request becomes impossible because of an external state change, such as an eviction, refund any political Influence fee. The approach already made can still consume Energy. Do not charge a second fee when the request later settles.
- Show the full price, available balances, and any shortfall before submission. Explain the second-wind rule in the resource UI.
- Information rewards should reflect a useful discovery or credible disclosure. Repeatedly learning the same fact should not keep generating a full payout. Existing repetition/refusal mechanics should continue to apply.
- Keep pact numbers uncapped, with realistic overcommitment, divided loyalty, and trust consequences. Prices alone should not be the mechanism preventing everybody from collecting commitments with the whole cast.

## Validation before implementation is considered balanced

First repair accounting and standardize the rewards/penalties. Then compare the proposed alliance prices while preserving other action prices and daily grants. Evaluate other changes only where the results show an actual shortfall, unfair barrier, or excessive reward.

Run full-season comparisons using ordinary starting banks, with separate Classic, Reality, Vox, and weekend results. Include successful and declined proposals, one versus many allies, low-trust early games, non-winners, nominees, and late-game carried banks. Compare the existing and proposed settings on the same seeds.

Measure the number of meaningful actions available per day, days when resource requirements block every strategic option, alliance sizes/overlap, pact collection, Influence/Information accumulation, and whether polite repair or leaving remains possible. Compare Group Chat's per-person effects and risks with the same audience reached through individual conversations. Check whether political moves earn their price through actual strategic consequences. A baseline Reality day should generally support three to five ordinary moves or a major move plus preparation, with more room when the later second wind is earned; this is a design target to test, not a hard daily entitlement.

Only change allowances or storage caps after those results reveal a remaining shortage or inflation problem. Static affordability examples are useful checks, not a substitute for full-season play.

## Code inspected

- `src/social/socialActions.ts` and `src/social/dramaModeConfig.ts`: action catalog and authored prices.
- `src/social/smExecNormalize.ts`: conversion to displayed bank-point prices and Group Chat scaling.
- `src/social/socialResourceCalibration.ts`, `src/social/SocialEngine.ts`, and `src/social/relationshipResourcePolicyMiddleware.ts`: grants, caps, later refill, and event rewards.
- `src/social/socialResourceEconomy.ts` and `src/social/SocialManeuvers.ts`: actual outcome-sensitive rewards and legacy resource effects.
- `src/social/allianceManagementActions.ts`, `src/social/allianceManagementMiddleware.ts`, and `src/social/reality/allianceAutonomy.ts`: current paid proposal, membership-log, and AI paths.
- `src/social/reality/allianceManagement.ts`, `src/social/reality/relationshipForms.ts`, and `src/social/reality/humanFlow.ts`: decisions, relationship boosts, repetition, and specialized action handling.
- `src/social/socialRuntimeConfig.ts` and `src/store/gameSlice.ts`: storage ceilings and separate weekend wallet.
