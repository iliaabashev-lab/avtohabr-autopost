// Тест 1: Проверка корректности работы с часовым поясом Europe/Moscow (UTC+3)
import assert from 'node:assert'
import {
  getMskParts,
  getMskDateString,
  mskToUtcDate,
  formatDualTime,
  checkPublicationWindow,
} from '../scripts/publisher/timezone.mjs'

console.log('--- ТЕСТ: Таймзона Europe/Moscow (UTC+3) ---')

// 1. Проверка преобразования фиксированного UTC в MSK (разница ровно +3 часа)
const testDateUtc = new Date('2026-11-05T06:00:00.000Z')
const mskParts = getMskParts(testDateUtc)
assert.strictEqual(mskParts.year, '2026')
assert.strictEqual(mskParts.month, '11')
assert.strictEqual(mskParts.day, '05')
assert.strictEqual(mskParts.hour, '09', '06:00 UTC должно быть строго 09:00 MSK')
assert.strictEqual(mskParts.minute, '00')
console.log('  ✅ Преобразование UTC -> MSK корректно (+3 часа без смещений)')

// 2. Проверка mskToUtcDate (09:00 MSK -> 06:00 UTC)
const convertedUtc = mskToUtcDate('2026-11-05', 9, 0, 0)
assert.strictEqual(convertedUtc.toISOString(), '2026-11-05T06:00:00.000Z')
console.log('  ✅ Преобразование MSK -> UTC корректно (09:00 MSK -> 06:00:00Z)')

// 3. Проверка вечернего слота (17:00 MSK -> 14:00 UTC)
const eveningUtc = mskToUtcDate('2026-11-05', 17, 0, 0)
assert.strictEqual(eveningUtc.toISOString(), '2026-11-05T14:00:00.000Z')
console.log('  ✅ Вечерний слот (17:00 MSK) преобразуется строго в 14:00 UTC')

// 4. Проверка форматирования dual-time (в логах есть и UTC, и MSK)
const dual = formatDualTime(testDateUtc)
assert(dual.utc.includes('2026-11-05T06:00:00.000Z'))
assert(dual.msk.includes('2026-11-05 09:00:00 MSK'))
assert(dual.logString.includes('[UTC:') && dual.logString.includes('| MSK:'))
console.log('  ✅ Логи содержат двойную метку времени: UTC и MSK')

// 5. Проверка окна публикации
const pastDate = new Date(Date.now() - 5 * 60000).toISOString()
const checkPast = checkPublicationWindow(pastDate)
assert.strictEqual(checkPast.isDue, true, 'Прошедшее время должно быть готово к публикации')

const futureDate = new Date(Date.now() + 120 * 60000).toISOString()
const checkFuture = checkPublicationWindow(futureDate)
assert.strictEqual(checkFuture.isDue, false, 'Будущее время не должно быть готово к публикации')
console.log('  ✅ Валидация окна публикации работает корректно')

console.log('✅ ВСЕ ТЕСТЫ ТАЙМЗОНЫ ПРОЙДЕНЫ УСПЕШНО!\n')
