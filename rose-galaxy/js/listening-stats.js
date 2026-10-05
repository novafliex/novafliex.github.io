(() => {
  'use strict'
  if (window.NovaListeningStats) return
  const dayKey = value => { const d = new Date(value); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
  const range = (mode, date) => {
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    if (mode === 'week') start.setDate(start.getDate() - (start.getDay() + 6) % 7)
    if (mode === 'month') start.setDate(1)
    if (mode === 'year') start.setMonth(0, 1)
    const end = new Date(start)
    if (mode === 'year') end.setFullYear(end.getFullYear() + 1)
    else if (mode === 'month') end.setMonth(end.getMonth() + 1)
    else end.setDate(end.getDate() + (mode === 'week' ? 7 : 1))
    return { start, end }
  }
  // Tracker closes sessions at local midnight. Imported sessions belong to their start day.
  const calculate = (all, mode, date) => {
    const { start, end } = range(mode, date), rows = all.filter(row => row.startedAt >= +start && row.startedAt < +end).sort((a,b) => b.startedAt-a.startedAt || b.id.localeCompare(a.id))
    const days = new Map(), tracks = new Map()
    rows.forEach(row => {
      const key = dayKey(row.startedAt); days.set(key, (days.get(key) || 0) + row.listenedSeconds)
      const item = tracks.get(row.trackId) || { ...row, seconds: 0, sessions: 0 }; item.seconds += row.listenedSeconds; item.sessions++; tracks.set(row.trackId,item)
    })
    const activity = []
    for (let d = new Date(start); d < end;) {
      const key = dayKey(d), seconds = mode === 'year' ? [...days].filter(([day]) => day.startsWith(key.slice(0,7))).reduce((sum,[,value]) => sum+value,0) : days.get(key) || 0
      activity.push({ date: +d, seconds }); if (mode === 'year') d.setMonth(d.getMonth()+1); else d.setDate(d.getDate()+1)
    }
    const longest = [...days].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0]))[0]
    return { rows, start, end, total: rows.reduce((sum,row) => sum+row.listenedSeconds,0), days: days.size, sessions: rows.length, tracks: tracks.size, first: rows.at(-1), last: rows[0], top: [...tracks.values()].sort((a,b) => b.seconds-a.seconds || a.trackId.localeCompare(b.trackId)).slice(0,mode === 'day' || mode === 'week' ? 1 : 5), longest, activity }
  }
  window.NovaListeningStats = { dayKey, range, calculate }
})()
