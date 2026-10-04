(() => {
  'use strict'
  if (window.__fliexArticleReading) return
  let cleanup = () => {}
  const init = () => {
    const root = document.querySelector('.article-reading-shell')
    if (!root || root.dataset.ready) return
    root.dataset.ready = 'true'
    const links = [...root.querySelectorAll('[data-article-toc]')]
    const chapterById = new Map()
    let activeChapter = null
    links.forEach(link => {
      if (link.classList.contains('article-toc-link--h2')) activeChapter = link.dataset.articleToc
      chapterById.set(link.dataset.articleToc, activeChapter)
    })
    const percent = root.querySelector('[data-article-percent]')
    const rail = root.querySelector('[data-article-progress]')
    const dot = root.querySelector('[data-article-progress-dot]')
    const updateProgress = () => {
      const max = Math.max(1, document.documentElement.scrollHeight - innerHeight)
      const value = Math.max(0, Math.min(100, scrollY / max * 100))
      if (percent) percent.textContent = Math.round(value) + '%'
      if (rail) rail.style.height = value + '%'
      if (dot) dot.style.top = value + '%'
    }
    const headingNodes = links.map(link => document.getElementById(link.dataset.articleToc)).filter(Boolean)
    const setActive = id => {
      const chapter = chapterById.get(id)
      links.forEach(link => {
        const isCurrent = link.dataset.articleToc === id
        link.classList.toggle('is-active', isCurrent)
        link.classList.toggle('is-expanded', link.classList.contains('article-toc-link--h3') && chapterById.get(link.dataset.articleToc) === chapter)
      })
    }
    const updateCurrentHeading = () => {
      let current = headingNodes[0]
      headingNodes.forEach(heading => { if (heading.getBoundingClientRect().top <= innerHeight * .34) current = heading })
      if (current) setActive(current.id)
    }
    const top = root.querySelector('[data-article-top]')
    const mobile = root.querySelector('[data-article-mobile-toc]')
    const snowToggle = root.querySelector('[data-article-snow]')
    const snowCanvas = root.querySelector('[data-coast-snow]')
    const snowRoot = root.querySelector('[data-article-snow-root]')
    const music = root.querySelector('[data-article-music]')
    const musicSummary = root.querySelector('[data-music-summary]')
    const search = root.querySelector('[data-article-search]')
    const theme = root.querySelector('[data-article-theme]')
    const stopSnow = window.__fliexSnow?.mount(root, { canvas: snowCanvas, toggle: snowToggle, lightningRoot: snowRoot }) || (() => {})

    const renderMusic = () => {
      const state = window.__fliexMusic?.snapshot()
      if (!state || !music) return
      music.disabled = !state.ready
      music.title = state.ready ? '' : '等待添加歌曲'
      music.setAttribute('aria-label', state.ready ? (state.playing ? '暂停音乐' : '播放音乐') : '暂无可播放音乐')
      music.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path ' + (state.playing ? 'd="M8 4v16M16 4v16"' : 'data-play d="m9 5 11 7-11 7z"') + '/></svg>'
      if (musicSummary) musicSummary.textContent = state.playing ? state.artist + ' — ' + state.title : state.ready ? 'Music / Ready' : 'Music'
    }
    document.addEventListener('fliex:music', renderMusic)

    const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark'
    const syncTheme = () => {
      const label = isDark() ? '切换到浅色模式' : '切换到深色模式'
      theme.setAttribute('aria-label', label)
      theme.setAttribute('title', label)
    }
    const toggleTheme = () => {
      const next = isDark() ? 'light' : 'dark'
      if (window.btf?.activateDarkMode && window.btf?.activateLightMode) {
        if (next === 'dark') window.btf.activateDarkMode()
        else window.btf.activateLightMode()
        window.btf.saveToLocal?.set('theme', next, 2)
      } else if (document.getElementById('darkmode')) {
        document.getElementById('darkmode').click()
        return
      } else {
        document.documentElement.setAttribute('data-theme', next)
      }
      syncTheme()
    }
    const themeObserver = new MutationObserver(syncTheme)
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    syncTheme()

    const onScroll = () => { updateProgress(); updateCurrentHeading() }
    addEventListener('scroll', onScroll, { passive: true })
    top.addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }))
    mobile.addEventListener('click', () => { const open = root.classList.toggle('is-toc-open'); mobile.setAttribute('aria-expanded', String(open)) })
    links.forEach(link => link.addEventListener('click', () => { root.classList.remove('is-toc-open'); mobile.setAttribute('aria-expanded', 'false'); requestAnimationFrame(() => setActive(link.dataset.articleToc)) }))
    search.addEventListener('click', () => window.__fliexOpenSearch?.())
    theme.addEventListener('click', toggleTheme)
    music?.addEventListener('click', () => window.__fliexMusic?.toggle())
    updateProgress(); updateCurrentHeading(); renderMusic()
    window.__fliexMusic?.load()
    cleanup = () => {
      removeEventListener('scroll', onScroll)
      document.removeEventListener('fliex:music', renderMusic)
      themeObserver.disconnect()
      stopSnow()
      delete root.dataset.ready
    }
  }
  window.__fliexArticleReading = { init }
  document.addEventListener('pjax:send', () => cleanup())
  document.addEventListener('pjax:complete', init)
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init()
})()
