// Фото к посту — только по теме; чужие фото (сделанные под другой пост) и недавно использованные не берём.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pickTopicImage } from '../scripts/publisher/topic-image.mjs'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'topic-img-'))
const big = Buffer.alloc(60_000, 1)
for (const f of ['work_wheel_brakes.jpg', 'collage_service.jpg', 'tg_20261104_x.jpg', 'mascot_battery.jpg']) fs.writeFileSync(path.join(dir, f), big)

assert.equal(path.basename(pickTopicImage({ dirs: [dir], tag: 'тормоза' })), 'work_wheel_brakes.jpg')
console.log('  ✅ тормоза → фото тормозов')
assert.equal(pickTopicImage({ dirs: [dir], tag: 'утечка' }), null)
console.log('  ✅ нет фото по теме → пост без фото (не случайный снимок)')
assert.equal(pickTopicImage({ dirs: [dir], tag: 'аккумулятор', recent: new Set(['mascot_battery.jpg']) }), null)
console.log('  ✅ то же фото два поста подряд не ставим')
fs.writeFileSync(path.join(dir, 'tg_battery_other_post.jpg'), big)
assert.equal(pickTopicImage({ dirs: [dir], tag: 'аккумулятор', recent: new Set(['mascot_battery.jpg']) }), null)
console.log('  ✅ фото, сделанное под чужой пост, не берём')
fs.rmSync(dir, { recursive: true, force: true })

// новые фото владельца: папка images/new, имя любое, каждое — один раз
const inbox = fs.mkdtempSync(path.join(os.tmpdir(), 'inbox-'))
assert.equal(pickTopicImage({ dirs: [], inbox: [inbox], tag: 'утечка' }), null)
console.log('  ✅ новых фото нет → пост текстом')
fs.writeFileSync(path.join(inbox, 'IMG_2041.jpg'), big)
assert.equal(path.basename(pickTopicImage({ dirs: [], inbox: [inbox], tag: 'утечка' })), 'IMG_2041.jpg')
console.log('  ✅ положили фото в images/new → пост с фото')
assert.equal(pickTopicImage({ dirs: [], inbox: [inbox], tag: 'утечка', used: new Set(['IMG_2041.jpg']) }), null)
console.log('  ✅ это фото уже вышло → дальше снова текст')
fs.rmSync(inbox, { recursive: true, force: true })
