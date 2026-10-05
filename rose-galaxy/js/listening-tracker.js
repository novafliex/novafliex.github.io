(() => {
  'use strict'
  if (window.NovaListeningTracker) return
  class Tracker {
    constructor({ save, now = () => performance.now(), wall = () => Date.now(), visible = () => true, schedule = true }) {
      Object.assign(this, { save, now, wall, visible }); this.session = null; this.active = false; this.last = null; this.lastWall = null; this.checkpoint = 0; this.queue = Promise.resolve(); this.frozen = false
      this.pending = new Map()
      if (schedule) this.timer = setInterval(() => { this.tick(); this.notify(); if (this.now() - this.checkpoint >= 15000) this.persist() }, 1000)
    }
    notify() { document.dispatchEvent(new Event('listening:tick')) }
    snapshot() {
      const records = new Map(this.pending)
      if (this.session?.listenedSeconds >= 5) records.set(this.session.id, { ...this.session })
      return [...records.values()].map(row => ({ ...row }))
    }
    acknowledge(rows) { rows.forEach(row => { const pending = this.pending.get(row.id); if (pending && row.listenedSeconds >= pending.listenedSeconds && row.completed === pending.completed && row.endedAt >= pending.endedAt) this.pending.delete(row.id) }) }
    tick() {
      const now = this.now(), wall = this.wall()
      if (this.session && new Date(this.session.startedAt).toDateString() !== new Date(wall).toDateString()) {
        const active = this.active; this.persist(); this.session = null; this.active = false; this.last = null
        if (active) this.resume()
      }
      if (this.session && this.active && this.visible() && !this.frozen && this.last !== null) {
        const elapsed = now - this.last, real = wall - this.lastWall
        // Long timer gaps are discarded, never capped into invented listening time.
        if (elapsed >= 0 && elapsed <= 5000 && real >= 0 && real <= 5000 && Math.abs(real - elapsed) < 500) {
          this.session.listenedSeconds += elapsed / 1000; this.session.endedAt = Math.max(this.session.endedAt, wall)
        }
      }
      this.last = now; this.lastWall = wall
    }
    startTrack(track) {
      this.endTrack(); this.track = track; this.active = false; this.last = null
    }
    resume() {
      if (!this.track || !this.visible() || this.frozen || this.holding || (this.canPlay && !this.canPlay())) return
      if (!this.session) {
        const startedAt = this.wall()
        this.session = { id: crypto.randomUUID(), trackId: String(this.track.id), title: this.track.title || this.track.name || '', artist: this.track.artist || '', cover: /^\/(?!\/)/.test(this.track.cover || '') ? this.track.cover : '', startedAt, endedAt: startedAt, listenedSeconds: 0, duration: Number(this.track.duration) || 0, completed: false }
        this.checkpoint = this.now()
      }
      if (!this.active) { this.last = this.now(); this.lastWall = this.wall(); this.active = true }
    }
    pause() { this.tick(); this.active = false; this.persist(); this.notify() }
    persist() {
      this.checkpoint = this.now()
      if (!this.session || this.session.listenedSeconds < 5) return this.queue
      const row = { ...this.session }
      this.pending.set(row.id, row)
      const signature = JSON.stringify(row)
      if (signature === this.persisted) return this.queue
      this.persisted = signature
      this.queue = this.queue.catch(() => {}).then(() => this.save(row)).then(() => {
        document.dispatchEvent(new CustomEvent('listening:saved', { detail: { ...row } }))
        if (JSON.stringify(this.pending.get(row.id)) === signature) this.pending.delete(row.id)
      }).catch(error => { if (this.persisted === signature) this.persisted = null; document.dispatchEvent(new CustomEvent('listening:error', { detail: error.message })) })
      return this.queue
    }
    endTrack(completed = false) { this.tick(); this.active = false; if (this.session) { this.session.completed = completed; this.persist() } this.session = null; this.last = null; this.notify() }
    async clearPending() { const active = this.active; this.holding = true; this.session = null; this.active = false; this.last = null; this.pending.clear(); await this.queue; return () => { this.holding = false; if (active || this.canPlay?.()) this.resume() } }
    destroy() { this.endTrack(); clearInterval(this.timer) }
  }
  window.NovaListeningTracker = Tracker
  const tracker = new Tracker({ save: row => window.NovaListeningDB.put(row) })
  window.novaListeningTracker = tracker
  let attached = null, off = []
  const bind = () => {
    try {
      const api = window.__fliexMusic, audio = api?.player?.audio
      if (!audio || audio === attached) return
      off.forEach(fn => fn()); off = []; tracker.endTrack(); attached = audio
      tracker.canPlay = () => !audio.paused && !audio.ended && !audio.seeking && audio.readyState >= 3
      const on = (target, name, handler, options) => { const safe = () => { try { handler() } catch (_) {} }; target.addEventListener(name, safe, options); off.push(() => target.removeEventListener(name, safe, options)) }
      const resume = () => { if (!audio.paused && !audio.ended && !audio.seeking && audio.readyState >= 3) tracker.resume() }
      tracker.startTrack(api.snapshot().song)
      on(audio, 'playing', resume)
      ;['pause','waiting','seeking','error','emptied'].forEach(name => on(audio, name, () => tracker.pause()))
      // stalled is a network event; buffered audio can still be playing.
      on(audio, 'stalled', () => { if (audio.readyState < 3) tracker.pause() })
      // Sample real elapsed time on media heartbeats too. Never use currentTime
      // differences: seeking and playbackRate must not change listened seconds.
      on(audio, 'timeupdate', () => { if (tracker.canPlay()) { resume(); tracker.tick() } })
      on(audio, 'seeked', resume)
      on(audio, 'ended', () => tracker.endTrack(true), true)
      on(document, 'fliex:track', () => { tracker.startTrack(api.snapshot().song) })
      on(document, 'visibilitychange', () => { tracker.tick(); tracker.persist(); resume() })
      on(document, 'freeze', () => { tracker.pause(); tracker.frozen = true })
      on(document, 'resume', () => { tracker.frozen = false; resume() })
      on(window, 'pagehide', () => tracker.endTrack())
      on(window, 'pageshow', resume)
      resume()
    } catch (_) { /* Archive failures must never reach the playback stack. */ }
  }
  document.addEventListener('fliex:music', bind)
  bind()
})()
