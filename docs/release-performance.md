# Release performance checks

Run `node scripts/run-release-performance.mjs` after installing the Playwright
Chromium browser (`npx playwright install chromium`). Set
`PERFORMANCE_BROWSER_EXECUTABLE` to use an existing Chrome executable, or
`PERFORMANCE_CPU_RATE=6` for an additional throttled stress run. Run performance
checks without simultaneous builds or test suites on the same machine.

The PR workflow runs this check against a disposable minified release build.
The fixture/observer plugin is installed only by the script. Normal web/native
builds expose none of its state access; the production-global check rejects it.
The result is saved to `test-results/release-performance/report.json` and uploaded
by CI, including failed runs.

## What it covers

- Classic, Reality/Drama and audio enabled, with seeded retained social worlds
  at days 1, 8, 16 and 30, including a three-player late-season roster.
- Actual Play taps, isolated screen mounts, and verification that the taps reach
  Play rather than a covering dialog.
- Fixed real-engine day-1/day-8 fixtures with retained TV/social history, the
  actual asynchronous AI, and subsequent Play transitions. AI frame stalls have
  a separate 250 ms ceiling.
- Live card input through all preliminary rounds, a deliberate mismatch on the
  20-card board, the 24-card portrait finale, standard Quick Tap, and all three
  rounds of VIP Quick Tap Race and Seasons.
- Competition entry and countdown stalls, including artwork preparation before
  tapping begins, with the same 250 ms handler/400 ms response ceilings as Play.
- Save creation, existing event/memory collection bounds, and browser errors.
- Worst Play-handler work (250 ms), input-to-next-frame response (400 ms), and
  frame stalls (400 ms). Minigames require frame p95 below 80 ms and maximum
  frame/input-to-next-frame gaps below 250 ms. These are regression ceilings,
  not desirable typical response times.

Input-to-next-frame measurement includes input queueing and two animation-frame
callbacks after captured clicks and pointer presses. Both are bounded and stop
sampling while hidden; pending callbacks cannot cross visibility or fixture
boundaries. Native Event Timing duration is also
reported separately; it can include presentation behavior that rAF does not
measure. Neither is a substitute for observing presented frames on a device.

The seeded social worlds are synthetic retained-state stress fixtures. They
exercise current gameplay code but do not claim to replay a complete human UI
journey. Ordered ballot, ceremony, memory-retention, decision-log, projection,
save/resume and minigame outcome tests enforce gameplay separately. Add relevant
fixtures whenever a new expensive progression path is introduced.

Garbage from constructing each complete fixture is collected before its timed
window. No collection is forced during measured gameplay; allocation-related
stalls from the measured actions are still included.

## Save and resource safeguards

Routine saves keep the existing four-second coalescing window and JSON format.
A bounded worker queue serializes snapshots off the UI thread. Structured clone
still costs main-thread time; `getSnapshotSerializationDiagnostics()` reports
that cost separately from worker serialization and the pending job count.
Workers are terminated after each burst. Failures/timeouts use the existing
defensive serializer. Manual/lifecycle flushes remain immediate, and stale
worker results cannot overwrite a flushed, cleared or replaced run. Updates
arriving during preparation remain queued for their next save.

Analytics keeps its 2,000-event/seven-day limits, batches storage persistence,
filters removed profiles, and flushes on background/page exit. UI sampling buffers
are bounded. The card clock stops scheduling while hidden; completely covered
house animations pause during portalled Quick Tap games and resume on exit.
Standard Quick Tap prepares native-resolution emoji sprites one per frame,
including countdown frames, reuses them across frames, bounds the cache to 32
entries and releases it on resize/exit.
Both tap games limit decorative canvas drawing to 60 fps while their input and
gameplay clocks retain the browser's native cadence.

Nested synchronous gameplay updates notify the UI once when the outer dispatch
settles. Reducers, middleware reads, persistence and analytics observers remain
immediate and ordered. Memory/alliance caches follow immutable versions; mutable
inputs retain their uncached behavior. The procedural set background has a
pre-rendered WebP alternative, warmed by the same entry preloader as its CSS URL.

## Physical release check

Before release, complete a 30-minute-or-longer session on iPhone 13/15 and a
representative Android phone, through the final day with Reality/Drama and audio
enabled. Include a warm-device run, the large card rounds and finale, rapid
tapping, background/resume, save/resume, and repeated minigame entry/exit. Test
the Home Screen website and the actual native release build. Compare visible
frames, input response, memory/resource growth and temperature; desktop CPU
throttling is not a calibrated iPhone or thermal simulation.
