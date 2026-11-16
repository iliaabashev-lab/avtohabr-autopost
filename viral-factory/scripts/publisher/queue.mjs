// Модуль очереди публикаций Telegram.
// Обеспечивает:
// - Уникальный post_id
// - Статусы: pending, scheduled, publishing, published, failed
// - Защиту от дублирования (идемпотентность)
// - Логирование попыток и ошибок
// - Сохранение message_id и published_at только после ответа Telegram API

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { formatDualTime, nowUtcIso, getMskParts } from './timezone.mjs'

export const STATUS = {
  PENDING: 'pending',
  SCHEDULED: 'scheduled',
  PUBLISHING: 'publishing',
  PUBLISHED: 'published',
  FAILED: 'failed',
}

/**
 * Создать уникальный идентификатор публикации
 */
export function generatePostId(prefix = 'tg') {
  const d = new Date()
  const p = getMskParts(d)
  const rand = crypto.randomBytes(3).toString('hex')
  return `${prefix}_${p.year}${p.month}${p.day}_${p.hour}${p.minute}${p.second}_${rand}`
}

/**
 * Вычислить хеш содержимого для защиты от случайного дублирования текста
 */
export function computeContentHash(text) {
  return crypto.createHash('sha256').update((text || '').trim()).digest('hex').slice(0, 16)
}

/**
 * Класс очереди публикаций Telegram
 */
export class TelegramPublicationQueue {
  constructor(queueFilePath, logFilePath) {
    this.queueFilePath = queueFilePath
    this.logFilePath = logFilePath
    this.queue = []
    this.history = []
    this.load()
  }

  /**
   * Загрузить состояние очереди и журнала с диска
   */
  load() {
    try {
      if (fs.existsSync(this.queueFilePath)) {
        const raw = fs.readFileSync(this.queueFilePath, 'utf8')
        this.queue = JSON.parse(raw)
      } else {
        this.queue = []
      }
    } catch (e) {
      console.warn(`[Queue] Ошибка чтения файла очереди ${this.queueFilePath}: ${e.message}. Инициализирую пустую очередь.`)
      this.queue = []
    }

    try {
      if (fs.existsSync(this.logFilePath)) {
        const raw = fs.readFileSync(this.logFilePath, 'utf8')
        const data = JSON.parse(raw)
        this.history = Array.isArray(data) ? data : (data.posted || [])
      } else {
        this.history = []
      }
    } catch (e) {
      console.warn(`[Queue] Ошибка чтения журнала ${this.logFilePath}: ${e.message}. Инициализирую пустой журнал.`)
      this.history = []
    }
  }

  /**
   * Сохранить состояние на диск (атомарно через временный файл)
   */
  save() {
    const queueDir = path.dirname(this.queueFilePath)
    fs.mkdirSync(queueDir, { recursive: true })

    const tmpQueue = `${this.queueFilePath}.${Date.now()}.tmp`
    fs.writeFileSync(tmpQueue, JSON.stringify(this.queue, null, 2) + '\n', 'utf8')
    fs.renameSync(tmpQueue, this.queueFilePath)

    const logDir = path.dirname(this.logFilePath)
    fs.mkdirSync(logDir, { recursive: true })

    const logData = {
      count: this.history.length,
      updated_at: nowUtcIso(),
      posted: this.history,
    }
    const tmpLog = `${this.logFilePath}.${Date.now()}.tmp`
    fs.writeFileSync(tmpLog, JSON.stringify(logData, null, 2) + '\n', 'utf8')
    fs.renameSync(tmpLog, this.logFilePath)
  }

  /**
   * Добавить публикацию в очередь
   * @param {Object} item
   * @returns {Object} Созданная запись
   */
  enqueue(item) {
    const postId = item.post_id || generatePostId()
    const contentHash = computeContentHash(item.text)

    // Защита от дублей: проверяем, нет ли уже такого текста в очереди или среди опубликованных
    const alreadyInQueue = this.queue.some(
      (p) => p.post_id === postId || (p.content_hash === contentHash && p.status !== STATUS.FAILED)
    )
    if (alreadyInQueue) {
      throw new Error(`[Queue] Дублирование: пост с id=${postId} или аналогичным текстом уже находится в очереди`)
    }

    const alreadyPublished = this.history.some(
      (h) => h.post_id === postId || h.content_hash === contentHash
    )
    if (alreadyPublished) {
      throw new Error(`[Queue] Дублирование: пост с id=${postId} или аналогичным текстом уже был опубликован`)
    }

    const entry = {
      post_id: postId,
      content_type: 'telegram',
      content_hash: contentHash,
      text: item.text,
      tone: item.tone || 'funny',
      tag: item.tag || null,
      topic: item.topic || null,
      image_id: item.image_id || null,
      image_path: item.image_path || null,
      no_image: !!item.no_image,
      allow_text_fallback: !!item.allow_text_fallback,
      scheduled_at: item.scheduled_at || nowUtcIso(),
      timezone: 'Europe/Moscow',
      status: STATUS.PENDING,
      created_at: nowUtcIso(),
      attempts: 0,
      max_attempts: item.max_attempts || 3,
      last_error: null,
      telegram_message_id: null,
      published_at: null,
    }

    this.queue.push(entry)
    this.save()
    return entry
  }

  /**
   * Получить следующий пост, готовый к публикации
   * @param {Object} [options]
   * @param {boolean} [options.retryFailed=false] - брать ли также посты в статусе failed, у которых attempts < max_attempts
   * @returns {Object|null}
   */
  getNextDuePost(options = {}) {
    const now = new Date().getTime()
    const retryFailed = !!options.retryFailed

    // Сначала ищем посты в статусе pending или scheduled
    const pendingPost = this.queue.find((post) => {
      if (post.status === STATUS.PENDING || post.status === STATUS.SCHEDULED) {
        const schedTime = new Date(post.scheduled_at).getTime()
        return schedTime <= now + 60_000
      }
      return false
    })
    if (pendingPost) return pendingPost

    // Если нет pending постов, проверяем посты в статусе failed, у которых остались попытки
    if (retryFailed) {
      return this.queue.find((post) => {
        return post.status === STATUS.FAILED && post.attempts < post.max_attempts
      }) || null
    }

    return null
  }

  /**
   * Отметить начало публикации
   */
  markPublishing(postId) {
    const post = this.queue.find((p) => p.post_id === postId)
    if (!post) throw new Error(`[Queue] Пост ${postId} не найден в очереди`)
    post.status = STATUS.PUBLISHING
    post.attempts += 1
    post.last_attempt_at = nowUtcIso()
    this.save()
  }

  /**
   * Зафиксировать успешную публикацию (строго после получения message_id от Telegram)
   */
  markPublished(postId, telegramMessageId) {
    const idx = this.queue.findIndex((p) => p.post_id === postId)
    if (idx === -1) throw new Error(`[Queue] Пост ${postId} не найден в очереди`)

    const post = this.queue[idx]
    post.status = STATUS.PUBLISHED
    post.telegram_message_id = telegramMessageId
    post.published_at = nowUtcIso()
    post.last_error = null

    // Добавляем в журнал опубликованных
    this.history.push({
      post_id: post.post_id,
      telegram_message_id: post.telegram_message_id,
      content_hash: post.content_hash,
      type: post.image_path ? 'photo' : 'text',
      text_preview: post.text.slice(0, 80),
      topic: post.topic || null,
      image_path: post.image_path,
      published_at: post.published_at,
      timing: formatDualTime(post.published_at),
    })

    // Ограничиваем историю 500 записями
    if (this.history.length > 500) {
      this.history = this.history.slice(-500)
    }

    // Удаляем из активной очереди
    this.queue.splice(idx, 1)
    this.save()
  }

  /**
   * Зафиксировать ошибку публикации
   */
  markFailed(postId, errorMessage) {
    const post = this.queue.find((p) => p.post_id === postId)
    if (!post) throw new Error(`[Queue] Пост ${postId} не найден в очереди`)

    post.status = STATUS.FAILED
    post.last_error = errorMessage
    this.save()
  }

  /**
   * Перевести пост обратно в pending для повторной обработки
   */
  retryPost(postId) {
    const post = this.queue.find((p) => p.post_id === postId)
    if (!post) throw new Error(`[Queue] Пост ${postId} не найден в очереди`)
    post.status = STATUS.PENDING
    post.last_error = null
    this.save()
  }
}
