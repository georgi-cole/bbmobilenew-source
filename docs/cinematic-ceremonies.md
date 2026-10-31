# VIP cinematic ceremonies

Cinematic ceremonies are an optional VIP presentation layer. Game reducers and the native winner, nomination, Safety and Grey Lux elimination animations remain authoritative. A clip completes or Skip reaches the original outcome callback once; it never awards or eliminates a player independently. After a successful premium departure, the original coloured roster tile becomes muted and gains its existing eviction mark in about 0.9s, without a fullscreen portrait or a Grey Lux image swap. Standard, missing-art and failed-preparation paths retain the full original portrait sequence. Shock films replace their native stinger and then reveal the normal announcement card.

## Access and preferences

Settings shows the Animations toggle followed by Animation style when enabled. Standard calls native components directly. VIP defaults to Cinematic unless Standard was selected explicitly. Choosing Cinematic without VIP stores that preference and opens Store; effective VIP access activates it automatically. Master Off and reduced motion take precedence. The local authoring site's debug unlock is not part of this release.

## Trigger and handoff

| Event                               | Cinematic starts                                                                | Continues into                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| LOH / Safety win                    | After minigame Continue accepts the actual winner, including early exits        | Native winner badge/roster reveal                               |
| All the Power                       | Accepted Safety winner is also the current LOH                                  | The same native winner reveal                                   |
| Nominations                         | The game has revealed the named nominees                                        | Native nomination badge choreography                            |
| Safety save                         | A save has been decided and announced                                           | Native save, then ordinary replacement choreography             |
| Ambush                              | The canonical backdoor reveal becomes ready after ceremony clearance            | Existing faux-TV backdoor effect                                |
| Exit / tiebreak / Final 4 / Final 3 | A pending elimination identifies its actual decision maker and departing player | Original roster colour fade, eviction mark and outcome callback |
| Shock                               | The actual shock announcement becomes active                                    | Original announcement card, without a second stinger            |

Cinematic portions are 4.4s for crowning, 4.2s for Safety, 4.8s for nominations, 4.5s for saving, 7s for Ambush, 8.6s for All the Power, and 8.4s for shock announcements. Departure handoffs occur after approximately 4.74s for an ordinary exit, 7.94s for a tiebreak, and 9.14s for Final 4/3. The short roster confirmation follows premium departures in about 0.9s. Full native animations retain their own timing on Standard and fallback paths. Every cinematic supports Skip and automatic completion. The separate Twin Shock story/reveal movie stays intact; its announcement motif is not an additional compulsory intro.

Back 2 the Game has one main cinematic per activation. Rules and challenge-launch keys remain ordinary cards. Both main aliases share a replay guard scoped to profile, game, activation day and candidate set; a retry does not replay the reveal. This guard is bounded and does not persist new gameplay state.

## Ruleset-specific presentation

Survival (including its legacy `survivor` alias) never enters the premium queue or prepares ceremony media. VIP and Cinematic settings do not change its native pace.

Cupid's Arrow reuses the approved choreography with both actual partners: two individually fitted crowns and thrones (4.4s), two Safety knights (4.2s), two or three nominated pairs (4.8s), both saved players (4.5s), and a shared opaque doorway exit (4.74s before native handoff). The paired All the Power film combines two crowns and the Safety shield in 4.4s. Each player retains their original native badge or elimination callback. Both coloured roster tiles receive the short muted/marked treatment together; the queued partner commits without replaying a portrait or departure. The pending-partner receipt suppresses a second shared departure, including a restored save. After the spell breaks, solo films apply again. The existing pairing reveal, spell-break story, ballots and decision UI remain native; Ambush remains excluded by Cupid's existing rules.

Vox awards immunity rather than an LOH crown (4.2s). Its Final 4 competition win has a separate 4.4s studio scene explicitly stating that no immunity is awarded. POS wins and saves reuse the neutral Safety films; holding both roles never invokes royal All the Power. Nominations explicitly come from secret housemate ballots. The 10s public-verdict broadcast counts the actual vote-to-eliminate percentages together, with one percentage plate beneath each player name. After the final totals settle, studio lighting dims, the safe players and their plates leave, and the departing player(s) move into focus against a restrained red grade. The original results continuation runs once and goes directly into the exit film, without a second native result reveal or repeated verdict card. Ordinary exits then confirm directly in the original roster; no LOH final-three or tiebreak decision is invented. The provisional audience-pulse preview stays separate and unchanged.

An unresolved vote tie calls the original tiebreak callback without committing an elimination. A supplied audience-approval tiebreak shows approval values separately from eviction percentages and resolves through the original callback before continuing. Skip uses the same callback contract. Vox's bespoke mode introduction and final-winner sequence stay native.

## Media and resource lifetime

The release includes six approved poses for each of 55 character packs, plus shared props and themed cutouts: 358 WebP assets totalling about 19.2 MB on disk. They are public lazy resources, not imported images or an eager preload list. Only the active scene/cast resources decode. Native, Standard and disabled-animation paths do not prepare cinematic artwork. Custom or missing character art falls back to native presentation.

The renderer and cast metadata are dynamically imported after entitlement and presentation ownership checks. Styles live in a shadow root. Films and their matching native-style Skip control mount at the document body so game headers and TV text cannot paint over them. A lightweight purple-and-gold prelude covers asset decoding so the game does not show an empty Faux TV while the film prepares. The vertical film frame fills the viewport height while preserving a portrait composition. The percentage counter uses the clip scheduler, including its pause and cancellation controls. The queue prevents overlapping clips and retains ownership through native handoff. Global presentation priority and page visibility pause/hide active clips during gameplay or backgrounding. Preparation failures/timeouts fall back to native. Completion, Skip and unmount cancel timers/animations, clear image references and remove film layers. No per-frame gameplay or particle simulation was added.

Artwork prompts and optical-layer metadata are in `src/cinematic/ceremonies/ARTWORK.md`. Crown, throne and exit anchors remain per-character metadata. Reusable hearts, halos, DNA, ballot box, antidote and pressure-wave cutouts load only for matching shock types.

## Validation

Focused routing tests cover mode rules, paired follow-ups, public percentages/ties/double results, preference gates, serial ownership, cancelled startup, Back 2 the Game aliases/follow-ups, result receipts and profile/run/day invalidation. Asset tests verify every pack's six slots, WebP headers, byte sizes and approved pose hashes. The local browser audit exercises all ceremony triggers, native handoffs, Skip/settings changes and presentation priority. Desktop measurements are not a guarantee of zero GPU cost or a substitute for device QA.
