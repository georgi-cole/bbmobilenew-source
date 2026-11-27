import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const catalog = JSON.parse(
  await readFile(path.join(root, 'src/content/contentCatalog.json'), 'utf8')
)
const legacyFiles = [
  'live-config.json',
  'weather-config.json',
  'weather-bank.json',
  'credits.json',
  'afterTheEyeOutcomes.json',
]

const outputs = new Map()
const entries = {}
for (const [id, { source, extension, maxBytes }] of Object.entries(catalog)) {
  const data = await readFile(path.join(root, source))
  if (data.length === 0 || data.length > maxBytes) {
    throw new Error(`${source} has ${data.length} bytes. The limit is ${maxBytes}.`)
  }
  if (extension === 'json') JSON.parse(data.toString('utf8'))
  if (extension === 'mp4' && data.toString('ascii', 4, 8) !== 'ftyp') {
    throw new Error(`${source} must contain MP4 video.`)
  }
  const revision = createHash('sha256').update(data).digest('hex')
  entries[id] = { revision, bytes: data.length }
  outputs.set(`content/${id}/${revision}.${extension}`, data)
}
for (const name of legacyFiles) {
  const data = await readFile(path.join(root, 'public/config', name))
  JSON.parse(data.toString('utf8'))
  outputs.set(`config/${name}`, data)
}
outputs.set('content/manifest.json', `${JSON.stringify({ schemaVersion: 1, entries }, null, 2)}\n`)

const target = process.argv[2]
if (target && target !== '--check') {
  const directory = path.resolve(target)
  for (const [relative, data] of outputs) {
    const destination = path.join(directory, relative)
    await mkdir(path.dirname(destination), { recursive: true })
    await writeFile(destination, data)
  }
}
console.log(
  `Prepared ${Object.keys(entries).length} content revisions and ${legacyFiles.length} stable URLs.`
)
