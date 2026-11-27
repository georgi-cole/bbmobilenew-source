import { WHEEL_SECTORS } from '../../../features/riskWheel/riskWheelSlice'

export const SECTOR_ANGLE = 360 / WHEEL_SECTORS.length

const format = new Intl.NumberFormat('en', { maximumFractionDigits: 2, signDisplay: 'exceptZero' })
export const formatBalance = (score: number) => format.format(score).replace('-', '−')
