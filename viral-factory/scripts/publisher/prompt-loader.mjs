// Модуль независимой маршрутизации и загрузки промптов.
// Полная изоляция: изменения в Telegram-промптах не влияют на короткие видео,
// а изменения в промптах коротких видео не затрагивают Telegram.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(CURRENT_DIR, '../..')
const PROMPTS_DIR = path.join(ROOT, 'prompts')

export const PROMPT_DOMAINS = {
  TELEGRAM: 'telegram',
  SHORT_VIDEOS: 'short_videos',
}

/**
 * Загрузить промпт по домену и имени файла
 * @param {'telegram'|'short_videos'} domain
 * @param {string} promptName
 * @returns {string} Текст промпта
 */
export function loadPrompt(domain, promptName) {
  if (!Object.values(PROMPT_DOMAINS).includes(domain)) {
    throw new Error(`Недопустимый домен промпта: ${domain}. Допустимы: ${Object.values(PROMPT_DOMAINS).join(', ')}`)
  }

  const cleanName = promptName.endsWith('.md') ? promptName : `${promptName}.md`
  const targetPath = path.join(PROMPTS_DIR, domain, cleanName)

  if (!fs.existsSync(targetPath)) {
    throw new Error(`Файл промпта не найден: ${targetPath}`)
  }

  return fs.readFileSync(targetPath, 'utf8')
}

/**
 * Загрузить Telegram-промпт
 */
export function loadTelegramPrompt(promptName) {
  return loadPrompt(PROMPT_DOMAINS.TELEGRAM, promptName)
}

/**
 * Загрузить промпт коротких видео
 */
export function loadShortVideoPrompt(promptName) {
  return loadPrompt(PROMPT_DOMAINS.SHORT_VIDEOS, promptName)
}

/**
 * Получить список доступных Telegram-промптов
 */
export function listTelegramPrompts() {
  const dir = path.join(PROMPTS_DIR, PROMPT_DOMAINS.TELEGRAM)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md'))
}

/**
 * Получить список доступных промптов коротких видео
 */
export function listShortVideoPrompts() {
  const dir = path.join(PROMPTS_DIR, PROMPT_DOMAINS.SHORT_VIDEOS)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md'))
}
