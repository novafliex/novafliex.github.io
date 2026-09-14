(() => {
  'use strict'

  if (window.__novaShuoshuoBootstrap) {
    window.__novaShuoshuoBootstrap.init()
    return
  }

  function initialiseShuoshuoPage() {
    const page = document.querySelector('.nova-shuoshuo-page')
    if (!page || page.dataset.ready === 'true') return
    page.dataset.ready = 'true'

    page.querySelectorAll('.nova-shuoshuo-like').forEach(button => {
      const count = button.querySelector('b')
      const icon = button.querySelector('span')
      const baseCount = Number(button.dataset.baseCount || 0)
      const storageKey = button.dataset.storageKey
      const applyState = liked => {
        button.classList.toggle('is-liked', liked)
        button.setAttribute('aria-pressed', String(liked))
        count.textContent = String(baseCount + (liked ? 1 : 0))
        icon.textContent = liked ? '♥' : '♡'
      }

      let liked = false
      try {
        liked = localStorage.getItem(storageKey) === 'true'
      } catch (_) {
        liked = false
      }
      applyState(liked)

      button.addEventListener('click', () => {
        liked = !liked
        try {
          localStorage.setItem(storageKey, String(liked))
        } catch (_) {
          // Visual feedback remains available when storage is blocked.
        }
        applyState(liked)
      })
    })
  }

  window.__novaShuoshuoBootstrap = { init: initialiseShuoshuoPage }
  document.addEventListener('DOMContentLoaded', initialiseShuoshuoPage, { once: true })
  document.addEventListener('pjax:complete', initialiseShuoshuoPage)
  if (document.readyState !== 'loading') initialiseShuoshuoPage()
})()
