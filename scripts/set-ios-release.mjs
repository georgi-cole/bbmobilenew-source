import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { resolve } from 'node:path'

const configPath = resolve('ios/App/Release.xcconfig')
const versionSetting = /^MARKETING_VERSION = (\S+)$/m
const iconSetting = /^ASSETCATALOG_COMPILER_APPICON_NAME = (\S+)$/m

function versionParts(version) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error('Use a three-part iOS version such as 1.0.1.')
  }
  return version.split('.').map(BigInt)
}

function setIosRelease(version) {
  const requestedVersion = versionParts(version)
  const { stages } = JSON.parse(readFileSync('store-assets/icon-progression/sequence.json', 'utf8'))
  const icons = stages.map((_, index) =>
    index === 0 ? 'AppIcon' : `StoryIconStage${String(index + 1).padStart(2, '0')}`
  )

  // This file also acts as a lock. The version and frame are installed together.
  const draftPath = `${configPath}.next`
  const draft = openSync(draftPath, 'wx')
  let installed = false
  let nextFrame
  try {
    try {
      const current = readFileSync(configPath, 'utf8').replaceAll('\r\n', '\n')
      const currentVersion = versionParts(current.match(versionSetting)?.[1])
      const currentFrame = icons.indexOf(current.match(iconSetting)?.[1])
      if (currentFrame < 0) throw new Error('The current iOS icon is outside the story sequence.')

      const difference = requestedVersion.findIndex((part, index) => part !== currentVersion[index])
      if (difference === -1) {
        console.log(`iOS ${version} already uses icon frame ${currentFrame + 1}.`)
        return
      }
      if (requestedVersion[difference] < currentVersion[difference]) {
        throw new Error('The new iOS version must be higher than the current version.')
      }

      nextFrame = (currentFrame + 1) % icons.length
      const icon = icons[nextFrame]
      if (!existsSync(`ios/App/App/Assets.xcassets/${icon}.appiconset/Contents.json`)) {
        throw new Error(`The iOS icon asset set ${icon} is missing.`)
      }

      const next = current
        .replace(versionSetting, `MARKETING_VERSION = ${version}`)
        .replace(iconSetting, `ASSETCATALOG_COMPILER_APPICON_NAME = ${icon}`)
      writeFileSync(draft, next)
    } finally {
      closeSync(draft)
    }
    renameSync(draftPath, configPath)
    installed = true
  } finally {
    if (!installed) rmSync(draftPath, { force: true })
  }
  console.log(`iOS ${version} will ship with icon frame ${nextFrame + 1} of ${icons.length}.`)
}

try {
  setIosRelease(process.argv[2])
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
