// Основной модуль оркестрации публикаций Telegram Publisher.
// Связывает:
// - Timezone (Europe/Moscow UTC+3)
// - Queue (pending -> publishing -> published / failed)
// - ImageMatcher (детерминированная привязка и проверка файлов)
// - TelegramClient (запросы к API, retry с exponential backoff, таймауты)

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { TelegramClient, TelegramApiError } from './telegram-client.mjs'
import { TelegramPublicationQueue, STATUS, generatePostId } from './queue.mjs'
import { validateImage, createPostImageBinding } from './image-matcher.mjs'
import { pickTopicImage } from './topic-image.mjs'
import { formatDualTime, getMskDateString, mskToUtcDate, checkPublicationWindow, nowUtcIso } from './timezone.mjs'

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(CURRENT_DIR, '../..')

export class PublisherOrchestrator {
  constructor(options = {}) {
    this.rootDir = options.rootDir || ROOT
    // knowledge/post-settings.json → photos: false — всегда текст; иначе фото, только если есть новое (каждое один раз)
    try { this.photos = JSON.parse(fs.readFileSync(path.join(this.rootDir, 'knowledge/post-settings.json'), 'utf8')).photos !== false } catch { this.photos = true }
    if (options.photos !== undefined) this.photos = options.photos
    this.queuePath = options.queuePath || path.join(this.rootDir, 'knowledge/tg-queue.json')
    this.logPath = options.logPath || path.join(this.rootDir, 'knowledge/tg-posted.json')

    this.queue = new TelegramPublicationQueue(this.queuePath, this.logPath)
    this.client = options.client || new TelegramClient({
      token: options.token,
      chatId: options.chatId,
      timeoutMs: options.timeoutMs || 30_000,
      maxRetries: options.maxRetries || 3,
    })
  }

  /**
   * Найти подходящее валидное изображение по теме и смыслу поста
   * @param {Object} post - Объект поста (tone, tag, topic, title, text)
   * @returns {string|null} Путь к подходящему валидному файлу изображения
   */
  findImageForPost(post = {}) {
    if (!this.photos) return null
    // новое фото по теме или из images/new; уже выходившие фото не повторяем. Новых нет — пост текстом.
    const tone = post.tone || 'funny'
    const used = new Set(this.queue.history.map((h) => path.basename(String(h.image_path || '').replace(/\\/g, '/'))).filter(Boolean))
    const picked = pickTopicImage({
      tag: post.tag,
      used,
      inbox: [path.join(this.rootDir, 'images', 'new')],
      dirs: [
        path.join(this.rootDir, 'images', 'telegram', tone),
        path.join(this.rootDir, 'images', tone),
        path.join(this.rootDir, '..', 'ai-images', tone),
        path.join(this.rootDir, 'ai-images', tone),
      ],
    })
    if (picked && validateImage(picked, this.rootDir).valid) {
      console.log(`[Publisher] Новое фото для поста: ${path.basename(picked)}`)
      return picked
    }
    console.log(`[Publisher] Новых фото нет — пост уйдёт текстом`)
    return null
  }

  /**
   * Обратная совместимость для вызова по одному тону
   */
  findValidImageForTone(tone = 'funny') {
    return this.findImageForPost({ tone })
  }

  /**
   * Заполнить очередь постами на день, если очередь пуста
   */
  async ensureDaySchedule(dateStr = getMskDateString()) {
    if (this.queue.queue.length > 0) {
      return this.queue.queue
    }

    console.log(`[Publisher] Очередь пуста. Генерирую расписание постов на ${dateStr} (МСК)...`)

    // Импортируем генератор постов
    const { tgPosts } = await import('../gen.mjs')
    const vkBankPath = path.join(this.rootDir, `out/${dateStr}/content.json`)
    let vkStarts = new Set()
    if (fs.existsSync(vkBankPath)) {
      try {
        const vkBank = JSON.parse(fs.readFileSync(vkBankPath, 'utf8'))
        vkStarts = new Set((vkBank.vk || []).map((p) => p.text.slice(0, 60)))
      } catch (e) {
        // fallback to empty set
      }
    }

    // Слоты публикации по Москве: 09:00, 13:00, 17:00
    const mskSlots = [
      { hour: 9, minute: 0 },
      { hour: 13, minute: 0 },
      { hour: 17, minute: 0 },
    ]

    // не повторяем: ни тексты, что уже выходили, ни темы последних дней
    const history = this.queue.history
    const used = new Set([...vkStarts, ...history.map((h) => String(h.text_preview || '').slice(0, 60))])
    const recentTopics = new Set(history.slice(-12).map((h) => h.topic).filter(Boolean))
    const pool = tgPosts(mskSlots.length * 6, used)
    const fresh = pool.filter((p) => !recentTopics.has(p.topic))
    const posts = []
    for (const p of [...fresh, ...pool]) {
      if (posts.length >= mskSlots.length) break
      if (!posts.includes(p) && !posts.some((x) => x.topic === p.topic)) posts.push(p)
    }
    const enqueued = []

    for (let i = 0; i < mskSlots.length; i++) {
      const item = posts[i]
      if (!item) continue

      const slot = mskSlots[i]
      const scheduledUtc = mskToUtcDate(dateStr, slot.hour, slot.minute).toISOString()
      const tone = item.tone || (i % 2 === 0 ? 'serious' : 'funny')
      const postId = generatePostId(`tg_${dateStr.replace(/-/g, '')}`)

      // фото выбирается в момент публикации: так одно новое фото не достанется двум постам,
      // а фото, добавленные в течение дня, попадут в ближайший пост
      const imagePath = null

      const binding = createPostImageBinding(postId, imagePath, this.rootDir, true)

      let entry
      try {
        entry = this.queue.enqueue({
        post_id: postId,
        text: item.text,
        tone,
        tag: item.tag,
        topic: item.topic,
        image_id: binding.image_id,
        image_path: binding.image_path,
        allow_text_fallback: true,
        scheduled_at: scheduledUtc,
        })
      } catch (e) {
        console.log(`[Publisher] Пропуск: ${e.message}`) // дубль — берём следующий день без падения
        continue
      }

      enqueued.push(entry)
    }

    console.log(`[Publisher] Сформировано и добавлено в очередь ${enqueued.length} постов на ${dateStr}`)
    return enqueued
  }

  /**
   * Опубликовать следующий готовый пост из очереди
   * @param {Object} [options]
   * @param {boolean} [options.dryRun=false] - режим проверки без фактической отправки
   * @param {boolean} [options.force=false] - игнорировать проверку временного окна
   * @returns {Promise<Object>} Результат публикации
   */
  async publishNext(options = {}) {
    const dryRun = !!options.dryRun
    const force = !!options.force
    const timeInfo = formatDualTime()

    console.log(`[Publisher] ${timeInfo.logString} Запуск проверки очереди публикаций...`)

    // Убеждаемся, что в очереди есть посты
    await this.ensureDaySchedule()

    const post = this.queue.getNextDuePost({ retryFailed: true })
    if (!post) {
      if (force) {
        const anyFailed = this.queue.queue.find((p) => p.status === STATUS.FAILED)
        if (anyFailed) {
          console.log(`[Publisher] Сброс статуса failed у поста ${anyFailed.post_id} для принудительного повтора...`)
          this.queue.retryPost(anyFailed.post_id)
          return this.publishNext(options)
        }
      }
      console.log(`[Publisher] Нет постов, готовых к публикации в данный момент.`)
      return { success: true, published: false, reason: 'Очередь пуста или время публикации ещё не наступило' }
    }

    if (!force) {
      const windowCheck = checkPublicationWindow(post.scheduled_at)
      if (!windowCheck.isDue) {
        console.log(`[Publisher] Пост ${post.post_id}: ${windowCheck.reason}`)
        return { success: true, published: false, reason: windowCheck.reason, post_id: post.post_id }
      }
    }

    console.log(`[Publisher] Выбран пост для публикации: ID=${post.post_id}, Tone=${post.tone}, Плановое время=${post.scheduled_at}`)

    // Проверяем валидность прикрепленного изображения
    let sendWithPhoto = false
    let imageToSend = null

    // Проверяем наличие индивидуального фото, сгенерированного под данный post_id
    const directPhoto = path.join(this.rootDir, 'images/telegram', post.tone, `${post.post_id}.jpg`)
    if (!this.photos) { post.image_path = null; post.image_id = null; console.log('[Publisher] Фото выключены (post-settings.json) — пост уйдёт текстом') }
    else if (fs.existsSync(directPhoto) && fs.statSync(directPhoto).size > 50000) {
      post.image_path = directPhoto
      post.image_id = `${post.post_id}.jpg`
      console.log(`[Publisher] Найдено индивидуальное фото для поста ${post.post_id}: ${directPhoto}`)
    }

    // Динамический поиск фото, если не было привязано заранее и пост не заявлен как чисто текстовый
    const fileName = (p) => path.basename(String(p || '').split('\\').join('/'))
    const usedNames = new Set(this.queue.history.map((h) => fileName(h.image_path)).filter(Boolean))
    if (post.image_path && usedNames.has(fileName(post.image_path))) post.image_path = null // это фото уже выходило
    if (this.photos && !post.image_path && post.type !== 'text' && !post.no_image) {
      const dynamicImage = this.findImageForPost(post)
      if (dynamicImage) {
        post.image_path = dynamicImage
        post.image_id = path.basename(dynamicImage)
        console.log(`[Publisher] Динамически привязано изображение: ${dynamicImage}`)
      }
    }

    if (post.image_path) {
      const imageValidation = validateImage(post.image_path, this.rootDir)
      if (imageValidation.valid) {
        sendWithPhoto = true
        imageToSend = imageValidation.path
      } else {
        console.warn(`[Publisher] Предупреждение: изображение ${post.image_path} не прошло валидацию: ${imageValidation.error}`)
        if (post.allow_text_fallback) {
          console.log(`[Publisher] Активирован fallback: публикация текста без фото.`)
          sendWithPhoto = false
        } else {
          const errMsg = `Публикация отменена: фото недоступно (${imageValidation.error}), а allow_text_fallback=false`
          this.queue.markFailed(post.post_id, errMsg)
          return { success: false, published: false, post_id: post.post_id, error: errMsg }
        }
      }
    }

    if (!sendWithPhoto) post.image_path = null // в журнал — то, что реально ушло

    if (dryRun) {
      console.log(`[Publisher] [DRY RUN] Пост готов к отправке (тип: ${sendWithPhoto ? 'ФОТО+ТЕКСТ' : 'ТЕКСТ'}):`)
      console.log(`----------------------------------------`)
      console.log(post.text)
      console.log(`----------------------------------------`)
      return { success: true, published: false, dryRun: true, post_id: post.post_id }
    }

    // Начинаем отправку
    this.queue.markPublishing(post.post_id)

    try {
      let apiResult

      if (sendWithPhoto && imageToSend) {
        apiResult = await this.client.sendPhoto(imageToSend, post.text)
      } else {
        apiResult = await this.client.sendMessage(post.text)
      }

      if (!apiResult || !apiResult.message_id) {
        throw new TelegramApiError(`Telegram не вернул message_id: ${JSON.stringify(apiResult)}`)
      }

      // Отмечаем успешную публикацию строго после ответа Telegram API
      this.queue.markPublished(post.post_id, apiResult.message_id)

      console.log(`[Publisher] ✅ УСПЕШНО ОПУБЛИКОВАНО: ID=${post.post_id}, Telegram message_id=${apiResult.message_id}`)
      return {
        success: true,
        published: true,
        post_id: post.post_id,
        telegram_message_id: apiResult.message_id,
        published_at: nowUtcIso(),
      }
    } catch (err) {
      const errMsg = err.message || String(err)
      console.error(`[Publisher] ❌ ОШИБКА ПУБЛИКАЦИИ: ${errMsg}`)
      const inQueue = this.queue.queue.some((p) => p.post_id === post.post_id)
      if (inQueue) {
        this.queue.markFailed(post.post_id, errMsg)
      }
      return {
        success: false,
        published: false,
        post_id: post.post_id,
        error: errMsg,
      }
    }
  }

  /**
   * Получить статус очереди и последние логи
   */
  getStatus() {
    return {
      time: formatDualTime(),
      queueLength: this.queue.queue.length,
      queue: this.queue.queue,
      historyLength: this.queue.history.length,
      recentHistory: this.queue.history.slice(-5),
    }
  }
}
