import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import {
  selectCurrentProfile,
  selectEyeoleanBalance,
  selectEyeoleanInventory,
  selectEyeoleanPowerReservations,
  getEyeoleanPowerSeasonProgress,
} from '../../store/profilesSlice'
import {
  EYEOLEAN_STORE_PRODUCT_KEYS,
  getEyeoleanStoreProduct,
  type EyeoleanStoreProductKey,
} from '../../economy/storeCatalog'
import { armEyeoleanPower, disarmEyeoleanPower } from '../../economy/eyeoleanPowerLifecycle'
import {
  getEyeoleanPowerArmAvailability,
  getEyeoleanPowerModeResolution,
  isEyeoleanPowerDisarmLocked,
  isEyeoleanPowerEndgameLocked,
} from '../../economy/eyeoleanPowerRules'
import { canStoreNominationProtectionAffectPlayer } from '../../store/gameSlice'

const EARNED_POWER_LABELS: Record<string, string> = {
  doubleVote: 'Double Vote',
  voteDeduction: 'Vote Deduction',
  immunity: 'Secret Immunity',
}

function powerDetail(
  game: Parameters<typeof getEyeoleanPowerModeResolution>[0],
  productKey: EyeoleanStoreProductKey
): string {
  const rule = getEyeoleanPowerModeResolution(game, productKey).rule
  return rule?.available ? rule.detail : 'Unavailable in this season format.'
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
  const [selectedProtectionTarget, setSelectedProtectionTarget] = useState('')

  const human = game.players.find((player) => player.isUser)
  const endgameLocked = isEyeoleanPowerEndgameLocked(game)
  const disarmLocked = isEyeoleanPowerDisarmLocked(game)
  const protectionTargets = useMemo(
    () =>
      game.players.filter(
        (player) => !player.isUser && canStoreNominationProtectionAffectPlayer(game, player.id)
      ),
    [game]
  )

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
              ? 'Can reduce one vote when you are nominated at an eligible elimination vote.'
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
    if (will.reward === 'extra_vote' && will.extraVotePending) {
      return {
        source: "Bella's Will",
        title: 'Inherited Extra Vote',
        detail:
          'Automatic. It has priority over a purchased Extra Vote for the same elimination vote.',
      }
    }
    if (will.reward === 'remove_vote' && will.voteRemovalPending) {
      return {
        source: "Bella's Will",
        title: 'Inherited Vote Removal',
        detail:
          'Automatic. It has priority over a purchased Remove a Vote for the same elimination vote.',
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
    const result = dispatch(
      armEyeoleanPower(
        productKey,
        productKey === 'protection' ? selectedProtectionTarget : undefined
      )
    )
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
        <div className="diary-room__wallet-balance-copy">
          <span className="diary-room__wallet-coin" aria-hidden="true" />
          <div className="diary-room__wallet-balance-meta">
            <strong>{balance.toLocaleString('en-US')}</strong>
            <small>Eyeoleans</small>
          </div>
        </div>
        <button
          type="button"
          className="diary-room__wallet-store-btn"
          onClick={() =>
            navigate('/store', { state: { returnTo: '/diary-room', shelf: 'powers' } })
          }
        >
          Store
        </button>
      </div>

      <div className="diary-room__wallet-section-heading">
        <div>
          <span className="diary-room__wallet-eyebrow">Powers</span>
          <h2>Inventory</h2>
        </div>
        <p>Arm powers for their next eligible round in this season format.</p>
      </div>

      <div className="diary-room__wallet-power-list">
        {EYEOLEAN_STORE_PRODUCT_KEYS.map((productKey) => {
          const product = getEyeoleanStoreProduct(productKey)
          const reservation = reservations[productKey]
          const armed = reservation?.gameId === game.gameId
          const inventoryCount = Math.max(0, Math.floor(inventory[productKey] ?? 0))
          const totalOwned = inventoryCount + (armed ? 1 : 0)
          const availability = getEyeoleanPowerArmAvailability(game, productKey)
          const seasonProgress = getEyeoleanPowerSeasonProgress(
            profile,
            productKey,
            game.gameId,
            game.season
          )
          const seasonLimitReached = seasonProgress.uses >= product.maxSeasonUses
          const modeRule = getEyeoleanPowerModeResolution(game, productKey).rule
          const targetSelected =
            productKey !== 'protection' ||
            protectionTargets.some((player) => player.id === selectedProtectionTarget)
          const canArm =
            Boolean(profile) &&
            inventoryCount > 0 &&
            availability.available &&
            !seasonLimitReached &&
            !armed &&
            targetSelected
          const canDisarm = armed && !disarmLocked
          const status = armed
            ? disarmLocked
              ? 'Locked for tonight'
              : 'Armed'
            : endgameLocked
              ? 'Unavailable this season'
              : seasonLimitReached
                ? 'Season limit reached'
                : !availability.available
                  ? 'Later'
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
                {productKey === 'extra_vote'
                  ? '2×'
                  : productKey === 'remove_vote'
                    ? '−1'
                    : productKey === 'immunity'
                      ? '✦'
                      : '🛡️'}
              </div>
              <div className="diary-room__wallet-power-copy">
                <div className="diary-room__wallet-power-title">
                  <h3>{modeRule?.available ? modeRule.title : product.title}</h3>
                  <span data-status={armed ? 'armed' : 'idle'}>{status}</span>
                  <span className="diary-room__wallet-owned" title="Owned">
                    ×{totalOwned}
                  </span>
                  <span
                    className="diary-room__wallet-usage"
                    title="Season uses"
                    aria-label={`Season uses ${seasonProgress.uses} of ${product.maxSeasonUses}`}
                  >
                    {seasonProgress.uses}/{product.maxSeasonUses}
                  </span>
                </div>
                <p>{powerDetail(game, productKey)}</p>
              </div>
              <div className="diary-room__wallet-power-action">
                {productKey === 'protection' && !armed && (
                  <label className="diary-room__wallet-target">
                    <span>Protect another player</span>
                    <select
                      aria-label="Choose a player for Protection"
                      value={selectedProtectionTarget}
                      onChange={(event) => setSelectedProtectionTarget(event.target.value)}
                      disabled={
                        !availability.available || seasonLimitReached || inventoryCount <= 0
                      }
                    >
                      <option value="">Choose a player</option>
                      {protectionTargets.map((player) => (
                        <option value={player.id} key={player.id}>
                          {player.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
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
                    Arm
                  </button>
                ) : (
                  <button
                    type="button"
                    className="diary-room__wallet-secondary-btn"
                    onClick={() =>
                      navigate('/store', { state: { returnTo: '/diary-room', shelf: 'powers' } })
                    }
                  >
                    Get
                  </button>
                )}
                {!armed && inventoryCount > 0 && seasonLimitReached && (
                  <small>Season limit reached.</small>
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
              <article
                className="diary-room__wallet-earned-card"
                key={`${power.source}:${power.title}`}
              >
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
