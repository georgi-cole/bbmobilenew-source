import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const policy = JSON.parse(
  await readFile(
    path.join(repositoryRoot, 'src/cinematic/media/vipCinematicPackPolicy.json'),
    'utf8'
  )
)
const sha256 = (data) => createHash('sha256').update(data).digest('hex')

export function isOptionalVipCinematicAsset(assetPath) {
  return (
    assetPath.startsWith(policy.assetRoot) &&
    !assetPath.split('/').some((part) => part === '..' || part === '.') &&
    !assetPath.includes('\\') &&
    policy.imageExtensions.includes(path.posix.extname(assetPath).toLowerCase()) &&
    !policy.bundledAssets.includes(assetPath)
  )
}

async function imageFiles(publicRoot, assetPath) {
  const files = []
  const entries = await readdir(path.join(publicRoot, assetPath), { withFileTypes: true })
  for (const entry of entries) {
    const child = `${assetPath}${entry.name}`
    if (entry.isSymbolicLink()) throw new Error(`Cinematic assets cannot be symlinks: ${child}`)
    if (entry.isDirectory()) files.push(...(await imageFiles(publicRoot, `${child}/`)))
    else if (entry.isFile() && isOptionalVipCinematicAsset(child)) files.push(child)
  }
  return files.sort()
}

/** Discover images recursively so additional walking frames cannot be left out by a pose allowlist. */
export async function createVipCinematicPackManifest(root = repositoryRoot) {
  const publicRoot = path.join(root, 'public')
  const catalog = JSON.parse(
    await readFile(path.join(root, 'src/cinematic/ceremonies/cast.json'), 'utf8')
  )
  const files = []
  for (const assetPath of await imageFiles(publicRoot, policy.assetRoot)) {
    const data = await readFile(path.join(publicRoot, assetPath))
    files.push({ path: assetPath, bytes: data.length, sha256: sha256(data) })
  }
  if (!files.length) throw new Error('The VIP cinematic pack is empty.')
  const content = {
    schemaVersion: policy.schemaVersion,
    packId: policy.packId,
    rendererVersion: policy.rendererVersion,
    // Hash semantic metadata so Windows and Unix line endings produce identical revisions.
    catalogSha256: sha256(JSON.stringify(catalog)),
    totalBytes: files.reduce((total, file) => total + file.bytes, 0),
    files,
  }
  return { ...content, revision: sha256(JSON.stringify(content)) }
}

export const serializeVipCinematicPackManifest = (manifest) =>
  JSON.stringify(manifest, null, 2) + '\n'

/** Write into a new directory only. Source images are copied byte for byte. */
export async function exportVipCinematicPack(root, outputDirectory, manifest) {
  await mkdir(outputDirectory, { recursive: false })
  for (const file of manifest.files) {
    if (!isOptionalVipCinematicAsset(file.path)) throw new Error(`Not optional media: ${file.path}`)
    const target = path.join(outputDirectory, 'files', file.path)
    await mkdir(path.dirname(target), { recursive: true })
    await copyFile(path.join(root, 'public', file.path), target)
    const exported = await readFile(target)
    if (exported.length !== file.bytes || sha256(exported) !== file.sha256) {
      throw new Error(`Cinematic asset changed during export: ${file.path}`)
    }
  }
  await writeFile(
    path.join(outputDirectory, 'manifest.json'),
    serializeVipCinematicPackManifest(manifest)
  )
}
