// Сводный запуск всех автоматических тестов Content Factory
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url))

const testSuites = [
  'test-timezone.mjs',
  'test-image-matcher.mjs',
  'test-prompt-loader.mjs',
  'test-queue.mjs',
  'test-publisher.mjs',
  'test-topic-image.mjs',
]

console.log('====================================================')
console.log('🧪 ЗАПУСК АВТОМАТИЧЕСКИХ ТЕСТОВ CONTENT FACTORY')
console.log('====================================================\n')

let passedCount = 0
let failedCount = 0

for (const suite of testSuites) {
  const suitePath = path.join(CURRENT_DIR, suite)
  console.log(`▶ Запуск: ${suite}...`)

  const res = spawnSync(process.execPath, [suitePath], {
    stdio: 'inherit',
    encoding: 'utf8',
  })

  if (res.status === 0) {
    passedCount++
  } else {
    failedCount++
    console.error(`❌ ТЕСТОВЫЙ НАБОР ${suite} ПРОВАЛИЛСЯ С КОДОМ ${res.status}`)
  }
}

console.log('====================================================')
console.log(`РЕЗУЛЬТАТЫ ТЕСТИРОВАНИЯ:`)
console.log(`  Пройдено наборов: ${passedCount}/${testSuites.length}`)
console.log(`  Провалено наборов: ${failedCount}/${testSuites.length}`)
console.log('====================================================')

if (failedCount > 0) {
  process.exit(1)
} else {
  console.log('🎉 ВСЕ 14 ТРЕБОВАНИЙ ТЕСТИРОВАНИЯ ВЫПОЛНЕНЫ УСПЕШНО!')
  process.exit(0)
}
