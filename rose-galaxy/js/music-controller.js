(() => {
  'use strict'
  if (window.__fliexMusic) return
  const failureKey = 'fliex-music-unplayable-v1', selectionKey = 'fliex-music-selection-v1'
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch (_) { return fallback } }
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)) } catch (_) {} }
  const storedFailures = read(failureKey, [])
  const failures = new Set(Array.isArray(storedFailures) ? storedFailures : [])
  let player = null, loading = null, failed = false, message = '暂无音乐', configured = false
  let wantsPlay = false, restoreTime = 0, skipTimer = 0, saveAt = 0, selectionVersion = 0
  let mediaTrack = ''
  const settings = read('fliex-music-settings-v1', {})
  let mode = ['list', 'single', 'shuffle'].includes(settings.mode) ? settings.mode : 'list'
  let volume = Number.isFinite(settings.volume) ? Math.max(0, Math.min(1, settings.volume)) : .6
  const saveSettings = () => write('fliex-music-settings-v1', { mode, volume })
  const syncMediaSession = () => {
    const session = navigator.mediaSession, song = player?.list.audios[player.list.index]
    if (!session) return
    try {
      if (song && mediaTrack !== song.id && typeof window.MediaMetadata === 'function') {
        session.metadata = new MediaMetadata({ title: song.name, artist: song.artist || '', album: song.album || '', artwork: song.cover ? [{ src: new URL(song.cover, location.href).href }] : [] })
        mediaTrack = song.id
      }
      session.playbackState = player && !player.audio.paused ? 'playing' : 'paused'
      const duration = Number.isFinite(player?.audio.duration) ? player.audio.duration : Number(song?.duration)
      if (session.setPositionState && duration > 0) session.setPositionState({ duration, playbackRate: player.audio.playbackRate || 1, position: Math.max(0, Math.min(duration, restoreTime || player.audio.currentTime || 0)) })
    } catch (_) { /* Optional system controls must never interrupt native playback. */ }
  }
  const emit = () => { syncMediaSession(); document.dispatchEvent(new CustomEvent('fliex:music')) }
  // The deadline belongs to the shared player, so navigation and track changes keep it.
  let sleepEndsAt = 0, sleepInterval = 0, stopAfterTrack = false
  const stopTrackKey = 'fliex-music-sleep-track-v1'
  try { sleepEndsAt = Number(sessionStorage.getItem('fliex-music-sleep-v1')) || 0 } catch (_) {}
  try { stopAfterTrack = sessionStorage.getItem(stopTrackKey) === '1' } catch (_) {}
  if (!Number.isFinite(sleepEndsAt) || sleepEndsAt > Date.now() + 720 * 60000) sleepEndsAt = 0
  const sleepState = () => ({ endsAt: sleepEndsAt, remaining: Math.max(0, Math.ceil((sleepEndsAt - Date.now()) / 1000)), stopAfterTrack })
  const clearStopTrack = () => {
    stopAfterTrack = false
    try { sessionStorage.removeItem(stopTrackKey) } catch (_) {}
  }
  const sleepTick = () => {
    const expired = sleepEndsAt > 0 && Date.now() >= sleepEndsAt
    if (expired) {
      sleepEndsAt = 0; clearInterval(sleepInterval); sleepInterval = 0
      try { sessionStorage.removeItem('fliex-music-sleep-v1') } catch (_) {}
      wantsPlay = false; player?.pause(); emit()
    }
    document.dispatchEvent(new CustomEvent('fliex:sleep', { detail: { ...sleepState(), expired } }))
    return expired
  }
  const setSleepTimer = minutes => {
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 720) return false
    clearInterval(sleepInterval); sleepInterval = 0
    clearStopTrack()
    sleepEndsAt = minutes ? Date.now() + minutes * 60000 : 0
    try { if (sleepEndsAt) sessionStorage.setItem('fliex-music-sleep-v1', String(sleepEndsAt)); else sessionStorage.removeItem('fliex-music-sleep-v1') } catch (_) {}
    if (sleepEndsAt) sleepInterval = setInterval(sleepTick, 1000)
    sleepTick(); return true
  }
  // "End of this track" reuses the same pause path as the timed deadline.
  const setSleepTrack = () => {
    clearInterval(sleepInterval); sleepInterval = 0
    sleepEndsAt = 0
    try { sessionStorage.removeItem('fliex-music-sleep-v1') } catch (_) {}
    stopAfterTrack = true
    try { sessionStorage.setItem(stopTrackKey, '1') } catch (_) {}
    document.dispatchEvent(new CustomEvent('fliex:sleep', { detail: sleepState() }))
    return true
  }
  if (sleepEndsAt > Date.now()) sleepInterval = setInterval(sleepTick, 1000)
  else sleepEndsAt = 0
  document.addEventListener('visibilitychange', () => { if (sleepEndsAt) sleepTick() })
  window.addEventListener('pageshow', () => { if (sleepEndsAt) sleepTick() })
  // Keep the media element outside #body-wrap, which PJAX replaces on navigation.
  const ensureAudio = () => {
    let host = document.getElementById('fliex-shared-player')
    if (!host) {
      host = document.createElement('div'); host.id = 'fliex-shared-player'; host.hidden = true
      const audio = document.createElement('audio'); audio.preload = 'none'; audio.volume = volume
      host.appendChild(audio); document.body.appendChild(host)
    }
    return host.querySelector('audio')
  }
  const snapshot = () => {
    const song = player?.list.audios[player.list.index]
    return { ready: Boolean(song), configured, failed,
      title: failed ? message : song?.name || message,
      artist: failed ? '点击重试' : song?.artist || '等待添加歌曲',
      song, tracks: player?.list.audios.slice() || [], mode, volume, index: player?.list.index || 0,
      playing: Boolean(player && !player.audio.paused), currentTime: restoreTime || player?.audio.currentTime || 0,
      duration: Number.isFinite(player?.audio.duration) ? player.audio.duration : Number(song?.duration) || 0 }
  }
  const save = () => {
    const song = player?.list.audios[player.list.index]
    if (song) write(selectionKey, { key: song.id, time: restoreTime || player.audio.currentTime || 0 })
  }
  const ensureCurrentSource = () => {
    const song = player?.list.audios[player.list.index], audio = player?.audio
    if (!song || !audio) return false
    if (audio.dataset.trackId !== song.id) {
      audio.dataset.trackId = song.id
      audio.src = song.url
    }
    return true
  }
  const play = async () => {
    if (sleepEndsAt && sleepTick()) return
    if (!player?.list.audios.length) return
    wantsPlay = true
    const version = selectionVersion
    if (!ensureCurrentSource()) return
    // Keep the native media output: routing it through AudioContext can mute it
    // when Safari suspends Web Audio after the phone locks.
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback' } catch (_) {}
    if (version !== selectionVersion || !wantsPlay) return
    try { await player.audio.play(); if (version !== selectionVersion) { if (!wantsPlay) player.audio.pause(); return } failed = false; emit() }
    catch (error) {
      if (version !== selectionVersion) return
      if (error.name === 'AbortError') return
      if (error.name === 'NotAllowedError') { wantsPlay = false; failed = true; message = '请再次点击播放'; emit() }
      // Unsupported sources are handled by the media error event below.
      else { failed = true; message = '音源暂时不可用'; emit() }
    }
  }
  const attach = songs => {
    const audio = ensureAudio()
    const list = {
      audios: songs.filter(song => !failures.has(song.id)), index: 0,
      switch(index, savePrevious = true) {
        if (!list.audios.length) return
        if (savePrevious) save()
        selectionVersion++; clearTimeout(skipTimer)
        audio.pause()
        if (audio.hasAttribute('src')) { audio.removeAttribute('src'); delete audio.dataset.trackId; audio.load() }
        list.index = ((index % list.audios.length) + list.audios.length) % list.audios.length
        restoreTime = 0; failed = false
        try { document.dispatchEvent(new Event('fliex:track')) } catch (_) {}
        save()
        emit()
      },
      remove(index) {
        save()
        list.audios.splice(index, 1)
        if (list.audios.length) list.switch(Math.min(index, list.audios.length - 1), false)
        else { audio.pause(); audio.removeAttribute('src'); audio.load(); wantsPlay = false; failed = true; message = '当前没有可播放的歌曲'; emit() }
      }
    }
    player = { audio, list, play, pause() { wantsPlay = false; selectionVersion++; clearTimeout(skipTimer); audio.pause() }, seek(time) {
      if (!Number.isFinite(time)) return
      const duration = Number.isFinite(audio.duration) ? audio.duration : Number(list.audios[list.index]?.duration)
      const target = Math.max(0, Number.isFinite(duration) ? Math.min(time, duration) : time)
      if (audio.dataset.trackId && audio.readyState >= 1) { restoreTime = 0; audio.currentTime = target }
      else restoreTime = target
      save()
    } }
    if (!list.audios.length) { failed = true; message = '当前没有可播放的歌曲'; emit(); return }
    const selected = read(selectionKey, {})
    const index = list.audios.findIndex(song => song.id === selected.key)
    list.switch(index >= 0 ? index : 0, false)
    restoreTime = index >= 0 ? Math.max(0, Number(selected.time) || 0) : 0
    audio.addEventListener('loadedmetadata', () => {
      if (audio.dataset.trackId !== list.audios[list.index]?.id) return
      if (Number.isFinite(audio.duration) && list.audios[list.index]) list.audios[list.index].duration = audio.duration
      if (restoreTime && Number.isFinite(audio.duration)) audio.currentTime = Math.min(restoreTime, Math.max(0, audio.duration - 1))
      restoreTime = 0; emit()
    })
    audio.addEventListener('play', () => { failed = false; save(); emit() })
    audio.addEventListener('pause', () => { save(); emit() })
    audio.addEventListener('timeupdate', () => { if (sleepEndsAt) sleepTick(); if (Date.now() - saveAt > 5000) { save(); saveAt = Date.now() } emit() })
    audio.addEventListener('durationchange', emit)
    audio.addEventListener('ended', () => {
      if (sleepEndsAt && sleepTick()) return
      // "End of this track" is one-shot: it stops here instead of advancing the queue.
      if (stopAfterTrack) {
        clearStopTrack(); wantsPlay = false; audio.pause()
        document.dispatchEvent(new CustomEvent('fliex:sleep', { detail: { ...sleepState(), finished: true } }))
        emit(); return
      }
      if (!wantsPlay || !list.audios.length) return
      if (mode === 'single') { player.seek(0); play() }
      else next()
    })
    audio.addEventListener('error', () => {
      if (!audio.hasAttribute('src') || audio.dataset.trackId !== list.audios[list.index]?.id) return
      console.error('[Fliex Music] 音频加载失败', { id: list.audios[list.index]?.id, src: audio.currentSrc || audio.src, code: audio.error?.code, message: audio.error?.message })
      if (!wantsPlay) { failed = true; message = '音源暂时不可用'; emit(); return }
      const song = list.audios[list.index]
      if (!song) return
      failures.add(song.id); write(failureKey, [...failures]); list.remove(list.index)
      if (list.audios.length) skipTimer = setTimeout(() => { if (wantsPlay) play() }, 100)
    })
    emit()
  }
  const load = () => {
    if (loading) return loading
    if (player || configured) return Promise.resolve(player)
    failed = false
    loading = (async () => {
      const response = await fetch('/music-data.json')
      if (!response.ok) throw new Error('音乐配置加载失败')
      const data = await response.json()
      const songs = (Array.isArray(data.tracks) ? data.tracks : []).map(song => ({ ...song, title: song.title || song.name, src: song.src || song.url, name: song.title || song.name, url: song.src || song.url })).filter(song => song.id && song.title && /^https:\/\/|^\/(?!\/)/.test(song.src || ''))
      configured = true
      if (songs.length) attach(songs)
      else { message = '暂无音乐'; emit() }
      return player
    })().catch(error => { failed = true; message = error.message; emit(); return null }).finally(() => { loading = null })
    emit()
    return loading
  }
  const toggle = async () => {
    const ap = failed && !player?.list.audios.length ? await retry() : player || await load()
    if (!ap?.list.audios.length) return
    if (ap.audio.paused) await play()
    else ap.pause()
  }
  const retry = () => {
    if (loading) return loading
    save(); player?.pause(); clearTimeout(skipTimer)
    document.getElementById('fliex-shared-player')?.remove()
    mediaTrack = ''
    player = null; configured = false; failed = false; wantsPlay = false
    failures.clear(); write(failureKey, [])
    return load()
  }
  const select = async index => {
    const ap = player || await load()
    if (!ap?.list.audios.length) return
    ap.list.switch(index); wantsPlay = true
    const version = selectionVersion
    // Coalesce rapid navigation before binding a source; only the final choice loads.
    await new Promise(resolve => setTimeout(resolve, 100))
    if (version === selectionVersion && wantsPlay) await play()
  }
  const next = () => {
    const n = player?.list.audios.length || 0
    if (!n) return
    const index = mode === 'shuffle' && n > 1 ? (player.list.index + 1 + Math.floor(Math.random() * (n - 1))) % n : player.list.index + 1
    return select(index)
  }
  const previous = () => select((player?.list.index || 0) - 1)
  const setMode = value => { if (!['list', 'single', 'shuffle'].includes(value)) return; mode = value; saveSettings(); emit() }
  const setVolume = value => { volume = Math.max(0, Math.min(1, Number(value) || 0)); if (player) player.audio.volume = volume; saveSettings(); emit() }
  const seek = seconds => { player?.seek(seconds); emit() }
  const parseLyrics = (text, cues) => {
    if (typeof text === 'string' && Array.isArray(cues)) {
      const original = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
      if (!cues.every(cue => Array.isArray(cue) && Number.isFinite(cue[0]) && cue[0] >= 0 && (cue[1] === null || (Number.isInteger(cue[1]) && cue[1] >= 0 && cue[1] < original.length)))) throw new Error('歌词时间轴与原文不匹配')
      return cues.map(([time, index]) => ({ time, text: index === null ? '' : original[index] })).sort((a, b) => a.time - b.time)
    }
    if (Array.isArray(text)) return text.filter(line => Number.isFinite(line.time) && typeof line.text === 'string').sort((a, b) => a.time - b.time)
    return String(text || '').split(/\r?\n/).flatMap(line => {
      const stamps = [...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)]
      const words = line.replace(/\[[^\]]*\]/g, '').trim()
      return stamps.map(stamp => ({ time: Number(stamp[1]) * 60 + Number(stamp[2]), text: words }))
    }).sort((a, b) => a.time - b.time)
  }
  window.__fliexMusic = { snapshot, load, retry, toggle, play, select, next, previous, seek, setMode, setVolume, parseLyrics, setSleepTimer, setSleepTrack, sleepState, get analyser() { return null }, get player() { return player } }
  if (navigator.mediaSession?.setActionHandler) {
    const handlers = {
      play, pause: () => player?.pause(), stop: () => { player?.pause(); seek(0); emit() },
      previoustrack: previous, nexttrack: next,
      seekto: details => { if (Number.isFinite(details.seekTime)) { seek(details.seekTime); emit() } },
      seekbackward: details => { seek(snapshot().currentTime - (details.seekOffset || 10)); emit() },
      seekforward: details => { seek(snapshot().currentTime + (details.seekOffset || 10)); emit() }
    }
    for (const [action, handler] of Object.entries(handlers)) {
      try { navigator.mediaSession.setActionHandler(action, handler) } catch (_) {}
    }
  }
  window.addEventListener('pagehide', save)
  const init = () => { ensureAudio(); load() }
  document.addEventListener('pjax:complete', init)
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true })
  else init()
})()
