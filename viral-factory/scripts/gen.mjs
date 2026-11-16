// Генератор без нейросети: новые посты ВК, тексты для vc.ru и DRIVE2, промпты Google Flow для историй маскота.
// Посты собираются из базы ситуаций (knowledge/gen-parts.json) по шаблонам; повторы отсекаются по content-log.
// node gen.mjs vk N  → печатает JSON с N новыми постами (вызывает content-engine)
// node gen.mjs daily → out/DATE/flow-prompts.md + stories/NNN/story.json, vc.md (пн), drive2.md (каждый 3-й день)
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, readJson, writeJson, today } from './lib.mjs'

const P = readJson(path.join(ROOT, 'knowledge/gen-parts.json'))
const date = today()
const day = Math.floor(Date.parse(date) / 864e5)
const pick = (arr, n) => arr[((n % arr.length) + arr.length) % arr.length]
const LINK = 'Водителям бесплатно, сервисам 14 дней бесплатно 👉 app.avtohabr.ru'
const season = () => { const m = new Date(date).getMonth(); return m <= 1 || m === 11 ? 'зима' : m <= 4 ? 'весна' : m <= 7 ? 'лето' : 'осень' }

// шаблоны постов: p — проблема, s — место/ситуация, n — счётчик для разнообразия
const VK = [
  (p, s) => `${p.emoji} ${p.hook}\n\n${p.tip}\n\nА у вас такое было? Пишите в комментариях 👇`,
  (p, s) => `Ситуация: ${s.ru}, а тут ${p.short}. ${p.emoji}\n\nЧто делаете первым делом?\n1️⃣ Еду в сервис сразу\n2️⃣ Делаю громче музыку\n3️⃣ Звоню другу-механику`,
  (p) => `Совет на ${season()}: ${p.tip.charAt(0).toLowerCase() + p.tip.slice(1)}\n\nЗаписаться на ${p.svc} можно без звонков, выбрать время и посмотреть цену заранее.\n${LINK}`,
  (p, s) => `${p.joke} 😅\n\nСохраните, чтобы не забыть про ${p.svc}.`,
  (p) => `Честно, кто тянет до последнего, когда ${p.short}? 🙋\n\nМы тоже так делали, пока чек не вырос вдвое. Теперь ${p.svc} по записи в удобный слот, без очереди.\n${LINK}`,
  (p, s) => `${s.ru}. ${p.short.charAt(0).toUpperCase() + p.short.slice(1)}. Знакомо? ${p.emoji}\n\nКороткий чек-лист:\n${p.check.map((c) => '✔️ ' + c).join('\n')}\n\nЧто бы вы добавили?`,
]

export function vkPosts(n, usedStarts) {
  const out = []
  for (let k = 0; out.length < n && k < 400; k++) {
    const p = pick(P.problems, day * 7 + k * 5), s = pick(P.settings, day * 3 + k), t = pick(VK, day + k)
    const text = t(p, s)
    const id = text.slice(0, 60)
    if (usedStarts.has(id) || out.some((o) => o.text.slice(0, 60) === id)) continue
    out.push({ audience: VK.indexOf(t) === 2 || VK.indexOf(t) === 4 ? 'owners' : 'drivers', text, score: 8, id: 'gen' })
  }
  return out
}

// TG/MAX-посты: тот же движок, но другие семена — контент каналов не совпадает с ВК и между собой.
// Два типа постов по очереди: serious (совет + чек-лист) / funny (юмор). К картинке подбирается папка по тону.
// usedStarts — начала текстов ВК за сегодня (исключаем дубли). shift — сдвиг семян между платформами (TG=0, MAX=100).
const NL = String.fromCharCode(10)
const TG_SERIOUS = [
  (p, s) => [
    p.emoji + ' ' + p.title,
    '',
    'Знакомая ситуация: ' + s.ru.toLowerCase() + ', а тут ' + p.short + '. Первое желание многих водителей — отложить визит в сервис «на потом» и надеяться, что само пройдёт 😅',
    '',
    'Но физику не обманешь: ' + p.tip,
    '',
    'Что стоит проверить в первую очередь:',
    ...p.check.map((c) => '✔️ ' + c.charAt(0).toUpperCase() + c.slice(1)),
    '',
    'А вы обычно сразу едете в сервис при первых симптомах или ждёте до планового ТО? Пишите в комментариях 👇',
  ].join(NL),

  (p, s) => [
    p.emoji + ' Совет автоэксперта: что делать, если ' + p.short,
    '',
    p.hook,
    '',
    'Поясняем на пальцах: ' + (p.tip.charAt(0).toLowerCase() + p.tip.slice(1)) + ' Своевременный осмотр занимает от силы 15-20 минут, зато спасает от дорогостоящего ремонта в самый неподходящий момент.',
    '',
    'Памятка водителю перед поездкой:',
    ...p.check.map((c) => '✔️ ' + c.charAt(0).toUpperCase() + c.slice(1)),
    '',
    'Сохраняйте пост себе, чтобы не потерять! А с какой поломкой вы сталкивались чаще всего? Пишите 👇',
  ].join(NL),

  (p, s) => [
    p.emoji + ' Ошибка, которая стоит дорого: игнорировать, когда ' + p.short,
    '',
    'Многие думают: «Ну едет же, значит пока терпит». Но правда в том, что ' + (p.tip.charAt(0).toLowerCase() + p.tip.slice(1)),
    '',
    'Особенно неприятно, когда симптомы проявляются в дороге: ' + s.ru.toLowerCase() + '. Чем дольше тянуть — тем длиннее и дороже итоговый чек в сервисе.',
    '',
    'Базовый чек-лист контроля:',
    ...p.check.map((c) => '✔️ ' + c.charAt(0).toUpperCase() + c.slice(1)),
    '',
    'Делитесь в комментариях: доводилось попадать на крупный ремонт из-за мелкой затянутой детали? 👇',
  ].join(NL),
]

const TG_FUNNY = [
  (p, s) => [
    '😅 ' + p.joke,
    '',
    'Классика жанра: ' + s.ru.toLowerCase() + ', и вдруг ' + p.short + '.',
    '',
    p.narr1 + ' ' + p.narr2,
    '',
    'Стадия отрицания длится примерно до первой приличной ямы или светофора. А ведь если без шуток: ' + (p.tip.charAt(0).toLowerCase() + p.tip.slice(1)),
    '',
    'Признавайтесь в комментариях: кто тоже хоть раз надеялся, что «само рассосётся»? 🙈',
  ].join(NL),

  (p, s) => [
    p.emoji + ' Жизненный тест для автолюбителей',
    '',
    'Картина маслом: ' + s.ru.toLowerCase() + ', а у вас ' + p.short + '. Ваши действия?',
    '',
    '1️⃣ Делаю музыку громче и медитирую 🎶',
    '2️⃣ Открываю капот, многозначительно смотрю внутрь и закрываю обратно 🧐',
    '3️⃣ Звоню другу с фразой: «Слушай, а если оно так делает, это нормально?» 📞',
    '4️⃣ Записываюсь на нормальную диагностику без лишних нервов 🚗',
    '',
    p.joke + ' 😅',
    '',
    'Голосуйте цифрой в комментариях, посмотрим кого больше! 👇',
  ].join(NL),

  (p, s) => [
    '🙈 ' + p.hook,
    '',
    p.joke + ' 😅',
    '',
    'Самое интересное, что это почти всегда происходит в самый нужный момент: ' + s.ru.toLowerCase() + '. Закон подлости в чистом виде!',
    '',
    'Хотя на самом деле ' + p.short + ' лечится в сервисе буквально за один визит: ' + (p.tip.charAt(0).toLowerCase() + p.tip.slice(1)),
    '',
    'А какие самые забавные или нелепые поломки случались с вами на дороге? Пишите в комменты 👇',
  ].join(NL),
]

export function tgPosts(n, usedStarts = new Set(), shift = 0) {
  const out = []
  // Строгий ритм: 3 серьезных поста на 2 шуточных
  const TONE_PATTERN = ['serious', 'serious', 'funny', 'serious', 'funny']
  for (let k = 0; out.length < n && k < 400; k++) {
    const p = pick(P.problems, day * 9 + shift * 31 + k * 7 + 2), s = pick(P.settings, day * 4 + shift * 17 + k * 3 + 1)
    const tone = TONE_PATTERN[out.length % TONE_PATTERN.length]
    const template = tone === 'serious' ? pick(TG_SERIOUS, day + k) : pick(TG_FUNNY, day + k)
    const body = template(p, s)
    const isMax = shift !== 0
    const footer = isMax
      ? ['—', 'Онлайн-запись: https://app.avtohabr.ru', 'Наша группа в ВК: https://vk.ru/avtohabr'].join(NL)
      : ['—', 'Онлайн-запись: https://app.avtohabr.ru', 'Мы в MAX: https://max.ru/channel_avtohabr • ВК: https://vk.ru/avtohabr'].join(NL)
    const text = [body, '', footer].join(NL)
    const shortText = [p.joke + ' 😅', '', footer].join(NL)
    const id = text.slice(0, 60)
    if (usedStarts.has(id) || usedStarts.has(text.slice(0, 60).replace(new RegExp('\\n+$', 'g'), '')) || out.some((o) => o.text.slice(0, 60) === id)) continue
    out.push({ text, shortText, tone, score: 8, id: 'tg', tag: p.tag || p.short, topic: p.short, title: p.title })
  }
  return out
}
// сборщик видео-промпта v3: одна непрерывная сцена-история, 2 реплики, минимум инструкций (Omni не переваривает перегруз)
// seed — номер истории: вариант приветствия/финала, чтобы соседние ролики не звучали одинаково
export function videoPromptFor(p, s, seed = 0) {
  const v = (arr) => arr[((seed % arr.length) + arr.length) % arr.length]
  const scenes = [
    `The car mascot ${s.en}. Suddenly ${p.en} — comic surprise. It grabs a smartphone, taps a simple blue app icon with a white car symbol and instantly looks relieved. Final beat: happy smile, problem solved, joyful bounce on the suspension.`,
  ]
  const STYLE = 'rounded white-and-blue compact cartoon car, AVTOHABR logo on the hood, big expressive eyes ONLY on the windshield glass (the windshield is its face), plain glowing round headlamps with no face at all, small mouth on the front grille, Pixar-quality 3D cartoon render, warm golden cinematic light, soft shadows'
  const video = [
    'FORMAT: vertical 9:16, one continuous 10-second scene, 24 fps, premium 3D animated feature film quality, high-end family animation look.',
    `CHARACTER (never changes): cute small cartoon car mascot — ${STYLE}.`,
    `STORY: ${scenes[0]}`,
    `DIALOGUE: the mascot speaks Russian aloud in a cute childlike cartoon voice, its grille-mouth moves while it talks. It says exactly two lines: first «${v(['Ой!', 'Ой-ой-ой!', 'Ай!', 'Ох!', 'Мамочки!'])} ${p.short}!», then «О, AVTOHABR! Записываюсь на ${p.svc} онлайн за минуту!». Quiet playful ukulele music under the voice, cartoon sound effects on actions.`,
    'STRICTLY AVOID: any eyes, pupils, eyelids or eyebrows on the headlamps — the headlamps are plain featureless glowing lamps, the windshield eyes are the ONLY eyes; readable text, letters, numbers or UI labels anywhere (the phone screen shows only a simple blue icon with a white car symbol); extra characters; deformed or extra wheels; morphing shape; flickering; watermarks.',
  ].join('\n')
  return { scenes, prompt: video }
}

// сборщик промптов картинок для постов: serious (СТРОГО БЕЗ МАСКОТА) и funny (с маскотом)
export function imagePromptsFor(p, s, seed = 0) {
  const v = (arr) => arr[((seed % arr.length) + arr.length) % arr.length]
  const FACE = 'big expressive eyes ONLY on the windshield glass (the windshield is its face), plain glowing round headlamps with no face at all, small mouth on the front grille'
  // СЕРЬЁЗНЫЕ КАРТИНКИ: СТРОГО БЕЗ МАСКОТА! Реалистичная автосъёмка в сервисе по теме проблемы
  const checksStr = p.check && p.check.length ? p.check.join(', ') : p.short
  const serious = `Square 1:1, photorealistic cinematic automotive photography: modern high-tech car service center, clean workshop bay. Professional close-up shot focusing on ${p.svc} (checking ${checksStr}). Certified mechanic in clean dark-blue automotive uniform and protective gloves working with high-precision diagnostic tools. Premium German/Japanese workshop aesthetic, soft natural workshop light, shallow depth of field, sharp focus, 8k resolution, authentic automotive repair environment. STRICTLY NO cartoon characters, NO mascots, NO text, NO letters, NO watermarks.`
  // ШУТОЧНЫЕ КАРТИНКИ: С МАСКОТОМ! 3D-рендер Pixar с эмоциями на лобовом стекле
  const funny = `Square 1:1, comic 3D cartoon render: the cute car mascot (rounded white-and-blue compact car, AVTOHABR logo on the hood, ${FACE}) ${p.en} - exaggerated funny comic emotions on the windshield eyes, cartoon dust cloud or comic sparks, the mascot ${v(['jumps in panic', 'covers its eyes in embarrassment', 'dramatically gasps', 'spins in comic confusion', 'hides behind a tiny bush'])}, bright cheerful colors, dynamic composition, high-end family animation still frame. No text, no letters anywhere.`
  return { serious, funny }
}

function flowStories(count = 5) {
  const sdir = path.join(ROOT, 'stories')
  const ids = fs.readdirSync(sdir).filter((d) => /^\d+$/.test(d)).map(Number)
  const hasMedia = (i) => fs.existsSync(path.join(sdir, String(i).padStart(3, '0'), 'video.mp4')) || fs.existsSync(path.join(sdir, String(i).padStart(3, '0'), '1.jpg'))
  const waiting = ids.filter((i) => !hasMedia(i))
  if (count <= 5 && waiting.length >= 15) return `Промптов без видео уже ${waiting.length}, новые не добавляю: сначала сгенерируйте ролики по готовым промптам.`
  let next = Math.max(7, ...ids) + 1 // 006 и 007 владелец делал вручную в Flow
  const STYLE = 'Cute small 3D cartoon car mascot, rounded white-and-blue body with the AVTOHABR logo on the hood, big expressive eyes ONLY on the windshield, headlights are ordinary warm white lamps (no eyes in the headlights), small smiling mouth on the front grille, slightly clumsy, Pixar-quality original character, warm golden cinematic light, soft shadows, vertical 9:16, no text'
  const batch = count > 5
  // batch: все пары (problem, setting) уникальны на 60 историй (НОК 12 и 10), со сдвигом от ежедневных подборок
  const baseP = day * 5 + 15, baseS = day * 2 + 8
  let md = `# Промпты для видео на ${date} — Google AI Studio (Omni 1.1 Flash)\n\nДля каждой истории: возьмите блок **«Видео (одним промптом)»** из её prompts.md, сгенерируйте ролик 9:16 длительностью 10 с и скачайте как video.mp4. Загрузите его в папку истории на GitHub («Add file» → «Upload files») — фабрика сама озвучит, смонтирует и выложит. Список из 5 сцен — страховка, если модель развалит одну склейку: тогда делайте 5 коротких клипов и назовите 1.mp4…5.mp4.\n\n`
  for (let k = 0; k < count; k++, next++) {
    const id = String(next).padStart(3, '0')
    const p = batch ? pick(P.problems, baseP + (k % P.problems.length)) : pick(P.problems, day * 5 + k * 3 + 1)
    const s = batch ? pick(P.settings, baseS + (k % P.settings.length)) : pick(P.settings, day * 2 + k + 3)
    const { scenes, prompt: video } = videoPromptFor(p, s, k)
    const imgs = imagePromptsFor(p, s, k)
    const story = {
      title: `${p.title} ${p.emoji}`,
      // короткая наррация: должна озвучиться примерно за 8 с, чтобы влезть в 10-секундный клип до рекламной вставки
      narration: k % 2 === 0
        ? `${p.narr1} Записалась на ${p.svc} онлайн за минуту — и всё починили!`
        : `${p.narr1} ${p.narr2} Потом записалась на ${p.svc} онлайн — и всё починили!`,
      cta: p.cta,
      caption: `${p.title} ${p.emoji}\n\n${p.tip} Записывайся онлайн и смотри цены заранее. ${LINK}\n\n#автосервис #автомобиль #${p.tag} #avtohabr`,
    }
    const dir = path.join(sdir, id)
    writeJson(path.join(dir, 'story.json'), story)
    const sp = scenes.map((x, i) => `${i + 1}. ${x}. ${STYLE}.`).join('\n\n') + `\n\n**Видео (одним промптом):**\n\n${video}`
    fs.writeFileSync(path.join(dir, 'prompts.md'), `# История ${id}: ${story.title}\n\n${sp}\n\n**Картинки для постов (сохрани в ai-images):**\n\n**Серьёзная (→ serious):**\n\n${imgs.serious}\n\n**Забавная (→ funny):**\n\n${imgs.funny}\n`)
    md += `## История ${id}: ${story.title}\nПапка: viral-factory/stories/${id}/\n\n${sp}\n\n`
  }
  return md
}

// живые заходы и концовки, чтобы тексты не звучали одинаково
const VC_OPEN = [
  'Признаюсь честно: сам годами ездил по принципу «пока едет, не трогаю» 🙈 Пока не начал делать сервис записи в автосервис и не увидел, сколько людей платят за это втридорога.',
  'Каждый день к нам в AVTOHABR приходят заявки, и по ним можно писать сериал 🎬 Одни и те же истории, только машины разные.',
  'Друг на прошлой неделе отдал за ремонт как за отпуск 😬 А ведь всё начиналось с мелочи, которую он «потом посмотрит». Решил собрать такие мелочи в одном месте.',
]
const VC_CLOSE = [
  'А у вас какая поломка была самой обидной? Пишите в комментариях, почитаю всё 👇',
  'Если узнали себя хотя бы в двух пунктах, вы не одни, я тоже 😅 Делитесь своими историями в комментариях.',
  'Сохраните, чтобы показать тому самому другу, который «ещё поездит» 😉',
]
const D2_OPEN = ['Всем привет! 👋', 'Привет, драйвовцы! 🚗', 'Короче, история 😅', 'Ну что, рассказываю, как я опять затянул 🙈']
const D2_CLOSE = ['А вы как, тоже тянете до последнего или сразу едете? 🤔', 'Всем ровных дорог и тихих тормозов 🙌', 'Пишите, если было похожее, интересно, чем у вас закончилось 👇']

function vcArticle() {
  const ps = [0, 1, 2, 3, 4].map((k) => pick(P.problems, day + k * 4))
  const when = { 'зима': 'зимой', 'осень': 'осенью', 'весна': 'весной', 'лето': 'летом' }[season()]
  return `# vc.ru — статья недели (${date})\n\nРаздел: «Авто» или «Личный опыт». Обложка: кадр из ролика с машинкой.\n\n## Заголовок\n5 мелочей, из-за которых ${when} отдают за ремонт как за отпуск 💸\n\n## Текст\n${pick(VC_OPEN, day)}\n\n${ps.map((p, i) => `**${i + 1}. ${p.title} ${p.emoji}**\n${p.joke}. Если серьёзно: ${p.tip.charAt(0).toLowerCase() + p.tip.slice(1)}\nЧто проверить: ${p.check.join(', ')}.`).join('\n\n')}\n\nВывод скучный, но рабочий: чем раньше доехал до сервиса, тем короче чек 🧾 Мы поэтому и сделали запись без звонков: видно цены и свободное время, записываешься за минуту. ${LINK}\n\n${pick(VC_CLOSE, day)}\n`
}

function drive2Post() {
  const p = pick(P.problems, day * 3 + 2)
  return `# DRIVE2 — запись в бортжурнал (${date})\n\nКатегория: «Плановое ТО» или «Своими руками». Фото: свой кадр машины/ролика.\n\n## Заголовок\n${p.title} ${p.emoji}\n\n## Текст\n${pick(D2_OPEN, day)}\n\nВ общем, ${p.short}. Сначала делал вид, что так и задумано 😅 ${p.joke}.\n\nПотом всё-таки собрался и проверил:\n${p.check.map((c) => '🔧 ' + c).join('\n')}\n\nВывод для себя сделал такой: ${p.tip.charAt(0).toLowerCase() + p.tip.slice(1)}\n\nВ сервис записался онлайн через app.avtohabr.ru, понравилось, что цену видно заранее и не надо никому звонить 📱\n\n${pick(D2_CLOSE, day)}\n`
}

if (process.argv[2] === 'vk') {
  const log = readJson(path.join(ROOT, 'knowledge/content-log.json'), [])
  console.log(JSON.stringify(vkPosts(Number(process.argv[3] || 5), new Set(log.map((p) => p.text.slice(0, 60))))))
} else if (process.argv[2] === 'daily') {
  const count = Math.max(1, Number(process.argv[3] || 5))
  const out = path.join(ROOT, 'out', date)
  fs.mkdirSync(out, { recursive: true })
  fs.writeFileSync(path.join(out, 'flow-prompts.md'), flowStories(count))
  if (new Date(date).getDay() === 1) fs.writeFileSync(path.join(out, 'vc.md'), vcArticle())
  if (day % 3 === 0) fs.writeFileSync(path.join(out, 'drive2.md'), drive2Post())
  // готовые подписи ко всем роликам-историям для ручной публикации на площадках
  const sdir = path.join(ROOT, 'stories')
  const caps = fs.readdirSync(sdir).filter((d) => /^\d+$/.test(d) && fs.existsSync(path.join(sdir, d, 'story.json'))).sort().map((id) => {
    const s = readJson(path.join(sdir, id, 'story.json'))
    const ready = fs.existsSync(path.join(sdir, id, 'video.mp4')) ? '✅ видео есть' : fs.existsSync(path.join(sdir, id, '1.jpg')) ? '✅ картинки есть' : '⏳ ждёт video.mp4 из AI Studio'
    return `## Ролик ${id} ${ready}\n\n**YouTube Shorts — название:**\n\n${s.title} #shorts\n\n**YouTube / ВК клип — описание:**\n\n${s.caption}\n\n**Threads:**\n\n${s.title}\nА у вас такое было? 👇\n\n---`
  })
  fs.mkdirSync(path.join(ROOT, 'captions'), { recursive: true })
  fs.writeFileSync(path.join(ROOT, 'captions/README.md'), `# Подписи к роликам\n\nНомер ролика = номер файла в https://github.com/iliaabashev-lab/avtohabr/tree/factory-media/media/story (например 008.mp4). Обновляется каждое утро.\n\n${caps.join('\n\n')}\n`)
  // README.md GitHub показывает обычным текстом прямо под списком файлов — сводка дня для владельца
  const vk = readJson(path.join(out, 'content.json'), { vk: [] }).vk || []
  const has = (f) => fs.existsSync(path.join(out, f))
  const lnk = (f, t) => has(f) ? `- [${t}](${f})` : null
  fs.writeFileSync(path.join(out, 'README.md'), [
    `# Сводка на ${date}`, '',
    'Файлы .json — служебные для фабрики, их открывать не нужно. Всё нужное — ниже и в файлах .md.', '',
    '## Что сделать вручную сегодня',
    lnk('flow-prompts.md', `🎨 Промпты для видео в Google AI Studio (${count} историй)`),
    lnk('threads.md', '🧵 Посты для Threads'),
    lnk('drive2.md', '🚗 Пост для DRIVE2 (бортжурнал)'),
    lnk('vc.md', '📰 Статья для vc.ru'), '',
    '## Посты ВК — выйдут сами, ничего делать не нужно',
    ...(vk.length ? vk.map((p, i) => `**Пост ${i + 1}**\n\n${p.text}\n\n---`) : ['Сегодня новых постов нет.']),
  ].filter((x) => x !== null).join('\n'))
  console.log('Готово:', fs.readdirSync(out).join(', '))
}
