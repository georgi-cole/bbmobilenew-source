# Modular character artwork brief

**Status: Abandoned at the user's request after MP-00 visual review.** The generated modular combinations were rejected. This brief is historical and does not authorize further art production.

Revision: 25 October 2026. This replaces the proposed sixteen complete-character launch library. The four CP-02 static cutouts remain approved as complete images and style references, not interchangeable parts. Their production record remains at art-production/pilot/README.md.

## Art direction

Create recognisable, adult human characters that sit beside The Big Eye's realistically rendered cast. Use a deliberately consistent illustrated/rendered finish, shared lighting, transparent edges, and a fixed upright full-body pose. Review the existing cast and CP-02 images at their actual scene scale before locking the rig. High-detail photographic pieces generated independently are unlikely to line up. AI generation may supply drafts; manually align, mask, paint, and review the accepted layer masters.

Use a canonical 2:3 canvas and record exact master/export dimensions, head centre, crown, chin, neck join, shoulders, hands, hips, and feet baseline. Keep heads and outfits within a controlled envelope. A part must carry its own manifest offset and draw order if trimmed. No baked background, floor, labels, or props. Hair crossing shoulders needs back and front layers. Glasses and facial hair must respect face anchors. No exposed skin can be stuck at another palette tone.

The identity range should represent many facial structures, hair textures, builds, and adult age appearances without assigning race, gender, health, or gameplay labels from appearance. Natural hair textures and the base palette range belong in free coverage. Premium content can add distinctive cuts, dyed colours, makeup, accessories, outfits, and presentation effects. Do not create a premium-only solution to a common missing skin tone or hair texture.

## Slider rules

A colour slider is a visual control over approved palette stops. For skin, make a calibrated ramp with meaningful undertone variation and preserve shaded face/body regions, lips, ears, hands, and neck. Do not use a global hue rotation. Hair needs its own mask and tuned highlights. A broad fantasy-colour control may be a separately granted premium palette, but preview and ownership must be clear. Eyes and makeup need dedicated masks; if a colour cannot be distinguished in a 72 px portrait, omit that slider at launch.

A size slider is a visual control over authored body silhouettes or fit steps. Changing the body step selects the matching outfit artwork. Do not scale only the torso, stretch a raster body, or change gameplay fitness. Height, nose width, face morph, and continuous weight sliders require separate rig/quality experiments and are outside the first launch contract. Hair length selects authored styles. Slider labels must describe visible changes honestly.

Small bounded adjustments can be tested for glasses fit, accessory position/scale, or makeup opacity. Approve their minimum and maximum across every compatible face, then store only values inside that range. A scaled accessory may still need a separate fit asset where it crosses hair or ears.

## MP-00 modular pilot: exact scope

Create an isolated proof with two visibly different adult face bases, two distinct body silhouettes, three approved skin stops, four hair styles including different textures/lengths, two complete outfits fitted to both bodies, one facial-hair option, and one glasses option. Include one natural hair-colour control with at least three approved stops. One starter recipe should be immediately recognisable as a complete character; a second starter should exercise a contrasting face/body/hair combination. Include at least one locked premium-style part in the test catalog to demonstrate try-on versus Apply without building payments.

The pilot may use a small local proof page or viewer and a small typed/validated manifest. It must produce a transparent full-body image and a matching portrait from the same recipe. It must demonstrate changing skin and hair stops and switching body size steps without colouring clothes or breaking outfit joins. Keep the pilot isolated from production profile/game flow and from the released static preset catalog until the rig is approved. Do not publish placeholder vector silhouettes as proof of alignment with the game's cast aesthetic. If authentic art cannot be produced with available tools, document the concrete art blocker and supply the best honest evidence rather than marking the visual gate complete.

Pilot evidence:

- Source masters, part/mask exports, reproducible export notes, and a manifest recording anchors, compatible fits, layer order, dimensions, alpha, and revisions.
- Contact sheets showing both faces on both body types, all skin stops, all four hairstyles, both outfits on both bodies, facial hair/glasses, and at least one deliberately difficult overlap.
- Transparent body on dark, light, and saturated game backgrounds; matching portrait at 256 px and 72 px circle; full body at the existing 390 by 844 scene fit.
- A local interactive preview or equivalent reproducible compositor proof, including free Apply success and locked-item Apply rejection while locked preview remains visible.
- Recorded total asset bytes, peak or bounded decode/composition memory estimate, composition latency in a narrow mobile-browser run, cache/rebuild behavior if implemented, and explicit native-device status.
- At least one broad combination matrix with automated asset validation and a human visual review of representative and edge combinations.

Do not call a prototype accepted because its files decode. MP-00 passes visual feasibility only if face/hair/neck, skin/exposed regions, hands/outfits, and glasses/beard alignment survive the contact sheet at actual sizes. The pilot may prove a narrower rig and recommend fit restrictions; record any exclusions and amend launch counts rather than claiming universal compatibility.

## Intended free launch inventory after pilot

| Category             |        Planning target | Fit and production implication                                                                                       |
| -------------------- | ---------------------: | -------------------------------------------------------------------------------------------------------------------- |
| Face bases           |                     12 | Distinct structures and adult age appearances within a controlled hairline/neck system; extra hair fits where needed |
| Body silhouettes     |                      4 | Each needs a matching version of every complete outfit                                                               |
| Skin                 | About 10 palette stops | Face, neck, ears, hands, exposed body share the same tuned stop                                                      |
| Hair styles          |           16 plus bald | Cover straight, wavy, curly, coily, braids/locs, short/long, receding; front/back pieces as needed                   |
| Natural hair colours |          About 8 stops | Masked highlights and roots where present                                                                            |
| Facial hair          |            6 plus none | Fit to compatible face anchors                                                                                       |
| Brows                |                      6 | Colour and shape visible in 256 px portrait                                                                          |
| Complete outfits     |                      3 | 12 body/outfit fit exports at four silhouettes, plus masks/variants                                                  |
| Glasses              |            3 plus none | Fit and transparency checked across face bases                                                                       |
| Starter recipes      |               12 to 16 | Combinations of released parts, not extra complete identities                                                        |

The counts are provisional. A face with a radically different hairline may require separate hair fits; long hair may need body/outfit collision cleanup. Record actual part count, mask count, fit count, source/master count, and shipped bytes separately. Never market the mathematical combination count as the number of visually approved characters. Test a sampled cross-product and all known risky joins. Treat all palette stops as art content requiring visual approval.

## Premium content rules

Every new offer specifies exactly which parts or colour palettes it grants, compatible rigs/bodies, portrait/body surfaces, and preview image. Premium hair needs the same free-rig fit quality and any front/back layers. Makeup requires face-specific placement/masks and should launch only after a small trial across the free faces. Jewellery, hats, and handheld accessories need overlap rules; start with glasses and frames before complicated props. A premium outfit needs one authored fit per supported body step and a clear compatibility statement. Store thumbnails should be composed from the same assets used in game.

Universal portrait frames and profile backdrops are lower fitting cost and can serve both composed characters and uploaded photos. Elimination/entrance effects require surface-specific art and performance checks. No paid item should be sold for a surface where it is invisible.

## Production records and validation

Each accepted part has a stable ID, rig ID, art revision, source/master location, export path, offsets, compatible fit IDs, mask/palette rules, generation/edit provenance, file bytes, dimensions, alpha result, and review evidence. Keep masters/rejected generations outside public. Only optimized delivery assets belong under public. The existing CP-01 validator checks complete static preset derivatives; modular parts need a new validator for manifest references, dimensions, decoded pixels, alpha, masks, palette stop IDs, fit coverage, revisions, and total bundle budget.

Review at 72 px profile size, 256 px portrait size, full-body stage scale, and dark/light/saturated backgrounds. Examine hair edges, eye/brow readability, age details, neck/hand colour, clothing joins, shoes and feet baseline, and layers over/under accessories. Capture the composition with body and portrait together for every accepted starter. Test representative non-starter combinations and likely collision pairs. Keep commercial usage rights and source provenance for all contributed art.

Native asset/package and memory costs are measured during device validation; browser-only results must be labelled as such. Performance targets are set from MP-00 measurements and should include cold selection and cached selection separately.

## Finding from the first modular proof

MP-00 assembled independently generated transparent parts and proved the compositing interaction, but the cross-combination sheets do not pass production visual acceptance. The glossy finish differs from the softer illustrated cast, face-to-body scale and tone vary, and long hair can end bluntly at the shoulders. A larger set of independently prompted heads and bodies would multiply those defects. The next art pass must use one common authored template or controlled offline character rig, with hair endpoints and neck/outfit joins painted against every supported fit. Keep the original art prompts or source construction files and document commercial-use provenance. Review that corrected art before expanding the free or premium catalog; see mp-00/README.md for visual and measured evidence.
