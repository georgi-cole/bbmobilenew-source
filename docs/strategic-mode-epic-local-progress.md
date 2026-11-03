# Strategic mode epic — local delivery

Epic: [#1711](https://github.com/georgi-cole/bbmobilenew-source/issues/1711).
The owner changed delivery to local branches and commits on 2026-11-03. Do not
push, open new PRs, merge, or wait for remote CI without a new instruction.
Branches depend on the preceding local phase; the owner handles GitHub review
and merges. The original dirty checkout is preserved separately.

| Work                                                   | Branch / result                                                  | State                                          |
| ------------------------------------------------------ | ---------------------------------------------------------------- | ---------------------------------------------- |
| Phase 2: diagnostic context                            | PR #1712, merge `7c8ac8e3f2f4`                                   | Merged; all applicable CI passed               |
| Simulator prerequisite                                 | `codex/repair-headless-social-driver`, `55ae08623491` / PR #1713 | Open; local checks passed; owner handles merge |
| Phase 3: alliance choices                              | `codex/strategic-alliance-choices`, based on `55ae08623491`      | Local implementation                           |
| Phase 4: social conduct                                | Pending                                                          | Not implemented                                |
| Phase 5: consequences and feedback                     | Pending                                                          | Not implemented                                |
| Phase 6: consolidated calibration and release evidence | Pending                                                          | Not implemented                                |

## Phase 3

New alliance requests pin `strategicPolicyVersion: 1`. Legacy pending requests
retain their prior decision weights after hydration. The bounded invitation
modifier uses the actor's existing personality, own directed relationships,
known promise outcomes, nomination risk and witnessed public conflict. It does
not read exact public ratings, private ballots, unknown pacts or another actor's
private relationships. Public conflict signals association risk, not proof of
misconduct or a guaranteed audience reaction.

- A Classic nominee can see value in cooperating with the current nominator.
  The existing stronger same-day protection-appeal modifier and rare principled
  refusal remain separate and retain their original evidence requirements.
- A reputation-conscious Vox nominee may be more cautious after witnessed public
  conflict. Fear and calculated opportunism can still favor cooperation in either
  format. Tactical consent states limits instead of claiming repaired trust.
- A group can discuss nomination cover, support, information or strained trust
  without creating shared ballots or promises. A member's declared dissent is
  distinct from an explicit broken promise, which retains its existing resolver.

Hard eligibility, human consent, capacities, officer permissions, tie handling,
deadlines and group-switch validation remain authoritative. Recruitment now uses
the recruiter's own read instead of inspecting a candidate's private attitude
toward a target. Cupid and Survival receive no new invitation preferences.

Local validation: 96 alliance/consent/pact/betrayal tests; 44 additional history,
campaign, bridge, integrity and mode-context tests; marketplace generation and
checks; focused ESLint and TypeScript. Full release calibration, real-game UI
evidence and the consolidated lifecycle matrix remain phase 6 work.

## Phase 4

The background driver explicitly opts Classic/Vox actors into the shared strategic
preferences. Diagnostic and legacy policy calls keep their existing weights.
Grounded grievances can support private boundaries or public challenges; Classic
power and fear can favor diplomacy, while Vox public evidence can favor measured
resistance. Both formats retain fearful cooperation and emotional exceptions.
Existing costs, execution guards, four-attempt fallback, cooldowns and player
boundaries remain authoritative. No new action or public-vote formula is added.

Safety-request subjects use the actor's own read. Investigation no longer selects
an unknown hidden relationship or assumes a counterpart's private intel. The
missing `ask_nemesis_reason` content entry now supplies action-specific dialogue
that distinguishes explanation from forgiveness.

Local validation: 114 focused utility, causal conflict, incoming dialogue,
relationship-boundary, mode-isolation and driver/lifecycle tests passed. Targeted
ESLint and TypeScript are also run locally. Audience effects remain phase 5 work;
consolidated replay/browser/performance validation remains phase 6 work.

## Phase 5

Public story reactions now filter private events and check source-event identity,
actor, action and target. Grounded boundaries, unsupported attacks, escalation,
substantiated exposure, accountable repair and explicit promise breaches have
separate reason codes in the existing audience feed/dossier. Popularity alone
never proves misconduct. Repeated attacks can create sympathy for an unpopular
target; private pacts and private romance tags do not become public evidence.

Persisted, bounded reaction receipts prevent duplicate story/mission processing
across replay and hydration. Legacy history seeds that ledger without reapplying
old effects. Repair credit is at most one positive reaction per pair/window;
repeated repair and warmth are capped. Existing Charisma/Gameplay/Integrity,
positive damping and seeded audience mood remain authoritative. Public-vote and
finale formulas are unchanged, including Vox with the Public Meter hidden.

The seven-suite local audience run has 79 passes and four failures. All four also
fail against the previous local commit, verified by temporarily restoring the
previous audience implementation and restoring the new files afterward:

- `eventDrivenReactions.test.ts`: “gives no LOH penalty for nominating a disliked player”.
- `publicOpinionMiddleware.test.ts`: AI nomination mission progress.
- `publicOpinionMiddleware.test.ts`: AI vote mission progress.
- `publicOpinionMiddleware.test.ts`: missing `publicOpinionConfig` test import.

Per the owner's local-only strategy, those existing failures are documented for
owner repair. The new grounded-consequence and duplicate/save-load cases pass;
local TypeScript passes. The feature must not be described as fully release
validated while these failures, browser evidence and PO review remain open.

## Phase 6: local evidence and rollback

Set `VITE_STRATEGIC_PREFERENCES=false` before building to disable new social
preference weights and stop pinning new alliance requests to policy v1. Existing
v1 pending requests retain v1 resolution so a rollback does not reroll their
consent. Vox legality and privacy fixes, audience receipts and already recorded
choices remain active. Invalid new numeric preferences fall back to legacy
weights. This control has no product-facing UI and changes no official rules.

Matched scenario cohorts use identical relationships, witnessed public conflict,
nomination risk, persona and 256 seeds per row. Only format authority varies.
These are scenario acceptance counts, not season win rates:

| Persona      | Offer | Classic accepts | Vox accepts |
| ------------ | ----- | --------------: | ----------: |
| Loyal anchor | Pact  |             127 |          92 |
| Loyal anchor | Group |             153 |         111 |
| Opportunist  | Pact  |             133 |         115 |
| Opportunist  | Group |             157 |         135 |
| Antihero     | Pact  |             126 |         106 |
| Antihero     | Group |             153 |         120 |

Every cohort contains both acceptances and refusals in both modes. The public
conflict scenario makes cooperation less attractive to some Vox personas; this
is not a rule that Classic always accepts or Vox always refuses. Fear-driven
cooperation, proud resistance, unknown evidence, actual nomination authority,
saved requests and bounded fallback have separate regression cases.

Two real browser journeys passed at 390×844: fresh profile/campaign launch and
exact-phase save/reload. Screenshots are in `artifacts/strategic-mode/` in the
worktree. Those capture actual game layout, not every new audience-feed reason.
The browser reported unresolved backup portrait preload URLs but rendered the
main portraits and passed the journeys. No claim of complete visual/performance
validation is made from these two tests.

A local full-season Vox browser attempt (`--mode=voxPopuli`, seed 1711,
VIP test entitlement) failed before entering the season: the existing launch
adapter could not find “Choose your contestant”. No season report was produced;
this is an incomplete validation attempt, not a passing Vox journey.

Remaining acceptance gates: fix the four verified pre-existing audience test
failures, complete broader Vox/Classic browser and terminal-state coverage,
review performance and new feed text in actual gameplay, and obtain PO gameplay
approval. The full epic is not release-complete until those gates are satisfied.

Final local `npm run check:pr` passed after the last code edit: changed-file
formatting, test hygiene, marketplace checks, ESLint with zero warnings,
TypeScript and all 460 core regressions. The final targeted utility/context run
also passed 27 tests after fixing diagnostic-only rollback behavior. The four
known audience-suite failures remain outside the core gate and are not hidden by
this successful result.

Local commit order for owner review is `55ae08623` (simulator / open PR #1713),
`ab3d69382` (phase 3), `997cd9a37` (phase 4), `97477190a` (phase 5), then the tip of
`codex/strategic-release-validation` (phase 6 controls/evidence). After merging
#1713, rebase or cherry-pick the remaining phase commits onto updated main rather
than introducing the simulator change twice. No later branch was pushed or
merged by this session.

## Simulator evidence and known follow-ups

The restored headless driver retains production legality, resources, attempt
limits and action caps. `--verify-replay` runs independent process pairs and
compares outcomes and decision transcripts. The two-seed smoke cohort completed
four executions with identical pair results and no incomplete seasons:

| Roster / season / action seed       | AI actions | AI pacts | Strategy meetings | Champion |
| ----------------------------------- | ---------: | -------: | ----------------: | -------- |
| 1711 / 2246824218 / 3266491620      |        497 |        8 |                16 | Mimi     |
| 2654437480 / 198679429 / 2238014233 |        479 |        9 |                17 | Echo     |

This is reproducibility evidence, not a balance conclusion. An earlier interrupted
six-report exploratory batch is excluded. Headless currently supports Classic
only; Vox/Cupid/Survival need browser journeys.

The pre-existing incoming-content coverage failure for `ask_nemesis_reason` was
repaired in local phase 4; the expanded suite now passes. Product-owner gameplay approval is still required by
the epic before calling the full feature complete.
