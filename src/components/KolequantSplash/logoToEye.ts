export const LOGO_TO_EYE_MS = 1470

const CODONS = ['ATG', 'CGT', 'GCA', 'TTC', 'AAC', 'GGT', 'TCA', 'CTG', 'AGC', 'TGA']
const TURN = 2 * Math.PI
const IRIS_LOCK = 0.59

type Point = { x: number; y: number }
type Box = Point & { width: number; height: number }
type Fragment = Box & { tint: string; codon?: string }
type Eye = Point & { halfWidth: number; halfHeight: number; iris: number }
type EyeArtwork = Omit<Eye, keyof Point> & { centerY: number; glow: string }
type Layout = { viewport: Box; logo: Box; eye: Eye }

// The shipped portrait backgrounds share two compositions. These coordinates
// are fractions of the original artwork, before HomeHub's cover crop.
export function getEyeArtwork(url: string | null | undefined): EyeArtwork | null {
  const file = url?.match(/(?:^|\/)assets\/skins\/([^?#]+)/)?.[1]
  if (
    !file ||
    !/^(?:(?:daily|sunrise|sunset|rainy)-background|bg-night|themes\/(?:weather|holiday)-[\w-]+)\.jpg$/.test(
      file
    )
  ) {
    return null
  }

  const night = file.endsWith('-night.jpg')
  return {
    centerY: night ? 0.254 : 0.224,
    halfWidth: night ? 0.169 : 0.21,
    halfHeight: night ? 0.048 : 0.061,
    iris: night ? 0.066 : 0.082,
    glow: /sunrise|sunset|christmas|halloween/.test(file) ? '#ffc59e' : '#92daff',
  }
}

function phase(value: number, start: number, end: number) {
  return Math.min(1, Math.max(0, (value - start) / (end - start)))
}

function smooth(value: number) {
  return value * value * (3 - 2 * value)
}

function sampleLogo(logo: HTMLImageElement): Fragment[] {
  const sampler = document.createElement('canvas')
  sampler.width = 224
  sampler.height = Math.round((sampler.width * logo.naturalHeight) / logo.naturalWidth)
  const context = sampler.getContext('2d', { willReadFrequently: true })
  if (!context) return []

  context.drawImage(logo, 0, 0, sampler.width, sampler.height)
  const { data } = context.getImageData(0, 0, sampler.width, sampler.height)
  const cells: Fragment[] = []
  const step = 7
  for (let x = 0; x < sampler.width; x += step) {
    const columnStart = cells.length
    for (let y = 0; y < sampler.height; y += step) {
      const width = Math.min(step, sampler.width - x)
      const height = Math.min(step, sampler.height - y)
      let pixels = 0
      let red = 0
      let green = 0
      let blue = 0
      for (let row = y; row < y + height; row += 1) {
        for (let col = x; col < x + width; col += 1) {
          const offset = (row * sampler.width + col) * 4
          if (data[offset + 3] <= 48) continue
          pixels += 1
          red += data[offset]
          green += data[offset + 1]
          blue += data[offset + 2]
        }
      }
      if (pixels < 3) continue
      const color = [red, green, blue].map((channel) => Math.round(103 + (channel / pixels) * 0.6))
      cells.push({
        x: x / sampler.width,
        y: y / sampler.height,
        width: width / sampler.width,
        height: height / sampler.height,
        tint: `rgb(${color.join(', ')})`,
      })
    }
    // Give a few fragments room to read as triplets while the others carry light.
    const column = x / step
    if (column % 3 === 0 && cells.length > columnStart) {
      const cell = cells[Math.floor((columnStart + cells.length) / 2)]
      cell.codon = CODONS[(column / 3) % CODONS.length]
    }
  }
  return cells
}

function measure(
  canvas: HTMLCanvasElement,
  logo: HTMLImageElement,
  hubFrame: HTMLElement,
  artwork: EyeArtwork
): Layout {
  const viewport = canvas.getBoundingClientRect()
  const logoRect = logo.getBoundingClientRect()
  const frame = hubFrame.getBoundingClientRect()
  const imageWidth = Math.max(frame.width, (frame.height * 2) / 3)
  const imageHeight = (imageWidth * 3) / 2
  return {
    viewport,
    logo: {
      x: logoRect.left - viewport.left,
      y: logoRect.top - viewport.top,
      width: logoRect.width,
      height: logoRect.height,
    },
    eye: {
      x: frame.left - viewport.left + frame.width / 2,
      y:
        frame.top - viewport.top + (frame.height - imageHeight) / 2 + imageHeight * artwork.centerY,
      halfWidth: imageWidth * artwork.halfWidth,
      halfHeight: imageHeight * artwork.halfHeight,
      iris: imageWidth * artwork.iris,
    },
  }
}

function lidPoint(eye: Eye, fraction: number, side: number): Point {
  return {
    x: eye.x + (2 * fraction - 1) * eye.halfWidth,
    y: eye.y + side * eye.halfHeight * Math.sin(Math.PI * fraction),
  }
}

function ribbonPoint(from: Point, lift: Point, approach: Point, to: Point, t: number): Point {
  const rest = 1 - t
  const a = rest ** 3
  const b = 3 * rest ** 2 * t
  const c = 3 * rest * t ** 2
  const d = t ** 3
  return {
    x: a * from.x + b * lift.x + c * approach.x + d * to.x,
    y: a * from.y + b * lift.y + c * approach.y + d * to.y,
  }
}

function drawFragments(
  context: CanvasRenderingContext2D,
  logo: HTMLImageElement,
  layout: Layout,
  fragments: Fragment[],
  time: number
) {
  if (time >= IRIS_LOCK) return
  const { logo: box, eye } = layout
  const sweep = phase(time, 0.027, 0.3)
  if (sweep < 1) {
    const left = sweep * box.width
    context.save()
    context.beginPath()
    context.rect(box.x + left, box.y, box.width - left, box.height)
    context.clip()
    context.drawImage(logo, box.x, box.y, box.width, box.height)
    if (sweep > 0) {
      // Sweep a narrow reflection across the ink at the point of separation.
      const edge = box.x + left
      const reflection = context.createLinearGradient(edge, 0, edge + 18, 0)
      reflection.addColorStop(0, '#c3efff')
      reflection.addColorStop(1, 'transparent')
      context.globalCompositeOperation = 'source-atop'
      context.fillStyle = reflection
      context.fillRect(edge, box.y, 18, box.height)
    }
    context.restore()
  }

  context.font = `500 ${Math.min(10, Math.max(8, box.width / 26))}px ui-monospace, monospace`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  const dissolve = 1 - smooth(phase(time, 0.51, IRIS_LOCK))

  for (const [index, cell] of fragments.entries()) {
    const fromX = cell.x + cell.width / 2
    const release = 0.027 + fromX * 0.273
    const arrival = 0.53 + (index % 7) * 0.009
    if (time <= release) continue

    const lane = index % 3
    const fraction = (Math.floor(index / 3) + 0.5) / Math.ceil((fragments.length - lane) / 3)
    const target =
      lane === 2
        ? {
            x: eye.x + eye.iris * Math.cos(fraction * TURN),
            y: eye.y + eye.iris * Math.sin(fraction * TURN),
          }
        : lidPoint(eye, fraction, lane === 0 ? -1 : 1)
    const life = phase(time, release, arrival)
    const from = {
      x: box.x + fromX * box.width,
      y: box.y + (cell.y + cell.height / 2) * box.height,
    }
    const side = lane === 0 ? -1 : 1
    const lift = {
      x: from.x + side * eye.halfWidth * 0.66,
      y: from.y - eye.halfHeight * 0.48,
    }
    const approach = {
      x: target.x + side * eye.halfWidth * (lane === 2 ? 0.65 : 0.91),
      y: target.y + (from.y - target.y) * 0.22,
    }
    const { x, y } = ribbonPoint(from, lift, approach, target, smooth(life))

    if (life < 0.24) {
      const turn = 1 - 0.7 * smooth(phase(life, 0.02, 0.24))
      const width = box.width * cell.width * turn
      const height = box.height * cell.height
      context.globalAlpha = 1 - phase(life, 0.04, 0.24)
      context.drawImage(
        logo,
        cell.x * logo.naturalWidth,
        cell.y * logo.naturalHeight,
        cell.width * logo.naturalWidth,
        cell.height * logo.naturalHeight,
        x - width / 2,
        y - height / 2,
        width,
        height
      )
    }

    const light = smooth(phase(life, 0.08, 0.3)) * dissolve
    const tailLife = Math.max(0, life - (cell.codon ? 0.23 : 0.11))
    const tail = ribbonPoint(from, lift, approach, target, smooth(tailLife))
    context.lineCap = 'round'
    context.beginPath()
    context.moveTo(tail.x, tail.y)
    if (cell.codon) {
      const middle = ribbonPoint(from, lift, approach, target, smooth((tailLife + life) / 2))
      context.quadraticCurveTo(
        2 * middle.x - (tail.x + x) / 2,
        2 * middle.y - (tail.y + y) / 2,
        x,
        y
      )
      const filament = context.createLinearGradient(tail.x, tail.y, x, y)
      filament.addColorStop(0, 'transparent')
      filament.addColorStop(0.65, cell.tint)
      filament.addColorStop(1, '#e9f8ff')
      context.strokeStyle = filament
      context.lineWidth = 3.4
      context.globalAlpha = light * 0.11
      context.stroke()
      context.lineWidth = 0.9
      context.globalAlpha = light * 0.68
      context.stroke()
    } else {
      context.lineTo(x, y)
      context.strokeStyle = cell.tint
      context.lineWidth = 0.55
      context.globalAlpha = light * 0.25
      context.stroke()
    }

    const label = cell.codon ? light * (1 - smooth(phase(life, 0.7, 0.88))) : 0
    context.fillStyle = cell.tint
    context.globalAlpha = light * 0.78 - label * 0.65
    context.fillRect(x - 0.65, y - 0.65, 1.3, 1.3)
    if (cell.codon && label > 0) {
      context.globalAlpha = label
      context.fillText([...cell.codon].join('\u2009'), x, y - 6)
    }
  }
  context.globalAlpha = 1
}

function drawEye(context: CanvasRenderingContext2D, eye: Eye, glow: string, time: number) {
  const trace = smooth(phase(time, 0.43, IRIS_LOCK))
  const intensity = trace * (1 - smooth(phase(time, 0.64, 0.77)))
  if (intensity <= 0) return

  context.save()
  context.lineJoin = 'round'
  context.lineCap = 'round'
  context.beginPath()
  for (const side of [-1, 1]) {
    for (let step = 0; step <= 36; step += 1) {
      const point = lidPoint(eye, 0.5 + (step / 36 - 0.5) * trace, side)
      if (step === 0) context.moveTo(point.x, point.y)
      else context.lineTo(point.x, point.y)
    }
  }
  for (const side of [-1, 1]) {
    const start = side * (Math.PI / 2) - (1 - trace) * 0.75
    context.moveTo(eye.x + eye.iris * Math.cos(start), eye.y + eye.iris * Math.sin(start))
    context.arc(eye.x, eye.y, eye.iris, start, start + Math.PI * trace)
  }
  context.globalAlpha = intensity * 0.85
  context.shadowColor = glow
  context.shadowBlur = 13
  context.strokeStyle = glow
  context.lineWidth = 2.2
  context.stroke()
  context.shadowBlur = 0
  context.strokeStyle = '#f5fcff'
  context.lineWidth = 0.9
  context.stroke()

  // Fine lens marks meet the engraved detail of the photographed iris.
  context.globalAlpha = intensity * 0.48
  context.strokeStyle = glow
  context.lineWidth = 0.7
  context.beginPath()
  for (let index = 0; index < 24 * trace; index += 1) {
    const angle = (index / 24) * TURN - Math.PI / 2
    const x = Math.cos(angle) * eye.iris
    const y = Math.sin(angle) * eye.iris
    const inner = index % 6 === 0 ? 0.72 : 0.8
    context.moveTo(eye.x + x * inner, eye.y + y * inner)
    context.lineTo(eye.x + x * 0.91, eye.y + y * 0.91)
  }
  context.stroke()
  context.restore()
}

function drawIrisIgnition(context: CanvasRenderingContext2D, eye: Eye, glow: string, time: number) {
  if (time <= IRIS_LOCK - 0.03 || time >= 0.86) return

  const flare =
    smooth(phase(time, IRIS_LOCK - 0.03, 0.615)) * (1 - smooth(phase(time, 0.615, 0.79)))
  const ripple = phase(time, IRIS_LOCK, 0.86)
  const reach = 1 - (1 - ripple) ** 3
  const energy = smooth(phase(time, IRIS_LOCK, 0.62)) * (1 - smooth(ripple))
  const flareWidth = eye.halfWidth * (1.24 + reach * 0.9)

  context.save()
  context.translate(eye.x, eye.y)

  if (flare > 0) {
    context.save()
    context.scale(flareWidth, eye.iris * 0.43)
    const bloom = context.createRadialGradient(0, 0, 0, 0, 0, 1)
    bloom.addColorStop(0, '#fff')
    bloom.addColorStop(0.2, glow)
    bloom.addColorStop(1, 'transparent')
    context.globalAlpha = flare * 0.8
    context.fillStyle = bloom
    context.fillRect(-1, -1, 2, 2)
    context.restore()

    const streak = context.createLinearGradient(-flareWidth, 0, flareWidth, 0)
    streak.addColorStop(0, 'transparent')
    streak.addColorStop(0.5, '#f4fbff')
    streak.addColorStop(1, 'transparent')
    context.globalAlpha = flare * 0.84
    context.fillStyle = streak
    context.fillRect(-flareWidth, -0.75, flareWidth * 2, 1.5)
  }

  context.globalAlpha = energy * 0.65
  context.strokeStyle = glow
  context.lineWidth = 1
  context.shadowColor = glow
  context.shadowBlur = 9
  context.beginPath()
  context.ellipse(
    0,
    0,
    eye.iris * (0.95 + reach * 2.45),
    eye.iris * (0.8 + reach * 0.82),
    0,
    0,
    TURN
  )
  context.stroke()

  context.beginPath()
  for (let index = 0; index < 24; index += 1) {
    const angle = index * 2.399963
    const radius = eye.iris * (0.68 + reach * (1.1 + (index % 7) * 0.32))
    const tail = radius - eye.iris * (0.08 + (index % 4) * 0.04)
    const x = Math.cos(angle)
    const y = Math.sin(angle) * 0.73
    context.moveTo(tail * x, tail * y)
    context.lineTo(radius * x, radius * y)
  }
  context.stroke()
  context.restore()
}

function revealHub(
  scene: HTMLDivElement,
  { viewport, eye }: Layout,
  time: number,
  aperture: boolean
) {
  const opening = smooth(phase(time, IRIS_LOCK, 0.71))
  const sweep = smooth(phase(time, 0.7, 0.965))
  const eyeRx = 1 + eye.halfWidth * 1.25 * opening
  const eyeRy = 1 + eye.halfHeight * 1.45 * opening
  const sweepX = 1 + viewport.width * 1.65 * sweep
  const sweepY = 1 + viewport.height * 1.55 * sweep
  const centerY = eye.y + viewport.height * 0.18 * sweep
  if (aperture) {
    scene.classList.add('kq-splash__scene--aperture')
    scene.style.maskSize = `100% 100%, ${2 * eyeRx}px ${2 * eyeRy}px, 100% 100%`
    scene.style.maskPosition = `0 0, ${eye.x - eyeRx}px ${eye.y - eyeRy}px, 0 0`
    scene.style.setProperty(
      '--kq-splash-sweep',
      `radial-gradient(ellipse ${sweepX}px ${sweepY}px at ${eye.x}px ${centerY}px, #000 56%, transparent 100%)`
    )
  } else {
    const mask = `radial-gradient(ellipse ${eyeRx + sweepX}px ${eyeRy + sweepY}px at ${eye.x}px ${centerY}px, transparent 56%, #000 100%)`
    scene.style.maskImage = mask
    scene.style.setProperty('-webkit-mask-image', mask)
  }
  scene.style.opacity = String(1 - smooth(phase(time, 0.84, 0.98)))
}

interface Playback {
  canvas: HTMLCanvasElement
  scene: HTMLDivElement
  logo: HTMLImageElement
  hubFrame: HTMLElement
  artwork: EyeArtwork
  onFinish: () => void
}

export function playLogoToEye({
  canvas,
  scene,
  logo,
  hubFrame,
  artwork,
  onFinish,
}: Playback): (() => void) | null {
  if (!logo.naturalWidth || !logo.naturalHeight) return null
  const context = canvas.getContext('2d')
  if (!context) return null

  let fragments: Fragment[]
  try {
    fragments = sampleLogo(logo)
  } catch {
    return null
  }
  if (fragments.length === 0) return null

  let layout = measure(canvas, logo, hubFrame, artwork)
  if (
    layout.logo.width <= 0 ||
    layout.eye.y - layout.eye.halfHeight < 0 ||
    layout.eye.y + layout.eye.halfHeight > layout.viewport.height
  ) {
    return null
  }

  const resize = () => {
    layout = measure(canvas, logo, hubFrame, artwork)
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5)
    canvas.width = Math.round(layout.viewport.width * ratio)
    canvas.height = Math.round(layout.viewport.height * ratio)
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
  }
  resize()
  window.addEventListener('resize', resize)

  const start = performance.now()
  const aperture = window.CSS?.supports('mask-composite', 'exclude') ?? false
  let frameId = 0
  const paint = (now: number) => {
    const time = phase(now - start, 0, LOGO_TO_EYE_MS)
    const { viewport, eye } = layout
    context.clearRect(0, 0, viewport.width, viewport.height)
    drawFragments(context, logo, layout, fragments, time)
    drawEye(context, eye, artwork.glow, time)
    drawIrisIgnition(context, eye, artwork.glow, time)
    if (time > IRIS_LOCK) revealHub(scene, layout, time, aperture)

    if (time < 1) frameId = window.requestAnimationFrame(paint)
    else onFinish()
  }
  paint(start)
  scene.classList.add('kq-splash__scene--morphing')

  return () => {
    window.cancelAnimationFrame(frameId)
    window.removeEventListener('resize', resize)
    scene.classList.remove('kq-splash__scene--morphing', 'kq-splash__scene--aperture')
    scene.style.removeProperty('mask-image')
    scene.style.removeProperty('-webkit-mask-image')
    scene.style.removeProperty('mask-size')
    scene.style.removeProperty('mask-position')
    scene.style.removeProperty('--kq-splash-sweep')
    scene.style.removeProperty('opacity')
  }
}
