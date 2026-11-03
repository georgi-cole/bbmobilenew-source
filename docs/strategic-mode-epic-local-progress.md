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
