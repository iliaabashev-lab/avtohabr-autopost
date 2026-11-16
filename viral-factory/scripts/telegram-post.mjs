// Автопостинг в Telegram-канал (Bot API) с полной защитой от сбоев:
// - Строгое соблюдение Московского времени (Europe/Moscow, UTC+3)
// - Очередь публикаций со статусами (pending, scheduled, publishing, published, failed)
// - Детерминированная валидация и привязка фото (post_id -> image_id -> image_path)
// - Повторные попытки с экспоненциальной задержкой (Exponential Backoff)
// - Защита от дублей и подтверждение после получения message_id
//
// Режимы запуска:
//   node telegram-post.mjs post                      — штатная публикация из очереди (вызывается кроном 3 раза в день)
//   node telegram-post.mjs force-post                — немедленная публикация следующего поста без проверки временного окна
//   node telegram-post.mjs dry-run                   — симуляция публикации без обращения к реальному API
//   node telegram-post.mjs status                    — состояние очереди, московское время и статистика
//   node telegram-post.mjs enqueue                   — генерация и добавление постов в очередь на сегодня
//   node telegram-post.mjs retry <post_id>           — сбросить ошибку поста и перевести в pending
//   node telegram-post.mjs videos <dir> <jobs.json>  — отправить готовые mp4 историй с их caption

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PublisherOrchestrator } from './publisher/publisher.mjs'
import { formatDualTime } from './publisher/timezone.mjs'

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(CURRENT_DIR, '..')

const TOKEN = process.env.TG_BOT_TOKEN
const CHAT = process.env.TG_CHAT_ID

const orchestrator = new PublisherOrchestrator({
  rootDir: ROOT,
  token: TOKEN,
  chatId: CHAT,
})

const mode = process.argv[2] || 'post'

async function main() {
  const timeInfo = formatDualTime()

  if (mode === 'status') {
    const status = orchestrator.getStatus()
    console.log(`========================================`)
    console.log(`📊 TELEGRAM PUBLISHER STATUS`)
    console.log(`⏰ Время: ${timeInfo.logString}`)
    console.log(`🔑 TG_BOT_TOKEN: ${TOKEN ? '✅ задан' : '❌ НЕ ЗАДАН'}`)
    console.log(`📢 TG_CHAT_ID: ${CHAT ? `✅ задан (${CHAT})` : '❌ НЕ ЗАДАН'}`)
    console.log(`📬 Постов в очереди: ${status.queueLength}`)
    console.log(`📜 Всего опубликовано: ${status.historyLength}`)
    if (status.queue.length > 0) {
      console.log(`\nБлижайшие посты в очереди:`)
      for (const p of status.queue.slice(0, 5)) {
        console.log(`  - [${p.status.toUpperCase()}] ID: ${p.post_id} | План: ${p.scheduled_at} | Тон: ${p.tone} | Фото: ${p.image_path || 'нет'}`)
      }
    }
    console.log(`========================================`)
    process.exit(0)
  }

  if (mode === 'enqueue') {
    const list = await orchestrator.ensureDaySchedule()
    console.log(`✅ В очереди ${list.length} постов на сегодня.`)
    process.exit(0)
  }

  if (mode === 'retry') {
    const postId = process.argv[3]
    if (!postId) {
      console.error('Ошибка: укажите post_id для повтора (node telegram-post.mjs retry <post_id>)')
      process.exit(1)
    }
    orchestrator.queue.retryPost(postId)
    console.log(`✅ Пост ${postId} переведён в статус pending для повторной отправки.`)
    process.exit(0)
  }

  if (mode === 'dry-run') {
    const res = await orchestrator.publishNext({ dryRun: true, force: true })
    console.log('Результат проверки (Dry Run):', res)
    process.exit(res.success ? 0 : 1)
  }

  if (mode === 'post' || mode === 'force-post') {
    if (!TOKEN || !CHAT) {
      console.warn(`[TG Publisher] ${timeInfo.logString} ВНИМАНИЕ: TG_BOT_TOKEN или TG_CHAT_ID не заданы в переменных окружения.`)
      console.warn(`[TG Publisher] Для корректной публикации добавьте секреты TG_BOT_TOKEN и TG_CHAT_ID в GitHub Secrets или локальный .env файл.`)
      // Выходим с кодом 0, чтобы не блокировать общий конвейер при первичном развертывании
      process.exit(0)
    }

    const force = mode === 'force-post'
    const res = await orchestrator.publishNext({ force })

    if (!res.success) {
      console.error(`[TG Publisher] ❌ Ошибка выполнения публикации: ${res.error}`)
      process.exit(1)
    }

    process.exit(0)
  }

  if (mode === 'videos') {
    if (!TOKEN || !CHAT) {
      console.log('TG_BOT_TOKEN/TG_CHAT_ID не заданы — отправку видео пропускаю')
      process.exit(0)
    }

    const dir = process.argv[3]
    const jobsFile = process.argv[4]

    if (!dir || !jobsFile || !fs.existsSync(dir) || !fs.existsSync(jobsFile)) {
      console.log('Нет видео или файла задач для Telegram')
      process.exit(0)
    }

    const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf8'))
    // журнал роликов отдельный (knowledge/tg-videos.json): его пишет только конвейер историй,
    // поэтому он не конфликтует с журналом текстовых постов и каждый ролик уходит в канал один раз
    const videoLog = path.join(ROOT, 'knowledge/tg-videos.json')
    const sent = fs.existsSync(videoLog) ? JSON.parse(fs.readFileSync(videoLog, 'utf8')) : { sent: [] }
    const used = new Set([...sent.sent.map((v) => String(v.id)), ...orchestrator.queue.history.filter((p) => String(p.text_preview || '').startsWith('video:')).map((p) => p.text_preview.slice(6))])

    const readyJobs = jobs.filter((j) => fs.existsSync(path.join(dir, `${j.id}.mp4`)) && !used.has(String(j.id)))
    console.log(`[TG Publisher] Новых видео для Telegram: ${readyJobs.length} (уже были: ${jobs.length - readyJobs.length})`)

    for (const j of readyJobs) {
      const videoPath = path.join(dir, `${j.id}.mp4`)
      const caption = [j.title, '', j.caption].join('\n').slice(0, 1024)
      try {
        const msg = await orchestrator.client.sendVideo(videoPath, caption)
        sent.sent.push({ id: String(j.id), telegram_message_id: msg.message_id, sent_at: new Date().toISOString() })
        fs.writeFileSync(videoLog, JSON.stringify(sent, null, 1) + '\n')
        console.log(`[TG Publisher] ✅ Видео ${j.id} отправлено (message_id=${msg.message_id})`)
      } catch (err) {
        console.error(`[TG Publisher] ❌ Ошибка отправки видео ${j.id}: ${err.message}`)
      }
    }

    process.exit(0)
  }

  console.log('Доступные команды: post | force-post | status | enqueue | dry-run | retry <post_id> | videos <dir> <jobs.json>')
}

main().catch((err) => {
  console.error(`[TG Publisher Fatal Error]:`, err)
  process.exit(1)
})
