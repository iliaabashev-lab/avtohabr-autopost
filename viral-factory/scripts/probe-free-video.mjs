// Честная проверка бесплатной генерации видео (Cloud Video Generation Engine).
// Пробует публичные Spaces на Hugging Face ZeroGPU через официальный клиент Gradio.
// Без HF_TOKEN работает анонимная квота, с HF_TOKEN бесплатного аккаунта — квота аккаунта. Ничего платного не вызывается.
import path from 'node:path'
import { Client } from '@gradio/client'
import { ROOT, writeJson, today } from './lib.mjs'

const SPACES = (process.env.PROBE_SPACES || 'Lightricks/ltx-video-distilled,Wan-AI/Wan2.2-5B,multimodalart/wan2-1-fast').split(',')
const prompt = 'Vertical 9:16, smartphone on a dark desk shows a car service booking app, a finger taps a time slot, soft blue light, cinematic'
const report = { date: today(), hf_token: !!process.env.HF_TOKEN, results: [] }

for (const id of SPACES) {
  const row = { space: id }
  try {
    const app = await Client.connect(id, process.env.HF_TOKEN ? { hf_token: process.env.HF_TOKEN } : {})
    const api = await app.view_api()
    row.endpoints = Object.keys(api.named_endpoints)
    const ep = row.endpoints.find((e) => /generate|text_to_video|t2v|infer|predict/i.test(e))
    if (ep) {
      const params = Object.fromEntries(api.named_endpoints[ep].parameters.filter((p) => /prompt/i.test(p.parameter_name)).map((p) => [p.parameter_name, prompt]))
      const t = Date.now()
      const res = await Promise.race([app.predict(ep, params), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout 6 min')), 360e3))])
      row.ok = true; row.seconds = Math.round((Date.now() - t) / 1000); row.output = JSON.stringify(res.data).slice(0, 300)
    } else row.note = 'нет понятного эндпоинта генерации'
  } catch (e) { row.ok = false; row.error = String(e.message || e).slice(0, 300) }
  report.results.push(row)
  console.log(JSON.stringify(row))
}
writeJson(path.join(ROOT, `out/${report.date}/free-video-probe.json`), report)
