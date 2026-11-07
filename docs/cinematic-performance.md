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

Use representative Android and iPhone builds, plus an older/lower-performance
supported phone when available. Record the exact model, OS, app revision, WebView,
display refresh, thermal/battery state, audio and motion settings. On each device,
measure credits and Twin Shock separately: time to first usable scene/frame,
steady playback, Skip response, route handoff and the same timed gameplay after
the presentation. Run 20 cycles with normal completion and Skip, rapid input,
route exit, background/resume, missing/slow/corrupt media, reduced motion and
animations-off. Include a sustained session to expose thermal and battery trends.

No phone or iPhone capture tool was attached in the current workspace session, so
there is no physical-device baseline or pass result in this report. Keep the
pre-rendered Twin Shock pilot disabled until those measurements and the comparison
protocol pass. The known-good live Twin Shock sequence and credits poster/fallback
remain available. Do not describe browser tests or asset metadata validation as a
native performance pass.

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
  flag defaults off pending device evidence.
- Delivery budgets remain `pending-device-evidence` in the asset manifest. Set
  approved per-clip and total budgets only after the device comparisons.
