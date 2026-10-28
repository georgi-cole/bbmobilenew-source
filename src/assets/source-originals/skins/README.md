# Original skin artwork

These files preserve the original artwork before the 28 October 2026 delivery
optimization. They are outside `public` and are not imported by the application,
so Vite does not copy them into web or mobile releases.

`archive-manifest.json` maps each optimized public skin file to its original
file here, with its original byte size and SHA-256 hash. Identical originals
share one archive file. To restore an original, copy its `archiveFile` to the
same `file` path under `public/assets/skins/`.

The public files keep their existing URLs and dimensions. SVG wrappers retain
their markup and use a lossless WebP bitmap instead of an embedded PNG. Visible
RGB values and alpha match the originals; unused RGB values behind fully
transparent pixels may be cleared. Recompressed PNGs preserve every decoded
RGBA value. Existing JPEG and WebP assets are unchanged.

Keep this source archive outside public asset globs and delivery manifests.
