# Replacement ceremony family (#1707)

## Committed outcomes and continuity

The store-scoped middleware records the opening block and ordered receipts of
committed saves, replacement choices and declined Safety uses. It never chooses
a target or changes a gameplay rule. A film consumes the currently available
receipt batch. Later receipts wait until that film completes; they cannot restart
an action already on screen. Successful Ambush keeps its existing target film.

Every physical platform exists before its occupant arrives. Continuing nominees
retain their slot and opacity. A saved figure leaves once; an incoming figure
appears once under a light cue. The outgoing film holds its last composed frame
while the next film prepares. The final return fades to the actual roster and
existing compact badge confirmation, without a duplicate gallery/results card.

## Decision makers and timing

- Leadership takes visual precedence over Safety for every decision type. LOH
  uses the fitted seated royal pose, crown and throne. If the same player or
  Cupid unit holds Safety, a separate shield stands beside the throne. Winning
  Safety while already holding LOH uses this same All the Power treatment.
- Nonroyal Safety and mission holders use the existing rear decision pose in a
  close foreground composition facing the block. This layer has no opaque
  backdrop. A self-saving nominee is not duplicated in the foreground.
- The first authority shot has a 2.6 s suspense interval. A continuing decision
  by the same authority uses a shorter cue instead of another character intro.
  Each consequence has a 1.55–1.9 s hold. Natural mist, a restrained light sweep,
  camera motion and a dark purple/gold lens transition connect the shots.
- Consecutive Detox replacements by one holder share one introduction and reveal
  sequentially, 1.65 s apart. Simultaneous clearings and linked partners stay units.
  Double Trouble preserves each actual save/replacement in order, including a
  second save of the first replacement. Different actors remain distinct.
- Initial Co-LOH nominations show each actual leader making their own choice.
  The nominee's persistent label identifies that leader. Unassigned automatic
  nominations do not invent an actor.
- Cupid role pairs share a royal shot with both actual leaders. Nominee partners
  remain grouped on one platform, with individual fitted feet and pair colors.
- Vox keeps its studio and block visible throughout ballot replacements. Each
  incoming nominee is labelled with their actual rank in the original secret
  ballot, including ties and ranks beyond second. Vote totals are not exposed.
  Wider tied blocks use a camera track and final overview rather than dropping
  nominees or limiting the layout to three.

Timings are calculated by `replacementBeats` and `replacementDuration`, so the
standalone review and live renderer share the same schedule. `ClipController`
reports the mounted duration for capture tools. Human thinking time is unbounded
and is not included in the film duration.

## Human input and safe continuation

The ceremony presents the actual human authority, then opens the existing
required Confessional route. All choices use the canonical decision controls
and reducers. Confirming a real target returns automatically to its consequence
film. A binary Use confirmation stays in the Confessional while its target still
needs selecting. Earned mission-power interventions retain their normal priority.

The return context contains only game/week identity and the committed receipt
cursor. Stale contexts are rejected. Skip/Escape can open the required Confessional
or skip a completed film; they never accept a power, select a target, or dismiss
mandatory input. Only explicit AI substeps and already-confirmed staged intents
may advance automatically. The next normal gameplay phase still requires Play.

Consumed receipts and the last authority identity survive Confessional navigation.
An already introduced dual holder is not repeatedly shown in casual and royal
clothes. Hydration starts a new collection boundary. Decisions presented in
Standard mode are not replayed when Cinematic is enabled halfway through.

VIP access, Cinematic preference, animation toggle and reduced-motion handling
retain their existing gates. Standard, unsupported artwork and Survival retain
their existing native paths. Startup failure releases movie resources and leaves
required decisions available. Backgrounding pauses playback. Completion cancels
scene animations/timers and releases mounted layers and image references.

## Spatial calibration and performance

The platform support point is image coordinate `(200, 64)` in its 400×220 raster.
Soles, platform surface and contact shadow share a 60.1% stage support line. Each
character uses its pack's measured `feetY`. Camera transforms move the whole
composition together; they do not override fitted image transforms.

The established nomination proportions remain the reference: solo/two-person
image width 44% of the stage, three-person width 31%; Cupid uses two 48% pair
slots and 72% partner image widths. Wide blocks retain that close-shot geometry
and use a scaled overview only when the whole block must fit on screen.

Effects reuse existing WebP artwork and static gradients animated with transforms
and opacity. Moving figures and platforms avoid live drop-shadow filters; the
artwork lighting, contact shadows and gradient light cues provide depth.
No rendered video, new raster, continuous particle system or animated
blur is added to the application. Preparation is lazy, and scene cleanup is
separate from the browser's own image/network caches.

## Review and validation

`tools/ceremony-replacements.html` previews 24 scenarios, including ordinary,
Halo, Force, Mission, Co-LOH, Detox, Double Trouble variants, failed-Ambush fallback,
Vox ranks/multiple tied nominees, Cupid pairs, solo nominations, shared power,
tiebreak and the unchanged successful Ambush control.

`tools/capture-replacement-ceremonies.cjs` records each natural playback at
390×844. Review media remains outside shipped assets. The actual-game review
also covers the production roster/compact handoff and a five-choice human
Double Trouble walkthrough through the real Confessional.

`tools/verify-replacement-ceremonies.cjs <review-directory>` checks projected
sole/platform error within 1 CSS px, five viewport shapes, every character pack,
intermediate occupants, completion cleanup, preparation cost and frame gaps.
Image-alpha checks also confirm that foreground holders do not cover the
nominees' faces, across ordinary, three-person Vox and paired Cupid shots for
every character pack.
Foreground framing uses each pack's head anchor and a height cap so holders
remain recognizable on wider or shorter screens too.
These are desktop Chromium measurements, not a zero-cost guarantee or a
physical-phone performance certification.

Feature regressions cover receipt order and batching, authority precedence,
shared Cupid roles, Co-LOH ownership, ballot rank, platform persistence, suspense
timing, real Confessional continuation and Standard fallback. Repository PR gates,
marketplace review and web/mobile builds remain required before publishing.
