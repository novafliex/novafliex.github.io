(() => {
  'use strict'

  if (!window.__novaTagReader) {
    const reader = {
      observer: null,
      page: null,
      cards: [],
      links: [],
      activeIndex: -1,

      destroy() {
        this.observer?.disconnect()
        this.observer = null
        this.page = null
        this.cards = []
        this.links = []
        this.activeIndex = -1
      },

      setActive(index) {
        if (!this.page || index < 0 || index >= this.cards.length || index === this.activeIndex) return
        this.activeIndex = index
        const card = this.cards[index]
        const title = card.dataset.noteTitle || '当前专题'
        const href = card.dataset.noteHref || '#'
        const position = index + 1
        const percent = Math.round((position / this.cards.length) * 100)

        this.cards.forEach((item, itemIndex) => item.classList.toggle('is-current-note', itemIndex === index))
        this.links.forEach(link => {
          const targetIndex = this.cards.findIndex(item => item.id === link.dataset.noteTarget)
          link.classList.toggle('is-current', targetIndex === index)
          link.classList.toggle('is-complete', targetIndex >= 0 && targetIndex < index)
          if (targetIndex === index) link.setAttribute('aria-current', 'true')
          else link.removeAttribute('aria-current')
        })

        const titleElement = this.page.querySelector('.nova-tag-current-title')
        const countElement = this.page.querySelector('.nova-tag-current-count')
        const percentElement = this.page.querySelector('.nova-tag-current-percent')
        const progress = this.page.querySelector('.nova-tag-progress i')
        const openLink = this.page.querySelector('.nova-tag-current-open')
        if (titleElement) titleElement.textContent = title
        if (countElement) countElement.textContent = `${String(position).padStart(2, '0')} / ${String(this.cards.length).padStart(2, '0')}`
        if (percentElement) percentElement.textContent = `${percent}%`
        if (progress) progress.style.transform = `scaleX(${percent / 100})`
        if (openLink) openLink.href = href
      },

      init() {
        this.destroy()
        const page = document.querySelector('body.nova-tag-route .nova-tag-content')
        if (!page) return
        this.page = page
        this.cards = [...page.querySelectorAll('.nova-tag-post-card')]
        this.links = [...page.querySelectorAll('.nova-tag-reading-link[data-note-target]')]
        if (!this.cards.length || !('IntersectionObserver' in window)) return

        this.observer = new IntersectionObserver(entries => {
          const visible = entries
            .filter(entry => entry.isIntersecting)
            .sort((left, right) => right.intersectionRatio - left.intersectionRatio)
          if (!visible.length) return
          this.setActive(this.cards.indexOf(visible[0].target))
        }, {
          root: null,
          rootMargin: '-22% 0px -58% 0px',
          threshold: [0, 0.15, 0.35, 0.6]
        })
        this.cards.forEach(card => this.observer.observe(card))
      }
    }

    window.__novaTagReader = reader
    document.addEventListener('pjax:send', () => reader.destroy())
    document.addEventListener('pjax:complete', () => reader.init())
  }

  window.__novaTagReader.init()
})()
