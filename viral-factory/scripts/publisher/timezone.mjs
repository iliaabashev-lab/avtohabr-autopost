// Модуль строгого управления часовым поясом Europe/Moscow (UTC+3).
// Гарантирует независимость от часового пояса сервера/раннера.
// Внутри системы все даты хранятся в UTC (ISO 8601).
// Во внешнем интерфейсе и расписании используется Europe/Moscow.

const TIMEZONE_MSK = 'Europe/Moscow'

/**
 * Получить текущий объект даты
 */
export function nowUtc() {
  return new Date()
}

/**
 * Получить текущее время в формате ISO UTC
 */
export function nowUtcIso() {
  return nowUtc().toISOString()
}

/**
 * Получить текущую дату в формате YYYY-MM-DD по Московскому времени
 */
export function getMskDateString(date = new Date()) {
  const parts = getMskParts(date)
  return `${parts.year}-${parts.month}-${parts.day}`
}

/**
 * Получить компоненты даты и времени по Московскому времени
 */
export function getMskParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE_MSK,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  const parts = {}
  for (const { type, value } of formatter.formatToParts(date)) {
    if (type !== 'literal') parts[type] = value
  }

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  }
}

/**
 * Преобразовать московское время в объект Date (UTC).
 * @param {string} dateStr YYYY-MM-DD
 * @param {number} hour 0..23
 * @param {number} minute 0..59
 * @param {number} second 0..59
 * @returns {Date}
 */
export function mskToUtcDate(dateStr, hour = 0, minute = 0, second = 0) {
  const [year, month, day] = dateStr.split('-').map(Number)
  const pad = (n) => String(n).padStart(2, '0')
  // Europe/Moscow — круглогодичный UTC+3 с октября 2014 года
  const isoStr = `${pad(year)}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}+03:00`
  const d = new Date(isoStr)
  if (isNaN(d.getTime())) {
    throw new Error(`Некорректная дата для преобразования: ${dateStr} ${hour}:${minute}:${second}`)
  }
  return d
}

/**
 * Форматировать дату одновременно в UTC и MSK для подробных логов
 */
export function formatDualTime(date = new Date()) {
  const d = typeof date === 'string' ? new Date(date) : date
  const utcIso = d.toISOString()
  const p = getMskParts(d)
  const mskFormatted = `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second} MSK (UTC+3)`
  return {
    utc: utcIso,
    msk: mskFormatted,
    logString: `[UTC: ${utcIso} | MSK: ${mskFormatted}]`,
  }
}

/**
 * Проверить, наступило ли запланированное время публикации.
 * @param {string|Date} scheduledAtUtc ISO строка в UTC
 * @param {number} allowedWindowMinutes допустимое окно в минутах (по умолчанию 30 мин)
 * @returns {{ isDue: boolean, diffMinutes: number, reason?: string }}
 */
export function checkPublicationWindow(scheduledAtUtc, allowedWindowMinutes = 60) {
  const scheduled = typeof scheduledAtUtc === 'string' ? new Date(scheduledAtUtc) : scheduledAtUtc
  const current = new Date()

  const diffMs = current.getTime() - scheduled.getTime()
  const diffMinutes = Math.floor(diffMs / 60000)

  if (diffMinutes < -5) {
    return {
      isDue: false,
      diffMinutes,
      reason: `Время публикации ещё не наступило (запланировано через ${Math.abs(diffMinutes)} мин)`,
    }
  }

  return {
    isDue: true,
    diffMinutes,
  }
}
