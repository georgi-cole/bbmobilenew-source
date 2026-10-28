# Profile performance benchmark

Run from the repository root:

```sh
node scripts/run-profile-performance.mjs --label=mobile-populated --samples=7 --archives=20 --cpu-rate=6
node scripts/run-profile-performance.mjs --label=mobile-max-history --samples=3 --archives=1000 --cpu-rate=6 --skip-build=true
```

The first command builds a separate production app and measurement entry in
`artifacts/profile-performance/dist/`. The second reuses that build; omit
`--skip-build=true` if any application source has changed. Neither entry changes
the normal release build. Results are saved as formatted JSON beside `dist/`.

Each scenario uses a fresh Chromium context, a 360 × 800 touch viewport, and
synthetic data for one, two, three, or five profiles. Creation limits are not
changed: four/five-profile scenarios model existing legacy installations. Case
order rotates between repetitions. Cast selection uses a fixed seed.

Every profile has two run slots with 400 feed entries each, initialized gameplay
and social structures, 100 wallet ledger entries, and the requested number of
completed-season archives. These are generated volume fixtures, not replayed
long-season gameplay traces. Uploaded photos and growing late-game Reality facts
are not modeled. Artwork remains a shared file reference.
Classic is the resumed mode; the second stored slot supplies inactive save volume
and is not a Surveyeval gameplay benchmark.

Measurements include:

- Storage initialization and runtime imports, isolated from React rendering.
- A complete production app reload until its main menu is visible, followed by
  the player-facing Continue Last flow until gameplay navigation is visible.
  The Play-to-game interval also includes opening the mode menu, so intent-based
  loading cannot appear faster merely by moving a wait before Continue Last.
- Twelve isolated autosaves per observation through the actual snapshot queue,
  compaction, serialization, and durable storage backend. Synchronous save work,
  asynchronous flush latency, and animation-frame gaps are reported separately.
- JavaScript heap after forced garbage collection at startup and after resume,
  plus the storage layer's conservative UTF-16 cache-size estimate.

App startup uses a warm HTTP cache and resolved permission prompts. CPU slowdown
is a repeatable stress setting, not a calibrated model of a particular phone.
Heap measurements exclude browser/native/GPU memory. Results do not establish
physical-device frame rate, thermal behavior, or memory-pressure safety. Profile
limits should be reconsidered using both the populated and maximum-history
results, then confirmed on representative physical devices.

For a focused comparison, add `--counts=3`. To preserve an immutable comparison
build, use `--build-dir=artifacts/profile-performance/<comparison>/dist`; add
`--skip-build=true` when measuring that existing build. Both builds must use the
same fixtures, browser, viewport, CPU rate, cache policy, and sample counts.

`--diagnostics=true` records startup/resume CPU profiles, resource timings, and
the Play-to-game interval under `artifacts/profile-performance/diagnostics/dist/`.
Profiling adds overhead: use these runs to find expensive work, and keep
diagnostics off for the reported before/after timings. Exploratory labels are
not release acceptance measurements.
