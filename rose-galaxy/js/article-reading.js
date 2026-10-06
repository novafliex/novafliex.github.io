(() => {
  'use strict'
  if (window.__fliexArticleReading) { window.__fliexArticleReading.init(); return }
  let cleanup = () => {}
  const init = () => {
    const root = document.querySelector('.article-reading-shell')
    if (!root || root.dataset.ready) return
    cleanup()
    root.dataset.ready = 'true'
    const listeners = []
    const on = (target, event, fn) => { if (!target) return; target.addEventListener(event, fn); listeners.push(() => target.removeEventListener(event, fn)) }
    root.querySelectorAll('.article-code-copy').forEach(button => on(button, 'click', async () => {
      try {
        await navigator.clipboard.writeText(button.closest('figure').querySelector('.code pre')?.textContent || '')
        button.textContent = 'Copied'
      } catch { button.textContent = 'Retry' }
    }))
    const links = [...root.querySelectorAll('[data-article-toc]')]
    const headings = links.map(link => document.getElementById(link.dataset.articleToc)).filter(Boolean)
    const mobile = root.querySelector('[data-article-mobile-toc]')
    let frame = 0
    const update = () => {
      frame = 0
      let active = headings[0]
      headings.forEach(heading => { if (heading.getBoundingClientRect().top <= 150) active = heading })
      const workspace = root.querySelector('.article-workspace')
      const top = workspace.getBoundingClientRect().top + window.scrollY
      const distance = Math.max(1, workspace.offsetHeight - window.innerHeight)
      const percent = Math.max(0, Math.min(100, Math.round((window.scrollY - top) / distance * 100)))
      const progress = root.querySelector('.article-progress')
      progress?.setAttribute('aria-valuenow', String(percent))
      const label = root.querySelector('[data-article-progress]'); if (label) label.textContent = percent + '%'
      root.querySelector('.article-toc-sidebar')?.style.setProperty('--article-progress', percent + '%')
      if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4) active = headings.at(-1)
      let chapter = ''
      links.forEach(link => { if (link.dataset.articleToc === active?.id) chapter = link.dataset.articleChapter })
      links.forEach(link => {
        const current = link.dataset.articleToc === active?.id
        link.classList.toggle('is-active', current)
        if (current) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current')
        link.classList.toggle('is-expanded', link.dataset.articleChapter === chapter)
        link.classList.toggle('is-active-chapter', link.classList.contains('article-toc-link--h2') && link.dataset.articleChapter === chapter)
      })
    }
    on(window, 'scroll', () => { if (!frame) frame = requestAnimationFrame(update) })
    on(window, 'resize', () => { if (!frame) frame = requestAnimationFrame(update) })
    on(mobile, 'click', () => { mobile.setAttribute('aria-expanded', String(root.classList.toggle('is-toc-open'))) })
    links.forEach(link => on(link, 'click', () => { root.classList.remove('is-toc-open'); mobile.setAttribute('aria-expanded', 'false') }))
    const renderMusic = () => {
      const state = window.__fliexMusic?.snapshot()
      if (!state) return
      root.querySelectorAll('[data-music-title]').forEach(el => { el.textContent = state.title })
      root.querySelectorAll('[data-music-artist]').forEach(el => { el.textContent = state.artist })
      root.querySelectorAll('[data-music-toggle]').forEach(el => {
        el.disabled = !state.ready
        el.setAttribute('aria-label', state.playing ? '暂停音乐' : '播放音乐')
        el.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path ' + (state.playing ? 'd="M8 4v16M16 4v16"' : 'd="m9 5 11 7-11 7z"') + '/></svg>'
      })
      const value = state.duration ? Math.min(100, state.currentTime / state.duration * 100) : 0
      root.querySelector('[data-music-progress]').style.width = value + '%'
      root.querySelector('.coast-progress').setAttribute('aria-valuenow', String(Math.round(value)))
      root.querySelector('[data-music-retry]').hidden = !state.failed
      const musicPending = root.querySelector('[data-music-loading]')
      if (musicPending) musicPending.hidden = state.ready || state.failed || state.configured
      const musicInfo = root.querySelector('.coast-music-info')
      if (musicInfo) musicInfo.hidden = !state.ready
    }
    on(document, 'fliex:music', renderMusic)
    root.querySelectorAll('[data-music-toggle]').forEach(el => on(el, 'click', () => window.__fliexMusic?.toggle()))
    on(root.querySelector('[data-music-retry]'), 'click', () => window.__fliexMusic?.retry())
    on(root.querySelector('[data-coast-theme]'), 'click', () => {
      const dark = document.documentElement.getAttribute('data-theme') === 'dark'
      if (window.btf?.activateDarkMode && window.btf?.activateLightMode) {
        if (dark) window.btf.activateLightMode(); else window.btf.activateDarkMode()
        window.btf.saveToLocal?.set('theme', dark ? 'light' : 'dark', 2)
      } else document.documentElement.setAttribute('data-theme', dark ? 'light' : 'dark')
    })
    update(); renderMusic(); window.__fliexMusic?.load()
    cleanup = () => { listeners.splice(0).forEach(off => off()); cancelAnimationFrame(frame); frame = 0; delete root.dataset.ready }
  }
  window.__fliexArticleReading = { init }
  document.addEventListener('pjax:send', () => cleanup())
  document.addEventListener('pjax:complete', init)
  document.addEventListener('pjax:error', init)
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init()
})()
