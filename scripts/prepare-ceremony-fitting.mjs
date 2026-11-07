import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

// Authoring metadata only. Original artwork and runtime manifests are untouched.
const output = 'ceremony_lab/cast.json'
const overridesPath = 'ceremony_lab/fitting-overrides.json'
const overrides = JSON.parse(await fs.readFile(overridesPath, 'utf8'))
const cast = []
for (const collection of ['ai_characters', 'player_characters']) {
  const catalog = JSON.parse(await fs.readFile(`${collection}/catalog.json`, 'utf8'))
  for (const item of catalog.characters) {
    const pack = JSON.parse(await fs.readFile(`${collection}/${item.manifest}`, 'utf8'))
    const base = `/${collection}/${encodeURIComponent(item.folder)}/`
    const poses = {}
    for (const [pose, asset] of Object.entries(pack.ceremony)) {
      const { data, info } = await sharp(path.join(collection, item.folder, asset.file))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })
      const { width: w, height: h, channels } = info
      const alpha = (x, y) => data[(y * w + x) * channels + 3]
      let top = h,
        bottom = 0
      for (let y = 0; y < h; y++) {
        let count = 0
        for (let x = 0; x < w; x++) if (alpha(x, y) > 100) count++
        if (count > 4) {
          top = Math.min(top, y)
          bottom = y
        }
      }
      // Measure the actual head silhouette near its top, not the full cape/hair.
      const bandY = Math.round(top + h * 0.025)
      let left = w,
        right = 0
      for (let y = bandY - 2; y <= bandY + 2; y++) {
        for (let x = Math.round(w * 0.25); x < w * 0.75; x++) {
          if (alpha(x, y) > 150) {
            left = Math.min(left, x)
            right = Math.max(right, x)
          }
        }
      }
      const crown = {
        x: Number(((left + right) / 2 / w).toFixed(5)),
        // The measuring row is below the hairline for a stable width, but the
        // gold band rests near the silhouette top rather than on the forehead.
        baseY: Number(((top + h * 0.016) / h).toFixed(5)),
        width: Number(Math.max(0.085, Math.min(0.27, ((right - left + 1) / w) * 0.94)).toFixed(5)),
        angle: 0,
        ...overrides[item.id]?.[pose]?.crown,
      }
      poses[pose] = {
        src: base + asset.file,
        width: w,
        height: h,
        bytes: asset.bytes,
        sha256: asset.sha256,
        crown,
        feetY: Number((bottom / h).toFixed(5)),
        // Shared throne uses the same 600×900 composition as the seated pack.
        ...(pose === 'royal-seated'
          ? { throne: { x: 0, y: 0, scale: 1, ...overrides[item.id]?.[pose]?.throne } }
          : {}),
      }
    }
    cast.push({
      id: item.id,
      name: item.name,
      collection,
      portrait: base + pack.legacy.main.file,
      grey: base + pack.legacy.grey.file,
      greySha256: pack.legacy.grey.sha256,
      greySourceSha256: pack.legacy.grey.sourceSha256,
      // Point the real native overlay at this character's existing Grey Lux file.
      poses,
    })
  }
}
await fs.mkdir('ceremony_lab', { recursive: true })
await fs.writeFile(output, JSON.stringify({ schemaVersion: 1, characters: cast }, null, 2) + '\n')
console.log(
  `Prepared fitting metadata for ${cast.length} characters / ${cast.reduce((n, c) => n + Object.keys(c.poses).length, 0)} poses`
)
