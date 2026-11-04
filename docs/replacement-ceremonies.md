# Replacement ceremony family (#1707)

## Ownership and timing

The store-scoped middleware records the opening nominees and a small ordered
receipt of committed saves, replacement choices and declined Safety uses. The
middleware never commits a proposed choice. The live sequence consumes one
readable decision/consequence segment at a time, rather than waiting for the
final block. A save shows its actual Safety holder; each replacement shows the
actual LOH, co-leader, Safety holder or mission chooser from that action's receipt.
Successful Ambush retains ownership of its own target reveal.

A save segment lasts 3.9 s and a replacement segment 4.1 s. Two complete Double
Trouble rounds therefore use about 16 s of film, excluding human thinking and
native confirmation UI. The standalone full-sequence preview runs about 15.5 s.
Simultaneous Detox saves or linked Cupid partners share a segment; distinct choices
have separate shots. Vox ballot replacements use the studio/ballot cue without
inventing a human chooser. Initial single/Co-LOH nomination timings are unchanged.

### Human input and safe continuation

- The finished segment hands over to an opaque held character shot and the real
  decision controls. No countdown or Skip can select a target, accept a power,
  or dismiss a mandatory choice. Tab is contained within the active controls.
- The existing game reducers validate and commit every choice. Earned mission
  power interventions reuse the existing required-Confessional decision component.
  Already-confirmed staged Safety intents resume through their canonical middleware.
- Only explicit intermediate AI replacement steps and the Double Trouble second-use
  stage advance automatically. The next gameplay phase still requires normal Play.
- A store-scoped collection ID and a consumed-action cursor prevent replay after
  Confessional navigation. Hydration starts a new receipt boundary. Decisions
  already presented in Standard mode are not replayed when Cinematic is enabled.
- A static held shot has no running animation timers. Backgrounding suspends film
  playback; disabling Cinematic/reduced motion or unsupported art retains the native
  fallback. Movie preparation failure releases its handles and required input.
- The opaque sequence cover remains between segments and human choices. Only the
  final return reveals the real roster and its compact native badges. A completed
  save is never replayed by a separate native Safety film.

The successful Ambush control is unchanged. Standard and unsupported paths retain
their existing full native ceremony behavior. VIP cinematic paths return to the
real game roster with the existing compact badge confirmation, then continue the
normal game flow once.

## Visual implementation

- Final one-, two-, three- and four-person layouts use fixed slots. Platform
  geometry remains visible from the opening, including vacant positions.
- Nominee figures use the front-pose asset's measured sole anchor. The platform
  image keeps its native aspect ratio; the contact shadow and red rim are separate
  lightweight layers. Existing nomination slot widths and the same 60% stage sole
  line are used as the visual calibration targets.
- Decision makers occupy separate, full-size opaque camera shots. LOH replacement
  shots reuse the calibrated seated pose, crown and throne; Safety and other
  holders use a front-facing character shot. Continuing nominees retain their
  physical slots and opacity in the block shot. Camera/light movement is composited
  with transforms, opacity and static gradients.
- Save and replacement events are rendered in the order captured from committed
  game changes. Detox shows both cleared nominees; Double Trouble can show the
  first replacement being saved by the second use before the next replacement
  enters.
- Vox uses the approved Vox studio with visible platforms, no chooser, and no
  confidential vote totals. Cupid retains partner groupings, pair colors, and
  simultaneous partner reveals.
- The Co-LOH opening names each actual leader-to-nominee assignment alongside
  that nominee's reveal. A replacement scene highlights only the
  leader who actually owns that choice.
- Captions stay in the lower safe area for at least 1.0 s; all variants target a
  1.2 s readable hold before the single outer fade. The gallery does not invent a
  duplicate roster or badge-handoff screen.
- Runtime effects use composited artwork, transforms, opacity and static gradients.
  No continuous particles, animated blur or new artwork files were added. Decision
  shots request the existing front/seated character assets and reusable room props.

## Review media and validation

`tools/ceremony-replacements.html` previews each unique branch and reports transfer
and decoded image sizes. `tools/capture-replacement-ceremonies.cjs` records separate
390×844 clips for ordinary, Halo, Force, Mission, Co-LOH, Detox, both Double
Trouble paths, failed Ambush fallback, three-person placement, one/multiple Vox
replacements, Cupid pairs, single Classic/Vox nominations, initial Co-LOH and the
unchanged successful Ambush control. Review videos stay outside shipped assets.

The platform support point is image coordinate `(200, 64)` in the 400×220 raster.
Its placement is calculated from that point and the shared 60.1% stage sole line,
rather than an independent bottom percentage. Character feet use each pack's
existing measured `feetY`. Platform, actor and contact shadow move with one camera.
The one- and two-person image width is 44% of the stage; three-person width is 31%.
Cupid uses two 48% pair groups with the established 72% partner image proportions.

Calibration at 390×844 CSS pixels, after the camera settles:

| Shot                  |   Figure image width | Figure centers                | Sole / platform support Y |
| --------------------- | -------------------: | ----------------------------- | ------------------------: |
| Solo                  |             171.6 px | 195 px                        |                  507.2 px |
| Two nominees          |             171.6 px | 97.5, 292.5 px                |                  507.2 px |
| Three nominees        |             120.9 px | 64.4, 195, 325.7 px           |                  507.2 px |
| Two Cupid pair groups | 134.8 px per partner | 54.4, 140.6 / 249.4, 335.6 px |                  507.2 px |

The two-person image width and sole line match the established nomination
reference. Visible body height preserves each pack's own proportions. The browser
verification checks the projected sole-to-platform difference to within 1 CSS px,
including camera composition, five viewport shapes, and every character pack.

Run `node tools/verify-replacement-ceremonies.cjs <review-directory>` against the
local preview server to repeat these checks and write the preparation, frame-gap,
cleanup and calibration report. This is a desktop Chromium check; it does not
establish performance on a physical phone.

The focused tests cover committed ownership and action ordering, variant cast
requirements, platform persistence, calibrated anchors, correct set selection,
copy safety, and film timing. Build and static gates are still required before a
pull request is updated. Manual device review remains necessary for visual
acceptance and in-game end-to-end flow.
