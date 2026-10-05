(() => {
  'use strict'
  if (window.NovaListeningDB) return
  let connection
  const open = () => connection ||= new Promise((resolve, reject) => {
    const request = indexedDB.open('novafliex_music', 1)
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('listening_sessions', { keyPath: 'id' })
      store.createIndex('startedAt', 'startedAt')
      store.createIndex('trackId', 'trackId')
    }
    request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); connection = null }; resolve(request.result) }
    request.onerror = () => { connection = null; reject(request.error) }
    request.onblocked = () => { connection = null; reject(new Error('请关闭其他档案页面后重试')) }
  })
  const run = async (mode, operation) => {
    const db = await open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('listening_sessions', mode), store = tx.objectStore('listening_sessions')
      let result
      try { result = operation(store) } catch (error) { tx.abort(); reject(error); return }
      tx.oncomplete = () => { if (mode === 'readwrite') document.dispatchEvent(new Event('listening:changed')); resolve(result?.result) }
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('本地数据写入失败'))
    })
  }
  const validate = input => {
    const rows = Array.isArray(input) ? input : input?.sessions
    if (!Array.isArray(rows) || rows.length > 100000) throw new Error('无效档案格式或记录过多')
    const ids = new Set()
    return rows.map(row => {
      if (!row || !['id', 'trackId', 'title', 'artist', 'cover'].every(key => typeof row[key] === 'string' && row[key].length <= 4096) || !row.id || !row.trackId || ids.has(row.id) || !Number.isFinite(row.startedAt) || !Number.isFinite(row.endedAt) || row.startedAt < 0 || row.endedAt < row.startedAt || row.endedAt > 8640000000000000 || !Number.isFinite(row.listenedSeconds) || row.listenedSeconds < 5 || row.listenedSeconds > (row.endedAt - row.startedAt) / 1000 + .1 || !Number.isFinite(row.duration) || row.duration < 0 || typeof row.completed !== 'boolean' || (row.cover && !/^\/(?!\/)/.test(row.cover))) throw new Error('记录字段无效：' + (row?.id || 'unknown'))
      ids.add(row.id)
      return Object.fromEntries(['id','trackId','title','artist','cover','startedAt','endedAt','listenedSeconds','duration','completed'].map(key => [key, row[key]]))
    })
  }
  window.NovaListeningDB = { open, all: () => run('readonly', store => store.getAll()), put: row => run('readwrite', store => store.put(row)), validate,
    import: (input, replace = false) => { const rows = validate(input); return run('readwrite', store => { if (replace) store.clear(); rows.forEach(row => store.put(row)) }) },
    reset: () => run('readwrite', store => store.clear()) }
  open().catch(() => {})
})()
