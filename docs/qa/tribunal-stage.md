# Reusable Tribunal scene

The production handoff combines CSS architecture, existing cast artwork, and short finite transitions. There is no generated room image with people baked into it. Typography inherits the game's Montserrat stack, and actions use the existing shared `game-button` styles.

- The player occupies the foreground; up to two actual jurors occupy fixed positions farther back. Selection is stable while the scene is open.
- Arrival is staged inside the lounge against a wide divided window. Static SVG skyline layers, lit windows, glass reflections, deep reveals and brass sconces provide depth. Departure uses a separate side exit facing the city outside; the player stands on the interior side of that threshold. Arrival has no doorway animation.
- A figure's visible head-to-foot bounds fit one height slot. Its feet align with the bottom center of that slot and a static contact shadow. The room has a consistent floor line and camera; portraits have a separate framed presentation.
- The same layout supports the 35 catalogue looks and 27 existing casual housemate assets without pose generation or manual per-character offsets. Figures retain their original standing poses.
- Only the chosen cast is requested. Arrival fades the set and player in; departure dissolves the player, closes two door panels, and fades the set out. No character translation, simulated walking, continuous effects, or runtime pixel processing is used.

`scripts/prepare-tribunal-artwork.mjs` is an offline asset preparation tool. Chromium identifies the visible connected body, removes isolated transparency noise, trims empty margins, and encodes a WebP within 400 × 600 pixels. Originals remain unchanged. The content-hashed derivatives are listed in `src/data/tribunalStageAssets.json`; the manifest does not preload any images. Current coverage is 62 cutouts, about 1.42 MiB downloaded only as selected. Old unreferenced hashed derivatives may be removed when regenerating.

`TribunalStageFigure` uses the existing appearance/casual resolver. Uploaded photos and missing bodies use the existing player portrait, rather than stretching a photo into a body or inventing another character. If a derivative fails, the portrait takes over and the scene remains skippable. A bounded preparation wait prevents image failures from blocking the choice.

Review the ordinary fixture, first arrival, selected catalogue looks, and an uploaded portrait at narrow phone, desktop, and landscape widths. The existing motion preference and Skip control apply to both outcomes. This set is currently used only by the Tribunal handoff; other ceremonies can adopt the placement contract without changing gameplay rules.
