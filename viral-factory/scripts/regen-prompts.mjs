// Одноразовая перегенерация prompts.md для существующих историй под новый шаблон видео-промпта
// (глаза ТОЛЬКО на лобовом стекле + машинка произносит реплики из ситуации).
// node regen-prompts.mjs  → перезаписывает prompts.md у 001, 008-012, 013-072; story.json не трогает.
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, readJson } from './lib.mjs'
import { videoPromptFor, imagePromptsFor } from './gen.mjs'

const P = readJson(path.join(ROOT, 'knowledge/gen-parts.json'))
const pick = (arr, n) => arr[((n % arr.length) + arr.length) % arr.length]
const day = (date) => Math.floor(Date.parse(date) / 864e5)
const STYLE = 'Cute small 3D cartoon car mascot, rounded white-and-blue body with the AVTOHABR logo on the hood, big expressive eyes ONLY on the windshield, headlights are ordinary warm white lamps (no eyes in the headlights), small smiling mouth on the front grille, slightly clumsy, Pixar-quality original character, warm golden cinematic light, soft shadows, vertical 9:16, no text'
const sdir = path.join(ROOT, 'stories')

const plans = []
// 001: ночная история — своя сцена-пара
plans.push({ id: '001', p: { en: 'the service is closed and silent, no one answers the phone', fail: 'knocking on the dark service door with a tiny wheel', short: 'закрытый сервис', svc: 'обслуживание' }, s: { en: 'stands alone near a closed auto service at night on a dark city street' } })
// 008-012: ежедневная подборка от 03.11 (база тогда была 12 проблем — первые 12 текущего списка)
for (let k = 0; k < 5; k++) {
  plans.push({ id: String(8 + k).padStart(3, '0'), p: pick(P.problems.slice(0, 12), day('2026-11-03') * 5 + k * 3 + 1), s: pick(P.settings, day('2026-11-03') * 2 + k + 3) })
}
// 013-072: пачка сгенерирована при машинной дате 03.11 (до полуночи МСК) — семя то же, что у 008-012
for (let k = 0; k < 60; k++) {
  plans.push({ id: String(13 + k).padStart(3, '0'), p: pick(P.problems, day('2026-11-03') * 5 + 15 + (k % P.problems.length)), s: pick(P.settings, day('2026-11-03') * 2 + 8 + (k % P.settings.length)) })
}

let ok = 0, mismatch = []
for (const { id, p, s } of plans) {
  const dir = path.join(sdir, id)
  const sj = path.join(dir, 'story.json')
  if (!fs.existsSync(sj)) { mismatch.push(`${id}: нет story.json`); continue }
  const story = JSON.parse(fs.readFileSync(sj, 'utf8'))
  const { scenes, prompt } = videoPromptFor(p, s, Number(id))
  const imgs = imagePromptsFor(p, s, Number(id))
  // сверка: история реально про эту проблему? (у 001 своя сцена — пропускаем сверку)
  const expectedTitle = `${p.title} ${p.emoji}`
  if (id !== '001' && story.title !== expectedTitle) mismatch.push(`${id}: титул "${story.title}" ≠ "${expectedTitle}"`)
  const sp = scenes.map((x, i) => `${i + 1}. ${x}. ${STYLE}.`).join('\n\n')
  fs.writeFileSync(path.join(dir, 'prompts.md'), `# История ${id}: ${story.title}\n\n${sp}\n\n**Видео (одним промптом):**\n\n${prompt}\n\n**Картинки для постов (сгенерируй обе, сохрани в ai-images):**\n\n\n\n**Серьёзная (→ ai-images/serious):**\n\n\n\n${imgs.serious}\n\n\n\n**Забавная с маскотом (→ ai-images/funny):**\n\n\n\n${imgs.funny}\n`)
  ok++
}
console.log(`обновлено prompts.md: ${ok}`)
if (mismatch.length) console.log('несовпадения (проверить вручную):\n' + mismatch.join('\n'))
