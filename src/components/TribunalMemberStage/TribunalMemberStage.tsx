import { useEffect, useState, type RefObject } from 'react'
import type { Player } from '../../types'
import { PUBLIC_JUROR_ID } from '../../store/finaleSlice'
import { finalePortraitAttire } from '../FinalFaceoff/finalePortraitAttire'
import type { BallotBeat } from '../FinalFaceoff/finaleTiming'
import FullSizeCutoutImage from '../FullSizeCutoutImage/FullSizeCutoutImage'
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar'
import './TribunalMemberStage.css'

interface TribunalOpeningProps {
  mode: 'opening'
  tribunalMembers: Player[]
  awaitingHumanPlayer?: Player
  finalists: Player[]
  onCastVote: (finalistId: string) => void
  waitingForOpeningCue: boolean
  paired?: boolean
}

interface TribunalVote {
  mode: 'reveal'
  beat?: BallotBeat
  ballotOrigin?: RefObject<HTMLElement | null>
  ballot?: {
    voter?: Player
    voterId: string
    voterName: string
    finalistName: string
    number: number
    tone: 'gold' | 'violet'
  }
}

function PublicCutoutPlaceholder() {
  return (
    <div className="tms-public-placeholder" aria-hidden="true">
      <span className="tms-public-globe" />
    </div>
  )
}

function TribunalOpening({
  tribunalMembers,
  awaitingHumanPlayer,
  finalists,
  onCastVote,
  waitingForOpeningCue,
  paired,
}: TribunalOpeningProps) {
  const [portraitIndex, setPortraitIndex] = useState(0)
  const stride = paired ? 2 : 1
  const portraitCount = Math.ceil(tribunalMembers.length / stride)

  useEffect(() => {
    if (!waitingForOpeningCue || portraitCount < 2) return
    const timer = window.setInterval(
      () => {
        setPortraitIndex((index) => (index + 1) % portraitCount)
      },
      paired ? 3600 : 2400
    )
    return () => window.clearInterval(timer)
  }, [paired, portraitCount, waitingForOpeningCue])

  if (awaitingHumanPlayer) {
    return (
      <div className="tms-stage tms-stage--human">
        <div className="tms-bg-vignette" aria-hidden="true" />
        <div className="tms-spotlight" aria-hidden="true" />
        <div className="tms-cutout-wrap" aria-hidden="true">
          <FullSizeCutoutImage
            player={awaitingHumanPlayer}
            attire={finalePortraitAttire(awaitingHumanPlayer, 'tribunal')}
            className="tms-cutout"
            alt=""
            draggable={false}
          />
        </div>
        <section className="tms-vote-prompt" aria-labelledby="tms-human-ballot-title">
          <h3 className="tms-vote-prompt__text" id="tms-human-ballot-title">
            Cast your Tribunal vote
          </h3>
          <div className="tms-vote-choices">
            {finalists.map((finalist) => (
              <button
                key={finalist.id}
                type="button"
                className="tms-vote-choice"
                aria-label={`Cast Tribunal vote for ${finalist.name}`}
                onClick={() => onCastVote(finalist.id)}
              >
                <PlayerAvatar player={finalist} size="sm" showRelationshipOutline={false} />
                <span className="tms-vote-choice__name">{finalist.name}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    )
  }

  const firstIndex = (portraitIndex % Math.max(portraitCount, 1)) * stride
  const featuredJuror = tribunalMembers[firstIndex]
  return (
    <div className="tms-portrait" role="region" aria-label="Tribunal members">
      <div className="tms-bg-vignette" aria-hidden="true" />
      <div className="tms-portrait__light" aria-hidden="true" />
      {paired ? (
        <div className="tms-pair" key={featuredJuror?.id}>
          {tribunalMembers.slice(firstIndex, firstIndex + stride).map((member) => (
            <figure className="tms-pair__member" key={member.id}>
              <div className="tms-pair__picture" aria-hidden="true">
                <FullSizeCutoutImage
                  player={member}
                  attire={finalePortraitAttire(member, 'tribunal')}
                  alt=""
                  draggable={false}
                />
              </div>
              <figcaption>{member.name}</figcaption>
            </figure>
          ))}
        </div>
      ) : (
        featuredJuror && (
          <div className="tms-portrait__carousel" key={featuredJuror.id}>
            <FullSizeCutoutImage
              player={featuredJuror}
              attire={finalePortraitAttire(featuredJuror, 'tribunal')}
              className="tms-portrait__carousel-cutout"
              alt=""
              draggable={false}
            />
            <div className="tms-portrait__carousel-caption">
              <strong>{featuredJuror.name}</strong>
            </div>
          </div>
        )
      )}
    </div>
  )
}

export default function TribunalMemberStage(props: TribunalOpeningProps | TribunalVote) {
  if (props.mode === 'opening') return <TribunalOpening {...props} />

  const { ballot, beat, ballotOrigin } = props
  const introducing = beat === 'lead'
  return (
    <div className="tms-stage tms-stage--ballot">
      <div className="visually-hidden" role="status" aria-atomic="true">
        {ballot &&
          (introducing
            ? `${ballot.voterName} voted for…`
            : `${ballot.voterName} voted for ${ballot.finalistName}.`)}
      </div>
      {ballot && (
        <div
          className="tms-shot"
          key={ballot.voterId}
          data-tone={introducing ? undefined : ballot.tone}
          data-beat={beat}
        >
          <div className="tms-shot__light" aria-hidden="true" />
          <div className="tms-cutout-wrap" aria-hidden="true">
            {ballot.voterId === PUBLIC_JUROR_ID ? (
              <PublicCutoutPlaceholder />
            ) : ballot.voter ? (
              <FullSizeCutoutImage
                player={ballot.voter}
                attire={finalePortraitAttire(ballot.voter, 'tribunal')}
                className="tms-cutout"
                alt=""
                draggable={false}
              />
            ) : null}
          </div>
          <div className="tms-shot__shade" aria-hidden="true" />
          <div className="tms-nameplate">
            <span className="tms-nameplate__sequence">
              Ballot {String(ballot.number).padStart(2, '0')}
            </span>
            {introducing ? (
              <p className="tms-ballot-lead" key="lead">
                <strong>{ballot.voterName}</strong>
                <span>voted for…</span>
              </p>
            ) : beat ? (
              <p className="tms-ballot-recipient" key="recipient">
                <strong ref={ballotOrigin}>{ballot.finalistName}</strong>
              </p>
            ) : (
              <>
                <span className="tms-nameplate__name">{ballot.voterName}</span>
                <p className="tms-ballot-call">
                  <span>Votes for</span>
                  <strong>{ballot.finalistName}</strong>
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
