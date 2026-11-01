# VIP cinematic ceremonies

Cinematic ceremonies are an optional VIP presentation layer. Game reducers and the original outcome callbacks remain authoritative. A clip completes or Skip reaches the original callback once; it never awards or eliminates a player independently. After a successful competition or nomination film, the matching badge appears directly on the roster tile instead of replaying the full native badge flight/lift. Standard, missing-art and failed-preparation paths retain the full original motion. After a successful premium departure, the original coloured roster tile becomes muted and gains its existing eviction mark in about 0.9s, without a fullscreen portrait or a Grey Lux image swap. Shock films replace their native stinger and then reveal the normal announcement card.

## Access and preferences

Settings shows the Animations toggle followed by Animation style when enabled. Standard calls native components directly. VIP defaults to Cinematic unless Standard was selected explicitly. Choosing Cinematic without VIP stores that preference and opens Store; effective VIP access activates it automatically. Master Off and reduced motion take precedence. The local authoring site's debug unlock is not part of this release.

## Trigger and handoff

| Event                               | Cinematic starts                                                                | Continues into                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| LOH / Safety win                    | After minigame Continue accepts the actual winner, including early exits        | Cinematic: badge appears in place; Standard/fallback: native lift   |
| All the Power                       | Accepted Safety winner is also the current LOH                                  | Cinematic: badge appears in place; Standard/fallback: native lift   |
| Nominations                         | The game has revealed the named nominees                                        | Cinematic: badges appear in place; Standard/fallback: native flight |
| Safety save                         | A save has been decided and announced                                           | Native save, then ordinary replacement choreography                 |
| Ambush                              | The canonical backdoor reveal becomes ready after ceremony clearance            | Existing faux-TV backdoor effect                                    |
| Exit / tiebreak / Final 4 / Final 3 | A pending elimination identifies its actual decision maker and departing player | Original roster colour fade, eviction mark and outcome callback     |
| Shock                               | The actual shock announcement becomes active                                    | Original announcement card, without a second stinger                |

Cinematic portions are 4.4s for crowning, 4.2s for Safety, 4.8s for nominations, 4.5s for saving, 7s for Ambush, 8.6s for All the Power, and 8.4s for shock announcements. Departure handoffs occur after approximately 4.74s for an ordinary exit, 7.94s for a tiebreak, and 9.14s for Final 4/3. The short roster confirmation follows premium departures in about 0.9s. Full native animations retain their own timing on Standard and fallback paths. Every cinematic supports Skip and automatic completion. The separate Twin Shock story/reveal movie stays intact; its announcement motif is not an additional compulsory intro.

Back 2 the Game has one main cinematic per activation. Rules and challenge-launch keys remain ordinary cards. Both main aliases share a replay guard scoped to profile, game, activation day and candidate set; a retry does not replay the reveal. This guard is bounded and does not persist new gameplay state.

## Ruleset-specific presentation

Survival (including its legacy `survivor` alias) never enters the premium queue or prepares ceremony media. VIP and Cinematic settings do not change its native pace.

Cupid's Arrow reuses the approved choreography with both actual partners: two individually fitted crowns and thrones (4.4s), two Safety knights (4.2s), two or three nominated pairs (4.8s), both saved players (4.5s), and a shared opaque doorway exit (4.74s before native handoff). The paired All the Power film combines two crowns and the Safety shield in 4.4s. Each player retains their original native badge or elimination callback. Both coloured roster tiles receive the short muted/marked treatment together; the queued partner commits without replaying a portrait or departure. The pending-partner receipt suppresses a second shared departure, including a restored save. After the spell breaks, solo films apply again. The existing pairing reveal, spell-break story, ballots and decision UI remain native; Ambush remains excluded by Cupid's existing rules.

Vox awards immunity rather than an LOH crown. Its 6.4s immunity-result film shows the first-place player protected and the last-place player nominated together; Standard and fallback show both badges in one roster ceremony. The last-place badge stays visible through Vox's social and nomination phases until those nominations are finalized. The separate 4.4s Final 4 studio scene explicitly states that no immunity is awarded. POS wins and saves reuse the neutral Safety films; holding both roles never invokes royal All the Power. Vox milestone cards call LOH wins Immunity wins. Nominations explicitly come from secret housemate ballots. The redundant live-vote intro card is suppressed; the result announcement after the audience reveal remains. The 10s public-verdict broadcast counts the actual vote-to-eliminate percentages together, with one percentage plate beneath each player name. After the final totals settle, studio lighting dims, the safe players and their plates leave, and the departing player(s) move into focus against a restrained red grade. The original results continuation runs once and goes directly into the exit film, without a second native result reveal or repeated verdict card. Ordinary exits then confirm directly in the original roster; no LOH final-three or tiebreak decision is invented. The provisional audience-pulse preview stays separate and unchanged.

Native winner lifts preserve each roster portrait's aspect ratio while enlarging, awarding badges and returning. This includes both Vox immunity actors and rectangular tiles in responsive layouts. If the roster changes size during the ceremony, the frozen portrait returns proportionally inside its remeasured tile before the live roster is restored.

The same glass Skip pill is shared by the ceremony films, roster confirmation and final archive. It uses the original flow callbacks, so skipping advances into the same phase handoff as natural completion.

An unresolved vote tie calls the original tiebreak callback without committing an elimination. A supplied audience-approval tiebreak shows approval values separately from eviction percentages and resolves through the original callback before continuing. Skip uses the same callback contract. Vox's bespoke mode introduction and final-winner sequence stay native.

## Classic: interactive Final Power decision

The human Final LOH has a dedicated presentation for the last decision: establishing shot, the two nominees' season-grounded pleas, an explicit elimination choice, confirmation, the Eye seal, and the announcement. The scene starts after the existing Final Power holder reveal and replaces only the `pleas`, `decision`, and `announcement` presentation in `Final3Ceremony`. AI-held decisions, Vox and the subsequent Bronze Exit retain their existing flows.

An independent broadcast monitor holds one text frame at a time. Each plea displays its speaker and a short caption; longer season dialogue is split into manual caption pages without dropping words. Choice and confirmation share that same screen. Confirmation shows both **Eliminate** and **Keep**. Optional finalist comparisons use the same monitor when requested. After the seal, the monitor presents third place and the remaining finalist in sequence. Architecture, desk, monitor housing, seal, cast, crown and atmosphere remain separate layers; no text or result is baked into the generated artwork. The runtime monitor can host other content without regenerating its housing.

This is an interactive presentation, so pre-confirmation Skip reaches the choice without selecting anyone. The choice and confirmation never expire. The confirmed evictee goes to the existing local decision handler once; announcement completion hands off to the existing Bronze Exit. Only the existing Final Two continuation finalizes the elimination and advances the game. No game reducers or final-day rules are replaced.

The adapter latches existing VIP/Cinematic eligibility and prepares only the actual cast after queue and presentation ownership are granted. Standard, disabled animation, reduced motion, unsupported identity, a short viewport, and failed or timed-out preparation use native UI. A later preference change returns to the current native stage, preserving an already confirmed choice. It never starts a new premium scene on a decision/announcement remount. Ownership loss and page visibility pause the scene independently of the user's own Pause control. Scene disposal releases its resources before the existing departure presentation takes over.

The generated plates are in `public/assets/ceremonies/final-decision/`; prompts and monitor aperture geometry are recorded in `docs/assets/classic-final-decision-art.json`. The scene renderer is dynamically imported with its own scoped stylesheet. Review-only layer controls and replay are disabled in the game. This change does not add persistent presentation checkpoints or a new audio mix.

## Media and resource lifetime

The release includes six poses for each of 63 character packs: 28 AI houseguests and all 35 selectable player looks. Each pack supplies a front figure, royal standing and seated figures, a Safety knight, and separate decision and exit rear views. The additional Looks 28–35 use their existing casual artwork for the front figure and matching generated variants for the other five poses. Shared props and themed cutouts remain separate resources.

The 378 character WebPs total 20,164,414 bytes. The Final Power decision adds four independent plates totalling 190,632 bytes. Including shared scenery, props and effects, the ceremony artwork directory contains 410 WebPs totalling 21,737,272 bytes (about 21.74 MB) on disk. These totals describe the complete catalog, not the resources downloaded or decoded for one scene.

Artwork is loaded by the active scene and cast, without an eager preload of the catalog. Native, Standard and disabled-animation paths do not prepare cinematic artwork. Uploaded-photo-only players and genuinely missing character art retain the native presentation fallback.

The renderer and cast metadata are dynamically imported after entitlement and presentation ownership checks. Styles live in a shadow root. Films and their matching native-style Skip control mount at the document body so game headers and TV text cannot paint over them. A lightweight purple-and-gold prelude covers asset decoding as soon as an unqueued film starts, preventing a main-screen flash during direct ceremony handoffs. The vertical film frame fills the viewport height while preserving a portrait composition. The percentage counter uses the clip scheduler, including its pause and cancellation controls. The queue prevents overlapping clips and retains ownership through native handoff. Global presentation priority and page visibility pause/hide active clips during gameplay or backgrounding. Preparation failures/timeouts fall back to native. Completion, Skip and unmount cancel timers/animations, clear image references and remove film layers. No per-frame gameplay or particle simulation was added.

Artwork prompts and optical-layer metadata are in `src/cinematic/ceremonies/ARTWORK.md`. Crown, throne and exit anchors remain per-character metadata. Reusable hearts, halos, DNA, ballot box, antidote and pressure-wave cutouts load only for matching shock types.

## Player identity and guest registration

A player's explicit season-owned catalog appearance is authoritative when choosing a ceremony pack, including saves whose avatar URL still points to an older look or photo. Legacy avatar paths continue to resolve when no explicit catalog selection is present. An invalid or missing selected pack cannot silently resolve to a different character. Photo-only players retain the standard animation.

This matters after an early exit from a Vox competition: the last-place player joins the immunity film and can remain in the public-vote cast. All required actors must have usable artwork. The catalog coverage test starts from the selectable-look list so a newly added profile character cannot be omitted merely because tests enumerate only existing ceremony packs.

Registering a profile during a guest season applies its first selected catalog appearance immediately if both the live player and the season's identity snapshot still contain an unselected placeholder. Only appearance and avatar are filled; the contestant's name, biography, role and game progress remain owned by the season. Existing characters, uploaded photos and contestant presets are preserved. Subsequent character changes become defaults for a new season.

The first selected appearance is retained with the profile. HomeHub and ProfilePicker can repair an older adopted silhouette save when resuming it, using that first known selection and verifying that the profile owns the snapshot. The repaired run is persisted. Raw game hydration never borrows an arbitrary active profile's appearance. For older profiles without recorded selection history, only the earliest stored selection is available for repair.

## Validation

Focused routing tests cover mode rules, paired follow-ups, public percentages/ties/double results, preference gates, serial ownership, cancelled startup, Back 2 the Game aliases/follow-ups, result receipts and profile/run/day invalidation. Every selectable look is exercised in the required Classic, Cupid and Vox ceremony roles, including a human finishing last in Vox. Identity tests cover explicit selections, stale avatar paths and photo-only fallback. Asset tests verify selectable-look coverage, the retained AI packs, each pack's six slots, WebP headers, byte sizes and pose hashes.

Guest-appearance regressions cover registration, save/reload, later profile edits, owner isolation, existing catalog/photo/preset protection, rejected registration and stale-game actions. Native winner-lift regressions cover two rectangular Vox portraits through award, viewport resize, proportional return and source restoration. Browser checks at three mobile viewport sizes verify the real roster's portrait proportions throughout the animation. The local browser audit exercises ceremony triggers, native handoffs, Skip/settings changes and presentation priority. Desktop measurements are not a guarantee of zero GPU cost or a substitute for device QA.
