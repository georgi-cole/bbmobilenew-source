import manifest from './walk-manifest.json'

export function upgradeWalkResources(resources, enabled = true) {
  if (!enabled) return resources
  return Object.fromEntries(
    Object.entries(resources).map(([key, resource]) => {
      const walk = resource.pose === 'exit-back' && manifest.characters[resource.character]
      return [
        key,
        walk
          ? { ...resource, ...walk, pose: 'walk-cycle', walkCycle: true, fallback: resource }
          : resource,
      ]
    })
  )
}

export function attachWalkSprites(root, resources) {
  const sprites = []
  for (const image of root.querySelectorAll('img[data-resource-key]')) {
    const resource = resources[image.dataset.resourceKey]
    if (!resource?.walkCycle) continue
    const wrapper = document.createElement('div')
    wrapper.className = image.className + ' walk-cycle'
    wrapper.style.cssText = image.style.cssText
    wrapper.style.overflow = 'hidden'
    wrapper.dataset.character = resource.character
    wrapper.dataset.resourceKey = image.dataset.resourceKey
    const strip = image.cloneNode()
    strip.className = 'walk-cycle-strip'
    strip.removeAttribute('data-resource-key')
    strip.style.cssText = `display:block;width:${resource.frames * 100}%;height:100%;max-width:none;object-fit:fill;object-position:left center;transform-origin:0 0`
    wrapper.append(strip)
    image.replaceWith(wrapper)
    sprites.push({ node: strip, frames: resource.frames, frameMs: resource.frameMs })
  }
  return sprites
}

export function continueDoorwayTravel(selector, frames, exitAt, paired) {
  if (selector !== '.departure-near' && selector !== '.departure-far') return frames
  const end = frames.at(-1)[0]
  const finalTransform = paired ? 'translateY(-82%) scale(.43)' : 'translateY(-103%) scale(.39)'
  return [
    ...frames.slice(0, -1),
    [exitAt + 3600, 1, paired ? 'translateY(-74%) scale(.48)' : 'translateY(-96%) scale(.42)'],
    [exitAt + 3900, 1, finalTransform],
    [end, 1, finalTransform],
  ]
}

export function animateWalkSprites(sprites, a, duration, exitAt) {
  for (const sprite of sprites) {
    const transform = (frame) => `translateX(${(-frame / sprite.frames) * 100}%)`
    const stops = [[0, 1, transform(0), 'steps(1,end)']]
    if (exitAt > 0) stops.push([exitAt, 1, transform(0), 'steps(1,end)'])
    const end = Math.min(duration, exitAt + 3900)
    for (let ms = exitAt + sprite.frameMs; ms < end; ms += sprite.frameMs)
      stops.push([
        ms,
        1,
        transform(Math.floor((ms - exitAt) / sprite.frameMs) % sprite.frames),
        'steps(1,end)',
      ])
    const final = transform(Math.floor((end - exitAt) / sprite.frameMs) % sprite.frames)
    stops.push([end, 1, final], [duration, 1, final])
    a(sprite.node, stops)
  }
}
