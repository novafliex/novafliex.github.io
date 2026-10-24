(() => {
  'use strict'
  if (window.NovaListeningUI) { window.NovaListeningUI.init(); return }
  const HISTORY_PAGE_SIZE = 60
  let mounted, cleanup = () => {}
  const escape = text => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c])
  const date = (value, options) => new Date(value).toLocaleDateString('en-US', options)
  const clock = value => new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const duration = value => { const seconds = Math.floor(value), minutes = Math.floor(seconds/60), tail = String(seconds%60).padStart(2,'0'); return minutes >= 60 ? `${Math.floor(minutes/60)}h ${String(minutes%60).padStart(2,'0')}m` : minutes ? `${minutes}m ${tail}s` : `${seconds}s` }
  // Patch existing nodes: live updates must preserve focus and scroll positions.
  const syncDOM = (target, source) => {
    if (target.nodeType !== source.nodeType || target.nodeName !== source.nodeName) { target.replaceWith(source.cloneNode(true)); return }
    if (target.nodeType !== 1) { if (target.nodeValue !== source.nodeValue) target.nodeValue = source.nodeValue; return }
    for (const attr of [...target.attributes]) if (!source.hasAttribute(attr.name)) target.removeAttribute(attr.name)
    for (const attr of [...source.attributes]) if (target.getAttribute(attr.name) !== attr.value) target.setAttribute(attr.name,attr.value)
    const old = [...target.childNodes], next = [...source.childNodes]
    next.forEach((node,index) => { if (old[index]) syncDOM(old[index],node); else target.append(node.cloneNode(true)) })
    old.slice(next.length).forEach(node => node.remove())
  }
  const trackTime = value => `${String(Math.floor(value/60)).padStart(2,'0')}:${String(Math.floor(value%60)).padStart(2,'0')}`
  const ICONS = {
    plays: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 19.5v-7M9.5 19.5v-15M14.5 19.5v-10M19.5 19.5v-4"/></svg>',
    time: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.4"/><path d="M12 7.4V12l3.2 2.1"/></svg>',
    tracks: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8 2.8 7.4 12 12l9.2-4.6zM4.7 12.3l-1.9 1 9.2 4.6 9.2-4.6-1.9-1M4.7 16.7l-1.9 1 9.2 4.6 9.2-4.6-1.9-1"/></svg>',
    last: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.6" y="5" width="16.8" height="15.4"/><path d="M3.6 9.6h16.8M8.2 3v4M15.8 3v4"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.4 5.6v12.8L18.6 12z" fill="currentColor" stroke="none"/></svg>',
    note: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.4 17.8V6.2l9.2-1.8v11.4"/><circle cx="7" cy="17.8" r="2.4"/><circle cx="16.2" cy="15.8" r="2.4"/></svg>'
  }
  const statCell = (index, label, value, icon) => `<div class="archive-stat"><span class="archive-stat-icon">${icon}</span><div class="archive-stat-body"><small>${index}</small><span class="archive-stat-label">${label}</span><strong>${value}</strong></div></div>`
  const coverHtml = row => row.cover ? `<span class="archive-cover"><img src="${escape(row.cover)}" alt="" loading="lazy" decoding="async"></span>` : `<span class="archive-cover is-fallback" aria-hidden="true">${ICONS.note}</span>`
  const init = () => {
    const root = document.querySelector('.nova-music-page')
    if (!root || root === mounted || !window.NovaListeningStats || !window.NovaListeningDB) return
    cleanup(); mounted = root
    const off = [], on = (node,event,handler) => { node.addEventListener(event,handler); off.push(() => node.removeEventListener(event,handler)) }
    const existingEntry = root.querySelector('[data-listening-entry]')
    const entry = existingEntry || document.createElement('button')
    if (!existingEntry) { entry.className = 'musicx-archive-entry'; entry.textContent = 'Listening Archive ↗'; root.querySelector('.sea-player').append(entry) }
    entry.setAttribute('aria-expanded','false')
    const panel = document.createElement('section'); panel.className = 'listening-archive'; panel.hidden = true; panel.setAttribute('aria-label','Listening Archive')
    panel.innerHTML = `<header class="archive-heading">
      <p class="archive-marks">/ SOUND MEMORY<br>/ PERSONAL ARCHIVE<br>/ 2026</p>
      <h2 class="la-title">LISTENING<br>ARCHIVE</h2>
      <div class="la-intro">
        <div class="la-intro-copy"><p class="archive-tagline">SOME SONGS STAY FOREVER.</p><p class="archive-desc">A personal record of the music<br>that moves through my days.<br>Moments, tracks, and feelings — archived.</p></div>
        <svg class="archive-orbit" viewBox="0 0 210 96" aria-hidden="true"><ellipse cx="105" cy="48" rx="92" ry="25" stroke-dasharray="1 5"/><ellipse cx="105" cy="48" rx="64" ry="16" stroke-dasharray="1 4"/><circle cx="163" cy="62" r="2.2" fill="currentColor" stroke="none"/><circle cx="46" cy="34" r="1.1" fill="currentColor" stroke="none"/><path d="M12 10h7M15.5 6.5v7"/><path d="M192 86h6M195 83v6"/></svg>
        <button data-close class="archive-back">← BACK TO MUSIC</button>
      </div>
      <button data-close class="archive-close" aria-label="关闭听歌档案，返回音乐页面">×</button>
    </header><div class="archive-content" data-content></div>
    <footer class="archive-footer"><p class="archive-status" role="status"></p><div class="archive-data-actions"><button data-export>↧　EXPORT HISTORY</button><button data-import>↥　IMPORT HISTORY</button><button data-reset>⌫　RESET</button></div></footer>
    <dialog class="archive-dialog"><form method="dialog"><h3 data-dialog-title></h3><p data-dialog-copy></p><div data-dialog-actions></div></form></dialog><input data-import-file type="file" accept="application/json,.json" hidden>`
    root.append(panel)
    const content = panel.querySelector('[data-content]'), status = panel.querySelector('.archive-status'), dialog = panel.querySelector('dialog')
    let rows = [], mode = 'month', selected = new Date(), limit = HISTORY_PAGE_SIZE, alive = true, generation = 0, importRows, pendingAction, busy = false, refreshTimer
    const openRows = new Set()
    const statusText = text => { status.textContent = text }
    const rowHtml = row => {
      const open = openRows.has(row.id)
      const detail = open ? `<p class="archive-row-detail">STARTED ${clock(row.startedAt)} · ENDED ${clock(row.endedAt)} · LISTENED ${trackTime(row.listenedSeconds)} OF ${trackTime(row.duration)} · ${row.completed ? 'COMPLETED' : 'STOPPED'}</p>` : ''
      return `<div class="archive-row${open ? ' is-open' : ''}"><button data-track="${escape(row.trackId)}" class="archive-row-play" aria-label="播放 ${escape(row.title)}">${ICONS.play}</button><time>${clock(row.startedAt)}</time><button data-track="${escape(row.trackId)}" class="archive-row-title">${escape(row.title)}</button><span class="archive-row-artist">${escape(row.artist)}</span><time>${trackTime(row.listenedSeconds)}</time><button class="archive-row-more" data-more="${escape(row.id)}" aria-expanded="${open}" aria-label="记录详情">···</button>${detail}</div>`
    }
    const render = () => {
      const combined = new Map(rows.map(row => [row.id,row]))
      for (const row of window.novaListeningTracker?.snapshot?.() || []) combined.set(row.id,row)
      const liveRows = [...combined.values()], output = document.createElement('div')
      const s = window.NovaListeningStats.calculate(liveRows,mode,selected), total = s.total
      const shown = s.rows.slice(0,limit)
      const max = Math.max(1,...s.activity.map(item => item.seconds)), daily = s.activity
      const scopeWord = mode === 'year' ? 'YEAR' : mode === 'week' ? 'WEEK' : mode === 'day' ? 'DAY' : 'MONTH'
      const label = mode === 'year' ? String(selected.getFullYear()) : mode === 'month' ? date(selected,{ month:'long',year:'numeric' }) : mode === 'week' ? `${date(s.start,{ month:'short',day:'2-digit' })} – ${date(+s.end-1,{ month:'short',day:'2-digit',year:'numeric' })}` : date(selected,{month:'long',day:'2-digit',year:'numeric'})
      const tableBody = shown.length ? shown.map(rowHtml).join('') : liveRows.length ? '<p class="archive-empty">NO RECORDS IN THIS PERIOD.</p>' : '<div class="archive-empty-state"><p>NO RECORDS YET.</p><p>EVERY SONG<br>BEGINS SOMEWHERE.</p></div>'
      const ranked = s.top.map((row,index) => {
        const share = total > 0 ? Math.round(row.seconds/total*100) : 0
        const depth = row.duration > 0 && row.sessions > 0 ? Math.min(100,Math.round(row.listenedSeconds/(row.duration*row.sessions)*100)) : 100
        return `<div class="archive-ranked"><small class="archive-rank">${String(index+1).padStart(2,'0')}</small><div class="archive-ranked-main"><div class="archive-ranked-track">${coverHtml(row)}<div class="archive-ranked-info"><button data-track="${escape(row.trackId)}">${escape(row.title)}</button><span>${escape(row.artist)}</span></div><small class="archive-ranked-time">${duration(row.seconds)}</small></div><i class="archive-rank-bar" role="img" aria-label="播放完成度 ${depth}%"><b style="width:${depth}%"></b></i><small class="archive-rank-caption">${row.sessions} ${row.sessions === 1 ? 'PLAY' : 'PLAYS'} · ${share}% OF LISTENING TIME</small></div></div>`
      }).join('')
      const activity = daily.map(item => `<div class="archive-activity-row${item.seconds > 0 ? ' is-active' : ''}"><small>${date(item.date,mode === 'year' ? {month:'short'} : {month:'short',day:'2-digit'})}</small><i><b style="width:${item.seconds > 0 ? item.seconds/max*100 : 0}%"></b></i><small class="is-right">${duration(item.seconds)}</small></div>`).join('')
      output.innerHTML = `<section class="archive-stats" aria-label="统计概览">${statCell('01','TOTAL PLAYS',s.sessions,ICONS.plays)}${statCell('02','LISTENING TIME',duration(s.total),ICONS.time)}${statCell('03','UNIQUE TRACKS',s.tracks,ICONS.tracks)}${statCell('04','LAST PLAY',s.last ? date(s.last.startedAt,{month:'short',day:'2-digit'}) : '—',ICONS.last)}</section>
      <div class="archive-controls"><nav class="archive-period" aria-label="统计周期">${['day','week','month','year'].map(value => `<button data-mode="${value}" aria-pressed="${value === mode}">${value.toUpperCase()}</button>`).join('')}</nav><div class="archive-date"><button data-step="-1" aria-label="上一周期">‹</button><span>${label}</span><button data-step="1" aria-label="下一周期">›</button><i class="archive-date-rule" aria-hidden="true"></i><button data-today>Today</button></div></div>
      <section class="archive-history-section"><div class="archive-section-heading"><h3>HISTORY</h3>${s.rows.length > shown.length ? '<button data-more-header>SHOW EARLIER →</button>' : ''}<span class="archive-history-count" aria-live="polite">SHOWING ${shown.length} / ${s.rows.length} TRACKS</span></div><div class="archive-table"><div class="archive-table-head" aria-hidden="true"><i></i><span>TIME</span><span>TRACK</span><span>ARTIST</span><span>DURATION</span><i></i></div><div class="archive-table-body">${tableBody}</div></div></section>
      <div class="archive-columns"><section class="archive-panel"><header class="archive-panel-head"><h3>MOST LISTENED</h3><span>TOP TRACK THIS ${scopeWord} →</span></header><div class="archive-panel-body">${ranked || '<p class="archive-empty">NOTHING REPEATED YET.</p>'}</div></section><section class="archive-panel"><header class="archive-panel-head"><h3>${scopeWord} ACTIVITY</h3><span>${mode === 'year' ? 'MONTHLY' : 'DAILY'} LISTENING TIME</span></header><div class="archive-panel-body archive-activity-list">${activity}</div></section></div>`
      syncDOM(content, output)
    }
    const refresh = async () => { const version = ++generation; try { const data = await window.NovaListeningDB.all(); if (!alive || version !== generation) return; rows = data; window.novaListeningTracker?.acknowledge?.(data); render() } catch (error) { if (alive) statusText('本地档案不可用：' + error.message) } }
    const resetView = () => { limit = HISTORY_PAGE_SIZE; openRows.clear() }
    const show = value => {
      panel.hidden = !value
      root.classList.toggle('is-archive',value)
      entry.setAttribute('aria-expanded',String(value))
      if (value) {
        resetView()
        render()
        panel.querySelector('.archive-close').focus()
        try {
          window.novaListeningTracker?.tick()
          Promise.resolve(window.novaListeningTracker?.persist()).catch(error => statusText('本地档案写入失败：' + error.message))
        } catch (error) { statusText('本地档案写入失败：' + error.message) }
        refresh()
        history.replaceState(null,'', '#listening-archive')
      } else {
        history.replaceState(null,'',location.pathname+location.search)
        entry.focus()
      }
    }
    const ask = (title,copy,actions,action) => { pendingAction = action; panel.querySelector('[data-dialog-title]').textContent = title; panel.querySelector('[data-dialog-copy]').textContent = copy; panel.querySelector('[data-dialog-actions]').innerHTML = actions.map(([value,label]) => `<button value="${value}">${label}</button>`).join('') + '<button value="cancel">Cancel</button>'; dialog.returnValue = 'cancel'; dialog.showModal() }
    on(entry,'click',() => show(panel.hidden))
    panel.querySelectorAll('[data-close]').forEach(button => on(button,'click',() => show(false)))
    on(content,'click',async event => {
      const button = event.target.closest('button'); if (!button || busy) return
      if (button.dataset.more) { const id = button.dataset.more; if (openRows.has(id)) openRows.delete(id); else openRows.add(id); render(); return }
      if (button.dataset.track) { const api = window.__fliexMusic; const index = api?.snapshot().tracks.findIndex(track => track.id === button.dataset.track); if (index >= 0) api.select(index); else statusText('这首歌曲已不在当前播放列表中。'); return }
      if (button.dataset.mode) { mode = button.dataset.mode; resetView(); render() }
      if (button.dataset.step) { const step = Number(button.dataset.step), start = window.NovaListeningStats.range(mode,selected).start; if (mode === 'year') start.setFullYear(start.getFullYear()+step); else if (mode === 'month') start.setMonth(start.getMonth()+step); else start.setDate(start.getDate()+step*(mode === 'week' ? 7 : 1)); selected = start; resetView(); render() }
      if (button.hasAttribute('data-today')) { selected = new Date(); resetView(); render() }
      if (button.hasAttribute('data-more-header')) { limit += HISTORY_PAGE_SIZE; render() }
      if (button.hasAttribute('data-import')) panel.querySelector('[data-import-file]').click()
      if (button.hasAttribute('data-reset')) ask('Reset listening history?', '此操作会删除本机全部听歌记录。请先导出备份。', [['next','Continue']], 'reset-first')
      if (button.hasAttribute('data-export')) {
        try { window.novaListeningTracker?.tick(); await window.novaListeningTracker?.persist(); const data = await window.NovaListeningDB.all(); const url = URL.createObjectURL(new Blob([JSON.stringify({format:'novafliex-listening',version:1,sessions:data},null,2)],{type:'application/json'})); const link = document.createElement('a'); link.href = url; link.download = `novafliex-listening-${window.NovaListeningStats.dayKey(Date.now())}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000); statusText('档案已导出。') } catch (error) { statusText(error.message) }
      }
    })
    on(panel.querySelector('[data-import-file]'),'change',async event => {
      const file = event.target.files[0]; event.target.value = ''; if (!file) return
      try { if (file.size > 50*1024*1024) throw new Error('文件超过 50 MB'); importRows = window.NovaListeningDB.validate(JSON.parse(await file.text())); ask('Import listening history', `${importRows.length} 条记录。Merge 按 id 合并；Replace 会替换现有档案。`, [['merge','Merge'],['replace','Replace']], 'import') } catch (error) { statusText('导入失败：' + error.message) }
    })
    on(dialog,'close',async () => {
      const action = pendingAction, value = dialog.returnValue; if (value === 'cancel' || !value) return
      if (action === 'reset-first' && value === 'next') { ask('Permanently reset history?', '再次确认：删除全部记录，无法撤销。', [['reset','Delete all history']], 'reset'); return }
      busy = true; let restart
      try {
        if (action === 'reset' && value === 'reset') { restart = await window.novaListeningTracker?.clearPending(); await window.NovaListeningDB.reset(); statusText('档案已清空。') }
        if (action === 'import' && ['merge','replace'].includes(value)) { if (value === 'replace') restart = await window.novaListeningTracker?.clearPending(); else { window.novaListeningTracker?.tick(); await window.novaListeningTracker?.persist() } await window.NovaListeningDB.import(importRows,value === 'replace'); statusText('档案已导入。') }
        resetView()
        await refresh()
      } catch (error) { statusText('操作失败：' + error.message) } finally { restart?.(); busy = false }
    })
    on(document,'listening:changed',() => { if (!panel.hidden) { clearTimeout(refreshTimer); refreshTimer = setTimeout(refresh,100) } })
    on(document,'listening:saved',event => { const row = event.detail; generation++; rows = rows.filter(item => item.id !== row.id); rows.push(row); if (alive && !panel.hidden && !busy) render() })
    on(document,'listening:tick',() => { if (alive && !panel.hidden && !document.hidden && !busy) render() })
    on(document,'listening:error',event => statusText('本地档案写入失败：' + event.detail))
    on(document,'pjax:send',() => cleanup())
    cleanup = () => { alive = false; generation++; clearTimeout(refreshTimer); off.forEach(fn => fn()); panel.remove(); if (!existingEntry) entry.remove(); else entry.setAttribute('aria-expanded','false'); root.classList.remove('is-archive'); mounted = null }
    if (location.hash === '#listening-archive') show(true)
  }
  window.NovaListeningUI = { init }
  document.addEventListener('pjax:complete',init)
  document.addEventListener('pjax:error',init)
  window.addEventListener('pageshow',init)
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init()
})()
