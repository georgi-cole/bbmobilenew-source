# Optional VIP cinematic pack

## First pass

This pass defines and exports the optional media, verifies complete local installations,
and routes ceremony images through one local media library. Normal builds still bundle
all current artwork and retain their existing playback. No download prompt, remote
hosting, persistent storage adapter or smaller store build is enabled yet.

The initial pack contains 404 images totalling 21,471,796 bytes. Eight shared finale
images remain bundled under `assets/ceremonies`; the policy lists them explicitly.
Music, sound effects, credits video, credits posters, character selection, ordinary
portraits and gameplay code stay bundled. Removing a directory by its name would
incorrectly remove shared finale artwork.

## Export and compatibility

```sh
node scripts/export-vip-cinematic-pack.mjs --write-manifest
node scripts/export-vip-cinematic-pack.mjs --check
node scripts/export-vip-cinematic-pack.mjs
```

Regenerate the checked-in manifest when artwork or character metadata changes.
Production Vite builds reject a stale manifest. Export writes a new ignored directory
at `renders/vip-cinematics/<revision>/`, containing `manifest.json` and `files/assets/...`.
It copies the original image bytes and verifies the copies; it does not re-encode them.
Existing export directories are never overwritten. Uploading or hosting is a later pass.

The manifest records every image path, encoded size and SHA-256. Its revision covers
the image inventory, semantic character catalog and renderer contract version. Bump
`rendererVersion` in the policy for incompatible changes to movement or synchronization
that do not otherwise change the catalog or images. Old app versions must retain access
to their matching hosted pack; replacing a URL with incompatible content is unsafe.

## Exit walking frames

The new eight-frame walks are being authored separately. No placeholder frames or
new choreography are introduced here. All image files beneath each ceremony character
directory are discovered recursively, including additional poses and nested walking
frames, rather than assuming that each character always has exactly six images.
Regenerate the pack manifest after merging the real artwork and its catalog metadata.

Frame order, duration, movement, feet alignment and sound synchronization belong to
the app's character catalog and renderer. Keep the complete eight-frame sequence in
the pack. Verify the entire pack before activating any of it; decode only the departing
character's frames (both partners for paired exits) before starting the scene. A missing
frame or decode failure must use the existing Standard path before a movie starts.
Do not fetch individual frames or change a scene's media source during playback.

## Local installations and offline behavior

`vipCinematicMediaLibrary.activate` accepts an adapter for an already downloaded
installation. It reads local files sequentially, checks each size and SHA-256 against
the app's pinned manifest, requires local file/content URIs, and activates the installation
only after every file passes. No network requests are used to verify or resolve it.
Cancelled, incomplete, corrupt or incompatible attempts preserve the previous source.
Scene preparation captures one source so later activation does not retime a running
ceremony. Only manifest-listed optional media can override bundled URLs.

The native download/storage adapter is still to be implemented. It must use persistent
private app storage (not a purgeable browser cache), exclude downloadable media from
device backups, stage new versions without deleting the active version, and reverify
local files on startup before activation. Retain old files while a scene uses them.
Purchases, save games and animation preferences are independent of pack installation.
Deleting a pack must never remove a VIP entitlement or reset a season.

## Next passes

1. Add native downloads, persistent installation records, progress, cancellation/retry
   and space checks. Host immutable compatible pack versions. Keep Standard available
   offline throughout; keep downloaded cinematics local and usable without contacting
   billing or hosting at every scene.
2. After VIP purchase or restore, offer Download and enable or Keep Standard. Remember
   a decline. Settings can request the same download later, switch installed styles
   immediately or remove the pack. Activate changes at the next ceremony boundary.
3. Only after those paths are verified, exclude manifest-listed media from mobile
   builds. Gate every premium entry (including final decisions and competition
   broadcasts) on local readiness, preserving the original outcome callbacks. Compare
   offline audio, credits, Skip, reduced motion, paired exits, interrupted installs,
   updates and saved seasons on Android and iPhone, then measure actual store sizes.

## Possible online-only option

Defer this option until the persistent offline pack is reliable. Online-only still
transfers the media and uses temporary memory or disk; it saves retained storage,
not bandwidth. Repeat visits may redownload files and a working connection does not
guarantee that a scene will be ready in time.

If added, make it an explicit third choice: Standard, Cinematic (download for offline),
and Cinematic (online when ready). Prefetch a complete scene's media before it is
needed, with user consent for network use and a bounded preparation deadline.
Use Standard immediately if any required image is unavailable or preparation times
out. Never start a partial walk, buffer mid-exit or fetch replacement code. Temporary
online media must not be recorded as an offline installation. Keep installed offline
packs working independently of connectivity. Existing installations and preferences
must not be silently converted to online-only.

## Focused validation

```sh
node --test scripts/vip-cinematic-pack.test.mjs
npx vitest run tests/unit/vipCinematicPack.test.ts
node scripts/export-vip-cinematic-pack.mjs --check
```

The download and native storage flows require later device verification. Resolver
tests demonstrate local-only loading and all-or-nothing verification; they do not
claim that an unimplemented native downloader has been exercised on a phone.
