import { defineConfig } from 'vite'

// Относительные пути: сборка работает и на GitHub Pages (подпапка), и локально.
export default defineConfig({
  base: './',
})
