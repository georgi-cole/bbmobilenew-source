import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import sharp from 'sharp'
const base = 'ai_characters'
async function copy(source, folder, name) {
  await fs.mkdir(folder, { recursive: true })
  const target = path.join(folder, name + '.webp'),
    input = await fs.readFile(source),
    meta = await sharp(input).metadata()
  if (meta.format === 'webp') await fs.copyFile(source, target)
  else await sharp(input).webp({ lossless: true, effort: 5 }).toFile(target)
  const b = await fs.readFile(target),
    m = await sharp(b).metadata()
  return {
    file: path.relative(folder, target).replaceAll('\\', '/'),
    source,
    sha256: crypto.createHash('sha256').update(b).digest('hex'),
    width: m.width,
    height: m.height,
    bytes: b.length,
  }
}
const variants = {
  Lia: {
    'flip-main': 'public/assets/skins/Lia_flip_avatar.webp',
    'flip-grey': 'public/assets/skins/backup-grey-lux/Lia_flip_avatar.webp',
    'flip-sad': 'public/assets/skins/Lia_flip_sad_avatar.webp',
    'flip-love': 'public/assets/skins/cupid-love/Lia_flip_avatar_love.png',
  },
  Bella: {
    'black-and-white': 'public/assets/skins/backup-grey-lux/Bella_avatar_black_and_white.webp',
  },
}
for (const [name, items] of Object.entries(variants)) {
  const dir = path.join(base, 'character ' + name),
    file = path.join(dir, 'pack.json'),
    pack = JSON.parse(await fs.readFile(file, 'utf8'))
  pack.variants ??= {}
  for (const [key, source] of Object.entries(items))
    pack.variants[key] = await copy(source, dir, key)
  await fs.writeFile(file, JSON.stringify(pack, null, 2) + '\n')
}
const twinDir = path.join(base, 'variants/twins-together'),
  twins = {}
for (const [name, source] of Object.entries({
  main: 'public/assets/skins/Ali_lia_avatar.webp',
  grey: 'public/assets/skins/backup-grey-lux/Ali_lia_avatar.webp',
  sad: 'public/assets/skins/Ali_lia_sad_avatar.webp',
  love: 'public/assets/skins/cupid-love/Ali_lia_avatar_love.png',
  'main-small': 'public/assets/skins/Ali_lia_avatar_512.webp',
  'grey-alternate': 'public/assets/skins/Ali_lia_avatar_grey.webp',
}))
  twins[name] = await copy(source, twinDir, name)
await fs.writeFile(
  path.join(twinDir, 'manifest.json'),
  JSON.stringify(
    {
      purpose: 'Legacy combined twins artwork; Ali and Lia remain separate character packs',
      assets: twins,
    },
    null,
    2
  ) + '\n'
)
const paxFile = path.join(base, 'character Pax/pack.json'),
  pax = JSON.parse(await fs.readFile(paxFile, 'utf8'))
pax.sourceIssues ??= []
if (!pax.sourceIssues.some((x) => x.problem.includes('different head')))
  pax.sourceIssues.push({
    role: 'casual',
    source: pax.legacy.casual.source,
    problem:
      'Legacy casual figure has a different head from the authoritative roster portrait. New ceremony poses follow the portrait.',
  })
await fs.writeFile(paxFile, JSON.stringify(pax, null, 2) + '\n')
console.log(
  'Organized Lia flip, Bella monochrome and combined-twin variants; recorded Pax source mismatch.'
)
