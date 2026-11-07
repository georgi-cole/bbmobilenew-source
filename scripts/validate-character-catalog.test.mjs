import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import sharp from 'sharp'
import { resolveCharacterAssetUrl } from '../src/appearance/characterAssetPaths.mjs'
import { validateCharacterCatalog } from './validate-character-catalog.mjs'

const rolePolicy = {
  thumbnail: { width: 128, height: 128 },
  portrait: { width: 256, height: 256 },
  body: { width: 768, height: 1152 },
}

function createPreset({ id = 'preset-001', revision = 1, selectable = true } = {}) {
  return {
    id,
    revision,
    displayLabel: 'Look 01',
    selectable,
    assets: Object.fromEntries(
      Object.keys(rolePolicy).map((role) => [
        role,
        `assets/characters/${id}/r${revision}/${role}.webp`,
      ])
    ),
    traits: {
      ageAppearance: 'young-adult',
      build: 'average',
      browShape: 'straight',
      eyeColor: 'brown',
      facialHair: 'none',
      hairColor: 'dark',
      hairLength: 'short',
      skinTone: 'medium',
    },
  }
}

async function createFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'character-catalog-'))
  const publicDir = join(root, 'public')
  await mkdir(publicDir, { recursive: true })
  t.after(() => rm(root, { recursive: true, force: true }))
  return publicDir
}

async function writeWebp(publicDir, assetPath, dimensions, { opaque = false } = {}) {
  const { width, height } = dimensions
  const rgba = Buffer.alloc(width * height * 4)
  for (let pixel = 0; pixel < rgba.length; pixel += 4) {
    rgba[pixel] = 34
    rgba[pixel + 1] = 78
    rgba[pixel + 2] = 120
    rgba[pixel + 3] = 255
  }
  if (!opaque) rgba[3] = 0

  const file = join(publicDir, ...assetPath.split('/'))
  await mkdir(join(file, '..'), { recursive: true })
  await sharp(rgba, { raw: { width, height, channels: 4 } })
    .webp({ lossless: true })
    .toFile(file)
}

async function writePresetAssets(publicDir, preset, options = {}) {
  for (const [role, expectedDimensions] of Object.entries(rolePolicy)) {
    if (options.omitRole === role) continue
    await writeWebp(
      publicDir,
      preset.assets[role],
      options.dimensions?.[role] ?? expectedDimensions,
      { opaque: role === 'body' && options.opaqueBody === true }
    )
  }
}

test('accepts an empty catalog before any art is released', async () => {
  const report = await validateCharacterCatalog([])
  assert.equal(report.valid, true)
  assert.equal(report.validatedAssets, 0)
  assert.equal(report.totalBytes, 0)
})

test('builds safe web and mobile URLs from catalog-relative paths', () => {
  const assetPath = 'assets/characters/preset-001/r1/body.webp'
  assert.equal(
    resolveCharacterAssetUrl(assetPath, '/bbmobilenew/'),
    '/bbmobilenew/assets/characters/preset-001/r1/body.webp'
  )
  assert.equal(resolveCharacterAssetUrl(assetPath, './'), `./${assetPath}`)
  assert.equal(resolveCharacterAssetUrl(assetPath, '/bbmobilenew'), `/bbmobilenew/${assetPath}`)
  assert.throws(
    () => resolveCharacterAssetUrl('../private/body.webp', './'),
    /Unsafe character asset path/
  )
})

test('runs the validator before each release and mobile build', async () => {
  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8')
  )
  for (const script of [
    'build:release',
    'build:mobile',
    'build:android',
    'build:ios',
    'build:ios:dev',
  ]) {
    assert.ok(
      packageJson.scripts[script].startsWith('npm run validate:characters &&'),
      `${script} must validate character assets before building`
    )
  }
})

test('accepts a tiny but correctly dimensioned and fully decoded preset fixture', async (t) => {
  const publicDir = await createFixture(t)
  const preset = createPreset()
  await writePresetAssets(publicDir, preset)

  const report = await validateCharacterCatalog([preset], { publicDir })
  assert.equal(report.valid, true, report.errors.join('\n'))
  assert.equal(report.validatedAssets, 3)
  assert.ok(report.totalBytes > 0)
})

test('keeps retired revisions renderable while allowing only one selectable revision per ID', async (t) => {
  const publicDir = await createFixture(t)
  const retired = createPreset({ revision: 1, selectable: false })
  const current = createPreset({ revision: 2, selectable: true })
  await writePresetAssets(publicDir, retired)
  await writePresetAssets(publicDir, current)

  const report = await validateCharacterCatalog([retired, current], { publicDir })
  assert.equal(report.valid, true, report.errors.join('\n'))
  assert.equal(report.validatedAssets, 6)

  const twoSelectable = await validateCharacterCatalog(
    [{ ...retired, selectable: true }, current],
    { publicDir }
  )
  assert.ok(
    twoSelectable.errors.some((error) =>
      error.includes('only one revision per ID may be selectable')
    )
  )
})

test('rejects duplicate ID/revision pairs and unsafe paths', async (t) => {
  const publicDir = await createFixture(t)
  const preset = createPreset()
  const duplicateReport = await validateCharacterCatalog([preset, preset], { publicDir })
  assert.ok(duplicateReport.errors.some((error) => error.includes('duplicate ID and revision')))

  const unsafe = createPreset()
  unsafe.assets.body = 'assets/characters/../private/body.webp'
  const unsafeReport = await validateCharacterCatalog([unsafe], { publicDir })
  assert.ok(unsafeReport.errors.some((error) => error.includes('safe relative path')))
  assert.ok(
    !unsafeReport.errors.some((error) => error.includes('escapes the public asset directory'))
  )
})

test('rejects missing production files and image dimensions that do not match the delivery role', async (t) => {
  const publicDir = await createFixture(t)
  const missing = createPreset()
  const missingReport = await validateCharacterCatalog([missing], { publicDir })
  assert.ok(missingReport.errors.some((error) => error.includes('missing production file')))

  const wrongDimensions = createPreset()
  await writePresetAssets(publicDir, wrongDimensions, {
    dimensions: { body: { width: 32, height: 32 } },
  })
  const dimensionsReport = await validateCharacterCatalog([wrongDimensions], { publicDir })
  assert.ok(
    dimensionsReport.errors.some((error) => error.includes('body must be 768x1152; got 32x32'))
  )
})

test('rejects opaque, corrupt, and incorrectly labelled image files', async (t) => {
  const publicDir = await createFixture(t)
  const opaque = createPreset()
  await writePresetAssets(publicDir, opaque, { opaqueBody: true })
  const opaqueReport = await validateCharacterCatalog([opaque], { publicDir })
  assert.ok(opaqueReport.errors.some((error) => error.includes('body image is fully opaque')))

  const corrupt = createPreset({ id: 'preset-002' })
  await writePresetAssets(publicDir, corrupt)
  const corruptFile = join(publicDir, ...corrupt.assets.portrait.split('/'))
  await writeFile(corruptFile, Buffer.from('not an image'))
  const corruptReport = await validateCharacterCatalog([corrupt], { publicDir })
  assert.ok(corruptReport.errors.some((error) => error.includes('not a decodable WEBP image')))

  const mislabeled = createPreset({ id: 'preset-003' })
  await writePresetAssets(publicDir, mislabeled)
  const pngFile = join(publicDir, ...mislabeled.assets.thumbnail.split('/'))
  const png = await sharp({
    create: { width: 128, height: 128, channels: 4, background: '#345678' },
  })
    .png()
    .toBuffer()
  await writeFile(pngFile, png)
  const formatReport = await validateCharacterCatalog([mislabeled], { publicDir })
  assert.ok(
    formatReport.errors.some((error) => error.includes('thumbnail must be an actual WEBP image'))
  )
})

test('enforces per-image and whole-catalog delivery budgets', async (t) => {
  const publicDir = await createFixture(t)
  const preset = createPreset()
  await writePresetAssets(publicDir, preset)

  const fileBudgetReport = await validateCharacterCatalog([preset], {
    publicDir,
    rolePolicies: { body: { maxBytes: 1 } },
  })
  assert.ok(fileBudgetReport.errors.some((error) => error.includes('body file is')))

  const catalogBudgetReport = await validateCharacterCatalog([preset], {
    publicDir,
    catalogBudgetBytes: 1,
  })
  assert.ok(catalogBudgetReport.errors.some((error) => error.includes('Catalog assets total')))
})
