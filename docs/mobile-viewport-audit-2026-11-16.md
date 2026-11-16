# Mobile viewport review — 16 November 2026

## Coverage

- Browser startup audit: 39 active minigame registry entries, covering 51 standard/premium presentations at 320 × 568.
- Reported screens additionally reviewed at 390 × 844, with simulated 59px top and 34px bottom hardware areas.
- Timed numeric inputs retain their complete pads and submit buttons. Exceptionally short windows retain a scroll fallback.
- Long rankings and transcripts scroll inside bounded panels; screen-level horizontal panning is excluded.
- Canvas interactions, every later round of every game, and native WebKit behavior are not exhaustively certified by the startup audit. Embedded HTML games receive an outer-frame check.

## Additional findings

- Deck of Light: the third tool choice was below a clipped opening screen. Tool choices are compacted and scrolling remains available.
- Battery Low: the last three batteries were clipped on a short phone. Short layouts now arrange all 24 batteries in six columns and four rows.
- Percentage Panic, Trap Auction and Final Three Circuit had scrollable content under an ancestor with `touch-action: none`. Their hosted scroll paths now permit panning; dedicated game controls retain their own touch behavior.

## Review page

Open `#/viewport-review` in a development build. Select any reported case or another active minigame, choose a phone size, and toggle hardware areas/premium presentation. The nested fixture store does not subscribe to save persistence; challenge retries and After the Eye ad rewards are simulated in this development page.

For checkpoints and rankings, play or skip the first round as described on the page. For Reverse Time, end the challenge from the eye menu and retry the uncommitted last-place result.

## Startup audit inventory

| Game                         | Presentations     | Startup control audit        |
| ---------------------------- | ----------------- | ---------------------------- |
| Quick Tap Race               | standard, premium | No trapped controls detected |
| Quick Tap Race 2: Seasons    | standard, premium | No trapped controls detected |
| Memory Colors                | standard          | No trapped controls detected |
| Timing Bar                   | standard          | No trapped controls detected |
| BOXPOCALYPSE                 | standard          | No trapped controls detected |
| Estimation                   | standard          | No trapped controls detected |
| Hold the Wall                | standard          | No trapped controls detected |
| Famous Figures               | standard          | No trapped controls detected |
| Silent Saboteur              | standard          | No trapped controls detected |
| Percentage Panic             | standard          | No trapped controls detected |
| Majority Rules               | standard          | No trapped controls detected |
| Pressure Plank               | standard          | No trapped controls detected |
| Color Match                  | standard          | No trapped controls detected |
| Vault Cracker                | standard          | No trapped controls detected |
| Serpentine                   | standard          | No trapped controls detected |
| Deck of Light                | standard, premium | No trapped controls detected |
| Verdict Board                | standard          | No trapped controls detected |
| Tilt Labyrinth               | standard          | No trapped controls detected |
| Number Trivia                | standard          | No trapped controls detected |
| Capitalization               | standard          | No trapped controls detected |
| Minesweeps                   | standard          | No trapped controls detected |
| Don't go over                | standard          | No trapped controls detected |
| Blackjack Tournament         | standard          | No trapped controls detected |
| Risk Wheel                   | standard, premium | No trapped controls detected |
| Wildcard Western             | standard          | No trapped controls detected |
| Find Your Twin               | standard, premium | No trapped controls detected |
| Find Your Twin               | standard, premium | No trapped controls detected |
| Find Your Twin 2: Lost Again | standard, premium | No trapped controls detected |
| Find Your Twin 2: Lost Again | standard, premium | No trapped controls detected |
| The Crystal Path             | standard, premium | No trapped controls detected |
| Crystal Path: Infinity       | standard, premium | No trapped controls detected |
| Trap Auction                 | standard          | No trapped controls detected |
| Mystic Chamber               | standard          | No trapped controls detected |
| Chain of Greed               | standard, premium | No trapped controls detected |
| Battery Low                  | standard          | No trapped controls detected |
| Deck of Darkness             | standard, premium | No trapped controls detected |
| Bigg Gates                   | standard          | No trapped controls detected |
| Final Three Circuit          | standard          | No trapped controls detected |
| Down Memory Lane             | standard          | No trapped controls detected |
