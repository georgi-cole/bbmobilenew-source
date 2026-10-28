import type { TvEvent } from '../types'

export const GUEST_SAVE_REMINDER_COPY =
  "You're playing as a guest. Create a profile to save your season."
const reminderIdentity = new WeakMap<TvEvent, boolean>()

const LEGACY_GUEST_SAVE_REMINDER_COPY = new Set(
  [
    "You're playing as a guest, so your progress won't be saved. Go to More → Profile → Create Profile to save it.",
    "You're playing as a guest, so this season won't be saved. Create a profile from More, then Profile, to keep your progress.",
  ].map((copy) =>
    copy.toLowerCase().replace(/→/g, ' then ').replace(/[.!]/g, '').replace(/\s+/g, ' ').trim()
  )
)

function normalizeReminderCopy(copy: string): string {
  return copy.toLowerCase().replace(/→/g, ' then ').replace(/[.!]/g, '').replace(/\s+/g, ' ').trim()
}

export function isGuestSaveReminderEvent(event: TvEvent | null | undefined): event is TvEvent {
  if (!event) return false
  const cached = Object.isFrozen(event) ? reminderIdentity.get(event) : undefined
  if (cached !== undefined) return cached
  const result =
    event.meta?.guestModeSaveWarning === true ||
    LEGACY_GUEST_SAVE_REMINDER_COPY.has(normalizeReminderCopy(event.text))
  if (Object.isFrozen(event)) reminderIdentity.set(event, result)
  return result
}

/** Upgrade only known pre-marker copies while restoring a saved game. */
export function normalizeGuestSaveReminderEvent(event: TvEvent): TvEvent {
  if (!LEGACY_GUEST_SAVE_REMINDER_COPY.has(normalizeReminderCopy(event.text))) return event

  const reminder = { ...event }
  delete reminder.major
  const meta = { ...(event.meta ?? {}) }
  delete meta.major
  return {
    ...reminder,
    text: GUEST_SAVE_REMINDER_COPY,
    meta: {
      ...meta,
      phase: meta.phase ?? 'loh_comp_announcement',
      week: meta.week ?? 1,
      broadcastDelivery: 'next',
      broadcastLevel: 'minor',
      broadcastManaged: true,
      forceOnTv: true,
      guestModeSaveWarning: true,
    },
  }
}
