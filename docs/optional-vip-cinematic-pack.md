# Optional VIP cinematic pack

## Implemented

The app exports optional media, downloads one immutable media file on Android and
iPhone, verifies complete local installations, and routes ceremony images through a
local media library. After VIP purchase/restore, players can download and enable
cinematics or keep Standard. Settings offers the same prompt later and can remove
the download. A declined offer is remembered on the device. Download failure never
changes VIP ownership or saved seasons. The online-only option is deferred.

Normal builds still bundle the current artwork while this delivery path is tested.
Removing optional images from the base app and measuring smaller store builds remains
a separate pass. Music, sounds, credits and shared finale artwork stay bundled.

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
node scripts/export-vip-cinematic-pack.mjs --download
```

Regenerate the checked-in manifest when artwork or character metadata changes.
Production Vite builds reject a stale manifest. Export writes a new ignored directory
at `renders/vip-cinematics/<revision>/`, containing `manifest.json` and `files/assets/...`.
It copies the original image bytes and verifies the copies; it does not re-encode them.
Existing export directories are never overwritten. `--download` exports to the separate
`renders/vip-cinematics-download/<revision>/` directory. Both exports include a
`vip-cinematics.pack` file: the original images concatenated in manifest order, with
no archive paths supplied by a server and no re-encoding. The pinned sizes define
file boundaries; native clients reject missing/extra bytes and verify every SHA-256.

The current pack is hosted as an immutable prerelease asset in the existing public
repository, at `releases/download/vip-cinematics-<revision>/vip-cinematics.pack`.
This resource prerelease is not an app store submission and is not marked latest.
Keep old revision assets available; never replace an asset in place. Prepare and
verify a new archive before publishing a future revision. Clients accept only the
expected HTTPS release URL for the app's pinned manifest. Downloads can be retried
if the host is unavailable; Standard play does not depend on the host.

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

The native adapter stores media in Android's `getNoBackupFilesDir()` and iOS
Application Support, excluded from backups. It checks free space before downloading,
stages and verifies files before making the revision available, and re-verifies local
files on cold start without network or billing requests. The TypeScript library checks
the native verification receipt against the complete pinned inventory before activation.
Inspection is asynchronous and does not delay standard gameplay. Interrupted staging
files are cleaned on the next inspection. Downloads are foreground operations: keep
the app open, and retry if the OS terminates an interrupted transfer; byte-level resume
is not promised. Cancelling leaves Standard available and does not activate partial files.
Settings refuses removal while a cinematic is active, preserving that scene's source.
Purchases, save games and animation preferences are independent of pack installation.
Deleting a pack must never remove a VIP entitlement or reset a season.

## Remaining pass

1. After delivery paths and the finished walking frames are verified, exclude manifest-listed media from mobile
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

Native download, cancellation and cold-start offline behavior require Android/iPhone
verification in addition to these focused tests. No physical iPhone verification is
implied by browser tests or a successful simulator compile.
