import { readFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = path.join(root, 'src/cinematic/media/assetManifest.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const ffmpegName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
const ffprobeName = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'
const remotionPlatform = process.platform === 'win32' ? 'win32-x64-msvc' : null
const bundledFfmpeg = remotionPlatform
  ? path.join(root, `node_modules/@remotion/compositor-${remotionPlatform}`, ffmpegName)
  : null
const ffmpeg =
  process.env.CINEMATIC_FFMPEG ||
  (bundledFfmpeg && existsSync(bundledFfmpeg) ? bundledFfmpeg : ffmpegName)
const bundledFfprobe = bundledFfmpeg ? path.join(path.dirname(bundledFfmpeg), ffprobeName) : null
const ffprobe =
  process.env.CINEMATIC_FFPROBE ||
  (bundledFfprobe && existsSync(bundledFfprobe) ? bundledFfprobe : ffprobeName)

function run(binary, args, options = {}) {
  const result = spawnSync(binary, args, {
    encoding: Object.hasOwn(options, 'encoding') ? options.encoding : 'utf8',
    maxBuffer: options.maxBuffer,
    windowsHide: true,
  })
  if (result.error) return { available: false, error: result.error.message }
  return {
    available: result.status === 0,
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  }
}

function boxes(buffer, start, end) {
  const result = []
  for (let offset = start; offset + 8 <= end; ) {
    let size = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    if (size === 1) size = Number(buffer.readBigUInt64BE(offset + 8))
    if (size < 8 || offset + size > end) break
    result.push({ offset, size, type })
    offset += size
  }
  return result
}

function child(buffer, parent, type) {
  return boxes(buffer, parent.offset + 8, parent.offset + parent.size).find(
    (box) => box.type === type
  )
}

function inspectMp4(buffer) {
  const topLevel = boxes(buffer, 0, buffer.length)
  const movie = topLevel.find((box) => box.type === 'moov')
  const mediaData = topLevel.find((box) => box.type === 'mdat')
  if (!movie || !mediaData) {
    throw new Error('MP4 is missing a movie or media-data atom.')
  }

  const tracks = boxes(buffer, movie.offset + 8, movie.offset + movie.size)
    .filter((box) => box.type === 'trak')
    .map((track) => {
      const media = child(buffer, track, 'mdia')
      const header = child(buffer, track, 'tkhd')
      const handler = child(buffer, media, 'hdlr')
      const mediaHeader = child(buffer, media, 'mdhd')
      const information = child(buffer, media, 'minf')
      const sampleTable = child(buffer, information, 'stbl')
      const sampleDescription = child(buffer, sampleTable, 'stsd')
      const sampleType = buffer.toString(
        'ascii',
        sampleDescription.offset + 20,
        sampleDescription.offset + 24
      )
      const handlerType = buffer.toString('ascii', handler.offset + 16, handler.offset + 20)
      const headerVersion = buffer[mediaHeader.offset + 8]
      const scale = buffer.readUInt32BE(mediaHeader.offset + (headerVersion ? 28 : 20))
      const duration = headerVersion
        ? Number(buffer.readBigUInt64BE(mediaHeader.offset + 32))
        : buffer.readUInt32BE(mediaHeader.offset + 24)
      const timing = child(buffer, sampleTable, 'stts')
      let frames = 0
      let ticks = 0
      if (timing) {
        const entryCount = buffer.readUInt32BE(timing.offset + 12)
        for (let index = 0; index < entryCount; index += 1) {
          const entry = timing.offset + 16 + index * 8
          const count = buffer.readUInt32BE(entry)
          const delta = buffer.readUInt32BE(entry + 4)
          frames += count
          ticks += count * delta
        }
      }

      return {
        handler: handlerType,
        codec: sampleType,
        width: buffer.readUInt32BE(header.offset + header.size - 8) / 65536,
        height: buffer.readUInt32BE(header.offset + header.size - 4) / 65536,
        durationSeconds: duration / scale,
        frameRate: ticks > 0 ? frames / (ticks / scale) : null,
      }
    })

  return {
    video: tracks.find((track) => track.handler === 'vide'),
    audioTrackCount: tracks.filter((track) => track.handler === 'soun').length,
    fastStart: movie.offset < mediaData.offset,
  }
}

// Remotion's bundled ffprobe omits WebP decoding. Read the standard container
// dimensions without adding an image-processing dependency to the game.
function inspectWebp(buffer) {
  if (
    buffer.toString('ascii', 0, 4) !== 'RIFF' ||
    buffer.toString('ascii', 8, 12) !== 'WEBP' ||
    buffer.readUInt32LE(4) + 8 !== buffer.length
  ) {
    throw new Error('Poster is not a complete WebP container.')
  }
  for (let offset = 12; offset + 8 <= buffer.length; ) {
    const kind = buffer.toString('ascii', offset, offset + 4)
    const length = buffer.readUInt32LE(offset + 4)
    const data = offset + 8
    if (data + length > buffer.length) throw new Error('Truncated WebP chunk.')
    if (kind === 'VP8X' && length >= 10) {
      return {
        width: buffer.readUIntLE(data + 4, 3) + 1,
        height: buffer.readUIntLE(data + 7, 3) + 1,
        format: 'webp',
      }
    }
    if (
      kind === 'VP8 ' &&
      length >= 10 &&
      buffer.toString('hex', data + 3, data + 6) === '9d012a'
    ) {
      return {
        width: buffer.readUInt16LE(data + 6) & 0x3fff,
        height: buffer.readUInt16LE(data + 8) & 0x3fff,
        format: 'webp',
      }
    }
    if (kind === 'VP8L' && length >= 5 && buffer[data] === 0x2f) {
      const dimensions = buffer.readUInt32LE(data + 1)
      return {
        width: (dimensions & 0x3fff) + 1,
        height: ((dimensions >>> 14) & 0x3fff) + 1,
        format: 'webp',
      }
    }
    offset = data + length + (length % 2)
  }
  throw new Error('Poster has no supported WebP image header.')
}

const checked = []
let totalEncodedBytes = 0
for (const [assetId, asset] of Object.entries(manifest.assets)) {
  const absolutePath = path.join(root, asset.filePath)
  const fileInfo = await stat(absolutePath)
  const sourceInfo = await stat(path.join(root, asset.sourceFile))
  const posterPath = path.join(root, 'public', asset.posterPath)
  const posterInfo = await stat(posterPath)
  const poster = inspectWebp(await readFile(posterPath))
  const media = inspectMp4(await readFile(absolutePath))
  if (!sourceInfo.isFile()) throw new Error(`${assetId}: source is not a file.`)
  if (!posterInfo.isFile()) throw new Error(`${assetId}: poster is not a file.`)
  for (const [field, observed] of Object.entries({
    posterWidth: poster.width,
    posterHeight: poster.height,
    posterFormat: poster.format,
    fastStart: media.fastStart,
  })) {
    if (observed !== asset[field]) {
      throw new Error(`${assetId}: ${field} is ${observed}; manifest says ${asset[field]}.`)
    }
  }
  if (fileInfo.size !== asset.encodedBytes) {
    throw new Error(
      `${assetId}: manifest size ${asset.encodedBytes} does not match ${fileInfo.size}.`
    )
  }

  const video = media.video
  if (!video) throw new Error(`${assetId}: no video track found.`)
  for (const [field, observed] of Object.entries({
    width: video.width,
    height: video.height,
    codec: video.codec,
    audioTrackCount: media.audioTrackCount,
  })) {
    if (observed !== asset[field]) {
      throw new Error(`${assetId}: ${field} is ${observed}; manifest says ${asset[field]}.`)
    }
  }
  if (Math.abs(video.durationSeconds - asset.durationSeconds) > 0.1) {
    throw new Error(`${assetId}: duration ${video.durationSeconds} does not match the manifest.`)
  }
  if (Math.abs(video.frameRate - asset.frameRate) > 0.01) {
    throw new Error(`${assetId}: frame rate ${video.frameRate} does not match the manifest.`)
  }

  const decoded = run(ffmpeg, [
    '-v',
    'error',
    '-i',
    absolutePath,
    '-map',
    '0:v:0',
    '-c:v',
    'rawvideo',
    '-f',
    'null',
    '-',
  ])
  const frameCount = run(ffprobe, [
    '-v',
    'error',
    '-count_frames',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=nb_read_frames',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    absolutePath,
  ])
  const seekTimes = [0, asset.durationSeconds / 2, Math.max(0, asset.durationSeconds - 0.5)]
  const seekResults = seekTimes.map((time) => {
    const seek = run(
      ffmpeg,
      [
        '-v',
        'error',
        '-ss',
        time.toFixed(3),
        '-i',
        absolutePath,
        '-map',
        '0:v:0',
        '-frames:v',
        '1',
        '-c:v',
        'mjpeg',
        '-f',
        'image2pipe',
        '-',
      ],
      { encoding: null, maxBuffer: 1024 * 1024 }
    )
    const producedFrame =
      Buffer.isBuffer(seek.stdout) &&
      seek.stdout.length > 3 &&
      seek.stdout[0] === 0xff &&
      seek.stdout[1] === 0xd8 &&
      seek.stdout[2] === 0xff
    return {
      timeSeconds: Number(time.toFixed(3)),
      passed: seek.available && producedFrame,
      error: seek.error,
      status: seek.status,
    }
  })
  const decodeChecks = [decoded, frameCount, ...seekResults]
  const failedDecode =
    [decoded, frameCount].some((check) => check.error == null && check.available === false) ||
    seekResults.some((check) => check.error == null && !check.passed)
  const decodeToolsMissing = decodeChecks.some((check) => check.error != null)
  if (failedDecode) throw new Error(`${assetId}: full decode or seek validation failed.`)
  if (decodeToolsMissing && process.env.CINEMATIC_REQUIRE_DECODE === '1') {
    throw new Error(
      `${assetId}: full decode and seek validation need working ffmpeg and ffprobe binaries.`
    )
  }
  const seekChecks = seekResults.map(({ timeSeconds, passed }) => ({ timeSeconds, passed }))
  if (decoded.available && frameCount.available) {
    const decodedFrameCount = Number(frameCount.stdout.trim())
    const expectedFrameCount = Math.round(asset.durationSeconds * asset.frameRate)
    if (decodedFrameCount !== expectedFrameCount) {
      throw new Error(
        `${assetId}: decoded ${decodedFrameCount} frames; expected ${expectedFrameCount}.`
      )
    }
  }

  totalEncodedBytes += fileInfo.size
  checked.push({
    id: assetId,
    bytes: fileInfo.size,
    width: video.width,
    height: video.height,
    durationSeconds: Number(video.durationSeconds.toFixed(3)),
    frameRate: Number(video.frameRate.toFixed(3)),
    codec: video.codec,
    audioTrackCount: media.audioTrackCount,
    posterBytes: posterInfo.size,
    sourceFile: asset.sourceFile,
    decode: decoded.available && frameCount.available ? 'passed' : 'not-run',
    decodedFrames:
      decoded.available && frameCount.available ? Number(frameCount.stdout.trim()) : null,
    fastStart: media.fastStart,
    poster: {
      width: poster.width,
      height: poster.height,
      format: poster.format,
      bytes: posterInfo.size,
    },
    seekChecks,
  })
}

const budgets = manifest.deliveryBudgets
const twinRelease = manifest.twinShockRelease
if (!twinRelease || !['approved', 'pending-device-evidence'].includes(twinRelease.status)) {
  throw new Error('Twin Shock must declare its device release-gate status.')
}
if (
  twinRelease.status === 'approved' &&
  (budgets.status !== 'approved' ||
    twinRelease.assetRevision !== manifest.assets['twin-shock-intro-background'].revision ||
    !twinRelease.androidReport?.trim() ||
    !twinRelease.iphoneReport?.trim())
) {
  throw new Error(
    'Approved Twin Shock needs matching asset revision, approved budgets and both reviewed device report references.'
  )
}
if (budgets.status === 'approved') {
  if (!(budgets.perClipBytes > 0) || !(budgets.totalBytes > 0)) {
    throw new Error('Approved delivery budgets must set positive per-clip and total byte limits.')
  }
  for (const asset of checked) {
    if (asset.bytes > budgets.perClipBytes) {
      throw new Error(`${asset.id}: ${asset.bytes} bytes exceeds the approved per-clip budget.`)
    }
  }
  if (totalEncodedBytes > budgets.totalBytes) {
    throw new Error(`${totalEncodedBytes} total bytes exceeds the approved cinematic budget.`)
  }
} else if (budgets.perClipBytes != null || budgets.totalBytes != null) {
  throw new Error('Pending device evidence must not be described with approved delivery budgets.')
}

console.log(
  JSON.stringify(
    {
      metadata: 'validated',
      budgetStatus: manifest.deliveryBudgets.status,
      twinShockReleaseStatus: twinRelease.status,
      devicePlayback: 'not measured by this tool',
      totalEncodedBytes,
      assets: checked,
    },
    null,
    2
  )
)
