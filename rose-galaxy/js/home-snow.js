(() => {
  'use strict'
  if (window.__fliexSnow) return
  let running = false, activeStop = null
  const storageKey = 'fliex-coast-snow-v1'
  const mount = (root, options = {}) => {
    activeStop?.()
    const listeners = []
    const on = (target, name, fn) => { target.addEventListener(name, fn); listeners.push(() => target.removeEventListener(name, fn)) }
    const canvas = options.canvas || root.querySelector('[data-coast-snow]')
    const context = canvas?.getContext('2d')
    const toggle = options.toggle || root.querySelector('[data-coast-snow-toggle]')
    if (!canvas || !context || !toggle) return () => {}
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    // Keep the supplied photographic branches; no generated zigzag geometry.
    const lightningLayer = document.createElement('div')
    lightningLayer.className = 'coast-lightning'
    lightningLayer.setAttribute('aria-hidden', 'true')
    const lightningImage = document.createElement('img')
    lightningImage.src = '/img/lightning-reference.png'
    lightningImage.alt = ''
    lightningLayer.appendChild(lightningImage)
    ;(options.lightningRoot || root).appendChild(lightningLayer)
    let saved = null
    try { saved = localStorage.getItem(storageKey) } catch (_) {}
    let enabled = saved === null ? !media.matches : saved === 'true'
    let raf = 0, lastFrame = 0, width = 0, height = 0, pixelRatio = 0, particles = [], lightning = null, nextLightning = 0, disposed = false, animating = false
    const scheduleLightning = time => time + (10 + Math.random() * 20) * 1000
    const stop = () => {
      cancelAnimationFrame(raf); raf = 0; running = false; animating = false; lastFrame = 0
      lightning = null; nextLightning = 0
      lightningLayer.style.opacity = '0'
      context?.clearRect(0, 0, width, height)
    }
    const resize = () => {
      const rect = (canvas || root).getBoundingClientRect()
      const ratio = Math.min(devicePixelRatio || 1, 1.5)
      if (rect.width <= 0 || rect.height <= 0) return false
      if (rect.width === width && rect.height === height && ratio === pixelRatio) return true
      width = rect.width; height = rect.height; pixelRatio = ratio
      canvas.width = width * ratio; canvas.height = height * ratio
      context?.setTransform(ratio, 0, 0, ratio, 0, 0)
      const mobile = width <= 900
      const count = Math.floor(Math.min(170, Math.max(50, width * height / 9500)) * (mobile ? .6 : 1))
      particles = Array.from({ length: count }, () => {
        const near = Math.random() < .07
        return { x: Math.random() * width, y: Math.random() * height, r: near ? 2.4 + Math.random() * 1.8 : .7 + Math.random() * 1.2, alpha: near ? .32 : .2 + Math.random() * .35, speed: near ? 25 + Math.random() * 12 : 12 + Math.random() * 16, phase: Math.random() * Math.PI * 2, sway: 3 + Math.random() * 9 }
      })
      nextLightning = scheduleLightning(performance.now())
      return true
    }
    const drawLightning = time => {
      if (!lightningImage.complete || !lightningImage.naturalWidth) return
      if (!lightning && time < nextLightning) return
      if (!lightning) {
        const right = width > 900 && Math.random() > .65
        lightningLayer.dataset.region = right ? 'right' : 'left'
        lightningImage.style.transform = right ? 'translate(-50%,-50%) rotate(12deg) scaleX(-1)' : 'translate(-50%,-50%) rotate(-58deg)'
        lightning = { started: time, duration: 680 }
        nextLightning = scheduleLightning(time)
      }
      const age = time - lightning.started
      if (age >= lightning.duration) { lightning = null; lightningLayer.style.opacity = '0'; return }
      const pulse = age < 90 ? Math.sin(age / 90 * Math.PI) : age < 170 ? .08 : Math.exp(-(age - 170) / 110) * .72
      lightningLayer.style.opacity = String(pulse * .85)
    }
    const frame = time => {
      if (disposed || !animating) return
      if (!root.isConnected) { stop(); return }
      // PJAX styles can arrive after mounting. Never stretch a stale bitmap.
      if (!resize()) { stop(); return }
      const elapsed = lastFrame ? time - lastFrame : 34
      if (elapsed >= 32) {
        const delta = Math.min(elapsed, 80) / 1000
        lastFrame = time
        context.clearRect(0, 0, width, height)
        for (const p of particles) {
          p.x += (-p.speed * .22 + Math.sin(time / 1800 + p.phase) * p.sway) * delta; p.y += p.speed * delta
          context.fillStyle = "rgba(219,235,244," + p.alpha + ")"
          if (p.x < -4) p.x = width + 4
          if (p.x > width + 4) p.x = -4
          if (p.y > height + 4) p.y = -4
          context.beginPath(); context.ellipse(p.x, p.y, p.r, p.r * .9, 0, 0, Math.PI * 2); context.fill()
        }
        drawLightning(time)
      }
      raf = requestAnimationFrame(frame)
    }
    const sync = () => {
      if (disposed) return
      const active = enabled && !media.matches
      toggle.setAttribute('aria-checked', String(active))
      toggle.textContent = active ? 'SNOW · ON' : 'SNOW · OFF'
      toggle.title = media.matches ? '系统已开启减少动态效果' : active ? '关闭风雪动画' : '开启风雪动画'
      if (!active || document.hidden || !root.isConnected || !context) { stop(); return }
      if (!animating && resize()) { nextLightning = scheduleLightning(performance.now()); running = true; animating = true; raf = requestAnimationFrame(frame) }
    }
    on(toggle, 'click', () => {
      enabled = !enabled
      try { localStorage.setItem(storageKey, String(enabled)) } catch (_) {}
      sync()
    })
    on(media, 'change', sync)
    on(document, 'visibilitychange', sync)
    on(window, 'resize', () => { resize(); sync() })
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (!disposed) { resize(); sync() } }) : null
    observer?.observe(canvas)
    resize(); sync()
    const cleanup = () => {
      if (disposed) return
      disposed = true; stop(); observer?.disconnect(); listeners.forEach(off => off()); lightningLayer.remove()
      if (activeStop === cleanup) activeStop = null
    }
    activeStop = cleanup
    return cleanup
  }
  window.__fliexSnow = { mount, get running() { return running } }
})()
