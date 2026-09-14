(() => {
  'use strict'

  if (window.__novaUxReady) return
  window.__novaUxReady = true

  const INITIAL_MIN_DURATION = 150
  const INITIAL_MAX_DURATION = 2000
  const EXIT_DURATION = 180
  const ROUTE_CLASSES = [
    'nova-home-active',
    'nova-music-route',
    'nova-archive-route',
    'nova-category-route',
    'nova-tag-route',
    'nova-tags-route',
    'nova-template-route',
    'nova-shuoshuo-route',
    'nova-about-route',
    'nova-gallery-route'
  ]
  let initialFinishTimer = 0
  let initialFallbackTimer = 0
  let removeTimer = 0
  let initialFinishScheduled = false
  let statsTimer = 0
  let navigationObserver = null
  let searchObserver = null

  function getLoader() {
    const loaders = Array.from(document.querySelectorAll('[data-nova-loading]'))
    let loader = loaders.shift()
    loaders.forEach(item => item.remove())
    if (loader) return loader

    loader = document.createElement('div')
    loader.className = 'nova-page-loading'
    loader.dataset.novaLoading = ''
    loader.setAttribute('aria-hidden', 'true')
    loader.innerHTML = `
      <div class="nova-page-loading__inner">
        <span class="nova-page-loading__mark" aria-hidden="true"></span>
        <strong>FLIEX</strong>
        <small>LOADING THE NIGHT...</small>
      </div>`
    document.body.appendChild(loader)
    return loader
  }

  function enhanceSearch() {
    const dialog = document.querySelector('#local-search .search-dialog')
    const input = dialog?.querySelector('.local-search-input input')
    const results = dialog?.querySelector('#local-search-results')
    if (!dialog || !input || !results || dialog.dataset.novaSearchReady === 'true') return
    dialog.dataset.novaSearchReady = 'true'

    searchObserver?.disconnect()
    searchObserver = null

    const state = document.createElement('div')
    state.className = 'nova-search-state'
    state.innerHTML = `
      <span class="nova-search-state__eyebrow">QUICK PASSAGE</span>
      <strong>从这里进入夜航档案</strong>
      <p>输入关键词，或先浏览常用页面。</p>
      <nav aria-label="搜索快速入口">
        <a href="/archives/">归档</a>
        <a href="/categories/">分类</a>
        <a href="/Gallery/">光影</a>
        <a href="/music/">音乐</a>
      </nav>`
    results.before(state)

    const renderState = () => {
      const query = input.value.trim()
      const hasResults = Boolean(results.querySelector('.local-search-hit-item'))
      state.hidden = Boolean(query && hasResults)
      state.classList.toggle('is-empty-result', Boolean(query && !hasResults))
      if (query && !hasResults) {
        state.querySelector('.nova-search-state__eyebrow').textContent = 'NO SIGNAL'
        state.querySelector('strong').textContent = '没有找到相关记录'
        state.querySelector('p').textContent = '换一个更短的关键词，或从快速入口继续浏览。'
      } else {
        state.querySelector('.nova-search-state__eyebrow').textContent = 'QUICK PASSAGE'
        state.querySelector('strong').textContent = '从这里进入夜航档案'
        state.querySelector('p').textContent = '输入关键词，或先浏览常用页面。'
      }
    }

    input.addEventListener('input', () => window.setTimeout(renderState, 0))
    searchObserver = new MutationObserver(renderState)
    searchObserver.observe(results, { childList: true, subtree: true })
    renderState()
  }

  function cleanupSearch() {
    searchObserver?.disconnect()
    searchObserver = null
  }

  function finishInitialLoading() {
    window.clearTimeout(window.__novaLoaderDelayTimer)
    window.__novaLoaderDelayTimer = 0
    const loader = document.querySelector('[data-nova-loading]')
    if (!loader) {
      document.body.classList.remove('nova-loading-active')
      return
    }
    if (loader.dataset.novaLoadingState === 'leaving') return

    if (!loader.classList.contains('is-visible')) {
      window.clearTimeout(initialFinishTimer)
      window.clearTimeout(initialFallbackTimer)
      window.clearTimeout(removeTimer)
      loader.remove()
      document.body.classList.remove('nova-loading-active')
      return
    }

    loader.dataset.novaLoadingState = 'leaving'
    loader.setAttribute('aria-hidden', 'true')
    loader.classList.add('is-leaving')
    loader.classList.remove('is-visible')
    window.clearTimeout(initialFinishTimer)
    window.clearTimeout(initialFallbackTimer)
    window.clearTimeout(removeTimer)
    removeTimer = window.setTimeout(() => {
      loader.remove()
      document.body.classList.remove('nova-loading-active')
    }, EXIT_DURATION)
  }

  function scheduleInitialFinish() {
    if (initialFinishScheduled) return
    initialFinishScheduled = true
    window.clearTimeout(window.__novaLoaderDelayTimer)
    window.__novaLoaderDelayTimer = 0
    const loader = document.querySelector('[data-nova-loading]')
    if (!loader?.classList.contains('is-visible')) {
      finishInitialLoading()
      return
    }
    const visibleAt = Number(window.__novaLoaderVisibleAt) || Date.now()
    const elapsed = Date.now() - visibleAt
    initialFinishTimer = window.setTimeout(
      finishInitialLoading,
      Math.max(0, INITIAL_MIN_DURATION - elapsed)
    )
  }

  function initInitialLoading() {
    const loader = getLoader()
    loader.classList.remove('is-leaving')
    if (loader.classList.contains('is-visible')) {
      loader.dataset.novaLoadingState = 'visible'
      loader.setAttribute('aria-hidden', 'false')
      document.body.classList.add('nova-loading-active')
    } else {
      loader.dataset.novaLoadingState = 'pending'
      loader.setAttribute('aria-hidden', 'true')
      document.body.classList.remove('nova-loading-active')
    }

    initialFallbackTimer = window.setTimeout(finishInitialLoading, INITIAL_MAX_DURATION)
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', scheduleInitialFinish, { once: true })
    } else {
      scheduleInitialFinish()
    }
  }

  function beginNavigation() {
    cleanupSearch()
    document.body.classList.remove(...ROUTE_CLASSES)
    finishInitialLoading()
  }

  function finishNavigation() {
    finishInitialLoading()
  }

  function normalizePath(value) {
    const path = `/${value || ''}`.replace(/\/+/g, '/')
    return path.length > 1 ? path.replace(/\/$/, '') : path
  }

  function isHomePage() {
    if (
      document.body.classList.contains('nova-home-active') ||
      document.body.classList.contains('page-type-index') ||
      document.body.classList.contains('home')
    ) {
      return true
    }

    return normalizePath(location.pathname) === normalizePath(window.GLOBAL_CONFIG?.root || '/')
  }

  function syncHomeThemeToggle() {
    const button = document.getElementById('home-theme-toggle')
    if (!button) return

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
    const label = isDark ? '切换到浅色模式' : '切换到深色模式'
    button.setAttribute('aria-label', label)
    button.setAttribute('title', label)
  }

  function createHomeThemeToggle() {
    const button = document.createElement('button')
    button.id = 'home-theme-toggle'
    button.className = 'fliex-rightside-button'
    button.type = 'button'
    button.innerHTML = `
      <span class="home-theme-toggle__icons" aria-hidden="true">
        <svg class="home-theme-toggle__icon home-theme-toggle__icon--moon" viewBox="0 0 24 24" focusable="false">
          <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"></path>
        </svg>
        <svg class="home-theme-toggle__icon home-theme-toggle__icon--sun" viewBox="0 0 24 24" focusable="false">
          <circle cx="12" cy="12" r="4"></circle>
          <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.41M17.66 6.34l1.41-1.41"></path>
        </svg>
      </span>`

    button.addEventListener('click', event => {
      event.preventDefault()
      event.stopPropagation()
      document.getElementById('darkmode')?.click()
    })
    button.dataset.bound = 'true'
    return button
  }

  function initRightsideEnhancement() {
    const rightside = document.getElementById('rightside')
    const goUpButton = document.getElementById('go-up')
    if (!rightside || !goUpButton) return

    rightside
      .querySelectorAll('button[id], a[id]')
      .forEach(button => button.classList.add('fliex-rightside-button'))

    let homeThemeToggle = document.getElementById('home-theme-toggle')
    if (!homeThemeToggle) homeThemeToggle = createHomeThemeToggle()

    const visibleControls = goUpButton.parentElement
    if (homeThemeToggle.parentElement !== visibleControls || homeThemeToggle.nextElementSibling !== goUpButton) {
      visibleControls.insertBefore(homeThemeToggle, goUpButton)
    }

    rightside.classList.toggle('is-home-minimal', isHomePage())
    syncHomeThemeToggle()

    if (!window.__fliexRightsideThemeObserver) {
      window.__fliexRightsideThemeObserver = new MutationObserver(syncHomeThemeToggle)
      window.__fliexRightsideThemeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme']
      })
    }
  }

  function initStatsFallback() {
    window.clearTimeout(statsTimer)
    const targets = [
      document.getElementById('busuanzi_value_site_uv'),
      document.getElementById('busuanzi_value_site_pv'),
      document.getElementById('last-push-date')
    ].filter(Boolean)
    if (!targets.length) return

    statsTimer = window.setTimeout(() => {
      targets.forEach(target => {
        if (!target.isConnected || !target.querySelector('.fa-spinner')) return
        target.textContent = '—'
        target.title = '统计服务暂时不可用'
      })
    }, 9000)
  }

  function syncNavigationSemantics() {
    const desktopMenu = document.getElementById('menus')
    const desktopMenuItems = desktopMenu?.querySelector('.menus_items')
    const mobileMenu = document.getElementById('sidebar-menus')
    const isMobile = window.matchMedia('(max-width: 768px)').matches
    const mobileMenuOpen = Boolean(isMobile && mobileMenu?.classList.contains('open'))

    if (desktopMenu) {
      desktopMenu.inert = false
      desktopMenu.removeAttribute('aria-hidden')
    }
    if (desktopMenuItems) {
      desktopMenuItems.inert = isMobile
      desktopMenuItems.setAttribute('aria-hidden', String(isMobile))
    }
    if (mobileMenu) {
      mobileMenu.inert = !mobileMenuOpen
      mobileMenu.setAttribute('aria-hidden', String(!mobileMenuOpen))
    }

    navigationObserver?.disconnect()
    if (mobileMenu) {
      navigationObserver = new MutationObserver(syncNavigationSemantics)
      navigationObserver.observe(mobileMenu, { attributes: true, attributeFilter: ['class'] })
    }
  }

  function syncRouteState() {
    document.body.classList.remove(...ROUTE_CLASSES)
    const routeMarkers = [
      ['[data-nova-home]', ['nova-home-active']],
      ['.nova-music-page', ['nova-music-route']],
      ['main.nova-archive-main', ['nova-archive-route']],
      ['main.nova-category-content', ['nova-category-route']],
      ['main.nova-tags-overview', ['nova-tag-route', 'nova-tags-route']],
      ['main.nova-tag-content:not(.nova-tags-overview)', ['nova-tag-route']],
      ['.nova-template-page', ['nova-template-route']],
      ['.nova-shuoshuo-page', ['nova-shuoshuo-route']],
      ['.nova-about-page', ['nova-about-route']],
      ['[data-gallery-root]', ['nova-gallery-route']]
    ]
    const match = routeMarkers.find(([selector]) => document.querySelector(selector))
    if (match) document.body.classList.add(...match[1])
  }

  document.addEventListener('pjax:send', beginNavigation)
  document.addEventListener('pjax:complete', finishNavigation)
  document.addEventListener('pjax:error', finishNavigation)
  document.addEventListener('DOMContentLoaded', enhanceSearch, { once: true })
  document.addEventListener('DOMContentLoaded', initRightsideEnhancement, { once: true })
  document.addEventListener('DOMContentLoaded', initStatsFallback, { once: true })
  document.addEventListener('DOMContentLoaded', syncNavigationSemantics, { once: true })
  document.addEventListener('DOMContentLoaded', syncRouteState, { once: true })
  document.addEventListener('pjax:complete', enhanceSearch)
  document.addEventListener('pjax:complete', initRightsideEnhancement)
  document.addEventListener('pjax:complete', initStatsFallback)
  document.addEventListener('pjax:complete', syncNavigationSemantics)
  document.addEventListener('pjax:complete', syncRouteState)
  window.addEventListener('pageshow', finishInitialLoading)
  window.addEventListener('pageshow', scheduleInitialFinish, { once: true })
  window.addEventListener('resize', syncNavigationSemantics)
  initInitialLoading()
  if (document.readyState !== 'loading') {
    enhanceSearch()
    initRightsideEnhancement()
    initStatsFallback()
    syncNavigationSemantics()
    syncRouteState()
  }
})()
