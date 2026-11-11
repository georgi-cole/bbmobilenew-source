import { memo, useEffect, useState } from 'react'

type Props = { startedAt: number; active: boolean; pausedAt?: number | null }

/** Clock ticks must not reconcile the card board or restart its artwork. */
export const HouseOfCardsElapsedTime = memo(function HouseOfCardsElapsedTime(props: Props) {
  return <ElapsedClock key={props.startedAt} {...props} />
})

function ElapsedClock({ startedAt, active, pausedAt = null }: Props) {
  const [seconds, setSeconds] = useState(() =>
    active ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0
  )
  useEffect(() => {
    if (!active || pausedAt !== null) return
    let timer: ReturnType<typeof setInterval> | undefined
    const update = () => setSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
    const resume = () => {
      clearInterval(timer)
      update()
      if (active && !document.hidden) timer = setInterval(update, 250)
    }
    resume()
    document.addEventListener('visibilitychange', resume)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', resume)
    }
  }, [startedAt, active, pausedAt])
  const displayedSeconds =
    pausedAt === null ? seconds : Math.max(0, Math.floor((pausedAt - startedAt) / 1000))
  return <strong>{displayedSeconds}s</strong>
}
