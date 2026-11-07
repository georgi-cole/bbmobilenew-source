import type { Page, TestInfo } from '@playwright/test'
import { writeFile } from 'node:fs/promises'

/** Attach the last jury stages and current UI/state so a timeout is diagnosable. */
export async function attachJuryDiagnostics(page: Page, testInfo: TestInfo): Promise<void> {
  const diagnostic = await page
    .evaluate(() => {
      const performance = window.__bbGamePerformance?.snapshot()
      if (!performance?.juryEvents.length) return null
      const state = window.__bbE2EState?.snapshot()
      const nowMs = window.performance.now()
      const pendingTimers = [
        {
          scheduled: 'tribunal-clue-scheduled',
          completed: ['tribunal-clue-timer-fired', 'tribunal-clue-timer-cancelled'],
          delayField: 'delayMs',
        },
        {
          scheduled: 'tribunal-recap-scheduled',
          completed: ['tribunal-recap-timer-fired', 'tribunal-recap-timer-cancelled'],
          delayField: 'delayMs',
        },
        {
          scheduled: 'tribunal-winner-handoff-scheduled',
          completed: [
            'tribunal-winner-handoff-timer-fired',
            'tribunal-winner-handoff-timer-cancelled',
          ],
          delayField: 'delayMs',
        },
        {
          scheduled: 'jury-reveal-timers-scheduled',
          completed: ['jury-reveal-skipped', 'jury-reveal-timers-cleared'],
          delayField: 'actionsDueMs',
        },
      ].flatMap(({ scheduled, completed, delayField }) => {
        const event = [...performance.juryEvents].reverse().find(({ name }) => name === scheduled)
        if (!event) return []
        if (
          performance.juryEvents.some(
            ({ name, atMs, detail }) =>
              atMs > event.atMs &&
              (completed.includes(name) ||
                (scheduled === 'jury-reveal-timers-scheduled' &&
                  name === 'jury-reveal-stage' &&
                  detail.stage === 'actions'))
          )
        ) {
          return []
        }
        const plannedDelayMs = Number(event.detail[delayField] ?? 0)
        const elapsedMs = Math.round(nowMs - event.atMs)
        return [
          {
            name: scheduled,
            elapsedMs,
            plannedDelayMs,
            overdueMs: Math.max(0, elapsedMs - plannedDelayMs),
          },
        ]
      })
      const isVisible = (element: Element) => {
        const bounds = element.getBoundingClientRect()
        return bounds.width > 0 && bounds.height > 0
      }
      const visibleDialogs = [...document.querySelectorAll('[role="dialog"]')]
        .filter(isVisible)
        .map((dialog) => ({
          name: dialog.getAttribute('aria-label') ?? '',
          buttons: [...dialog.querySelectorAll('button')]
            .filter(isVisible)
            .map((button) => button.getAttribute('aria-label') ?? button.textContent?.trim() ?? ''),
        }))
      return {
        capturedAt: new Date().toISOString(),
        documentHidden: document.hidden,
        gamePhase: state?.game.phase ?? null,
        day: state?.game.week ?? null,
        seasonFinalePhase: state?.game.seasonFinale?.phase ?? null,
        finale: state?.finale
          ? {
              isActive: state.finale.isActive,
              isComplete: state.finale.isComplete,
              revealedCount: state.finale.revealedCount,
              expectedJurors: state.finale.revealOrder.length,
              awaitingHumanJurorId: state.finale.awaitingHumanJurorId,
            }
          : null,
        visibleDialogs,
        pendingTimers,
        events: performance.juryEvents,
        recentLongTasks: performance.samples
          .filter((sample) => sample.kind === 'long-task')
          .slice(-20),
        recentFrameGaps: performance.samples
          .filter((sample) => sample.kind === 'frame-gap')
          .slice(-20),
      }
    })
    .catch(() => null)
  if (!diagnostic) return
  const body = JSON.stringify(diagnostic, null, 2)
  await writeFile(testInfo.outputPath('jury-transition.json'), body, 'utf8')
  await testInfo.attach('jury-transition.json', {
    body,
    contentType: 'application/json',
  })
}
