import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import sharp from 'sharp'
const isPlayer = process.argv.includes('--player'),
  identityCount = isPlayer ? 27 : 28,
  root = process.cwd(),
  base = path.join(root, isPlayer ? 'player_characters' : 'ai_characters'),
  sharedBase = path.join(root, 'ai_characters/shared')
const hash = (b) => crypto.createHash('sha256').update(b).digest('hex')
const catalog = JSON.parse(await fs.readFile(path.join(base, 'catalog.json'), 'utf8'))
const expected = {
  front: [420, 630],
  'decision-back': [420, 630],
  'exit-back': [384, 576],
  'royal-standing': [480, 720],
  'royal-seated': [600, 900],
  'safety-knight': [480, 720],
}
const errors = [],
  summary = {
    characters: catalog.characters.length,
    poses: 0,
    ceremonyBytes: 0,
    maxPoseBytes: 0,
    humanFiles: 0,
    missing: [],
  }
if (
  catalog.characters.length !== identityCount ||
  new Set(catalog.characters.map((c) => c.id)).size !== identityCount
)
  errors.push(
    'Expected ' + identityCount + ' unique ' + (isPlayer ? 'player' : 'AI') + ' identities'
  )
for (const entry of catalog.characters) {
  const dir = path.join(base, entry.folder),
    pack = JSON.parse(await fs.readFile(path.join(dir, 'pack.json'), 'utf8'))
  let packBytes = 0
  for (const [role, item] of Object.entries(pack.legacy)) {
    const b = await fs.readFile(path.join(dir, item.file))
    if (hash(b) !== item.sha256) errors.push(entry.id + ' legacy hash ' + role)
    const original = await fs.readFile(path.join(root, item.source))
    if (hash(original) !== item.sourceSha256) errors.push(entry.id + ' original changed ' + role)
  }
  for (const [pose, dims] of Object.entries(expected)) {
    const item = pack.ceremony[pose]
    if (!item) {
      summary.missing.push(entry.id + ':' + pose)
      continue
    }
    const b = await fs.readFile(path.join(dir, item.file)),
      m = await sharp(b).metadata()
    if (m.format !== 'webp' || !m.hasAlpha || m.width !== dims[0] || m.height !== dims[1])
      errors.push(entry.id + ' invalid format/size/alpha ' + pose)
    if (hash(b) !== item.sha256) errors.push(entry.id + ' output hash ' + pose)
    const raw = await sharp(b).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    let transparent = 0,
      filled = 0
    for (let p = 3; p < raw.data.length; p += 4) {
      if (raw.data[p] === 0) transparent++
      if (raw.data[p] > 245) filled++
    }
    if (transparent < dims[0] * dims[1] * 0.12 || filled < dims[0] * dims[1] * 0.06)
      errors.push(entry.id + ' invalid alpha coverage ' + pose)
    if (b.length > 180 * 1024) errors.push(entry.id + ' exceeds180KiB ' + pose)
    summary.poses++
    summary.ceremonyBytes += b.length
    packBytes += b.length
    summary.maxPoseBytes = Math.max(summary.maxPoseBytes, b.length)
  }
  if (packBytes > 720 * 1024) errors.push(entry.id + ' six-pose pack exceeds720KiB')
}
const before = JSON.parse(
  await fs.readFile(path.join(base, '_production/human-packs-before.json'), 'utf8')
)
for (const [file, sha] of Object.entries(before)) {
  if (hash(await fs.readFile(path.join(root, file))) !== sha)
    errors.push('Human pack changed ' + file)
  summary.humanFiles++
}
const shared = JSON.parse(await fs.readFile(path.join(sharedBase, 'manifest.json'), 'utf8'))
summary.sharedAssets = 0
summary.sharedBytes = 0
for (const [file, item] of Object.entries(shared)) {
  const b = await fs.readFile(path.join(sharedBase, file)),
    m = await sharp(b).metadata()
  if (
    m.format !== 'webp' ||
    m.width !== item.width ||
    m.height !== item.height ||
    hash(b) !== item.sha256
  )
    errors.push('Shared asset metadata mismatch ' + file)
  summary.sharedAssets++
  summary.sharedBytes += b.length
}
summary.expectedPoses = identityCount * 6
summary.complete = summary.poses === summary.expectedPoses
summary.errors = errors
await fs.writeFile(
  path.join(base, '_production/validation.json'),
  JSON.stringify(summary, null, 2) + '\n'
)
console.log(JSON.stringify(summary, null, 2))
if (errors.length || (!summary.complete && !process.argv.includes('--allow-incomplete')))
  process.exitCode = 1
