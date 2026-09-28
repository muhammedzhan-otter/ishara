import type { Guide } from '../meeting/coach.ts'
import { stateColor } from '../ui/state.ts'
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
  /**
   * Цвет скелета руки. Экраны меняют его через showState() из ui/state.ts, вместе с кольцом плитки:
   * синий «твой ход», янтарный «поправь», зелёный «получилось» (токены --blue, --amber, --green).
   */
  handColor = stateColor('turn')
  /** Цель для руки из подсказки: круг, куда поставить кисть, и стрелка к нему. */
  guide: Guide | null = null

  private tracker = new Tracker()
  private extractor = new FeatureExtractor()
  private listeners = new Set<(t: Tick) => void>()
  private ctx = this.overlay.getContext('2d')!
  private modelsReady: Promise<void> | null = null
  /** Пульс и вращение круга-цели выключаются, если в системе просят меньше движения. */
  private calm = window.matchMedia('(prefers-reduced-motion: reduce)')

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
   * Круг-цель и стрелка от кисти к нему, цвет «поправь» (--amber). Тёмный ореол под линиями,
   * чтобы цель читалась и на светлой стене. Canvas отражается стилями как зеркало,
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
    const scale = c.width / 640
    const color = stateColor('fix')
    const halo = 'rgb(20 14 4 / 50%)'
    const moving = !this.calm.matches

    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    // Пульс: кольцо расходится от края цели и гаснет, раз в 1,6 с.
    if (moving) {
      const k = (now % 1600) / 1600
      ctx.globalAlpha = 0.8 * (1 - k)
      ctx.strokeStyle = color
      ctx.lineWidth = 3 * scale
      ctx.beginPath()
      ctx.arc(t.x, t.y, r * (1 + 0.45 * k), 0, Math.PI * 2)
      ctx.stroke()
      ctx.globalAlpha = 1
    }

    // Сама цель: заливка, тёмный ореол и медленно бегущий пунктир.
    ctx.beginPath()
    ctx.arc(t.x, t.y, r, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.globalAlpha = 0.2
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.strokeStyle = halo
    ctx.lineWidth = 9 * scale
    ctx.stroke()
    ctx.strokeStyle = color
    ctx.lineWidth = 4.5 * scale
    ctx.setLineDash([12 * scale, 7 * scale])
    ctx.lineDashOffset = moving ? -now / 40 : 0
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
        const sx = f.x + ux * 20 * scale
        const sy = f.y + uy * 20 * scale
        const ex = t.x - ux * (r + 6 * scale)
        const ey = t.y - uy * (r + 6 * scale)
        const head = 18 * scale
        const shaft = () => {
          ctx.beginPath()
          ctx.moveTo(sx, sy)
          ctx.lineTo(ex - ux * head * 0.6, ey - uy * head * 0.6)
          ctx.stroke()
        }
        const tip = () => {
          ctx.beginPath()
          ctx.moveTo(ex, ey)
          ctx.lineTo(ex - ux * head - uy * head * 0.6, ey - uy * head + ux * head * 0.6)
          ctx.lineTo(ex - ux * head + uy * head * 0.6, ey - uy * head - ux * head * 0.6)
          ctx.closePath()
        }
        ctx.strokeStyle = halo
        ctx.lineWidth = 10 * scale
        shaft()
        tip()
        ctx.lineWidth = 4 * scale
        ctx.stroke()
        ctx.strokeStyle = color
        ctx.lineWidth = 5 * scale
        shaft()
        tip()
        ctx.fillStyle = color
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
