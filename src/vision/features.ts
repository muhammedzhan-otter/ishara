import type { Frame, Hand } from './tracker.ts'

/*
 * Признаки жеста поверх точек MediaPipe.
 * Жестовый язык описывает жест формой кисти, ориентацией ладони, местом и движением,
 * поэтому и здесь считаем ровно эти четыре вещи.
 *
 * Все координаты «как в зеркале»: x вправо по экрану, который видит человек, y вниз.
 * Координаты тела: (0, 0) это нос, единица длины это ширина плеч.
 */

export type FingerName = 'thumb' | 'index' | 'middle' | 'ring' | 'pinky'
export const FINGERS: FingerName[] = ['thumb', 'index', 'middle', 'ring', 'pinky']

// Индексы точек MediaPipe Hand: запястье 0, дальше по четыре точки на палец от основания к кончику.
const CHAIN: Record<FingerName, [number, number, number, number]> = {
  thumb: [1, 2, 3, 4],
  index: [5, 6, 7, 8],
  middle: [9, 10, 11, 12],
  ring: [13, 14, 15, 16],
  pinky: [17, 18, 19, 20],
}
const WRIST = 0
const PALM = [0, 5, 9, 13, 17]

// Точки MediaPipe Pose.
const NOSE = 0
const EYE_L = 2
const EYE_R = 5
const MOUTH_L = 9
const MOUTH_R = 10
const SHOULDER_L = 11
const SHOULDER_R = 12

export interface Vec2 {
  x: number
  y: number
}
interface Vec3 {
  x: number
  y: number
  z: number
}

export interface Body {
  /** Ширина плеч в пикселях кадра. */
  shoulderWidth: number
  /** Высоты (в координатах тела) линий глаз, рта, подбородка и плеч. */
  eyeY: number
  mouthY: number
  chinY: number
  shoulderY: number
}

export type Region = 'head' | 'face' | 'chin' | 'chest' | 'belly' | 'side'

export interface HandFeatures {
  side: 'Left' | 'Right'
  /** Разогнутость пальцев: 0 согнут в кулак, 1 прямой. */
  ext: Record<FingerName, number>
  /** Насколько большой палец отведён от ладони: 0 прижат, 1 отставлен. */
  thumbOut: number
  /** Расстояние между кончиками большого и указательного в долях ладони. */
  pinch: number
  /** Куда смотрит ладонь: toCamera 1 значит к собеседнику, -1 к себе; up 1 к потолку. */
  palm: { toCamera: number; up: number; right: number }
  /** Куда направлены пальцы: up 1 вверх, right 1 вправо по экрану. */
  pointing: { up: number; right: number; toCamera: number }
  /** Центр ладони и кончик указательного пальца в координатах тела (если тело видно). */
  palmPos: Vec2 | null
  tipPos: Vec2 | null
  region: Region | null
  /** Центр ладони на экране, 0..1, уже отзеркален. */
  screen: Vec2
}

export interface FrameFeatures {
  hands: HandFeatures[]
  body: Body | null
  timestamp: number
}

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z
const len = (a: Vec3) => Math.hypot(a.x, a.y, a.z)
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
})
const unit = (a: Vec3): Vec3 => {
  const l = len(a) || 1
  return { x: a.x / l, y: a.y / l, z: a.z / l }
}
const angle = (a: Vec3, b: Vec3) => Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (len(a) * len(b) || 1))))
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const DEG = Math.PI / 180

/** Сумма углов сгиба в суставах пальца: у прямого пальца около нуля, у кулака больше 180°. */
function fingerBend(w: Vec3[], f: FingerName): number {
  const [a, b, c, d] = CHAIN[f].map((i) => w[i])
  let bend = angle(sub(b, a), sub(c, b)) + angle(sub(c, b), sub(d, c))
  if (f !== 'thumb') bend += angle(sub(a, w[WRIST]), sub(b, a))
  return bend
}

function bodyFrame(frame: Frame): Body | null {
  const p = frame.pose
  if (!p) return null
  const W = frame.width
  const H = frame.height
  const px = (i: number) => ({ x: (1 - p[i].x) * W, y: p[i].y * H })
  const sl = px(SHOULDER_L)
  const sr = px(SHOULDER_R)
  const shoulderWidth = Math.hypot(sl.x - sr.x, sl.y - sr.y)
  if (shoulderWidth < 20) return null

  const nose = px(NOSE)
  const toBodyY = (y: number) => (y - nose.y) / shoulderWidth
  const eyeY = toBodyY((px(EYE_L).y + px(EYE_R).y) / 2)
  const mouthY = toBodyY((px(MOUTH_L).y + px(MOUTH_R).y) / 2)
  return {
    shoulderWidth,
    eyeY,
    mouthY,
    // Подбородок Pose не отдаёт: он примерно на две трети «глаза–рот» ниже рта.
    chinY: mouthY + (mouthY - eyeY) * 0.7,
    shoulderY: toBodyY((sl.y + sr.y) / 2),
  }
}

function regionOf(p: Vec2, body: Body): Region {
  if (Math.abs(p.x) > 0.85) return 'side'
  if (p.y < body.eyeY - 0.05) return 'head'
  if (p.y < body.mouthY - 0.02) return 'face'
  if (p.y < body.chinY + 0.12) return 'chin'
  if (p.y < body.shoulderY + 0.9) return 'chest'
  return 'belly'
}

/** Сглаживает признаки во времени, чтобы подсказки не дрожали от кадра к кадру. */
class Smoother {
  private prev = new Map<string, number>()
  private readonly alpha: number

  constructor(alpha: number) {
    this.alpha = alpha
  }

  next(key: string, value: number): number {
    const old = this.prev.get(key)
    const v = old === undefined ? value : old + (value - old) * this.alpha
    this.prev.set(key, v)
    return v
  }

  forget(prefix: string) {
    for (const k of this.prev.keys()) if (k.startsWith(prefix)) this.prev.delete(k)
  }
}

export class FeatureExtractor {
  private smooth = new Smoother(0.5)

  extract(frame: Frame): FrameFeatures {
    const body = bodyFrame(frame)
    const seen = new Set(frame.hands.map((h) => h.side))
    for (const side of ['Left', 'Right'] as const) if (!seen.has(side)) this.smooth.forget(side)

    return {
      hands: frame.hands.map((h) => this.hand(h, frame, body)),
      body,
      timestamp: frame.timestamp,
    }
  }

  private hand(h: Hand, frame: Frame, body: Body | null): HandFeatures {
    const w = h.world
    const s = (k: string, v: number) => this.smooth.next(`${h.side}.${k}`, v)
    const palmSize = len(sub(w[9], w[WRIST])) || 1

    const ext = {} as Record<FingerName, number>
    for (const f of FINGERS) {
      // Прямой палец: изгиб до ~25°, кулак: 180° и больше. У большого пальца суставов меньше.
      const [lo, hi] = f === 'thumb' ? [15 * DEG, 90 * DEG] : [25 * DEG, 180 * DEG]
      ext[f] = s(`ext.${f}`, clamp01(1 - (fingerBend(w, f) - lo) / (hi - lo)))
    }
    const thumbOut = s('thumbOut', clamp01((len(sub(w[4], w[5])) / palmSize - 0.35) / 0.6))
    const pinch = s('pinch', len(sub(w[4], w[8])) / palmSize)

    // Нормаль ладони. Для правой руки векторное произведение «указательный × мизинец»
    // смотрит из ладони; для левой руки оно зеркальное, поэтому меняем знак.
    let n = unit(cross(sub(w[5], w[WRIST]), sub(w[17], w[WRIST])))
    if (h.side === 'Left') n = { x: -n.x, y: -n.y, z: -n.z }
    const dir = unit(sub(w[9], w[WRIST]))
    // В MediaPipe z растёт от камеры, y вниз, x по неотзеркаленному кадру.
    const palm = { toCamera: s('palm.z', -n.z), up: s('palm.y', -n.y), right: s('palm.x', -n.x) }
    const pointing = { up: s('dir.y', -dir.y), right: s('dir.x', -dir.x), toCamera: s('dir.z', -dir.z) }

    const W = frame.width
    const H = frame.height
    const pts = h.points
    const center = PALM.reduce((acc, i) => ({ x: acc.x + pts[i].x / PALM.length, y: acc.y + pts[i].y / PALM.length }), { x: 0, y: 0 })
    const screen = { x: 1 - center.x, y: center.y }

    let palmPos: Vec2 | null = null
    let tipPos: Vec2 | null = null
    let region: Region | null = null
    if (body && frame.pose) {
      const nose = { x: (1 - frame.pose[NOSE].x) * W, y: frame.pose[NOSE].y * H }
      const toBody = (x: number, y: number) => ({
        x: ((1 - x) * W - nose.x) / body.shoulderWidth,
        y: (y * H - nose.y) / body.shoulderWidth,
      })
      palmPos = toBody(center.x, center.y)
      palmPos = { x: s('pos.x', palmPos.x), y: s('pos.y', palmPos.y) }
      tipPos = toBody(pts[8].x, pts[8].y)
      region = regionOf(palmPos, body)
    }

    return { side: h.side, ext, thumbOut, pinch, palm, pointing, palmPos, tipPos, region, screen }
  }
}

/** Траектория руки за последние мгновения: из неё видно взмах, кивок кулаком, движение от лица. */
export class MotionTrack {
  private samples: { t: number; p: Vec2 }[] = []
  private readonly keepMs: number

  constructor(keepMs = 1500) {
    this.keepMs = keepMs
  }

  push(t: number, p: Vec2) {
    this.samples.push({ t, p })
    while (this.samples.length && t - this.samples[0].t > this.keepMs) this.samples.shift()
  }

  clear() {
    this.samples = []
  }

  private window(ms: number) {
    const last = this.samples.at(-1)
    return last ? this.samples.filter((s) => last.t - s.t <= ms) : []
  }

  /** Смещение от начала окна до текущего положения. */
  displacement(ms: number): Vec2 {
    const w = this.window(ms)
    if (w.length < 2) return { x: 0, y: 0 }
    return { x: w.at(-1)!.p.x - w[0].p.x, y: w.at(-1)!.p.y - w[0].p.y }
  }

  /** Размах движения по оси за окно. */
  range(ms: number, axis: 'x' | 'y'): number {
    const w = this.window(ms)
    if (!w.length) return 0
    const v = w.map((s) => s.p[axis])
    return Math.max(...v) - Math.min(...v)
  }

  /** Сколько раз рука сменила направление по оси с размахом не меньше minAmp: взмахи и покачивания. */
  swings(ms: number, axis: 'x' | 'y', minAmp: number): number {
    const w = this.window(ms)
    if (!w.length) return 0
    let count = 0
    let dir = 0
    let hi = w[0].p[axis]
    let lo = hi
    let extreme = hi
    for (const { p } of w) {
      const v = p[axis]
      if (dir === 0) {
        hi = Math.max(hi, v)
        lo = Math.min(lo, v)
        if (hi - v >= minAmp) [dir, extreme] = [-1, v]
        else if (v - lo >= minAmp) [dir, extreme] = [1, v]
      } else if (dir === 1) {
        if (v > extreme) extreme = v
        else if (extreme - v >= minAmp) [count, dir, extreme] = [count + 1, -1, v]
      } else {
        if (v < extreme) extreme = v
        else if (v - extreme >= minAmp) [count, dir, extreme] = [count + 1, 1, v]
      }
    }
    return count
  }
}
