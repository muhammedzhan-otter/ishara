/*
 * Загрузка моделей с прогрессом. Модели и WASM весят около 25 МБ, и на медленном
 * интернете без полоски загрузки кажется, что страница зависла.
 */

export type Progress = (fraction: number) => void

interface Job {
  url: string
  loaded: number
  total: number
}

/** Скачивает файлы параллельно и сообщает общий прогресс. Возвращает содержимое каждого файла. */
export async function fetchAll(urls: string[], onProgress?: Progress): Promise<Uint8Array[]> {
  const jobs: Job[] = urls.map((url) => ({ url, loaded: 0, total: 0 }))
  const report = () => {
    const total = jobs.reduce((a, j) => a + j.total, 0)
    if (total > 0) onProgress?.(Math.min(1, jobs.reduce((a, j) => a + j.loaded, 0) / total))
  }

  return Promise.all(
    jobs.map(async (job) => {
      const res = await fetch(job.url)
      if (!res.ok) throw new Error(`${job.url}: ${res.status}`)
      job.total = Number(res.headers.get('content-length')) || 0
      if (!res.body || !job.total) {
        const buf = new Uint8Array(await res.arrayBuffer())
        job.loaded = job.total = buf.byteLength
        report()
        return buf
      }
      const reader = res.body.getReader()
      const chunks: Uint8Array[] = []
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        job.loaded += value.byteLength
        report()
      }
      const buf = new Uint8Array(job.loaded)
      let offset = 0
      for (const c of chunks) {
        buf.set(c, offset)
        offset += c.byteLength
      }
      return buf
    }),
  )
}
