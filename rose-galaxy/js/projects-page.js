(() => {
  'use strict'
  if (window.__fliexProjects) { window.__fliexProjects.init(); return }
  let cleanup = () => {}
  const destroy = () => { cleanup(); cleanup = () => {} }
  const init = () => {
    const root = document.querySelector('[data-projects-switcher]')
    if (!root || root.dataset.projectsReady) return
    destroy()
    root.dataset.projectsReady = 'true'
    const tabs = [...root.querySelectorAll('[data-project-tab]')]
    const panels = [...root.querySelectorAll('[data-project-panel]')]
    const list = root.querySelector('[role=tablist]')
    const compact = window.matchMedia('(max-width:1100px)')
    const listeners = []
    const on = (target, name, fn) => {
      target.addEventListener(name, fn)
      listeners.push(() => target.removeEventListener(name, fn))
    }
    const revealTab = tab => {
      if (!compact.matches || !tab) return
      const left = tab.offsetLeft, right = left + tab.offsetWidth
      if (left < list.scrollLeft) list.scrollLeft = left
      else if (right > list.scrollLeft + list.clientWidth) list.scrollLeft = right - list.clientWidth
    }
    const orientation = () => {
      list.setAttribute('aria-orientation', compact.matches ? 'horizontal' : 'vertical')
      revealTab(tabs.find(tab => tab.getAttribute('aria-selected') === 'true'))
    }
    const choose = (index, {animate = true, updateUrl = true} = {}) => {
      const selected = tabs[index]
      if (!selected) return
      tabs.forEach((tab, i) => {
        const active = i === index
        tab.setAttribute('aria-selected', String(active))
        tab.tabIndex = active ? 0 : -1
        panels[i].classList.remove('is-entering')
        panels[i].hidden = !active
      })
      if (animate) panels[index].classList.add('is-entering')
      revealTab(selected)
      if (updateUrl) {
        const heading = panels[index].querySelector('h2[id]')
        // replaceState changes the deep link without scrolling or triggering PJAX.
        try { history.replaceState(history.state, '', '#' + heading.id) } catch {}
      }
    }
    const fromHash = () => {
      let id
      try { id = decodeURIComponent(location.hash.slice(1)) } catch { return }
      const index = panels.findIndex(panel => panel.id === id || panel.querySelector('h2[id]')?.id === id)
      if (index >= 0) choose(index, {animate:false, updateUrl:false})
    }
    tabs.forEach((tab, index) => {
      on(tab, 'click', () => choose(index))
      on(tab, 'keydown', event => {
        const direction = {ArrowDown:1, ArrowRight:1, ArrowUp:-1, ArrowLeft:-1}[event.key]
        if (!direction && !['Home', 'End'].includes(event.key)) return
        event.preventDefault()
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + direction + tabs.length) % tabs.length
        tabs[next].focus({preventScroll:true})
        choose(next)
      })
    })
    on(window, 'hashchange', fromHash)
    on(window, 'popstate', fromHash)
    on(compact, 'change', orientation)
    orientation()
    fromHash()
    cleanup = () => {
      listeners.splice(0).forEach(off => off())
      delete root.dataset.projectsReady
    }
  }
  window.__fliexProjects = {init, destroy}
  document.addEventListener('pjax:send', destroy)
  document.addEventListener('pjax:complete', init)
  document.addEventListener('pjax:error', init)
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true})
  else init()
})()
