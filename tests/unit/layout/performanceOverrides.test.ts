import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// Vitest stubs imported CSS, including ?raw. Apply the shipped stylesheet to a
// representative GameScreen instead so these assertions exercise the cascade.
const performanceStyles = readFileSync(
  resolve(process.cwd(), 'src/styles/performanceOverrides.css'),
  'utf8'
)

const finiteModes = [
  { name: 'Classic', classes: '' },
  { name: "Cupid's Arrow", classes: ' game-screen--cupid-active game-screen--cupid-revealed' },
  { name: 'Vox Populi', classes: '' },
]

let stylesheet: HTMLStyleElement
let fixture: HTMLDivElement

beforeEach(() => {
  stylesheet = document.createElement('style')
  stylesheet.textContent = `
    .game-screen, .game-screen * { animation-play-state: running; }
    ${performanceStyles}
  `
  document.head.appendChild(stylesheet)
  if (!stylesheet.sheet) throw new Error('The performance stylesheet did not load')
  // jsdom drops element styles when their selector list also contains a
  // pseudo-element. These rules contain simple comma-separated selectors;
  // expanding each into its own rule preserves the browser cascade while
  // allowing computed-style coverage of the real production declarations.
  stylesheet.textContent = Array.from(stylesheet.sheet.cssRules)
    .map((rule) => {
      if (rule.type !== CSSRule.STYLE_RULE) return rule.cssText
      const styleRule = rule as CSSStyleRule
      return styleRule.selectorText
        .split(',')
        .map((selector) => `${selector} { ${styleRule.style.cssText} }`)
        .join('\n')
    })
    .join('\n')
  fixture = document.createElement('div')
  document.body.appendChild(fixture)
})

afterEach(() => {
  fixture.remove()
  stylesheet.remove()
  document.body.classList.remove('mode-surveyeval', 'minigame-portal-active')
})

function mountGameScreen({
  survival = false,
  evictionAtmosphere = true,
  classes = '',
}: {
  survival?: boolean
  evictionAtmosphere?: boolean
  classes?: string
} = {}) {
  document.body.classList.toggle('mode-surveyeval', survival)
  fixture.innerHTML = `
    <div class="game-screen${evictionAtmosphere ? ' game-screen--eviction-atmosphere' : ''}${classes}"
         data-game-mode="${survival ? 'survival' : 'classic'}">
      <section data-houseguest-roster="true" data-surveyeval-replacement="active">
        <ul>
          <li data-player-id="outgoing-robo">
            <div data-ceremony-tile="true">
              <span data-testid="shock"><i>⚡</i><b></b></span>
            </div>
          </li>
          <li data-player-id="incoming-robo" data-replacement-target="true">
            <div data-ceremony-tile="true"><img alt="Incoming contestant" /></div>
          </li>
        </ul>
      </section>
      <div class="tv-zone__viewport"><span data-testid="announcement">Elimination</span></div>
    </div>
  `
}

function playState(selector: string) {
  const element = fixture.querySelector(selector)
  if (!element) throw new Error(`Missing fixture element: ${selector}`)
  return getComputedStyle(element).animationPlayState
}

describe('gameplay animation performance isolation', () => {
  it('keeps the foreground Surveyeval elimination shock and its particles running', () => {
    mountGameScreen({ survival: true })

    expect(playState('[data-testid="shock"]')).toBe('running')
    expect(playState('[data-testid="shock"] i')).toBe('running')
    expect(playState('[data-testid="shock"] b')).toBe('running')
    expect(playState('.game-screen')).toBe('paused')
  })

  it('keeps the incoming Surveyeval replacement tile running during the elimination phase', () => {
    mountGameScreen({ survival: true })

    expect(playState('[data-replacement-target]')).toBe('running')
    expect(playState('[data-replacement-target] [data-ceremony-tile]')).toBe('running')
    expect(playState('[data-replacement-target] img')).toBe('running')
  })

  it.each(finiteModes)(
    'still pauses the background $name roster during elimination',
    ({ classes }) => {
      // Cupid and Vox use classic game.mode with their expansion state; Cupid
      // additionally marks GameScreen with these presentation classes.
      mountGameScreen({ classes })

      expect(playState('[data-player-id="outgoing-robo"]')).toBe('paused')
      expect(playState('[data-testid="shock"]')).toBe('paused')
      expect(playState('[data-replacement-target] [data-ceremony-tile]')).toBe('paused')
      expect(playState('[data-testid="announcement"]')).toBe('running')
    }
  )

  it('does not freeze the roster outside the elimination atmosphere', () => {
    mountGameScreen({ evictionAtmosphere: false })

    expect(playState('[data-player-id="outgoing-robo"]')).toBe('running')
    expect(playState('[data-replacement-target] [data-ceremony-tile]')).toBe('running')
  })

  it('still pauses Surveyeval when a portal minigame completely covers GameScreen', () => {
    mountGameScreen({ survival: true })
    document.body.classList.add('minigame-portal-active')

    expect(playState('[data-testid="shock"]')).toBe('paused')
    expect(playState('[data-testid="shock"] i')).toBe('paused')
    expect(playState('[data-replacement-target] [data-ceremony-tile]')).toBe('paused')
    expect(playState('[data-testid="announcement"]')).toBe('paused')
  })
})
