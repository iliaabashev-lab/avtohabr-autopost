// Публикация в ВК официальным API (ключ сообщества VK_TOKEN с правами wall, photos) и сбор реальной статистики.
//   node vk.mjs schedule  — ставит посты дня в отложенные на послезавтра (публикует ВК сам, ПК не нужен)
//   node vk.mjs stats     — Performance Learner: просмотры/лайки/комменты/репосты последних постов → performance.json
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, readJson, writeJson, today } from './lib.mjs'

const token = process.env.VK_TOKEN
const GROUP = 242845245
if (!token) { console.log('VK_TOKEN не задан: ВК пропускаю (ключ сообщества: Управление → Работа с API)'); process.exit(0) }

async function vk(method, params) {
  const body = new URLSearchParams({ ...params, access_token: token, v: '5.199' })
  const r = await (await fetch(`https://api.vk.com/method/${method}`, { method: 'POST', body })).json()
  if (r.error) throw new Error(`${method}: ${r.error.error_msg}`)
  return r.response
}

const IMG_POOLS = { serious: [], funny: [] }
for (const tone of ['serious', 'funny']) {
  const dirs = [path.join(ROOT, 'images/vk', tone), path.join(ROOT, 'images', tone)]
  for (const dir of dirs) {
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir).filter((x) => /\.(jpe?g|png|webp)$/i.test(x))) {
        const full = path.join(dir, f)
        try { if (fs.statSync(full).size > 50000) IMG_POOLS[tone].push(full) } catch (e) {}
      }
    }
  }
}
// запасной пул, пока папки пустые: маскоты → funny, скрины приложения → serious
if (!IMG_POOLS.funny.length) for (const m of ['mascot-1.webp', 'mascot-2.webp', 'mascot-3.webp', 'mascot-4.webp']) { const p = path.join(ROOT, 'out/mascot', m); if (fs.existsSync(p)) IMG_POOLS.funny.push(p) }
if (!IMG_POOLS.serious.length) { const sd = path.join(ROOT, '..', 'promo-video/remotion/public/screens'); if (fs.existsSync(sd)) for (const f of fs.readdirSync(sd).filter((x) => x.endsWith('.jpg'))) IMG_POOLS.serious.push(path.join(sd, f)) }

async function wallPhoto(imgPath) {
  const up = await vk('photos.getWallUploadServer', { group_id: GROUP })
  const fd = new FormData()
  fd.append('photo', new Blob([fs.readFileSync(imgPath)]), path.basename(imgPath))
  const raw = await (await fetch(up.upload_url, { method: 'POST', body: fd })).json()
  const [saved] = await vk('photos.saveWallPhoto', { group_id: GROUP, server: raw.server, photo: raw.photo, hash: raw.hash })
  return `photo${saved.owner_id}_${saved.id}`
}

const mode = process.argv[2]
if (mode === 'schedule') {
  const date = today()
  const c = readJson(path.join(ROOT, `out/${date}/content.json`))
  if (!c) { console.log('Нет content.json за сегодня'); process.exit(0) }
  // ключ сообщества не даёт читать стену (wall.get), поэтому следующий свободный день храним сами.
  // 03–10.11 заполнены вручную, фабрика начинает с 11.11 и каждый запуск занимает следующий день.
  const statePath = path.join(ROOT, 'knowledge/vk-schedule.json')
  const state = readJson(statePath, { nextDay: '2026-11-11' })
  const tomorrow = new Date(Date.now() + 3 * 3600e3 + 864e5).toISOString().slice(0, 10)
  const dayStr = state.nextDay > tomorrow ? state.nextDay : tomorrow
  const day = new Date(`${dayStr}T00:00:00+03:00`).getTime()
  const slots = [9, 12, 15, 18, 21]
  const done = []
  for (const [i, p] of c.vk.entries()) {
    const at = Math.floor((day + slots[i % 5] * 3600e3) / 1000)
    // через раз текстовый пост / пост с картинкой (ротация по счётчику постов)
    let attachments
    const pool = Math.floor(i / 2) % 2 === 0 ? IMG_POOLS.serious : IMG_POOLS.funny
    if (i % 2 === 1 && pool.length) {
      try { attachments = await wallPhoto(pool[i % pool.length]) } catch (e) { console.log(`картинка не встала (пост без неё): ${e.message}`) }
    }
    const r = await vk('wall.post', { owner_id: -GROUP, from_group: 1, message: p.text, publish_date: at, ...(attachments ? { attachments } : {}) })
    done.push({ post_id: r.post_id, at: new Date(at * 1000).toISOString(), photo: !!attachments })
  }
  writeJson(path.join(ROOT, `out/${date}/vk-scheduled.json`), done)
  if (done.length) writeJson(statePath, { nextDay: new Date(day + 864e5 + 3 * 3600e3).toISOString().slice(0, 10) })
  console.log(`ВК: поставлено ${done.length} постов`)
} else if (mode === 'stats') {
  let w
  try { w = await vk('wall.get', { owner_id: -GROUP, count: 100, extended: 0 }) } catch (e) { console.log(`Статистика недоступна с ключом сообщества: ${e.message}`); process.exit(0) }
  const rows = w.items.map((p) => ({ id: p.id, date: new Date(p.date * 1000).toISOString(), text: p.text?.slice(0, 200), views: p.views?.count || 0, likes: p.likes?.count || 0, comments: p.comments?.count || 0, reposts: p.reposts?.count || 0 }))
  rows.forEach((r) => (r.er = r.views ? (r.likes + 2 * r.comments + 3 * r.reposts) / r.views : 0))
  const sorted = [...rows].filter((r) => r.views >= 20).sort((a, b) => b.er - a.er)
  writeJson(path.join(ROOT, 'knowledge/performance.json'), { updated: new Date().toISOString(), top: sorted.slice(0, 10), flop: sorted.slice(-10), all: rows })
  console.log(`Статистика ВК: ${rows.length} постов, лучшие ER: ${sorted.slice(0, 3).map((r) => r.er.toFixed(3)).join(', ')}`)
}
