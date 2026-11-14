import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { appendFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PLAY_PACKAGE = 'com.georgicole.thebigeye'
export const PLAY_TRACK = 'internal'
const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3'
const UPLOAD = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3'

/** Only non-secret connection metadata is written to GitHub step outputs. */
export function inspectPlayConnection(json) {
  if (!json?.trim()) return { configured: false }
  let credentials
  try {
    credentials = JSON.parse(json)
  } catch {
    throw new Error(
      'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON must contain a valid service-account JSON key.'
    )
  }
  if (
    !credentials ||
    credentials.type !== 'service_account' ||
    !/^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+\.iam\.gserviceaccount\.com$/.test(
      credentials.client_email ?? ''
    ) ||
    typeof credentials.private_key !== 'string' ||
    !credentials.private_key.includes('-----BEGIN PRIVATE KEY-----')
  ) {
    throw new Error(
      'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON must contain a service-account email and private key.'
    )
  }
  return { configured: true, serviceAccount: credentials.client_email }
}

async function sha256(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

/** Publishes only the existing Big Eye app's internal track; never edits testers or production. */
export async function publishPlayInternal({
  token,
  versionCode,
  bundlePath,
  sourceSha,
  fetchImpl = fetch,
}) {
  if (!token?.trim())
    throw new Error(
      'Google Play access token is missing. Configure GOOGLE_PLAY_SERVICE_ACCOUNT_JSON.'
    )
  const code = String(versionCode ?? '')
  if (!/^[1-9]\d*$/.test(code) || Number(code) > 2100000000)
    throw new Error('ANDROID_VERSION_CODE is invalid.')
  if (!/^[a-f0-9]{40}$/i.test(sourceSha ?? ''))
    throw new Error('GITHUB_SHA must identify the exact built source commit.')
  const bundle = await stat(bundlePath)
  if (!bundle.isFile() || !bundle.size)
    throw new Error('The signed Android App Bundle is missing or empty.')
  const digest = await sha256(bundlePath)
  const root = `/applications/${PLAY_PACKAGE}/edits`
  const redact = (value) => String(value).split(token).join('[redacted]')
  const request = async (url, options = {}, allowNotFound = false) => {
    let response
    try {
      response = await fetchImpl(url, {
        ...options,
        headers: { ...options.headers, Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(
          options.body && typeof options.body !== 'string' ? 600000 : 60000
        ),
      })
    } catch (error) {
      throw new Error(`Google Play request failed: ${redact(error.message)}`)
    }
    if (allowNotFound && response.status === 404) return {}
    if (response.status === 204) return null
    let data
    try {
      data = await response.json()
    } catch {
      throw new Error(`Google Play returned an unreadable response (HTTP ${response.status}).`)
    }
    if (!response.ok)
      throw new Error(
        `Google Play rejected the request (HTTP ${response.status}): ${redact(data.error?.message ?? 'No error details supplied.')}`
      )
    return data
  }
  const jsonRequest = (method, data) => ({
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(data ? { body: JSON.stringify(data) } : {}),
  })
  const createEdit = async () => {
    const edit = await request(`${API}${root}`, jsonRequest('POST', {}))
    if (!edit?.id) throw new Error('Google Play did not return an edit identifier.')
    return encodeURIComponent(edit.id)
  }
  const discard = async (id) => {
    if (id) {
      try {
        await request(`${API}${root}/${id}`, { method: 'DELETE' }, true)
      } catch {
        /* Preserve the actual publish error. */
      }
    }
  }
  const trackUrl = (id) => `${API}${root}/${id}/tracks/${PLAY_TRACK}`
  const isReleased = (track) =>
    track.releases?.some(
      (release) =>
        release.status === 'completed' &&
        release.versionCodes?.some((value) => String(value) === code)
    )
  let editId
  let committed = false
  let verificationId
  try {
    editId = await createEdit()
    const track = await request(trackUrl(editId), {}, true)
    const versions = track.releases?.flatMap((release) => release.versionCodes ?? []) ?? []
    if (versions.some((value) => Number(value) > Number(code)))
      throw new Error('A newer internal version already exists; refusing to downgrade it.')
    const inventory = await request(`${API}${root}/${editId}/bundles`)
    let uploaded = inventory.bundles?.find((candidate) => String(candidate.versionCode) === code)
    if (!uploaded) {
      uploaded = await request(`${UPLOAD}${root}/${editId}/bundles?uploadType=media`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(bundle.size),
        },
        body: createReadStream(bundlePath),
        duplex: 'half',
      })
    }
    if (String(uploaded.versionCode) !== code || uploaded.sha256?.toLowerCase() !== digest) {
      throw new Error(
        'Google Play bundle version or SHA-256 does not match the signed artifact. Nothing was released.'
      )
    }
    if (isReleased(track))
      return {
        packageName: PLAY_PACKAGE,
        track: PLAY_TRACK,
        versionCode: code,
        alreadyReleased: true,
      }
    await request(
      trackUrl(editId),
      jsonRequest('PUT', {
        track: PLAY_TRACK,
        releases: [
          {
            name: `main-${sourceSha.slice(0, 12)}-${code}`,
            versionCodes: [code],
            status: 'completed',
          },
        ],
      })
    )
    // Google's default cancels an existing review. Explicitly refuse that side effect.
    await request(
      `${API}${root}/${editId}:commit?changesInReviewBehavior=ERROR_IF_IN_REVIEW`,
      jsonRequest('POST')
    )
    committed = true
    verificationId = await createEdit()
    const verified = await request(trackUrl(verificationId))
    if (!isReleased(verified))
      throw new Error(
        'The upload committed, but the exact completed internal release could not be verified. Check Play Console before retrying.'
      )
    return {
      packageName: PLAY_PACKAGE,
      track: PLAY_TRACK,
      versionCode: code,
      alreadyReleased: false,
    }
  } finally {
    if (!committed) await discard(editId)
    await discard(verificationId)
  }
}

async function main() {
  if (process.argv.includes('--check-connection')) {
    const connection = inspectPlayConnection(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON)
    if (!process.env.GITHUB_OUTPUT) throw new Error('GitHub step output path is missing.')
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `configured=${connection.configured}\nservice_account=${connection.serviceAccount ?? ''}\n`
    )
    if (!connection.configured)
      console.log(
        '::notice::Google Play upload is not connected yet. Add GOOGLE_PLAY_SERVICE_ACCOUNT_JSON as described in docs/AUTOMATIC_MOBILE_BUILDS.md. The signed AAB remains available as an artifact.'
      )
    return
  }
  if (process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_REF !== 'refs/heads/main')
    throw new Error('Automatic Google Play releases are restricted to main.')
  const result = await publishPlayInternal({
    token: process.env.GOOGLE_PLAY_ACCESS_TOKEN,
    versionCode: process.env.ANDROID_VERSION_CODE,
    bundlePath:
      process.env.GOOGLE_PLAY_BUNDLE_PATH ??
      'android/app/build/outputs/bundle/release/app-release.aab',
    sourceSha: process.env.GITHUB_SHA,
  })
  const summary = `Verified Google Play internal release: ${result.packageName}, version ${result.versionCode}.`
  console.log(summary)
  if (process.env.GITHUB_STEP_SUMMARY)
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      `\n## Google Play Internal Testing\n\n${summary} Google may still need to finish processing before installation.\n`
    )
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const token = process.env.GOOGLE_PLAY_ACCESS_TOKEN
    console.error(token ? error.message.split(token).join('[redacted]') : error.message)
    process.exitCode = 1
  })
}
