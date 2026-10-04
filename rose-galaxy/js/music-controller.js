(() => {
  'use strict'
  if (window.__fliexMusic) return
  const failureKey = 'fliex-music-unplayable-v1', selectionKey = 'fliex-music-selection-v1'
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch (_) { return fallback } }
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)) } catch (_) {} }
  const storedFailures = read(failureKey, [])
  const failures = new Set(Array.isArray(storedFailures) ? storedFailures : [])
  let player = null, loading = null, failed = false, message = '暂无音乐', configured = false
  let wantsPlay = false, restoreTime = 0, skipTimer = 0, saveAt = 0
  let audioContext = null, analyser = null, audioSource = null
  const settings = read('fliex-music-settings-v1', {})
  let mode = ['list', 'single', 'shuffle'].includes(settings.mode) ? settings.mode : 'list'
  let volume = Number.isFinite(settings.volume) ? Math.max(0, Math.min(1, settings.volume)) : .6
  const saveSettings = () => write('fliex-music-settings-v1', { mode, volume })
  const emit = () => document.dispatchEvent(new CustomEvent('fliex:music'))
  // Keep the media element outside #body-wrap, which PJAX replaces on navigation.
  const ensureAudio = () => {
    let host = document.getElementById('fliex-shared-player')
    if (!host) {
      host = document.createElement('div'); host.id = 'fliex-shared-player'; host.hidden = true
      const audio = document.createElement('audio'); audio.preload = 'metadata'; audio.volume = volume
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
      playing: Boolean(player && !player.audio.paused), currentTime: player?.audio.currentTime || 0,
      duration: Number.isFinite(player?.audio.duration) ? player.audio.duration : 0 }
  }
  const save = () => {
    const song = player?.list.audios[player.list.index]
    if (song) write(selectionKey, { key: song.id, time: player.audio.currentTime || 0 })
  }
  const play = async () => {
    if (!player?.list.audios.length) return
    wantsPlay = true
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext
      if (AudioContext && !audioSource) {
        audioContext ||= new AudioContext()
        analyser ||= audioContext.createAnalyser(); analyser.fftSize = 256
        audioSource = audioContext.createMediaElementSource(player.audio)
        audioSource.connect(analyser); analyser.connect(audioContext.destination)
      }
      if (audioContext?.state === 'suspended') await audioContext.resume()
    } catch (error) { console.warn('[Fliex Music] 波形分析不可用', error) }
    try { await player.audio.play(); failed = false; emit() }
    catch (error) {
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
      switch(index) {
        save(); clearTimeout(skipTimer)
        list.index = ((index % list.audios.length) + list.audios.length) % list.audios.length
        restoreTime = 0; failed = false
        audio.src = list.audios[list.index].url
        emit()
      },
      remove(index) {
        list.audios.splice(index, 1)
        if (list.audios.length) list.switch(Math.min(index, list.audios.length - 1))
        else { audio.pause(); audio.removeAttribute('src'); audio.load(); wantsPlay = false; failed = true; message = '当前没有可播放的歌曲'; emit() }
      }
    }
    player = { audio, list, play, pause() { wantsPlay = false; clearTimeout(skipTimer); audio.pause() }, seek(time) { if (Number.isFinite(audio.duration)) audio.currentTime = Math.max(0, Math.min(time, audio.duration)) } }
    if (!list.audios.length) { failed = true; message = '当前没有可播放的歌曲'; emit(); return }
    const selected = read(selectionKey, {})
    const index = list.audios.findIndex(song => song.id === selected.key)
    list.switch(index >= 0 ? index : 0)
    restoreTime = index >= 0 ? Math.max(0, Number(selected.time) || 0) : 0
    audio.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(audio.duration) && list.audios[list.index]) list.audios[list.index].duration = audio.duration
      if (restoreTime) player.seek(Math.min(restoreTime, Math.max(0, audio.duration - 1)))
      restoreTime = 0; emit()
    })
    audio.addEventListener('play', () => { failed = false; save(); emit() })
    audio.addEventListener('pause', () => { save(); emit() })
    audio.addEventListener('timeupdate', () => { if (Date.now() - saveAt > 5000) { save(); saveAt = Date.now() } emit() })
    audio.addEventListener('durationchange', emit)
    audio.addEventListener('ended', () => {
      if (!wantsPlay || !list.audios.length) return
      if (mode === 'single') { player.seek(0); play() }
      else next()
    })
    audio.addEventListener('error', () => {
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
    const ap = player || await load()
    if (!ap?.list.audios.length) return
    if (ap.audio.paused) await play()
    else ap.pause()
  }
  const retry = () => {
    if (loading) return loading
    save(); player?.pause(); clearTimeout(skipTimer)
    document.getElementById('fliex-shared-player')?.remove()
    audioSource?.disconnect(); audioSource = null
    player = null; configured = false; failed = false; wantsPlay = false
    failures.clear(); write(failureKey, [])
    return load()
  }
  const select = async index => { const ap = player || await load(); if (!ap?.list.audios.length) return; ap.list.switch(index); await play() }
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
  window.__fliexMusic = { snapshot, load, retry, toggle, play, select, next, previous, seek, setMode, setVolume, parseLyrics, get analyser() { return analyser }, get player() { return player } }
  window.addEventListener('pagehide', save)
  const init = () => { ensureAudio(); load() }
  document.addEventListener('pjax:complete', init)
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true })
  else init()
})()
