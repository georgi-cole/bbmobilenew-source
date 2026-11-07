import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import sharp from 'sharp'
const root = process.cwd(),
  base = path.join(root, process.argv.includes('--player') ? 'player_characters' : 'ai_characters'),
  jobsDir = path.join(base, '_production', 'jobs')
const hash = (b) => crypto.createHash('sha256').update(b).digest('hex')
const targets = {
  front: [420, 630],
  'decision-back': [420, 630],
  'exit-back': [384, 576],
  'royal-standing': [480, 720],
  'royal-seated': [600, 900],
  'safety-knight': [480, 720],
}
const jobs = (await fs.readdir(jobsDir)).filter((x) => x.endsWith('.json'))
for (const file of jobs) {
  const job = JSON.parse(await fs.readFile(path.join(jobsDir, file), 'utf8'))
  if (!job.sourceHint) continue
  const source = job.sourceHint.match(/ as (.*?) by default/s)?.[1]
  if (!source) throw new Error('Missing generated source ' + file)
  const pose = job.pose.replace(/^ceremony-/, ''),
    dims = targets[pose]
  if (!dims) throw new Error('Unknown pose ' + pose)
  const sourceBuf = await fs.readFile(source),
    sha = hash(sourceBuf)
  const catalog = JSON.parse(await fs.readFile(path.join(base, 'catalog.json'), 'utf8')),
    entry = catalog.characters.find((x) => x.id === job.character)
  if (!entry) throw new Error('Unknown character ' + job.character)
  const packPath = path.join(base, entry.folder, 'pack.json'),
    pack = JSON.parse(await fs.readFile(packPath, 'utf8'))
  pack.ceremony ??= {}
  if (pack.ceremony[pose]?.sourceSha256 === sha) continue
  const raw = await sharp(sourceBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    { width: w, height: h, channels: c } = raw.info
  let x0 = w,
    y0 = h,
    x1 = 0,
    y1 = 0,
    count = 0,
    opaque = 0
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const a = raw.data[(y * w + x) * c + 3]
      if (a > 8) {
        x0 = Math.min(x0, x)
        x1 = Math.max(x1, x)
        y0 = Math.min(y0, y)
        y1 = Math.max(y1, y)
        count++
        if (a > 245) opaque++
      }
    }
  if (count < 10000 || count > w * h * 0.85 || opaque / count < 0.8)
    throw new Error('Bad alpha/cutout ' + file)
  x0 = Math.max(0, x0 - 3)
  y0 = Math.max(0, y0 - 3)
  x1 = Math.min(w - 1, x1 + 3)
  y1 = Math.min(h - 1, y1 + 3)
  const [tw, th] = dims,
    cw = x1 - x0 + 1,
    ch = y1 - y0 + 1,
    scale = Math.min((tw * (pose === 'royal-seated' ? 0.98 : 0.94)) / cw, (th * 0.9) / ch),
    rw = Math.round(cw * scale),
    rh = Math.round(ch * scale),
    left = Math.round((tw - rw) / 2),
    top = Math.round(th * 0.95 - rh)
  const normalized = await sharp(sourceBuf)
    .extract({ left: x0, top: y0, width: cw, height: ch })
    .resize(rw, rh)
    .toBuffer()
  let name = 'ceremony-' + pose + '.webp'
  for (let revision = 2; ; revision++) {
    try {
      await fs.access(path.join(base, entry.folder, name))
      name = 'ceremony-' + pose + '-r' + revision + '.webp'
    } catch {
      break
    }
  }
  const output = path.join(base, entry.folder, name)
  await sharp({
    create: { width: tw, height: th, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: normalized, left, top }])
    .webp({ quality: 86, alphaQuality: 95, effort: 5 })
    .toFile(output)
  const bytes = await fs.readFile(output),
    meta = await sharp(bytes).metadata()
  pack.ceremony[pose] = {
    file: name,
    width: meta.width,
    height: meta.height,
    bytes: bytes.length,
    sha256: hash(bytes),
    source,
    sourceSha256: sha,
    sourceJob: path.posix.join('_production/jobs', file),
    trueAlpha: true,
    feet: [0.5, 0.95],
    sourceBounds: { left: x0, top: y0, width: cw, height: ch },
    contentBounds: { left, top, width: rw, height: rh },
    clippingReview:
      x0 === 0 || x1 === w - 1 || y0 === 0 || y1 === h - 1
        ? 'Inspect boundary contact'
        : 'Clear margins',
    status: 'generated-draft-for-visual-review',
  }
  pack.status =
    Object.keys(pack.ceremony).length === 6
      ? 'six-ceremony-poses-generated'
      : 'authoring-in-progress'
  await fs.writeFile(packPath, JSON.stringify(pack, null, 2) + '\n')
  console.log(entry.name, pose, bytes.length)
}
