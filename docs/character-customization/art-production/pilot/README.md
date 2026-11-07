# CP-02 pilot production record

**Status:** Complete; four pilot presets visually accepted on 25 October 2026.

The selected master artwork is kept in `masters/`, outside the public asset tree. Each master is a 1024 × 1536 transparent PNG. The catalog contains only the optimized WebP derivatives in `public/assets/characters/`. All four outputs use the same front-facing, neutral-pose, softly lit realistic game-render style, with a full figure, shoes, and a 2:3 canvas.

## Accepted presets

| ID           | Master                                 | Visible appearance                                                                                             | Body bytes | Portrait bytes | Thumbnail bytes |
| ------------ | -------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------: | -------------: | --------------: |
| `preset-001` | [`look-01.png`](./masters/look-01.png) | Young adult; light-medium skin; short dark waves; light stubble; average build; straight brows                 |     74,436 |         12,618 |           4,500 |
| `preset-002` | [`look-02.png`](./masters/look-02.png) | Middle adult; deep skin; shoulder-length natural curls; no facial hair; fuller build; arched brows             |     83,026 |         16,638 |           5,176 |
| `preset-003` | [`look-03.png`](./masters/look-03.png) | Older adult; light skin; short silver hair; visible age lines; no facial hair; slim build; androgynous styling |     63,454 |         11,626 |           4,106 |
| `preset-004` | [`look-04.png`](./masters/look-04.png) | Middle adult; medium-deep skin; bald with a full beard; broad build; strong brows                              |     80,842 |         12,644 |           4,326 |

Each preset has `body.webp` at 768 × 1152, `portrait.webp` at 256 × 256, and `thumbnail.webp` at 128 × 128. The portrait and thumbnail come from the same 448 × 448 source crop (left 288, top 8). All derivatives retain alpha. The combined delivery is 373,392 bytes against the 8 MiB catalog budget. Eye color is stored as `other` because it is not reliable enough to claim at the supported portrait sizes. The catalog stores only visibly supported traits; it does not infer race, gender identity, or player age.

## Visual review evidence

Contact sheets read left-to-right as Looks 01–04. The three rows use dark `#10151d`, light `#f2f0ea`, and saturated teal `#177d84` backgrounds.

Files beginning `accepted-` are the canonical acceptance evidence. Other `*-review.png` sheets and `exports*/` directories are exploratory crop iterations, not release assets or acceptance evidence.

- [Full-body delivery at scene scale](./review/accepted-body-backgrounds-2x3.png)
- [Portrait delivery at 256 px](./review/accepted-portrait-backgrounds.png)
- [Thumbnail delivery at 128 px](./review/accepted-thumbnails-backgrounds.png)
- [Portraits in the existing 72 px circular profile avatar](./review/accepted-profile-72px.png)
- [390 × 844 Tribunal cutout fit check](./review/accepted-tribunal-fit-390x844.png)

The Tribunal sheet is a static fit review using the existing `.tms-cutout-wrap` bounds (70% width, full stage height, left −9%, bottom −1%) and `.tms-cutout` rules (`object-fit: contain`, bottom aligned). It uses a representative dark reveal backdrop; it is not a live application screenshot. At this mobile viewport the 2:3 image fits within a 273 × 844 CSS box, rendering at about 273 × 410 px. All four keep their heads, hands, and shoes visible. The 72 px profile proof follows the existing circular `object-fit: cover` treatment. Across the dark, light, and teal contact sheets, hair edges remain clean, clothing stays legible, faces remain distinguishable at thumbnail size, and no background halo or clothing transparency was visible.

`npm run validate:characters` passed after catalog registration: four revisions, twelve fully decoded assets, and 373,392 total bytes. `npm run typecheck` is recorded in the backlog completion entry. No selector, player state, or renderer integration is part of CP-02.

## Generation provenance

All four accepted masters were created with the built-in image-generation tool on 25 October 2026. No reference images, personal photos, or external character assets were supplied. Original generated filenames are recorded with each look. The prompts below preserve the art direction used for these accepted masters.

### Look 01

Original generated file: `exec-647fd843-c273-4259-bef8-3fc8c4686966.png`.

> Create one premium character asset for a polished realistic illustrated social strategy game. Full-length adult human character, standing upright, looking directly at camera with calm neutral expression, relaxed arms slightly away from torso, hands visible, feet fully visible, wearing understated contemporary casual clothes: deep teal overshirt over warm white crewneck, charcoal trousers, simple sneakers. Adult appearance young-adult; light-medium skin with natural warm undertone; short dark wavy hair; light stubble; average build; masculine presentation; straight brows; brown eyes. Distinct recognizable facial features, natural body proportions, subtle painterly realism consistent with high-quality game character rendering, soft even studio lighting and crisp facial detail. Center subject on a vertical 2:3 canvas. Top of hair near 5% canvas height, shoes baseline near 96%, generous balanced side margins. Transparent background, clean alpha edges including hair and shoes. No floor shadow, no outline, no halo, no props, no scenery, no extra people, no labels or text. Do not crop any body part.

### Look 02

Original generated file: `exec-219ee538-5b98-4ed5-a3d5-600c9045deb3.png`.

> Create one premium character master in the SAME visual language as a realistic premium game cast: natural photographic rendering, lifelike facial detail, subtly polished, soft neutral studio light, front-facing camera and same 2:3 full-body framing as a game character reference. One distinct adult human only, middle-adult appearance, deep rich brown skin with natural undertones, shoulder-length defined natural curls, soft arched brows, dark brown eyes, no facial hair, fuller but natural build. Feminine presentation. Give her a calm neutral expression, upright relaxed symmetrical stance, arms slightly away from the torso and hands visible. Full body including both shoes. Outfit: muted plum open cardigan over a cream top, dark olive straight trousers, clean low-profile neutral sneakers. Keep face and body proportions realistic and anatomically natural. Center on a vertical 2:3 canvas, top of hair at about 5% canvas height and shoe baseline at about 96%, generous balanced side margins. Transparent background and clean real alpha around every curl and clothing edge. Absolutely no vignette, backdrop, glow, floor, floor shadow, halo, frame, text, logos, furniture, props, extra person, crop, or obscured hands.

### Look 03

Original generated file: `exec-f9d99c13-ea25-400f-b096-6610bb096f4f.png`.

> Create one premium character master for a realistic premium game cast. Natural photographic rendering with subtle polish, lifelike face detail, soft even studio lighting, straight-on camera, same relaxed neutral pose and consistent scale as a roster reference. One distinct older-adult person with light skin, short neatly cropped silver hair, gray eyes, clearly visible but subtle natural age lines, no facial hair, slim build, straight softly defined brows. Their presentation is distinctly androgynous and gender-ambiguous: face shape and styling balanced between traditionally masculine and feminine cues, no makeup, no earrings, neutral expression, no pronounced gender-coded silhouette. Unisex outfit: charcoal blue tailored overshirt-jacket over a light gray crewneck, straight dark trousers, muted burgundy simple sneakers. Calm, confident and approachable. Arms slightly away from torso, hands visible, full body including both shoes, upright symmetrical stance. Centered on a vertical 2:3 canvas, top of head at 5%, shoe bottoms at 96%, side margins balanced. Transparent background with clean true alpha. No backdrop, vignette, glow, floor shadow, halo, frame, props, text, logos, other people, obscured hands, or cropped body parts.

### Look 04

Original generated file: `exec-9e0cda0a-2f94-4102-88cb-4a3724a230ea.png`.

> Create one premium character master in the SAME visual language, camera, lighting, pose and framing as a realistic premium game cast: natural photographic rendering, lifelike facial detail, subtly polished, soft neutral studio lighting, straight-on view and full-length figure on a vertical 2:3 canvas. One distinct middle-adult human only, medium-deep warm brown skin, fully bald head, neatly groomed full beard, strong brows, dark brown eyes, broad natural build, masculine presentation. Give him a calm neutral expression, upright relaxed symmetrical stance, arms just slightly away from his torso, hands visible, both shoes fully visible. Outfit: rust-brown casual overshirt over light stone crewneck, deep navy straight trousers, simple clean dark sneakers. Natural realistic anatomy and proportion; broad should read in silhouette without caricature. Centered, top of head near 5% canvas height, shoe baseline near 96%, balanced side margins. Transparent background with clean true alpha around head, ears, beard, fingers, clothing and shoes. Absolutely no studio backdrop, vignette, glow, floor, cast shadow, halo, frame, logos, labels, furniture, props, text, other people, cropping, or hands obscured.

The OpenAI [EU Terms of Use](https://openai.com/en-GB/policies/eu-terms-of-use/) assign output ownership to the user as between the parties, to the extent permitted by law, and note that outputs may not be unique. This records the generation workflow’s output terms; it does not claim exclusivity or a third-party-rights guarantee. The project owner remains responsible for review before public commercial release.
