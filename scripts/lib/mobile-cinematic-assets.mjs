import { createHash } from 'node:crypto'
import { readFile, readdir, realpath, unlink } from 'node:fs/promises'
import path from 'node:path'
import { isOptionalVipCinematicAsset } from './vip-cinematic-pack.mjs'

const sha256 = (data) => createHash('sha256').update(data).digest('hex')

async function publicFiles(directory, prefix = '') {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`Unexpected public symlink: ${entry.name}`)
    const relative = `${prefix}${entry.name}`
    if (entry.isDirectory())
      files.push(...(await publicFiles(path.join(directory, entry.name), `${relative}/`)))
    else if (entry.isFile()) files.push(relative)
  }
  return files
}

/** Remove only pinned optional image copies from the generated output, never source artwork. */
export async function excludeMobileCinematicAssets(root, outputDirectory, manifest) {
  const output = await realpath(outputDirectory)
  const source = await realpath(path.join(root, 'public'))
  const relative = path.relative(source, output)
  const reverse = path.relative(output, source)
  if (
    !relative ||
    (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) ||
    (!reverse.startsWith(`..${path.sep}`) && !path.isAbsolute(reverse))
  ) {
    throw new Error('Mobile output must be separate from public source assets.')
  }
  for (const file of manifest.files) {
    if (!isOptionalVipCinematicAsset(file.path))
      throw new Error(`Not optional artwork: ${file.path}`)
    const target = path.join(output, file.path)
    const data = await readFile(target)
    if (data.length !== file.bytes || sha256(data) !== file.sha256) {
      throw new Error(`Unexpected generated cinematic artwork: ${file.path}`)
    }
    await unlink(target)
  }
  return verifyMobileCinematicAssets(root, output, manifest)
}

/** Packaging gate: every optional image must be absent, every other public file byte-identical. */
export async function verifyMobileCinematicAssets(root, outputDirectory, manifest) {
  const optional = new Set(manifest.files.map((file) => file.path))
  const outputFiles = new Set(await publicFiles(outputDirectory))
  for (const file of optional) {
    if (outputFiles.has(file)) throw new Error(`Optional cinematic artwork still bundled: ${file}`)
  }
  let retainedFiles = 0
  for (const file of await publicFiles(path.join(root, 'public'))) {
    if (optional.has(file)) continue
    const original = await readFile(path.join(root, 'public', file))
    const retained = await readFile(path.join(outputDirectory, file))
    if (!original.equals(retained)) throw new Error(`Bundled public asset changed: ${file}`)
    retainedFiles += 1
  }
  return { excludedFiles: optional.size, excludedBytes: manifest.totalBytes, retainedFiles }
}
