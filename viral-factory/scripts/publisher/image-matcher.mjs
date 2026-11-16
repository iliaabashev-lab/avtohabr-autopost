// Модуль детерминированной привязки и валидации изображений для постов.
// Гарантирует: post_id -> image_id -> image_path.
// Никакого случайного выбора или выбора по порядку файлов.

import fs from 'node:fs'
import path from 'node:path'

export const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png'])

/**
 * @typedef {Object} ImageValidationResult
 * @property {boolean} valid - Файл существует и готов к отправке в sendPhoto
 * @property {string|null} path - Абсолютный путь к файлу
 * @property {string|null} error - Описание ошибки валидации
 * @property {string|null} mimeType - MIME-тип
 * @property {number} size - Размер файла в байтах
 */

/**
 * Валидировать путь к изображению для публикации
 * @param {string} rawPath - Путь к изображению (абсолютный или относительный)
 * @param {string} rootDir - Корневая директория проекта
 * @returns {ImageValidationResult}
 */
export function validateImage(rawPath, rootDir) {
  if (!rawPath || typeof rawPath !== 'string') {
    return { valid: false, path: null, error: 'Путь к изображению не указан', mimeType: null, size: 0 }
  }

  const resolvedPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(rootDir, rawPath)

  if (!fs.existsSync(resolvedPath)) {
    return { valid: false, path: resolvedPath, error: `Файл не найден: ${resolvedPath}`, mimeType: null, size: 0 }
  }

  try {
    const stat = fs.statSync(resolvedPath)
    if (!stat.isFile()) {
      return { valid: false, path: resolvedPath, error: `Указанный путь не является файлом: ${resolvedPath}`, mimeType: null, size: 0 }
    }

    if (stat.size === 0) {
      return { valid: false, path: resolvedPath, error: `Файл изображения пуст (0 байт): ${resolvedPath}`, mimeType: null, size: 0 }
    }

    // Telegram Bot API sendPhoto имеет лимит 10 МБ для фото
    if (stat.size > 10 * 1024 * 1024) {
      return { valid: false, path: resolvedPath, error: `Файл превышает лимит 10 МБ для sendPhoto: ${(stat.size / 1024 / 1024).toFixed(1)} МБ`, mimeType: null, size: stat.size }
    }

    const ext = path.extname(resolvedPath).toLowerCase()
    let mimeType = 'application/octet-stream'

    if (ext === '.jpg' || ext === '.jpeg') {
      mimeType = 'image/jpeg'
    } else if (ext === '.png') {
      mimeType = 'image/png'
    } else if (ext === '.webp') {
      // Предупреждение: Telegram Bot API часто отклоняет WebP в sendPhoto
      return {
        valid: false,
        path: resolvedPath,
        error: `Формат .webp не поддерживается Telegram API sendPhoto (допустимы: .jpg, .jpeg, .png). Файл: ${resolvedPath}`,
        mimeType: 'image/webp',
        size: stat.size,
      }
    } else {
      return {
        valid: false,
        path: resolvedPath,
        error: `Неподдерживаемый формат изображения "${ext}". Допустимы: ${Array.from(SUPPORTED_EXTENSIONS).join(', ')}`,
        mimeType,
        size: stat.size,
      }
    }

    // Проверяем доступность чтения
    fs.accessSync(resolvedPath, fs.constants.R_OK)

    return {
      valid: true,
      path: resolvedPath,
      error: null,
      mimeType,
      size: stat.size,
    }
  } catch (err) {
    return {
      valid: false,
      path: resolvedPath,
      error: `Ошибка доступа к файлу: ${err.message}`,
      mimeType: null,
      size: 0,
    }
  }
}

/**
 * Создать детерминированную привязку поста к изображению
 * @param {string} postId - Уникальный ID поста
 * @param {string} imagePath - Путь к файлу изображения
 * @param {string} rootDir - Корень проекта
 * @param {boolean} allowTextFallback - Разрешена ли публикация без фото в случае сбоя файла
 */
export function createPostImageBinding(postId, imagePath, rootDir, allowTextFallback = false) {
  const validation = validateImage(imagePath, rootDir)
  const imageId = imagePath ? path.basename(imagePath) : null

  return {
    post_id: postId,
    image_id: imageId,
    image_path: validation.path || imagePath,
    image_valid: validation.valid,
    image_error: validation.error,
    mime_type: validation.mimeType,
    allow_text_fallback: allowTextFallback,
  }
}
