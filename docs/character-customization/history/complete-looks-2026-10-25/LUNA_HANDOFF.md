# Luna character looks handoff

> Archived planning snapshot. Superseded by the [active Character Store plan](../../README.md) and CS tickets. Statements below describe the earlier scope; do not execute their CL instructions.

Use Luna with extra-high reasoning for future implementation. The user selected complete-look image bundles and started CL-00. The preliminary MPFB source/render test failed its visual style gate; it is historical evidence, not the active production route. Work in the existing repository checkout and preserve unrelated modifications.

## Current handoff state

CL-00's four-look image-bundle proof has passed technical asset checks and is waiting for the user's visual acceptance. Keep CL-01 and all game integration closed until that acceptance. Keep all candidates isolated from shipped assets, and do not build a chooser, production catalog, or payment flow in this ticket.

## Decisions already made

- Existing cast images set rendering and framing only. Do not supply Nova, Ash, Bea, Sol, Rune, or any current player's face/body as a generation reference or recreate their identity/signature look.
- Characters are authored offline as complete image bundles. Gameplay receives ordinary complete WebP images. No new client-side 3D editor, raster body-part compositor, cloud avatar subscription, or selfie generation service is in scope.
- A free identity has a default complete look. A paid look may include hair, makeup, garments, and accessories as one approved image. It preserves the person's face/body identity.
- The launch target is 24 free identities plus a 24-look premium collection, conditional on the proof and reviewed production batches. The primary audience is 16–29: target 16–18 of 24 launch identities to read as adults 18–29, while the rest represent adults 30+. Do not generate any minors or the full library in CL-00.
- An equipped human look remains visible in casual and formal scenes. Existing AI casual/formal selection is preserved.
- Photo/emoji portrait preference is separate from the selected full-body character. Existing user photos are not silently replaced or processed.
- First profile decorations are frames and surrounding profile-card backdrops. A backdrop cannot replace the background baked into a flattened portrait.
- Individual hair/clothing/body sliders are not implemented or advertised. Exact personal likeness is not promised.

## First ticket deliverables

Use docs/character-customization/look-pilot for frozen full-resolution masters, exact prompts/lineage, four complete figures, matching portraits/thumbnails, reference comparisons, scene placement evidence, deterministic export notes, provenance/rights notes, and measured production effort/bytes. Do not place candidates in public or the runtime catalog. Existing CP-02 art is legacy technical content and does not substitute for this proof.

CL-00 must report two separate states: technical checks and visual acceptance. Successful image decoding does not imply that the art is acceptable. The user must accept the images before integration proceeds. If a character artist or fitted source asset is needed, describe the exact missing deliverable and retain useful evidence without calling the proof complete.

## Implementation cautions for later tickets

- Human players share the ID user. Capture profile ID and use the known profile-owned new-season/resume boundaries; never infer ownership from the player ID.
- Some consumers project away appearance metadata. Audit direct candidate arrays and participant builders as well as shared image components.
- Keep published art revisions resolvable. Preserve CP-01/CP-02 IDs as compatibility content; use a new identity/look namespace.
- Current image policy is body 768 by 1152, portrait 256 square, thumbnail 128 square, with an 8 MiB catalog cap. The new 16 MiB combined launch proposal is a future CL-01 change supported by measured pilot evidence; it has not been applied to code.
- Existing native purchase code is useful, but payment prerequisites and verification must be evaluated in CL-11. Do not assume a local owned flag or timestamp verifies a purchase.
- Use the repository's required check:pr and dependency audit gates when applicable. Run relevant feature tests separately. Never claim physical-device or payment-sandbox validation based on browser emulation or mocks.

## Required report

Give the ticket ID, actual outcome, changed files, evidence paths, checks with pass/fail results, visual acceptance status, relevant content/byte measurements, and any named prerequisite. Identify the next eligible ticket without starting it. Preserve the one-ticket review boundary throughout the backlog.
