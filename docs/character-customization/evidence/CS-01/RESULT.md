# CS-01 result — independent portrait eyewear pilot

**Status: technical static-art proof prepared; awaiting user visual acceptance.** CS-00 candidate 01 remains accepted and unchanged. The six static compositions, new candidate-03 portrait sources, layers, fit records, hashes, and review exports are isolated outside `public/`; there is no runtime compositor, catalog, store, or profile integration in this ticket.

## Review evidence

- [Six base and eyewear comparisons](../../cs-01/evidence/six-fits-base-vs-composed.png)
- [Six full-square composed portraits](../../cs-01/evidence/six-composed-portraits.png)
- [Candidate-03 main beside the Nova in-game reference, both at 256px](../../cs-01/evidence/candidate-03-main-vs-nova-reference-256.png)
- [Candidate-03 grey beside the Ali grey-lux in-game reference, both at 256px](../../cs-01/evidence/candidate-03-grey-vs-ali-reference-256.png)
- [Full-resolution temple, hair, ear and frame review](../../cs-01/evidence/full-resolution-temple-hair-review.png)
- [Hair/ear restoration masks on each portrait](../../cs-01/evidence/six-hair-ear-occlusion-masks.png)
- Circular crops at [32px](../../cs-01/evidence/crops/circular-32px-six-fits.png), [48px](../../cs-01/evidence/crops/circular-48px-six-fits.png), [64px](../../cs-01/evidence/crops/circular-64px-six-fits.png), and [72px](../../cs-01/evidence/crops/circular-72px-six-fits.png)
- [Foreground alpha on dark, light and saturated backgrounds](../../cs-01/evidence/six-foregrounds-dark-light-saturated.png)
- [Separate proposed free profile-frame container preview](../../cs-01/evidence/free-profile-frame-container-preview.png)
- [Exact six-fit records](../../cs-01/fit-records.json)
- [Source prompts, generated-output IDs and lineage](../../cs-01/prompts.md)
- [Dimension, byte, hash, alpha and pixel-audit ledger](../../cs-01/evidence/export-report.json)

## What was prepared

One original, brand-free rounded-square brass eyewear source is reused across candidate 01 and candidate 03. The shared geometry has explicit person/state transforms: candidate 01 and candidate 03 require different scale/center fits, and each sad state has its own vertical fit. Main/grey transforms are shared only within the same person's matching eye alignment; all six state-level records and masks remain separate.

Manual fitting effort: one vector design was authored, then calibrated separately to the two identities. Main/grey share each identity's aligned fit; both sad states received their own vertical offsets. One full-resolution review found and corrected brow overlap by shortening the lens height. The work produced six state records and six masks; minute-by-minute labor was not separately timed.

Candidate 03 now has an original main portrait foreground, a grey presentation using the exact same foreground, and a restrained sad portrait. After a matched-size review against the Nova avatar, the main backing was tuned so broken gold streaks and sparks remain discernible at 256px, especially along the side and lower perimeter, on a near-black field. The SVG keeps the accents intentionally sparse; it approximates placement and contrast rather than reproducing the reference's more intricate, layered gold texture. Sad uses the same revised main backing. The grey backing keeps the portrait in natural color over soft grey with darker outer tones, following the inspected Ali grey-lux reference. Candidate 03's original hazy full-body image was used only as an identity/trait reference; its haze is not reused. This remains a portrait pilot, not a completed character pack.

Candidate 01's three accepted CS-00 WebP files are the exact static composition bases. The visible composition adds only the eyewear layer. Export pixel audits found zero changed pixels outside that layer at 256px and 1254px. The separate transparent foreground/background resources preserve the accepted source RGB; their layer round-trip differs by at most one channel value at antialiased edge pixels because of raster compositing rounding, with no changes outside those edge pixels. The proposed free profile frame is a separate container layer; its preview changes zero pixels inside the portrait window.

## Validation

- The export script decodes all six bases and compositions, checks 256×256 and 1254×1254 exports, verifies six unique fit records across main/grey/sad for both identities, records alpha counts and hashes, and checks that composition pixels outside the eyewear layer remain unchanged.
- The full-resolution review identified an initial brow overlap; the vector lens height was shortened and all six fits were exported and visually reviewed again. Brows are clear, eyes remain visible, bridges are centered, and the hair/ear mask placements were inspected at source resolution.
- Candidate-03 foregrounds were inspected composited on dark, light/grey and saturated backgrounds. Candidate-01 accepted source files were not edited.
- After root review, only the candidate-03 main gold-particle SVG was brightened/strengthened around the visible side and lower perimeter. The exported 256px comparison places candidate-03 main beside Nova at the same displayed size; the new streaks/sparks are visible at that size. Candidate-03 grey backing and all eyewear geometry were unchanged.
- The free-frame preview passed a zero-difference pixel check inside the portrait.
- The retained deterministic exporter is [`export_pilot.mjs`](../../cs-01/export_pilot.mjs); source tool prompts and IDs are retained in [`prompts.md`](../../cs-01/prompts.md). Image generation itself is nondeterministic. The returned image tool did not expose a model/version identifier.
- The exporter reran successfully after the gold-background refinement and now reports 84 ledger entries, including both in-game style references and their matched-size comparisons. The candidate-03 grey comparison is style-only; no in-game face was used as a generation identity reference. `node --check` passed. Local links resolved in 11 Markdown documents, and focused Prettier checks passed on all 11 after formatting the two touched planning documents. The JSON manifests parsed successfully. Sharp rendered the SVG sources during export.
- The six 256×256 composed PNGs total **685,783 bytes**; all per-file bytes and hashes, including the retained 1254×1254 masters and evidence boards, are in [`export-report.json`](../../cs-01/evidence/export-report.json).
- This is an art-only change. No package files or runtime code were changed, so `npm run check:pr` and the dependency audit were not run. Commercial-release terms/rights and accidental-mark review are not established by this static proof.

The artwork and source/fit contract stop at the user visual-acceptance gate. Candidate 03's later full pack and all runtime/catalog work remain outside CS-01.
