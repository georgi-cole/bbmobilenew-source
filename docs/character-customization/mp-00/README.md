# MP-00 modular character pilot

**Final disposition: Rejected and abandoned by the user after viewing the assembled combinations.** Retained solely as failed prototype evidence. These images must not be shipped or used as the basis for more avatar production.

**Status: functional proof built; visual feasibility remains open.** This is an isolated local viewer and repeatable compositor. It does not touch production profiles, the released static preset catalog, payments, billing, or persistent ownership.

## Contents and composition

`catalog.json` declares the 1024 × 1536 transparent 2:3 rig, anchors, draw order, compatible fits, parts, three approved skin stops, three natural hair stops, and two free starter recipes. The proof includes two face bases, two authored body steps, two full outfits fitted to both steps, four hair shapes/textures, a beard, glasses, and a locked braid try-on. Short waves are a front-only hair part; the other hairstyles split into non-overlapping upper/front and lower/back pixels along a shallow curved boundary. The compositor recolours both layers with the same selected hair stop and draws each pixel once. The curve removes the ruler-straight crop, but long straight hair still has a blunt shoulder-length silhouette and is not accepted as finished art.

`viewer/index.html` is a standalone preview. Body-size changes select authored fit artwork. The free Apply action only confirms a local demo draft; it does not save a profile. The braid can be previewed, but Apply rejects it and creates no billing event, grant, or ownership.

The retained 12 PNG masters are in `masters/`; `prepare_art.py` applies alpha cleanup, crops the faces at the jaw, builds the hair split and hand-authored exposed-skin bounds, then writes the optimized layers and masks under `assets/`. The skin masks use constrained anatomy regions intersected with a source-skin colour test. A former global HSV attempt tinted clothes and shoes; its failed overlays remain under `evidence/failed/`.

## Reproduce locally

From the repository root, serve this folder in one terminal:

```powershell
python -m http.server 4174 --directory docs/character-customization/mp-00
```

Open `http://127.0.0.1:4174/viewer/index.html` to use the viewer. In a second terminal, regenerate the browser exports and contacts:

```powershell
node docs/character-customization/mp-00/run_browser_evidence.mjs
python docs/character-customization/mp-00/make_evidence.py
python docs/character-customization/mp-00/validate_art.py
node --test docs/character-customization/mp-00/model.test.mjs
```

To rebuild the delivery layers from the retained masters, run `python docs/character-customization/mp-00/prepare_art.py` before the evidence commands. Playwright and Pillow are already available in the repository workspace; no package manifest was changed for this pilot. `MP00_BASE_URL` can override the evidence runner's default local server URL.

## Evidence and measured costs

`run_browser_evidence.mjs` exports eight cross-combinations, both starter body images and matching portraits, every skin and hair stop, and accessory fits. It also asserts that free Apply is allowed, locked Apply is rejected while the try-on remains visible, and the browser reports no console errors. The script captures desktop Chromium at 1280 × 900 and a narrow Android Chromium _emulation_ at 390 × 844 CSS pixels, DPR 2, touch enabled, and a 3× CDP CPU throttle. Latest run: desktop cold/warm composition 424.2/6.3 ms; mobile-emulated cold/warm 812/16.8 ms. A second run with the same cache measured 1052/20 ms on mobile; the earlier three-entry cache measured 959/994 ms. The four-entry raster cache retains every layer used by one recipe and removes the observed warm cache thrash. These are local browser samples, not an SLA or device result.

The earlier three-entry cache sample measured 959/994 ms cold/warm at 3× emulated CPU, with 24.3 MiB retained and a 66.3 MiB temporary bound. The four-entry cache measured 812–1052 ms cold and 17–20 ms warm across two runs, with 30.3 MiB retained and a 72.3 MiB temporary bound, excluding browser/GPU overhead. This confirms the previous warm thrash and its memory/performance trade-off. The cold cost and new memory bound are genuine concerns and keep production optimization/acceptance blocked. The warm result is cache-assisted and does not remove the cold cost. Delivery assets referenced by the pilot total 910,251 bytes across 26 files (24 raster assets and two SVG accessories); source masters total 21,016,218 bytes. Pilot code and catalog total 34,202 bytes. The two transparent starter body exports total 2,012,653 bytes and their matching portrait exports total 196,055 bytes. No physical phone, native app, installed-package growth, or native memory test was performed; mobile performance is unverified.

`validate_art.py` decodes the referenced raster parts and masks, checks dimensions and alpha, checks that front/back hair pixels do not overlap, verifies anatomy-mask coverage and clothing sample points, checks that three garment sample pixels do not change across skin stops, and confirms a visible face-value range remains after recolouring. The mask overlay and exported image contacts still require human visual review; automated samples cannot certify that every garment edge is clean.

## Review record and limitations

- `evidence/cross-combinations-dark.png` shows the sampled face/body/outfit/hair cross-product; light and saturated background sheets are also retained. `evidence/combinations/face-b-broad-lavender-straight.png` retains a clear full-body example of the blunt shoulder-hair end and body/head fit limitations.
- `evidence/skin-stops-full-body.png`, `evidence/portraits-72px-circle.png`, `evidence/portraits-256-pair.png`, `evidence/transparent-body-backgrounds.png`, and `evidence/skin-mask-review.png` show palette, portrait, transparency, and exposed-skin review evidence.
- `evidence/failed/` preserves the global-mask clothing spill and earlier flat-neck fits rather than hiding them.
- Face and body now share each approved stop's hue and saturation; source lightness variation remains at a reduced contrast to retain shading. The chest/neck mask reaches the open V, hands and forearms recolour together, and sampled garment pixels remain unchanged. The latest `evidence/combinations/skin-skin-deep.png` no longer shows the earlier rectangular neck edge or peach shoulder triangles. Visual review still sees small face/neck tone differences and fit/proportion mismatches across combinations. Those gates remain open.
- At the 72 px portrait contact size, both starters remain identifiable, while fine hair and facial details lose definition. At full-body stage scale, the straight shoulder style still ends bluntly across the shoulder region, face/body proportions vary, and a few independent-render pairings read as a pasted head or mismatched outfit. These are visible art-fit limitations, not accepted compatibility.
- Compared with `public/assets/Informal_attires/Nova_informal.png`, the generated parts are independently rendered, more photographic/glossy, and do not yet share the game's softly illustrated cast finish. The sampled matrix includes combinations with awkward head/body scale or outfit/face pairing; do not treat the mathematical cross-product as approved content.
- The source PNGs were generated with the image-generation tool during the pilot and have no prompt metadata. The original prompt text is not recoverable from the retained task record, so art-direction provenance is incomplete. Commercial usage/rights were not reviewed. This is a production-art release blocker; these files remain pilot material pending that review.
- Face crops and body fits are isolated from different source renders and need authored repainting/fitting before production. No photographic-grade art or device validation is claimed.

The MP-00 art gate remains open. Do not proceed to production integration or mark modular visual feasibility complete based on this pilot alone.
