(() => {
  'use strict'

  if (window.__novaDecorativeScriptsScheduled) return
  window.__novaDecorativeScriptsScheduled = true

  const CDN_ROOT = 'https://cdn.jsdelivr.net/npm/butterfly-extsrc@1.1.6/dist/'

  const appendScript = (id, src, attributes = {}, onload) => {
    if (document.getElementById(id)) return
    const script = document.createElement('script')
    script.id = id
    script.src = src
    script.async = true
    Object.entries(attributes).forEach(([name, value]) => script.setAttribute(name, value))
    if (onload) script.addEventListener('load', onload, { once: true })
    document.body.appendChild(script)
  }

  const loadDecorativeScripts = () => {
    appendScript(
      'nova-power-mode',
      `${CDN_ROOT}activate-power-mode.min.js`,
      {},
      () => {
        if (!window.POWERMODE || document.body.dataset.novaPowerModeReady) return
        window.POWERMODE.colorful = true
        window.POWERMODE.shake = false
        window.POWERMODE.mobile = false
        document.body.addEventListener('input', window.POWERMODE)
        document.body.dataset.novaPowerModeReady = 'true'
      }
    )
  }

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(loadDecorativeScripts, { timeout: 2200 })
  } else {
    window.setTimeout(loadDecorativeScripts, 1500)
  }
})()
