(() => {
  'use strict'

  if (window.__novaGalleryBootstrap) {
    window.__novaGalleryBootstrap.init()
    return
  }

  const ROOT_SELECTOR = '[data-gallery-root]'
  const SLOT_PREFIX = 'nova-gallery-item--slot-'
  let controller = null

  function decoratePage(root) {
    document.body.classList.add('nova-gallery-route')

    const header = document.querySelector('#page-header')
    if (header) header.classList.add('nova-gallery-nav-header')

    const comment = document.querySelector('#post-comment')
    if (comment) {
      comment.classList.add('nova-gallery-comments')
      const headline = comment.querySelector('.comment-headline')
      if (headline && !headline.querySelector('strong')) {
        headline.innerHTML = '<span>NIGHT MESSAGES</span><strong>留言</strong>'
      }
    }

    return root
  }

  function initGallery() {
    const root = document.querySelector(ROOT_SELECTOR)
    if (!root) return
    decoratePage(root)
    if (root.dataset.galleryReady === 'true') return
    controller?.destroy()
    root.dataset.galleryReady = 'true'

    const grids = [...root.querySelectorAll('[data-gallery-grid]')]
    const photos = [...root.querySelectorAll('[data-gallery-photo]')]
    const items = [...root.querySelectorAll('[data-gallery-item]')]
    const buttons = [...root.querySelectorAll('[data-gallery-filter]')]
    const sort = root.querySelector('[data-gallery-sort]')
    const empty = root.querySelector('[data-gallery-empty]')
    const categories = [...new Set(items.map(item => item.dataset.category).filter(Boolean))]
    let activeFilter = 'all'
    let resizeTimer = 0

    const total = root.querySelector('[data-gallery-total]')
    const categoryTotal = root.querySelector('[data-gallery-category-total]')
    const updated = root.querySelector('[data-gallery-updated]')
    if (total) total.textContent = String(items.length)
    if (categoryTotal) categoryTotal.textContent = String(categories.length)

    const latestDate = photos
      .map(photo => photo.dataset.updated)
      .filter(Boolean)
      .sort()
      .at(-1)

    if (updated && latestDate) {
      updated.dateTime = latestDate
      updated.textContent = latestDate.replaceAll('-', '.')
    }

    function sortItems(mode) {
      const ordered = [...items].sort((a, b) => {
        if (mode === 'default') return Number(a.dataset.originalIndex) - Number(b.dataset.originalIndex)
        const aDate = a.querySelector('[data-gallery-photo]')?.dataset.updated || ''
        const bDate = b.querySelector('[data-gallery-photo]')?.dataset.updated || ''
        const dateOrder = mode === 'newest' ? bDate.localeCompare(aDate) : aDate.localeCompare(bDate)
        return dateOrder || Number(a.dataset.originalIndex) - Number(b.dataset.originalIndex)
      })
      ordered.forEach(item => {
        const targetName = item.hasAttribute('data-gallery-featured') ? 'featured' : 'archive'
        root.querySelector(`[data-gallery-grid="${targetName}"]`)?.appendChild(item)
      })
    }

    function setItemRatio(item) {
      const photo = item.querySelector('[data-gallery-photo]')
      const width = photo?.naturalWidth || Number(photo?.getAttribute('width')) || 1
      const height = photo?.naturalHeight || Number(photo?.getAttribute('height')) || 1
      const ratio = width / height
      item.dataset.galleryRatio = ratio >= 1.35 ? 'wide' : ratio <= .82 ? 'portrait' : 'square'
      item.style.setProperty('--gallery-aspect', String(ratio))
    }

    function measureItem(item) {
      const image = item.querySelector('.nova-gallery-item__image')
      if (!image || item.hidden) return
      const itemGrid = item.closest('[data-gallery-grid]')
      if (!itemGrid) return
      const styles = getComputedStyle(itemGrid)
      const rowHeight = Number.parseFloat(styles.gridAutoRows)
      const rowGap = Number.parseFloat(styles.rowGap)
      if (!rowHeight || !Number.isFinite(rowHeight)) return
      const targetHeight = image.getBoundingClientRect().width / Number(item.style.getPropertyValue('--gallery-aspect') || 1)
      item.style.setProperty('--gallery-row-span', String(Math.max(1, Math.ceil((targetHeight + rowGap) / (rowHeight + rowGap)))))
    }

    function arrangeVisibleItems() {
      items.forEach(item => {
        ;[...item.classList]
          .filter(className => className.startsWith(SLOT_PREFIX))
          .forEach(className => item.classList.remove(className))
        item.classList.remove('nova-gallery-item--last-group')
      })
      const visibleItems = items.filter(item => !item.hidden)
      grids.forEach(itemGrid => {
        const groupItems = [...itemGrid.querySelectorAll('[data-gallery-item]:not([hidden])')]
        groupItems.forEach((item, index) => {
          setItemRatio(item)
          item.dataset.galleryCount = String(groupItems.length)
          item.classList.add(`${SLOT_PREFIX}${index % 6 + 1}`)
        })
        itemGrid.dataset.visibleRemainder = String(groupItems.length % 6)
        itemGrid.closest('.nova-gallery-collection')?.toggleAttribute('hidden', groupItems.length === 0)
      })
      if (empty) empty.hidden = visibleItems.length !== 0
      requestAnimationFrame(() => visibleItems.forEach(measureItem))
    }

    function applyFilter(filter) {
      activeFilter = filter
      buttons.forEach(button => {
        const active = button.dataset.galleryFilter === filter
        button.classList.toggle('is-active', active)
        button.setAttribute('aria-pressed', String(active))
      })
      items.forEach(item => {
        item.hidden = filter !== 'all' && item.dataset.category !== filter
      })
      arrangeVisibleItems()
    }

    buttons.forEach(button => {
      button.addEventListener('click', () => applyFilter(button.dataset.galleryFilter))
    })

    if (sort) {
      sort.addEventListener('change', () => {
        sortItems(sort.value)
        applyFilter(activeFilter)
      })
    }

    photos.forEach(photo => {
      const rearrange = () => arrangeVisibleItems()
      if (!photo.complete) photo.addEventListener('load', rearrange, { once: true })
      photo.addEventListener('error', () => {
        photo.closest('[data-gallery-item]')?.classList.add('is-image-error')
        photo.setAttribute('aria-label', `${photo.alt || '照片'}加载失败`)
      }, { once: true })
    })

    const handleResize = () => {
      window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(arrangeVisibleItems, 140)
    }
    window.addEventListener('resize', handleResize, { passive: true })

    sortItems('default')
    applyFilter('all')
    controller = {
      destroy() {
        window.clearTimeout(resizeTimer)
        window.removeEventListener('resize', handleResize)
      }
    }
  }

  function leaveGallery() {
    controller?.destroy()
    controller = null
    document.body.classList.remove('nova-gallery-route')
    document.querySelector('#page-header')?.classList.remove('nova-gallery-nav-header')
  }

  window.__novaGalleryBootstrap = { init: initGallery, destroy: leaveGallery }
  initGallery()
  document.addEventListener('DOMContentLoaded', initGallery, { once: true })
  document.addEventListener('pjax:send', leaveGallery)
  document.addEventListener('pjax:complete', initGallery)
})()
