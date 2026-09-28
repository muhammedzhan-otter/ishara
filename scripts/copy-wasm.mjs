// Копирует WASM-файлы MediaPipe из node_modules в public/, чтобы приложение
// не зависело от внешнего CDN и работало с любого хостинга.
import { cpSync, mkdirSync } from 'node:fs'

const from = 'node_modules/@mediapipe/tasks-vision/wasm'
const to = 'public/mediapipe/wasm'

mkdirSync(to, { recursive: true })
for (const name of [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
]) {
  cpSync(`${from}/${name}`, `${to}/${name}`)
}
console.log(`MediaPipe wasm -> ${to}`)
