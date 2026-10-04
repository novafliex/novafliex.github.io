(() => {
  'use strict'
  if (window.__novaHomeBootstrap) { window.__novaHomeBootstrap.init(); return }
  let cleanup = () => {}
  const destroy = () => { cleanup(); cleanup = () => {} }
  const init = () => {
    const root = document.querySelector('[data-nova-home]')
    if (!root || root.dataset.ready) return
    destroy()
    root.dataset.ready = 'true'
    const listeners = []
    const on = (target, name, fn) => {
      target.addEventListener(name, fn)
      listeners.push(() => target.removeEventListener(name, fn))
    }
    const stopSnow = window.__fliexSnow.mount(root)
    on(root.querySelector('[data-coast-search]'), 'click', () => window.__fliexOpenSearch?.())
    on(root.querySelector('[data-coast-theme]'), 'click', () => document.getElementById('darkmode')?.click())
    const renderMusic = () => {
      const state = window.__fliexMusic?.snapshot()
      if (!state) return
      root.querySelectorAll('[data-music-title]').forEach(el => { el.textContent = state.title })
      root.querySelectorAll('[data-music-artist]').forEach(el => { el.textContent = state.artist })
      root.querySelectorAll('[data-music-summary]').forEach(el => { el.textContent = state.playing ? state.artist + ' — ' + state.title : state.ready ? 'Music / Ready' : 'Music' })
      root.querySelectorAll('[data-music-toggle]').forEach(el => {
        el.disabled = !state.ready
        el.title = state.ready ? '' : '等待添加歌曲'
        el.setAttribute('aria-label', state.ready ? (state.playing ? '暂停音乐' : '播放音乐') : '暂无可播放音乐')
        el.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path ' + (state.playing ? 'd="M8 4v16M16 4v16"' : 'data-play d="m9 5 11 7-11 7z"') + '/></svg>'
      })
      const progress = state.duration ? Math.min(100, state.currentTime / state.duration * 100) : 0
      root.querySelector('[data-music-progress]').style.width = progress + '%'
      root.querySelector('.coast-progress').setAttribute('aria-valuenow', String(Math.round(progress)))
      root.querySelector('[data-music-retry]').hidden = !state.failed
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
