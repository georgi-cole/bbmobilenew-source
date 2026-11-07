import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import sharp from 'sharp'
const base = 'player_characters',
  production = path.join(base, '_production'),
  hash = (b) => crypto.createHash('sha256').update(b).digest('hex')
await fs.mkdir(production, { recursive: true })
await fs.mkdir(path.join(production, 'jobs'), { recursive: true })
const folders = (await fs.readdir(base, { withFileTypes: true }))
  .filter((e) => e.isDirectory() && /^character \d+$/.test(e.name))
  .map((e) => e.name)
  .sort((a, b) => Number(a.split(' ')[1]) - Number(b.split(' ')[1]))
if (folders.length !== 27) throw Error('Expected27 existing player character folders')
const catalog = {
    schemaVersion: 1,
    purpose: 'Player character authoring packs; existing gameplay art unchanged',
    collection: 'player',
    displayTitle: 'Player ceremony characters',
    defaultCharacterId: 'character-1',
    sharedProps: '../ai_characters/shared/',
    characters: [],
    poseFiles: [
      'ceremony-front.webp',
      'ceremony-decision-back.webp',
      'ceremony-exit-back.webp',
      'ceremony-royal-standing.webp',
      'ceremony-royal-seated.webp',
      'ceremony-safety-knight.webp',
    ],
  },
  snapshot = {}
for (const folder of folders) {
  const n = Number(folder.split(' ')[1]),
    id = 'character-' + n,
    file = path.join(base, folder, 'pack.json')
  let prior = {}
  try {
    prior = JSON.parse(await fs.readFile(file, 'utf8'))
  } catch {}
  const pack = {
    ...prior,
    id,
    displayName: 'Character ' + n,
    folder,
    status: prior.status || 'authoring-in-progress',
    legacy: {},
    ceremony: prior.ceremony || {},
    missingLegacyRoles: [],
    variants: prior.variants || {},
  }
  for (const role of ['main', 'grey', 'sad', 'casual', 'formal', 'paparazzi']) {
    const source = path.posix.join(base, folder, role + '.webp'),
      b = await fs.readFile(source),
      m = await sharp(b).metadata(),
      sha = hash(b)
    snapshot[source] = sha
    pack.legacy[role] = {
      file: role + '.webp',
      source,
      sourceSha256: sha,
      sha256: sha,
      bytes: b.length,
      width: m.width,
      height: m.height,
      alpha: !!m.hasAlpha,
      delivery: 'Original player artwork preserved unchanged',
    }
  }
  await fs.writeFile(file, JSON.stringify(pack, null, 2) + '\n')
  catalog.characters.push({
    id,
    name: pack.displayName,
    folder,
    manifest: folder + '/pack.json',
    legacyRoles: Object.keys(pack.legacy),
    missingLegacyRoles: [],
  })
}
const snap = path.join(production, 'human-packs-before.json')
try {
  await fs.access(snap)
} catch {
  await fs.writeFile(snap, JSON.stringify(snapshot, null, 2) + '\n')
}
await fs.writeFile(path.join(base, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n')
console.log(
  'Prepared ' +
    folders.length +
    ' player packs; ' +
    Object.keys(snapshot).length +
    ' original files recorded.'
)
