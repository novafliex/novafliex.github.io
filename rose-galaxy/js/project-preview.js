(() => {
  'use strict'
  if (window.__fliexProjectPreview) { window.__fliexProjectPreview.init(); return }
  let cleanup = () => {}, live = null
  const restore = (style, name, value) => value ? style.setProperty(name, value) : style.removeProperty(name)
  const stroke = body => `<svg class="pp-stroke" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`
  const icons = {
    back: stroke('<path d="M19 12H5m6-6-6 6 6 6"/>'),
    desktop: stroke('<rect x="3" y="4.5" width="18" height="12" rx="1.5"/><path d="M9.5 20h5M12 16.5V20"/>'),
    tablet: stroke('<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M11 18h2"/>'),
    mobile: stroke('<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>'),
    refresh: stroke('<path d="M20 12a8 8 0 1 1-2.4-5.7M20 3.5V8h-4.5"/>'),
    external: stroke('<path d="M7 17 17 7M9 7h8v8"/>'),
    github: '<svg data-icon="github" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>',
    fullscreen: stroke('<path d="M4 9V6a2 2 0 0 1 2-2h3M20 9V6a2 2 0 0 0-2-2h-3M4 15v3a2 2 0 0 0 2 2h3M20 15v3a2 2 0 0 1-2 2h-3"/>'),
    close: stroke('<path d="M6 6l12 12M18 6 6 18"/>')
  }
  const close = ({returnFocus = true} = {}) => {
    const session = live
    if (!session) return
    live = null
    session.run++
    session.abort?.abort()
    clearTimeout(session.timer)
    clearTimeout(session.soft)
    session.frame?.remove()
    session.frame = null
    session.removeListeners?.()
    if (document.fullscreenElement === session.dialog) document.exitFullscreen?.().catch(() => {})
    if (session.dialog.open && session.dialog.close) session.dialog.close()
    session.dialog.remove()
    restore(document.body.style, 'overflow', session.bodyOverflow)
    restore(document.documentElement.style, 'overflow', session.htmlOverflow)
    if (returnFocus) {
      const behavior = document.documentElement.style.scrollBehavior
      document.documentElement.style.scrollBehavior = 'auto'
      window.scrollTo(session.x, session.y)
      restore(document.documentElement.style, 'scroll-behavior', behavior)
      if (session.trigger?.isConnected) session.trigger.focus({preventScroll:true})
    }
  }
  const destroy = () => { close({returnFocus:false}); cleanup(); cleanup = () => {} }
  const init = () => {
    const root = document.querySelector('[data-projects-switcher]')
    const source = document.querySelector('[data-project-preview-config]')
    if (!root || !source || root.dataset.previewReady) return
    destroy()
    let config
    try { config = JSON.parse(source.textContent) } catch { return }
    Object.values(config).forEach(project => {
      project.works = (project.works || []).filter(work => {
        try {
          const url = new URL(work.demoUrl)
          return url.origin === 'https://novafliex.github.io' && url.pathname.startsWith('/' + project.name + '/') && !url.username && !url.password
        } catch { return false }
      })
    })
    root.dataset.previewReady = 'true'
    const listeners = []
    const on = (target, type, fn) => { target.addEventListener(type, fn); listeners.push(() => target.removeEventListener(type, fn)) }
    const open = (key, trigger) => {
      const project = config[key]
      if (!project?.works.length || live) return
      // Work selection belongs to the Projects list; the shell only receives the chosen id.
      const work = project.works.find(item => item.id === trigger?.dataset.openWork) || project.works[0]
      const dialog = document.createElement('dialog')
      dialog.className = 'project-preview-dialog'
      dialog.setAttribute('aria-labelledby', 'project-preview-title')
      dialog.setAttribute('aria-modal', 'true')
      dialog.innerHTML = `<header class="project-preview-toolbar">
        <div class="project-preview-heading"><button type="button" class="project-preview-back" data-preview-close aria-label="返回 Projects" title="返回 Projects">${icons.back}</button><div class="project-preview-title"><p class="project-preview-kicker">PROJECTS · <span data-preview-project></span><span data-preview-counter hidden></span></p><h2 id="project-preview-title"></h2></div></div>
        <p class="project-preview-status" data-preview-status aria-live="polite"></p>
        <span class="project-preview-sep" aria-hidden="true"></span>
        <div class="project-preview-devices" role="group" aria-label="预览屏幕尺寸"><button type="button" data-preview-device="desktop" aria-pressed="true" aria-label="桌面宽度" title="桌面">${icons.desktop}</button><button type="button" data-preview-device="tablet" aria-pressed="false" aria-label="平板宽度" title="平板">${icons.tablet}</button><button type="button" data-preview-device="mobile" aria-pressed="false" aria-label="手机宽度" title="手机">${icons.mobile}</button></div>
        <span class="project-preview-sep" aria-hidden="true"></span>
        <div class="project-preview-tools"><button type="button" data-preview-refresh aria-label="重新加载作品" title="刷新">${icons.refresh}</button><a data-preview-external target="_blank" rel="noopener noreferrer" aria-label="在独立标签页打开" title="独立打开">${icons.external}</a><a data-preview-source target="_blank" rel="noopener noreferrer" aria-label="查看 GitHub 源码" title="GitHub 源码">${icons.github}</a><button type="button" data-preview-fullscreen aria-pressed="false" aria-label="全屏预览" title="全屏">${icons.fullscreen}</button><button type="button" data-preview-close aria-label="关闭预览" title="关闭预览">${icons.close}</button></div>
      </header>
      <div class="project-preview-stage" data-preview-stage><div class="project-preview-viewport" data-preview-viewport data-device="desktop"></div>
        <div class="project-preview-notice" data-preview-notice role="status" aria-live="polite" data-state="loading"><div class="project-preview-note"><p class="project-preview-kicker-line"><span class="project-preview-dot" aria-hidden="true"></span><span data-preview-kicker>LOADING</span></p><h3 data-preview-message></h3><p data-preview-detail></p><div class="project-preview-recovery" data-preview-recovery hidden><button type="button" data-preview-refresh>重试</button><button type="button" data-preview-continue hidden>继续查看</button><a data-preview-external target="_blank" rel="noopener noreferrer">独立打开项目 ↗</a><button type="button" data-preview-close>返回 Projects</button></div></div></div>
      </div>`
      const session = live = {
        dialog, trigger, project, work:null, frame:null, abort:null, timer:0, run:0, soft:0,
        x:window.scrollX, y:window.scrollY, bodyOverflow:document.body.style.overflow,
        htmlOverflow:document.documentElement.style.overflow
      }
      document.body.appendChild(dialog)
      const viewport = dialog.querySelector('[data-preview-viewport]')
      const notice = dialog.querySelector('[data-preview-notice]')
      const message = dialog.querySelector('[data-preview-message]')
      const detail = dialog.querySelector('[data-preview-detail]')
      const recovery = dialog.querySelector('[data-preview-recovery]')
      const continueButton = dialog.querySelector('[data-preview-continue]')
      const status = dialog.querySelector('[data-preview-status]')
      const kicker = dialog.querySelector('[data-preview-kicker]')
      const counter = dialog.querySelector('[data-preview-counter]')
      const setState = state => { notice.dataset.state = state; kicker.textContent = state === 'error' ? 'UNAVAILABLE' : state === 'unverified' ? 'UNVERIFIED' : 'LOADING' }
      dialog.querySelector('[data-preview-project]').textContent = project.name
      const current = version => live === session && session.run === version
      const fail = (version, reason) => {
        if (!current(version)) return
        session.run++
        session.abort?.abort()
        clearTimeout(session.timer)
        session.frame?.remove(); session.frame = null
        notice.hidden = false
        setState('error')
        message.textContent = '预览暂时无法加载'
        detail.textContent = reason
        recovery.hidden = false
        continueButton.hidden = true
        status.textContent = '可重试、独立打开项目，或返回 Projects。'
      }
      const load = work => {
        session.abort?.abort()
        clearTimeout(session.timer)
        clearTimeout(session.soft)
        session.soft = 0
        session.frame?.remove()
        session.frame = null
        session.work = work
        const version = ++session.run
        const abort = session.abort = new AbortController()
        let responded = false, verified = false, uncertain = false, bridgeReady = !work.previewBridge, resourceWarning = false
        const token = work.previewBridge ? [...crypto.getRandomValues(new Uint32Array(4))].map(value => value.toString(16).padStart(8,'0')).join('') : ''
        notice.hidden = false
        setState('loading')
        recovery.hidden = true
        continueButton.hidden = true
        message.textContent = work.name
        detail.textContent = '正在检查部署页面和必要资源。'
        status.textContent = '隔离加载中；第三方资源和音频可用性取决于项目及网络。'
        dialog.querySelector('#project-preview-title').textContent = work.name
        counter.hidden = project.works.length < 2
        counter.textContent = ' · ' + String(project.works.indexOf(work) + 1).padStart(2, '0') + ' / ' + String(project.works.length).padStart(2, '0')
        dialog.querySelectorAll('[data-preview-external]').forEach(a => { a.href = work.demoUrl })
        const code = dialog.querySelector('[data-preview-source]')
        code.hidden = !/^https:\/\/github\.com\//.test(work.githubUrl || '')
        if (!code.hidden) code.href = work.githubUrl
        const check = () => {
          if (!current(version) || !responded || !bridgeReady || (!verified && !uncertain)) return
          clearTimeout(session.timer)
          if (verified) {
            notice.hidden = true
            status.textContent = work.previewBridge
              ? resourceWarning ? '页面已初始化，但部分资源加载异常；可重试或独立打开。' : '页面初始化与必要资源已确认 · 独立沙箱预览'
              : '页面与必要资源已验证；隔离内容无法自动确认，画面异常时可独立打开。'
          } else if (work.previewBridge && bridgeReady) {
            notice.hidden = true
            status.textContent = '页面初始化已确认，但资源响应未能完全核验；画面异常时可重试。'
          } else {
            message.textContent = '无法确认预览加载状态'
            detail.textContent = '浏览器或网络限制了资源验证。可继续目视查看隔离页面，或独立打开。'
            recovery.hidden = false
            continueButton.hidden = false
            setState('unverified')
            status.textContent = '尚未确认预览内容；没有将 iframe 响应当作加载成功。'
          }
        }
        // Some browsers throttle rAF inside sandboxed frames, so a fully verified
        // bridge work may never emit its runtime signal. Deployment facts were all
        // confirmed parent-side; fall back to them instead of timing out.
        const softAccept = () => {
          if (!current(version) || notice.hidden || !session.frame) return
          notice.hidden = true
          status.textContent = '页面与必要资源已验证；沙箱内运行信号未回传（可能被浏览器节流），画面异常时可重试或独立打开。'
        }
        const frame = session.frame = document.createElement('iframe')
        frame.title = work.name + ' 交互预览'
        // Opaque origin even on production, where project Pages shares the blog origin.
        // Do not combine allow-scripts with allow-same-origin here.
        frame.setAttribute('sandbox', 'allow-scripts allow-popups')
        frame.setAttribute('allow', 'autoplay')
        frame.referrerPolicy = 'no-referrer'
        frame.addEventListener('load', () => { if (current(version)) { responded = true; check() } })
        frame.addEventListener('error', () => fail(version, '网络或浏览器嵌入限制阻止了页面加载。'))
        session.onMessage = event => {
          const data = event.data
          // A sandboxed sender has origin "null". Bind to its WindowProxy and a
          // per-load nonce instead of trusting an origin string or message alone.
          if (!current(version) || !work.previewBridge || event.source !== frame.contentWindow || data?.channel !== 'fliex-preview' || data.token !== token) return
          if (data.type === 'escape') { escapePreview(); return }
          if (data.type === 'resource-error') {
            resourceWarning = true
            if (notice.hidden) status.textContent = '部分项目资源未能加载；可重试或独立打开。'
          }
          if (data.type === 'ready') {
            if ((work.expectedTitle && data.title !== work.expectedTitle) || ((work.expectedSelectors || []).includes('#hero-galaxy-canvas') && !data.canvasReady)) {
              fail(version, '项目页面尚未正确初始化，请重试或独立打开。'); return
            }
            bridgeReady = true
            responded = true
            resourceWarning ||= Array.isArray(data.missingResources) && data.missingResources.length > 0
            check()
          }
        }
        const frameUrl = new URL(work.demoUrl)
        if (work.previewBridge) {
          frameUrl.searchParams.set('fliex-preview', token)
          frameUrl.searchParams.set('fliex-parent', location.origin)
        }
        frame.src = frameUrl.href
        viewport.appendChild(frame)
        session.timer = setTimeout(() => {
          if (responded && verified) softAccept()
          else fail(version, '等待时间过长，可能存在网络、部署或嵌入限制。')
        }, 18000)
        ;(async () => {
          try {
            const response = await fetch(work.demoUrl, {signal:abort.signal,credentials:'omit',cache:'no-store'})
            if (!current(version)) return
            if (!response.ok) { fail(version, '部署页面返回 HTTP ' + response.status + '，请检查 GitHub Pages。'); return }
            if (/DENY/i.test(response.headers.get('x-frame-options') || '') || /frame-ancestors\s+'none'/i.test(response.headers.get('content-security-policy') || '')) {
              fail(version, '项目服务器禁止页面被嵌入，请独立打开项目。'); return
            }
            const html = new DOMParser().parseFromString(await response.text(), 'text/html')
            if ((work.expectedTitle && html.title.trim() !== work.expectedTitle) || (work.expectedSelectors || []).some(selector => !html.querySelector(selector))) {
              fail(version, '返回的页面与项目入口不符，可能尚未正确部署。'); return
            }
            const assets = (work.requiredAssets || []).filter(asset => /^[\w./-]+$/.test(asset) && !asset.includes('..') && !asset.startsWith('/'))
            const responses = await Promise.all(assets.map(asset => fetch(new URL(asset, work.demoUrl).href, {method:'HEAD',signal:abort.signal,credentials:'omit',cache:'no-store'})))
            if (!current(version)) return
            if (responses.some(result => !result.ok)) { fail(version, '部分必要的 CSS、脚本或图片资源无法加载。'); return }
            verified = true
            if (work.previewBridge && !bridgeReady && !session.soft) session.soft = setTimeout(softAccept, 5000)
            check()
          } catch (error) {
            if (!current(version) || abort.signal.aborted) return
            uncertain = true
            check()
          }
        })()
      }
      const fullscreenButton = dialog.querySelector('[data-preview-fullscreen]')
      const expanded = value => {
        dialog.classList.toggle('is-expanded', value)
        fullscreenButton.setAttribute('aria-pressed', String(value))
        fullscreenButton.setAttribute('aria-label', value ? '退出全屏' : '全屏预览')
      }
      const fullscreen = async () => {
        if (document.fullscreenElement === dialog) { try { await document.exitFullscreen?.() } catch { expanded(false) }; return }
        if (dialog.classList.contains('is-expanded')) { expanded(false); return }
        try {
          if (!dialog.requestFullscreen) throw Error('Fullscreen unavailable')
          await dialog.requestFullscreen()
          if (live === session) expanded(true)
        } catch { if (live === session) expanded(true) }
      }
      const fullscreenChange = () => { if (live === session && !document.fullscreenElement) expanded(false) }
      const escapePreview = () => {
        if (dialog.classList.contains('is-expanded')) {
          if (document.fullscreenElement === dialog) document.exitFullscreen?.().catch(() => {})
          expanded(false)
        } else close()
      }
      document.addEventListener('fullscreenchange', fullscreenChange)
      let listening = true
      const removeDialog = () => {
        if (!listening) return
        listening = false
        document.removeEventListener('fullscreenchange', fullscreenChange)
      }
      session.removeListeners = removeDialog
      dialog.addEventListener('close', removeDialog, {once:true})
      // Native dialog traps focus, including its iframe, without touching background UI.
      dialog.addEventListener('cancel', event => {
        event.preventDefault()
        escapePreview()
      })
      dialog.addEventListener('click', event => {
        const target = event.target.closest('button')
        if (!target) return
        if (target.hasAttribute('data-preview-close')) { removeDialog(); close(); return }
        if (target.hasAttribute('data-preview-refresh')) load(session.work)
        if (target.hasAttribute('data-preview-fullscreen')) fullscreen()
        if (target.hasAttribute('data-preview-continue')) { notice.hidden = true; status.textContent = '未经自动验证的隔离预览；画面异常时可重试或独立打开。' }
        if (target.dataset.previewDevice) {
          viewport.dataset.device = target.dataset.previewDevice
          dialog.querySelectorAll('[data-preview-device]').forEach(button => button.setAttribute('aria-pressed', String(button === target)))
        }
      })
      document.body.style.overflow = 'hidden'
      document.documentElement.style.overflow = 'hidden'
      if (dialog.showModal) dialog.showModal()
      else { dialog.setAttribute('open', ''); dialog.setAttribute('role', 'dialog') }
      dialog.querySelector('[data-preview-close]').focus({preventScroll:true})
      load(work)
    }
    on(root, 'click', event => {
      const explicit = event.target.closest('[data-open-preview]')
      if (explicit) { open(explicit.dataset.openPreview, explicit); return }
    })
    on(window, 'message', event => live?.onMessage?.(event))
    cleanup = () => { listeners.splice(0).forEach(off => off()); delete root.dataset.previewReady }
  }
  window.__fliexProjectPreview = {init, destroy, close}
  document.addEventListener('pjax:send', destroy)
  document.addEventListener('pjax:complete', init)
  document.addEventListener('pjax:error', init)
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true})
  else init()
})()
