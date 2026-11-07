import { readFile, realpath, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import sharp from 'sharp'

const catalogFile = new URL('../src/appearance/characterCatalog.data.json', import.meta.url)
const policyFile = new URL('../src/appearance/characterAssetPolicy.json', import.meta.url)
const defaultPublicDir = fileURLToPath(new URL('../public/', import.meta.url))
const assetRoles = ['thumbnail', 'portrait', 'body']
const idPattern = /^preset-[a-z0-9]+(?:-[a-z0-9]+)*$/
const traitValues = {
  ageAppearance: ['young-adult', 'middle-adult', 'older-adult'],
  build: ['slim', 'average', 'athletic', 'fuller', 'broad'],
  browShape: ['straight', 'arched', 'rounded', 'strong', 'other'],
  eyeColor: ['brown', 'blue', 'green', 'hazel', 'gray', 'other'],
  facialHair: ['none', 'stubble', 'beard', 'moustache'],
  hairColor: ['dark', 'brown', 'blonde', 'red', 'silver', 'other'],
  hairLength: ['bald', 'short', 'medium', 'long'],
  skinTone: ['light', 'light-medium', 'medium', 'medium-deep', 'deep'],
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isInsideDirectory(root, candidate) {
  const relativePath = relative(root, candidate)
  return (
    relativePath !== '' &&
    relativePath !== '..' &&
    !relativePath.startsWith(`..${sep}`) &&
    !isAbsolute(relativePath)
  )
}

function isSafeRelativeAssetPath(assetPath) {
  if (
    typeof assetPath !== 'string' ||
    !assetPath.startsWith('assets/characters/') ||
    assetPath.includes('\\') ||
    /[%?#:]/.test(assetPath)
  ) {
    return false
  }

  return assetPath
    .split('/')
    .every((segment) => segment !== '' && segment !== '.' && segment !== '..')
}

function validateTraits(traits, label, errors) {
  if (!isRecord(traits)) {
    errors.push(`${label}: traits must be an object.`)
    return
  }

  for (const [trait, allowedValues] of Object.entries(traitValues)) {
    if (!allowedValues.includes(traits[trait])) {
      errors.push(`${label}: trait "${trait}" must be one of: ${allowedValues.join(', ')}.`)
    }
  }
}

/** Validate every released catalog asset using metadata inspection and a full Sharp decode. */
export async function validateCharacterCatalog(catalog, options = {}) {
  const errors = []
  const policy = options.policy ?? JSON.parse(await readFile(policyFile, 'utf8'))
  const publicDir = resolve(options.publicDir ?? defaultPublicDir)
  const imageProcessor = options.imageProcessor ?? sharp
  const rolePolicies = Object.fromEntries(
    assetRoles.map((role) => [role, { ...policy.roles[role], ...options.rolePolicies?.[role] }])
  )
  const seenRevisions = new Set()
  const selectableIds = new Set()
  const assetPaths = new Set()
  let totalBytes = 0
  let validatedAssets = 0

  if (!Array.isArray(catalog)) {
    return { valid: false, errors: ['Catalog must be an array.'], totalBytes, validatedAssets }
  }

  if (catalog.length > 0) {
    try {
      await realpath(publicDir)
    } catch {
      return {
        valid: false,
        errors: [`Public asset directory does not exist: ${publicDir}`],
        totalBytes,
        validatedAssets,
      }
    }
  }

  const publicRoot = catalog.length > 0 ? await realpath(publicDir) : null

  for (const [index, preset] of catalog.entries()) {
    const rowLabel = `Catalog entry ${index + 1}`
    if (!isRecord(preset)) {
      errors.push(`${rowLabel}: entry must be an object.`)
      continue
    }

    const { id, revision } = preset
    const label = typeof id === 'string' ? `${id} revision ${revision}` : rowLabel
    const validId = typeof id === 'string' && idPattern.test(id)
    const validRevision = Number.isInteger(revision) && revision > 0

    if (!validId) errors.push(`${label}: ID must match ${idPattern.source}.`)
    if (!validRevision) errors.push(`${label}: revision must be a positive integer.`)
    if (typeof preset.displayLabel !== 'string' || preset.displayLabel.trim() === '') {
      errors.push(`${label}: displayLabel must be a non-empty string.`)
    }
    if (typeof preset.selectable !== 'boolean') {
      errors.push(`${label}: selectable must be a boolean.`)
    }
    validateTraits(preset.traits, label, errors)

    if (validId && validRevision) {
      const revisionKey = `${id}@${revision}`
      if (seenRevisions.has(revisionKey)) {
        errors.push(`${label}: duplicate ID and revision.`)
      } else {
        seenRevisions.add(revisionKey)
      }
      if (preset.selectable === true) {
        if (selectableIds.has(id)) {
          errors.push(`${label}: only one revision per ID may be selectable.`)
        }
        selectableIds.add(id)
      }
    }

    if (!isRecord(preset.assets)) {
      errors.push(`${label}: assets must include thumbnail, portrait, and body paths.`)
      continue
    }

    for (const role of assetRoles) {
      const assetPath = preset.assets[role]
      if (!isSafeRelativeAssetPath(assetPath)) {
        errors.push(`${label}: ${role} path must be a safe relative path under assets/characters/.`)
        continue
      }
      if (!validId || !validRevision) continue

      const expectedPath = `assets/characters/${id}/r${revision}/${role}.webp`
      if (assetPath !== expectedPath) {
        errors.push(`${label}: ${role} path must be "${expectedPath}".`)
        continue
      }
      if (assetPaths.has(assetPath)) {
        errors.push(`${label}: asset path is referenced more than once: ${assetPath}.`)
        continue
      }
      assetPaths.add(assetPath)

      const absolutePath = resolve(publicRoot, ...assetPath.split('/'))
      if (!isInsideDirectory(publicRoot, absolutePath)) {
        errors.push(`${label}: ${role} path escapes the public asset directory.`)
        continue
      }

      let assetInfo
      let assetRealPath
      try {
        assetRealPath = await realpath(absolutePath)
        if (!isInsideDirectory(publicRoot, assetRealPath)) {
          errors.push(`${label}: ${role} path resolves outside the public asset directory.`)
          continue
        }
        assetInfo = await stat(assetRealPath)
      } catch {
        errors.push(`${label}: missing production file "${assetPath}".`)
        continue
      }

      if (!assetInfo.isFile()) {
        errors.push(`${label}: ${role} path is not a file: ${assetPath}.`)
        continue
      }

      totalBytes += assetInfo.size
      const rolePolicy = rolePolicies[role]
      if (assetInfo.size > rolePolicy.maxBytes) {
        errors.push(
          `${label}: ${role} file is ${assetInfo.size} bytes; limit is ${rolePolicy.maxBytes} bytes.`
        )
        continue
      }

      try {
        const imageBuffer = await readFile(assetRealPath)
        const metadata = await imageProcessor(imageBuffer, {
          limitInputPixels: policy.roles.body.width * policy.roles.body.height,
        }).metadata()
        if (metadata.format !== policy.format) {
          errors.push(`${label}: ${role} must be an actual ${policy.format.toUpperCase()} image.`)
          continue
        }
        if (metadata.width !== rolePolicy.width || metadata.height !== rolePolicy.height) {
          errors.push(
            `${label}: ${role} must be ${rolePolicy.width}x${rolePolicy.height}; got ${metadata.width}x${metadata.height}.`
          )
          continue
        }

        const { data, info } = await imageProcessor(imageBuffer, {
          limitInputPixels: policy.roles.body.width * policy.roles.body.height,
        })
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true })

        if (info.width !== rolePolicy.width || info.height !== rolePolicy.height) {
          errors.push(
            `${label}: ${role} decoded with unexpected dimensions ${info.width}x${info.height}.`
          )
          continue
        }
        if (role === 'body') {
          let hasTransparentPixel = false
          for (let pixel = 3; pixel < data.length; pixel += info.channels) {
            if (data[pixel] < 255) {
              hasTransparentPixel = true
              break
            }
          }
          if (!hasTransparentPixel) {
            errors.push(
              `${label}: body image is fully opaque; at least one transparent pixel is required.`
            )
            continue
          }
        }
        validatedAssets += 1
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        errors.push(
          `${label}: ${role} is not a decodable ${policy.format.toUpperCase()} image (${reason}).`
        )
      }
    }
  }

  const catalogBudgetBytes = options.catalogBudgetBytes ?? policy.catalogBudgetBytes
  if (totalBytes > catalogBudgetBytes) {
    errors.push(`Catalog assets total ${totalBytes} bytes; budget is ${catalogBudgetBytes} bytes.`)
  }

  return { valid: errors.length === 0, errors, totalBytes, validatedAssets }
}

async function runCli() {
  const catalog = JSON.parse(await readFile(catalogFile, 'utf8'))
  const report = await validateCharacterCatalog(catalog)

  if (report.errors.length > 0) {
    for (const error of report.errors) console.error(`Character catalog: ${error}`)
    process.exitCode = 1
    return
  }

  if (catalog.length === 0) {
    console.log('Character catalog is valid and empty; no released presets are included yet.')
  } else {
    console.log(
      `Character catalog is valid: ${catalog.length} revisions, ${report.validatedAssets} decoded assets, ${report.totalBytes} bytes.`
    )
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
