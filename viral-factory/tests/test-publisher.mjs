// Тест 5: Сквозное тестирование Publisher с MOCK Telegram API
import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PublisherOrchestrator } from '../scripts/publisher/publisher.mjs'
import { TelegramClient } from '../scripts/publisher/telegram-client.mjs'

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(CURRENT_DIR, '..')

console.log('--- ТЕСТ: Mock-тестирование Publisher и Telegram API ---')

const tmpDir = path.join(ROOT, 'tests/tmp_pub')
fs.rmSync(tmpDir, { recursive: true, force: true })
fs.mkdirSync(tmpDir, { recursive: true })
const testQueueFile = path.join(tmpDir, 'tg_queue.json')
const testLogFile = path.join(tmpDir, 'tg_posted.json')

// Создаем тестовое изображение
const testPhotoPath = path.join(tmpDir, 'sample_photo.jpg')
fs.writeFileSync(testPhotoPath, Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]))

// 1. Создаем Mock Telegram Client
class MockTelegramClient extends TelegramClient {
  constructor(behavior = {}) {
    super({ token: 'mock_token', chatId: '@mock_chat', maxRetries: 3, timeoutMs: 1000 })
    this.behavior = behavior
    this.sentCalls = []
    this.attemptCount = 0
  }

  async sendMessage(text, options) {
    this.attemptCount++
    this.sentCalls.push({ type: 'sendMessage', text, options })

    if (this.behavior.failAlways) {
      throw new Error('Mock Telegram API 502 Bad Gateway')
    }
    if (this.behavior.failOnce && this.attemptCount === 1) {
      throw new Error('Mock Network Connection Reset')
    }

    return { message_id: 100000 + this.sentCalls.length }
  }

  async sendPhoto(photoPath, caption, options) {
    this.attemptCount++
    this.sentCalls.push({ type: 'sendPhoto', photoPath, caption, options })

    if (this.behavior.failAlways) {
      throw new Error('Mock Telegram API 500 Internal Server Error')
    }

    return { message_id: 200000 + this.sentCalls.length }
  }
}

// ----------------------------------------------------
// ТЕСТ 1.1: Успешная публикация текстового поста
// ----------------------------------------------------
const mockClient1 = new MockTelegramClient()
const orchestrator1 = new PublisherOrchestrator({
  rootDir: ROOT,
  photos: true, // механизм фото проверяется независимо от knowledge/post-settings.json
  queuePath: testQueueFile,
  logPath: testLogFile,
  client: mockClient1,
})

orchestrator1.queue.enqueue({
  post_id: 'tg_test_text_only',
  text: 'Текст для проверки успешной отправки',
  tone: 'serious',
  type: 'text',
  no_image: true,
})

const res1 = await orchestrator1.publishNext({ force: true })
assert.strictEqual(res1.success, true)
assert.strictEqual(res1.published, true)
assert.strictEqual(res1.telegram_message_id, 100001)
assert.strictEqual(mockClient1.sentCalls.length, 1)
assert.strictEqual(mockClient1.sentCalls[0].type, 'sendMessage')
console.log('  ✅ Текстовый пост успешно отправлен и подтвержден message_id')

// ----------------------------------------------------
// ТЕСТ 1.2: Успешная публикация поста с валидным фото
// ----------------------------------------------------
const mockClient2 = new MockTelegramClient()
const orchestrator2 = new PublisherOrchestrator({
  rootDir: ROOT,
  photos: true, // механизм фото проверяется независимо от knowledge/post-settings.json
  queuePath: testQueueFile,
  logPath: testLogFile,
  client: mockClient2,
})

orchestrator2.queue.enqueue({
  post_id: 'tg_test_photo',
  text: 'Пост с фотографией',
  tone: 'funny',
  image_path: testPhotoPath,
  allow_text_fallback: false,
})

const res2 = await orchestrator2.publishNext({ force: true })
assert.strictEqual(res2.success, true)
assert.strictEqual(res2.published, true)
assert.strictEqual(mockClient2.sentCalls[0].type, 'sendPhoto')
assert.strictEqual(res2.telegram_message_id, 200001)
console.log('  ✅ Пост с валидным фото успешно отправлен через sendPhoto')

// ----------------------------------------------------
// ТЕСТ 1.3: Публикация с отсутствующим фото при allow_text_fallback=true
// ----------------------------------------------------
const mockClient3 = new MockTelegramClient()
const orchestrator3 = new PublisherOrchestrator({
  rootDir: ROOT,
  photos: true, // механизм фото проверяется независимо от knowledge/post-settings.json
  queuePath: testQueueFile,
  logPath: testLogFile,
  client: mockClient3,
})

orchestrator3.queue.enqueue({
  post_id: 'tg_test_fallback',
  text: 'Пост с битым фото, но с разрешенным фолбэком',
  tone: 'serious',
  image_path: path.join(tmpDir, 'does_not_exist.jpg'),
  allow_text_fallback: true,
})

const res3 = await orchestrator3.publishNext({ force: true })
assert.strictEqual(res3.success, true)
assert.strictEqual(res3.published, true)
assert.strictEqual(mockClient3.sentCalls[0].type, 'sendMessage', 'Должен переключиться на sendMessage')
console.log('  ✅ Битое фото при разрешенном fallback корректно переключилось на текстовый пост')

// ----------------------------------------------------
// ТЕСТ 1.4: Ошибка при отсутствии фото, когда allow_text_fallback=false
// ----------------------------------------------------
const mockClient4 = new MockTelegramClient()
const orchestrator4 = new PublisherOrchestrator({
  rootDir: ROOT,
  photos: true, // механизм фото проверяется независимо от knowledge/post-settings.json
  queuePath: testQueueFile,
  logPath: testLogFile,
  client: mockClient4,
})

orchestrator4.queue.enqueue({
  post_id: 'tg_test_no_fallback',
  text: 'Пост с битым фото и запрещенным фолбэком',
  tone: 'serious',
  image_path: path.join(tmpDir, 'does_not_exist.jpg'),
  allow_text_fallback: false,
})

const res4 = await orchestrator4.publishNext({ force: true })
assert.strictEqual(res4.success, false)
assert.strictEqual(res4.published, false)
assert(res4.error.includes('Публикация отменена: фото недоступно'))
assert.strictEqual(orchestrator4.queue.queue[0].status, 'failed')
console.log('  ✅ Битое фото при запрещенном fallback корректно заблокировало отправку и перевело в failed')

// ----------------------------------------------------
// ТЕСТ 1.5: Сбой Telegram API (5xx) и сохранение статуса failed
// ----------------------------------------------------
const mockClient5 = new MockTelegramClient({ failAlways: true })
const orchestrator5 = new PublisherOrchestrator({
  rootDir: ROOT,
  photos: true, // механизм фото проверяется независимо от knowledge/post-settings.json
  queuePath: testQueueFile,
  logPath: testLogFile,
  client: mockClient5,
})

orchestrator5.queue.enqueue({
  post_id: 'tg_test_server_fail',
  text: 'Пост при падающем сервере Telegram',
  tone: 'funny',
})

const res5 = await orchestrator5.publishNext({ force: true })
assert.strictEqual(res5.success, false)
assert.strictEqual(res5.published, false)
assert(res5.error.includes('Mock Telegram API'))
const failedPost = orchestrator5.queue.queue.find((p) => p.post_id === 'tg_test_server_fail')
assert.strictEqual(failedPost.status, 'failed')
console.log('  ✅ Сбой API Telegram корректно перевел пост в статус failed с сохранением ошибки')

// Очистка
fs.rmSync(tmpDir, { recursive: true, force: true })

console.log('✅ ВСЕ ТЕСТЫ PUBLISHER И MOCK TELEGRAM API ПРОЙДЕНЫ УСПЕШНО!\n')
