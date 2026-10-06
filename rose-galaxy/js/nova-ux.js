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
    'nova-about-route',
    'nova-notes-route',
    'article-sea-route',
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
        <small>正在加载...</small>
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
        <a href="/notes/">笔记</a>
        <a href="/about/">关于</a>
        <a href="/projects/">项目</a>
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
    finishInitialLoading()
  }

  function finishNavigation() {
    syncRouteState()
    finishInitialLoading()
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
      ['.nova-music-page', ['nova-music-route']],
      ['.nova-about-shell', ['nova-about-route']],
      ['.nova-notes-shell', ['nova-notes-route']],
      ['.article-reading-shell', ['article-sea-route']],
      ['.coast-home[data-nova-home]', ['nova-home-active']],
      ['.nova-about-page', ['nova-about-route']],
    ]
    const match = routeMarkers.find(([selector]) => document.querySelector(selector))
    if (match) document.body.classList.add(...match[1])
  }

  document.addEventListener('pjax:send', beginNavigation)
  document.addEventListener('pjax:complete', finishNavigation)
  document.addEventListener('pjax:error', finishNavigation)
  document.addEventListener('DOMContentLoaded', enhanceSearch, { once: true })
  document.addEventListener('DOMContentLoaded', initStatsFallback, { once: true })
  document.addEventListener('DOMContentLoaded', syncNavigationSemantics, { once: true })
  document.addEventListener('DOMContentLoaded', syncRouteState, { once: true })
  document.addEventListener('pjax:complete', enhanceSearch)
  document.addEventListener('pjax:complete', initStatsFallback)
  document.addEventListener('pjax:complete', syncNavigationSemantics)
  document.addEventListener('pjax:complete', syncRouteState)
  window.addEventListener('pageshow', finishInitialLoading)
  window.addEventListener('pageshow', scheduleInitialFinish, { once: true })
  window.addEventListener('resize', syncNavigationSemantics)
  initInitialLoading()
  if (document.readyState !== 'loading') {
    enhanceSearch()
    initStatsFallback()
    syncNavigationSemantics()
    syncRouteState()
  }
})()
