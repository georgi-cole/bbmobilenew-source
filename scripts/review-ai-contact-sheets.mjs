import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
const base = process.argv.includes('--player') ? 'player_characters' : 'ai_characters',
  catalog = JSON.parse(await fs.readFile(path.join(base, 'catalog.json'), 'utf8'))
const selected = process.argv.slice(2).filter((arg) => arg !== '--player'),
  entries = selected.length
    ? catalog.characters.filter((c) => selected.includes(c.id))
    : catalog.characters
const roles = [
  'main',
  'front',
  'decision-back',
  'exit-back',
  'royal-standing',
  'royal-seated',
  'safety-knight',
]
await fs.mkdir(path.join(base, '_production/reviews'), { recursive: true })
for (let group = 0; group < entries.length; group += 4) {
  const batch = entries.slice(group, group + 4),
    layers = []
  for (let row = 0; row < batch.length; row++) {
    const c = batch[row],
      pack = JSON.parse(await fs.readFile(path.join(base, c.folder, 'pack.json'), 'utf8'))
    const heading = Buffer.from(
      `<svg width="1260" height="28"><text x="12" y="21" font-size="18" font-family="Arial" fill="#e4d6ae">${c.name}</text></svg>`
    )
    layers.push({ input: heading, left: 0, top: row * 330 })
    for (let col = 0; col < roles.length; col++) {
      const role = roles[col],
        item = role === 'main' ? pack.legacy.main : pack.ceremony[role]
      if (!item) continue
      let img = sharp(path.join(base, c.folder, item.file))
      if (role === 'royal-seated')
        img = sharp(
          await sharp('ai_characters/shared/throne.webp')
            .composite([{ input: await img.toBuffer(), left: 0, top: 0 }])
            .toBuffer()
        )
      layers.push({
        input: await img
          .resize(180, 270, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .toBuffer(),
        left: col * 180,
        top: row * 330 + 28,
      })
      layers.push({
        input: Buffer.from(
          `<svg width="180" height="28"><text x="6" y="19" font-size="12" font-family="Arial" fill="#c7bdd6">${role}</text></svg>`
        ),
        left: col * 180,
        top: row * 330 + 298,
      })
    }
  }
  const out = path.join(
    base,
    '_production/reviews',
    'poses-' +
      (selected.length ? batch.map((c) => c.id).join('-') : String(group / 4 + 1)) +
      '.webp'
  )
  await sharp({
    create: { width: 1260, height: batch.length * 330, channels: 4, background: '#282131' },
  })
    .composite(layers)
    .webp({ quality: 88 })
    .toFile(out)
  console.log(out)
}
