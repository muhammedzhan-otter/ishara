import { startCamera } from '../vision/camera.ts'
import { FeatureExtractor, type FrameFeatures } from '../vision/features.ts'
import type { Progress } from '../vision/loader.ts'
import { HAND_CONNECTIONS, Tracker, type Frame } from '../vision/tracker.ts'

export interface Tick {
  frame: Frame
  features: FrameFeatures
}

/**
 * Камера и распознавание, общие для всех экранов. Видео и слой со скелетом рук
 * переносятся в плитку того экрана, который сейчас открыт.
 */
export class Engine {
  readonly video = document.createElement('video')
  readonly overlay = document.createElement('canvas')
  /** Цвет скелета руки: экраны меняют его, чтобы подсветить успех или ошибку. */
  handColor = '#4f7cff'

  private tracker = new Tracker()
  private extractor = new FeatureExtractor()
  private listeners = new Set<(t: Tick) => void>()
  private ctx = this.overlay.getContext('2d')!
  private modelsReady: Promise<void> | null = null

  constructor() {
    this.video.className = 'feed'
    this.video.autoplay = true
    this.video.muted = true
    this.video.playsInline = true
    this.overlay.className = 'feed'
  }

  /** Модели можно грузить до того, как человек разрешит камеру. */
  loadModels(onProgress?: Progress): Promise<void> {
    this.modelsReady ??= this.tracker.init(onProgress)
    return this.modelsReady
  }

  async start(): Promise<void> {
    await Promise.all([startCamera(this.video), this.loadModels()])
    requestAnimationFrame(this.loop)
  }

  /** Показывает видео и скелет рук внутри указанного контейнера. */
  mount(container: HTMLElement) {
    container.prepend(this.video, this.overlay)
  }

  on(fn: (t: Tick) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private loop = (now: number) => {
    if (this.video.readyState >= 2) {
      const frame = this.tracker.detect(this.video, now)
      const features = this.extractor.extract(frame)
      this.draw(frame)
      for (const fn of this.listeners) fn({ frame, features })
    }
    requestAnimationFrame(this.loop)
  }

  private draw(frame: Frame) {
    const { overlay: c, ctx } = this
    if (c.width !== frame.width || c.height !== frame.height) {
      c.width = frame.width
      c.height = frame.height
    }
    ctx.clearRect(0, 0, c.width, c.height)
    const scale = c.width / 640
    ctx.lineCap = 'round'
    for (const hand of frame.hands) {
      const px = (i: number) => [hand.points[i].x * c.width, hand.points[i].y * c.height] as const
      ctx.strokeStyle = this.handColor
      ctx.lineWidth = 4 * scale
      for (const { start, end } of HAND_CONNECTIONS) {
        const [x1, y1] = px(start)
        const [x2, y2] = px(end)
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()
      }
      ctx.fillStyle = '#fff'
      for (let i = 0; i < hand.points.length; i++) {
        const [x, y] = px(i)
        ctx.beginPath()
        ctx.arc(x, y, 3.5 * scale, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
}
