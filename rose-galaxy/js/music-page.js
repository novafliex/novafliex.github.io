(() => {
  'use strict'
  if (window.__novaMusicBootstrap) { window.__novaMusicBootstrap.init(); return }
  let cleanup = () => {}, mounted = null
  const time = seconds => Number.isFinite(seconds) ? Math.floor(seconds / 60) + ':' + String(Math.floor(seconds % 60)).padStart(2, '0') : '0:00'
  const read = key => { try { return JSON.parse(localStorage.getItem(key)) || [] } catch (_) { return [] } }
  const init = () => {
    const root = document.querySelector('.nova-music-page')
    if (!root || mounted === root || !window.__fliexMusic) return
    cleanup(); mounted = root
    const api = window.__fliexMusic, off = [], favorites = new Set(read('fliex-music-favorites-v1'))
    const $ = selector => root.querySelector(selector)
    const on = (node, event, handler) => { node.addEventListener(event, handler); off.push(() => node.removeEventListener(event, handler)) }
    let tab = 'all', rendered = '', lyricSong = '', lines = [], active = -1, frame = 0, destroyed = false
    const rows = $('.sea-playlist-rows'), lyrics = $('.sea-lyrics-lines'), wave = $('.sea-waveform'), ctx = wave.getContext('2d')
    const escape = text => String(text || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
    const renderRows = state => {
      const songs = state.tracks
      const signature = JSON.stringify([songs.map(s => s.id), state.index, tab, [...favorites]])
      if (signature === rendered) return
      rendered = signature
      if (tab === 'notes') { rows.innerHTML = '<p class="sea-playlist-empty">暂无音乐随笔</p>'; return }
      const items = songs.map((song, index) => ({ song, index })).filter(({song}) => tab !== 'favorites' || favorites.has(song.id))
      rows.innerHTML = items.length ? items.map(({ song, index }) => `<div class="sea-track ${index === state.index ? 'is-current' : ''}"><button data-song-index="${index}" aria-label="播放 ${escape(song.name)}" aria-current="${index === state.index}"><span class="sea-track-number">${String(index + 1).padStart(2, '0')}</span><img src="${escape(song.cover || '/img/background_sea.png')}" alt=""><span><span class="sea-track-name">${escape(song.name)}</span><span class="sea-track-artist">${escape(song.artist)}</span></span><span class="sea-track-time">${time(song.duration)}</span></button><button class="sea-track-more" data-favorite-id="${escape(song.id)}" aria-label="${favorites.has(song.id) ? '取消收藏' : '收藏'} ${escape(song.name)}">${favorites.has(song.id) ? '♥' : '···'}</button></div>`).join('') : '<p class="sea-playlist-empty">' + (tab === 'favorites' ? '还没有收藏的歌曲' : '暂无可播放歌曲') + '</p>'
    }
    const loadLyrics = async song => {
      if (!song) { lyrics.innerHTML = '<p class="sea-lyrics-empty">暂无歌曲</p>'; return }
      const key = song?.id || ''
      if (key === lyricSong) return
      lyricSong = key; lines = []; active = -1
      if (song.instrumental) { lyrics.innerHTML = '<p class="sea-lyrics-empty">纯音乐 · 请欣赏</p>'; return }
      lyrics.innerHTML = '<p class="sea-lyrics-empty">正在读取歌词</p>'
      try {
        let text = song?.lyrics || ''
        if (typeof text === 'string' && /^\/(?!\/)|^https:\/\//.test(text)) {
          const response = await fetch(text); if (!response.ok) throw new Error('歌词 HTTP ' + response.status)
          text = text.endsWith('.json') ? await response.json() : await response.text()
        }
        if (destroyed || lyricSong !== key) return
        lines = api.parseLyrics(text, song.lyricCues)
        const untimed = typeof text === 'string' ? text.split(/\r?\n/).map(line => line.trim()).filter(Boolean) : []
        lyrics.innerHTML = lines.length ? lines.map(line => '<p>' + escape(line.text) + '</p>').join('') : untimed.length ? '<p class="sea-lyrics-status">歌词原文 · 暂无时间轴</p>' + untimed.map(line => '<p>' + escape(line) + '</p>').join('') : '<p class="sea-lyrics-empty">暂无歌词<br><small>添加本地 LRC 后，歌词将在这里同步。</small></p>'
        render()
      } catch (error) { if (destroyed || lyricSong !== key) return; console.error('[Fliex Music] 歌词加载失败', error); lyrics.innerHTML = '<p class="sea-lyrics-empty">歌词加载失败</p>' }
    }
    const render = () => {
      const state = api.snapshot(), song = state.song
      root.classList.toggle('is-playing', state.playing)
      $('.nova-music-current-title').textContent = state.title
      $('.nova-music-current-artist').textContent = state.failed ? state.artist : [state.artist, song?.album].filter(Boolean).join('  |  ')
      if (song) { const cover = song.cover || '/img/background_sea.png'; if ($('.nova-music-current-cover').getAttribute('src') !== cover) $('.nova-music-current-cover').src = cover }
      $('.nova-music-toggle').textContent = state.playing ? 'Ⅱ' : '▶'
      $('.nova-music-toggle').setAttribute('aria-label', state.playing ? '暂停' : '播放')
      const duration = state.duration || song?.duration || 0, progress = duration ? state.currentTime / duration * 1000 : 0
      const input = $('.nova-music-progress-input'); input.value = progress; input.style.setProperty('--music-progress', progress / 10 + '%')
      $('.nova-music-current-time').textContent = time(state.currentTime); $('.nova-music-duration').textContent = time(duration)
      $('.nova-music-count').textContent = state.failed ? state.title : '本地音乐 · ' + state.tracks.length + ' 首'
      $('.nova-music-retry').hidden = !state.failed
      root.querySelectorAll('.nova-music-toggle,.nova-music-previous,.nova-music-next,.nova-music-progress-input').forEach(node => { node.disabled = !state.ready })
      $('[data-music-shuffle]').setAttribute('aria-pressed', state.mode === 'shuffle')
      $('[data-music-repeat]').setAttribute('aria-label', state.mode === 'single' ? '单曲循环' : '列表循环')
      $('[data-music-repeat]').textContent = state.mode === 'single' ? '↻₁' : '↻'
      $('[data-music-volume]').value = state.volume
      $('[data-music-favorite]').setAttribute('aria-pressed', favorites.has(song?.id)); $('[data-music-favorite]').textContent = favorites.has(song?.id) ? '♥' : '♡'
      renderRows(state); loadLyrics(song)
      let next = -1; lines.forEach((line, index) => { if (line.time <= state.currentTime) next = index })
      if (next !== active) { active = next; [...lyrics.children].forEach((p, index) => p.classList.toggle('is-active', index === active && Boolean(lines[active]?.text))); const p = lines[active]?.text ? lyrics.children[active] : null; if (p) { const container = $('.sea-lyrics'); container.scrollTo({top:container.scrollTop + p.getBoundingClientRect().top - container.getBoundingClientRect().top - container.clientHeight / 2 + p.clientHeight / 2,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'}) } }
    }
    const toggleFavorite = id => { if (!id) return; favorites.has(id) ? favorites.delete(id) : favorites.add(id); try { localStorage.setItem('fliex-music-favorites-v1', JSON.stringify([...favorites])) } catch (_) {} render() }
    on($('.nova-music-toggle'), 'click', () => api.toggle())
    on($('.nova-music-next'), 'click', () => api.next()); on($('.nova-music-previous'), 'click', () => api.previous())
    on($('.nova-music-progress-input'), 'input', event => api.seek(Number(event.target.value) / 1000 * api.snapshot().duration))
    on($('[data-music-volume]'), 'input', event => api.setVolume(event.target.value))
    on($('[data-music-shuffle]'), 'click', () => api.setMode(api.snapshot().mode === 'shuffle' ? 'list' : 'shuffle'))
    on($('[data-music-repeat]'), 'click', () => api.setMode(api.snapshot().mode === 'single' ? 'list' : 'single'))
    on($('[data-music-favorite]'), 'click', () => toggleFavorite(api.snapshot().song?.id))
    on($('[data-music-more]'), 'click', event => { const detail = $('.sea-song-detail'); detail.hidden = !detail.hidden; event.currentTarget.setAttribute('aria-expanded', !detail.hidden); const s=api.snapshot().song; detail.textContent = s ? [s.name,s.artist,s.album,'本地音源'].filter(Boolean).join(' · ') : '暂无歌曲信息' })
    on(rows, 'click', event => { const button = event.target.closest('[data-song-index],[data-favorite-id]'); if (!button) return; if (button.dataset.favoriteId) toggleFavorite(button.dataset.favoriteId); else api.select(Number(button.dataset.songIndex)) })
    root.querySelectorAll('[data-music-tab]').forEach(button => on(button,'click',() => { tab = button.dataset.musicTab; root.querySelectorAll('[data-music-tab]').forEach(b=>b.setAttribute('aria-selected',b===button)); render() }))
    on($('.nova-music-retry'), 'click', () => api.retry())
    on(document, 'fliex:music', render)
    const draw = () => {
      frame = 0; if (destroyed || document.hidden || !api.snapshot().playing) return
      ctx.clearRect(0,0,wave.width,wave.height)
      const analyser = api.analyser, bins = new Uint8Array(analyser?.frequencyBinCount || 64)
      if (analyser) analyser.getByteFrequencyData(bins)
      ctx.fillStyle = '#b4d2e8'
      for (let i=0;i<80;i++) { const value = bins[Math.floor(i/80*bins.length)] || 0; const h = 1 + value / 255 * 62; ctx.fillRect(i*6,36-h/2,2,h) }
      frame = requestAnimationFrame(draw)
    }
    const startWave = () => { if (frame) cancelAnimationFrame(frame); frame=0; if (api.snapshot().playing && !document.hidden) draw() }
    on(document,'fliex:music',()=>{if (!frame) startWave()}); on(document,'visibilitychange',startWave)
    ctx.fillStyle='#8199ab'; ctx.fillRect(0,36,wave.width,1)
    render(); api.load().then(render)
    cleanup = () => { destroyed=true; cancelAnimationFrame(frame); off.forEach(remove=>remove()); mounted=null }
  }
  window.__novaMusicBootstrap={init,destroy:()=>cleanup()}
  document.addEventListener('pjax:send',()=>cleanup()); document.addEventListener('pjax:complete',init)
  document.addEventListener('fliex:music',init)
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init()
})()
