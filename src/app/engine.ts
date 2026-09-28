import type { Guide } from '../meeting/coach.ts'
import { startCamera } from '../vision/camera.ts'
import { FeatureExtractor, type Body, type FrameFeatures } from '../vision/features.ts'
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
  /** Цель для руки из подсказки: круг, куда поставить кисть, и стрелка к нему. */
  guide: Guide | null = null

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
      if (this.guide && features.body) this.drawGuide(this.guide, features.body, now)
      for (const fn of this.listeners) fn({ frame, features })
    }
    requestAnimationFrame(this.loop)
  }

  /**
   * Круг-цель и стрелка от кисти к нему. Canvas отражается стилями как зеркало,
   * поэтому зеркальные координаты тела переводим обратно в координаты кадра.
   */
  private drawGuide(guide: Guide, body: Body, now: number) {
    const { ctx, overlay: c } = this
    const toCanvas = (p: { x: number; y: number }) => ({
      x: c.width - (body.nose.x + p.x * body.shoulderWidth),
      y: body.nose.y + p.y * body.shoulderWidth,
    })
    const t = toCanvas(guide.target)
    const r = guide.target.r * body.shoulderWidth
    const pulse = 1 + 0.08 * Math.sin(now / 180)
    const scale = c.width / 640

    ctx.save()
    ctx.strokeStyle = '#ffb547'
    ctx.fillStyle = 'rgb(255 181 71 / 16%)'
    ctx.lineWidth = 4 * scale
    ctx.setLineDash([10 * scale, 8 * scale])
    ctx.beginPath()
    ctx.arc(t.x, t.y, r * pulse, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.setLineDash([])

    if (guide.from) {
      const f = toCanvas(guide.from)
      const dx = t.x - f.x
      const dy = t.y - f.y
      const d = Math.hypot(dx, dy)
      if (d > r * 1.2) {
        // Стрелка от кисти до края круга.
        const ux = dx / d
        const uy = dy / d
        const ex = t.x - ux * r
        const ey = t.y - uy * r
        const head = 18 * scale
        ctx.lineWidth = 6 * scale
        ctx.beginPath()
        ctx.moveTo(f.x + ux * 20 * scale, f.y + uy * 20 * scale)
        ctx.lineTo(ex, ey)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(ex, ey)
        ctx.lineTo(ex - ux * head - uy * head * 0.6, ey - uy * head + ux * head * 0.6)
        ctx.lineTo(ex - ux * head + uy * head * 0.6, ey - uy * head - ux * head * 0.6)
        ctx.closePath()
        ctx.fillStyle = '#ffb547'
        ctx.fill()
      }
    }
    ctx.restore()
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
