# Alliance management: product-owner notes

This companion document describes the current implementation behind the
[player guide](alliance-management-player-guide.md). It separates implemented
rules from behavior the interface or AI does not promise. Thresholds here are
engineering details; they are not currently shown to players.

## How an AI alliance proposal starts

AI alliance autonomy is evaluated when the game advances into a `social_1` or
`social_2` window. The saved game state records that the window was evaluated,
so replaying the same state does not create a new proposal. The system permits
at most one successful AI alliance action per window.

For each window, it considers active AI players in stable player-ID order. An AI
with one of its own alliance requests still pending is skipped. An AI whose
commitment to a current group is at or below 0.08 may leave that group; that
uses the opportunity for the window.

An AI may propose an admission if it is leader or co-leader of a current group.
It considers active people who are not already in that group and selects the
first person by player ID for whom the AI's directed trust is at least 25. It
then asks that group's members to vote. A regular AI member does not
autonomously start the admission vote.

If the AI does not lead or co-lead a current group, it can expand a current,
resolved personal pact that includes itself. It selects a qualifying person
with the same trust and ordering rule, then proposes a group containing the
pact members and that person. Every founder must approve. This proposal records
the original pact as its base pact. If formation succeeds, the ordinary base
pact is superseded; a pact whose stated purpose is Final Two, endgame,
ride-or-die, or last two is retained. A group founded separately through the
player's **Found an alliance** action does not replace existing pacts.

The AI does **not** prioritize the human player. Stable ID ordering can cause
it to approach another eligible person first, and a player can receive no
proposal if there is no eligible leader, group or pact, candidate, open group
slot, or social-window opportunity. An AI can approach the human when the human
is the candidate selected by these rules. This is an opportunity-based system,
not a guaranteed invitation schedule.

## How each decision is made

| Request                        | Who decides                              | Current AI decision input                                                                                                                                           |
| ------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Personal pact                  | Both named people                        | Each AI's average directed trust toward the other named person or people                                                                                            |
| Found a group                  | Every named founder                      | Each AI founder's average directed trust toward the other founders                                                                                                  |
| Admit a group member           | Current group electorate, then candidate | During the member vote, each AI member's directed trust toward the candidate. After approval, an AI candidate's average directed trust toward current group members |
| Accept co-leader or leadership | The named nominee                        | The nominee AI's average directed trust toward current group members                                                                                                |
| Suggest removing a member      | Group officers                           | An AI officer approves when its directed trust toward the candidate is below −10                                                                                    |
| Suggest renaming a group       | Current leader                           | An AI leader accepts when its directed trust toward the suggester is at least 0                                                                                     |

For pact, founding, admission, and role acceptance, the AI threshold is:

```text
clamp(0.12, 0.92, 0.62 + average_directed_trust / 200)
```

The request ID, actor ID, request stage, and saved game seed produce a stable
deterministic draw compared with that threshold. It is not rerolled just because
the inbox is reopened. Illustrative thresholds are 12% at trust −100, 32% at
−60, 62% at 0, about 74.5% at +25, and 92% at +60 or higher.

This is not a full strategic preference model. AI acceptance of alliance
proposals currently uses directed trust as described above; it does not weigh
group name, the player's explanation, strategic fit, or a human-visible
promise. For removal suggestions, the `< −10` rule replaces the acceptance
threshold. A single authorized officer yes finalizes a removal suggestion; it
is not a majority vote.

Human decisions are explicit. They are never filled in from trust or inferred
from a timeout.

## Admission voting in detail

The electorate is the current group roster captured when the vote starts. The
proposer is recorded as yes. The vote passes only when both conditions hold:

1. Yes votes are strictly more than half of the full electorate.
2. At least one leader or co-leader voted yes.

The table in the player guide shows the minimum yes count at each roster size.
A no vote does not immediately cancel the request; the system settles the vote
after the remaining eligible voters have answered or the response window has
passed. If it passes, the candidate receives a separate consent stage and sees
the approved roster. The candidate is not part of the member-vote electorate.
Their acceptance adds them as a regular member; it neither appoints them as an
officer nor creates separate pacts with the other members.

Every founder in a new group must consent to the same founding proposal. The
initiator is pre-recorded as yes. A personal pact likewise needs both partners'
consent. One no on either all-founder consent or a two-person pact declines the
proposal.

## Request timing, invalidation, and history

Requests use the shared game clock. The next response deadline is the next
social window: before `social_1`, that day's `social_1`; between the two social
windows, that day's `social_2`; after `social_2`, the next day's `social_1`.
When group admission moves from vote to candidate consent, the candidate gets a
fresh complete response window. Expiry is processed as the game clock advances;
no AI or human answer is inferred from a missed window.

A request becomes invalid if a required participant leaves the active cast, the
alliance ends, its roster or officer revision changes, or the candidate/group
no longer has capacity. A group can have only one admission request pending at
a time. Duplicate submissions do not extend a deadline. After a declined or
expired request, repeating it on the same game day is blocked.

Requests and decisions are persisted in the Reality social state. Founding,
admission, departure, expulsion, and dissolution also write alliance events.
The human-facing inbox shows actionable alliance items under **Alliance
proposals and votes**. Its game-control badge is the discovery route; Hub is a
record view, not an invitation mailbox.

## Capacity, offices, and membership consequences

- A current pair can have one personal pact. There is no cap on the number of
  different personal pacts a player may hold; the former three-pact limit is
  not part of the current alliance rules.
- A player may be in two groups, and a group can have six members.
- Founders and admission candidates are checked against group capacity when a
  request is created and again when it is finalized.
- A group stays kind `GROUP` if it drops from three members to two. It dissolves
  when it drops below two.
- A new group starts with the initiator as leader and no co-leader in the
  player's direct founding flow. Only the leader can offer co-leadership,
  transfer leadership, clear the co-leader role, rename, or dissolve. The
  initiator supplies the name in the founding action; the name is included in
  the all-founder consent request. Older or AI-created groups can retain their
  generated name until the current leader changes it.
- A leader can rename immediately without a vote or resource cost. A current
  non-leader member can submit one pending rename suggestion per group. Only the
  current leader can accept or decline it; accepting applies the name and writes
  an `ALLIANCE_RENAMED` event, while declining keeps the current name. If the
  leader renames the group while a suggestion is pending, that suggestion is
  invalidated. Roster or officer changes also invalidate it through the regular
  request revision checks. A suggestion expires at its normal response-window
  deadline if the leader does not answer.
- Names are trimmed, repeated spaces are collapsed, and names are limited to
  2–28 characters. Name entry and suggestions have no resource cost. There may
  be only one pending name suggestion per group.
- A leader can remove a co-leader or regular member. A co-leader can remove a
  regular member only. Any member can leave. A regular member can suggest a
  removal for officer consideration.
- Leaving or expulsion changes only that alliance. Other current group
  memberships and personal pacts are retained. Leaving the leader seat triggers
  succession: the co-leader takes over, otherwise the longest-serving current
  member does.
- Creating a group establishes pairwise social relationship changes as well as
  membership. Those relationship histories, existing promises, and learned
  information have their own records and are not erased when membership ends.
- Pact and group formation add a visible relationship boost scaled by how long
  the pair has known each other, shared interaction volume and outcomes, positive
  anchors, and current relationship quality. Negative anchors and unresolved
  grievances dampen the increase. A group admission applies the boost only to
  the candidate's links with current members. Later group formation can reinforce
  a pair that already shares a pact; it does not create duplicate membership.
- Player-submitted pact proposals cost ⚡1, group founding costs ⚡2 plus ⚡1 per
  selected founder beyond the minimum, and admission or pact-renewal proposals
  cost ⚡1. The charge happens on submission, including proposals later declined
  or expired. Votes, responses, leaving, removal, and dissolution have no fee;
  there is no recurring upkeep. AI proposals do not spend the player's resources.
- Successful founding feedback names the founders and generated group name.
  A newly formed probationary alliance is presented as **New alliance**;
  **Strained alliance** is reserved for actual strain/fracture.

## Strategy effects and what membership does not guarantee

Reality alliances are mirrored into strategic game state. The AI's protection
read depends on alliance status, each member's commitment and perceived role,
cohesion, fracture risk, infiltrator status, and whether the AI knows a shared
target plan. Strong overlapping groups can add protection, with later groups
weighted less than the strongest one. Known current and fallback targets add
their own pressure.

In the Reality alliance voting path, a player with a shared alliance usually
gets a strong protection bias, but a backstab path remains. Its current
backstab chance is bounded between 1% and 12% and varies with threat, betrayal
pressure, and AI identity. Target pressure, other game decisions, and
personality can still affect the outcome. Older tag-only/compatibility paths use
their own voting calculations. No path guarantees that members cast identical
votes, and human votes are never synchronized.

Group cohesion is computed from the mean member commitment, commitment spread,
and disagreement among stored plans:

```text
clamp01(mean_commitment − 0.55 × commitment_spread − 0.18 × plan_disagreement)
```

Fracture risk also considers low commitment, plan disagreement, and known leaks.
New members begin at 0.5 commitment. A newly created group therefore commonly
shows about 50% cohesion before its members have built a shared record. Cohesion
is a model input, not a literal loyalty poll or admission probability. The
**New group** status remains until the group has a strategy meeting; later
fractured or dormant groups can recover through their lifecycle rules.

## Current UX gaps and recommended follow-up

The current build has an in-game **Incoming requests** badge for actionable
alliance decisions, and the revised Social tutorial points players to it. It
does not send an operating-system push notification. To keep an invitation from
being easy to miss, a future notification should announce the new request when
it becomes actionable and link directly to that inbox item; avoid prompting the
candidate before the group's approval exists.

The alliance inbox currently does not display the exact response deadline.
Show the game day/phase deadline on every pending item and visually flag the
last available window. Keep the same deadline across duplicates and show when a
roster/officer change invalidates a vote.

The invite cards for two different groups currently share the title **Invite
[name]**; only their descriptions name the target group. Put the group name in
the title and confirmation, such as **Invite D to The Anchor**, to prevent
starting the wrong vote.

The **Found an alliance** picker checks the human's group limit but does not
disable every selected founder who has already reached two groups or prevent a
selection that would exceed the six-person maximum. The command is rejected
downstream, which can feel like a failed action. Disable ineligible people in
the roster and explain the limit before Execute.

The admission inbox clearly distinguishes vote then candidate acceptance, but
the **new group** inbox card does not disclose proposed leader/co-leader terms.
Show the complete roster and officer roles before each founder votes. For an
AI proposal with `basePactId`, explicitly disclose which personal pact will be
superseded and whether it is one of the protected endgame pacts.

AI initiative currently sorts player IDs rather than ranking candidates by
gameplay relevance or balancing approaches over time. This is deterministic but
can feel arbitrary and can systematically favor whichever eligible ID sorts
first. Replace the first-match rule with a seeded candidate score and include
relationship strength, strategic need, recent invitation history, capacity,
and a restrained human-candidate preference. Record an understandable reason
for the proposal so product can tune the behavior without exposing private AI
thoughts.

## Source of truth

The runtime rules live in `src/social/reality/allianceIdentity.ts`,
`src/social/reality/allianceAutonomy.ts`,
`src/social/reality/allianceManagement.ts`, and
`src/social/reality/relationshipForms.ts`. In-game discovery and response live
in `src/components/GameControlDock/GameControlDock.tsx`,
`src/components/IncomingInteractionsInbox/IncomingInteractionsInbox.tsx`, and
`src/components/SocialPanelV2/SocialPanelV2.tsx`. Strategic voting integration
is in `src/store/gameSlice.ts`.
