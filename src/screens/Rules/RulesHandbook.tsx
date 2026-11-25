import { useState } from 'react'
import { useNavigate } from 'react-router'
import GameBackButton from '../../components/ui/GameBackButton/GameBackButton'
import './Rules.css'

export type RulesChapter = {
  title: string
  intro: string
  cards: ReadonlyArray<{ title: string; copy: string }>
  note?: string
}

export type RulesSegment = {
  label: string
  title: string
  summary: string
  image: string
  rundown?: { goal: string; beats: readonly { label: string; copy: string }[] }
  prediction?: {
    question: string
    choices: readonly { label: string; feedback: string }[]
  }
  chapters: readonly RulesChapter[]
}

interface RulesHandbookProps {
  title: string
  segments: readonly [RulesSegment, ...RulesSegment[]]
}

export default function RulesHandbook({ title, segments }: RulesHandbookProps) {
  const navigate = useNavigate()
  const [active, setActive] = useState(0)
  const [activeBeat, setActiveBeat] = useState<number | null>(null)
  const [answer, setAnswer] = useState<number | null>(null)
  const segment = segments[active] ?? segments[0]
  const { prediction, rundown } = segment

  return (
    <section className="rules-broadcast" aria-labelledby="rules-broadcast-title">
      <header className="rules-broadcast__header">
        <GameBackButton onClick={() => navigate(-1)} />
        <div>
          <p className="rules-broadcast__brand">The Big Eye</p>
          <h1 id="rules-broadcast-title">{title}</h1>
        </div>
      </header>

      <nav className="rules-broadcast__channels" aria-label="Browse the guide">
        {segments.map((channel, index) => (
          <button
            key={channel.label}
            type="button"
            aria-pressed={index === active}
            onClick={() => {
              setActive(index)
              setActiveBeat(null)
              setAnswer(null)
            }}
          >
            {channel.label}
          </button>
        ))}
      </nav>

      <section className="rules-broadcast__monitor">
        <div className="rules-broadcast__shot">
          <img
            className="rules-broadcast__backdrop"
            src={`${import.meta.env.BASE_URL}assets/${segment.image}`}
            alt=""
          />
          <div className="rules-broadcast__tally" aria-hidden="true">
            <span />
            On air
          </div>
          <div className="rules-broadcast__caption" aria-live="polite">
            <h2>{segment.title}</h2>
            <p>{segment.summary}</p>
          </div>
        </div>

        {rundown && (
          <>
            <ol className="rules-broadcast__rundown" aria-label="Order of events">
              {rundown.beats.map((beat, index) => (
                <li key={beat.label}>
                  <button
                    type="button"
                    aria-pressed={activeBeat === index}
                    onClick={() => setActiveBeat(activeBeat === index ? null : index)}
                  >
                    {beat.label}
                  </button>
                </li>
              ))}
            </ol>
            <p className="rules-broadcast__goal" aria-live="polite">
              {activeBeat === null ? rundown.goal : rundown.beats[activeBeat]?.copy}
            </p>
          </>
        )}

        {prediction && (
          <div className="rules-broadcast__prediction">
            <h3>Make the call</h3>
            <p>{prediction.question}</p>
            <div className="rules-broadcast__choices">
              {prediction.choices.map((choice, index) => (
                <button
                  key={choice.label}
                  type="button"
                  aria-pressed={answer === index}
                  onClick={() => setAnswer(index)}
                >
                  {choice.label}
                </button>
              ))}
            </div>
            <p className="rules-broadcast__feedback" role="status">
              {answer === null ? '' : prediction.choices[answer]?.feedback}
            </p>
          </div>
        )}
      </section>

      <section className="rules-broadcast__reference" aria-labelledby="rules-broadcast-details">
        <h2 id="rules-broadcast-details">Behind the scenes</h2>
        {segment.chapters.map((chapter) => (
          <details className="rules-broadcast__details" key={chapter.title}>
            <summary>{chapter.title}</summary>
            <div className="rules-broadcast__reading">
              <p>{chapter.intro}</p>
              <dl>
                {chapter.cards.map((card) => (
                  <div key={card.title}>
                    <dt>{card.title}</dt>
                    <dd>{card.copy}</dd>
                  </div>
                ))}
              </dl>
              {chapter.note && <p className="rules-broadcast__note">{chapter.note}</p>}
            </div>
          </details>
        ))}
      </section>
    </section>
  )
}
