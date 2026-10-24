(() => {
  'use strict'
  if (window.__novaHomeBootstrap) { window.__novaHomeBootstrap.init(); return }
  let cleanup = () => {}
  const destroy = () => { cleanup(); cleanup = () => {} }
  // PJAX preserves body: update the class used by the homepage-only collage.
  // CSS owns backgrounds; other routes keep their own monochrome stages.
  const applyRouteBackground = () => {
    const isHome = Boolean(document.querySelector('main.archive-home'))
    document.body.classList.toggle('nova-home-active', isHome)
  }
  const init = () => {
    applyRouteBackground()
    const root = document.querySelector('[data-nova-home]')
    if (!root || root.dataset.ready) return
    destroy()
    root.dataset.ready = 'true'
    const listeners = []
    const on = (target, name, fn) => {
      target.addEventListener(name, fn)
      listeners.push(() => target.removeEventListener(name, fn))
    }
    const modeToggle = root.querySelector('[data-home-mode-toggle]')
    if (modeToggle) {
      const applyMode = mode => {
        root.dataset.homeMode = mode
        modeToggle.setAttribute('aria-label', mode === 'quiet' ? '切换到开发者模式' : '切换到纯净模式')
        modeToggle.setAttribute('aria-pressed', String(mode === 'quiet'))
      }
      let mode = 'developer'
      try { if (localStorage.getItem('fliex-home-mode') === 'quiet') mode = 'quiet' } catch {}
      applyMode(mode)
      on(modeToggle, 'click', () => {
        const next = root.dataset.homeMode === 'quiet' ? 'developer' : 'quiet'
        root.dataset.modeAnimated = 'true'
        applyMode(next)
        try { localStorage.setItem('fliex-home-mode', next) } catch {}
      })
    }
    const stopSnow = window.__fliexSnow.mount(root)
    on(root.querySelector('[data-coast-search]'), 'click', () => window.__fliexOpenSearch?.())
    on(root.querySelector('[data-coast-theme]'), 'click', () => {
      const dark = document.documentElement.getAttribute('data-theme') === 'dark'
      if (window.btf?.activateDarkMode && window.btf?.activateLightMode) {
        if (dark) window.btf.activateLightMode(); else window.btf.activateDarkMode()
        window.btf.saveToLocal?.set('theme', dark ? 'light' : 'dark', 2)
      } else document.documentElement.setAttribute('data-theme', dark ? 'light' : 'dark')
    })
    const renderMusic = () => {
      const state = window.__fliexMusic?.snapshot()
      if (!state) return
      root.querySelectorAll('[data-music-title]').forEach(el => { el.textContent = state.song?.name || '' })
      root.querySelectorAll('[data-music-artist]').forEach(el => { el.textContent = state.song?.artist || '' })
      root.querySelectorAll('[data-music-summary]').forEach(el => { el.textContent = state.playing ? 'MUSIC / PLAYING' : state.ready || state.configured ? 'MUSIC / PAUSED' : 'MUSIC' })
      root.querySelectorAll('[data-music-toggle]').forEach(el => {
        el.disabled = false
        el.title = ''
        el.setAttribute('aria-label', state.playing ? '暂停音乐' : '播放音乐')
        el.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path ' + (state.playing ? 'd="M8 4v16M16 4v16"' : 'data-play d="m9 5 11 7-11 7z"') + '/></svg>'
      })
      const progress = state.duration ? Math.min(100, state.currentTime / state.duration * 100) : 0
      root.querySelector('[data-music-progress]').style.width = progress + '%'
      root.querySelector('.coast-progress').setAttribute('aria-valuenow', String(Math.round(progress)))
      const retry = root.querySelector('[data-music-retry]')
      retry.hidden = !state.failed
      retry.textContent = state.failed ? '音乐暂时不可用 · 重试' : '重试'
      root.querySelector('[data-music-loading]').hidden = state.ready || state.failed || state.configured
      root.querySelector('.coast-music-info').hidden = !state.ready
    }
    on(document, 'fliex:music', renderMusic)
    root.querySelectorAll('[data-music-toggle]').forEach(el => on(el, 'click', () => window.__fliexMusic?.toggle()))
    on(root.querySelector('[data-music-retry]'), 'click', () => window.__fliexMusic?.retry())
    cleanup = () => { stopSnow(); listeners.splice(0).forEach(off => off()); delete root.dataset.ready }
    renderMusic()
    window.__fliexMusic?.load()
  }
  window.__novaHomeBootstrap = { init, destroy, get running() { return window.__fliexSnow.running } }
  document.addEventListener('pjax:send', destroy)
  document.addEventListener('pjax:complete', init)
  document.addEventListener('pjax:error', init)
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true })
  else init()
})()
