# VIP cinematic ceremonies

Cinematic ceremonies are an optional VIP presentation layer. Game reducers and the native winner, nomination, Safety and Grey Lux elimination animations remain authoritative. A clip completes or Skip hands into the original component and callback; it never awards or eliminates a player independently. Shock films replace their native stinger and then reveal the normal announcement card.

## Access and preferences

Settings shows the Animations toggle followed by Animation style when enabled. Standard calls native components directly. VIP defaults to Cinematic unless Standard was selected explicitly. Choosing Cinematic without VIP stores that preference and opens Store; effective VIP access activates it automatically. Master Off and reduced motion take precedence. The local authoring site's debug unlock is not part of this release.

## Trigger and handoff

| Event                               | Cinematic starts                                                                | Continues into                                           |
| ----------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------- |
| LOH / Safety win                    | After minigame Continue accepts the actual winner, including early exits        | Native winner badge/roster reveal                        |
| All the Power                       | Accepted Safety winner is also the current LOH                                  | The same native winner reveal                            |
| Nominations                         | The game has revealed the named nominees                                        | Native nomination badge choreography                     |
| Safety save                         | A save has been decided and announced                                           | Native save, then ordinary replacement choreography      |
| Ambush                              | The canonical backdoor reveal becomes ready after ceremony clearance            | Existing faux-TV backdoor effect                         |
| Exit / tiebreak / Final 4 / Final 3 | A pending elimination identifies its actual decision maker and departing player | Existing Grey Lux portrait elimination and roster update |
| Shock                               | The actual shock announcement becomes active                                    | Original announcement card, without a second stinger     |

Cinematic portions are 4.4s for crowning, 4.2s for Safety, 4.8s for nominations, 4.5s for saving, 7s for Ambush, 8.6s for All the Power, and 8.4s for shock announcements. Departure handoffs occur after approximately 4.74s for an ordinary exit, 7.94s for a tiebreak, and 9.14s for Final 4/3. The native animations retain their own timing. Every cinematic supports Skip and automatic completion. The separate Twin Shock story/reveal movie stays intact; its announcement motif is not an additional compulsory intro.

Back 2 the Game has one main cinematic per activation. Rules and challenge-launch keys remain ordinary cards. Both main aliases share a replay guard scoped to profile, game, activation day and candidate set; a retry does not replay the reveal. This guard is bounded and does not persist new gameplay state.

## Media and resource lifetime

The release includes six approved poses for each of 55 character packs, plus shared props and themed cutouts: 357 WebP assets totalling about 19.1 MB on disk. They are public lazy resources, not imported images or an eager preload list. Only the active scene/cast resources decode. Native, Standard and disabled-animation paths do not prepare cinematic artwork. Custom or missing character art falls back to native presentation.

The renderer and cast metadata are dynamically imported after entitlement and presentation ownership checks. Styles live in a shadow root. The queue prevents overlapping clips and retains ownership through native handoff. Global presentation priority and page visibility pause/hide active clips during gameplay or backgrounding. Preparation failures/timeouts fall back to native. Completion, Skip and unmount cancel timers/animations, clear image references and remove film layers. No per-frame gameplay or particle simulation was added.

Artwork prompts and optical-layer metadata are in `src/cinematic/ceremonies/ARTWORK.md`. Crown, throne and exit anchors remain per-character metadata. Reusable hearts, halos, DNA, ballot box, antidote and pressure-wave cutouts load only for matching shock types.

## Validation

Focused routing tests cover preference gates, serial ownership, cancelled startup, Back 2 the Game aliases/follow-ups, result receipts and profile/run/day invalidation. Asset tests verify every pack's six slots, WebP headers, byte sizes and approved pose hashes. The local browser audit exercises all ceremony triggers, native handoffs, Skip/settings changes and presentation priority. Desktop measurements are not a guarantee of zero GPU cost or a substitute for device QA.
