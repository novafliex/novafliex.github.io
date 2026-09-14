(() => {
  'use strict'

  const INSTANCE_KEY = '__princeEasterEgg'
  if (window[INSTANCE_KEY]) {
    window[INSTANCE_KEY].init()
    return
  }

  // Five independent entries are selected randomly without immediate repetition.
  const princeQuotes = [
    {
      zh: "完美并非无以复加，而是无处可减。",
      en: "Perfection is achieved, not when there is nothing more to add, but when there is nothing left to take away.",
      source: "— Antoine de Saint-Exupéry"
    },
    {
      zh: "我不能创造的东西，我就无法真正理解。",
      en: "What I cannot create, I do not understand.",
      source: "— Richard Feynman（理查德·费曼）"
    },
    {
      zh: "万物皆不急就，却无所不成。",
      en: "Nature does not hurry, yet everything is accomplished.",
      source: "— Lao Tzu（老子）"
    },
    {
      zh: "“简单是可靠性的先决条件。”",
      en: "Simplicity is prerequisite for reliability.",
      source: "— Edsger W. Dijkstra（艾兹格·迪杰斯特拉）"
    },
    {
      zh: "不要再去争论一个好人应该是什么样，去成为他。",
      en: "Waste no more time arguing what a good man should be. Be one.",
      source: "— Marcus Aurelius（马可·奥勒留）"
    }
  ]

  const RETURN_DELAY = 2000
  const QUOTE_MIN_DURATION = 3000
  const QUOTE_AUTO_CLOSE_DELAY = 5000
  const QUOTE_LEAVE_CLOSE_DELAY = 2000
  const QUOTE_CLOSE_ANIMATION = 280

  const state = {
    name: 'hidden',
    lastQuoteIndex: -1,
    frame: 0,
    prepareTimer: 0,
    returnTimer: 0,
    returnAnimationTimer: 0,
    quoteUnlockTimer: 0,
    quoteAutoCloseTimer: 0,
    quoteLeaveTimer: 0,
    quoteCloseTimer: 0,
    quoteOpenedAt: 0,
    quoteUnlocked: false,
    quoteHovered: false,
    observer: null,
    globalEventsBound: false,
    domCreated: false
  }

  const scriptUrl = document.currentScript && document.currentScript.src
    ? new URL(document.currentScript.src, window.location.href)
    : new URL(window.location.href)
  const rootPath = scriptUrl.pathname.includes('/rose-galaxy/')
    ? scriptUrl.pathname.split('/rose-galaxy/')[0] + '/'
    : '/'
  const assetUrl = filename => new URL(`${rootPath}img/${filename}`, window.location.origin).href

  function createDom() {
    let root = document.querySelector('[data-prince-egg]')
    if (!root) {
      root = document.createElement('div')
      root.className = 'prince-egg is-hidden'
      root.dataset.princeEgg = ''
      root.setAttribute('aria-hidden', 'true')
      root.innerHTML = `
        <button class="prince-egg__character" type="button"
          aria-label="\u9690\u85cf\u7684\u5c0f\u738b\u5b50\u5f69\u86cb">
          <span class="prince-egg__image-stage" aria-hidden="true">
            <img class="prince-egg__peek" src="${assetUrl('caidan-peek.webp')}" width="320" height="480" loading="lazy" decoding="async" alt="" draggable="false">
            <img class="prince-egg__standing" src="${assetUrl('caidan.webp')}" width="320" height="480" loading="lazy" decoding="async" alt="" draggable="false">
          </span>
        </button>`
      document.body.appendChild(root)
    }

    let popover = document.querySelector('[data-prince-quote-popover]')
    if (!popover) {
      popover = document.createElement('div')
      popover.id = 'prince-quote-popover'
      popover.className = 'prince-quote-popover'
      popover.dataset.princeQuotePopover = ''
      popover.setAttribute('role', 'dialog')
      popover.setAttribute('aria-live', 'polite')
      popover.setAttribute('aria-hidden', 'true')
      popover.innerHTML = `
        <span class="prince-quote-popover__rose" aria-hidden="true">
          <svg viewBox="0 0 40 58" focusable="false">
            <path d="M20 23c-8-1-12-6-10-12 2-6 9-9 16-6 6 3 7 10 3 15-2 3-5 4-9 3Z"/>
            <path d="M20 23c-1-6 2-12 8-14M20 23c5-2 10-6 10-12M20 23v29M20 36c-7-1-10-5-11-9 6 0 10 2 11 9Zm0 8c6-1 9-4 11-8-6 0-9 2-11 8Z"/>
          </svg>
        </span>
        <p class="prince-quote-popover__zh" data-prince-quote-zh></p>
        <p class="prince-quote-popover__en" data-prince-quote-en></p>
        <p class="prince-quote-popover__source" data-prince-quote-source></p>
        <span class="prince-quote-popover__arrow" aria-hidden="true"></span>`
      document.body.appendChild(popover)
    }

    root.querySelectorAll('img').forEach(image => {
      image.loading = 'lazy'
      image.decoding = 'async'
    })
    state.domCreated = true
    bindElementEvents(root, popover)
    return { root, popover }
  }

  function setState(root, next) {
    if (!root) return
    if (state.name === next && root.classList.contains(`is-${next}`)) return
    state.name = next
    root.classList.remove(
      'is-hidden', 'is-peeking', 'is-preparing', 'is-jumping',
      'is-standing', 'is-returning', 'is-quote-open'
    )
    root.classList.add(`is-${next}`)
    root.dataset.state = next
    root.setAttribute('aria-hidden', String(next === 'hidden'))
  }

  function cancelReturnToPeek() {
    window.clearTimeout(state.returnTimer)
    state.returnTimer = 0
  }

  function beginJump(root) {
    if (state.name !== 'peeking') return
    cancelReturnToPeek()
    window.clearTimeout(state.prepareTimer)
    setState(root, 'preparing')

    state.prepareTimer = window.setTimeout(() => {
      if (state.name !== 'preparing') return
      const character = root.querySelector('.prince-egg__character')
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        setState(root, 'standing')
        if (!character.matches(':hover')) scheduleReturnToPeek(root)
        return
      }

      const finishJump = event => {
        if (event.animationName !== 'prince-jump' || state.name !== 'jumping') return
        character.removeEventListener('animationend', finishJump)
        setState(root, 'standing')
        if (!character.matches(':hover')) scheduleReturnToPeek(root)
      }
      character.addEventListener('animationend', finishJump)
      setState(root, 'jumping')
    }, 140)
  }

  function returnToPeek(root) {
    cancelReturnToPeek()
    if (state.name !== 'standing') return
    setState(root, 'returning')
    window.clearTimeout(state.returnAnimationTimer)
    state.returnAnimationTimer = window.setTimeout(() => {
      if (state.name === 'returning') setState(root, 'peeking')
      state.returnAnimationTimer = 0
    }, 650)
  }

  function scheduleReturnToPeek(root) {
    cancelReturnToPeek()
    if (state.name !== 'standing') return
    const character = root.querySelector('.prince-egg__character')
    if (character && character.matches(':hover')) return
    state.returnTimer = window.setTimeout(() => returnToPeek(root), RETURN_DELAY)
  }

  function getRandomQuote() {
    let nextIndex
    do {
      nextIndex = Math.floor(Math.random() * princeQuotes.length)
    } while (nextIndex === state.lastQuoteIndex && princeQuotes.length > 1)
    state.lastQuoteIndex = nextIndex
    return princeQuotes[nextIndex]
  }

  function clearQuoteTimers() {
    window.clearTimeout(state.quoteUnlockTimer)
    window.clearTimeout(state.quoteAutoCloseTimer)
    window.clearTimeout(state.quoteLeaveTimer)
    window.clearTimeout(state.quoteCloseTimer)
    state.quoteUnlockTimer = 0
    state.quoteAutoCloseTimer = 0
    state.quoteLeaveTimer = 0
    state.quoteCloseTimer = 0
  }

  function scheduleQuoteClose(root, popover, delay) {
    window.clearTimeout(state.quoteAutoCloseTimer)
    state.quoteAutoCloseTimer = window.setTimeout(
      () => closeQuotePopover(root, popover),
      delay
    )
  }

  function scheduleQuoteLeaveClose(root, popover) {
    window.clearTimeout(state.quoteLeaveTimer)
    state.quoteLeaveTimer = window.setTimeout(
      () => closeQuotePopover(root, popover),
      QUOTE_LEAVE_CLOSE_DELAY
    )
  }

  function positionQuotePopover(root, popover) {
    if (!root || !popover || !popover.classList.contains('is-visible')) return
    const character = root.querySelector('.prince-egg__character')
    const rect = character.getBoundingClientRect()
    popover.classList.add('is-measuring')
    const popoverRect = popover.getBoundingClientRect()
    const horizontalGap = 8
    const verticalOffset = 22
    const edge = 12
    const viewportWidth = document.documentElement.clientWidth
    const viewportHeight = window.innerHeight
    const fitsRight = rect.right + horizontalGap + popoverRect.width <= viewportWidth - edge
    let left = fitsRight
      ? rect.right + horizontalGap
      : rect.left - horizontalGap - popoverRect.width
    let top = rect.top - popoverRect.height + verticalOffset
    left -= 5
    top += 3

    left = Math.max(edge, Math.min(left, viewportWidth - popoverRect.width - edge))
    top = Math.max(edge, Math.min(top, viewportHeight - popoverRect.height - edge))
    popover.style.left = `${Math.round(left)}px`
    popover.style.top = `${Math.round(top)}px`
    popover.classList.toggle('is-left', !fitsRight)
    popover.classList.toggle('is-right', fitsRight)
    popover.classList.remove('is-measuring')
  }

  function openQuotePopover(root, popover) {
    if (state.name === 'quote-open' && !state.quoteUnlocked) return
    if (state.name !== 'standing' && state.name !== 'quote-open') return

    cancelReturnToPeek()
    clearQuoteTimers()
    const quote = getRandomQuote()
    popover.querySelector('[data-prince-quote-zh]').textContent = quote.zh
    popover.querySelector('[data-prince-quote-en]').textContent = quote.en
    popover.querySelector('[data-prince-quote-source]').textContent = quote.source

    state.quoteOpenedAt = Date.now()
    state.quoteUnlocked = false
    state.quoteHovered = popover.matches(':hover')
    setState(root, 'quote-open')
    popover.classList.remove('is-closing')
    popover.classList.add('is-visible')
    popover.setAttribute('aria-hidden', 'false')
    positionQuotePopover(root, popover)

    state.quoteUnlockTimer = window.setTimeout(() => {
      if (state.name !== 'quote-open') return
      state.quoteUnlocked = true
      state.quoteUnlockTimer = 0
      if (!state.quoteHovered) {
        const elapsed = Date.now() - state.quoteOpenedAt
        scheduleQuoteClose(root, popover, Math.max(0, QUOTE_AUTO_CLOSE_DELAY - elapsed))
      }
    }, QUOTE_MIN_DURATION)

    scheduleQuoteClose(root, popover, QUOTE_AUTO_CLOSE_DELAY)
  }

  function requestCloseQuotePopover(root, popover) {
    if (state.name !== 'quote-open' || !state.quoteUnlocked) return
    closeQuotePopover(root, popover)
  }

  function closeQuotePopover(root, popover) {
    if (state.name !== 'quote-open') return
    clearQuoteTimers()
    state.quoteUnlocked = false
    state.quoteHovered = false
    popover.classList.add('is-closing')
    popover.classList.remove('is-visible')

    state.quoteCloseTimer = window.setTimeout(() => {
      popover.classList.remove('is-closing', 'is-left', 'is-right')
      popover.setAttribute('aria-hidden', 'true')
      popover.style.removeProperty('left')
      popover.style.removeProperty('top')
      setState(root, 'standing')
      const character = root.querySelector('.prince-egg__character')
      if (!character.matches(':hover')) scheduleReturnToPeek(root)
      state.quoteCloseTimer = 0
    }, QUOTE_CLOSE_ANIMATION)
  }

  function forceCloseQuotePopover(root, popover) {
    clearQuoteTimers()
    state.quoteUnlocked = false
    state.quoteHovered = false
    if (popover) {
      popover.classList.remove('is-visible', 'is-closing', 'is-measuring', 'is-left', 'is-right')
      popover.setAttribute('aria-hidden', 'true')
      popover.style.removeProperty('left')
      popover.style.removeProperty('top')
    }
    if (root && state.name === 'quote-open') setState(root, 'standing')
  }

  function bindElementEvents(root, popover) {
    if (root.dataset.eventsBound !== 'true') {
      root.dataset.eventsBound = 'true'
      const character = root.querySelector('.prince-egg__character')
      character.addEventListener('mouseenter', () => {
        cancelReturnToPeek()
        if (state.name === 'peeking') beginJump(root)
      })
      character.addEventListener('mouseleave', () => {
        if (state.name === 'standing') scheduleReturnToPeek(root)
      })
      character.addEventListener('dblclick', event => {
        event.preventDefault()
        event.stopPropagation()
        if (state.name !== 'standing' && state.name !== 'quote-open') return
        cancelReturnToPeek()
        if (state.name === 'quote-open' && !state.quoteUnlocked) return
        openQuotePopover(root, popover)
      })
    }

    if (popover.dataset.eventsBound !== 'true') {
      popover.dataset.eventsBound = 'true'
      popover.addEventListener('click', event => {
        event.preventDefault()
        event.stopPropagation()
        requestCloseQuotePopover(root, popover)
      })
      popover.addEventListener('mouseenter', () => {
        state.quoteHovered = true
        window.clearTimeout(state.quoteAutoCloseTimer)
        window.clearTimeout(state.quoteLeaveTimer)
        state.quoteAutoCloseTimer = 0
        state.quoteLeaveTimer = 0
      })
      popover.addEventListener('mouseleave', () => {
        state.quoteHovered = false
        if (state.name === 'quote-open' && state.quoteUnlocked) {
          scheduleQuoteLeaveClose(root, popover)
        }
      })
    }
  }

  function isHomePage() {
    const normalizedRoot = rootPath.replace(/\/+$/, '') || '/'
    const normalizedPath = window.location.pathname.replace(/\/index\.html$/, '').replace(/\/+$/, '') || '/'
    return normalizedPath === normalizedRoot && document.body.classList.contains('nova-home-active')
  }

  function isVisible(element) {
    if (!element) return false
    const style = window.getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    return style.display !== 'none' && style.visibility !== 'hidden' &&
      Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0
  }

  function hasBlockingModal() {
    const selectors = [
      '#search-mask',
      '#local-search .search-dialog',
      '.medium-zoom-overlay',
      '.fancybox__container',
      '.pswp',
      '[aria-modal="true"]:not([data-prince-quote-popover])'
    ]
    return selectors.some(selector =>
      Array.from(document.querySelectorAll(selector)).some(isVisible)
    )
  }

  function updateVisibility() {
    window.cancelAnimationFrame(state.frame)
    state.frame = window.requestAnimationFrame(() => {
      const routeEligible = isHomePage() &&
        window.innerWidth >= 768 &&
        window.scrollY > window.innerHeight * .8

      if (!routeEligible) {
        const root = document.querySelector('[data-prince-egg]')
        const popover = document.querySelector('[data-prince-quote-popover]')
        if (root) {
          cancelReturnToPeek()
          forceCloseQuotePopover(root, popover)
          setState(root, 'hidden')
        }
        return
      }

      const { root, popover } = createDom()
      if (hasBlockingModal()) {
        cancelReturnToPeek()
        forceCloseQuotePopover(root, popover)
        setState(root, 'hidden')
        return
      }
      if (state.name === 'hidden') setState(root, 'peeking')
      if (state.name === 'quote-open') positionQuotePopover(root, popover)
    })
  }

  function bindGlobalEvents() {
    if (state.globalEventsBound) return
    state.globalEventsBound = true
    window.addEventListener('scroll', updateVisibility, { passive: true })
    window.addEventListener('resize', () => {
      updateVisibility()
      const root = document.querySelector('[data-prince-egg]')
      const popover = document.querySelector('[data-prince-quote-popover]')
      if (state.name === 'quote-open') positionQuotePopover(root, popover)
    }, { passive: true })
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return
      const root = document.querySelector('[data-prince-egg]')
      const popover = document.querySelector('[data-prince-quote-popover]')
      requestCloseQuotePopover(root, popover)
    })
    document.addEventListener('pjax:complete', init)
  }

  function observeModals() {
    state.observer?.disconnect()
    state.observer = new MutationObserver(updateVisibility)
    const modalRoots = [
      document.getElementById('search-mask'),
      document.getElementById('local-search'),
      document.querySelector('.medium-zoom-overlay'),
      document.querySelector('.fancybox__container'),
      document.querySelector('.pswp')
    ].filter(Boolean)
    modalRoots.forEach(element => state.observer.observe(element, {
      attributes: true,
      attributeFilter: ['class', 'hidden', 'style']
    }))
    if (document.body) {
      state.observer.observe(document.body, { childList: true })
    }
  }

  function init() {
    if (!document.body) return
    bindGlobalEvents()
    observeModals()
    updateVisibility()
  }

  window[INSTANCE_KEY] = { init }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true })
  } else {
    init()
  }
})()
