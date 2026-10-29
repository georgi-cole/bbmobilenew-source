# Portrait Tribunal scenes

The production handoff combines generated unoccupied reality-TV architecture with existing cast artwork on independent layers. Typography uses the game's Montserrat stack; both actions use the shared native button component styles with a compact gold treatment.

- Each scene uses one 4:5 art plane inside a portrait-first dialog. All artwork, door hinges and cast anchors share that coordinate system, so resizing never crops a doorway or changes figure alignment.
- Arrival uses a sophisticated penthouse window wall and detailed city view. The selected player stands in front, with the two most recently eliminated eligible jurors farther back. The chronological `seasonExit` log determines their order before the human's latest exit, including equal timestamps, double eliminations and returnees. Old saves fall back to stamped final placement, then earlier exit weeks. Unknown chronology does not invent a roster-order group.
- First and second Tribunal arrivals have zero and one waiting members. The QA fixtures record deterministic exit history and include both variants.
- Departure uses a different empty vestibule facing a real exterior walkway. The original player figure, a generated transparent luggage prop and generated door leaves remain separately controllable. The player and bag dissolve, doors close at the pictured threshold, and the set fades out. Figures retain their existing poses.
- The gold Continue season and Home controls are 180 pixels wide at most, at least 44 pixels tall, and have no arrow. The Home action retains durable save cleanup and retry behavior.

`scripts/prepare-tribunal-artwork.mjs` prepares compact derivatives of the 35 catalogue looks and 27 casual housemate assets. It trims empty margins and transparency noise offline; originals remain unchanged. The content-hashed derivatives are listed in `src/data/tribunalStageAssets.json`. Only the chosen cast is requested.

`scripts/prepare-tribunal-environment.mjs` prepares the approved generated PNG masters as WebP backplates and transparent cutouts. Backplates are 800 × 1000; door and luggage bounds are at most 240 × 720 and 200 × 320. Canvas encoding and alpha inspection run offline, never in gameplay. Full prompts, generation filenames and the built-in tool mode are recorded in `tribunal-artwork-v4.json`.

`TribunalStageFigure` uses the existing appearance resolver. Uploaded photos and missing bodies use the existing player portrait; failed derivatives recover to that presentation. A bounded preparation wait and Skip keep failed assets from blocking progression. Reduced motion and the existing animation setting remain supported. Finite opacity and door transforms stop when the scene settles, and all scene elements unmount on completion.

Review actual cast identities, first/second arrivals, selected catalogue looks and uploaded portraits at narrow phone sizes. The browser checks cover chronological selection, 4:5 geometry, figure containment, compact controls, a 6 MiB decoded arrival-image budget for the catalogue fixture, and no running scene animations after settling. Real-device performance is not yet measured.
