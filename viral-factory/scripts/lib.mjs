// Общие функции фабрики: LLM через GitHub Models (бесплатно, токен Actions), чтение/запись базы знаний.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const today = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10) // дата по МСК
export const readJson = (p, d = null) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : d)
export const writeJson = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n') }
export const dna = () => readJson(path.join(ROOT, 'knowledge/project-dna.json'))

const MODEL = process.env.FACTORY_MODEL || 'openai/gpt-4.1-mini'

export async function llm(system, user, { json = false, temperature = 0.9 } = {}) {
  // любой OpenAI-совместимый провайдер по ключу из секретов (LLM_API_KEY, LLM_BASE_URL, LLM_MODEL)
  if (process.env.LLM_API_KEY) {
    const base = process.env.LLM_BASE_URL || 'https://api.openai.com/v1'
    // выбранная владельцем модель; если она недоступна на бесплатном тарифе — проверенная gemini-3.8-flash
    const models = [process.env.LLM_MODEL || 'gpt-4.1-mini', ...(base.includes('googleapis') ? ['gemini-3.8-flash'] : [])]
    let err
    for (const model of [...new Set(models)]) {
      const r = await fetch(`${base}/chat/completions`, {
        signal: AbortSignal.timeout(60_000),
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.LLM_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, temperature, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], ...(json ? { response_format: { type: 'json_object' } } : {}) }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) { err = new Error(`LLM ${model} ${r.status}: ${JSON.stringify(data).slice(0, 200)}`); console.log(err.message); continue }
      const text = data.choices[0].message.content
      return json ? JSON.parse(text.replace(/^```(json)?\s*|\s*```$/g, '')) : text
    }
    throw err
  }
  const token = process.env.GITHUB_TOKEN
  if (!token) throw new Error('GITHUB_TOKEN не задан (нужен permissions: models: read)')
  for (let attempt = 0; attempt < 3; attempt++) {
    const url = attempt === 0 ? 'https://models.github.ai/inference/chat/completions' : 'https://models.inference.ai.azure.com/chat/completions'
    const r = await fetch(url, {
      signal: AbortSignal.timeout(30_000),
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: attempt === 0 ? MODEL : MODEL.split('/').pop(), temperature,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      }),
    })
    if (r.status === 429) { await new Promise((s) => setTimeout(s, 30_000)); continue }
    const raw = await r.text()
    if (!r.ok) throw new Error(`GitHub Models ${r.status}: ${raw.slice(0, 300)}`)
    let data
    try { data = JSON.parse(raw) } catch {
      console.log(`GitHub Models ${url} → ${r.status} ${r.headers.get('content-type')} ${r.url}: ${raw.slice(0, 120)}`)
      continue
    }
    const text = data.choices[0].message.content
    return json ? JSON.parse(text) : text
  }
  throw new Error('GitHub Models: лимит запросов, попробую завтра')
}

// Жёсткая проверка запретов (бренд, признаки ИИ-текста), независимо от оценки модели.
export function bannedHits(text) {
  return dna().banned.filter((w) => text.toLowerCase().includes(w.toLowerCase()))
}
