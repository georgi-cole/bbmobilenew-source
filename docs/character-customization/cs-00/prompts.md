# CS-00 prompt and provenance record

**Date:** 25 October 2026  
**Route:** Built-in Codex image-generation tool; four distinct requests, one call per new role. Tool model/version metadata was not exposed.  
**Input policy:** Only candidate 01's own frozen casual or main source was used as an identity reference. Existing cast art was not included in generation inputs.

## Reused candidate-01 sources

- Casual body source: `masters/identity-01-casual-body-master.png`, copied byte-for-byte from [`../look-pilot/masters/identity-01-everyday-body.png`](../look-pilot/masters/identity-01-everyday-body.png). Its original body creation and transparent alpha-cleanup prompts are preserved in [`../look-pilot/source-prompts.md`](../look-pilot/source-prompts.md), under **Identity 01 — everyday body**.
- Main portrait source: `masters/identity-01-main-portrait-master.png`, copied byte-for-byte from [`../look-pilot/masters/identity-01-everyday-portrait.png`](../look-pilot/masters/identity-01-everyday-portrait.png). Its original portrait prompt and body-source lineage are preserved in [`../look-pilot/source-prompts.md`](../look-pilot/source-prompts.md), under **Identity 01 everyday portrait**.

The source records state that the original character was generated without an existing cast portrait, real-person photo or external character image as an identity reference. Existing cast assets informed only written style/framing guidance and later side-by-side review.

## New generated masters

The original image-tool outputs were retained under `C:\Users\georg\.codex\generated_images\01a17506-4b0b-7430-8437-636eec5e359b\` and copied without modification to `masters/`. Tool output files and sizes:

| Role          | Output ID                                       | Input image                     | Raw PNG bytes |
| ------------- | ----------------------------------------------- | ------------------------------- | ------------: |
| Formal body   | `exec-f457b474-223d-4945-9062-9812cf306bbc.png` | Candidate 01 casual body only   |     1,438,736 |
| Grey portrait | `exec-c3f61c7a-cf44-4f04-9c7b-966e27cf6d8c.png` | Candidate 01 main portrait only |     2,250,207 |
| Sad portrait  | `exec-84b1b91c-eff9-4466-9019-b14710c6c144.png` | Candidate 01 main portrait only |     2,491,290 |
| Paparazzi     | `exec-0b3b2e15-6d70-4f3e-9878-e78855eb7ca5.png` | Candidate 01 casual body only   |     2,318,507 |

### Formal body prompt

```text
Use case: stylized-concept
Asset type: high-resolution formal full-figure scene master for fictional character pack 01
Input images: Image 1 is the sole identity reference; it is the already-created original character 01. Do not use it as a pose or outfit redesign.
Primary request: Create a new full-body formal evening outfit image of the exact same fictional adult woman from Image 1.
Subject: Same 23–26-year-old woman, deep warm-brown skin, softly rounded face, dark brown almond eyes, small cheek beauty mark, long black microbraids in the same high ponytail with face-framing braids, subtle gold earrings, same average-athletic adult build, same apparent height and natural proportions. Preserve her face and identity exactly.
Scene/backdrop: Transparent image; no backdrop, floor, cast shadow, vignette, glow or haze.
Style/medium: Premium realistic illustrated game-cast rendering consistent with Image 1, natural skin, detailed hair and fabric, soft controlled studio light.
Composition/framing: Straight-on relaxed roster stance, centered vertical 2:3 canvas, hands empty and visible, full braids, both hands and both shoes fully inside frame, generous side margins, crown around 3–5% from top, soles around 95–98% from bottom. Match Image 1's scale, head-to-body ratio, apparent height and feet baseline.
Clothing: Distinct contemporary evening formal look: tailored deep emerald long-sleeve satin blouse with refined collar, high-waisted black wide-leg tailored trousers, narrow understated gold belt detail, elegant low black block-heel ankle boots, small gold studs. Tasteful, comfortable, adult, non-sexualized and plausible; not a costume.
Lighting/mood: Soft balanced studio light on face, neck and body with consistent natural skin tone.
Constraints: This is the exact same original character and hairstyle; keep her face, skin, eyes, brow, age, body proportions, head size, braids, calm expression and frontal stance. Empty visible hands. True transparent alpha around all hair, fingers, clothing and shoes.
Avoid: Any other person, cast/celebrity resemblance, identity change, face reshaping, extra/fused fingers, missing hands, cropped shoes, anatomy distortion, logos, letters, text, jewelry beyond described, extra props, background pixels, shadow, light spill, colored halo or translucent skin/clothing.
```

### Grey portrait prompt

```text
Use case: stylized-concept
Asset type: square grey-presentation avatar master for the same fictional adult character in portrait state
Input images: Image 1 is the sole identity reference, an original candidate-01 portrait. Match this identity and crop only.
Primary request: Create a separate neutral-grey presentation avatar of the exact same original adult woman in Image 1.
Subject: Same 23–26-year-old woman, deep warm-brown skin, same softly rounded face, dark brown almond eyes, small cheek beauty mark, long black microbraids in the same high ponytail with face-framing braids, subtle gold studs, same natural makeup and calm expression, same everyday outfit cues: sage-green bomber collar over a black crewneck. Keep her skin, hair, eyes and clothes in natural color.
Scene/backdrop: Quiet neutral medium-light grey studio backdrop with a soft, even grey gradient and no black-and-gold crackle. Grey means the presentation/background treatment; do not grayscale, fade, or recolor the person.
Style/medium: Premium realistic illustrated game-cast rendering matching the source portrait's natural detail and restrained polish.
Composition/framing: Square 1:1, close head-and-shoulders roster portrait, centered, facing camera, match the source portrait's head size, eye line, shoulder crop, camera angle and full hair visibility. Face must remain large, crisp and legible at 32, 48, 64 and 72 pixel avatar sizes.
Lighting/mood: Calm neutral soft studio light, even across face and shoulders, no dramatic shadow.
Constraints: Preserve the exact same individual facial identity, face proportions, age appearance, hairline, braid pattern/silhouette, eye color, skin tone and everyday outfit cues. This is a distinct scene role, not a redesign or different person.
Avoid: Any additional person, twins, cast/celebrity likeness, identity drift, smile change, pose change, portrait collage, hair crop, grey skin, grayscale person, black-gold background, text, logos, frame, props, excessive retouching or exaggerated eyes.
```

### Sad portrait prompt

```text
Use case: stylized-concept
Asset type: square sad-state roster avatar master for the same fictional adult character in portrait state
Input images: Image 1 is the sole identity reference, an original candidate-01 everyday portrait. Keep the same outfit and portrait setup; change only expression and restrained lighting.
Primary request: Create a genuine subdued-expression variant of the exact same original adult woman in Image 1.
Subject: Same 23–26-year-old woman, deep warm-brown skin, same softly rounded face, dark brown almond eyes, small cheek beauty mark, long black microbraids in the same high ponytail with face-framing braids, subtle gold earrings, same sage-green bomber collar over black crewneck. Same natural makeup and clearly adult appearance.
Scene/backdrop: Same designed deep near-black roster portrait background with restrained fine abstract gold crackle accents only around outer edges, quiet and low contrast behind face.
Style/medium: Premium realistic illustrated game-cast rendering matching the source portrait's natural detail, restrained retouching and art finish.
Composition/framing: Square 1:1, close head-and-shoulders, centered and facing the same camera, match source head size, eye line, shoulder crop and full hairstyle visibility. Face legible at 32, 48, 64 and 72 pixel avatar sizes.
Lighting/mood: Slightly subdued but still natural soft portrait light, respectful and emotionally restrained.
Expression: A real but subtle sad / disappointed expression: inner brows gently raised, eyes quietly lowered or thoughtful, mouth relaxed and closed. No tears, no exaggerated frown, no comic misery.
Constraints: Preserve the exact same facial identity, facial proportions, age appearance, hairline, braid pattern/silhouette, eye color, skin tone, outfit, camera and pose. This is not a different person and not a grayscale filter; the expression itself is changed.
Avoid: Any additional person, twins, cast/celebrity resemblance, identity drift, smile, tears, melodrama, grimace, altered hairstyle, head turn, clothing change, face crop, text, logo, border, props, excessive smoothing or enlarged eyes.
```

### Paparazzi prompt

```text
Use case: stylized-concept
Asset type: After the Eye candid editorial photo master for fictional character pack 01
Input images: Image 1 is the sole identity reference, the already-created original character 01. Use it only to preserve her identity and everyday outfit.
Primary request: Create one believable candid editorial photograph of the exact same fictional adult woman after leaving a televised studio event.
Subject: Same clearly adult 23–26-year-old woman, deep warm-brown skin, same softly rounded face, dark brown almond eyes, small cheek beauty mark, same long black microbraids gathered in a high ponytail with face-framing braids. Preserve her recognizable identity. She wears the same sage-green bomber jacket over a black crewneck from Image 1.
Scene/backdrop: Outside a modern television studio or event venue at evening, subtle architectural entrance lights and softly blurred generic press activity in background. At most a few indistinct background silhouettes; the woman remains the sole sharp subject. No readable signs.
Style/medium: Natural candid editorial photography with realistic camera flash, documentary texture, believable fabric and skin, restrained retouching, suitable for a fictional social strategy game's tabloid card.
Composition/framing: Portrait 2:3 canvas. Head and upper body to mid-thigh, arms and hands naturally present if included, face near upper third and fully visible, camera at eye level, candid three-quarter body angle with her glancing slightly to one side as if noticing a call; natural composed expression, not posed for a studio portrait. Leave a little breathing room around hair and shoulders. Compose for an After the Eye photo frame that uses object-fit: cover with top alignment and may crop the lower part on mobile.
Lighting/mood: Evening venue ambient light with one soft realistic camera-flash pop; facial lighting and background exposure remain natural and not harsh.
Constraints: Same individual as Image 1, including face, skin tone, braid silhouette, eyes, cheek mark and everyday jacket/top. Editorial scene only, fictional publicity image. Natural adult proportions and expression.
Avoid: Any other sharp/recognizable person, paparazzi harassment, panic, shame, scandal, sensational text, captions, logos, readable signage, watermarks, identity changes, plastic skin, exaggerated glamour, dramatic crying, distorted hands, extra limbs, extreme flash blowout, cropped head or distorted anatomy.
```

## Export record

The exact retained masters, dimensions, byte counts, alpha inspection counts and SHA-256 values are listed in [`exports/identity-01-r1/report-v3.json`](exports/identity-01-r1/report-v3.json). Image generation is nondeterministic; the exported WebP files are deterministic transformations of these frozen masters.

The image tool's generated outputs do not provide a commercial-rights or exclusivity guarantee. Confirm current commercial-use terms and inspect final work for accidental third-party marks before any commercial release.
