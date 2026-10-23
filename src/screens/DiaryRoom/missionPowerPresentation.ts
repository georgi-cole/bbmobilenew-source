import type { GameState } from '../../types'
import { MISSION_POWER_LABELS } from '../../bb/missionPowers'

export function getMissionPowerPresentation(game: GameState) {
  const pending = game.missionPowers?.decision
  const reward = game.secretMission?.reward
  const target = game.players.find((p) => p.id === game.missionPowers?.safetyIntent?.targetId)?.name
  const holder = game.players.find((p) => p.id === game.lohId)?.name ?? 'today’s leader'
  const prompts: Record<string, string> = {
    storeConflict:
      'Two powers, one spotlight. Keep your Store power today, or switch to your Secret Mission power?',
    noAmbush:
      'The block is about to shift. Will you use No Ambush to keep your name out of the backup selection?',
    overthrowLoh: `${holder} won the competition—but you can take the crown. Will you overthrow the LOH?`,
    coLoh: `Want a seat beside ${holder}? Use Co-LOH to share today’s crown and nomination power.`,
    vetoSafety: `The Safety holder intends to save ${target ?? 'a nominee'}. Will you shut down that save and leave the block unchanged?`,
    pickBackup: 'The LOH is about to name a backup. Will you take control of that choice?',
    backupTarget: 'The replacement is your call. Choose an eligible hubmate to put on the block.',
  }
  const tradeoffs: Record<string, string> = {
    storeConflict:
      'Switching returns unused Store powers to inventory. Keeping Store priority does not pause your mission deadline.',
    noAmbush:
      'Accept and you are protected from backups for this Safety ceremony. It does not remove an opening nomination. Decline and this one-ceremony power is spent.',
    overthrowLoh:
      'Accept and you take the LOH’s authority and outgoing-leader obligations. The competition result stays on record. Decline and the power is spent.',
    coLoh:
      'Each leader names one nominee. Neither casts an ordinary eviction vote; the Safety holder breaks a tie. Both sit out tomorrow unless it is Democracia. Declining keeps your remaining window.',
    vetoSafety:
      'Accept and nobody is saved by this use of Safety; the original nominees remain in danger. The Safety winner keeps their competition win. Declining keeps your remaining window.',
    pickBackup:
      'Accept to choose one legal backup instead of the LOH. The choice is yours and the power is spent when you confirm a nominee. Declining keeps your remaining window.',
    backupTarget:
      'You cannot pick yourself, a leader, the Safety holder, a saved player, or anyone else protected. Confirming spends the power.',
  }
  return {
    key: `${pending?.id ?? ''}:${pending?.kind ?? ''}`,
    title:
      pending?.kind === 'storeConflict'
        ? 'Store or Secret Mission?'
        : reward && reward.type in MISSION_POWER_LABELS
          ? MISSION_POWER_LABELS[reward.type as keyof typeof MISSION_POWER_LABELS]
          : 'Secret Mission Power',
    prompt: prompts[pending?.kind ?? ''] ?? 'Big Eye is waiting for your decision.',
    consequence: `${tradeoffs[pending?.kind ?? ''] ?? ''} ${reward?.activeUntilDay ? `Your window closes after Day ${reward.activeUntilDay}. Shock days still count.` : ''}`,
  }
}
