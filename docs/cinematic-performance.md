# Cinematic performance gate

This is the repeatable measurement procedure for credits, Twin Shock and later
presentation families. A Chromium run helps find browser regressions; it does not
certify a native Android or iPhone build.

## Shared motion language

Keep each broadcast beat legible and brief: enter, emphasize once, hold the
decision or result long enough to read, then exit. The shared CSS tokens in
`src/index.css` define a 160 ms fast response, 360 ms entrance and 520 ms
emphasis, with separate settle and emphasis easing curves. Avoid continuously
animating large surfaces during gameplay; use transforms and opacity for scene
changes, and stop ambient motion whenever another presentation owns the screen.

| Phase                       | Entrance and emphasis                                                                        | Hold and exit                                                                 |
| --------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Nomination / ceremony       | A short stage fade, staggered nominee tiles, one badge landing beat                          | Keep the nominee/result fixed while it is read; dismiss the stage as one unit |
| Public save                 | Reveal the live share values together, then pulse only the saved player/value                | Count-up is isolated to its own small component; stop after the final number  |
| Audience verdict            | Move the live vote indicator once to the computed result                                     | Keep the exact result visible; no repeated full-screen pulse                  |
| TV announcement             | One pop on entry and one finite spotlight/wave for special results                           | Let outcome copy settle before the next route or presentation                 |
| Season finale / winner lift | Lift existing tiles with a compositor transform, then land the award badge                   | Return tiles to their current roster positions before releasing the overlay   |
| Credits / Twin Shock        | Use a decoded cinematic frame when ready; retain the poster/live chapter sequence underneath | Keep Skip available, pause in background, and release media on exit           |

The announcement, save and verdict values remain sourced from live game state.
Counter animation updates stay isolated from the surrounding ceremony. Every
presentation follows reduced-motion and animations-off settings; scene ownership
also pauses the weekend-party ambience. The credits and Twin Shock CSS fallbacks
pause their moving layers while video is visible; reveal pulses and TV stingers
run for a fixed number of passes. Reduced motion and animations-off keep Credits
on its poster/timeline fallback and complete Twin Shock without attaching video.
Review screenshots or a short capture at each listed phase on a narrow phone
viewport and landscape viewport before changing these timings, and repeat the
same gameplay performance sequence after the overlays.

Credits text now has its own clock component, so frame updates do not rerender
the native media element, poster or Skip control. The fallback clock freezes
while the page is hidden or another group owns presentation. The shared motion
setting hook observes both app controls and the system preference, including
changes made while a scene is mounted. Its body-class observer is shared and
disconnects when the last consumer unmounts.
Its system media-query subscription is also shared and removed after the last
consumer. It does not rely on Framer Motion's initial-only reduced-motion value.
Once Credits switches to the live fallback after motion is disabled, that run
keeps its elapsed chapter if motion is re-enabled, without attaching a fresh
video or replaying the opening.
The separate soundtrack can start or resume at that live chapter even when the
video renderer fails or remains disabled.

The shared minigame host claims presentation before mounting rules/countdown;
native LOH/POS overlays use the same gameplay priority. Countdown publication
waits for that ownership commit, allowing covered video sources to detach first.
This prevents media preparation during gameplay without waiting for media to
load. Finale, eviction and Twin Shock instances are keyed to the run/profile,
so replacing a run unmounts their previous timers and media.

TV announcements, fullscreen shock cards, ceremonies, Public Save and Audience
Verdict also register with this owner policy. A nested shock card shares the
fullscreen group. Covered surfaces become inert and hidden, their CSS animations
pause, and their observers, timers and frame callbacks stop. The shared finite
timeline preserves remaining time and records fired cues, so restoring a scene
does not replay its audio cues or add another completion. Vote counters keep
their displayed progress while suspended. Gameplay clocks retain their existing
background policy.

## Browser capture

Keep the game at the same settled starting screen and use the same fixture, seed,
animation settings, cache state, route and viewport for both builds. Start a fresh
browser context for each run. Record the build revision, exact device and OS,
WebView/browser version, cold/warm state, thermal state and run number. Use at
least seven baseline runs per device profile before comparing a candidate.

Run the interactive browser recorder against a locally served build:

```text
node scripts/run-cinematic-performance.mjs --url=http://127.0.0.1:4173/bbmobilenew/ --label=credits-baseline-01 --run=1 --device="desktop model" --os="OS version" --fixture="scenario and seed" --settings="animations on; reduced motion off" --cache=warm --thermal="cool; unplugged"
```

Use `--cache=cold` for a first-load capture. Use `--cache=warm` to load the same
entry route once and reload it in the same browser context before capture. These
labels describe browser-cache state; they do not claim a cold native process.

At the recorder prompt, start capture, then perform 20 cycles containing both
normal completion and Skip. Include one presentation route exit and return, and
one real background/foreground transition during capture. After the last
presentation, immediately run the same timed minigame and interaction sequence,
then stop capture. The JSON report is written to
`artifacts/cinematic-performance/`. The recorder counts route and visibility
coverage as well as frame gaps,
dropped-frame intervals, long tasks, click-to-next-frame response, animation
callbacks, timers, event listeners, active and source-attached media, pending
cinematic preparation, presentation-root handoffs, detached roots still retained
by JavaScript, and JavaScript heap where Chromium exposes it.

The injected wrappers and per-frame sampler add measurement overhead. Use the
same recorder for baseline and candidate and confirm any material finding with an
uninstrumented trace. Chromium CPU throttling is a separate browser stress run;
do not substitute it for physical phones.

Save at least seven baseline runs as `credits-baseline-01.json` through
`credits-baseline-07.json`, then use the same prefix pattern for candidate runs.
Compare the saved reports before changing any thresholds:

```text
node scripts/compare-cinematic-performance.mjs --baseline-prefix=credits-baseline --candidate-prefix=credits-candidate --refresh-hz=60
```

The comparator checks that capture setup and coverage match, then reports the
baseline median, median absolute deviation, candidate median and predeclared
tolerance for each metric. It exits unsuccessfully when the comparison is
invalid, an eligible metric regresses, or presentation resources remain after a
handoff. Keep each raw JSON run with the comparison result.

## Predeclared comparison rule

For every “higher is worse” metric, compare the median of at least seven baseline
runs against the candidate median. Calculate baseline median absolute deviation
(MAD) before opening candidate results. The provisional rejection boundary is the
baseline median plus the greater of `3 × MAD` and the metric's measurement floor:

| Metric                                              |                   Measurement floor |
| --------------------------------------------------- | ----------------------------------: |
| Frame-gap p95 and click-to-next-frame p95           | one refresh interval for the device |
| Long-task p95                                       |                                8 ms |
| Dropped-frame share                                 |                  1 percentage point |
| JavaScript heap at capture end (when exposed)       |                               1 MiB |
| Time from media load start to first data / playback | one refresh interval for the device |
| End-of-capture resource counters                    |                   one resource item |

These are comparison tolerances, not claims that a device meets a product target.
Use the slower of measured display refresh and 60 Hz when the refresh rate is
unknown. Report every raw run and variability range; do not tune the tolerance
after looking at candidate data. A candidate also fails if a completed handoff
leaves a presentation video, preparation request or presentation root alive when
the baseline has none. Active global music, timers and listeners are compared to
the same phase baseline because the game itself may own them.

The comparator checks end-of-capture animation callbacks, timers, listeners,
running Web Animations, active audio, attached audio sources and retained detached
presentation roots against that same-phase baseline. When JavaScript heap is
available, it also compares the range of the last five settled presentation-cycle
samples against baseline variability.

JavaScript heap at capture end is a noisy browser signal, not a post-GC leak test.
Native/WebView process memory, hardware decoder state, GPU memory, battery and heat
require device OS tools and a sustained device session. Memory should settle to a
plateau across the last five cycle-end samples within the baseline variability;
immediate OS reclamation is not required.

## Device evidence and release gate

On 2026-10-30 the user deferred Mac/Xcode testing and requested that its absence
not disable video. Twin Shock video is enabled by default in development and
release builds, with its existing bounded fallback, Skip, ownership and media
teardown controls. No iPhone compilation or physical iPhone run has been
performed; device evidence and device-derived budgets remain pending. Prepared
Mac packages are retained for a future request. No additional Xcode execution
is currently requested.

Use representative Android and iPhone builds, plus an older/lower-performance
supported phone when available. Record the exact model, OS, app revision, WebView,
display refresh, thermal/battery state, audio and motion settings. On each device,
measure credits and Twin Shock separately: time to first usable scene/frame,
steady playback, Skip response, route handoff and the same timed gameplay after
the presentation. Run 20 cycles with normal completion and Skip, rapid input,
route exit, background/resume, missing/slow/corrupt media, reduced motion and
animations-off. Include a sustained session to expose thermal and battery trends.

No phone or iPhone capture tool was attached in the current workspace session, so
there is no physical-device baseline or pass result in this report. The user's
default-on rollout decision above is independent of that pending evidence. The
known-good live Twin Shock sequence and credits poster/fallback remain available.
Do not describe browser tests or asset metadata validation as a native performance
pass.

## Local browser lifecycle smoke

`e2e/playwright/premium-presentation-media.spec.ts` imports the real Playwright
fixture rather than the shared UI fixture that mocks `HTMLMediaElement.play()`.
It decodes the credits in Chromium, checks the live closing card, runs 20 mixed
End/Skip cycles, and checks the captured video element has no source and is
paused after every handoff. End cycles seek near the end to accelerate cleanup
coverage. The same Quick Tap Race seed (730), four-player setup, normal countdown
and twenty taps run before and after the presentation cycles, reaching results
with no video source attached during gameplay.

```text
PLAYWRIGHT_BASE_URL=http://127.0.0.1:4180/bbmobilenew/ npx playwright test e2e/playwright/premium-presentation-media.spec.ts --project=compact-mobile-chromium --project=desktop-chromium
```

Set the environment variable using the syntax for the current shell (for
PowerShell, `$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:4180/bbmobilenew/'`).
The report includes screenshots and explicit browser-only cleanup evidence.
This is a functional lifecycle test, not a full-duration performance baseline,
seven-run comparison, hardware-decoder certification or physical-device pass.

`e2e/playwright/twin-shock-media.spec.ts` seeds both outcomes through the real
reducers and presents them on the game route. Twenty accelerated End/Skip cycles
check live verdicts, roster identity, phase completion and detached sources. With
the development pilot enabled, the test requires real decoding and captures both
live chapter/verdict branches. With it disabled, it verifies the live fallback
instead and records `actualDecodingVerified: false`. Its JSON evidence is saved
under `renders/premium-presentation-audit/`; browser-only and accelerated-run
limitations remain explicit.

## Rollout and rollback controls

### Repeated browser comparison

`node scripts/cinematic-performance/run-browser-comparison.mjs --family=twin`
runs seven sequential baseline/candidate pairs, alternating their order. Each
capture uses twenty sequences, balanced between complete playback and Skip, and
the same timed Quick Tap fixture before and after. No video seeking or timer
acceleration is used. Use `--family=credits` for a separate credits series; do not
run both series simultaneously or run builds/tests during a measured series.

The runner resolves `origin/main` as its baseline and freezes that revision's
sources separately from the current candidate before starting Vite. Use
`--baseline=<full-pre-change-SHA>` to retain that baseline after committing or
merging a candidate. Source enumeration comes from the baseline Git tree, so a
newly committed candidate module cannot enter the baseline by accident. Reports
record the selected reference and resolved revisions. The native artifact builder
uses the same default reference and accepts the same explicit option.

The runner disables hot reload and freezes changed public assets (including
the original main credits video). Unchanged public assets use the shared checkout
and must remain unchanged during capture. Reports include source, dependency and
instrumentation fingerprints. This is explicitly a development-runtime browser
comparison, not a production/native benchmark. The background interruption is a
synthetic document visibility event pair; native app suspension still needs a
device test. Identical observational root annotations are injected into both
versions because main predates the presentation markers.

Each run uses a fresh browser context and reloads the home route. One additional
home reload is allowed only before recording if the warmed home route does not
appear; its count is recorded. Media-readiness assertions, scene budgets, run
counts and comparison tolerances are unchanged. Failure screenshots, page
diagnostics and teardown have time limits so an unresponsive test browser cannot
silently hold the runner indefinitely.

The first
cinematic use is cold and later cycles are warm; that mixed cache profile is
recorded explicitly. Separate controlled cold/warm device profiles are still
required for acceptance.

Reports are written under `renders/premium-presentation-audit/<capture-id>/`.
Compare them with `node scripts/compare-cinematic-performance.mjs
--directory=renders/premium-presentation-audit/<capture-id>
--baseline-prefix=twin-baseline --candidate-prefix=twin-candidate --refresh-hz=240`
(use the measured host refresh rate). The comparator requires seven runs per
version and also compares the separate before/after gameplay segments. A new
video family with no baseline video has no comparable baseline startup samples;
that missing evidence remains visible in the result. Do not replace it with a
zero or a claimed device pass.

The four-sequence fixture smoke on 2026-10-30 completed both versions, with full
normal playback, Skip, route exit and a synthetic visibility interruption. Both
reports finished without browser errors or attached/active presentation video
sources. This smoke ran alongside validation work, used an earlier recorder, and
does not count toward the seven-run performance series.

- Twin Shock video defaults on in development and release builds.
  `VITE_FEATURE_TWIN_SHOCK_VIDEO_PILOT=false` explicitly selects the existing
  live chapter sequence. An unavailable Mac/Xcode test does not block playback.
- The manifest retains its separate device-evidence record: status, report
  references and delivery budgets remain pending/null until actual measurements
  are reviewed. Enabling playback does not populate or approve those records.
- `VITE_FEATURE_CREDITS_VIDEO=false` disables credits video independently and
  immediately uses its poster/live text timeline and Skip. Other game animations
  remain available. The existing credits family otherwise keeps its current
  default enabled behavior.
- Rebuild/restart after changing these build-time flags. Verify the fallback,
  existing game outcome and source teardown after a rollback. A new encode
  requires a new manifest revision and another device review before approval.

The flag tests cover the default and explicit rollback in development, web
release, Android and iOS modes. They do not produce physical-device reports.

## Backlog acceptance still to verify

### Measured desktop series, 2026-10-30

The preceding candidate repeat attempt in
`renders/premium-presentation-audit/twin-2026-10-30T20-24-08-984Z/` completed five
matched twenty-sequence pairs (200 sequences) with passing lifecycle checks and
no browser page errors. It stopped on the first scene of candidate run six:
the five-second playback assertion did not observe a playing, decoded video.
The screenshot shows the live childhood chapter, but the original failure report
did not retain media state or the partial recorder capture, so the startup cause
is undetermined. This is **not an accepted seven-pair series**. Its completed
reports and failure screenshot/JSON are preserved. An earlier attempt stopped
with native test-process allocation errors; the five-pair attempt limited the
test tool's Rust workers to two, without changing game code or tolerances.

The runner now retains video source/readiness/error state, visibility, motion
classes, mounted presentation roots and the partial recorder report on failure.
That diagnostic change has a new instrumentation fingerprint. Do not silently
combine its future reports with the previous tool version or discard the failed
startup when describing the result.

The following Credits attempt also stopped with a native test-process allocation
failure, before completing its first baseline report. The runner now keeps only
one frozen Vite server/compiler graph alive at a time and closes the previous
server between versions. The browser run order still alternates. Optional
`node --expose-gc` collects only the test host's closed compiler graph between
captures, never the measured browser page. Host memory is logged separately,
and the server/worker/host-GC policy is recorded and compared in report metadata.
Browser heap sampling and all comparison tolerances are unchanged. The failed
Credits attempt is retained in
`renders/premium-presentation-audit/credits-2026-10-30T21-38-53-795Z/`.
The fixture also explicitly limits dependency discovery to its `index.html`.
The installed Vite scanner otherwise searches all HTML entries, including 303
HTML files in generated local packages/reports. Those copies are outside the
frozen app fixture and must not be scanned as additional application entries.

A separate post-capture listener diagnostic retained before/after GC attribution
in `renders/premium-presentation-audit/twin-2026-10-30T22-05-31-217Z/`.
Main had 385 registrations before GC and 346 after it; the candidate had 398 and 359. The persistent difference was exactly thirteen Playwright window listeners:
its global-listener self-check and twelve hit-target interceptors. The diagnostic
did not identify those thirteen as game listeners. Both versions also had 39
temporary detached-element registrations freed by GC. The runner now performs
the same harmless `body` locator evaluation in both versions before capture,
initializing Playwright's main-world helpers symmetrically. Counts and tolerances
are not reduced or filtered. The diagnostic's forced page GC occurs only after
its recording stops; it is not performance acceptance or a replacement for fresh
matched runs with the corrected setup.
The follow-up calibration in
`renders/premium-presentation-audit/twin-2026-10-30T22-12-01-522Z/` observed
identical counts in both versions: 230 at capture start, 398 at capture end and
359 after the diagnostic GC. It uses one sequence per version and is only an
instrumentation check; it does not satisfy the repeated performance gate.

The recorder preserves a captured Skip or video End when Credits navigates home
before unmounting. A direct route cancellation keeps its own outcome even if
late media/input events follow it. Nested-root unit regressions cover all three
orders. The preceding four-cycle Credits server smoke completed decoded playback
and cleanup but misclassified automatic navigation, so its zero Skip/normal
coverage counters are not accepted coverage. That artifact remains diagnostic.

On 2026-10-31, the live system-motion update and no-replay Credits fallback passed
focused tests with the media/counter recorder regressions. The latest Credits,
motion and recorder subset passed 31 tests. The full set of ten
real-browser fault, route-cancellation and system-motion-change tests passed in
the compact Chromium viewport
(`renders/premium-presentation-audit/presentation-browser-audio-final.log`). Three
development watch-root tests verify that generated reports are ignored with
Windows or normalized separators while the current worktree source stays
watched. Development dependency discovery is limited to the game entry page.
These checks are local/browser evidence and do not approve device budgets.

The final 34-suite presentation run passed all 239 tests after the motion-hook
and Credits fixes, followed by `npm run check:pr` with all 164 core tests passing.
Evidence is retained in `final-presentation-feature-tests.json` and
`check-pr-after-audit.log` under `renders/premium-presentation-audit/`.
Test totals describe their selected suites. The earlier full
TV-announcement suite comparison had thirteen failing assertions shared with
main and no candidate-only failing assertion. Its later seven-test countdown
run covers only the selected countdown cases. None of these results is a claim
that the complete repository or the full TV-announcement suite passes.

### Final local evidence audit, 2026-10-31

The retained Credits reports contain **seven baseline and six candidate runs**,
each with twenty sequences. All thirteen completed reports have passing lifecycle
coverage and no browser page errors. They are copied byte-for-byte with SHA-256
receipts into
`renders/premium-presentation-audit/credits-retained-2026-10-31T02-47-38-641Z/`.
That directory also retains the exact measurement scripts used for those reports
(instrumentation fingerprint
`733adeca3166dcfc6283412d28dc7b6ebbc87d05e91fc568badfb3c5299e5111`).
The official comparator rejected this set because it requires at least seven
candidate reports. **There is no accepted aggregate Credits performance result.**
`credits-retained-summary.json` contains descriptive statistics only; the
thresholds and minimum count have not been reduced.

The source batches are `credits-2026-10-30T23-21-34-730Z/` (five baseline and four
candidate reports before interruption) and `credits-2026-10-31T01-25-06-263Z/`
(two baseline and two candidate reports before a stalled run). The stalled run's
host diagnostic and failure report are retained. Low available virtual memory
was observed on the test host; it does not establish the cause of a game or media
failure. Two subsequent attempts failed at the home-route warmup before capture
and contribute no performance reports. No comparison process remains running.

The later QA changes separate baseline source selection from candidate commits
and bound diagnostics/teardown. Their ten source-selection, recorder and
comparison regressions pass in `final-driver-regressions.log`. The short fixed
driver attempt in `twin-2026-10-31T02-59-37-324Z/` failed on the baseline's initial
home load, before recording. Its diagnostic shows an empty app root, no active
service worker and no page error; the startup cause is unresolved. It is not a
successful smoke or performance result. New-driver reports have a different
instrumentation fingerprint and must not be silently mixed with the retained
thirteen reports.

The candidate application fingerprint remains
`2f23525c64ee7377598c060610bd9babff26d062b48104f99b87022ca7e2fed8`, against
baseline `3a713b502fc22fecc2bcc721bf72b4ba6354e23e02d1c7900dd608a2a6503cfa`.
The application code and delivery assets have not changed since the 239-test
feature run; the later edits affect the measurement tools and documentation.
Physical-device comparisons and approved delivery budgets remain outstanding.

During the later full-disk interruption, the raw baseline ceremony-landscape
trace in `phase-visual-2026-10-30T18-04-14-284Z/` was truncated during a failed
archive attempt. Its screenshot and previously recorded summary metrics remain,
but that raw trace is unavailable and must be recaptured before using the case
as complete trace evidence. Other preserved traces may be stored as verified
lossless `.trace.json.gz` archives. This artifact loss does not change the
application source or the recorded test results.

The final-source Twin attempt in
`renders/premium-presentation-audit/twin-2026-10-30T22-33-37-533Z/` stopped after
five complete reports: three baseline and two candidate. Both completed pairs
passed lifecycle/cleanup coverage. Candidate run three, sequence fourteen, did
not observe decoded playback. The retained partial capture has a waiting event
but no loaded-data/playing event for that sequence. At failure the video source
attribute was detached, the element was paused with empty network/ready state,
and the live fallback was still advancing. There was no media error code. The
underlying loading failure remains unresolved; this is incomplete performance
evidence, and fallback is not reclassified as decoded playback.

A separate real-browser missing-video reproduction retained three settled
grown/reveal/verdict captures in
`renders/premium-presentation-audit/twin-fallback-legibility/`. Each had exactly
one visible text layer and four fully transparent inactive layers, with no video
source and working Skip. This checks steady fallback legibility; it does not
explain the earlier video-start failure or establish a performance pass.

The corrected runner completed a four-sequence baseline/candidate setup smoke in
`renders/premium-presentation-audit/twin-2026-10-30T20-06-38-366Z/`. The recorded
seed and both roster identities matched across every cycle and version. Both
runs captured 14 presentation roots and ended without attached media, active
presentation roots, animation callbacks or preparation. Timed Quick Tap reached
results before and after the scenes. This short smoke verifies the corrected
setup; it does not meet the seven-pair, twenty-sequence performance gate.

Eight real-browser fault tests also passed in the compact Chromium viewport:
missing, corrupt and held-until-timeout MP4 responses for both Credits and Twin
Shock, plus a delayed response after leaving each route. Each case kept fallback
and Skip usable or respected route cancellation, released the captured source,
and entered Quick Tap with no video source or media preparation. Results are in
`renders/premium-presentation-audit/fault-tests-current.log`; the tests are
`e2e/playwright/presentation-faults.spec.ts`. These inject network faults without
mocking successful media playback, and do not constitute physical-device proof.

The full-duration Twin Shock series completed seven baseline/candidate pairs:
280 sequences, 140 normal completions and 140 Skip actions, with timed Quick Tap
before and after every run. Raw reports are retained in
`renders/premium-presentation-audit/twin-2026-10-30T14-58-13-948Z/`.
All fourteen runs ended with no active presentation root, video source or media
preparation, and no browser page errors. The corrected comparison uses the
host's measured 240 Hz refresh interval (4.167 ms), rather than incorrectly
clamping a known refresh rate to 60 Hz. The original comparison is preserved.

This series is **not accepted**: end-listener medians were 385 versus 398, and
two candidate heap windows exceeded the declared plateau tolerance. Frame and
input metrics, including subsequent gameplay, were within baseline variation;
those metrics alone do not establish an overall pass. There is also an
instrumentation mismatch in the cycle-end population: candidate TV announcement
roots were marked while main's equivalent roots were not. The next capture
marks `.tv-announcement-wrap` identically in both versions. Do not reinterpret
the old heap result as a confirmed leak or a resolved regression without a new
matched capture and retained-resource investigation.
The old series fixed the simulation seed but did not fix the constructor's
separate random roster selection. That is an additional setup limitation. New
fixtures constrain only the synchronous roster draw, restore normal randomness
before gameplay, and record the actual initial seed and roster identities. The
three focused constructor-scope tests also verify restoration after failure.

The source snapshot used for that series is retained separately. Subsequent
changes add scoped one-shot sound cancellation, release completed weather
subscriptions, pause winner awards across coverage/backgrounding, and request
muted Twin playback without waiting for preload to decode the first frame.
They require fresh performance evidence. The Twin soundtrack now contains only
its original AAC stream at the same URL: decoded bit-exact WAV hashes and all
1,289 AAC packet hashes/timestamps match the original. The first 16.2-second
handoff and chapter content are unchanged.

### Isolated ceremony diagnostics, 2026-10-30

The production-renderer component audit retained 28 before/after captures and
Chrome timeline traces in
`renders/premium-presentation-audit/phase-visual-2026-10-30T18-04-14-284Z/`.
It covers winner portrait/compact/landscape, paired awards, a photo-backed tile,
rotation during an award, ceremony spotlights, Public Save, Audience Verdict
and TV announcements. All candidate scenes completed exactly once, restored
their source tiles and left no scene overlay or browser page error. Main's TV
fixture called its completion twice; the candidate called it once in both
orientations. Main's winner caption was clipped in landscape and after rotation;
the candidate keeps it above the bottom safe area using CSS only.

During the Public Save count-up, instrumented `PlayerAvatar` function calls were
2,595/2,598 for main and 11/11 for the candidate (portrait/landscape). This
confirms that the animated number no longer rerenders the portrait subtree on
every tick. It is a single diagnostic capture, not a seven-run performance
comparison, a physical-device measurement or a guarantee about frame/input
latency. The fixture uses real components and bundled portraits outside the full
GameScreen layout; integrated and native acceptance remains open. Its paired
award fixture was followed by a separate check with Cupid's revealed roster
state and the production award subtitle.
That focused winner run retained twelve captures/traces in
`renders/premium-presentation-audit/phase-visual-2026-10-30T18-07-39-909Z/`;
all six candidate variants kept the complete caption inside the viewport,
including after rotation, and restored their source tiles. The photo fixture
checks a decoded embedded portrait, not the profile-upload/storage flow.
The final winner fixture prepares a settled Cupid roster and supplies explicit
tile-size variables, matching the roster's layout contract. The renderer keeps
the source geometry and inherited sizing variables together and animates only
transforms, preserving portrait proportions. Capture rejects temporary
border-only boxes within its existing bounded retry limit. Return measurement
temporarily restores layout while keeping paint suppressed, then restores all
hiding styles. This avoids measuring a collapsed hidden anchor after rotation.
Viewport updates are coalesced only while the award is active; their listeners
and pending callback are removed on suspension/unmount. The seven regression
tests cover geometry, rotation, collapsed anchors, interruption and listener
cleanup. Twelve final captures/traces are retained in
`renders/premium-presentation-audit/phase-visual-2026-10-30T19-16-09-116Z/`.
Earlier image attempts remain diagnostic reproductions, not final visual
approval. These checks do not establish native performance acceptance.

### Local iPhone preparation without Remote Login

The device-test tools create a separate app identifier and production web
renderer; they do not overwrite the installed game. Test fixtures and the
report bridge are injected only by the dedicated builder and are absent from
normal app entry points. Native test builds use the same video playback control
as normal builds, with additional QA fixtures and measurement instrumentation.
The same QA-only transform enables the existing standard Quick Tap lab option
in both native test artifacts, because mobile-dev access otherwise selects VIP.
The real countdown, game duration, inputs, scoring and production React renderer
remain in use. This selector is absent from normal builds.

The production-renderer browser smoke covers both live verdicts, Skip/source
release and actual root pseudo-element pause/resume. A credits-to-Twin handoff
can still take the bounded live fallback on the desktop host. The QA recorder
labels it `bounded-fallback` and retains `decoded: false`; functional fallback
success is not video acceptance. Native candidate performance checks reject
non-decoded cycles and retain failed capture evidence.

```text
node scripts/build-presentation-device-test.mjs --platform=ios --variant=candidate --baseline=9a93b4ccc9fbeaf5bf47e134e2b6aef1e9bedca8
node scripts/prepare-presentation-mac-project.mjs --artifact=<output directory>
node scripts/export-presentation-mac-package.mjs --artifact=<output directory>
```

Repeat with `--variant=baseline` to preserve main's source/assets. Copy the
exported ZIP to the Mac, open `ios/App/App.xcodeproj`, choose the user's own
signing Team for App and PresentationDeviceTests, and select the connected
iPhone. Start with `testDeviceFixtureSmoke`; then run the two verdict captures,
native background/resume/route exit, and the separate performance families.
`Run-on-Mac.command` saves Xcode results and logs locally. No SSH or shared
password is required. The prepared Xcode project has not been compiled or
signed on Windows; its first Mac smoke test is still required.

Keep baseline and candidate results together, including `.xcresult`, device
details and thermal/charging notes. JavaScript reports alone do not establish
physical hardware. Native XCTest CPU/memory measurements describe the requested
application; WebContent/GPU attribution, decoder selection and sustained
unplugged battery/thermal behaviour need additional device observations.
The tools do not approve budgets or close the physical-device gate.
The first Mac archives are suitable for installation/functional smoke only;
performance captures must use the subsequent roster-fixed harness. Updated
exports include the instrumentation fingerprint in their filename so they are
not confused with the earlier functional packages.
Those first archives and their code-only roster update predate the later
landscape winner-caption correction. Keep them for the initial Mac installation
smoke; final app performance approval requires a fresh final-source artifact.

For the already exported first packages, a code-only update avoids copying the
media again:

```text
node scripts/update-presentation-mac-web.mjs --artifact=<updated iOS output directory>
node scripts/export-presentation-mac-update.mjs --artifact=<updated iOS output directory>
```

The update exporter verifies the original package's source fingerprint, native
harness and media hashes. On the Mac, close Xcode, extract the update and open
`Apply-update.command`; choose the extracted original package folder. Its
checksummed payload changes only built JavaScript/CSS, the entry HTML and test
receipts. It preserves signing settings, the native project and media. Both
roster-fixed browser smoke runs verified repeatable initial/resolved rosters
and restoration of normal randomness. They are functional browser checks,
not iPhone or Android performance approval.
When rebuilding game code for the same isolated QA installation, the builder's
`--package-id-from-artifact=<original staging directory>` retains its existing
test identifier while recording the new source and instrumentation fingerprints.
Code-only Mac updates additionally verify unchanged static public assets,
native SDK sources and native configuration. Generated Android build caches
are excluded from the SDK source comparison. The original Xcode project and its
signing settings are retained, and script ZIP entries carry Mac executable
permissions. A source update requires new performance captures.

The corresponding Android builder uses an isolated package and a debug native
wrapper for WebView inspection. Its production web renderer is measured through
the actual attached WebView. A native debug wrapper and CDP-injected inputs do
not certify store-release CPU behaviour or physical touch latency. The runner
retains OS memory/thermal/battery/WebView observations and reports remaining
acceptance gaps explicitly.

### Какво да наблюдаваш при локалния тест

- При LOH/POS победа плочката се повдига, получава значката и се връща на
  мястото си. След прекъсване не трябва да остане скрит участник или втора значка.
- Церемониите, общественото спасяване и TV съобщенията използват по-кратки,
  крайни светлинни акценти. Имената, резултатите и изборите остават интерактивни.
- При Twin Shock включените анимации показват видеофон с жив текст и правилния
  финал за двата резултата. Skip трябва да работи веднага, включително при
  повторно натискане. При проблем с видеото продължава резервната сцена.
- Кредитите запазват текста и музиката си с по-малък видеофайл. След Skip или
  край не трябва да остане музика от тях или да има проблясък на стария екран.
- След сцена стартирай миниигра веднага: отброяването и натисканията трябва да
  реагират нормално. Повтори след няколко сцени и след връщане от заден план.
- При изключени анимации или намалено движение трябва да има използваем
  статичен/кратък вариант. Смяната на профил или нов сезон не трябва да довършва
  стара сцена върху новата игра.
- Смени системното намалено движение по време на клип: видеото трябва да спре.
  Ако върнеш нормалното движение по време на кредитите, те продължават от същия
  момент с резервния фон, без да започват отначало.

Това е списък за наблюдение, а не потвърждение за успешно преминали телефонни
измервания. PP-09–PP-12 остават извън обхвата.

The candidate is based on main revision `9a93b4ccc9fb` (Tribunal Agree/Exit and
responsive credits included). PP-09 through PP-12 are excluded. The local
preview shows Twin Shock video, which is also enabled by default in normal
builds. Disabling `VITE_FEATURE_TWIN_SHOCK_VIDEO_PILOT` uses the existing live intro
without attaching its video source. Restart the preview after changing that
build-time flag.

| Item  | Local implementation/evidence                                                       | Remaining acceptance evidence                                                             |
| ----- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| PP-01 | Recorder, setup metadata, coverage checks and variability comparator                | Complete matched repeated comparisons and native observations                             |
| PP-02 | Ownership, nested/replacement tests, covered-effect suspension and gameplay guard   | Matched repeated resource comparisons and native interruption evidence                    |
| PP-03 | Captured-element teardown, cancellation, End/Skip race and real-browser fault tests | Repeated resource acceptance and physical-device interruption evidence                    |
| PP-04 | Native player, manifest, decode/seek and Android/iOS-mode nested-URL browser checks | Approved device-derived budgets and actual Capacitor/WebView URL checks                   |
| PP-05 | Proportional transforms, six before/after visual traces and restoration regressions | Repeated PP-01 and physical-device comparisons                                            |
| PP-06 | Shared timings, finite effects, isolated counters and before/after ceremony traces  | Repeated per-device comparisons; full TV suite has thirteen failures also present on main |
| PP-07 | Silent smaller background, narrow live text clock and browser cleanup scenario      | Device encode-quality approval and repeated playback/post-playback measurements           |
| PP-08 | Authored clip, both-branch browser captures, live verdicts and lifecycle tests      | Repeated performance comparisons and Android/iPhone evidence                              |
| PP-13 | Written protocol, guarded default-on video and independent rollback                 | Device evidence and reviewed budgets remain pending; Mac/Xcode testing deferred by user   |

These rows are an acceptance audit, not closed tickets or a release-ready claim.

## Current candidate notes

- Credits background: 720×1280, 30 fps, 54 seconds, H.264 High, 12,486,581 bytes,
  no audio track; the separate credits soundtrack remains authoritative. The
  candidate re-encode keeps the resolution and frame rate while reducing the
  silent 21,008,381-byte source by 40.6%. Sampled frames at 12 and 42 seconds
  remain visually aligned with the source. The dedicated 720×1280 WebP poster is
  42,516 bytes, down from the 1,657,418-byte shared PNG. Device startup/seek and
  playback are still unmeasured.
- Twin Shock pilot: offline Remotion composition, 540×960, 30 fps, 16.2 seconds,
  no embedded text or sound. The dynamic chapter/verdict copy, Skip and roster
  outcome stay in React. Its WebP poster is the first decoded frame. The pilot
  flag defaults on per the user's rollout preference; device evidence remains pending.
- Delivery budgets remain `pending-device-evidence` in the asset manifest. Set
  approved per-clip and total budgets only after the device comparisons.
- Android and iOS production-mode builds both decoded credits and loaded the
  WebP poster beneath `/packaged/local-app/` in Chromium, then detached the
  source after Skip. These checks validate relative asset paths in the built
  bundles; they do not certify native file URLs or phone decoding. Evidence:
  `renders/premium-presentation-audit/packaged-url-results.json`.
