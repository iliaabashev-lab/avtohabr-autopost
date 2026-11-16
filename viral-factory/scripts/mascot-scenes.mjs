// Сцены с маскотом через FLUX.1 Kontext (редактирование по образцу) на бесплатной квоте ZeroGPU (HF_TOKEN).
// Образец — knowledge/mascot3.png (свой персонаж AVTOHABR). Пробный режим: 3 сцены → out/scenes/.
import fs from 'node:fs'
import path from 'node:path'
import { Client, handle_file } from '@gradio/client'
import { ROOT } from './lib.mjs'

const SPACE = process.env.KONTEXT_SPACE || 'black-forest-labs/FLUX.1-Kontext-Dev'
const scenes = [
  'Keep this exact cute white cartoon car character with the same face, eyes and smile. Place it on a snowy winter city street at evening, snowflakes falling, warm street lights, vertical 9:16, cinematic 3D animated movie style',
  'Keep this exact cute white cartoon car character with the same face. It is inside a bright modern car service garage next to a tire changing machine, looking happy, vertical 9:16, cinematic 3D animated movie style',
  'Keep this exact cute white cartoon car character with the same face, now with a surprised open mouth and wide eyes, standing at night under a big glowing clock showing 23:00, vertical 9:16, 3D animated movie style',
]
const out = path.join(ROOT, 'out/scenes')
fs.mkdirSync(out, { recursive: true })
const app = await Client.connect(SPACE, { hf_token: process.env.HF_TOKEN })
const api = await app.view_api()
const ep = Object.keys(api.named_endpoints).find((e) => /infer|generate|edit/i.test(e)) || Object.keys(api.named_endpoints)[0]
const params = api.named_endpoints[ep].parameters
console.log('endpoint', ep, params.map((p) => p.parameter_name).join(','))
for (const [i, prompt] of scenes.entries()) {
  const args = {}
  for (const p of params) {
    const n = p.parameter_name
    if (/image/i.test(n)) args[n] = handle_file(fs.readFileSync(path.join(ROOT, 'knowledge/mascot3.png')))
    else if (/prompt/i.test(n)) args[n] = prompt
    else if (/seed/i.test(n) && !/random/i.test(n)) args[n] = 42 + i
    else if (/random/i.test(n)) args[n] = false
  }
  const t = Date.now()
  try {
    const r = await app.predict(ep, args)
    const img = r.data.find((d) => d && (d.url || d.path)) || r.data[0]
    const url = img.url || img[0]?.url
    fs.writeFileSync(path.join(out, `scene-${i + 1}.webp`), Buffer.from(await (await fetch(url)).arrayBuffer()))
    console.log(`сцена ${i + 1}: ok за ${Math.round((Date.now() - t) / 1000)} с`)
  } catch (e) { console.log(`сцена ${i + 1}: ${String(e.message || e).slice(0, 200)}`) }
}
