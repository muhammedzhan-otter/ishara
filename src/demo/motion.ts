import { lerp3, type V3 } from './handModel.ts'
import type { Key } from './signDemos.ts'

/* Интерполяция ключевых кадров показа: общая для рисования и для автотестов. */

const DEG = Math.PI / 180

/** Поворот R = Ry(yaw) · Rx(pitch) · Rz(roll). */
export function rotate([x, y, z]: V3, [pitch, yaw, roll]: [number, number, number]): V3 {
  const cr = Math.cos(roll * DEG), sr = Math.sin(roll * DEG)
  ;[x, y] = [x * cr - y * sr, x * sr + y * cr]
  const cp = Math.cos(pitch * DEG), sp = Math.sin(pitch * DEG)
  ;[y, z] = [y * cp - z * sp, y * sp + z * cp]
  const cy = Math.cos(yaw * DEG), sy = Math.sin(yaw * DEG)
  ;[x, z] = [x * cy + z * sy, -x * sy + z * cy]
  return [x, y, z]
}

const smooth = (k: number) => k * k * (3 - 2 * k)
const mix = (a: number, b: number, k: number) => a + (b - a) * k

export interface Pose {
  points: V3[]
  pos: [number, number]
  rot: [number, number, number]
  alpha: number
}

export function poseAt(keys: Key[], shapes: V3[][], time: number): Pose {
  const total = keys[keys.length - 1].t
  const t = time % total
  let i = 0
  while (i < keys.length - 2 && keys[i + 1].t <= t) i++
  const a = keys[i]
  const b = keys[i + 1]
  const k = smooth(Math.min(1, (t - a.t) / Math.max(1e-6, b.t - a.t)))
  const ra = a.rot ?? [0, 0, 0]
  const rb = b.rot ?? [0, 0, 0]
  return {
    points: shapes[i].map((p, j) => lerp3(p, shapes[i + 1][j], k)),
    pos: [mix(a.pos[0], b.pos[0], k), mix(a.pos[1], b.pos[1], k)],
    rot: [mix(ra[0], rb[0], k), mix(ra[1], rb[1], k), mix(ra[2], rb[2], k)],
    alpha: mix(a.alpha ?? 1, b.alpha ?? 1, k),
  }
}

