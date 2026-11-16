// Тест 2: Проверка привязки и валидации изображений
import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateImage, createPostImageBinding } from '../scripts/publisher/image-matcher.mjs'

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(CURRENT_DIR, '..')

console.log('--- ТЕСТ: Валидация и привязка изображений ---')

// 1. Несуществующий путь к изображению
const missingRes = validateImage('images/funny/non_existent.jpg', ROOT)
assert.strictEqual(missingRes.valid, false)
assert(missingRes.error.includes('Файл не найден'))
console.log('  ✅ Несуществующий файл корректно отклоняется')

// 2. Пустой путь к изображению
const emptyRes = validateImage('', ROOT)
assert.strictEqual(emptyRes.valid, false)
assert(emptyRes.error.includes('Путь к изображению не указан'))
console.log('  ✅ Пустой путь корректно обрабатывается')

// 3. Создаем временный валидный JPEG файл для теста
const tmpDir = path.join(ROOT, 'tests/tmp')
fs.mkdirSync(tmpDir, { recursive: true })
const testJpg = path.join(tmpDir, 'valid_test.jpg')
fs.writeFileSync(testJpg, Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]))

const validRes = validateImage(testJpg, ROOT)
assert.strictEqual(validRes.valid, true)
assert.strictEqual(validRes.mimeType, 'image/jpeg')
assert.strictEqual(validRes.error, null)
console.log('  ✅ Валидный JPEG файл успешно подтвержден')

// 4. Проверка отклонения WebP для sendPhoto (во избежание ошибки Telegram API)
const testWebp = path.join(tmpDir, 'test.webp')
fs.writeFileSync(testWebp, Buffer.from('RIFF....WEBP'))
const webpRes = validateImage(testWebp, ROOT)
assert.strictEqual(webpRes.valid, false)
assert(webpRes.error.includes('.webp не поддерживается Telegram API sendPhoto'))
console.log('  ✅ WebP файл корректно заблокирован для sendPhoto с понятным описанием')

// 5. Проверка создания структуры привязки post_id -> image_id -> image_path
const binding = createPostImageBinding('tg_test_001', testJpg, ROOT, true)
assert.strictEqual(binding.post_id, 'tg_test_001')
assert.strictEqual(binding.image_id, 'valid_test.jpg')
assert.strictEqual(binding.image_valid, true)
assert.strictEqual(binding.allow_text_fallback, true)
console.log('  ✅ Структура связки post_id -> image_id -> image_path сформирована корректно')

// Очистка временных файлов
fs.rmSync(tmpDir, { recursive: true, force: true })

console.log('✅ ВСЕ ТЕСТЫ ВАЛИДАЦИИ И ПРИВЯЗКИ ИЗОБРАЖЕНИЙ ПРОЙДЕНЫ!\n')
