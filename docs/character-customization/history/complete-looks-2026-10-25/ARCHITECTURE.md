# Character looks architecture

> Archived planning snapshot. Superseded by the [active Character Store plan](../../README.md) and CS tickets. Statements below describe the earlier scope; do not execute their CL instructions.

Revision: 25 October 2026. The user has started CL-00, an offline complete-image art proof. No runtime feature integration is part of this ticket. Read [LUNA_HANDOFF.md](LUNA_HANDOFF.md) first and execute [BACKLOG.md](BACKLOG.md) one ticket at a time.

The product gives players a free character identity, a choice of complete looks for that identity, and optional profile cosmetics. Characters must visually belong beside the existing Big Eye cast. A reusable offline character source produces finished images; the game displays ordinary images. The first release offers approximate resemblance through curated choices. It does not promise player-controlled face sculpting or independent hair, makeup, and clothing combinations.

The rejected MP-00 experiment remains abandoned. Its implementation is not a starting point. Its old planning documents are preserved under [history/modular-2026-10-25](history/modular-2026-10-25/ARCHITECTURE.md). CP-00 provides useful integration findings; CP-01 provides reusable image validation. CP-02 images remain legacy technical content, subject to the new visual standard before any appearance in the new selector.

## Product and content scope

The proposed launch target is 24 free adult identities, one free everyday look per identity, one paid collection containing a distinct complete look for each of those identities, and a small set of profile frames and profile-card backdrops. The primary audience is 16–29, so aim for roughly two thirds of the selectable identities (about 16–18 of 24) to read as adults aged 18–29, with the rest representing adults 30 and older. Every depicted character remains clearly adult; the game is not creating child avatars. This is 48 body renders, each with a matching portrait and thumbnail: 144 character delivery images. Production happens in reviewed batches, not a single bulk generation run.

The first proof is only two identities with two looks each. It must prove character consistency, cast style, repeatable production, and scene fit. The user reviews it before further tickets begin. If the source cannot produce acceptable artwork, do not build the feature around failed art; report the exact artist or source-asset requirement.

A character is a saved identity. A look is a complete depiction of that identity with authored hair, clothing, makeup, and accessories. Changing a look preserves facial structure, age appearance, skin tone, and body identity. Ordinary hair changes may be part of the paid look. Changing those foundational identity traits means choosing another character in this release.

Free choice must make the closest-match starting point useful: cover a broad range of skin tones, hair textures, builds, facial features, and adult ages, with most launch identities focused on 18–29 and meaningful adult representation beyond 29. Do not make a core identity or demographic range premium-only. Filters help people find the closest option; they do not modify the image or infer demographic information from photos. Appearance never changes gameplay sex, age, fitness, personality, biography, or stats. Uploaded photos remain optional portraits. There is no selfie processing service or photo-to-body conversion in this release.

The store sells complete looks and clearly scoped profile decoration. Independent hairstyles, makeup controls, body sliders, arbitrary recolouring, an in-game 3D editor, live image generation, and hosted avatar subscriptions are deferred. Internal authoring sliders may be used to create new characters; that does not make those controls available to players.

## Existing game compatibility

The codebase uses React, TypeScript, Redux Toolkit, Vite, and Capacitor. Profiles use localStorage; uploaded images use IndexedDB. Existing AI portraits are in public/assets/skins and full figures are in public/assets/Informal_attires and public/assets/formal_attires. Respect this exact path casing on case-sensitive hosts.

The existing cast, especially the inspected Nova and Ash portrait/casual/formal sets, defines the rendering, lighting, crop, and framing standard. [ART_BRIEF.md](ART_BRIEF.md) records the references, measured dimensions, framing, and acceptance criteria. Existing cast members are style/framing references only: never recreate Nova, Ash, Bea, Sol, Rune, or another current character as a selectable player identity, and do not feed their faces to image generation as identity references. New identities need distinct faces, hair/outfit signatures, and names. Do not replace or recolour the AI cast to accommodate a new style.

Existing AI players continue using their casual/formal resolution rules. An explicitly equipped human look uses its own body image in both casual and formal scenes. The scene request does not silently select a different outfit. A premium evening look can be worn throughout the game; a free everyday look also remains usable throughout. Automatic event wardrobes would require another product decision and more renders.

For a human without the new appearance field, preserve the existing photo/emoji/body fallback behavior. For a human with a selected character, separate portrait preference from full-body appearance. A rectangular uploaded photo must not override that selected body. Explicit human appearance outranks AI name matching, including a player named Nova or Ash. Scope new look resolution to the human presentation contract; unrelated AI overrides remain intact.

## Offline artwork workflow

Use complete-look image bundles for the first release because the current runtime already displays static body cutouts and portraits. Author each full-body look and its matching portrait offline. A second outfit is a new complete image of the same identity, not a runtime composite of hair, head, body, clothing, or masks. Generate two genuinely new identities for CL-00; describe the desired rendering style in words, but do not use an existing cast member as an identity input or recreate their signature combination.

Retain the accepted full-resolution master images, exact prompts, source filenames, generation/edit lineage, tool/date details available, output hashes, and repeatable deterministic export steps. Image generation is nondeterministic, so re-export from the frozen accepted masters; do not rerender a character and call that a reproducible export. A later revision must be reviewed as new art. Record rights/provenance and check for unintended marks or third-party material before commercial release; output ownership alone does not establish exclusivity or clear rights in every visible element.

Keep source images, prompts, drafts, comparison sheets, and rejected work outside public. Use docs/character-customization/look-pilot for the CL-00 proof. New source files must be retained in the workspace or recoverable from a documented source; a temporary local path alone is insufficient.

Produce each figure as one complete image. No independent generated head/body/hair assembly, skin masks, runtime body stretching, or raster anatomy sliders. Create each portrait from that same new identity and look, with the cast's dark black-and-gold treatment. Use a dedicated portrait image when a body crop lacks enough face detail. Never use an existing player's face or body to create a new identity.

## Catalog and ownership model

Introduce a separate versioned look catalog while retaining the CP-01 preset catalog as a compatibility source. Do not silently reinterpret its fields or renumber preset-001 through preset-004. New IDs use a distinct namespace such as character-001 and look-001-everyday. The new selector initially exposes only artwork accepted under this plan. If legacy presets are later admitted, use an explicit mapping with preserved art revisions.

| Record             | Responsibility                                                                                                                |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| CharacterIdentity  | Stable ID, display label, descriptive filter traits, default free look ID, selectable status                                  |
| CharacterLook      | Stable ID and art revision, character ID, complete body/portrait/thumbnail assets, display label, selectable status           |
| CosmeticItem       | Stable item ID, kind such as look/frame/profile-backdrop, supported surfaces, exact compatible content references             |
| CosmeticCollection | Explicit list of item grants and supported character IDs for one released collection revision                                 |
| StoreOffer         | Product or earned-currency offer, exact collection/item grant set, platform availability; price belongs to the offer/provider |
| Ownership          | Free access derived from the catalog, permanent profile-local earned grants, or reconciled native-store ownership             |
| ProfileAppearance  | Small versioned selection: character ID, look ID/revision, portrait preference, optional frame/backdrop IDs                   |
| AppearanceSnapshot | Compact presentation selection carried by a player/save/archive; it is not proof of ownership                                 |

The initial appearance schema should identify this as the complete-look system, for example schemaVersion 2. Resolve IDs through a typed catalog. Validate character/look compatibility, one free default per selectable identity, safe paths, unique revisions, collection completeness, supported surfaces, and required assets before bundling.

A collection grants its explicitly listed looks. It can support all 24 launch characters without charging again when the player changes identity. Do not imply that a purchased collection automatically covers future characters. Adding characters to a collection requires their actual artwork and an explicit collection revision. Partial future collections must state which characters they support before payment.

Switching identity selects the corresponding owned look in the current collection when available; otherwise it selects that identity's free default and explains the change. Previewing never consumes currency or writes ownership. Unknown IDs never imply ownership. Removed or unreadable artwork falls back to an accepted bundled default while retaining the original selection for recovery. Keep released art revisions resolvable for existing saves.

## Portraits and profile decoration

Portrait preference is either character or existing photo/emoji. Preserve existing photo IDs and avatar values when selecting a character. If a chosen photo is unavailable, fall back to the selected character portrait without erasing the photo reference. Keep Player.avatar usable by portrait-only consumers; appearance remains the full-body source of truth. Avoid persisting base-dependent URLs or temporary blob URLs as the authoritative look.

Initial character portraits are flattened square images with a black-and-gold background. A profile backdrop decorates the surrounding profile card or Dressing Room scene; it cannot replace the background inside that flattened portrait. Do not advertise it as an avatar-background replacement. A future transparent portrait foreground would be a separate content/export contract.

Frames must preserve existing selected/evicted/status rings, VIP indicators, names, contrast, focus outlines, and click targets. R1 frame/backdrop support is Profile and Dressing Room, where it can be demonstrated. Other surfaces are enabled only by explicit coverage in CL-09. List supported surfaces in the item and store UI. Do not imply a profile backdrop changes the Tribunal or other gameplay stages.

## Presentation integration

Add a central typed presentation resolver in src/appearance that accepts the explicit player appearance and requested surface. Keep existing AI resolution in src/utils/avatar.ts as its compatibility path. Memoization of small catalog lookups is sufficient; no bitmap compositor or generated-image cache is needed.

Update FullSizeCutoutImage to consider the appearance revision in its identity/reset behavior and to resolve explicit body images before the uploaded-photo branch. Preserve safe fallback on decode failure and stale asynchronous photo loads. Audit the separate portrait components and every direct candidate-array builder from IMPLEMENTATION_NOTES.md.

Some handoffs reconstruct players as only id/name/avatar or id/name/sex. Carry appearance where a body is needed. Portrait-only minigames can receive a resolved compatible portrait without importing the whole wardrobe. Test the human named after an AI cast member, remote AI override behavior, photo plus selected body, missing image, and rapid look changes.

## Profile and season lifecycle

The profile owns the player's preference. The Apply request captures an explicit profile ID, revalidates ownership and compatibility, and reports durable persistence success before claiming the change was saved. The current saveProfilesState helper swallows write errors; add a narrow observable result at the persistence boundary. A failed save leaves the draft open and the prior applied selection intact.

Player.id is commonly user across local profiles. It cannot identify the owner of a live run. CP-00 established that ownership is known at SavedSeasonSnapshot.profileId and the HomeHub resume/new-season boundary. Use those boundaries to copy the profile's selection into the correct run. Unless a reliable profile-owned runtime session is established and tested, save appearance for the next safe resume and say so. Do not update an active cinematic actor midway through its scene.

Profile switching cancels the old draft. A pending purchase may update durable store ownership, but must not apply a look to whichever profile happens to be active when the callback arrives. Purchases and equip actions are separate operations.

Persist the compact appearance snapshot through save compaction/hydration. New seasons use the selected profile's look; restarting never clears permanent cosmetics. Both GameOver and eliminatedSeasonResolutionMiddleware capture appearance for new completed archives. Older archives remain valid. Archive presentation is the historical snapshot; current ownership changes must not rewrite that historical event or grant live access to its outfit. Live resumed play revalidates current access at a safe boundary.

## Commerce strategy

Reuse existing Store components and native purchase infrastructure where appropriate. src/vip/vipPurchaseService.ts already queries products, purchases non-consumables, restores, and derives ownership from native transactions. Its verifiedAt field is a timestamp, not evidence of a separate backend verification service. CL-11 must inspect the current native plugin guarantees, platform behavior, and release configuration before extending this flow.

Free looks require no purchase. Earned cosmetics use a permanent profile-local grant plus one atomic Eyeolean debit, guarded against repeat clicks and replayed transactions. Do not reuse season-limited power inventory or its reset counters for cosmetics.

The initial real-money product is a non-consumable collection, available to local profiles under the restoring platform store account. It does not promise cross-platform ownership, a new cloud login, or cloud profile sync. Reconcile from current store entitlement results; a serialized appearance ID or a locally toggled owned flag cannot create a new paid grant. Keep developer preview access distinct from paid ownership.

CL-11 specifies any necessary verification additions, durable reconciliation, offline cache policy, and account-change handling. It creates separately scoped prerequisite tickets when implementation is needed before paid checkout. Do not assume an elaborate new backend is needed, or assume native callbacks alone satisfy all release requirements. Evaluate the existing system first.

Use provider-localized prices and explicit supported-content previews. Pending, cancelled, failed, unacknowledged, refunded, or revoked purchases have defined outcomes. Network failure is not proof of revocation; retain last reconciled access under the chosen offline policy and retry. A confirmed revocation affects live equipment at a safe boundary with a free fallback. Restoration must recover access after reinstall under the supported store account. If release prerequisites are missing, ship the free selector/earned path only and keep real checkout unavailable.

## Performance and delivery budget

Gameplay continues using the existing image components. No 3D scenes, Blender/MPFB runtime, cloud rendering, or character compositing are added to the client. Existing unrelated three.js dependencies do not justify adding a character renderer.

Keep the current dimensions and per-file ceilings: body 768 by 1152 WebP with alpha, at most 400 KiB; portrait 256 square, at most 40 KiB; thumbnail 128 square, at most 12 KiB. Masters may be larger. These delivery dimensions preserve the existing figures' 2:3 ratio. Framing must still pass the scene comparison.

The existing validator enforces an 8 MiB total catalog limit. This planning revision proposes a 16 MiB combined limit for legacy character assets, new character assets, and initial decorations. CL-01 may implement that explicit policy after the pilot provides measured exports. Do not change the limit in the planning task or silently relax it later.

For 48 look triplets, the individual maxima total 21.19 MiB, so every file cannot sit at its ceiling. Aim for an average triplet below 300 KiB; 48 such triplets total 14.06 MiB. The existing four triplets total 373,392 bytes (0.36 MiB), leaving room for up to 1 MiB of initial decorations within 16 MiB. Count retained revisions and every packaged file once. Preserve art quality; if the measured collection cannot fit, reduce the batch or propose a separate delivery ticket before adding it.

A decoded body at 768 by 1152 RGBA is about 3.38 MiB, irrespective of its compressed size. Load visible thumbnails and only the selected body, cancel obsolete work, and avoid retaining all selected bodies in a custom cache. Use the existing lazy-route pattern. Do not feed the wardrobe into the global preload helper, which retains link elements. Public files increase the native package even when routes are lazy.

Before release, compare the same scenes on the same device before/after: request counts, transferred bytes, image decode delays, memory after 20 look switches, gallery responsiveness, and existing stage transitions. Record browser emulation separately from physical-device results. Provisional target: a bundled selected image appears within 500 ms on the tested device and repeated switches produce no persistent memory growth or visible stage regression. Record device/browser/cache conditions; these are acceptance targets, not measured performance promises.

## Delivery sequence

CL-00 proves the art. CL-01 through CL-06 define the catalog, rendering, persistence, chooser, and lifecycle. CL-07 produces the starter library in small reviewed batches. CL-08 and CL-09 add ownership, earned purchases, and profile decoration. CL-10 produces one premium collection. CL-11 decides payment integration prerequisites; CL-12 implements the verified checkout/restore path after those prerequisites. CL-13 performs release validation.

Every ticket ends with its own report. Human visual acceptance of CL-00 is required before integration, and an agent must not equate file validation with aesthetic approval. The current CL-00 proof is technical-only until the user accepts its appearance.
