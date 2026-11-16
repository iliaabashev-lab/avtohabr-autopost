// Автовыкладка Shorts в YouTube: node youtube-upload.mjs <папка с mp4> <jobs.json> [лимит]
// Вызывается из workflow story-джобы: node scripts/youtube-upload.mjs /tmp/sv /tmp/story-jobs.json
// Ключи: секреты YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN (одноразовая настройка — см. oauth-setup.mjs).
// Квота YouTube Data API бесплатна: 10 000 юнитов/день, загрузка ролика = 1 600 → до 6 роликов в день.
// ВАЖНО: пока проект API не пройдёт бесплатный аудит Google, ролики будут «locked as private».
import fs from 'node:fs'
import path from 'node:path'
import { ROOT } from './lib.mjs'

const dir = process.argv[2], jobsFile = process.argv[3]
const limit = Number(process.argv[4] || 5)
const CLIENT_ID = process.env.YT_CLIENT_ID, CLIENT_SECRET = process.env.YT_CLIENT_SECRET, REFRESH = process.env.YT_REFRESH_TOKEN
const PRIVACY = process.env.YT_PRIVACY || 'public' // до прохождения аудита ставь 'private', чтобы не терять квоту
const logPath = path.join(ROOT, 'knowledge/youtube-log.json')
const log = fs.existsSync(logPath) ? JSON.parse(fs.readFileSync(logPath, 'utf8')) : []

if (!fs.existsSync(dir) || !fs.existsSync(jobsFile)) { console.log('нет файлов для выкладки'); process.exit(0) }
if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH) { console.log('секреты YT_* не заданы — автовыкладка пропущена'); process.exit(0) }

const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf8'))
  .filter((j) => fs.existsSync(path.join(dir, `${j.id}.mp4`)))
  .slice(0, limit)
if (!jobs.length) { console.log('нет новых роликов'); process.exit(0) }

async function accessToken() {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token: REFRESH, grant_type: 'refresh_token' }),
  })
  const d = await r.json()
  if (!d.access_token) throw new Error(`oauth refresh: ${JSON.stringify(d).slice(0, 200)}`)
  return d.access_token
}

const at = await accessToken()
for (const j of jobs) {
  const file = path.join(dir, `${j.id}.mp4`)
  const buf = fs.readFileSync(file)
  const title = `${j.title} #shorts`.slice(0, 100)
  const meta = {
    snippet: { title, description: j.caption, categoryId: '2' }, // 2 = Autos & Vehicles
    status: { privacyStatus: PRIVACY, selfDeclaredMadeForKids: false },
  }
  try {
    // 1) инициализация resumable-загрузки
    const init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${at}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': String(buf.length),
        'X-Upload-Content-Type': 'video/mp4',
      },
      body: JSON.stringify(meta),
    })
    if (!init.ok) throw new Error(`init ${init.status}: ${(await init.text()).slice(0, 200)}`)
    const loc = init.headers.get('location')
    // 2) отправка файла
    const up = await fetch(loc, { method: 'PUT', headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(buf.length) }, body: buf })
    const d = await up.json()
    if (!up.ok) throw new Error(`upload ${up.status}: ${JSON.stringify(d).slice(0, 200)}`)
    console.log(`${j.id} → https://youtu.be/${d.id} (${PRIVACY})`)
    log.push({ id: j.id, videoId: d.id, date: new Date().toISOString().slice(0, 10), privacy: PRIVACY })
  } catch (e) {
    console.log(`${j.id}: ошибка ${String(e.message || e).slice(0, 300)}`)
    // исчерпание квоты (403 quotaExceeded) — дальше пробовать бессмысленно
    if (String(e).includes('quotaExceeded')) break
  }
}
fs.mkdirSync(path.dirname(logPath), { recursive: true })
fs.writeFileSync(logPath, JSON.stringify(log, null, 1) + '\n')
