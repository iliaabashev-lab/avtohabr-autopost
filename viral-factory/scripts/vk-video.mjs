// Ролики-истории в ВК от имени сообщества, по расписанию.
// 1) Пользовательский токен (VK_USER_TOKEN, админ сообщества, права video,wall,groups,offline) загружает файл
//    в «Видео» сообщества (video.save с group_id, без поста).
// 2) Ключ сообщества (VK_TOKEN) ставит отложенный пост с этим видео от имени сообщества (wall.post, from_group).
// Слоты: 09:30, 12:30, 15:30, 18:30, 21:30 МСК следующего свободного дня (state: knowledge/vk-video-schedule.json).
import fs from 'node:fs'
import path from 'node:path'
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..')
const GROUP = 242845245
const { VK_USER_TOKEN: UT, VK_TOKEN: GT } = process.env
if (!UT || !GT) { console.log('Нужны VK_USER_TOKEN и VK_TOKEN — пропускаю'); process.exit(0) }
const jobs = JSON.parse(fs.readFileSync('/tmp/story-jobs.json', 'utf8'))
const call = async (method, params, token) => {
  const r = await (await fetch(`https://api.vk.com/method/${method}`, { method: 'POST', body: new URLSearchParams({ ...params, access_token: token, v: '5.199' }) })).json()
  if (r.error) throw new Error(`${method}: ${r.error.error_msg}`)
  return r.response
}
const statePath = path.join(ROOT, 'knowledge/vk-video-schedule.json')
const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : { nextDay: null, slot: 0 }
const tomorrow = new Date(Date.now() + 3 * 3600e3 + 864e5).toISOString().slice(0, 10)
let day = state.nextDay && state.nextDay > tomorrow ? state.nextDay : tomorrow
let slot = state.nextDay === day ? state.slot : 0
const SLOTS = ['09:30', '12:30', '15:30', '18:30', '21:30']
for (const j of jobs) {
  const file = `/tmp/sv/${j.id}.mp4`
  if (!fs.existsSync(file)) continue
  const saved = await call('video.save', { group_id: GROUP, name: j.title, description: j.caption, wallpost: 0, no_comments: 0 }, UT)
  const fd = new FormData()
  fd.append('video_file', new Blob([fs.readFileSync(file)]), `${j.id}.mp4`)
  const up = await (await fetch(saved.upload_url, { method: 'POST', body: fd })).json()
  if (up.error) throw new Error(`upload: ${JSON.stringify(up.error)}`)
  const at = Math.floor(new Date(`${day}T${SLOTS[slot]}:00+03:00`).getTime() / 1000)
  const post = await call('wall.post', { owner_id: -GROUP, from_group: 1, message: j.caption, attachments: `video${saved.owner_id}_${saved.video_id}`, publish_date: at }, GT)
  console.log(`ВК: ${j.id} → видео ${saved.owner_id}_${saved.video_id}, пост ${post.post_id} на ${day} ${SLOTS[slot]} МСК`)
  slot++
  if (slot >= SLOTS.length) { slot = 0; day = new Date(new Date(`${day}T12:00:00Z`).getTime() + 864e5).toISOString().slice(0, 10) }
}
fs.writeFileSync(statePath, JSON.stringify({ nextDay: day, slot }, null, 1) + '\n')
