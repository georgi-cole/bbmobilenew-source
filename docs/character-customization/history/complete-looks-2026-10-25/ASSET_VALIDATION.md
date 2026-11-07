# Character preset asset validation

> Archived planning snapshot. Superseded by the [active Character Store plan](../../README.md) and CS tickets. Statements below describe the earlier scope; do not execute their CL instructions.

This describes the existing CP-01 validator and CP-02 compatibility catalog. The active complete-look design is [ARCHITECTURE.md](ARCHITECTURE.md); CL-01 in [BACKLOG.md](BACKLOG.md) will extend it. No validator or budget code changed in this planning revision.

Run `npm run validate:characters` from the repository root. Release and mobile build commands run this validation before TypeScript compilation and bundling. Focused fixtures run with `npm run test:character-catalog` and are also included in `npm run test:pr-core`.

`src/appearance/characterCatalog.data.json` is the existing preset catalog source. It contains four CP-02 presets, each with body, portrait, and thumbnail images. Technical validation of those files does not grant acceptance under the new cast-matching art brief. The new chooser must explicitly admit only accepted content rather than automatically exposing these legacy entries. Set `selectable` to `false` to retain a released revision for existing saves while hiding it from new selections when implementing the new catalog contract. Unpublished candidates belong outside shipped catalogs and `public/assets/characters/`.

Each revision uses three explicit WebP files under `public/assets/characters/<preset-id>/r<revision>/`: `thumbnail.webp`, `portrait.webp`, and `body.webp`. Catalog references are relative to Vite's public root, for example `assets/characters/preset-001/r1/body.webp`; the client resolves the configured web or Capacitor base path separately. No image glob or eager asset import is used.

The shared policy in `src/appearance/characterAssetPolicy.json` fixes output dimensions and per-file byte caps from the art brief and sets an 8 MiB total shipped catalog budget. The validator checks stable IDs and revisions, selectable revision uniqueness, required descriptive traits, exact safe paths, file containment (including symlinks), file presence, WebP metadata and dimensions, a full image decode, body transparency, per-file caps, and the combined byte budget. A false `selectable` flag does not remove the image from the payload budget because the revision remains renderable.

The validator uses the development-only `sharp` package. It cannot establish face/body identity, crop quality, pose consistency, or scene fit; those still require the visual review recorded for each accepted batch. An empty catalog passes while content is pending and reports zero shipped assets.

The current 8 MiB policy remains unchanged. The replacement plan proposes a 16 MiB combined ceiling for legacy/new character assets and initial decorations, with the same individual image ceilings. CL-01 must support the policy with measured CL-00 exports and account for all unique packaged files and retained revisions. Until then, existing commands continue enforcing the current preset policy.
