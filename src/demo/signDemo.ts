import type { SignId } from '../signs/catalog.ts'
import { Avatar } from '../ui/avatar.ts'
import { handPoints, type V3 } from './handModel.ts'
import { poseAt, rotate, type Pose } from './motion.ts'
import { DEMOS } from './signDemos.ts'

/*
 * Айгерим показывает жест: поверх рисунка персонажа на canvas рисуются рука в рукаве и кисть.
 * Координаты совпадают с SVG персонажа (viewBox 400×225): нос в (200, 117), ширина плеч 120.
 */

const NOSE = { x: 200, y: 117 }
const SW = 120
/** Длина ладони (запястье → основание среднего пальца) относительно ширины плеч. */
const PALM = 0.27 * SW
const SHOULDER = { x: NOSE.x + 0.55 * SW, y: NOSE.y + 0.64 * SW }
const ELBOW_DROP = 0.62 * SW

const SKIN = '#f0c7a0'
const SKIN_EDGE = '#c98f68'
const SLEEVE = '#c9784c'
const SLEEVE_EDGE = '#8f4f2c'

/** Кадр для показа: от макушки до груди, чтобы жесты у груди помещались. */
export const DEMO_CROP: [number, number, number, number] = [0, 45, 400, 225]

const CHAINS: { idx: number[]; width: number }[] = [
  { idx: [1, 2, 3, 4], width: 0.25 },
  { idx: [5, 6, 7, 8], width: 0.21 },
  { idx: [9, 10, 11, 12], width: 0.21 },
  { idx: [13, 14, 15, 16], width: 0.2 },
  { idx: [17, 18, 19, 20], width: 0.17 },
]
// Контур ладони: края запястья, основание большого пальца, основания остальных.
const PALM_OUTLINE: V3[] = [[-0.34, 0.02, 0], [0.34, 0.08, 0]]

export class SignDemo {
  readonly el: HTMLDivElement
  private canvas = document.createElement('canvas')
  private ctx = this.canvas.getContext('2d')!
  private avatar = new Avatar()
  private sign: SignId | null = null
  private shapes: V3[][] = []
  private started = 0
  private frozen: number | null = null
  private queue: SignId[] = []
  private raf = 0
  /** Область SVG, которую видно в плитке: [x, y, ширина, высота]. */
  private readonly crop: [number, number, number, number]

  constructor(sign: SignId | null = null, crop: [number, number, number, number] = DEMO_CROP) {
    this.crop = crop
    this.el = document.createElement('div')
    this.el.className = 'sign-demo'
    this.avatar.setMood('happy')
    this.avatar.el.querySelector('svg')!.setAttribute('viewBox', crop.join(' '))
    this.canvas.className = 'sign-demo__canvas'
    this.el.append(this.avatar.el, this.canvas)
    if (sign) this.play(sign)
    this.raf = requestAnimationFrame(this.frame)
  }

  play(sign: SignId) {
    this.queue = []
    this.show(sign)
  }

  /** Показывать жесты по очереди, каждый один раз за круг: когда подходят несколько ответов. */
  playAll(signs: SignId[]) {
    this.queue = signs
    this.show(signs[0])
  }

  /** Убрать руку: Айгерим просто сидит и говорит. */
  stop() {
    this.queue = []
    this.sign = null
  }

  private show(sign: SignId) {
    this.sign = sign
    this.shapes = DEMOS[sign].keys.map((k) => handPoints(k.shape))
    this.started = performance.now()
  }

  /** Остановить показ на моменте t секунд (для проверки кадров); null продолжает анимацию. */
  seek(t: number | null) {
    this.frozen = t
  }

  get figure(): Avatar {
    return this.avatar
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame)
    const { canvas, ctx, crop } = this
    const w = canvas.clientWidth
    const hgt = canvas.clientHeight
    if (!w || !hgt) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const W = Math.round(w * dpr)
    const H = Math.round(hgt * dpr)
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W
      canvas.height = H
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, W, H)
    if (!this.sign) return
    // Как у SVG с preserveAspectRatio="xMidYMid slice": заполняем плитку и центрируем,
    // чтобы рука совпадала с рисунком при любых пропорциях плитки.
    const s = Math.max(W / crop[2], H / crop[3])
    const ox = (W - crop[2] * s) / 2 - crop[0] * s
    const oy = (H - crop[3] * s) / 2 - crop[1] * s
    ctx.setTransform(s, 0, 0, s, ox, oy)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    let time = this.frozen ?? (now - this.started) / 1000
    const loop = DEMOS[this.sign].keys.at(-1)!.t
    if (this.queue.length > 1 && time >= loop) {
      this.show(this.queue[(this.queue.indexOf(this.sign) + 1) % this.queue.length])
      time = 0
    }
    const pose = poseAt(DEMOS[this.sign].keys, this.shapes, time)
    ctx.globalAlpha = pose.alpha
    this.drawArm(pose)
    this.drawHand(pose)
    ctx.globalAlpha = 1
  }

  /** Точка кисти в координатах SVG и её глубина (больше значит ближе к зрителю). */
  private project(pose: Pose, p: V3): { x: number; y: number; z: number } {
    const r = rotate(p, pose.rot)
    const wx = NOSE.x + pose.pos[0] * SW
    const wy = NOSE.y + pose.pos[1] * SW
    return { x: wx + r[0] * PALM, y: wy - r[1] * PALM, z: r[2] }
  }

  private drawArm(pose: Pose) {
    const { ctx } = this
    const w = this.project(pose, [0, -0.05, 0])
    // Локоть висит внизу у туловища и лишь немного следует за кистью: на плоском рисунке
    // так выглядит естественнее, чем точная схема из двух звеньев, где локоть задирается вверх.
    const elbow = {
      x: SHOULDER.x + 0.1 * SW + 0.35 * (w.x - SHOULDER.x),
      y: Math.min(SHOULDER.y + ELBOW_DROP + 0.15 * (w.y - SHOULDER.y), (SHOULDER.y + Math.max(w.y, SHOULDER.y + ELBOW_DROP)) / 2 + 0.3 * SW),
    }
    for (const [color, width] of [[SLEEVE_EDGE, 0.19 * SW], [SLEEVE, 0.16 * SW]] as const) {
      ctx.strokeStyle = color
      ctx.lineWidth = width
      ctx.beginPath()
      ctx.moveTo(SHOULDER.x, SHOULDER.y)
      ctx.lineTo(elbow.x, elbow.y)
      ctx.lineTo(w.x, w.y)
      ctx.stroke()
    }
  }

  private drawHand(pose: Pose) {
    const { ctx } = this
    const P = pose.points.map((p) => this.project(pose, p))
    const edge = PALM_OUTLINE.map((p) => this.project(pose, p))
    const palm = [edge[0], P[1], P[5], P[9], P[13], P[17], edge[1]]

    type Part = { z: number; draw: () => void }
    const parts: Part[] = [
      {
        z: palm.reduce((a, p) => a + p.z, 0) / palm.length - 0.02,
        draw: () => {
          ctx.beginPath()
          palm.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
          ctx.closePath()
          ctx.fillStyle = SKIN
          ctx.strokeStyle = SKIN_EDGE
          ctx.lineWidth = 0.06 * PALM
          ctx.fill()
          ctx.stroke()
        },
      },
      ...CHAINS.map(({ idx, width }) => ({
        z: idx.reduce((a, i) => a + P[i].z, 0) / idx.length,
        draw: () => {
          for (const [color, extra] of [[SKIN_EDGE, 0.07], [SKIN, 0]] as const) {
            ctx.strokeStyle = color
            ctx.lineWidth = (width + extra) * PALM
            ctx.beginPath()
            idx.forEach((i, j) => (j ? ctx.lineTo(P[i].x, P[i].y) : ctx.moveTo(P[i].x, P[i].y)))
            ctx.stroke()
          }
        },
      })),
    ]
    parts.sort((a, b) => a.z - b.z)
    for (const part of parts) part.draw()
  }

  destroy() {
    cancelAnimationFrame(this.raf)
  }
}
