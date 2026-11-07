import { act } from '@testing-library/react'
import { vi } from 'vitest'

/** Flush runtime preparation before advancing the host's skipped countdown. */
export async function startHostedMinigame(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
  await act(async () => {
    vi.runAllTimers()
  })
}
