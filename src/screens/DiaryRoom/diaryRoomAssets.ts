import type { CSSProperties } from 'react'

export const CONFESSIONAL_PAINTING_SRC = `${import.meta.env.BASE_URL}assets/diary-room/confessional-painting.webp`
export const CONFESSIONAL_DOOR_SRC = `${import.meta.env.BASE_URL}assets/diary-room/confessional-locked-door.webp`
export const TRIBUNAL_BACKDROP_SRC = `${import.meta.env.BASE_URL}assets/diary-room/tribunal-sequester.webp`

export const CONFESSIONAL_PAINTING_STYLE = {
  '--diary-room-confessional-painting': `url("${CONFESSIONAL_PAINTING_SRC}")`,
} as CSSProperties

export const TRIBUNAL_BACKDROP_STYLE = {
  '--diary-room-tribunal-backdrop': `url("${TRIBUNAL_BACKDROP_SRC}")`,
} as CSSProperties
