// Отказоустойчивый клиент Telegram Bot API.
// Поддерживает:
// - Экспоненциальный backoff при 429 (retry_after), 5xx и сетевых таймаутах
// - Таймауты запросов через AbortSignal.timeout
// - Корректное формирование multipart/form-data для фото и видео
// - Защиту от обрыва длинных подписей (лимит caption 1024 символа)

import fs from 'node:fs'
import path from 'node:path'
import { formatDualTime } from './timezone.mjs'

export class TelegramApiError extends Error {
  constructor(message, status = null, data = null) {
    super(message)
    this.name = 'TelegramApiError'
    this.status = status
    this.data = data
  }
}

export class TelegramClient {
  constructor(options = {}) {
    this.token = (options.token || process.env.TG_BOT_TOKEN || '').trim().replace(/^[\"']|[\"']$/g, '')
    let chat = (options.chatId || process.env.TG_CHAT_ID || '').trim().replace(/^[\"']|[\"']$/g, '')
    // Автоматическая нормализация chat_id:
    // 1. Если передана ссылка https://t.me/xxx -> превратить в @xxx
    chat = chat.replace(/^https?:\/\/t\.me\//i, '@').replace(/^t\.me\//i, '@')
    // 2. Если юзернейм канала указан без @ и это не числовой ID (не начинается с -):
    if (chat && !chat.startsWith('@') && !chat.startsWith('-') && !/^-?\d+$/.test(chat)) {
      chat = `@${chat}`
    }
    this.chatId = chat
    this.apiBase = options.apiBase || 'https://api.telegram.org'
    this.timeoutMs = options.timeoutMs || 30_000
    this.maxRetries = options.maxRetries || 3
  }

  /**
   * Проверить конфигурацию перед отправкой
   */
  validateConfig() {
    if (!this.token) {
      throw new TelegramApiError('TG_BOT_TOKEN не задан в переменных окружения или параметрах')
    }
    if (!this.chatId) {
      throw new TelegramApiError('TG_CHAT_ID не задан в переменных окружения или параметрах')
    }
  }

  /**
   * Выполнить HTTP-запрос к Telegram Bot API с повторами и экспоненциальной задержкой
   */
  async request(method, fields = {}) {
    this.validateConfig()

    const url = `${this.apiBase}/bot${this.token}/${method}`
    let lastError = null

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      const fd = new FormData()

      for (const [k, v] of Object.entries(fields)) {
        if (v == null) continue

        if (v && v.__file) {
          const blob = new Blob([v.data], { type: v.type || 'application/octet-stream' })
          fd.append(k, blob, v.name)
        } else {
          fd.append(k, String(v))
        }
      }

      try {
        const timeInfo = formatDualTime()
        console.log(`[TG Client] ${timeInfo.logString} Вызов ${method} (попытка ${attempt}/${this.maxRetries})...`)

        const response = await fetch(url, {
          method: 'POST',
          body: fd,
          signal: AbortSignal.timeout(this.timeoutMs),
        })

        const data = await response.json().catch(() => ({}))

        if (response.ok && data.ok) {
          return data.result
        }

        // Если Telegram вернул 429 Too Many Requests
        if (data.error_code === 429) {
          const retryAfterSec = data.parameters?.retry_after || 5
          const waitMs = (retryAfterSec + 1) * 1000
          console.warn(`[TG Client] Rate limit 429! Telegram просит подождать ${retryAfterSec}с. Засыпаю на ${waitMs}мс...`)
          await new Promise((r) => setTimeout(r, waitMs))
          continue
        }

        // Ошибки сервера Telegram (5xx)
        if (response.status >= 500) {
          lastError = new TelegramApiError(`Telegram 5xx Server Error (${response.status}): ${JSON.stringify(data)}`, response.status, data)
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10_000)
          console.warn(`[TG Client] Серверная ошибка Telegram. Повтор через ${delay}мс...`)
          await new Promise((r) => setTimeout(r, delay))
          continue
        }

        // Неисправимые ошибки клиента (400, 403, 404, 401)
        let hint = ''
        if (data.description && /chat not found/i.test(data.description)) {
          hint = ` 👉 ОШИБКА В TG_CHAT_ID (сейчас: "${this.chatId}"). Убедитесь, что логин канала написан правильно (например, @avtohabr_ru), либо для приватного канала указан числовой ID (-100...).`
        } else if (data.description && /bot is not a member|not an administrator|need administrator/i.test(data.description)) {
          hint = ` 👉 БОТ НЕ АДМИНИСТРАТОР КАНАЛА! Зайдите в Telegram -> Настройки канала -> Администраторы -> Добавьте бота и включите право "Публикация сообщений" (Post messages).`
        } else if (data.error_code === 401) {
          hint = ` 👉 НЕВЕРНЫЙ TG_BOT_TOKEN! Проверьте токен бота от @BotFather в GitHub Secrets.`
        }
        throw new TelegramApiError(
          `Telegram Bot API ошибка (${data.error_code || response.status}): ${data.description || JSON.stringify(data)}${hint}`,
          data.error_code || response.status,
          data
        )
      } catch (err) {
        if (err instanceof TelegramApiError && err.status && err.status < 500 && err.status !== 429) {
          // 4xx ошибки (неверный chat_id, chat not found и т.д.) не требуют повторов
          throw err
        }

        lastError = err
        const isTimeout = err.name === 'TimeoutError' || err.message?.includes('timeout')
        console.warn(`[TG Client] Сбой попытки ${attempt} (${isTimeout ? 'Таймаут' : err.message})`)

        if (attempt < this.maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1) + Math.random() * 500, 10_000)
          await new Promise((r) => setTimeout(r, delay))
        }
      }
    }

    throw lastError || new TelegramApiError(`Не удалось выполнить ${method} после ${this.maxRetries} попыток`)
  }

  /**
   * Отправить текстовое сообщение
   */
  async sendMessage(text, options = {}) {
    const chatId = options.chatId || this.chatId
    // Лимит Telegram для sendMessage — 4096 символов
    const safeText = text.slice(0, 4096)
    return await this.request('sendMessage', {
      chat_id: chatId,
      text: safeText,
      parse_mode: options.parseMode || undefined,
      disable_web_page_preview: options.disableWebPagePreview !== undefined ? options.disableWebPagePreview : true,
      link_preview_options: JSON.stringify({ is_disabled: true }),
    })
  }

  /**
   * Отправить фотографию с подписью
   */
  async sendPhoto(imagePath, caption = '', options = {}) {
    const chatId = options.chatId || this.chatId

    if (!fs.existsSync(imagePath)) {
      throw new TelegramApiError(`Файл фото не найден: ${imagePath}`)
    }

    const filename = path.basename(imagePath)
    const ext = path.extname(imagePath).toLowerCase()
    const mime = ext === '.png' ? 'image/png' : 'image/jpeg'
    const data = fs.readFileSync(imagePath)

    // Лимит подписи к фото в Telegram — 1024 символа
    let safeCaption = caption || ''
    let followUpText = null

    if (safeCaption.length > 1024) {
      // Аккуратно режем по концу абзаца или предложения
      const sliceIdx = safeCaption.lastIndexOf('\n', 1000)
      const cutPoint = sliceIdx > 500 ? sliceIdx : 1000
      followUpText = safeCaption.slice(cutPoint).trim()
      safeCaption = safeCaption.slice(0, cutPoint).trim()
    }

    const result = await this.request('sendPhoto', {
      chat_id: chatId,
      photo: { __file: true, data, name: filename, type: mime },
      caption: safeCaption,
      parse_mode: options.parseMode || undefined,
    })

    // Если был избыток текста, отправляем продолжение следом
    if (followUpText) {
      try {
        await this.sendMessage(followUpText, { chatId, parseMode: options.parseMode })
      } catch (e) {
        console.warn(`[TG Client] Предупреждение: не удалось отправить хвостовой текст подписи: ${e.message}`)
      }
    }

    return result
  }

  /**
   * Отправить видео
   */
  async sendVideo(videoPath, caption = '', options = {}) {
    const chatId = options.chatId || this.chatId

    if (!fs.existsSync(videoPath)) {
      throw new TelegramApiError(`Файл видео не найден: ${videoPath}`)
    }

    const filename = path.basename(videoPath)
    const data = fs.readFileSync(videoPath)

    return await this.request('sendVideo', {
      chat_id: chatId,
      video: { __file: true, data, name: filename, type: 'video/mp4' },
      caption: (caption || '').slice(0, 1024),
      supports_streaming: true,
    })
  }
}
