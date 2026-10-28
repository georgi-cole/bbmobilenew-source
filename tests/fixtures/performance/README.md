These compressed fixtures contain synthetic Classic games captured from the
real engine at revision `71d125fedfa38bd03ead452b65e94e4e22c67c7b`, before the
scheduled AI runs on days 1 and 8. They enable Reality/Drama and audio, include
retained television/social history, and use the fictional Audit Player profile.
They contain no production account or analytics data.

`scripts/run-release-performance.mjs` restores each fixture through normal slice
hydration, runs the actual asynchronous AI, and measures real Play taps. The
fixtures complement the generated 16/30-day worlds and complete minigame runs;
they do not represent an uninterrupted human session. Keep them fixed when
comparing performance changes, and add fixtures for new expensive progression
paths. They are loaded only by the Node test runner and are absent from normal
web and native bundles.
