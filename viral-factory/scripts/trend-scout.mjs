// Viral Trend Scout: только легальные открытые данные, метрики не выдумываются.
// 1) Google Trends RSS по России (публичный фид): что ищут сегодня, фильтр по автотемам.
// 2) YouTube Data API (если задан YOUTUBE_API_KEY): самые просматриваемые ролики за 7 дней по нишевым запросам.
// 3) RSS каналов YouTube из sources.json (публичный фид, в нём есть реальные просмотры).
import path from 'node:path'
import { ROOT, readJson, writeJson, today } from './lib.mjs'

const src = readJson(path.join(ROOT, 'knowledge/sources.json'))
const out = { date: today(), google_trends: [], youtube: [], notes: [] }
const isCar = (s) => src.car_words.some((w) => s.toLowerCase().includes(w))
const tag = (xml, t) => [...xml.matchAll(new RegExp(`<${t}[^>]*>([\s\S]*?)</${t}>`, 'g'))].map((m) => m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim())

try {
  const xml = await (await fetch(src.google_trends_rss)).text()
  for (const item of xml.split('<item>').slice(1)) {
    const title = tag(item, 'title')[0] || ''
    const traffic = tag(item, 'ht:approx_traffic')[0] || ''
    const news = tag(item, 'ht:news_item_title').slice(0, 2)
    out.google_trends.push({ title, traffic, news, car: isCar(title + ' ' + news.join(' ')) })
  }
} catch (e) { out.notes.push(`Google Trends RSS недоступен: ${e.message}`) }

const key = process.env.YOUTUBE_API_KEY
if (key) {
  const after = new Date(Date.now() - 7 * 864e5).toISOString()
  for (const q of src.youtube_queries) {
    try {
      const s = await (await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoDuration=short&regionCode=RU&relevanceLanguage=ru&order=viewCount&maxResults=5&publishedAfter=${after}&q=${encodeURIComponent(q)}&key=${key}`)).json()
      const ids = (s.items || []).map((i) => i.id.videoId).join(',')
      if (!ids) continue
      const v = await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet,contentDetails&id=${ids}&key=${key}`)).json()
      for (const i of v.items || []) out.youtube.push({ q, id: i.id, title: i.snippet.title, channel: i.snippet.channelTitle, views: +i.statistics.viewCount, likes: +(i.statistics.likeCount || 0), comments: +(i.statistics.commentCount || 0), duration: i.contentDetails.duration })
    } catch (e) { out.notes.push(`YouTube API (${q}): ${e.message}`) }
  }
} else out.notes.push('YOUTUBE_API_KEY не задан: поиск по YouTube пропущен (ключ бесплатный, создаётся в Google Cloud Console)')

for (const url of src.youtube_channel_rss) {
  try {
    const xml = await (await fetch(url)).text()
    for (const e of xml.split('<entry>').slice(1, 6)) {
      out.youtube.push({ title: tag(e, 'title')[0], views: +(e.match(/views="(\d+)"/)?.[1] || 0), channel: tag(xml, 'title')[0], via: 'rss' })
    }
  } catch (e) { out.notes.push(`RSS ${url}: ${e.message}`) }
}

out.youtube.sort((a, b) => b.views - a.views)
writeJson(path.join(ROOT, `out/${out.date}/trends.json`), out)
console.log(`Тренды: Google ${out.google_trends.length} (авто ${out.google_trends.filter((t) => t.car).length}), YouTube ${out.youtube.length}. ${out.notes.join(' | ')}`)
