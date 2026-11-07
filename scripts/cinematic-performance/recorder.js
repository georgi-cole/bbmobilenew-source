;(() => {
  if (window.__presentationPerf) return

  const native = {
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
    setInterval: window.setInterval.bind(window),
    clearInterval: window.clearInterval.bind(window),
    addEventListener: EventTarget.prototype.addEventListener,
    removeEventListener: EventTarget.prototype.removeEventListener,
    pushState: window.history.pushState.bind(window.history),
    replaceState: window.history.replaceState.bind(window.history),
  }
  const timers = new Map()
  const frames = new Map()
  const listeners = new WeakMap()
  const detachedRoots = []
  const constructedAudio = []
  const mediaLoadStartedAt = new WeakMap()
  const mediaFirstDataSeen = new WeakSet()
  const mediaFirstPlaybackSeen = new WeakSet()
  const mediaTimingRecords = []
  const rootOutcomes = new WeakMap()
  const records = []
  const frameGaps = []
  const inputResponses = []
  const longTasks = []
  let active = false
  let lastFrame = 0
  let monitorFrame = 0
  let lastPointerDown = null
  let activeListenerCount = 0
  let lastObservedPath = window.location.pathname
  let observer = null
  let longTaskObserver = null

  window.setTimeout = (callback, delay, ...args) => {
    let id
    id = native.setTimeout(
      (...callbackArgs) => {
        timers.delete(id)
        if (typeof callback === 'function') callback.apply(window, callbackArgs)
      },
      delay,
      ...args
    )
    timers.set(id, 'timeout')
    return id
  }
  window.clearTimeout = (id) => {
    timers.delete(id)
    native.clearTimeout(id)
  }
  window.setInterval = (callback, delay, ...args) => {
    const id = native.setInterval(callback, delay, ...args)
    timers.set(id, 'interval')
    return id
  }
  window.clearInterval = (id) => {
    timers.delete(id)
    native.clearInterval(id)
  }
  window.requestAnimationFrame = (callback) => {
    let id
    id = native.requestAnimationFrame((time) => {
      frames.delete(id)
      callback(time)
    })
    frames.set(id, 'animation-frame')
    return id
  }
  window.cancelAnimationFrame = (id) => {
    frames.delete(id)
    native.cancelAnimationFrame(id)
  }

  function eventMap(target, type, capture, create) {
    let targetMap = listeners.get(target)
    if (!targetMap && create) {
      targetMap = new Map()
      listeners.set(target, targetMap)
    }
    if (!targetMap) return null
    const key = `${type}:${capture ? 1 : 0}`
    let group = targetMap.get(key)
    if (!group && create) {
      group = new Map()
      targetMap.set(key, group)
    }
    return group ?? null
  }

  EventTarget.prototype.addEventListener = function (type, callback, options) {
    if (!callback) return native.addEventListener.call(this, type, callback, options)
    const capture = typeof options === 'boolean' ? options : Boolean(options?.capture)
    const group = eventMap(this, type, capture, true)
    if (group.has(callback)) return

    const wrapped = function (event) {
      if (typeof options === 'object' && options?.once) {
        EventTarget.prototype.removeEventListener.call(this, type, callback, capture)
      }
      return typeof callback === 'function'
        ? callback.call(this, event)
        : callback.handleEvent(event)
    }
    group.set(callback, wrapped)
    activeListenerCount += 1
    native.addEventListener.call(this, type, wrapped, options)

    if (typeof options === 'object' && options.signal) {
      const removeForAbort = () =>
        EventTarget.prototype.removeEventListener.call(this, type, callback, capture)
      if (options.signal.aborted) removeForAbort()
      else native.addEventListener.call(options.signal, 'abort', removeForAbort, { once: true })
    }
  }
  EventTarget.prototype.removeEventListener = function (type, callback, options) {
    const capture = typeof options === 'boolean' ? options : Boolean(options?.capture)
    const group = eventMap(this, type, capture, false)
    const wrapped = group?.get(callback)
    if (!wrapped) return native.removeEventListener.call(this, type, callback, options)
    group.delete(callback)
    activeListenerCount = Math.max(0, activeListenerCount - 1)
    native.removeEventListener.call(this, type, wrapped, options)
  }

  function recordRouteChange(source) {
    const nextPath = window.location.pathname
    if (nextPath === lastObservedPath) return
    const previousPath = lastObservedPath
    lastObservedPath = nextPath
    if (!active) return
    const roots = topLevelPresentationRoots()
    roots.forEach((root) => rootOutcomes.set(root, 'route-exit'))
    records.push({
      kind: 'route-change',
      atMs: performance.now(),
      source,
      from: previousPath,
      to: nextPath,
      exitedPresentationRoots: roots.length,
    })
  }

  window.history.pushState = function (...args) {
    const result = native.pushState(...args)
    recordRouteChange('pushState')
    return result
  }
  window.history.replaceState = function (...args) {
    const result = native.replaceState(...args)
    recordRouteChange('replaceState')
    return result
  }
  native.addEventListener.call(window, 'popstate', () => recordRouteChange('popstate'))
  native.addEventListener.call(document, 'visibilitychange', () => {
    if (!active) return
    records.push({
      kind: 'visibility-change',
      atMs: performance.now(),
      state: document.hidden ? 'hidden' : 'visible',
    })
  })

  if (typeof WeakRef === 'function' && window.Audio) {
    const NativeAudio = window.Audio
    window.Audio = new Proxy(NativeAudio, {
      construct(target, args) {
        const audio = Reflect.construct(target, args)
        constructedAudio.push(new WeakRef(audio))
        return audio
      },
    })
  }

  function isPresentationRoot(node) {
    return node instanceof Element && node.matches('[data-presentation-root]')
  }

  function hasPresentationRootAncestor(node) {
    let parent = node.parentElement
    while (parent) {
      if (isPresentationRoot(parent)) return true
      parent = parent.parentElement
    }
    return false
  }

  function topLevelPresentationRoots() {
    return [...document.querySelectorAll('[data-presentation-root]')].filter(
      (root) => !hasPresentationRootAncestor(root)
    )
  }

  function collectPresentationRoots(node) {
    if (!(node instanceof Element)) return []
    const roots = []
    if (isPresentationRoot(node)) roots.push(node)
    roots.push(...node.querySelectorAll('[data-presentation-root]'))
    return roots
  }

  function summarizeResources() {
    const media = [...document.querySelectorAll('video, audio')]
    for (let index = constructedAudio.length - 1; index >= 0; index -= 1) {
      const audio = constructedAudio[index].deref()
      if (!audio) constructedAudio.splice(index, 1)
      else if (!media.includes(audio)) media.push(audio)
    }
    const retainedDetached = []
    for (let index = detachedRoots.length - 1; index >= 0; index -= 1) {
      const detached = detachedRoots[index].ref.deref()
      if (!detached) {
        detachedRoots.splice(index, 1)
      } else if (!detached.isConnected) {
        retainedDetached.push(detachedRoots[index].name)
      }
    }

    return {
      activeVideos: media.filter(
        (element) => element instanceof HTMLVideoElement && !element.paused && !element.ended
      ).length,
      attachedVideoSources: media.filter(
        (element) =>
          element instanceof HTMLVideoElement &&
          Boolean(element.currentSrc || element.getAttribute('src'))
      ).length,
      presentationVideos: media.filter(
        (element) =>
          element instanceof HTMLVideoElement && element.closest('[data-presentation-root]')
      ).length,
      activePresentationVideos: media.filter(
        (element) =>
          element instanceof HTMLVideoElement &&
          !element.paused &&
          !element.ended &&
          element.closest('[data-presentation-root]')
      ).length,
      attachedPresentationVideoSources: media.filter(
        (element) =>
          element instanceof HTMLVideoElement &&
          Boolean(element.currentSrc || element.getAttribute('src')) &&
          element.closest('[data-presentation-root]')
      ).length,
      activeAudio: media.filter(
        (element) => element instanceof HTMLAudioElement && !element.paused && !element.ended
      ).length,
      attachedAudioSources: media.filter(
        (element) =>
          element instanceof HTMLAudioElement &&
          Boolean(element.currentSrc || element.getAttribute('src'))
      ).length,
      animationCallbacks: frames.size,
      timers: timers.size,
      activeEventListeners: activeListenerCount,
      runningWebAnimations: document
        .getAnimations()
        .filter((animation) => animation.playState === 'running').length,
      pendingMediaPreparation: document.querySelectorAll('[data-cinematic-preparing="true"]')
        .length,
      activePresentationRoots: document.querySelectorAll('[data-presentation-root]').length,
      survivingDetachedPresentationRoots: retainedDetached,
      jsHeapBytes: performance.memory?.usedJSHeapSize ?? null,
    }
  }

  function onFrame(time) {
    if (!active) return
    if (lastFrame > 0) frameGaps.push(time - lastFrame)
    lastFrame = time
    monitorFrame = native.requestAnimationFrame(onFrame)
  }

  function recordPresentationMutation(mutations) {
    if (!active) return
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        collectPresentationRoots(node).forEach((root) => {
          records.push({
            kind: 'presentation-mounted',
            atMs: performance.now(),
            name: root.dataset.presentationRoot,
            isTopLevel: !hasPresentationRootAncestor(root),
            resources: summarizeResources(),
          })
        })
      })
      mutation.removedNodes.forEach((node) => {
        collectPresentationRoots(node).forEach((root) => {
          const name = root.dataset.presentationRoot ?? 'unknown'
          const outcome = rootOutcomes.get(root) ?? 'normal'
          if (typeof WeakRef === 'function') detachedRoots.push({ name, ref: new WeakRef(root) })
          records.push({
            kind: 'presentation-unmounted',
            atMs: performance.now(),
            name,
            outcome,
            isTopLevel: !hasPresentationRootAncestor(root),
            resources: summarizeResources(),
          })
          native.setTimeout(() => {
            if (!active) return
            records.push({
              kind: 'presentation-settled',
              atMs: performance.now(),
              name,
              outcome,
              isTopLevel: !hasPresentationRootAncestor(root),
              resources: summarizeResources(),
            })
          }, 250)
        })
      })
    }
  }

  native.addEventListener.call(
    document,
    'pointerdown',
    () => {
      if (active) lastPointerDown = performance.now()
    },
    true
  )
  native.addEventListener.call(
    document,
    'click',
    () => {
      if (!active || lastPointerDown === null) return
      const started = lastPointerDown
      lastPointerDown = null
      native.requestAnimationFrame((time) => inputResponses.push(time - started))
    },
    true
  )
  native.addEventListener.call(
    document,
    'click',
    (event) => {
      if (!active || !(event.target instanceof Element)) return
      const button = event.target.closest('button')
      if (
        !button ||
        !/skip/i.test(`${button.getAttribute('aria-label') ?? ''} ${button.textContent ?? ''}`)
      )
        return
      const root = button.closest('[data-presentation-root]')
      if (root) {
        let topLevelRoot = root
        while (topLevelRoot.parentElement) {
          const ancestor = topLevelRoot.parentElement.closest('[data-presentation-root]')
          if (!ancestor) break
          topLevelRoot = ancestor
        }
        rootOutcomes.set(topLevelRoot, 'skip')
      }
    },
    true
  )

  if ('PerformanceObserver' in window) {
    try {
      longTaskObserver = new PerformanceObserver((list) => {
        if (active) longTasks.push(...list.getEntries().map((entry) => entry.duration))
      })
      longTaskObserver.observe({ type: 'longtask', buffered: true })
    } catch {
      longTaskObserver = null
    }
  }

  observer = new MutationObserver(recordPresentationMutation)
  observer.observe(document.documentElement, { childList: true, subtree: true })

  const mediaEvents = ['loadstart', 'loadeddata', 'playing', 'waiting', 'stalled', 'error', 'ended']
  const recordMediaEvent = (event) => {
    const media = event.target
    if (!active || !(media instanceof HTMLMediaElement)) return
    const presentationRoot = media.closest('[data-presentation-root]')
    if (!presentationRoot) return
    const now = performance.now()
    if (event.type === 'loadstart') mediaLoadStartedAt.set(media, now)
    if (event.type === 'loadeddata' || event.type === 'playing') {
      const seen = event.type === 'loadeddata' ? mediaFirstDataSeen : mediaFirstPlaybackSeen
      if (seen.has(media)) return
      seen.add(media)
      const loadStartedAt = mediaLoadStartedAt.get(media)
      mediaTimingRecords.push({
        kind: `media-${event.type}`,
        atMs: now,
        presentation: presentationRoot.dataset.presentationRoot,
        fromLoadStartMs: loadStartedAt == null ? null : now - loadStartedAt,
        readyState: media.readyState,
        currentTimeSeconds: media.currentTime,
      })
      return
    }
    if (
      event.type === 'waiting' ||
      event.type === 'stalled' ||
      event.type === 'error' ||
      event.type === 'ended'
    ) {
      mediaTimingRecords.push({
        kind: `media-${event.type}`,
        atMs: now,
        presentation: presentationRoot.dataset.presentationRoot,
        readyState: media.readyState,
        currentTimeSeconds: media.currentTime,
      })
    }
  }
  mediaEvents.forEach((type) =>
    native.addEventListener.call(document, type, recordMediaEvent, true)
  )

  function percentile(values, ratio) {
    if (values.length === 0) return null
    const sorted = [...values].sort((left, right) => left - right)
    return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)]
  }

  window.__presentationPerf = {
    start(label) {
      active = true
      lastFrame = 0
      lastObservedPath = window.location.pathname
      records.length = 0
      frameGaps.length = 0
      inputResponses.length = 0
      longTasks.length = 0
      mediaTimingRecords.length = 0
      records.push({
        kind: 'capture-start',
        atMs: performance.now(),
        label,
        resources: summarizeResources(),
      })
      monitorFrame = native.requestAnimationFrame(onFrame)
    },
    mark(label) {
      if (!active) return
      records.push({
        kind: 'manual-mark',
        atMs: performance.now(),
        label,
        resources: summarizeResources(),
      })
    },
    stop(metadata = {}) {
      active = false
      native.cancelAnimationFrame(monitorFrame)
      records.push({
        kind: 'capture-stop',
        atMs: performance.now(),
        resources: summarizeResources(),
      })
      return {
        metadata,
        navigation: performance.getEntriesByType('navigation').map((entry) => ({
          type: entry.type,
          durationMs: entry.duration,
          domContentLoadedMs: entry.domContentLoadedEventEnd,
          loadMs: entry.loadEventEnd,
          transferBytes: entry.transferSize,
        })),
        summary: {
          presentationCycles: records.filter(
            (record) => record.kind === 'presentation-unmounted' && record.isTopLevel
          ).length,
          skippedPresentations: records.filter(
            (record) =>
              record.kind === 'presentation-unmounted' &&
              record.isTopLevel &&
              record.outcome === 'skip'
          ).length,
          normallyCompletedPresentations: records.filter(
            (record) =>
              record.kind === 'presentation-unmounted' &&
              record.isTopLevel &&
              record.outcome === 'normal'
          ).length,
          routeExits: records.filter(
            (record) => record.kind === 'route-change' && record.exitedPresentationRoots > 0
          ).length,
          backgroundTransitions: records.filter(
            (record) => record.kind === 'visibility-change' && record.state === 'hidden'
          ).length,
          foregroundTransitions: records.filter(
            (record) => record.kind === 'visibility-change' && record.state === 'visible'
          ).length,
          lastFiveCycleEndJsHeapBytes: records
            .filter((record) => record.kind === 'presentation-settled' && record.isTopLevel)
            .map((record) => record.resources.jsHeapBytes)
            .filter(Number.isFinite)
            .slice(-5),
          frameSamples: frameGaps.length,
          frameGapP50Ms: percentile(frameGaps, 0.5),
          frameGapP95Ms: percentile(frameGaps, 0.95),
          frameGapP99Ms: percentile(frameGaps, 0.99),
          droppedFramesOver33Ms: frameGaps.filter((value) => value > 33).length,
          droppedFramesOver50Ms: frameGaps.filter((value) => value > 50).length,
          inputResponseSamples: inputResponses.length,
          inputResponseP95Ms: percentile(inputResponses, 0.95),
          mediaFirstDataP95Ms: percentile(
            mediaTimingRecords
              .filter((record) => record.kind === 'media-loadeddata')
              .map((record) => record.fromLoadStartMs),
            0.95
          ),
          mediaPlaybackStartP95Ms: percentile(
            mediaTimingRecords
              .filter((record) => record.kind === 'media-playing')
              .map((record) => record.fromLoadStartMs),
            0.95
          ),
          mediaWaitingCount: mediaTimingRecords.filter(
            (record) => record.kind === 'media-waiting' || record.kind === 'media-stalled'
          ).length,
          mediaErrorCount: mediaTimingRecords.filter((record) => record.kind === 'media-error')
            .length,
          longTaskCount: longTasks.length,
          longTaskP95Ms: percentile(longTasks, 0.95),
          startResources: records[0]?.resources ?? null,
          endResources: records.at(-1)?.resources ?? null,
        },
        records,
        mediaTimingRecords,
      }
    },
    snapshot: summarizeResources,
  }
})()
