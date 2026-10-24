(() => {
  'use strict'
  if (window.__fliexNotesIndex) { window.__fliexNotesIndex.init(); return }
  let cleanup = () => {}
  const PAGE_SIZE = 12

  const init = () => {
    const root = document.querySelector('.nova-notes-index')
    if (!root || root.dataset.ready) return
    cleanup()
    root.dataset.ready = 'true'

    const listeners = []
    const on = (target, event, fn) => { if (!target) return; target.addEventListener(event, fn); listeners.push(() => target.removeEventListener(event, fn)) }

    const input = root.querySelector('[data-notes-search]')
    const clearButton = root.querySelector('[data-notes-clear]')
    const filters = root.querySelector('[data-notes-filters]')
    const chips = filters ? [...filters.querySelectorAll('[data-filter]')] : []
    const rows = [...root.querySelectorAll('.nova-note-row')]
    const yearSections = [...root.querySelectorAll('[data-notes-year]')]
    const moreButton = root.querySelector('[data-notes-more]')
    const countLabel = root.querySelector('[data-notes-count]')
    const emptyMessage = root.querySelector('[data-notes-empty]')

    const state = { query: '', category: 'all', limit: PAGE_SIZE }
    let debounce = 0

    const isFiltered = () => Boolean(state.query.trim()) || state.category !== 'all'

    const apply = () => {
      const query = state.query.trim().toLowerCase()
      const matches = rows.map(row => {
        const inCategory = state.category === 'all' || row.dataset.category === state.category
        const inQuery = !query || (row.dataset.search || '').includes(query)
        return inCategory && inQuery
      })

      let visible = 0
      let limitedVisible = 0
      rows.forEach((row, index) => {
        if (!matches[index]) { row.hidden = true; return }
        visible += 1
        // Progressive disclosure only applies to the unfiltered archive.
        if (!isFiltered() && visible > state.limit) { row.hidden = true; return }
        row.hidden = false
        limitedVisible = visible
      })

      const shownCount = isFiltered() ? visible : limitedVisible
      yearSections.forEach(section => {
        const hasVisible = section.querySelectorAll('.nova-note-row:not([hidden])').length > 0
        section.hidden = !hasVisible
      })

      if (countLabel) countLabel.textContent = shownCount + (query || state.category !== 'all' ? ' MATCHES' : ' NOTES')
      if (emptyMessage) emptyMessage.hidden = shownCount > 0
      if (clearButton) clearButton.hidden = !state.query
      if (moreButton) {
        const remaining = isFiltered() ? 0 : Math.max(0, visible - limitedVisible)
        moreButton.hidden = remaining === 0
        if (remaining) moreButton.textContent = 'LOAD MORE · ' + remaining
      }
    }

    const revealAnchor = () => {
      const id = decodeURIComponent(location.hash.slice(1))
      if (!id.startsWith('notes-month-')) return
      const target = document.getElementById(id)
      const index = target ? rows.indexOf(target) : -1
      if (index >= 0 && target.hidden) {
        state.limit = Math.max(state.limit, index + 1)
        apply()
      }
    }

    const commitQuery = () => {
      state.query = input?.value || ''
      apply()
    }

    if (input) {
      on(input, 'input', () => {
        window.clearTimeout(debounce)
        debounce = window.setTimeout(commitQuery, 120)
      })
      on(input, 'keydown', event => {
        if (event.key === 'Escape' && input.value) {
          input.value = ''
          window.clearTimeout(debounce)
          commitQuery()
        }
      })
      on(input, 'search', commitQuery)
    }
    on(clearButton, 'click', () => {
      if (input) { input.value = ''; input.focus() }
      window.clearTimeout(debounce)
      commitQuery()
    })
    chips.forEach(chip => on(chip, 'click', () => {
      state.category = chip.dataset.filter || 'all'
      chips.forEach(item => item.setAttribute('aria-pressed', String(item === chip)))
      apply()
    }))
    on(moreButton, 'click', () => {
      state.limit += PAGE_SIZE
      apply()
      const next = root.querySelector('.nova-note-row[hidden]')
      if (next) { next.scrollIntoView({ block: 'center', behavior: 'instant' }) }
    })
    on(window, 'hashchange', revealAnchor)

    apply()
    revealAnchor()

    cleanup = () => {
      window.clearTimeout(debounce)
      listeners.splice(0).forEach(off => off())
      delete root.dataset.ready
    }
  }

  window.__fliexNotesIndex = { init }
  document.addEventListener('pjax:send', () => cleanup())
  document.addEventListener('pjax:complete', init)
  document.addEventListener('pjax:error', init)
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true })
  else init()
})()
