# Portrait Tribunal films

The production handoff combines generated empty reality-TV architecture, the actual cast on independent layers, and a separate city plate composed for a tall phone. It fills the phone screen; desktop review keeps a portrait frame.

## Camera and staging

The architectural sets retain a 4:5 coordinate system. A resize observer fits an overscanned set around the phone viewport; window masks reveal an unscaled city image behind it. The city keeps its generated native resolution instead of enlarging a small area of the room photograph. Standard and WebKit mask properties cover the iOS 15 support target; a window-resize fallback handles environments without ResizeObserver.

Arrival reveals the room over 1.8 seconds. After a short hold, the camera and cast move together: figures enlarge around their foot anchors and pass the frame at different depths, while a continuous camera approach keeps floor beneath them until they clear. There is no empty-room pause or character dissolve. The window fills the view at 5.3 seconds; the city holds for 1.1 seconds before the welcome text and Continue season appear at 6.4 seconds.

Departure starts with the complete doorway framed around the leaving player and luggage. The starting view clamps to the available set edges on shorter phones. Door leaves close in front of the cast from 0.7 to 2 seconds. A 2-second pan toward the side window starts at 2.3 seconds; a 1.8-second push starts at 3.3 seconds, overlapping the pan. The city holds from 5.1 seconds, then the goodbye text and Home appear at 6.2 seconds. The cast stays opaque behind the doors. No walking pose is synthesized.

Names remain available through image alternatives; visual name tags are omitted. Soft foot-contact and directional floor shadows, plus restrained warm color treatment, ground the existing cutouts.

The waiting members are the two eligible jurors whose latest exits preceded the human's latest exit. The chronological `seasonExit` log handles double eliminations, equal timestamps and returnees. Older saves fall back to final placement and earlier exit weeks; unknown chronology does not invent roster order. First and second arrivals show zero and one waiting members.

## Controls and sound

Both actions use the native game button style with gold treatment, a maximum width of 180 pixels, a minimum height of 44 pixels and no arrow. Continue season resumes the phase. Home uses the existing durable saved-run cleanup and retry path.

The existing Twin Shock presentation cue loops at the same base volume until the main action is clicked. Its 220 ms fade starts immediately; cleanup releases audio ownership. Skip and Escape finish only the visual sequence, leaving the cue until the main action. Existing music preferences apply. Reduced-motion and animations-off settings show the final city with static lights once artwork is ready.

Four tiny window lights vary gently in opacity on staggered 12-second cycles. All camera, figure and door animations stop after settling. No runtime canvas, video, particle system or frame-by-frame JavaScript loop is used.

## Constrained connections

A browser-reported Save-Data preference or 2G/slow-2G connection selects a complete typographic title card before any scene images or new cinematic cue are requested. It uses charcoal, the game font, gold rules and the same actions.

Other connections have a 1.8-second preparation deadline. If artwork is late, or the critical city, set or door artwork fails, the title card is selected for the remainder of the handoff. Late arrivals do not replace it. In-flight browser image requests may still complete into cache. Skip during incomplete preparation also selects the card. The action remains usable and the durable exit behavior is identical.

Uploaded photos, legacy appearances and failed body derivatives retain the existing framed-portrait fallback when the rest of the scene is ready.

## Asset preparation and review

`scripts/prepare-tribunal-artwork.mjs` prepares bounded cast derivatives without changing original catalogue art. `scripts/prepare-tribunal-environment.mjs` encodes approved generated masters offline. Backplates are 800 × 1000; door and luggage bounds are at most 240 × 720 and 200 × 320. The tall phone city keeps its native dimensions and uses higher WebP quality. Full prompts and source filenames are in `tribunal-artwork-v4.json` and `tribunal-artwork-v8.json`.

Review at 320 × 568 and 402 × 874 before desktop. Browser checks cover exact cast identities, grounded foot anchors during the pass, continuous approach, doorway containment, delayed final copy, native city pixel density, compact controls, a conservative 14 MiB decoded-image budget, and no continuing transforms. Data-saving and delayed-art cases verify the title card and absence of a new cue request. Music lifecycle, Skip, mute, retry and unmount cleanup have focused tests. Real-device performance has not been measured.
