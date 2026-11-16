// Ежедневный ролик: берёт следующий сценарий из knowledge/video-scripts.json по кругу,
// пишет props для Remotion (FactoryShort) и подпись. Рендер и загрузка — шаги workflow.
//   node video.mjs pick     → out/video-props.json, out/video-meta.json
//   node video.mjs vk FILE  → загрузка в ВК (video.save), если ключ это позволяет
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, readJson, writeJson, today } from './lib.mjs'

const mode = process.argv[2]
if (mode === 'pick') {
  const scripts = readJson(path.join(ROOT, 'knowledge/video-scripts.json'))
  const logPath = path.join(ROOT, 'knowledge/video-log.json')
  const log = readJson(logPath, [])
  const s = scripts[log.length % scripts.length]
  writeJson(path.join(ROOT, 'out/video-props.json'), { hook: s.hook, beats: s.beats, cta: s.cta })
  const caption = `${s.title}\n\nAVTOHABR: онлайн-запись в автосервис. Сервисам 14 дней бесплатно, водителям запись бесплатно 👉 app.avtohabr.ru\n\n#автосервис #сто #онлайнзапись #avtohabr`
  writeJson(path.join(ROOT, 'out/video-meta.json'), { id: s.id, date: today(), title: s.title, caption })
  log.push({ date: today(), id: s.id })
  writeJson(logPath, log)
  console.log(`Ролик дня: ${s.id}`)
} else if (mode === 'vk') {
  const token = process.env.VK_TOKEN
  if (!token) { console.log('VK_TOKEN не задан'); process.exit(0) }
  const meta = readJson(path.join(ROOT, 'out/video-meta.json'))
  const body = new URLSearchParams({ group_id: '242845245', name: meta.title, description: meta.caption, wallpost: '0', access_token: token, v: '5.199' })
  const r = await (await fetch('https://api.vk.com/method/video.save', { method: 'POST', body })).json()
  if (r.error) { console.log(`ВК не принял видео этим ключом: ${r.error.error_msg}`); process.exit(0) }
  const fd = new FormData()
  fd.append('video_file', new Blob([fs.readFileSync(process.argv[3])]), 'short.mp4')
  const up = await (await fetch(r.response.upload_url, { method: 'POST', body: fd })).json()
  console.log(`ВК видео загружено: ${JSON.stringify(up).slice(0, 200)}`)
}
