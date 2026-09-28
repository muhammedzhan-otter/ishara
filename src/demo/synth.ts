import type { Landmark, NormalizedLandmark } from '@mediapipe/tasks-vision'
import type { SignId } from '../signs/catalog.ts'
import type { Frame } from '../vision/tracker.ts'
import { handPoints } from './handModel.ts'
import { poseAt, rotate } from './motion.ts'
import { DEMOS } from './signDemos.ts'

/*
 * «Кадры камеры» из показа Айгерим: те же 21 точка кисти и точки лица и плеч, какие выдал бы
 * MediaPipe, если бы человек повторил жест точно как в анимации. Нужны автотестам: показ и
 * распознавание описаны независимо, и тест проверяет, что они согласованы.
 */

const W = 1280
const H = 720
/** Ширина плеч и положение носа в пикселях зеркального кадра: человек сидит за ноутбуком. */
const SW = 260
const NOSE = { x: 640, y: 250 }
/** Длина ладони в кадре (как в signDemo.ts) и в метрах для мировых координат. */
const PALM_PX = 0.27 * SW
const PALM_M = 0.09

const lm = (x: number, y: number, visibility = 0.99): NormalizedLandmark =>
  ({ x, y, z: 0, visibility }) as NormalizedLandmark

/** Точка в координатах тела (зеркально) → нормированная точка неотзеркаленного кадра. */
function bodyToImage(bx: number, by: number): { x: number; y: number } {
  return { x: 1 - (NOSE.x + bx * SW) / W, y: (NOSE.y + by * SW) / H }
}

function pose(): NormalizedLandmark[] {
  const at = (bx: number, by: number) => {
    const p = bodyToImage(bx, by)
    return lm(p.x, p.y)
  }
  const list: NormalizedLandmark[] = Array.from({ length: 33 }, () => lm(0.5, 0.5, 0))
  list[0] = at(0, 0)
  // У MediaPipe «левый» глаз и плечо это левые для человека: в зеркале они слева.
  list[2] = at(-0.12, -0.11)
  list[5] = at(0.12, -0.11)
  list[9] = at(-0.07, 0.12)
  list[10] = at(0.07, 0.12)
  list[11] = at(-0.5, 0.55)
  list[12] = at(0.5, 0.55)
  return list
}

export interface SynthOptions {
  fps?: number
  loops?: number
  /** Без лица и плеч: проверка жестов, которым тело не нужно. */
  noBody?: boolean
}

export function synthFrames(sign: SignId, opts: SynthOptions = {}): Frame[] {
  const fps = opts.fps ?? 30
  const demo = DEMOS[sign]
  const shapes = demo.keys.map((k) => handPoints(k.shape))
  const total = demo.keys.at(-1)!.t * (opts.loops ?? 2)
  const body = opts.noBody ? null : pose()
  const frames: Frame[] = []
  for (let i = 0; i * (1000 / fps) < total * 1000; i++) {
    const t = i / fps
    const p = poseAt(demo.keys, shapes, t)
    const wx = NOSE.x + p.pos[0] * SW
    const wy = NOSE.y + p.pos[1] * SW
    const points: NormalizedLandmark[] = []
    const world: Landmark[] = []
    for (const q of p.points) {
      const r = rotate(q, p.rot)
      points.push(lm(1 - (wx + r[0] * PALM_PX) / W, (wy - r[1] * PALM_PX) / H))
      // Мировые координаты MediaPipe: x по неотзеркаленному кадру, y вниз, z от камеры.
      world.push({ x: -r[0] * PALM_M, y: -r[1] * PALM_M, z: -r[2] * PALM_M, visibility: 1 })
    }
    // Опущенная рука уходит за нижний край кадра, её камера не видит.
    const inFrame = (wy - 0.5 * PALM_PX) / H < 0.98
    frames.push({
      hands: inFrame ? [{ points, world, side: 'Right', score: 1 }] : [],
      pose: body,
      width: W,
      height: H,
      timestamp: 1000 + (i * 1000) / fps,
    })
  }
  return frames
}
