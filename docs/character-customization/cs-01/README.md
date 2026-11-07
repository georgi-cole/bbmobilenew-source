# CS-01 independent portrait eyewear pilot

**Status: technical static art package prepared; awaiting user visual acceptance.** Candidate 01's accepted CS-00 art is unchanged. This pilot remains under `docs/character-customization/cs-01/` and `docs/character-customization/evidence/CS-01/`; nothing was written to `public/` or connected to runtime code.

## Review set

- [Six base/composition comparisons](evidence/six-fits-base-vs-composed.png)
- [Six composed portraits](evidence/six-composed-portraits.png)
- [Candidate-03 main beside Nova at matched 256px](evidence/candidate-03-main-vs-nova-reference-256.png)
- [Candidate-03 grey beside Ali grey-lux at matched 256px](evidence/candidate-03-grey-vs-ali-reference-256.png)
- [1254px temple, braid, ear and frame review](evidence/full-resolution-temple-hair-review.png)
- [Hair/ear restoration mask placements](evidence/six-hair-ear-occlusion-masks.png)
- Circular crops for [32px](evidence/crops/circular-32px-six-fits.png), [48px](evidence/crops/circular-48px-six-fits.png), [64px](evidence/crops/circular-64px-six-fits.png), and [72px](evidence/crops/circular-72px-six-fits.png)
- [Foreground alpha on dark, light and saturated colors](evidence/six-foregrounds-dark-light-saturated.png)
- [Proposed free profile-frame container sample](evidence/free-profile-frame-container-preview.png)

See [`fit-records.json`](fit-records.json) for all six revisions and transforms, [`sources/`](sources/) for retained inputs and vector sources, and [`evidence/export-report.json`](evidence/export-report.json) for hashes, dimensions, alpha counts, bytes, repeatable-export settings, and pixel audits. The image-generation prompts and output IDs are in [`prompts.md`](prompts.md). Candidate 03's identity notes are in [`sources/candidate-03/identity-sheet.md`](sources/candidate-03/identity-sheet.md).

## Fit summary

One shared, original, brand-free vector design (`soft-arc-brass-r1.svg`) has six explicit transforms. Candidate 01 and candidate 03 use different face scales/centers. Their sad states have separately reviewed vertical fits. Main/grey share a transform only where the complete-person foreground and eye alignment are the same. Each state still has its own record and restoration mask.

| Character    | State | Center (x,y) | Scale | Rotation | Review                                                           |
| ------------ | ----- | -----------: | ----: | -------: | ---------------------------------------------------------------- |
| Candidate 01 | Main  |  137.8, 92.4 |  0.84 |    −1.2° | Eyes visible; braid overlap restored                             |
| Candidate 01 | Grey  |  137.8, 92.4 |  0.84 |    −1.2° | Eyes visible; braid overlap restored                             |
| Candidate 01 | Sad   |  137.4, 94.1 |  0.83 |    −1.4° | Respectful expression retained; braid overlap restored           |
| Candidate 03 | Main  |  127.6, 82.2 |  0.91 |     0.4° | Eyes visible; temple/side hair clear                             |
| Candidate 03 | Grey  |  127.6, 82.2 |  0.91 |     0.4° | Natural-color portrait; dark grey edge treatment                 |
| Candidate 03 | Sad   |  127.4, 83.8 |  0.90 |     0.2° | Respectful expression retained; fit lowered for brow/eye spacing |

The transforms use a 96×26 design viewBox on a 256×256 portrait canvas. All values are recorded exactly in `fit-records.json`.

## Layer and source notes

- Candidate 01 composition bases are the decoded, unchanged CS-00 `main.webp`, `grey.webp`, and `sad.webp`. The exported image adds only the SVG eyewear layer; pixel audits found zero changed pixels outside that layer at both 256px and 1254px.
- Candidate 01 foreground/background resources use the RGB pixels from the accepted CS-00 master. A separate image-generation cutout was used only for its alpha matte; its RGB was discarded. Layer reconstruction differs by at most one channel value at antialiased edge pixels due to raster compositing rounding, with no differences outside those edge pixels.
- Candidate 03's selected main foreground is shared exactly by main and grey. The original candidate-03 full-body source was used only to preserve identity traits; its unaccepted haze was not reused. After a matched 256px review against Nova, the main backing was tuned to keep sparse gold sparks and broken streaks discernible around the near-black outer perimeter, especially along the sides and lower edge. It approximates reference placement and contrast without claiming the same layered gold texture. Grey has a soft grey center and visibly darker outer tones. Sad reuses the main treatment.
- [The proposed free outer-profile frame](sources/eyewear/free-profile-frame-r1.svg) is a separate container layer. The preview's portrait window has zero changed portrait pixels.
- This is an art/render proof, not a runtime compositor, store asset, or accepted catalog item. Candidate 03 is not a completed six-role pack.

## Re-export

From the repository root, run:

```bash
node docs/character-customization/cs-01/export_pilot.mjs
```

The script uses the retained source inputs, authored SVG layers, recorded six-fit table and installed Sharp/libvips versions. Image-generation calls themselves remain nondeterministic; the export from the frozen selected sources is deterministic.
