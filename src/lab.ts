/*
 * Лаборатория: прогоняет видео с жестами через тот же конвейер, что и камера,
 * и складывает признаки по кадрам в window.labResults. Так пороги жестов проверяются
 * на эталонных записях из словарей, а не только на своих руках.
 *
 * Запуск: LAB_DIR=/путь/к/видео npm run dev, затем
 * http://localhost:5173/lab.html?dir=/путь/к/видео&names=privet,poka
 */
import { ALL_SIGNS, type SignId } from './signs/catalog.ts'
import { SignRecognizer } from './signs/recognizer.ts'
import { FeatureExtractor, type FrameFeatures } from './vision/features.ts'
import { Tracker } from './vision/tracker.ts'

interface SignStats {
  /** Моменты, когда жест распознан, в секундах видео. */
  hits: number[]
  best: number
  /** Какие подсказки система выдала бы и сколько кадров подряд. */
  hints: Record<string, number>
}

declare global {
  interface Window {
    labResults: Record<string, FrameFeatures[]>
    labSigns: Record<string, Partial<Record<SignId, SignStats>>>
    labDone: boolean
  }
}

const video = document.querySelector<HTMLVideoElement>('#video')!
const out = document.querySelector<HTMLPreElement>('#out')!
const params = new URLSearchParams(location.search)
const dir = params.get('dir') ?? ''
const names = (params.get('names') ?? '').split(',').filter(Boolean)

window.labResults = {}
window.labSigns = {}
window.labDone = false

function run(name: string, tracker: Tracker, base: number): Promise<FrameFeatures[]> {
  const features = new FeatureExtractor()
  const log: FrameFeatures[] = []
  // Каждый жест проверяем отдельным распознавателем, чтобы срабатывание одного не сбрасывало другие.
  const recognizers = ALL_SIGNS.map((id) => [id, new SignRecognizer()] as const)
  const stats: Partial<Record<SignId, SignStats>> = {}
  window.labSigns[name] = stats
  let active = true
  return new Promise((resolve, reject) => {
    const onFrame = (_now: number, meta: VideoFrameCallbackMetadata) => {
      if (!active) return
      // Время берём из самого видео, чтобы скорость обработки не влияла на траектории.
      const frame = tracker.detect(video, base + meta.mediaTime * 1000)
      const f = features.extract(frame)
      log.push(f)
      for (const [id, rec] of recognizers) {
        const st = rec.update(f, [id])
        const e = st.evals[0]
        if (!e) continue
        const acc = (stats[id] ??= { hits: [], best: 0, hints: {} })
        acc.best = Math.max(acc.best, e.score)
        if (e.failed) acc.hints[e.failed.hint] = (acc.hints[e.failed.hint] ?? 0) + 1
        if (st.recognized) acc.hits.push(Math.round(meta.mediaTime * 10) / 10)
      }
      video.requestVideoFrameCallback(onFrame)
    }
    video.onended = () => {
      active = false
      resolve(log)
    }
    video.onerror = () => reject(new Error(`не открылось видео ${name}`))
    video.src = `/@fs${dir}/${name}.mp4`
    video.requestVideoFrameCallback(onFrame)
    video.play().catch(reject)
  })
}

async function main() {
  const tracker = new Tracker()
  await tracker.init()
  let base = 0
  for (const name of names) {
    out.textContent += `${name}… `
    try {
      window.labResults[name] = await run(name, tracker, base)
      out.textContent += `${window.labResults[name].length} кадров\n`
    } catch (err) {
      out.textContent += `${String(err)}\n`
    }
    base += 1e7
  }
  window.labDone = true
}

main()
