import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import crypto from 'node:crypto'
const lab = process.argv[2] || process.env.CEREMONY_LAB_DIR,
  base = 'ai_characters/shared'
if (!lab) throw new Error('Pass the approved ceremony lab directory as the first argument')
await fs.mkdir(base, { recursive: true })
const files = {
  'crown.webp': 'assets/crown-refined.webp',
  'shield.webp': 'assets/cinema-v2/shield.webp',
  'throne.webp': 'assets/cinema-v2/throne.webp',
  'hub-chamber.webp': 'assets/cinema-v2/hall.webp',
  'royal-room.webp': 'assets/cinema-v2/royalRoom.webp',
  'door-leaf.webp': 'assets/cinema-v2/portal.webp',
  'sanctuary.webp': 'assets/cinema-v4/sanctuary.webp',
  'danger-chamber.webp': 'assets/cinema-v4/danger.webp',
  'power-console.webp': 'assets/cinema-v2/console.webp',
  'shock-chamber.webp': 'assets/cinema-v2/shockRoom.webp',
  'atmosphere.webp': 'assets/cinema-v2/atmosphere.webp',
  'decision-token.webp': 'assets/cinema-v2/token.webp',
  'hub-city.webp': 'assets/cinema-v2/city.webp',
  'safety-shield-reveal.webp': 'assets/ceremonies/safety-shield.webp',
  'danger-platform.webp': 'assets/ceremonies/danger-platform.webp',
  'exit-doorframe.webp': 'assets/ceremonies/exit-doorframe.webp',
  'tiebreak-scales.webp': 'assets/ceremonies/tiebreak-scales.webp',
  'shock-eye-seal.webp': 'assets/ceremonies/shock-eye-seal.webp',
  'curtain.webp': 'assets/curtain.webp',
}
const manifest = {}
for (const [target, source] of Object.entries(files)) {
  await fs.copyFile(path.join(lab, source), path.join(base, target))
  const m = await sharp(path.join(base, target)).metadata()
  manifest[target] = {
    source: path.join(lab, source),
    bytes: (await fs.stat(path.join(base, target))).size,
    width: m.width,
    height: m.height,
    sha256: crypto
      .createHash('sha256')
      .update(await fs.readFile(path.join(base, target)))
      .digest('hex'),
    mode: 'reused-approved-prototype-artwork',
  }
}
await fs.writeFile(path.join(base, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
const provenanceDir = 'ai_characters/_production/shared-provenance'
await fs.mkdir(provenanceDir, { recursive: true })
for (const file of ['asset-provenance.json', 'cinema-artwork.json', 'ceremony-artwork.json'])
  await fs.copyFile(path.join(lab, file), path.join(provenanceDir, file))
await fs.mkdir('ai_characters/_production/reviews', { recursive: true })
await sharp('ai_characters/shared/throne.webp')
  .composite([
    { input: 'ai_characters/character Aria/ceremony-royal-seated.webp', left: 0, top: 0 },
  ])
  .png()
  .toFile('ai_characters/_production/reviews/aria-throne-fit.png')
