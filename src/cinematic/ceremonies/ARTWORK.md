# Premium announcement effects, revision 2

Generated with the built-in imagegen tool on 2026-10-31. Runtime WebP exports ship in `public/assets/ceremonies/vfx/`; original alpha PNGs are retained in the authoring workspace and are not downloaded by the game.

| Asset             | Runtime file               | Dimensions |  Bytes | Loaded for                          |
| ----------------- | -------------------------- | ---------- | -----: | ----------------------------------- |
| Natural mist      | `natural-mist-v2.webp`     | 960 × 320  | 70,978 | All cinematic shocks                |
| Rose quartz heart | `rose-glass-heart-v1.webp` | 256 × 256  | 13,992 | Cupid arrival and broken spell only |
| Champagne halo    | `champagne-halo-v1.webp`   | 384 × 192  | 15,012 | Halo Exchange (`diamond_pov`) only  |

The existing 85,548-byte optical plate remains a subdued accent. The two shared plates total 156,526 transfer bytes and 2.34 MiB of RGBA pixel data. Cupid adds 0.25 MiB; Halo Exchange adds 0.28 MiB. These estimates exclude browser/GPU overhead. Cutouts are reused across characters and repeated objects share a decoded source.

Mist uses two complete overlapping fields with continuous, slow drift. No half-cloud clipping, frozen hold or hard middle gap is applied. Glass hearts, a separating broken heart, moving halos, paired existing Safety shields and a contracting Force Majeure pressure wave provide selective motifs. Only the current type's cutout is prepared. Opacity and transforms use the existing finite timeline, so Skip, pause/resume and disposal include every added layer. No simulation loop, per-frame JavaScript or animated filter was added.

The Eye entrance is unchanged. Accents start with the final announcement; total duration remains 8.4 seconds including the added reading second. The current original game announcement wording maps Halo Exchange to `diamond_pov`; the authoring variant remains `diamond`.

This is local authoring maintenance, with no released marketplace offer, entitlement, pricing or product-copy change.

## Final prompts

### mist

Use case: photorealistic-natural. Asset type: reusable cinematic VFX smoke compositing plate, horizontal 3:1. A single low-density cloud of genuine natural dry-ice mist, fine soft swirling smoke tendrils, irregular turbulent diffusion, subtle volumetric billows. Neutral pale grey with dim champagne highlights, naturally photographic illuminated haze. Broad asymmetrical horizontal drift across lower two thirds, upper third almost empty, VERY soft fading peripheral edges entirely inside the frame. Wisps remain connected as one fluid cloud, no frame or U-shape, no ribbons, no glowing curved wires, no golden particles, no bokeh, no objects, no shapes, no symbols, no text. True transparent background, preserve translucent smoke alpha, no black rectangle. This texture will move in overlapping layers at low opacity behind readable film titles. Wide horizontal 3:1 composition. All edges fade to transparency.

### heart

Use case: product-mockup. Asset type: isolated premium Cupid VFX cutout, square composition. One elegant anatomically symbolic heart-shaped sculpture of translucent rose-quartz glass, subtle blush rose material, realistic refractive internal light and gently frosted edges, fine champagne-gold rim catching a studio light, no base, floating three-quarter perspective, beautiful deep pink shadows and milky pearlescent highlight, cinematic luxury jewelry photography, sophisticated and restrained. Full heart visible centrally with substantial transparent padding around it; tilted slightly to the left. Genuine transparent background. No cartoon, no emoji, no flat outline, no arms, no wings, no text, no typography, no solid background, no watermark, no extra objects. One single recognizable three dimensional sculptural love heart.

### halo

Use case: product-mockup. Asset type: isolated premium Halo Exchange VFX cutout, wide horizontal composition. One floating angel halo: a perfectly circular slim solid champagne-gold torus in a graceful tilted three-quarter perspective, seen as a horizontal ellipse with a clear empty transparent hole, visibly three-dimensional curved polished metal with a soft inner amber glow and realistic white-gold specular highlights, extremely fine etched detail around the rim. Elegant, regal, expensive physical artifact photographed with cinematic studio lighting. Full halo completely inside the image with broad transparent padding all around. Genuine transparent background, no stand, no other object, no person, no cloud, no text, no symbols, no wings, no cartoon or emoji, no flat vector ring, no sci-fi interface, no solid background. Width around twice its projected height.

## Additional shock motifs

| Asset               | Runtime file                  | Dimensions |  Bytes | Loaded for      |
| ------------------- | ----------------------------- | ---------- | -----: | --------------- |
| Amethyst DNA        | `amethyst-dna-v1.webp`        | 192 × 384  | 24,944 | Twin Shock only |
| Obsidian ballot box | `obsidian-ballot-box-v1.webp` | 256 × 256  | 10,990 | Democracia only |

The source PNGs remain in the authoring workspace; the game uses only the compressed WebP exports. These assets were generated with the built-in imagegen tool. Democracia combines the physical box with a small code-native paper ballot that enters behind its front. Twin Shock reuses one DNA cutout at two depths. The existing game's separate Twin Shock story/reveal movie is not changed by these artwork refinements; this motif belongs to the shock-announcement renderer.

Depression Shock progressively neutralises the chamber's colour from 4.2–6.8 seconds using an opacity-animated neutral colour blend and a dark overlay, leaving the final text readable. It does not duplicate the chamber textures or add an animated blur/filter. The opening remains unchanged.

### Additional final prompts

#### dna

Use case: product-mockup. Asset type: premium Twin Shock cinematic molecular VFX cutout. A single elegant vertically oriented DNA double helix sculpture, three complete graceful helical turns, two slender strands of translucent amethyst crystal with fine champagne-gold highlights, delicate pearl connecting rungs with realistic molecular bead joints. Anatomically recognizable DNA double helix, luxurious science-inspired artifact photographed with cinematic side lighting, real material depth and soft subtle internal violet glow. Complete helix visible centrally, front three-quarter angle, full object with generous transparent padding on all sides, tall 1:2 composition. Genuine transparent background. No text, no letters, no base, no diagrams, no flat symbols, no cartoon, no neon infographic, no extra objects, no background, no watermark.

#### ballot

Use case: product-mockup. Asset type: isolated premium election ceremony VFX object. One compact, beautifully made square ballot box of polished deep obsidian-black lacquer with fine champagne gold metal edges, a narrow horizontal voting slot centered on the lid, one small engraved gold checkmark centered on its front face. Seen from a slightly raised front three-quarter camera angle so the lid and slot are clearly visible. Luxurious restrained dark royal game aesthetic, realistic expensive physical object, cinematic product photography with fine specular reflections. Entire box centered with generous truly transparent padding all around. No ballot paper, no people, no hands, no writing, no letters, no words, no numbers, no extra objects, no pedestal, no background, no watermark, no cartoon, no flat icon. Square composition.

## Vox Populi broadcast studio

Generated with the built-in imagegen tool. Source: `artwork/ceremonies/source/vox-studio.png`. Runtime: `public/assets/ceremonies/shared/vox-studio.webp`, 720 × 1080, 45,186 bytes, quality 78. The empty set contains no embedded character, vote, text or outcome; independent full-body cutouts, lighting, mist, result typography and camera transforms are composited at runtime. Cupid scenes reuse the existing six poses and glass heart; no new per-character artwork is required.

### Generation prompt

Use case: stylized-concept. Asset type: reusable empty cinematic TV results studio backdrop for a premium social strategy mobile game called The Big Eye. Photoreal architectural set, portrait 2:3. A luxurious, dark obsidian and smoked glass broadcast chamber, controlled rich purple ambient light and restrained fine champagne-gold architectural edges. Deep spatial perspective, an enormous gently curved dark panoramic glass LED wall in background with only abstract very faint violet light, absolutely no writing or numbers. Two subtle overhead volumetric light shafts, glossy dark floor with refined reflections, lower foreground mostly empty. Eye-level lens 35mm, symmetrical central vanishing point. Central 75 percent must be uncluttered negative space and low contrast so independently composited full-body contestants and live numeric voting results remain the focus. Understated suspenseful prime-time live final atmosphere, believable cinematic lighting, premium detailed materials, no sci-fi gadgets, no literal eyes, no crowns, no people, no furniture, no logos, no frames or UI, no text, no watermark. Must feel like a deep real room, not flat purple wallpaper. Build a beautiful environment only; all graphics and players added independently.

## Detox and Force Majeure

| Runtime WebP                                  | Dimensions |  Bytes | Used for           |
| --------------------------------------------- | ---------- | -----: | ------------------ |
| `assets/ceremonies/vfx/jade-antidote-v1.webp` | 256 × 384  | 18,230 | Detox only         |
| `assets/ceremonies/vfx/pressure-wave-v1.webp` | 512 × 512  | 99,334 | Force Majeure only |

Both were generated with the built-in imagegen tool, preserving alpha in their WebP exports. Force Majeure reuses the existing Safety shield inside the contracting wave and a brief local release pulse. Detox uses the vial with a mint light bloom. The normal Eye entrance and 8.4-second shock duration are unchanged.

### antidote

Use case: product-mockup. Asset type: isolated premium Detox game-ceremony cutout. One small elegant apothecary antidote vial, a refined narrow clear crystal-glass bottle with a softly rounded teardrop body, filled halfway with luminous pale jade-green liquid, a fine champagne-gold collar and a tiny dark emerald crystal stopper. A real expensive physically made perfume-like antidote vessel, cinematic luxury product photography, beautiful realistic glass reflections and refraction, subtle green light from within, tasteful warm gold edge light. Centered upright at a slight three-quarter view, full bottle visible with generous transparent padding, portrait composition. No text, labels, medical symbols, letters, cross, poison skull, cartoon, emoji, background, other objects or pedestal. Genuine transparent alpha background. Restrained dark royal aesthetic.

### force

Use case: stylized-concept. Asset type: reusable cinematic VFX compositing layer, square composition. One organic luminous pressure wave of fine champagne-gold and muted violet volumetric light, a turbulent semi-transparent vapor shell curling inward toward an empty center, physically photographed optical plasma and thin smoky sheets, convincing depth, very soft irregular fading edges, subtle amber bright filaments and tiny refractive dust. The wave must feel like an inevitable force gathering around a central object, with a clear transparent central opening. Soft asymmetrical elliptical shell, not a perfectly geometric circle. Genuine transparent background. Keep entire faint glow inside the frame with broad padding. No shield, no object, no person, no text, no icons, no UI, no flat vector ring, no solid black rectangle, no sharp spikes, no white flash, no cartoon, no watermark. Sophisticated film VFX in a dark fantasy luxury aesthetic.
