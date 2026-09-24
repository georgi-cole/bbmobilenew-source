import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import {
  selectCurrentProfile,
  selectEyeoleanBalance,
  selectEyeoleanInventory,
  selectEyeoleanPowerReservations,
} from '../../store/profilesSlice'
import {
  EYEOLEAN_STORE_PRODUCT_KEYS,
  getEyeoleanStoreProduct,
  type EyeoleanStoreProductKey,
} from '../../economy/storeCatalog'
import {
  armEyeoleanPower,
  disarmEyeoleanPower,
} from '../../economy/eyeoleanPowerLifecycle'
import {
  getEyeoleanPowerArmAvailability,
  isEyeoleanPowerDisarmLocked,
  isEyeoleanPowerEndgameLocked,
} from '../../economy/eyeoleanPowerRules'

const EARNED_POWER_LABELS: Record<string, string> = {
  doubleVote: 'Double Vote',
  voteDeduction: 'Vote Deduction',
  immunity: 'Secret Immunity',
}

function powerDetail(productKey: EyeoleanStoreProductKey): string {
  return productKey === 'extra_vote'
    ? 'Triggers only when you can legally cast a standard house vote. If another extra-ballot power has priority, this one waits.'
    : 'Triggers only when you are nominated and receive at least one legal vote. It reduces the effective tally by one while preserving the raw ballots.'
}

export default function ConfessionalWallet() {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const game = useAppSelector((state) => state.game)
  const profile = useAppSelector(selectCurrentProfile)
  const balance = useAppSelector(selectEyeoleanBalance)
  const inventory = useAppSelector(selectEyeoleanInventory)
  const reservations = useAppSelector(selectEyeoleanPowerReservations)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const human = game.players.find((player) => player.isUser)
  const endgameLocked = isEyeoleanPowerEndgameLocked(game)
  const disarmLocked = isEyeoleanPowerDisarmLocked(game)

  const activeEarnedPower = useMemo(() => {
    const reward = game.secretMission?.reward
    if (
      game.secretMission?.status === 'rewardClaimed' &&
      reward?.eligible &&
      !reward.consumed &&
      !reward.expired &&
      reward.type !== 'plus1000Influence' &&
      reward.type !== 'emptyBox'
    ) {
      return {
        source: 'Secret Mission',
        title: EARNED_POWER_LABELS[reward.type] ?? reward.type,
        detail:
          reward.type === 'doubleVote'
            ? 'Offered automatically at the next eligible live vote.'
            : reward.type === 'voteDeduction'
              ? 'Can reduce one vote when you are nominated at an eligible eviction.'
              : `Temporary protection for ${reward.durationDays ?? 1} day${(reward.durationDays ?? 1) === 1 ? '' : 's'}.`,
      }
    }
    return null
  }, [game.secretMission])

  const bellaPower = useMemo(() => {
    const will = game.bellaWill
    if (!human || !will?.active || !will.inherited || will.heirId !== human.id || !will.reward) {
      return null
    }
    if (
      will.reward === 'extra_vote' &&
      will.extraVotePending
    ) {
      return {
        source: "Bella's Will",
        title: 'Inherited Extra Vote',
        detail: 'Automatic. It has priority over a purchased Extra Vote for the same eviction.',
      }
    }
    if (
      will.reward === 'remove_vote' &&
      will.voteRemovalPending
    ) {
      return {
        source: "Bella's Will",
        title: 'Inherited Vote Removal',
        detail: 'Automatic. It has priority over a purchased Remove a Vote for the same eviction.',
      }
    }
    if (will.reward === 'immunity_2_days' && will.immunityDaysRemaining > 0) {
      return {
        source: "Bella's Will",
        title: 'Inherited Immunity',
        detail: `${will.immunityDaysRemaining} protected day${will.immunityDaysRemaining === 1 ? '' : 's'} remaining.`,
      }
    }
    return null
  }, [game.bellaWill, human])

  function handleArm(productKey: EyeoleanStoreProductKey) {
    setNotice(null)
    setError(null)
    const result = dispatch(armEyeoleanPower(productKey))
    if (result.ok) setNotice(result.message)
    else setError(result.message)
  }

  function handleDisarm(productKey: EyeoleanStoreProductKey) {
    setNotice(null)
    setError(null)
    const result = dispatch(disarmEyeoleanPower(productKey))
    if (result.ok) setNotice(result.message)
    else setError(result.message)
  }

  return (
    <section className="diary-room__wallet" aria-label="Eyeolean wallet and powers">
      <div className="diary-room__wallet-balance-card">
        <div>
          <span className="diary-room__wallet-eyebrow">Eyeolean wallet</span>
          <strong>{balance.toLocaleString('en-US')}</strong>
          <small>Eyeoleans</small>
        </div>
        <button
          type="button"
          className="diary-room__wallet-store-btn"
          onClick={() => navigate('/store', { state: { returnTo: '/diary-room' } })}
        >
          Open Store
        </button>
      </div>

      <div className="diary-room__wallet-section-heading">
        <div>
          <span className="diary-room__wallet-eyebrow">Purchased powers</span>
          <h2>Your inventory</h2>
        </div>
        <p>
          Arm a power here. It is consumed only when its effect actually applies. Unused armed
          powers return to inventory at Final 4, elimination, or season reset.
        </p>
      </div>

      <div className="diary-room__wallet-power-list">
        {EYEOLEAN_STORE_PRODUCT_KEYS.map((productKey) => {
          const product = getEyeoleanStoreProduct(productKey)
          const reservation = reservations[productKey]
          const armed = reservation?.gameId === game.gameId
          const inventoryCount = Math.max(0, Math.floor(inventory[productKey] ?? 0))
          const totalOwned = inventoryCount + (armed ? 1 : 0)
          const availability = getEyeoleanPowerArmAvailability(game, productKey)
          const canArm = Boolean(profile) && inventoryCount > 0 && availability.available && !armed
          const canDisarm = armed && !disarmLocked
          const status = armed
            ? disarmLocked
              ? 'Locked for tonight'
              : 'Armed'
            : endgameLocked
              ? 'Unavailable this season'
              : inventoryCount > 0
                ? 'Available'
                : 'Not owned'

          return (
            <article
              className={`diary-room__wallet-power${armed ? ' diary-room__wallet-power--armed' : ''}`}
              key={productKey}
            >
              <div
                className="diary-room__wallet-power-icon"
                data-product={productKey}
                aria-hidden="true"
              >
                {productKey === 'extra_vote' ? '2×' : '−1'}
              </div>
              <div className="diary-room__wallet-power-copy">
                <div className="diary-room__wallet-power-title">
                  <h3>{product.title}</h3>
                  <span data-status={armed ? 'armed' : 'idle'}>{status}</span>
                </div>
                <p>{powerDetail(productKey)}</p>
                <small>
                  Owned {totalOwned}
                  {armed ? ` · armed on Day ${reservation?.armedWeek ?? game.week}` : ''}
                </small>
              </div>
              <div className="diary-room__wallet-power-action">
                {armed ? (
                  <button
                    type="button"
                    className="diary-room__wallet-secondary-btn"
                    disabled={!canDisarm}
                    onClick={() => handleDisarm(productKey)}
                  >
                    {disarmLocked ? 'Locked' : 'Disarm'}
                  </button>
                ) : inventoryCount > 0 ? (
                  <button
                    type="button"
                    className="diary-room__wallet-primary-btn"
                    disabled={!canArm}
                    onClick={() => handleArm(productKey)}
                  >
                    Use next eligible eviction
                  </button>
                ) : (
                  <button
                    type="button"
                    className="diary-room__wallet-secondary-btn"
                    onClick={() => navigate('/store', { state: { returnTo: '/diary-room' } })}
                  >
                    Get in Store
                  </button>
                )}
                {!armed && inventoryCount > 0 && !availability.available && (
                  <small>{availability.reason}</small>
                )}
              </div>
            </article>
          )
        })}
      </div>

      {(notice || error) && (
        <p
          className={`diary-room__wallet-notice${error ? ' diary-room__wallet-notice--error' : ''}`}
          role="status"
          aria-live="polite"
        >
          {error || notice}
        </p>
      )}

      {(activeEarnedPower || bellaPower) && (
        <section className="diary-room__wallet-earned" aria-label="Earned powers">
          <div className="diary-room__wallet-section-heading">
            <div>
              <span className="diary-room__wallet-eyebrow">Earned powers</span>
              <h2>Active game rewards</h2>
            </div>
          </div>
          {[activeEarnedPower, bellaPower]
            .filter((power): power is NonNullable<typeof power> => Boolean(power))
            .map((power) => (
              <article className="diary-room__wallet-earned-card" key={`${power.source}:${power.title}`}>
                <span>{power.source}</span>
                <strong>{power.title}</strong>
                <p>{power.detail}</p>
              </article>
            ))}
        </section>
      )}

      {endgameLocked && (
        <div className="diary-room__wallet-final4" role="status">
          <strong>Final 4 rules are locked.</strong>
          <p>
            Purchased voting powers cannot affect Final 4, Final 3, or Final 2. Any unused armed
            Store power is returned to inventory rather than lost.
          </p>
        </div>
      )}
    </section>
  )
}
