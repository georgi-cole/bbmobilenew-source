import { useState } from 'react'
import {
  GAME_CONFIG_PUBLISH_TARGET,
  publishConfigAsPullRequest,
  publishConfigDirectly,
  readConfigSource,
} from '../../remoteConfig/githubConfigPublisher'
import type { RemoteConfig } from '../../remoteConfig/remoteConfigTypes'
import { repairRemoteConfigTextEncoding } from '../../remoteConfig/remoteConfigService'
import './ManagerPublishBar.css'

type Props = {
  managerName: string
  exportFileName: string
  getPatch: () => Partial<RemoteConfig>
}

function mergeRemoteConfig(base: RemoteConfig, patch: Partial<RemoteConfig>): RemoteConfig {
  return {
    ...base,
    ...patch,
    ...(patch.season
      ? {
          season: {
            ...base.season,
            ...patch.season,
            ...(patch.season.music
              ? { music: { ...base.season?.music, ...patch.season.music } }
              : {}),
          },
        }
      : {}),
  }
}

function downloadJson(fileName: string, value: unknown): void {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

export default function ManagerPublishBar({ managerName, exportFileName, getPatch }: Props) {
  const [token, setToken] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  const exportChanges = () => {
    downloadJson(exportFileName, repairRemoteConfigTextEncoding(getPatch() as RemoteConfig))
    setStatus('Export downloaded. You can keep it as a backup or inspect it before publishing.')
  }

  const publish = async (mode: 'pr' | 'main') => {
    if (!token.trim()) {
      setStatus('Enter a GitHub token with repository Contents and Pull requests permission.')
      return
    }
    if (mode === 'main' && !window.confirm(`Publish ${managerName} changes directly to main?`))
      return

    setBusy(true)
    setStatus('Loading the current source configuration…')
    try {
      const target = GAME_CONFIG_PUBLISH_TARGET
      const auth = token.trim()
      const current = await readConfigSource(auth, target)
      const config = mergeRemoteConfig(current.config, getPatch())
      const result =
        mode === 'pr'
          ? await publishConfigAsPullRequest(auth, target, config, current.sha)
          : await publishConfigDirectly(auth, target, config, current.sha)
      setStatus(
        mode === 'pr'
          ? `Pull request #${result.pullRequestNumber ?? ''} created: ${result.url}`
          : `Published to main: ${result.url}`
      )
      setToken('')
    } catch (error) {
      setStatus(`Publish failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="manager-publish" aria-label={`${managerName} export and publishing`}>
      <div className="manager-publish__copy">
        <strong>Save {managerName} changes for users</strong>
        <span>Export a backup, create a review PR, or publish directly to main.</span>
      </div>
      <div className="manager-publish__controls">
        <label>
          GitHub token
          <input
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="Token stays in this tab only"
            autoComplete="off"
          />
        </label>
        <div className="manager-publish__actions">
          <button type="button" onClick={exportChanges} disabled={busy}>
            Export JSON
          </button>
          <button type="button" onClick={() => void publish('pr')} disabled={busy}>
            {busy ? 'Working…' : 'Create PR'}
          </button>
          <button
            type="button"
            className="manager-publish__main"
            onClick={() => void publish('main')}
            disabled={busy}
          >
            Publish to main
          </button>
        </div>
      </div>
      {status && (
        <p className="manager-publish__status" role="status">
          {status}
        </p>
      )}
      <small>
        PR is recommended. Direct main publishing immediately changes the live configuration after
        deployment.
      </small>
    </section>
  )
}
