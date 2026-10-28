# Minigame and skin delivery optimizations

The main store keeps lightweight idle states for fourteen minigames. Their
reducers and larger question banks load with the selected game. The public state
shape, action types, current idle defaults, and selectors remain compatible.

Three embedded question banks are versioned JSON files. Their content and order
are unchanged. Main-game minigame screens and Quick Tap's selected presentation
load on demand. The host prepares the selected code before the countdown and
offers a retry when preparation fails.

Four backgrounds use same-dimension WebP files, reducing their combined size from
7,946,027 to 500,962 bytes. Twin Adventures shares identical portrait assets and
waits for its runtime and essential images before revealing the frame. Original
artwork is retained outside public delivery.

Fit Me In resolves ordinary-round AI in cooperative batches and cancels pending
work on exit. Hold the Wall and Tilted Ledge publish elapsed-time display updates
less frequently while retaining their precise scoring clocks. Quick Tap and
Vault Cracker limit canvas backing resolution without changing logical geometry
or hit areas. On high-density screens, their canvas details may look slightly
softer. The retired Lane Racers implementation remains removed.

The skin collection uses lossless compression with the same image URLs and
dimensions. The measured delivery directory fell from 243.18 MB to 166.86 MB,
saving 76,319,178 bytes (31.4%). Fifty-five SVG wrappers use lossless WebP
bitmap payloads; sixty-two PNGs were recompressed with identical RGBA pixels.
Existing JPEG and WebP files are unchanged.

All visible source pixels and alpha values match. WebKit rendered comparisons
were identical. Chromium showed at most one 8-bit channel step of compositing
rounding on light and dark backgrounds, with unchanged alpha. No skin resolution
was reduced. Theme selection, fallback order, layout, access, and controls remain
unchanged. Skin savings concern delivery size; decoded image memory and frame-rate
improvements have not been measured.

The skin source archive includes exact original hashes and restoration mappings
in `src/assets/source-originals/skins/archive-manifest.json`. Those originals are
not imported by the app or copied into release output.
