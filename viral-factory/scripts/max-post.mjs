// Автопостинг в канал MAX (botapi.max.ru, бесплатно): текстовые посты и посты с картинками — свой контент, не как ВК/TG.
// Секреты: MAX_BOT_TOKEN (бот из dev.max.ru, админ канала), MAX_CHAT_ID (id канала — можно узнать через @max ботов или из диалога с ботом).
//   node max-post.mjs post — один пост (текст или картинка+текст), вызывается кроном 2 раза в день
// MAX API: POST /messages?chat_id=...&access_token=...; картинки — upload /uploads?type=image → PUT файла → токен вложения.
import { pickTopicImage } from './publisher/topic-image.mjs'
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, readJson, writeJson, today } from './lib.mjs'

const TOKEN = process.env.MAX_BOT_TOKEN, CHAT = process.env.MAX_CHAT_ID
if (!TOKEN) { console.log('MAX_BOT_TOKEN не задан — MAX пропускаю'); process.exit(0) }
const API = 'https://platform-api2.max.ru'
const logPath = path.join(ROOT, 'knowledge/max-posted.json')
const log = readJson(logPath, { count: 0, posted: [] })

async function apiCall(method, params, body, auth) {
  const qs = new URLSearchParams(params)
  const r = await fetch(`${API}/${method}?${qs}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: auth, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok || d.code) throw new Error(`${method}: ${r.status} ${JSON.stringify(d).slice(0, 200)}`)
  return d
}
async function api(method, params = {}, body) {
  // MAX принимает разные форматы авторизации — пробуем по очереди
  const attempts = [`Bot ${TOKEN}`, TOKEN, `Bearer ${TOKEN}`]
  let err
  for (const auth of attempts) {
    try { return await apiCall(method, params, body, auth) } catch (e) { err = e; if (!/401|verify.token/.test(String(e))) throw e }
  }
  throw err
}
async function uploadImage(imgPath) {
  const up = await api('uploads', { type: 'image' })
  const raw = await (await fetch(up.url, { method: 'POST', body: new Blob([fs.readFileSync(imgPath)]) })).json()
  return raw.token ? { type: 'image', payload: { token: raw.token } } : raw.photos ? raw : raw
}

if (process.argv[2] === 'chats') {
  // GET /chats выпилен из API: chat_id достаём из очереди событий /updates (бот должен быть добавлен в канал;
  // если пусто — напиши любое сообщение в канал и перезапусти)
  const u = await api('updates')
  const ids = new Map()
  for (const upd of u.updates || []) {
    const m = upd.message || upd.message_created || upd
    const chat = m?.recipient?.chat_id !== undefined ? { chat_id: m.recipient.chat_id, title: m.recipient.title || m.recipient.chat_type } : (upd.chat_id !== undefined ? { chat_id: upd.chat_id, title: upd.title || '' } : null)
    if (chat) ids.set(chat.chat_id, chat)
    else console.log(`событие без chat_id: ${JSON.stringify(upd).slice(0, 180)}`)
  }
  if (!ids.size) { console.log(`событий с chat_id нет (всего событий: ${(u.updates || []).length}) — напиши любое сообщение в канал и перезапусти`); process.exit(0) }
  for (const [id, c] of ids) console.log(`chat_id=${id} | ${c.title || ''}`)
  process.exit(0)
}
if (process.argv[2] === 'post') {
  const date = today()
  // свой контент: те же семена, что у TG, но сдвиг +100 → другие пары и другие шаблоны; исключаем ВК и TG
  const vkBank = readJson(path.join(ROOT, `out/${date}/content.json`), { vk: [] })
  const used = new Set([
    ...(vkBank.vk || []).map((p) => p.text.slice(0, 60)),
    ...log.posted.map((p) => p.text), // не только сегодняшние: старые тексты тоже не повторяем
  ])
  const { tgPosts } = await import('./gen.mjs')
  const pool = tgPosts(12, used, 100)
  const recentTopics = new Set(log.posted.slice(-12).map((p) => p.topic).filter(Boolean))
  const item = pool.find((p) => !recentTopics.has(p.topic)) ?? pool[0]
  if (!item) { console.log('MAX: пул пуст — пропускаю'); process.exit(0) }
  const text = item.text
  const tone = item.tone || 'funny'
  // картинка только по теме поста; нет такой — пост текстом (никаких случайных фото)
  // фото только новое (каждое один раз): по теме или из images/new; новых нет — пост текстом
  const usedImgs = new Set(log.posted.map((p) => p.image).filter(Boolean))
  const photosOn = readJson(path.join(ROOT, 'knowledge/post-settings.json'), {}).photos !== false
  const img = photosOn && pickTopicImage({ tag: item.tag, used: usedImgs, minSize: 50_000, inbox: [path.join(ROOT, 'images/new')], dirs: [path.join(ROOT, 'images/max', tone), path.join(ROOT, 'images', tone)] })
  const body = { text: text.slice(0, 3900) }
  let withPhoto = false
  if (img) {
    try { body.attachments = [await uploadImage(img)]; withPhoto = true } catch (e) { console.log(`картинка не встала (пост без неё): ${e.message}`) }
  }
  if (!CHAT) { console.log('MAX_CHAT_ID не задан — постить некуда'); process.exit(0) }
  await api('messages', { chat_id: CHAT }, body)
  log.count++
  log.posted.push({ day: date, type: withPhoto ? 'photo' : 'text', text: text.slice(0, 60), topic: item.topic, image: withPhoto ? path.basename(img) : null })
  if (log.posted.length > 200) log.posted = log.posted.slice(-100)
  writeJson(logPath, log)
  console.log(`MAX: отправлен ${withPhoto ? 'пост с картинкой' : 'текстовый пост'} (№${log.count})`)
} else {
  console.log('режим: post')
}
