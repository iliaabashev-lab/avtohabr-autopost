// Тест 4: Проверка очереди, статусов, дедупликации и устойчивости к перезапуску
import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { TelegramPublicationQueue, STATUS } from '../scripts/publisher/queue.mjs'

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(CURRENT_DIR, '..')

console.log('--- ТЕСТ: Очередь публикаций, статусы и защита от дублей ---')

const tmpDir = path.join(ROOT, 'tests/tmp_queue')
fs.mkdirSync(tmpDir, { recursive: true })
const testQueueFile = path.join(tmpDir, 'test_queue.json')
const testLogFile = path.join(tmpDir, 'test_posted.json')

// 1. Инициализация пустой очереди
const queue1 = new TelegramPublicationQueue(testQueueFile, testLogFile)
assert.strictEqual(queue1.queue.length, 0)
assert.strictEqual(queue1.history.length, 0)
console.log('  ✅ Инициализация чистой очереди')

// 2. Добавление поста в очередь
const post1 = queue1.enqueue({
  post_id: 'tg_test_100',
  text: 'Уникальный текст поста номер 1',
  tone: 'funny',
})
assert.strictEqual(post1.status, STATUS.PENDING)
assert.strictEqual(post1.attempts, 0)
assert.strictEqual(queue1.queue.length, 1)
console.log('  ✅ Пост успешно поставлен в очередь со статусом PENDING')

// 3. Защита от дублирования в очереди
let duplicateThrew = false
try {
  queue1.enqueue({
    post_id: 'tg_test_100',
    text: 'Уникальный текст поста номер 1',
  })
} catch (e) {
  duplicateThrew = true
  assert(e.message.includes('Дублирование'))
}
assert.strictEqual(duplicateThrew, true, 'Повторный пост с тем же ID/текстом обязан вызвать ошибку дубля')
console.log('  ✅ Защита от дублирования в очереди сработала успешно')

// 4. Переход статуса: PENDING -> PUBLISHING -> PUBLISHED
queue1.markPublishing('tg_test_100')
assert.strictEqual(queue1.queue[0].status, STATUS.PUBLISHING)
assert.strictEqual(queue1.queue[0].attempts, 1)
console.log('  ✅ Статус PUBLISHING зафиксирован, счетчик попыток инкрементирован')

// Публикация подтверждена (Telegram вернул message_id)
queue1.markPublished('tg_test_100', 987654)
assert.strictEqual(queue1.queue.length, 0, 'Опубликованный пост должен быть удален из очереди')
assert.strictEqual(queue1.history.length, 1, 'Опубликованный пост должен появиться в журнале')
assert.strictEqual(queue1.history[0].telegram_message_id, 987654)
console.log('  ✅ Статус PUBLISHED зафиксирован строго после получения message_id')

// 5. Защита от дублирования против истории
let duplicateHistoryThrew = false
try {
  queue1.enqueue({
    post_id: 'tg_test_101',
    text: 'Уникальный текст поста номер 1', // тот же текст, что уже в истории
  })
} catch (e) {
  duplicateHistoryThrew = true
  assert(e.message.includes('уже был опубликован'))
}
assert.strictEqual(duplicateHistoryThrew, true)
console.log('  ✅ Защита от повторной отправки уже опубликованного текста работает')

// 6. Устойчивость к перезапуску (перезагрузка состояния с диска)
const queue2 = new TelegramPublicationQueue(testQueueFile, testLogFile)
assert.strictEqual(queue2.history.length, 1)
assert.strictEqual(queue2.history[0].telegram_message_id, 987654)
console.log('  ✅ Перезапуск системы: история и журнал корректно загружены с диска')

// 7. Проверка статуса FAILED и механизма retry
const postFail = queue2.enqueue({
  post_id: 'tg_test_fail',
  text: 'Текст поста с ошибкой',
})
queue2.markFailed('tg_test_fail', 'Network timeout 504')
assert.strictEqual(queue2.queue[0].status, STATUS.FAILED)
assert.strictEqual(queue2.queue[0].last_error, 'Network timeout 504')

queue2.retryPost('tg_test_fail')
assert.strictEqual(queue2.queue[0].status, STATUS.PENDING)
assert.strictEqual(queue2.queue[0].last_error, null)
console.log('  ✅ Обработка статуса FAILED и сброс в PENDING через retry работает')

// Очистка
fs.rmSync(tmpDir, { recursive: true, force: true })

console.log('✅ ВСЕ ТЕСТЫ ОЧЕРЕДИ И ДЕДУПЛИКАЦИИ ПРОЙДЕНЫ!\n')
