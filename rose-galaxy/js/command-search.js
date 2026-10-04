(() => {
  'use strict'
  if (window.__fliexOpenSearch) return
  let dialog = null, input = null, results = null, status = null, previousFocus = null, entries = null, loading = null
  const render = () => {
    results.replaceChildren()
    const query = input.value.trim().toLocaleLowerCase()
    if (!entries) return
    if (!query) { status.textContent = '输入关键词，搜索文章、笔记与公开页面。'; return }
    const matches = entries.filter(entry => (entry.title + ' ' + entry.content).toLocaleLowerCase().includes(query)).slice(0, 30)
    status.textContent = matches.length ? '找到 ' + matches.length + ' 条记录' : '没有找到相关记录，试试更短的关键词。'
    matches.forEach(entry => {
      const li = document.createElement('li'), a = document.createElement('a'), text = document.createElement('p')
      a.href = entry.url; a.textContent = entry.title
      text.textContent = entry.content.slice(0, 100)
      li.append(a, text); results.append(li)
    })
  }
  const load = () => {
    if (entries) return Promise.resolve()
    if (loading) return loading
    status.textContent = '正在载入搜索索引…'
    loading = (async () => {
      const response = await fetch('/search.xml')
      if (!response.ok) throw new Error('搜索索引暂时不可用')
      const xml = new DOMParser().parseFromString(await response.text(), 'application/xml')
      if (xml.querySelector('parsererror')) throw new Error('搜索索引格式异常')
      entries = [...xml.querySelectorAll('entry')].map(entry => {
        const raw = entry.querySelector('content')?.textContent || ''
        const fragment = new DOMParser().parseFromString(raw, 'text/html')
        return { title: entry.querySelector('title')?.textContent || '', url: entry.querySelector('url')?.textContent || '', content: fragment.body.textContent.replace(/\s+/g, ' ').trim() }
      }).filter(entry => entry.title && /^\/(?!\/)/.test(entry.url))
      render()
    })().catch(error => { status.textContent = error.message + '，关闭后重新打开可重试。' }).finally(() => { loading = null })
    return loading
  }
  const close = () => { if (dialog?.open) dialog.close() }
  const open = () => {
    if (!dialog) {
      dialog = document.createElement('dialog'); dialog.className = 'coast-search-dialog'
      dialog.setAttribute('aria-labelledby', 'coast-search-title')
      dialog.innerHTML = '<header><h2 id="coast-search-title">Search</h2><button type="button" aria-label="关闭搜索">×</button></header><label for="coast-search-input">搜索文章、笔记与项目</label><input id="coast-search-input" type="search" placeholder="输入关键词…" autocomplete="off"><p role="status"></p><ul></ul>'
      document.body.appendChild(dialog)
      input = dialog.querySelector('input'); results = dialog.querySelector('ul'); status = dialog.querySelector('[role=status]')
      input.addEventListener('input', render)
      dialog.querySelector('button').addEventListener('click', close)
      dialog.addEventListener('close', () => { if (previousFocus?.isConnected) previousFocus.focus() })
      dialog.addEventListener('click', event => {
        if (event.target.closest('a')) close()
        if (event.target === dialog) {
          const rect = dialog.getBoundingClientRect()
          if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close()
        }
      })
      dialog.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return }
        if (event.key === 'Enter' && event.target === input) { const link = results.querySelector('a'); if (link) link.click() }
      })
    }
    if (dialog.open) { input.focus(); return }
    previousFocus = document.activeElement
    dialog.showModal(); input.focus(); render(); load()
  }
  window.__fliexOpenSearch = open
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); open() }
  })
  document.addEventListener('click', event => {
    if (!event.target.closest('#search-button > .search')) return
    event.preventDefault(); event.stopImmediatePropagation(); open()
  }, true)
  document.addEventListener('pjax:send', close)
})()
