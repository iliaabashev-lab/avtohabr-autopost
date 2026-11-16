// Варианты картинки маскота через бесплатную квоту ZeroGPU (FLUX.1-schnell Space), токен HF_TOKEN.
// Персонаж свой: машинка с логотипа AVTOHABR, не копия героев мультфильмов.
import fs from 'node:fs'
import path from 'node:path'
import { Client } from '@gradio/client'
import { ROOT } from './lib.mjs'

const prompt = 'A cute friendly cartoon car mascot, original character, compact white hatchback with soft rounded glossy body, big expressive blue eyes on the windshield, small friendly smiling mouth on the front bumper, thin glowing blue light stripe along the side, round black tyres with silver rims, facing the camera at a three-quarter front view, standing on a dark navy studio floor with soft blue rim light, high quality 3D animated movie style render, centered, vertical composition, no text, no logo'
const out = path.join(ROOT, 'out/mascot')
fs.mkdirSync(out, { recursive: true })
const app = await Client.connect('black-forest-labs/FLUX.1-schnell', { hf_token: process.env.HF_TOKEN })
for (let i = 0; i < 4; i++) {
  try {
    const r = await app.predict('/infer', { prompt, seed: 1000 + i * 77, randomize_seed: false, width: 768, height: 1344, num_inference_steps: 4 })
    const url = r.data[0].url
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
    fs.writeFileSync(path.join(out, `mascot-${i + 1}.webp`), buf)
    console.log(`вариант ${i + 1}: ${buf.length} байт`)
  } catch (e) { console.log(`вариант ${i + 1}: ошибка ${String(e.message || e).slice(0, 200)}`) }
}
