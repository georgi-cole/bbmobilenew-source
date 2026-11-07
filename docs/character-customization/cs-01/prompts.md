# CS-01 prompt and image-generation provenance

Generation date: 26 October 2026. Tool: built-in Codex image-generation tool. Model/version metadata was not exposed in returned metadata. All tool outputs are copied into this CS-01 folder; temporary tool paths are retained below for traceability. The only candidate-03 identity reference was candidate 03's own original full-body source. Existing cast images were used only for visual style review and were not supplied as identity references.

## Candidate 03 main portrait attempts

Identity reference for the first and selected generations: `docs/character-customization/look-pilot/masters/identity-03-everyday-body.png`. It was used only for identity/trait continuity. The background haze and full-body composition were excluded.

### Iteration 01 — retained, not selected

Tool output ID: `exec-42c1cbd3-ed42-4264-aa9b-482e1c41dc17.png`  
Original output: `C:\Users\georg\.codex\generated_images\01a17522-b14e-76a3-b0b6-07dd31e05ba6\exec-42c1cbd3-ed42-4264-aa9b-482e1c41dc17.png`  
Retained copy: [`candidate-03-main-raw-01.png`](sources/candidate-03/iterations/candidate-03-main-raw-01.png)

```text
Use case: stylized-concept
Asset type: reusable square game-avatar portrait foreground, candidate 03 identity pilot
Input images: Image 1 is the sole identity and trait reference: the original fictional adult candidate-03 full-body art. Use only to preserve this character's distinct face, warm medium-brown skin, short tight honey-blond curls, dark hazel-brown eyes, youthful adult features, and plum overshirt over a white crewneck. It is not a composition or background reference.
Primary request: Create a clean, original head-and-shoulders portrait foreground of the same clearly adult fictional man, age 22–26, with the same distinctive facial structure and hair from Image 1.
Scene/backdrop: genuinely transparent background; no haze, halo, studio glow, backdrop color, or residual background pixels.
Style/medium: realistic premium game-cast portrait, natural skin texture and detailed hair, soft controlled studio light, restrained retouching, consistent with a high-quality illustrated photo-realistic game portrait.
Composition/framing: square 1:1, straight-on head-and-shoulders crop, include full curls, both ears and upper shoulders; centered with comfortable transparent clearance; face size and eye line suitable for a small circular avatar crop. Keep the plum overshirt and white crewneck visible at the shoulders.
Lighting/mood: calm, relaxed, neutral expression; balanced soft key light with natural skin highlights.
Constraints: preserve candidate-03 identity and traits, clearly adult, face and head intact as a single person; both eyes unobstructed; no eyewear of any kind; no assembly of facial parts.
Avoid: any additional person, cast/celebrity resemblance, face drift, blond straight hair, changed skin tone, exaggerated features, plastic skin, severe expression, props, lettering, logos, watermark, border, background haze, full-body framing, cropped hair, cropped ears, deformed anatomy, glasses, sunglasses, eyepatch.
```

### Iteration 02 — retained, edge edit not selected

Tool output ID: `exec-09a54063-1e10-4928-b300-ea974664c8a6.png`  
Original output: `C:\Users\georg\.codex\generated_images\01a17522-b14e-76a3-b0b6-07dd31e05ba6\exec-09a54063-1e10-4928-b300-ea974664c8a6.png`  
Retained copy: [`candidate-03-main-edge-edit-02.png`](sources/candidate-03/iterations/candidate-03-main-edge-edit-02.png)

```text
Use case: precise-object-edit
Asset type: identity-preserving transparent portrait foreground for a fictional adult candidate-03 game character.
Input images: Image 1 is the newly generated candidate-03 portrait and the sole edit target.
Primary request: Clean only the colored fringe along the existing transparent silhouette edge. Remove the thin red, yellow, or magenta matte/halo pixels around curls, ears, and jacket shoulders so the person composites naturally on black/gold or grey backgrounds.
Constraints: preserve the exact same adult man, facial identity, expression, eyes, hair shape and color, skin, ears, shirt, lighting, camera, crop, scale, and pose. Preserve the transparent background. Change only the narrow contaminated edge fringe; do not repaint, regenerate, beautify, or retouch any interior person pixels. Fine natural curl edges stay intact, with no colored outline, black matte, or white halo.
Avoid: any change to the face, hairline, individual curls, ears, neck, clothes, eye/brow/mouth shape, background transparency, composition, or any other image content; no added background or color spill.
```

The edit did not visibly improve the transparent-only edge preview. The retained alpha was then inspected composited on near-black, grey and saturated backgrounds; no visible colored fringe appeared in those actual background composites. The next iteration was selected after that full-background inspection.

### Iteration 03 — selected main and shared grey foreground

Tool output ID: `exec-e6abfac1-4868-414a-bcac-a3ecabb0a602.png`  
Original output: `C:\Users\georg\.codex\generated_images\01a17522-b14e-76a3-b0b6-07dd31e05ba6\exec-e6abfac1-4868-414a-bcac-a3ecabb0a602.png`  
Retained iteration: [`candidate-03-main-reprompt-03.png`](sources/candidate-03/iterations/candidate-03-main-reprompt-03.png)  
Frozen main master: [`identity-03-main-portrait-master.png`](sources/candidate-03/identity-03-main-portrait-master.png)

```text
Use case: stylized-concept
Asset type: original transparent game portrait foreground for candidate 03
Input images: Image 1 is the sole identity reference: an original fictional adult character full-body image. Use it only for the man's distinct facial traits, warm medium-brown complexion, dark hazel-brown eyes, short tight honey-blond curls, and plum overshirt over a white crewneck. Ignore its studio haze and composition.
Primary request: Render the same clearly adult fictional man (22–26) as one intact, centered, straight-on head-and-shoulders portrait, suitable as a small square game avatar. Keep all curls, both ears, neck and both shoulders in frame.
Style/medium: premium realistic game portrait with natural facial and clothing detail, restrained natural retouching; no graphic outline or illustration stroke.
Scene/backdrop: transparent alpha only. The transparent region must be genuinely empty. No colored backdrop, lighting glow, colored matte, outline, stroke, fringe, rim light, or background pixels.
Lighting/mood: relaxed neutral closed-mouth expression, soft even studio portrait lighting.
Constraints: Preserve only the depicted identity's recognizability and traits, not the exact full-body pose. Carefully antialias real hair, ear and garment edges against transparency using neutral, uncolored edge pixels that blend over both charcoal black and soft grey. The person remains a complete intact human portrait. No glasses.
Avoid: red, magenta, orange, or yellow colored edge halos; white/black matte fringe; heavy rim light; haze; background glow; cropped hair or ears; face drift; exaggerated features; plastic skin; other people; logos; lettering; watermark; props.
```

The selected output is used unchanged for candidate-03 main and grey foregrounds. Separate authored SVG backgrounds produce the two scenes.

## Candidate 03 sad-state edit

Tool output ID: `exec-edc9bba7-14a8-4bf4-8611-b73c733a782f.png`  
Original output: `C:\Users\georg\.codex\generated_images\01a17522-b14e-76a3-b0b6-07dd31e05ba6\exec-edc9bba7-14a8-4bf4-8611-b73c733a782f.png`  
Retained iteration: [`candidate-03-sad-identity-edit-01.png`](sources/candidate-03/iterations/candidate-03-sad-identity-edit-01.png)  
Frozen sad master: [`identity-03-sad-portrait-master.png`](sources/candidate-03/identity-03-sad-portrait-master.png)

```text
Use case: identity-preserve
Asset type: sad-state portrait foreground for a fictional adult game character, candidate 03
Input images: Image 1 is the sole identity and edit target: the selected clean candidate-03 main portrait foreground.
Primary request: Create the same adult man as a respectful, genuinely subdued sad/disappointed expression variant. Change the expression only.
Constraints: Preserve the exact person, face proportions, warm medium-brown skin, short tight honey-blond curls, eyes, brows, nose, ears, jaw, plum overshirt, white crewneck, soft light, head pose, scale, crop, transparent background, and fine hair edges. Keep both eyes visible. The emotion should be subtle and adult: slight inner-brow lift and lowered intensity in the eyes, relaxed closed mouth. Keep full head and shoulders intact.
Avoid: tears, exaggerated frown, distress, grimace, smile, changed person, face drift, altered hair or clothing, over-smoothing, makeup, eyewear, extra person, background, colored halo, outline, haze, text, logo, watermark, cropped hair, missing ears, or any changes other than expression.
```

## Candidate 01 extraction matte for layer resources

Tool output ID: `exec-cba97231-801a-404c-adc8-0c7a53d1793b.png`  
Original output: `C:\Users\georg\.codex\generated_images\01a17522-b14e-76a3-b0b6-07dd31e05ba6\exec-cba97231-801a-404c-adc8-0c7a53d1793b.png`  
Retained mask-source copy: [`identity-01-main-background-extraction-mask-source.png`](sources/candidate-01/identity-01-main-background-extraction-mask-source.png)

```text
Use case: background-extraction
Asset type: non-destructive transparent complete-person foreground derivative for the accepted candidate-01 main portrait.
Input images: Image 1 is the source portrait and the sole edit target.
Primary request: Extract the entire existing person as one intact transparent portrait foreground. Remove only the near-black/gold background pixels outside the person.
Constraints: Preserve the exact face, eyes, expression, hairstyle and every fine braid, ears, neck, clothing, lighting, crop, scale, and all original person pixels unchanged. Keep the complete head, hair, neck, shoulders, and visible clothing as one intact person. Do not rebuild or modify any part. Produce genuinely transparent background; retain natural fine braid edges without background-colored halo or lost strands.
Avoid: face/body assembly, any change to facial identity or anatomy, repaint, beautification, altered color, crop, pose, hairstyle, missing braid, gold spill, black matte, white fringe, text, logo, watermark, or a new background.
```

This output's RGB was discarded. Its alpha channel is the only part used to produce candidate-01 foreground/background resources. Their RGB pixel data comes from the accepted CS-00 masters, which remain untouched. The six static eyewear compositions use the accepted CS-00 256px WebP bases directly and add only the independent vector eyewear layer.

## Authored vector sources

The eyewear and proposed outer profile frame are original code-authored SVGs; no image-generation reference or external artwork was used for either. The candidate-03 backgrounds are also local vector sources. The main background uses sparse, small gold flecks and short accents around the perimeter, leaving the near-black center quiet. The grey background is a soft radial grey treatment with visibly darker edges.

No AI cast portrait, body, or face was used as an identity-generation input. The inspected Nova and Ali images informed only the written/perimeter treatment requirements and were not copied into the artwork.
