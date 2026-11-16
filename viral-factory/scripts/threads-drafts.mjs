// Threads Engine. API Threads недоступен (аккаунт Facebook владельца отключён), поэтому фабрика готовит
// черновики, а публикуются они вручную или через сайт threads.com (там есть отложенная публикация).
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, readJson, today } from './lib.mjs'
const date = today()
const c = readJson(path.join(ROOT, `out/${date}/content.json`))
if (!c) process.exit(0)
const md = [`# Threads ${date}`, '', ...c.threads.map((p, i) => `## ${['09:00', '12:00', '15:00', '18:00', '21:00'][i]} МСК · ${p.audience} · ${p.score}/10\n\n${p.text}\n`)].join('\n')
fs.writeFileSync(path.join(ROOT, `out/${date}/threads.md`), md)
console.log(`Threads: ${c.threads.length} черновиков`)
