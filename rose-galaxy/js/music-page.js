(() => {
  'use strict'
  if (window.__novaMusicBootstrap) { window.__novaMusicBootstrap.init(); return }
  let cleanup = () => {}, mounted = null
  const time = seconds => Number.isFinite(seconds) ? Math.floor(seconds / 60) + ':' + String(Math.floor(seconds % 60)).padStart(2, '0') : '0:00'
  const loadingMarkup = '<span class="music-loading" role="status" aria-label="音乐加载中"><span class="music-loading-wave" aria-hidden="true">∿∿∿</span></span>'
  const read = key => { try { return JSON.parse(localStorage.getItem(key)) || [] } catch (_) { return [] } }
  const init = () => {
    const root = document.querySelector('.nova-music-page')
    if (!root || mounted === root || !window.__fliexMusic) return
    cleanup(); mounted = root
    const api = window.__fliexMusic, off = [], favorites = new Set(read('fliex-music-favorites-v1'))
    const $ = selector => root.querySelector(selector)
    const on = (node, event, handler) => { node.addEventListener(event, handler); off.push(() => node.removeEventListener(event, handler)) }
    let tab = 'all', rendered = '', lyricSong = '', displayedTitle = '', displayedArtist = '', lines = [], active = -1, frame = 0, destroyed = false, scrubbing = false
    let followPausedUntil = 0
    const rows = $('.sea-playlist-rows'), lyrics = $('.sea-lyrics-lines'), lyricBox = $('.sea-lyrics'), wave = $('.sea-waveform'), ctx = wave.getContext('2d')
    const titleNode = $('.nova-music-current-title'), titleInner = titleNode.firstElementChild, artistNode = $('.nova-music-current-artist'), artistInner = artistNode.firstElementChild
    const escape = text => String(text || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
    const pad2 = value => String(value).padStart(2, '0')
    // The clip window is the outer span; only the inner span translates, so the text actually slides out of hiding.
    // Idempotent on purpose: the ResizeObserver re-runs this on every heading resize, and re-toggling the class
    // would restart the marquee animation from the beginning each time.
    const applyMarquee = (node, inner) => {
      if (!inner.textContent) {
        if (inner.classList.contains('is-marquee')) { inner.classList.remove('is-marquee'); inner.style.removeProperty('--music-title-shift') }
        return
      }
      inner.classList.add('is-marquee')
      const overflow = Math.ceil(inner.scrollWidth - node.clientWidth)
      if (overflow > 2) {
        const shift = `-${overflow}px`
        if (inner.style.getPropertyValue('--music-title-shift') !== shift) inner.style.setProperty('--music-title-shift', shift)
      } else {
        inner.classList.remove('is-marquee')
        inner.style.removeProperty('--music-title-shift')
      }
    }
    const syncHeading = (node, inner, text, cached) => {
      if (text === cached) return cached
      inner.textContent = text
      applyMarquee(node, inner)
      return text
    }
    const renderRows = state => {
      const songs = state.tracks
      const signature = JSON.stringify([songs.map(s => s.id), state.ready, state.failed, state.configured, state.index, tab, [...favorites]])
      if (signature === rendered) return
      rendered = signature
      if (!state.ready) { rows.innerHTML = state.failed || state.configured ? '' : loadingMarkup; return }
      const items = songs.map((song, index) => ({ song, index })).filter(({song}) => tab !== 'favorites' || favorites.has(song.id))
      rows.innerHTML = items.length ? items.map(({ song, index }) => `<div class="sea-track ${index === state.index ? 'is-current' : ''}"><button data-song-index="${index}" aria-label="播放 ${escape(song.name)}" aria-current="${index === state.index}"><span class="sea-track-number">${pad2(index + 1)}</span><span class="sea-track-main"><span class="sea-track-name">${escape(song.name)}</span><span class="sea-track-artist">${escape(song.artist)}</span></span><span class="sea-track-wave" aria-hidden="true"><i></i><i></i><i></i><i></i></span></button><button class="sea-track-more" data-favorite-id="${escape(song.id)}" aria-label="${favorites.has(song.id) ? '取消收藏' : '收藏'} ${escape(song.name)}">${favorites.has(song.id) ? '♥' : '···'}</button></div>`).join('') : '<p class="sea-playlist-empty">' + (tab === 'favorites' ? '还没有收藏的歌曲' : '暂无可播放歌曲') + '</p>'
    }
    const syncTerminal = state => {
      const index = state.ready ? pad2(state.index + 1) : '--'
      const total = state.ready ? String(state.tracks.length) : '--'
      const trackNode = $('[data-musicx-track]'), totalNode = $('[data-musicx-total]')
      if (trackNode.textContent !== index) trackNode.textContent = index
      if (totalNode.textContent !== total) totalNode.textContent = total
      const nowNode = $('[data-musicx-index]')
      if (nowNode.textContent !== index) nowNode.textContent = index
      const listIndex = $('[data-musicx-list-index]'), listTotal = $('[data-musicx-list-total]')
      if (listIndex.textContent !== index) listIndex.textContent = index
      if (listTotal.textContent !== total) listTotal.textContent = total
      const signal = state.failed ? 'error' : !state.configured ? 'booting' : state.playing ? 'connected' : 'standby'
      const signalNode = $('[data-musicx-signal]')
      if (signalNode.textContent !== signal) signalNode.textContent = signal
    }
    const loadLyrics = async song => {
      if (!song) { lyricSong = ''; lines = []; lyrics.innerHTML = ''; return }
      const key = song?.id || ''
      if (key === lyricSong) return
      lyricSong = key; lines = []; active = -1; followPausedUntil = 0
      if (song.instrumental) { lyrics.innerHTML = '<p class="sea-lyrics-empty">纯音乐 · 请欣赏</p>'; return }
      lyrics.innerHTML = loadingMarkup
      try {
        let text = song?.lyrics || ''
        if (typeof text === 'string' && /^\/(?!\/)|^https:\/\//.test(text)) {
          const response = await fetch(text); if (!response.ok) throw new Error('歌词 HTTP ' + response.status)
          text = text.endsWith('.json') ? await response.json() : await response.text()
        }
        if (destroyed || lyricSong !== key) return
        lines = api.parseLyrics(text, song.lyricCues)
        const untimed = typeof text === 'string' ? text.split(/\r?\n/).map(line => line.trim()).filter(Boolean) : []
        lyrics.innerHTML = lines.length ? lines.map(line => '<p class="lyric-line">' + escape(line.text) + '</p>').join('') : untimed.map(line => '<p class="lyric-line">' + escape(line) + '</p>').join('')
        render()
      } catch (error) { if (destroyed || lyricSong !== key) return; console.error('[Fliex Music] 歌词加载失败', error); lyrics.innerHTML = '<p class="sea-lyrics-empty">歌词暂时不可用</p><button type="button" data-lyrics-retry>重试</button>' }
    }
    const render = () => {
      const state = api.snapshot(), song = state.song
      root.classList.toggle('is-playing', state.playing)
      root.classList.toggle('is-loading', !state.ready && !state.failed && !state.configured)
      const pending = $('[data-player-loading]'); if (pending) pending.hidden = state.ready || state.failed || state.configured
      displayedArtist = syncHeading(artistNode, artistInner, song?.artist || '', displayedArtist)
      displayedTitle = syncHeading(titleNode, titleInner, song?.name || '', displayedTitle)
      // The first sync measures while flex siblings are still settling; one pass after layout gives the real overflow.
      requestAnimationFrame(() => { if (!destroyed) { applyMarquee(titleNode, titleInner); applyMarquee(artistNode, artistInner) } })
      if (song) { const cover = song.cover || '/img/musicback.webp'; const coverNode = $('.nova-music-current-cover'); if (coverNode.getAttribute('src') !== cover) coverNode.src = cover }
      $('.nova-music-toggle').setAttribute('aria-label', state.playing ? '暂停' : '播放')
      const duration = state.duration || song?.duration || 0, progress = duration ? state.currentTime / duration * 1000 : 0
      const input = $('.nova-music-progress-input')
      if (!scrubbing) { input.value = progress; input.style.setProperty('--music-progress', progress / 10 + '%'); $('.nova-music-current-time').textContent = duration > 0 ? time(state.currentTime) : '' }
      $('.nova-music-duration').textContent = duration > 0 ? time(duration) : ''
      $('.nova-music-count').textContent = state.ready ? '本地音乐 · ' + state.tracks.length + ' 首 · ' + ({ list: '列表循环', shuffle: '随机播放', single: '单曲循环' }[state.mode] || '列表循环') : ''
      $('.nova-music-retry').hidden = !state.failed
      $('.nova-music-count').textContent = state.failed ? '音乐暂时不可用' : $('.nova-music-count').textContent
      root.querySelectorAll('.nova-music-toggle,.nova-music-previous,.nova-music-next,.nova-music-progress-input').forEach(node => { node.disabled = !state.ready && !node.matches('.nova-music-toggle') })
      $('[data-music-shuffle]').setAttribute('aria-pressed', state.mode === 'shuffle')
      $('[data-music-shuffle]').title = state.mode === 'shuffle' ? '随机播放已开启 · 点击恢复列表循环' : '开启随机播放 · 下一曲随机选择'
      $('[data-music-repeat]').setAttribute('aria-label', state.mode === 'single' ? '单曲循环' : '列表循环')
      $('[data-music-repeat]').classList.toggle('is-single', state.mode === 'single')
      $('[data-music-volume]').value = state.volume
      $('[data-music-favorite]').setAttribute('aria-pressed', favorites.has(song?.id)); $('[data-music-favorite]').textContent = favorites.has(song?.id) ? '♥' : '♡'
      renderRows(state); syncTerminal(state); loadLyrics(song)
      let next = -1; lines.forEach((line, index) => { if (line.time <= state.currentTime) next = index })
      if (next !== active) {
        active = next
        const visibleIndices = lines.map((line, index) => line.text ? index : -1).filter(index => index >= 0)
        const before = visibleIndices.filter(index => index < active).at(-1)
        const after = visibleIndices.find(index => index > active)
        const hasActive = Boolean(lines[active]?.text)
        ;[...lyrics.children].forEach((p, index) => {
          const current = hasActive && index === active
          const near = hasActive && (index === before || index === after)
          p.classList.toggle('is-active', current)
          p.classList.toggle('is-near', near)
          p.classList.toggle('is-distant', hasActive && !current && !near)
        })
        const p = hasActive ? lyrics.children[active] : null
        // A reader browsing manually keeps control until the pause window expires.
        if (p && Date.now() >= followPausedUntil) {
          const container = $('.sea-lyrics')
          container.scrollTo({top:container.scrollTop + p.getBoundingClientRect().top - container.getBoundingClientRect().top - container.clientHeight / 2 + p.clientHeight / 2,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'})
        }
      }
    }
    const toggleFavorite = id => { if (!id) return; favorites.has(id) ? favorites.delete(id) : favorites.add(id); try { localStorage.setItem('fliex-music-favorites-v1', JSON.stringify([...favorites])) } catch (_) {} render() }
    on($('.nova-music-toggle'), 'click', () => api.toggle())
    on($('.nova-music-next'), 'click', () => api.next()); on($('.nova-music-previous'), 'click', () => api.previous())
    const progressInput = $('.nova-music-progress-input')
    const finishScrub = () => { if (!scrubbing) return; scrubbing = false; render() }
    on(progressInput, 'pointerdown', () => { scrubbing = true })
    on(progressInput, 'input', event => {
      const ratio = Number(event.target.value) / 1000
      const target = ratio * api.snapshot().duration
      event.target.style.setProperty('--music-progress', ratio * 100 + '%')
      $('.nova-music-current-time').textContent = time(target)
      api.seek(target)
    })
    on(progressInput, 'pointerup', finishScrub); on(progressInput, 'pointercancel', finishScrub); on(progressInput, 'change', finishScrub); on(progressInput, 'blur', finishScrub)
    on($('[data-music-volume]'), 'input', event => api.setVolume(event.target.value))
    on($('[data-music-shuffle]'), 'click', () => api.setMode(api.snapshot().mode === 'shuffle' ? 'list' : 'shuffle'))
    on($('[data-music-repeat]'), 'click', () => api.setMode(api.snapshot().mode === 'single' ? 'list' : 'single'))
    on($('[data-music-favorite]'), 'click', () => toggleFavorite(api.snapshot().song?.id))
    on($('[data-music-more]'), 'click', event => { const detail = $('.sea-song-detail'); detail.hidden = !detail.hidden; event.currentTarget.setAttribute('aria-expanded', !detail.hidden); const s=api.snapshot().song; detail.textContent = s ? [s.name,s.artist,s.album,'本地音源'].filter(Boolean).join(' · ') : '暂无歌曲信息' })
    on(rows, 'click', event => { const button = event.target.closest('[data-song-index],[data-favorite-id]'); if (!button) return; if (button.dataset.favoriteId) toggleFavorite(button.dataset.favoriteId); else api.select(Number(button.dataset.songIndex)) })
    const tabs = [...root.querySelectorAll('[data-music-tab]')]
    const activateTab = button => {
      tab = button.dataset.musicTab
      tabs.forEach(b => { b.setAttribute('aria-selected', String(b === button)); b.tabIndex = b === button ? 0 : -1 })
      rows.setAttribute('aria-labelledby', button.id)
      render()
    }
    tabs.forEach((button, index) => {
      on(button, 'click', () => activateTab(button))
      on(button, 'keydown', event => {
        const target = { ArrowRight: (index + 1) % tabs.length, ArrowLeft: (index + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1 }[event.key]
        if (target === undefined) return
        event.preventDefault(); activateTab(tabs[target]); tabs[target].focus()
      })
    })
    on($('.nova-music-retry'), 'click', () => api.retry())
    on(lyrics, 'click', event => {
      if (event.target.closest('[data-lyrics-retry]')) { lyricSong = ''; loadLyrics(api.snapshot().song); return }
      const line = event.target.closest('.lyric-line')
      if (!line) return
      const index = [...lyrics.children].indexOf(line)
      if (index >= 0 && Number.isFinite(lines[index]?.time)) api.seek(lines[index].time)
    })
    const pauseFollow = () => { followPausedUntil = Date.now() + 3500 }
    on(lyricBox, 'wheel', pauseFollow, { passive: true })
    on(lyricBox, 'touchmove', pauseFollow, { passive: true })
    on(lyricBox, 'pointerdown', event => { if (event.pointerType === 'mouse' && event.button === 0) pauseFollow() })
    const playlistToggle = $('[data-playlist-toggle]'), mobileQuery = matchMedia('(max-width: 900px)')
    const syncPlaylist = () => {
      const mobile = mobileQuery.matches
      playlistToggle.hidden = !mobile
      playlistToggle.setAttribute('aria-expanded', String(!mobile || $('.sea-playlist').classList.contains('is-open')))
    }
    on(playlistToggle, 'click', () => { if (mobileQuery.matches) { $('.sea-playlist').classList.toggle('is-open'); syncPlaylist() } })
    if (mobileQuery.addEventListener) on(mobileQuery, 'change', syncPlaylist)
    syncPlaylist()
    on(document, 'fliex:music', render)
    // Font swaps and viewport changes move the overflow target; re-measure whenever a heading box resizes.
    let headingObserver = null
    if (typeof ResizeObserver === 'function') {
      headingObserver = new ResizeObserver(() => { if (!destroyed) { applyMarquee(titleNode, titleInner); applyMarquee(artistNode, artistInner) } })
      ;[titleNode, titleInner, artistNode, artistInner].forEach(el => headingObserver.observe(el))
    }
    const draw = () => {
      frame = 0; if (destroyed || document.hidden || !api.snapshot().playing) return
      ctx.clearRect(0,0,wave.width,wave.height)
      const analyser = api.analyser, bins = new Uint8Array(analyser?.frequencyBinCount || 64)
      if (analyser) analyser.getByteFrequencyData(bins)
      if (typeof ctx.beginPath !== 'function') { frame = requestAnimationFrame(draw); return }
      ctx.strokeStyle = 'rgba(210,210,210,.5)'; ctx.lineWidth = 1; ctx.beginPath()
      for (let i=0;i<160;i++) { const value = bins[Math.floor(i/160*bins.length)] || 0; const x = i / 159 * wave.width; const y = 36 + Math.sin(i * .45) * (1 + value / 255 * 15); if (i === 0) ctx.moveTo(x,y); else ctx.lineTo(x,y) }
      ctx.stroke()
      frame = requestAnimationFrame(draw)
    }
    const startWave = () => { if (frame) cancelAnimationFrame(frame); frame=0; if (api.snapshot().playing && !document.hidden) draw() }
    on(document,'fliex:music',()=>{if (!frame) startWave()}); on(document,'visibilitychange',startWave)
    if (typeof ctx.beginPath === 'function') { ctx.strokeStyle='rgba(129,129,129,.3)'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(0,36); ctx.lineTo(wave.width,36); ctx.stroke() }
    render(); api.load().then(render)
    cleanup = () => { destroyed=true; cancelAnimationFrame(frame); headingObserver?.disconnect(); off.forEach(remove=>remove()); mounted=null }
  }
  window.__novaMusicBootstrap={init,destroy:()=>cleanup()}
  document.addEventListener('pjax:send',()=>cleanup()); document.addEventListener('pjax:complete',init)
  document.addEventListener('fliex:music',init)
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init()
})()
