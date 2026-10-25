# Quick Tap VIP and Seasons VIP

## Rules

Quick Tap VIP has three 25-second rounds. Seasons VIP has three 28-second rounds, with automatic weather changes at 0, 7, 14 and 21 seconds in every round. Four-second intermissions do not consume active race time. Total points carry over; timed effects and the seasonal reroll reset between rounds. Classic versions keep their existing rules.

Spring taps score 1.25, summer 0.5, autumn 1, winter -1. Future seasons are not previewed. Change Season is a separate optional random reroll to one of the other three seasons, usable once per round; it does not move the automatic weather clock. A reroll cancels the current seasonal effect.

Mystery contents stay hidden until claimed. Each public pool is weighted 64% rewards and 36% handicaps. Equivalent claims (same seed, window and current weather) share their outcome. Human and AI use the same timestamped tap, box and reroll reducers. Winter pools contain point gifts, Stillness and point penalties. Stillness requires two complete seconds without tapping for +14; a tap cancels the pending reward. Seasonal effects expire at a weather boundary. Instant points do not erase an existing handicap. Final ranking uses points, then raw taps.

## Runtime and AI

Taps update an in-memory scoring state immediately. One animation frame loop publishes the numeric HUD and draws a bounded set of 18 weather particles; React gets a 10 Hz snapshot for standings and controls. No per-tap layout reads, DOM particle creation, timers or pointer capture. The shared wall clock advances on every input as well as animation frames, preventing delayed rendering from extending a round. Breaks reject inputs; final completion is one-shot. Reduced motion suppresses weather animation.

AI choices read public conditions and temperament before the mystery resolver is called. AIs pause to claim, have observation delays for weather and handicaps, make occasional mistakes, and vary pace, fatigue, risk appetite and match form. Hosted human games, AI-only sessions and challenge precomputation share the specialist VIP simulator. Rosters have no artificial 12-player cap.

## Generated art

Generated with the built-in image_gen tool. Spring was generated first; the other three images are weather edits preserving its composition. Final assets are 600 × 900 WebP, quality 52. Total: 465,520 bytes (about 455 KiB). They are stored in `public/assets/minigames/quick-tap-seasons-vip/`: spring.webp (103,866), summer.webp (119,398), autumn.webp (97,872), winter.webp (144,384). Source PNGs stay in the image generation library. The existing Eye tap control is reused.

## Verification notes

The focused suite has 37 passing tests across shared scoring, the VIP round lifecycle, classic Quick Tap, classic Seasons and its existing specialist simulator. It covers exact time boundaries, negative winter scoring, hidden mystery contents, penalties, Stillness, random rerolls, effect expiry, 32-player rosters and one-shot completion.

An initial mobile pass completed both games on Pixel 7 Chromium and iPhone 13 WebKit, including touch claims and all three rounds. Later WebKit reruns became unstable and crashed even on the unchanged classic Quick Tap route; final iPhone confirmation remains pending. Android additionally passed 360 × 640 and 375 × 667 layouts and shared rules-menu interaction. This is browser emulation, not physical-device certification.

The Chromium input stress probe with 4× CPU throttling registered all 1,000 burst inputs and all 24 sustained inputs. The burst created no additional DOM nodes. One recorded run had a 16.7 ms median frame interval, 33.3 ms p95 frame interval and 14.5 ms p95 input-to-HUD delay, without long tasks during sustained input. These measurements describe the local emulation run only. Scripts, screenshots and machine-readable results are in `artifacts/quick-tap-vip-rounds/`.

The installed Vite 8 development/config bundler hit startup errors. Focused tests run successfully with the native config loader; the local preview uses a temporary Vite 7 config with React JSX transformation and excludes locked artwork directories from file watching. Repository dependency declarations are unchanged by this work. The full repository `check:pr` gate currently stops on pre-existing formatting failures in other work; it must pass before publication.

## Final prompt set

### Spring

Use case: stylized-concept. Asset type: premium portrait mobile game environment, full-bleed 2:3 composition. Generate an ancient seasonal sanctuary for The Big Eye game, richly rendered dark obsidian and antique gold architecture, centered stone circular floor dais lower half, distant luminous circular celestial mechanism high at 32% image height, tall arches, immersive cinematic collectible fantasy game art. SPRING atmosphere: emerald garden beyond arches, delicate cherry blossom branches at edges, turquoise waterfalls, soft rose petals and warm pale sunlight. Keep middle and lower central floor spacious and darker for a foreground interactive Eye button; environment fills every edge with detail, no plain panels, no typography, no characters, no UI, no button drawn. Camera centered symmetric, architecture sharp and material rich, restrained gold highlights, sophisticated not cartoon. Mobile portrait. This is the spring base scene for four matching seasonal environments.

### Summer

Use case: lighting-weather. Asset type: matching portrait mobile game environment. Edit the supplied SPRING sanctuary into SUMMER: strong warm amber sun, lush deep green branches instead of pink blossom, golden summer haze, hot sunlit cliffs, flowing water, dark gold and obsidian floor with restrained warm reflections. Preserve the EXACT camera, composition, arches, columns, celestial mechanism and floor geometry; preserve every architectural placement and the spacious dark central foreground dais. Change only weather, foliage and lighting. Premium richly rendered fantasy game art, full bleed, no text, no characters, no interface, no extra Eyes or buttons. Keep dark readable mobile game backdrop, detailed image to every edge.

### Autumn

Use case: lighting-weather. Asset type: matching portrait mobile game environment. Edit the supplied SPRING sanctuary into AUTUMN: bronze copper and burnt orange foliage instead of pink blossoms, falling copper leaves at edges, moody late afternoon warm amber sky, autumn haze, flowing waterfalls, dark wet obsidian floor and antique gold trim. Preserve the EXACT camera, composition, arches, columns, celestial mechanism and floor geometry; preserve every architectural placement and the spacious dark central foreground dais. Change only weather, foliage and lighting. Premium richly rendered fantasy game art, full bleed, no text, no characters, no interface, no extra Eyes or buttons. Keep dark readable mobile game backdrop, detailed image to every edge.

### Winter

Use case: lighting-weather. Asset type: matching portrait mobile game environment. Edit the supplied SPRING sanctuary into WINTER: icy moonlit blue and silver, snow-laden bare branches instead of blossoms, frozen waterfalls, distant snowy mountains, frosty edges and scattered snow on the obsidian floor while gold architecture stays visible, dramatic crisp cold atmospheric light. Preserve the EXACT camera, composition, arches, columns, celestial mechanism and floor geometry; preserve every architectural placement and the spacious dark central foreground dais. Change only weather, foliage and lighting. Premium richly rendered fantasy game art, full bleed, no text, no characters, no interface, no extra Eyes or buttons. Keep dark readable mobile game backdrop, detailed image to every edge.
