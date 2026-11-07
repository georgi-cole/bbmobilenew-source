import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import sharp from 'sharp'
const root = process.cwd(),
  base = path.join(root, 'ai_characters')
const sourceFolders = {
  main: 'public/assets/skins',
  grey: 'public/assets/skins/backup-grey-lux',
  sad: 'public/assets/skins',
  casual: 'public/assets/Informal_attires',
  formal: 'public/assets/formal_attires',
  paparazzi: 'public/assets/tabloid_photos',
}
const files = Object.fromEntries(
  await Promise.all(
    Object.entries(sourceFolders).map(async ([role, dir]) => [
      role,
      (await fs.readdir(dir)).map((file) => path.posix.join(dir, file)),
    ])
  )
)
const manifest = await fs.readFile('src/data/avatarAssetManifest.ts', 'utf8')
const names = [
  ...manifest
    .split('export const AVATAR_ASSET_FILES = [')[1]
    .split('] as const')[0]
    .matchAll(/'([^']+)_avatar\.webp'/g),
]
  .map((m) => m[1])
  .filter((x) => !['Ali_lia', 'Lia_flip'].includes(x))
const roleStem = (name, role) =>
  role === 'main' || role === 'grey'
    ? name + '_avatar'
    : role === 'sad'
      ? name + '_sad_avatar'
      : role === 'casual'
        ? name + '_informal'
        : role === 'formal'
          ? name + '_formal'
          : name + '_tabloid'
const sha = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex')
await fs.mkdir(base, { recursive: true })
const humanBefore = {}
for (const dir of await fs.readdir('player_characters', { withFileTypes: true })) {
  if (!dir.isDirectory() || !/^character \d+$/.test(dir.name)) continue
  for (const role of ['main', 'grey', 'sad', 'casual', 'formal', 'paparazzi']) {
    const full = path.join('player_characters', dir.name, role + '.webp')
    humanBefore[full.replaceAll('\\', '/')] = sha(await fs.readFile(full))
  }
}
const humanSnapshot = path.join(base, '_production', 'human-packs-before.json')
await fs.mkdir(path.dirname(humanSnapshot), { recursive: true })
try {
  await fs.access(humanSnapshot)
} catch {
  await fs.writeFile(humanSnapshot, JSON.stringify(humanBefore, null, 2) + '\n')
}
const catalog = {
  schemaVersion: 1,
  purpose: 'AI character authoring packs; existing runtime URLs remain unchanged',
  generatedAt: new Date().toISOString(),
  characters: [],
  sharedProps: 'shared/',
  poseFiles: [
    'ceremony-front.webp',
    'ceremony-decision-back.webp',
    'ceremony-exit-back.webp',
    'ceremony-royal-standing.webp',
    'ceremony-royal-seated.webp',
    'ceremony-safety-knight.webp',
  ],
}
for (const sourceName of names) {
  const name = sourceName[0].toUpperCase() + sourceName.slice(1),
    id = sourceName.toLowerCase(),
    dir = path.join(base, 'character ' + name)
  await fs.mkdir(dir, { recursive: true })
  const packFile = path.join(dir, 'pack.json')
  let prior = {}
  try {
    prior = JSON.parse(await fs.readFile(packFile, 'utf8'))
  } catch {}
  const pack = {
    ...prior,
    id,
    displayName: name,
    folder: 'character ' + name,
    status: prior.status || 'authoring-in-progress',
    legacy: {},
    ceremony: prior.ceremony || {},
    missingLegacyRoles: [],
    aliases: id === 'lia' ? ['lia_flip'] : [],
    variants: prior.variants || {},
  }
  for (const role of Object.keys(sourceFolders)) {
    const stem = roleStem(sourceName, role).toLowerCase()
    const matches = files[role]
      .filter((f) => {
        let basename = path
          .basename(f)
          .replace(/\.[^.]+$/, '')
          .toLowerCase()
        if (id === 'kian' && role === 'casual' && basename === 'kian_informal2')
          basename = 'kian_informal'
        return basename === stem
      })
      .sort((a, b) => (a.endsWith('.webp') ? -1 : 0) - (b.endsWith('.webp') ? -1 : 0))
    if (!matches.length) {
      pack.missingLegacyRoles.push(role)
      continue
    }
    const source = matches[0],
      original = await fs.readFile(source),
      target = path.join(dir, role + '.webp')
    let meta
    try {
      meta = await sharp(original).metadata()
    } catch (error) {
      pack.missingLegacyRoles.push(role)
      pack.sourceIssues ??= []
      if (!pack.sourceIssues.some((x) => x.source === source))
        pack.sourceIssues.push({
          role,
          source,
          problem: 'Existing source cannot be decoded as its declared format',
          detail: error.message,
        })
      continue
    }
    if (meta.format === 'webp') await fs.copyFile(source, target)
    else
      await sharp(original, { limitInputPixels: 100000000 })
        .webp({ lossless: true, effort: 5 })
        .toFile(target)
    const out = await fs.readFile(target),
      m = await sharp(out).metadata()
    pack.legacy[role] = {
      file: role + '.webp',
      source: source.replaceAll('\\', '/'),
      sourceSha256: sha(original),
      sha256: sha(out),
      bytes: out.length,
      width: m.width,
      height: m.height,
      alpha: m.hasAlpha === true,
      delivery: 'Existing artwork; no identity regeneration',
    }
  }
  const loveFiles = (await fs.readdir('public/assets/skins/cupid-love')).filter(
    (f) =>
      f.toLowerCase() === sourceName.toLowerCase() + '_avatar_love.png' ||
      f.toLowerCase() === sourceName.toLowerCase() + '_avatar_love.webp'
  )
  if (loveFiles.length) {
    const source = 'public/assets/skins/cupid-love/' + loveFiles[0],
      target = path.join(dir, 'love.webp')
    await sharp(source).webp({ lossless: true, effort: 5 }).toFile(target)
    pack.variants.love = { file: 'love.webp', source }
  }
  await fs.writeFile(packFile, JSON.stringify(pack, null, 2) + '\n')
  catalog.characters.push({
    id,
    name,
    folder: 'character ' + name,
    manifest: 'character ' + name + '/pack.json',
    legacyRoles: Object.keys(pack.legacy),
    missingLegacyRoles: pack.missingLegacyRoles,
  })
}
await fs.mkdir(path.join(base, 'shared'), { recursive: true })
const pairSource = 'public/assets/skins/Ali_lia_avatar.webp',
  pairGrey = 'public/assets/skins/backup-grey-lux/Ali_lia_avatar.webp'
await fs.mkdir(path.join(base, 'variants', 'twins-together'), { recursive: true })
await fs.copyFile(pairSource, path.join(base, 'variants', 'twins-together', 'main.webp'))
await fs.copyFile(pairGrey, path.join(base, 'variants', 'twins-together', 'grey.webp'))
await fs.writeFile(path.join(base, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n')
console.log(
  JSON.stringify(
    {
      characters: catalog.characters.length,
      missing: catalog.characters.filter((x) => x.missingLegacyRoles.length),
      humanPacks: Object.keys(humanBefore).length,
    },
    null,
    2
  )
)
