(() => {
  'use strict'
  if (window.NovaListeningUI) { window.NovaListeningUI.init(); return }
  let mounted, cleanup = () => {}
  const escape = text => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
  const date = (value, options) => new Date(value).toLocaleDateString('en-US', options)
  const clock = value => new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const duration = value => { const seconds = Math.floor(value), minutes = Math.floor(seconds/60), tail = String(seconds%60).padStart(2,'0'); return minutes >= 60 ? `${Math.floor(minutes/60)}h ${String(minutes%60).padStart(2,'0')}m ${tail}s` : minutes ? `${minutes}m ${tail}s` : `${seconds}s` }
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
  const init = () => {
    const root = document.querySelector('.nova-music-page')
    if (!root || root === mounted || !window.NovaListeningStats || !window.NovaListeningDB) return
    cleanup(); mounted = root
    const off = [], on = (node,event,handler) => { node.addEventListener(event,handler); off.push(() => node.removeEventListener(event,handler)) }
    const existingEntry = root.querySelector('[data-listening-entry]')
    const entry = existingEntry || document.createElement('button')
    if (!existingEntry) { entry.className = 'listening-entry'; entry.textContent = '听歌档案 · Listening Archive ↗'; root.querySelector('.sea-player').append(entry) }
    entry.setAttribute('aria-expanded','false')
    const panel = document.createElement('section'); panel.className = 'listening-archive'; panel.hidden = true; panel.setAttribute('aria-label','Listening Archive')
    panel.innerHTML = `<header class="archive-heading"><div><h2>LISTENING ARCHIVE</h2><p>在音乐里，时间变得很轻。</p></div><span>Stored locally on this device.</span><button data-close aria-label="返回音乐页面">×</button></header><div data-content></div><p class="archive-status" role="status"></p><dialog class="archive-dialog"><form method="dialog"><h3 data-dialog-title></h3><p data-dialog-copy></p><div data-dialog-actions></div></form></dialog><input data-import-file type="file" accept="application/json,.json" hidden>`
    root.append(panel)
    const content = panel.querySelector('[data-content]'), status = panel.querySelector('.archive-status'), dialog = panel.querySelector('dialog')
    let rows = [], mode = 'month', selected = new Date(), limit = 20, alive = true, generation = 0, importRows, pendingAction, busy = false, refreshTimer
    const statusText = text => { status.textContent = text }
    const listen = row => row ? `<button class="archive-listen" data-track="${escape(row.trackId)}">${row.cover ? `<img src="${escape(row.cover)}" alt="" loading="lazy">` : '<span class="archive-cover"></span>'}<span><strong>${clock(row.startedAt)}</strong><span>${escape(row.title)}</span><small>${escape(row.artist)}</small></span></button>` : '<p class="archive-empty">尚无聆听记录</p>'
    const render = () => {
      const combined = new Map(rows.map(row => [row.id,row]))
      for (const row of window.novaListeningTracker?.snapshot?.() || []) combined.set(row.id,row)
      const liveRows = [...combined.values()], output = document.createElement('div')
      const s = window.NovaListeningStats.calculate(liveRows,mode,selected), total = liveRows.reduce((sum,row) => sum+row.listenedSeconds,0), started = liveRows.length ? liveRows.reduce((min,row) => Math.min(min,row.startedAt),Infinity) : null
      const shown = mode === 'day' ? s.rows : s.rows.slice(0,limit), groups = new Map()
      shown.forEach(row => { const key = window.NovaListeningStats.dayKey(row.startedAt); if (!groups.has(key)) groups.set(key,[]); groups.get(key).push(row) })
      const max = Math.max(1,...s.activity.map(item => item.seconds)), daily = s.activity
      const label = mode === 'year' ? String(selected.getFullYear()) : mode === 'month' ? date(selected,{ month:'long',year:'numeric' }) : mode === 'week' ? `${date(s.start,{ month:'short',day:'2-digit' })} – ${date(+s.end-1,{ month:'short',day:'2-digit',year:'numeric' })}` : date(selected,{month:'short',day:'2-digit',year:'numeric'})
      output.innerHTML = `<section class="archive-overview"><div class="archive-total"><strong>${duration(total)}</strong><h3>TOTAL LISTENING</h3><p>Started tracking · ${started === null ? 'Waiting for your first listen' : date(started,{month:'short',day:'2-digit',year:'numeric'})}</p></div><div><nav class="archive-period" aria-label="统计周期">${['day','week','month','year'].map(value => `<button data-mode="${value}" aria-pressed="${value === mode}">${value.toUpperCase()}</button>`).join('')}</nav><div class="archive-date"><button data-step="-1" aria-label="上一周期">‹</button><span>${label}</span><button data-step="1" aria-label="下一周期">›</button><button data-today>Today</button></div><div class="archive-metrics">${[[duration(s.total),'LISTENING TIME'],[s.days,'LISTENING DAYS'],[s.sessions,'SESSIONS'],[s.tracks,'TRACKS']].map(([value,title]) => `<div><strong>${value}</strong><small>${title}</small></div>`).join('')}</div></div></section>
      <section class="archive-activity"><h3>LISTENING ACTIVITY</h3><div class="archive-chart" style="--buckets:${daily.length}">${daily.map(item => `<div title="${date(item.date,{month:'short',day:'2-digit'})} · ${duration(item.seconds)}"><span style="height:${item.seconds/max*100}%"></span><small>${mode === 'year' ? date(item.date,{month:'short'}) : String(new Date(item.date).getDate()).padStart(2,'0')}</small></div>`).join('')}</div><p>${duration(max === 1 ? 0 : max)} peak · ${mode === 'year' ? 'Monthly' : 'Daily'} listening</p></section>
      <div class="archive-moments"><section><h3>FIRST LISTEN</h3>${listen(s.first)}${s.first ? `<p>${date(s.first.startedAt,{month:'short',day:'2-digit'})}</p>` : ''}</section><section><h3>LAST LISTEN</h3>${listen(s.last)}${s.last ? `<p>${date(s.last.startedAt,{month:'short',day:'2-digit'})}</p>` : ''}</section><section class="archive-longest"><h3>LONGEST LISTENING DAY</h3><strong>${s.longest ? date(new Date(s.longest[0]+'T12:00:00'),{month:'short',day:'2-digit'}) : '—'}</strong><strong>${s.longest ? duration(s.longest[1]) : '0s'}</strong><span class="archive-moon" aria-hidden="true"></span></section></div>
      <div class="archive-detail"><section><h3>MOST LISTENED</h3>${s.top.length ? s.top.map((row,index) => `<div class="archive-ranked"><small>${String(index+1).padStart(2,'0')}</small><button data-track="${escape(row.trackId)}">${row.cover ? `<img src="${escape(row.cover)}" alt="" loading="lazy">` : ''}<span>${escape(row.title)}</span></button><small>${escape(row.artist)}</small><i><b style="width:${row.seconds/s.top[0].seconds*100}%"></b></i><small>${duration(row.seconds)}</small></div>`).join('') : '<p class="archive-empty">音乐会留下时间的痕迹。</p>'}</section><section><h3>${mode.toUpperCase()} ACTIVITY</h3><div class="archive-activity-list">${daily.map(item => `<div><small>${date(item.date,mode === 'year' ? {month:'short'} : {month:'short',day:'2-digit'})}</small><i><b style="width:${item.seconds/max*100}%"></b></i><small>${duration(item.seconds)}</small></div>`).join('')}</div></section></div>
      <div class="archive-bottom"><section><div class="archive-section-heading"><h3>HISTORY</h3>${mode !== 'day' && shown.length < s.rows.length ? '<button data-more>View more →</button>' : ''}</div><div class="archive-history">${[...groups].map(([,items]) => `<div><h4>${date(items[0].startedAt,{month:'short',day:'2-digit',year:'numeric'})}</h4>${items.map(row => `<div class="archive-history-row"><time>${clock(row.startedAt)}</time><button data-track="${escape(row.trackId)}">${escape(row.title)}</button><span>${escape(row.artist)}</span><time>${trackTime(row.listenedSeconds)}</time></div>`).join('')}</div>`).join('') || '<p class="archive-empty">这个时间段还没有记录。</p>'}</div></section><section class="archive-data"><h3>DATA</h3><button data-export>↧　Export listening history</button><button data-import>↥　Import listening history</button><button data-reset>⌫　Reset history</button><p>All data is stored locally on this device.</p></section></div>`
      syncDOM(content, output)
    }
    const refresh = async () => { const version = ++generation; try { const data = await window.NovaListeningDB.all(); if (!alive || version !== generation) return; rows = data; window.novaListeningTracker?.acknowledge?.(data); render() } catch (error) { if (alive) statusText('本地档案不可用：' + error.message) } }
    const show = value => {
      panel.hidden = !value
      root.classList.toggle('is-archive',value)
      entry.setAttribute('aria-expanded',String(value))
      if (value) {
        panel.querySelector('[data-close]').focus()
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
    on(entry,'click',() => show(panel.hidden)); on(panel.querySelector('[data-close]'),'click',() => show(false))
    on(content,'click',async event => {
      const button = event.target.closest('button'); if (!button || busy) return
      if (button.dataset.track) { const api = window.__fliexMusic; const index = api?.snapshot().tracks.findIndex(track => track.id === button.dataset.track); if (index >= 0) api.select(index); else statusText('这首歌曲已不在当前播放列表中。'); return }
      if (button.dataset.mode) { mode = button.dataset.mode; limit = 20; render() }
      if (button.dataset.step) { const step = Number(button.dataset.step), start = window.NovaListeningStats.range(mode,selected).start; if (mode === 'year') start.setFullYear(start.getFullYear()+step); else if (mode === 'month') start.setMonth(start.getMonth()+step); else start.setDate(start.getDate()+step*(mode === 'week' ? 7 : 1)); selected = start; limit = 20; render() }
      if (button.hasAttribute('data-today')) { selected = new Date(); limit = 20; render() }
      if (button.hasAttribute('data-more')) { limit += 20; render() }
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
