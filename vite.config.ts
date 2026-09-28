import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// Относительные пути: сборка работает и на GitHub Pages (подпапка), и локально.
// LAB_DIR разрешает dev-серверу отдавать эталонные видео для lab.html; в сборку они не попадают.
export default defineConfig({
  base: './',
  server: {
    fs: { allow: ['.', ...(process.env.LAB_DIR ? [resolve(process.env.LAB_DIR)] : [])] },
  },
})
