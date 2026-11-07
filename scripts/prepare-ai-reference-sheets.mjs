import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
const base = process.argv.includes('--player') ? 'player_characters' : 'ai_characters',
  catalog = JSON.parse(await fs.readFile(base + '/catalog.json', 'utf8')),
  out = base + '/_production/reference-sheets'
await fs.mkdir(out, { recursive: true })
const roster = []
for (const c of catalog.characters) {
  const pack = JSON.parse(await fs.readFile(base + '/' + c.manifest, 'utf8'))
  roster.push({
    id: c.id,
    name: c.name,
    portrait: path.resolve(base, c.folder, pack.legacy.main.file),
    body: pack.legacy.casual
      ? path.resolve(base, c.folder, pack.legacy.casual.file)
      : pack.legacy.formal
        ? path.resolve(base, c.folder, pack.legacy.formal.file)
        : null,
    bodyRole: pack.legacy.casual
      ? 'casual'
      : pack.legacy.formal
        ? 'formal-proportions-only'
        : 'portrait-only',
  })
}
await fs.writeFile(base + '/_production/roster.json', JSON.stringify(roster, null, 2) + '\n')
const remaining = roster.filter((c) => !['aria', 'ash', 'bea'].includes(c.id))
for (let page = 0; page < Math.ceil(remaining.length / 4); page++) {
  const batch = remaining.slice(page * 4, page * 4 + 4),
    layers = []
  for (let i = 0; i < batch.length; i++) {
    const c = batch[i],
      x = i * 400
    layers.push({
      input: Buffer.from(
        '<svg width="400" height="800"><text x="200" y="28" fill="white" text-anchor="middle" font-family="Arial" font-size="22">' +
          c.name +
          '</text><text x="200" y="226" fill="#bfb2c9" text-anchor="middle" font-family="Arial" font-size="12">' +
          c.bodyRole +
          '</text></svg>'
      ),
      left: x,
      top: 0,
    })
    layers.push({
      input: await sharp(c.portrait).resize(174, 174, { fit: 'contain' }).png().toBuffer(),
      left: x + 113,
      top: 40,
    })
    if (c.body)
      layers.push({
        input: await sharp(c.body)
          .resize(340, 540, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toBuffer(),
        left: x + 30,
        top: 245,
      })
  }
  await sharp({
    create: { width: batch.length * 400, height: 800, channels: 3, background: '#26212e' },
  })
    .composite(layers)
    .png()
    .toFile(out + '/references-' + (page + 1) + '.png')
}
console.log('Reference sheets', Math.ceil(remaining.length / 4))
