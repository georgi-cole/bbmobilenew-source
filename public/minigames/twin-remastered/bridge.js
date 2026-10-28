;(() => {
  const sequel = location.pathname.includes('/part2/')
  const result = document.querySelector(sequel ? '#end' : '#result')
  const button = result.querySelector('button')
  button.textContent = 'Continue'
  button.removeAttribute('onclick')
  let submitted = false
  button.onclick = () => {
    if (submitted || result.hidden) return
    submitted = true
    const text = document.querySelector(sequel ? '#score' : '#finalScore').textContent
    parent.postMessage(
      { type: 'twin:complete', score: Number.parseInt(text, 10) || 0 },
      location.origin
    )
  }
  document.title = sequel ? 'Find Your Twin 2 — Remastered' : 'Find Your Twin — Remastered'
  document.querySelector('#intro .eyebrow').textContent = sequel
    ? 'FIND YOUR TWIN 2'
    : 'FIND YOUR TWIN'
  document.querySelector('canvas').dataset.gameEdition = 'remastered'
  const prepare = async () => {
    const images = [
      `./assets/${sequel ? 'lost-again-castle' : 'moonlit-park-v2'}.webp`,
      '../shared/benny-approved-alpha.webp',
    ].map((source) => {
      const image = new Image()
      image.src = source
      return image
    })
    await Promise.allSettled(images.map((image) => image.decode?.()))
    parent.postMessage({ type: 'twin:ready' }, location.origin)
    if (new URLSearchParams(location.search).get('autostart') === '1')
      document.querySelector('#start').click()
  }
  if (document.readyState === 'complete') void prepare()
  else
    window.addEventListener(
      'load',
      () => {
        void prepare()
      },
      { once: true }
    )
})()
