# Late-season gameplay investigation — 6 November 2026

## Scope and method

Visible mobile-browser journeys used the game's normal Play, Continue Last, voting,
and minigame exit controls. The Vox and Cupid performance journeys and initial
Surveyeval screening used QA controls to advance the opening setup to Day 5;
that assistance is recorded in their saved checkpoints. A separate Surveyeval
journey played visibly from Day 1. Performance was sampled with
`debugPerformance=1` in the Vite development build. The numbers describe this test
environment, not production devices. The per-day input samples are small, so their
95th percentiles are useful signals rather than stable benchmarks.

## Vox Populi, Days 5–15

The saved state grew from 0.69 MiB at Day 5 to 3.07 MiB at Day 15. The sharpest
increase was Days 7–11; growth then leveled off. The social state accounts for
most of the increase (0.49 MiB to 2.53 MiB). In particular, social memories grew
from 52 KB to 718 KB by Day 10, and reality events from 4 KB to 365 KB. Events
continued growing to 563 KB by Day 15 while memories reduced to 536 KB. The TV
feed grew from 35 to 312 entries.

| Day | Saved state | Social state | Input response p95 | Game render p95 | Longest frame gap | Last save write |
| --- | ----------: | -----------: | -----------------: | --------------: | ----------------: | --------------: |
| 5   |    0.69 MiB |     0.49 MiB |             302 ms |           37 ms |            304 ms |            4 ms |
| 7   |    1.49 MiB |     1.28 MiB |           1,016 ms |           51 ms |          1,017 ms |           15 ms |
| 10  |    2.65 MiB |     2.30 MiB |           1,029 ms |           35 ms |          1,025 ms |           19 ms |
| 15  |    3.07 MiB |     2.53 MiB |             287 ms |           30 ms |            413 ms |           13 ms |

The largest input delays and browser long tasks coincided in the middle of the
season. Individual `game/advance` dispatches took up to 867 ms at Day 7 and
845 ms at Day 10; the slowest was 183 ms at Day 15. A Day 5 checkpoint replay
sampled core store updates separately: at Day 7 a 492 ms whole dispatch had a
7.8 ms store update; at Day 10 a 783 ms dispatch had a 13.8 ms store update.
This places most of those spikes outside the reducer and synchronous store
subscribers. The outer timing includes game middleware and development-only
Redux checks; it does not yet isolate an individual middleware as the cause.

Rendering was active (about 108–151 game-route commits per sampled day) but its
95th-percentile commit time fell after Day 7 rather than degrading through Day 15. The finale overlay's own commits were under 1 ms at the sampled points.
This evidence points first to the growing social state and work around phase
advancement, with UI rendering as a secondary cost. Save serialization took at
most 17 ms and the last write at most 21 ms in this journey. No save was blocked.

The Day 10 and finale Vox checkpoints represent an evicted player continuing as
a spectator, as the mode permits. A finale checkpoint replay reached the Season
Complete screen and recorded its winner.

## Surveyeval seed search

Rapid QA elimination cycles produced three Day 15 survivors among 40 seeds.
These are useful screening candidates, but they do not reproduce every visible
nomination and vote choice. A visible replay of each of those candidates ended
before Day 10. During that replay, the browser helper was found to have silently
selected the game's ad recovery at elimination. The helper now ends ordinary
season tests at elimination; ad recovery requires an explicit feature-test
helper. The rapid screening results do not establish a natural visible Day 15 run.

The same search exposed a production issue: Surveyeval built every new run on
the game seed `42`, unlike the other season launches. Varying the three browser
fixture seeds changed robot identities but left the main vote and competition
sequence fixed; seven consecutive visible candidates ended on Day 7. New runs
now receive a fresh gameplay seed, while deterministic browser runs use their
supplied season seed. This changes the mix of outcomes without changing the
elimination rule or using ad recovery.

The first assisted-opening candidate (roster `996443857`, season `2564909076`,
action `2286914115`) reached Day 13 with visible play from Day 5 and zero ad
recoveries. Replaying that same seed visibly from Day 1 ended on Day 9. Three
other assisted-opening Day 10 survivors ended on Day 12, confirming that the
opening route can materially change the later outcome.

A fully visible journey from Day 1 with roster seed `757093529`, season seed
`3359619948`, and action seed `2649029611` remained active through Day 12 and
ended by normal elimination on Day 13, in 8th place, with zero ad recoveries.
This is the reusable natural late-day seed. Its Day 5 and Day 10 saved
checkpoints both record `visible-journey` and an active human. A Day 10
**Continue Last** replay reached the same Day 13 elimination without recovery.
From Days 10–13 its saved state grew from 0.37 to 0.47 MiB, its game render 95th
percentile stayed at or below 35 ms after the resume sample, its input response
95th percentile stayed at or below 129 ms, and its save writes stayed below
5 ms. The Day 10 baseline had no game action sample because it was captured
immediately after resume. A visible Day 15 survivor is still unverified.

## Cupid's Tribunal transition

The focused broken-spell Tribunal browser test passed and wrote a durable
`jury-transition.json` artifact. The event sequence recorded the game entering
the jury phase, the Tribunal opening button, the first clue timer being
scheduled and firing, and the first juror being revealed. At capture, one of
seven jurors had been revealed and the next clue timer had 5.4 seconds left;
there was no overdue timer. That snapshot shows an intentionally slow reveal,
not a stalled one. If a full-season run stops at the jury, the failure artifact
now records the current game/finale phases, visible buttons, pending juror
action, and overdue timers for comparison.

A full Cupid journey then reached the Tribunal with the player on the jury.
Its failure artifact showed the Tribunal's **Begin Tribunal** button visible,
no pending timer, and a Play button behind the overlay being blocked from a
click. That is a browser-journey control error, not evidence that the jury was
stuck. The helper now waits for Tribunal controls and timers before trying Play.

The saved Cupid finale then replayed through every jury reveal, winner selection,
Public Favorite forecast, and the Season Complete screen. The final diagnostic
showed all eight jurors revealed and no pending timer. One winner-handoff timer
was explicitly cancelled when a different valid route advanced the finale; that
is now recorded as a cancellation rather than mistaken for an overdue timer.

## Optimization follow-up

The same Vox Day 5 checkpoint was replayed before and after the social update
change with Redux development checks and DevTools disabled. React and the
browser state probe still ran in a development build. The main start-of-day
relationship step fell from 84.5 ms to 21.3 ms on Day 6 and from 151.4 ms to
10.2 ms on Day 7. Batching alone brought Day 7 to 57.5 ms; reusing the
unchanged Reality tag index within the batch brought it to 10.2 ms. A separate
Day 10 checkpoint replay reached Day 15 and kept that relationship step between
3.7 and 9.3 ms on Days 11–15. The saved state continued growing from 2.57 MiB
on Day 10 to a peak of 3.27 MiB on Day 14. No social history was removed.

Alliance request processing was the next repeated cost. On the same Day 10→11
replay, avoiding unchanged roster rewrites and unnecessary history searches
reduced request processing from 47.9 ms to 10.8 ms across 13 phase advances.
Total alliance middleware time fell from 119.1 ms to 72.6 ms. Scheduled
autonomous faction decisions still ran and used 56.7 ms in total; the longest
single autonomy step was 29.4 ms. The compared replays ended Day 11 with the
same player placement, active cast count, and AI pact count.

The browser still showed late-day jitter: Days 11–15 had input-response 95th
percentiles of 251–332 ms, game-route render 95th percentiles of 41–60 ms, and
save writes of 17–22 ms. One Day 11 frame gap reached 2,004 ms, while the
longest recorded game action was 103 ms and the longest browser long task was
326 ms. The gap cannot yet be attributed to one game dispatch. These are
development-browser measurements, so a production mobile build should be
measured before setting a release performance budget. The saved checkpoints
allow that comparison without rerunning opening days.

After the changes, the saved Vox finale reached Season Complete with Aria as
winner. The saved Cupid finale reached Season Complete with Remy as winner and
all eight jurors revealed. One repeat Cupid run stopped recording progress at
the jury for four minutes and was interrupted before its cause could be
identified; a later replay completed. The browser helper now prioritizes the
visible recap and winner controls and limits each finale-control attempt to
30 seconds, so a future pause will leave a precise stage in its progress file.
This improves diagnosis but does not establish the cause of that one pause.
The fully visible Surveyeval Day 10 save resumed through normal Day 13
elimination in eighth place, with no ad recovery and save writes under 5 ms.
