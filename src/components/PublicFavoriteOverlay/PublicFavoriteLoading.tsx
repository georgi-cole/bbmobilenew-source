import './PublicFavoriteLoading.css'

/** The same opaque cover spans state initialization and a cold vote bundle. */
export default function PublicFavoriteLoading({ behindHost = false }: { behindHost?: boolean }) {
  return (
    <div
      className={`pf-loading${behindHost ? ' pf-loading--behind-host' : ''}`}
      role={behindHost ? undefined : 'status'}
      aria-label={behindHost ? undefined : 'Preparing Public Favorite vote'}
      aria-hidden={behindHost || undefined}
    >
      <svg className="pf-loading__eye" viewBox="0 0 160 100" fill="none" aria-hidden="true">
        <path d="M7 50C29 21 53 9 80 9s51 12 73 41c-22 29-46 41-73 41S29 79 7 50Z" />
        <circle cx="80" cy="50" r="24" />
        <circle className="pf-loading__iris" cx="80" cy="50" r="10" />
        <path d="M25 50h18m74 0h18" />
      </svg>
    </div>
  )
}
