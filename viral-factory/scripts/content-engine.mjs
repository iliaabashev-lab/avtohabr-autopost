// Reverse Engineering + Content Strategist + Quality Auditor.
// Берёт тренды дня и базу знаний, пишет ОРИГИНАЛЬНЫЕ посты для ВК и Threads и сценарий короткого ролика,
// второй проход модели ставит оценки 1–10; всё, что ниже 8, переписывается (не больше 2 раз) или выбрасывается.
import path from 'node:path'
import { ROOT, readJson, writeJson, today, dna, llm, bannedHits } from './lib.mjs'
import { vkPosts } from './gen.mjs'

const date = today()
const D = dna()
const trends = readJson(path.join(ROOT, `out/${date}/trends.json`), { google_trends: [], youtube: [] })
const log = readJson(path.join(ROOT, 'knowledge/content-log.json'), [])
const hooks = readJson(path.join(ROOT, 'knowledge/hooks.json'), [])
const perf = readJson(path.join(ROOT, 'knowledge/performance.json'), { top: [], flop: [] })
// программный аудитор для режима без LLM: запреты, длина, эмодзи, вовлечение, короткий хук
function heuristicScore(text) {
  let s = 10
  if (bannedHits(text).length) s -= 5
  if (text.length > 700) s -= 2
  if (!/\p{Extended_Pictographic}/u.test(text)) s -= 1
  if (!/[?👇]/u.test(text) && !/avtohabr/i.test(text)) s -= 1
  if (text.split('\n')[0].length > 140) s -= 1
  return s
}
function fromBank() {
  const MK = path.join(ROOT, '..', 'marketing')
  const bank = [...readJson(path.join(MK, 'threads/queue.json'), []), ...readJson(path.join(MK, 'plan/new-posts-nov.json'), []), ...readJson(path.join(ROOT, 'knowledge/post-bank.json'), [])]
  const used = new Set(log.map((p) => p.text.slice(0, 60)))
  const fresh = bank.filter((p) => !p.video && !used.has(p.text.slice(0, 60))).map((p) => ({ audience: p.id?.startsWith('o-') ? 'owners' : 'drivers', text: p.text, score: heuristicScore(p.text), id: p.id }))
  const good = fresh.filter((p) => p.score >= 8)
  // чередуем: два для водителей, один для владельцев (реклама не чаще каждого третьего)
  const d = good.filter((p) => p.audience === 'drivers'), o = good.filter((p) => p.audience === 'owners')
  const pick = []; while (pick.length < 5 && (d.length || o.length)) { if (d.length) pick.push(d.shift()); if ((pick.length % 3 === 2 || !d.length) && o.length && pick.length < 5) pick.push(o.shift()) }
  // банк кончился — новые посты из генератора по шаблонам (без повторов старых)
  if (pick.length < 5) pick.push(...vkPosts(5 - pick.length, used))
  return { mode: 'bank', vk: pick.slice(0, 5), threads: pick.slice(0, 5), short: null, bank_left: good.length - pick.length }
}
const SCREENS = ['booking', 'schedule', 'boxes', 'order', 'stock', 'catalog', 'price', 'site', 'chat']

const RULES = `Ты пишешь для соцсетей AVTOHABR (${D.what}). Город: ${D.city}. Оффер: ${D.offer}.
Голос: ${D.voice}. Пиши по-русски, как живой человек, разная длина фраз, без markdown, без длинных тире.
Запрещено: ${D.banned.join(', ')}. ${D.never}. Можно опираться только на факты: ${D.facts_allowed.join('; ')}.`

let plan
try {
  plan = await (async () => {
// 1. Reverse Engineering: паттерны хуков из реальных топ-роликов (без копирования текста)
const top = trends.youtube.slice(0, 15).map((v) => `${v.views} просмотров: ${v.title}`).join('\n')
if (top) {
  const r = await llm(RULES, `Вот реальные заголовки популярных коротких роликов в нише за неделю:\n${top}\n\nВыдели 5 приёмов хука (структура, а не текст), темп и монтажные приёмы, которые можно перенести на наш продукт. JSON: {"patterns":[{"pattern":"","why":"","example_for_us":""}]}`, { json: true, temperature: 0.4 })
  hooks.push(...r.patterns.map((p) => ({ ...p, date, source: 'youtube-top' })))
  writeJson(path.join(ROOT, 'knowledge/hooks.json'), hooks.slice(-200))
}

// 2. Strategist
const carTrends = trends.google_trends.filter((t) => t.car).slice(0, 5).map((t) => `${t.title} (${t.traffic})`)
const recent = log.slice(-60).map((p) => p.text.slice(0, 80))
const brief = `Дата: ${date}. Сезон: ${new Date(date).toLocaleString('ru', { month: 'long' })}.
Автотемы из поисковых трендов сегодня: ${carTrends.join('; ') || 'нет'}.
Приёмы хуков: ${hooks.slice(-10).map((h) => h.pattern).join('; ') || 'нет'}.
Что зашло лучше всего: ${perf.top.slice(0, 5).map((p) => p.text?.slice(0, 60)).join(' | ') || 'данных пока нет'}.
Не повторяй эти недавние посты: ${recent.join(' | ')}.

Сделай JSON:
{"vk":[5 постов {"audience":"drivers|owners","text":""}],
 "threads":[5 постов {"audience":"drivers|owners","text":""}],
 "short":{"title":"заголовок до 60 символов с эмодзи","hook":"до 6 слов","beats":[4-6 {"text":"до 7 слов","screen":"один из ${SCREENS.join('|')}"}],"cta":"до 6 слов","caption":"подпись с 4 хэштегами"}}
Реклама продукта не больше чем в каждом третьем посте, остальное юмор, советы по сезону, опросы. Ситуативные посты делай из трендов, если они про машины.`

const audit = async (items) => {
  const r = await llm(RULES + '\nТы строгий редактор.', `Оцени каждый текст 1–10: хук в первой строке, живость (не похоже на ИИ), польза или юмор, соответствие правилам, нет выдуманных фактов. JSON {"scores":[{"i":0,"score":0,"fix":"что исправить"}]}\n\n${items.map((t, i) => `#${i}: ${t}`).join('\n\n')}`, { json: true, temperature: 0 })
  return r.scores
}

let plan = await llm(RULES, brief, { json: true })
for (const key of ['vk', 'threads']) {
  for (let round = 0; round < 3; round++) {
    const scores = await audit(plan[key].map((p) => p.text))
    let bad = 0
    for (const s of scores) {
      const p = plan[key][s.i]; if (!p) continue
      const hits = bannedHits(p.text)
      p.score = hits.length ? Math.min(s.score, 5) : s.score
      p.fix = hits.length ? `убрать: ${hits.join(', ')}` : s.fix
      if (p.score < 8 && round < 2) {
        bad++
        const re = await llm(RULES, `Перепиши пост, исправив: ${p.fix}. Верни JSON {"text":""}.\n\n${p.text}`, { json: true })
        p.text = re.text
      }
    }
    if (!bad) break
  }
  plan[key] = plan[key].filter((p) => p.score >= 8 && !bannedHits(p.text).length)
}
const sAudit = await audit([JSON.stringify(plan.short)])
plan.short.score = sAudit[0]?.score ?? 0

    return plan
  })()
} catch (e) {
  // Бесплатная LLM недоступна (GitHub Models на аккаунте отвечает заглушкой) — честный запасной режим:
  // берём неиспользованные посты из банка и прогоняем через программный аудит.
  console.log(`LLM недоступна (${e.message.slice(0, 120)}), режим банка постов`)
  plan = fromBank()
}
const result = { date, ...plan }
writeJson(path.join(ROOT, `out/${date}/content.json`), result)
for (const k of ['vk', 'threads']) for (const p of plan[k]) log.push({ date, channel: k, text: p.text, score: p.score })
writeJson(path.join(ROOT, 'knowledge/content-log.json'), log.slice(-1000))
console.log(`Контент ${date} (${plan.mode || 'llm'}): ВК ${plan.vk.length}, Threads ${plan.threads.length}${plan.short ? `, ролик «${plan.short.title}»` : ''}${plan.bank_left != null ? `, в банке осталось ${plan.bank_left}` : ''}`)
