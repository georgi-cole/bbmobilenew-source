# Changing room portrait frame

Generated with the built-in imagegen tool for the lock-in portrait reveal.

- Runtime asset: `public/assets/dressing-room/antique-gold-frame.webp`
- Export: 768 × 768 WebP, approximately 203 KiB, with the original transparent alpha preserved.
- Original generated canvas: 1254 × 1254. Center and outer corners have alpha 0.
- Measured inner opening: x 17.62%–82.38%, y 17.15%–82.22%.
- The portrait and traveling figure use a 17% inset so their pixels extend slightly beneath the carved gold edge.
- No character images are modified.

## Reveal framing

The reveal uses one motion value over 1,250 ms. A single registered image plane moves from the original figure's face to the final portrait position. The full figure fades outside the portrait while the protected face, main avatar, and antique frame resolve together. There are no timed crop, frame, or confirmation stages, camera overshoots, light rays, or spotlight overlays. The animation begins when its images are ready and respects reduced motion.

Continue adds a consumed-once route marker for a subtle profile entrance. The character and pedestal settle together, with a small pedestal swivel about the shared foot-contact point. Other profile visits stay static.

`src/appearance/portraitFraming.ts` stores normalized face centers and heights for each figure/portrait pair. All 70 face regions were measured offline and visually reviewed. The coordinates keep both faces at the same position and scale throughout the shared-plane transformation. There is no face detection or additional image processing at runtime. Update these coordinates when replacing a look's `casual.webp` or `main.webp`.

## Generation prompt

```text
Use case: stylized-concept
Asset type: a single production-ready transparent decorative picture-frame overlay for a mobile game's cinematic portrait reveal.
Primary request: a majestic antique gold portrait frame, convincingly sculpted and gilded, like a small museum oil-painting frame. Rich old gold, beautiful carved acanthus leaf corners, refined beaded inner moulding, gently aged patina in the recesses, realistic dimensional bevels and restrained warm highlights. Elegant premium craftsmanship, readable at 300 pixels wide.
Composition: EXACTLY front-facing, perfectly square and symmetrical, straight parallel edges, no camera perspective or rotation. One square frame centered on a square canvas. Outer silhouette occupies approximately 96% of canvas width and height, leaving 2% genuinely transparent margin on every side. The EMPTY SQUARE INNER OPENING spans from x=12% to x=88% and y=12% to y=88%, with straight square edges; the opening is genuinely transparent alpha, not white, black, glass, paper or a checkerboard. Everything outside the frame is also genuinely transparent. Keep the ornament confined to the frame's gold band; retain this square inner opening precisely.
Lighting: soft studio illumination from upper left, rich solid antique gold, realistic deep relief, no emitted glow.
Constraints: Only the empty frame. No portrait, person, face, scene, room, stand, artwork, text, logo, heraldry, halo, sparks or dust. No extra objects. No printed transparency checkerboard. No shadows extending into the transparent opening. No outline-only vector look. Preserve full transparent alpha.
```
