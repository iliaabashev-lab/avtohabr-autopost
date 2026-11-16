// Подбор картинки к посту: новое фото по теме или из папки images/new (любое), каждое — один раз.
// Новых фото нет — пост уходит текстом (лучше текст, чем непонятный или повторный снимок). Общий для Telegram и MAX.
import fs from 'node:fs'
import path from 'node:path'

// тег проблемы (gen-parts.json) → слова в имени файла картинки
export const TOPIC_FILES = {
  тормоза: ['brake', 'тормоз', 'колодк'],
  ручник: ['handbrake', 'ручник'],
  диагностика: ['check_engine', 'diagnos', 'scanner', 'диагност'],
  аккумулятор: ['battery', 'аккум'],
  электрика: ['battery', 'electric', 'электрик'],
  заменамасла: ['oil', 'масл'],
  техобслуживание: ['oil', 'maintenance', 'масл', 'то_'],
  перегрев: ['coolant', 'overheat', 'radiator', 'перегрев', 'радиатор'],
  антифриз: ['coolant', 'antifreeze', 'антифриз'],
  шины: ['tire', 'tyre', 'шин', 'резин'],
  шиномонтаж: ['tire', 'tyre', 'шиномонтаж', 'шин'],
  балансировка: ['balanc', 'wheel', 'баланс'],
  сходразвал: ['alignment', 'развал'],
  фары: ['headlight', 'фар'],
  печка: ['heater', 'печк'],
  кондиционер: ['aircon', 'conditioner', 'кондиц'],
  подвеска: ['suspension', 'shock', 'подвеск'],
  коробка: ['gearbox', 'transmission', 'коробк'],
  дворники: ['wiper', 'дворник'],
  стекло: ['windshield', 'glass', 'лобов'],
  стёкла: ['window', 'fog', 'стекл'],
  ремень: ['belt', 'ремен'],
  выхлоп: ['exhaust', 'muffler', 'глушит'],
  топливо: ['fuel', 'топлив', 'бензин'],
  расход: ['fuel', 'расход'],
  утечка: ['leak', 'утечк', 'лужа'],
  салон: ['interior', 'cabin_filter', 'салон'],
  руль: ['steering', 'руль'],
  зима: ['winter', 'frost', 'зим'],
  багажник: ['trunk', 'багажник'],
  сигнализация: ['alarm', 'сигнализ'],
}
// картинки, сделанные под конкретный пост другой площадки, к чужим постам не цепляем
const FOREIGN = /^(tg|vk|max|threads)_/i
const IMG = /\.(jpe?g|png)$/i

/**
 * Фото выходит один раз: уже опубликованные (used) больше не ставим. Новых фото нет — пост текстом.
 * @param {object} o
 * @param {string[]} o.dirs папки поиска по теме (имя файла должно говорить о теме)
 * @param {string[]} [o.inbox] папки «новые фото»: годится любое фото, имя не важно
 * @param {string} [o.tag] тег проблемы из gen-parts.json
 * @param {Set<string>} [o.used] имена файлов, которые уже выходили в этом канале
 * @param {number} [o.minSize] минимальный размер файла, байт
 * @returns {string|null}
 */
export function pickTopicImage({ dirs, inbox = [], tag, used = new Set(), recent, minSize = 20_000 }) {
  const skip = recent ?? used
  const ok = (full) => { try { return fs.statSync(full).isFile() && fs.statSync(full).size >= minSize } catch { return false } }
  const files = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).sort().filter((f) => IMG.test(f) && !skip.has(f)) : [])
  const words = TOPIC_FILES[String(tag || '').toLowerCase()]
  if (words) {
    for (const dir of dirs) {
      for (const f of files(dir)) {
        if (FOREIGN.test(f) || !words.some((w) => f.toLowerCase().includes(w))) continue
        if (ok(path.join(dir, f))) return path.join(dir, f)
      }
    }
  }
  for (const dir of inbox) for (const f of files(dir)) if (ok(path.join(dir, f))) return path.join(dir, f)
  return null
}
