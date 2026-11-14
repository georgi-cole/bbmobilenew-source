import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  createVipCinematicPackManifest,
  exportVipCinematicPack,
  repositoryRoot,
  serializeVipCinematicPackManifest,
} from './lib/vip-cinematic-pack.mjs'

const args = process.argv.slice(2)
if (args.some((arg) => !['--check', '--write-manifest'].includes(arg)) || args.length > 1) {
  throw new Error(
    'Use no arguments to export, --write-manifest to regenerate, or --check to validate.'
  )
}
const manifest = await createVipCinematicPackManifest()
const manifestPath = path.join(repositoryRoot, 'src/cinematic/media/vipCinematicPackManifest.json')
const serialized = serializeVipCinematicPackManifest(manifest)
if (args.includes('--write-manifest')) {
  await writeFile(manifestPath, serialized)
} else {
  const checkedIn = JSON.parse(await readFile(manifestPath, 'utf8'))
  if (JSON.stringify(checkedIn) !== JSON.stringify(manifest)) {
    throw new Error(
      'VIP media changed. Run node scripts/export-vip-cinematic-pack.mjs --write-manifest.'
    )
  }
  if (!args.includes('--check')) {
    const parent = path.join(repositoryRoot, 'renders/vip-cinematics')
    await mkdir(parent, { recursive: true })
    const destination = path.join(parent, manifest.revision)
    await exportVipCinematicPack(repositoryRoot, destination, manifest)
    console.log(`Pack exported to ${destination}`)
  }
}
console.log(
  `${manifest.files.length} optional images, ${manifest.totalBytes.toLocaleString('en-US')} bytes; music, credits and shared finale artwork remain bundled.`
)
