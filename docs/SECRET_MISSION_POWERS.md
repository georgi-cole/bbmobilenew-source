# Secret Mission reward contract

New missions use version 2 rewards. Existing saved missions retain their legacy reward identifiers and activation rules.

## Season progression

Season 1 offers only Resource Cache and Alliance Revealed, subject to their normal weekend and alliance eligibility. Repeat the eligible types across four hidden boxes; expire the offer if neither is available. Season 2 onward uses the full compatible catalog. Reconcile unclaimed boxes from earlier saves; preserve rewards already claimed.

## Boxes and timing

- Completing the actual requirements makes the reward available immediately.
- Four hidden boxes are drawn with a dedicated deterministic seed and persisted. Opening the screen or reloading cannot reroll them.
- Draw distinct types when at least four are appropriate. Repeat available types if necessary. Reconcile only invalid unclaimed positions when the game stage changes.
- Claim on the availability day or the next numbered gameplay day. The offer also expires if no appropriate rewards remain. Big Eye explains the deadline when the boxes become available.
- Two-day powers include the claim day if the relevant checkpoint is ahead; otherwise their window begins tomorrow. Shock days count and do not extend this window. Weekends do not advance numbered gameplay days.

## Reward rules

| Reward             | Effect and consumption                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No Ambush          | Confessional use/decline at one qualifying Safety ceremony. Accept protects the human from backups for that ceremony; decline spends the opportunity. Opening nominations remain legal. Ends at Final 4.                                                                                                                                                                               |
| No Next Nomination | The next eligible opening nomination ceremony cannot nominate the human, including automatically. The automatic slot passes to the next-worst eligible finisher without changing the recorded competition result. A later Safety backup remains legal. Ends at Final 4.                                                                                                                |
| Resource Cache     | Grant up to 25 Social Energy, 500 Influence, and 1,000 Information, respecting caps and displaying actual credited amounts. Requires weekends off at both season start and box assignment/claim. Unknown original settings in old saves make this reward ineligible.                                                                                                                   |
| Overthrow the LOH  | Optional at the next eligible AI victory after claiming. Accept transfers leadership and its obligations; decline spends the power. Preserve the genuine competition winner, statistics, and placements. Allowed at Final 4, ends at Final 3.                                                                                                                                          |
| No Skip            | Admit the human once to the competition after their current or next LOH tenure. Restore ordinary outgoing exclusions afterward. Does not override Co-LOH's explicit ban or endgame rules. A newly claimed No Skip is not offered at Final 4 because its following competition would be Final 3.                                                                                        |
| Veto the Safety    | During its two-day window, optionally cancel another holder's proposed standard Safety save before any gameplay effect. Declining preserves the remaining window. Ends at Final 4.                                                                                                                                                                                                     |
| Pick the Backup    | During its two-day window, optionally choose one LOH-owned backup. Confirming a legal target spends the power; declining preserves the window. Cannot target self, any LOH, POS, saved/protected players, or an existing nominee. Ends at Final 4.                                                                                                                                     |
| Co-LOH             | During its two-day window, optionally join a single AI leader before nominations. Require enough legal candidates for the block and a potential replacement, including Public Mode's additional slot. Each leader nominates one; the owner replaces their saved nominee; neither casts an ordinary vote; POS breaks ties. Both sit out tomorrow except in Democracia. Ends at Final 4. |
| Alliance Revealed  | Immediately confirm a real current alliance outside the human's membership, including previously rumoured/known groups and pacts. Persist the dated roster privately. Do not expose it publicly or grant alliance membership.                                                                                                                                                          |

## Safety presentation

For a standard Safety use, calculate and persist the intended target and deterministic resolution seed before announcing it. The block, resources, relationship consequences, memories, and success animations remain unchanged.

The next Play routes an eligible interruption to the Confessional. Veto cancels the intended save. Otherwise the original target is committed through the normal explicit-save action; an AI cannot change its announced target after No Ambush changes backup eligibility. Successful saves then resolve any optional backup choice. Each decision stage has a distinct persisted identity, so an old confirmation cannot commit a later step.

Special Safety shocks retain their established flows and do not combine with mission powers.

## Priority

Rule-changing shocks affecting competitions, nominations, Safety, or elimination reserve their day. Director-selected later-day shocks are considered before authorizing an earlier mission power. Timed powers still expire while blocked; powers restricted at Final 4 become spent without activating. Resource Cache and Alliance Reveal remain immediate.

When unused Store powers conflict, Big Eye offers keeping Store priority or switching to the mission. Switching returns unused reservations to inventory and removes their temporary shields. A Store effect already applied that day cannot be undone; the mission waits within its existing deadline. A committed mission power prevents later Store arming that day. Merely owning inventory does not block anything.

## Formats and weekends

Vox offers No Next Nomination, Veto Safety, Alliance Reveal, eligible Resource Cache, and No Ambush adapted to protection from ballot-ranked Safety backups. Opening protection also excludes zero-vote cutoff ties; backup protection applies only when Safety actually requires a replacement. Exclude Overthrow, No Skip, Pick the Backup, and Co-LOH.

Keep missions disabled while Cupid couples are scheduled/active. Standard rules resume after the spell breaks.

Record the original weekend preference separately from the current season setting. Lock current-season changes when the first real weekend begins or Day 6 starts, whichever comes first. Debug previews do not count as real weekends. Headless progression completes an interlude without disabling the locked preference.

## Validation

The new tests exercise deterministic boxes, deadlines and mode filtering, the wrapped AI-planning reducer, social side effects, replayed confirmations, Store returns, leadership transfer, co-leader exclusions, private alliance knowledge, and the actual Confessional chat panel. Legacy suites deliberately hydrate pre-v2 missions to retain save compatibility coverage.

Run the targeted mission, Safety, shared-leadership, Store, weekend, alliance, and Confessional suites, followed by `npm run check:pr` after the final edit. Manifest changes additionally require the repository's production dependency audit.

## Special Safety balance

New season plans retain a 30% overall special Safety chance and at most one scheduled variation. Conditional weights are Double Trouble 30%, Halo Exchange 30%, Detox 15%, and Force Majeure 25%: season scheduling chances of 9%, 9%, 4.5%, and 7.5% respectively. Code defaults and the shipped live configuration agree. Existing saved season plans retain their persisted selections; deployment of the configuration is required to update the hosted override.
