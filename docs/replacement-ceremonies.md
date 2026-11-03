# Replacement ceremony family (#1707)

## Ownership and timing

The store-scoped middleware records the opening nominees and a small ordered
receipt of committed saves and replacement choices. It does not store full game
snapshots, dispatch gameplay actions, or expose a proposed choice. A ceremony is
created only after the replacement block is committed. Successful Ambush stays
owned by the existing Ambush film; unsettled plans wait, and a failed or
compromised plan falls back to the ordinary film only for the actual committed
replacement.

| Event                            | Chooser / visible action                                                             | Runtime |
| -------------------------------- | ------------------------------------------------------------------------------------ | ------: |
| Ordinary, failed Ambush fallback | LOH decides; open seat is filled                                                     |   4.8 s |
| Halo Exchange                    | Safety holder takes authority; prior authority remains identified                    |   5.0 s |
| Force Majeure                    | Safety holder is identified separately from the chooser; the mandatory save is shown |   4.8 s |
| Mission backup                   | The designated mission chooser makes the selection                                   |   4.8 s |
| Co-LOH backup                    | The affected co-leader makes the selection                                           |   5.0 s |
| Detox                            | Both original nominees clear; the two actual replacements arrive in order            |   6.0 s |
| Double Trouble, one use          | Save, chooser and replacement play in sequence                                       |   4.8 s |
| Double Trouble, two uses         | The second save can remove the first replacement before the final choice             |   6.0 s |
| Vox, one replacement             | The committed public replacement enters on the Vox studio stage                      |   3.6 s |
| Vox, multiple replacements       | Each committed replacement reveals in order; no ballot count is shown                |   4.6 s |
| Cupid linked block               | Continuing pair and incoming pair reveal as paired units                             |   4.8 s |
| Initial single nominee           | One centered figure/platform, with mode-aware copy                                   |   3.8 s |
| Initial Co-LOH nominations       | Each actual leader-to-nominee choice activates its persistent platform in turn       |   6.0 s |

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
- A concise named authority cue directs attention within the same danger-room
  scene. The miniature chooser cutout has been removed following visual review.
  Continuing nominees stay at full opacity through the authority beat and final
  hold. Camera travel is limited to one slow push
  and settle; light accents are static gradients or brief opacity/scale cues.
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
  No continuous particles, animated blur or extra network assets were added.

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
