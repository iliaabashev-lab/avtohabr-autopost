// Тест 3: Проверка независимости и разделения промптов (Telegram vs Short Videos)
import assert from 'node:assert'
import {
  loadTelegramPrompt,
  loadShortVideoPrompt,
  listTelegramPrompts,
  listShortVideoPrompts,
} from '../scripts/publisher/prompt-loader.mjs'

console.log('--- ТЕСТ: Независимое разделение промптов ---')

// 1. Проверка списков доступных промптов
const tgPrompts = listTelegramPrompts()
const videoPrompts = listShortVideoPrompts()

console.log('  Telegram промпты:', tgPrompts.join(', '))
console.log('  Short Video промпты:', videoPrompts.join(', '))

assert(tgPrompts.includes('post_generation.md'), 'Должен быть post_generation.md')
assert(tgPrompts.includes('post_editing.md'), 'Должен быть post_editing.md')
assert(tgPrompts.includes('image_generation.md'), 'Должен быть image_generation.md')
assert(tgPrompts.includes('image_selection.md'), 'Должен быть image_selection.md')
assert(tgPrompts.includes('quality_check.md'), 'Должен быть quality_check.md')

assert(videoPrompts.includes('script_generation.md'), 'Должен быть script_generation.md')
assert(videoPrompts.includes('hooks.md'), 'Должен быть hooks.md')
assert(videoPrompts.includes('voiceover.md'), 'Должен быть voiceover.md')
assert(videoPrompts.includes('video_generation.md'), 'Должен быть video_generation.md')
assert(videoPrompts.includes('subtitles.md'), 'Должен быть subtitles.md')
assert(videoPrompts.includes('quality_check.md'), 'Должен быть quality_check.md')

// 2. Проверка изоляции содержания
const tgGen = loadTelegramPrompt('post_generation')
const vidGen = loadShortVideoPrompt('video_generation')

assert(tgGen.includes('Telegram'), 'Telegram промпт должен содержать инструкции для Telegram')
assert(!tgGen.includes('Omni 1.1 Flash'), 'Telegram промпт НЕ должен содержать видеомоделей')

assert(vidGen.includes('FORMAT: vertical 9:16'), 'Видеопромпт должен содержать формат 9:16')
assert(vidGen.includes('STRICTLY AVOID: any eyes'), 'Видеопромпт должен содержать запрет глаз на фарах')

console.log('  ✅ Изоляция подтверждена: промпты Telegram и коротких видео полностью независимы')
console.log('✅ ВСЕ ТЕСТЫ РАЗДЕЛЕНИЯ ПРОМПТОВ ПРОЙДЕНЫ!\n')
