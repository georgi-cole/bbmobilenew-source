import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
const [id, pose] = process.argv.slice(2)
if (!/^[a-z][a-z0-9-]*$/.test(id) || !/^[a-z-]+$/.test(pose)) throw new Error('Invalid job name')
const base =
    (process.argv.includes('--player') ? 'player_characters' : 'ai_characters') + '/_production',
  job = JSON.parse(await fs.readFile(path.join(base, 'jobs', id + '--' + pose + '.json'), 'utf8'))
const source = job.sourceHint.split(' as ')[1].split(' by default')[0]
await fs.mkdir(path.join(base, 'thumbnails'), { recursive: true })
await sharp(source)
  .resize({ width: 360, height: 540, fit: 'inside' })
  .webp({ quality: 86, alphaQuality: 95 })
  .toFile(path.join(base, 'thumbnails', id + '--' + pose + '.webp'))
