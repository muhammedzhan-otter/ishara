import type { SignId } from '../signs/catalog.ts'
import { SHAPES, type Shape } from './handModel.ts'

/*
 * Как Айгерим показывает каждый жест: ключевые кадры движения правой руки «как в зеркале».
 * pos: где запястье, в координатах тела (0,0 нос, единица ширина плеч, y вниз).
 * rot: наклон кисти [pitch, yaw, roll] в градусах. Места и повороты взяты из замеров
 * словарных видео в lab.html, поэтому показ совпадает с тем, что проверяет распознавание.
 */

export interface Key {
  t: number
  shape: Shape
  pos: [number, number]
  rot?: [number, number, number]
  alpha?: number
}

export interface Demo {
  keys: Key[]
}

const REST: [number, number] = [0.55, 1.6]

export const DEMOS: Record<SignId, Demo> = {
  privet: {
    keys: [
      { t: 0, shape: SHAPES.rest, pos: REST, rot: [0, -25, 0] },
      { t: 0.5, shape: SHAPES.open, pos: [0.56, 0.52], rot: [0, -25, -12] },
      { t: 0.75, shape: SHAPES.open, pos: [0.58, 0.52], rot: [0, -25, 14] },
      { t: 1.0, shape: SHAPES.open, pos: [0.54, 0.52], rot: [0, -25, -14] },
      { t: 1.25, shape: SHAPES.open, pos: [0.58, 0.52], rot: [0, -25, 14] },
      { t: 1.5, shape: SHAPES.open, pos: [0.54, 0.52], rot: [0, -25, -14] },
      { t: 1.75, shape: SHAPES.open, pos: [0.56, 0.52], rot: [0, -25, 8] },
      { t: 2.3, shape: SHAPES.open, pos: [0.56, 0.54], rot: [0, -25, 0] },
      { t: 2.9, shape: SHAPES.rest, pos: REST, rot: [0, -25, 0] },
      { t: 3.4, shape: SHAPES.rest, pos: REST, rot: [0, -25, 0] },
    ],
  },
  poka: {
    keys: [
      { t: 0, shape: SHAPES.rest, pos: REST, rot: [0, -25, 0] },
      { t: 0.5, shape: SHAPES.open, pos: [0.56, 0.5], rot: [0, -25, 0] },
      { t: 0.75, shape: SHAPES.squeeze, pos: [0.56, 0.5], rot: [0, -25, 0] },
      { t: 1.0, shape: SHAPES.open, pos: [0.56, 0.5], rot: [0, -25, 0] },
      { t: 1.25, shape: SHAPES.squeeze, pos: [0.56, 0.5], rot: [0, -25, 0] },
      { t: 1.5, shape: SHAPES.open, pos: [0.56, 0.5], rot: [0, -25, 0] },
      { t: 1.75, shape: SHAPES.squeeze, pos: [0.56, 0.5], rot: [0, -25, 0] },
      { t: 2.0, shape: SHAPES.open, pos: [0.56, 0.5], rot: [0, -25, 0] },
      { t: 2.4, shape: SHAPES.open, pos: [0.56, 0.5], rot: [0, -25, 0] },
      { t: 2.9, shape: SHAPES.rest, pos: REST, rot: [0, -25, 0] },
      { t: 3.3, shape: SHAPES.rest, pos: REST, rot: [0, -25, 0] },
    ],
  },
  spasibo: {
    keys: [
      { t: 0, shape: SHAPES.rest, pos: REST, rot: [0, 180, 0] },
      { t: 0.55, shape: SHAPES.fist, pos: [0.13, 0.03], rot: [0, 180, 8] },
      { t: 0.95, shape: SHAPES.fist, pos: [0.13, 0.03], rot: [0, 180, 8] },
      { t: 1.45, shape: SHAPES.fist, pos: [0.04, 0.5], rot: [0, 180, 5] },
      { t: 1.95, shape: SHAPES.fist, pos: [0.04, 0.5], rot: [0, 180, 5] },
      { t: 2.5, shape: SHAPES.rest, pos: REST, rot: [0, 180, 0] },
      { t: 3.0, shape: SHAPES.rest, pos: REST, rot: [0, 180, 0] },
    ],
  },
  da: {
    keys: [
      { t: 0, shape: SHAPES.rest, pos: REST, rot: [0, -15, 0] },
      { t: 0.5, shape: SHAPES.two, pos: [0.36, 0.84], rot: [0, -15, 0] },
      { t: 1.0, shape: SHAPES.two, pos: [0.36, 0.84], rot: [0, -15, 0] },
      { t: 1.3, shape: SHAPES.fist, pos: [0.37, 0.98], rot: [35, -15, 0] },
      { t: 1.9, shape: SHAPES.fist, pos: [0.37, 0.98], rot: [35, -15, 0] },
      { t: 2.4, shape: SHAPES.rest, pos: REST, rot: [0, -15, 0] },
      { t: 2.9, shape: SHAPES.rest, pos: REST, rot: [0, -15, 0] },
    ],
  },
  net: {
    keys: [
      { t: 0, shape: SHAPES.rest, pos: REST, rot: [0, -25, 20] },
      { t: 0.55, shape: SHAPES.open, pos: [-0.12, 0.95], rot: [0, -25, 20] },
      { t: 1.0, shape: SHAPES.open, pos: [-0.12, 0.95], rot: [0, -25, 20] },
      { t: 1.3, shape: SHAPES.open, pos: [0.95, 1.0], rot: [0, -25, -12] },
      { t: 1.9, shape: SHAPES.open, pos: [0.95, 1.0], rot: [0, -25, -12] },
      { t: 2.4, shape: SHAPES.rest, pos: REST, rot: [0, -25, 20] },
      { t: 2.9, shape: SHAPES.rest, pos: REST, rot: [0, -25, 20] },
    ],
  },
  khorosho: {
    keys: [
      { t: 0, shape: SHAPES.rest, pos: REST, rot: [0, -90, -90] },
      { t: 0.55, shape: SHAPES.thumbUp, pos: [0.5, 0.95], rot: [0, -90, -90] },
      { t: 0.8, shape: SHAPES.thumbUp, pos: [0.5, 0.92], rot: [0, -90, -90] },
      { t: 1.1, shape: SHAPES.thumbUp, pos: [0.5, 0.95], rot: [0, -90, -90] },
      { t: 2.2, shape: SHAPES.thumbUp, pos: [0.5, 0.95], rot: [0, -90, -90] },
      { t: 2.7, shape: SHAPES.rest, pos: REST, rot: [0, -90, -90] },
      { t: 3.1, shape: SHAPES.rest, pos: REST, rot: [0, -90, -90] },
    ],
  },
  otlichno: {
    keys: [
      { t: 0, shape: SHAPES.rest, pos: REST, rot: [0, -35, 20] },
      { t: 0.55, shape: SHAPES.ring, pos: [0.42, 0.7], rot: [0, -35, 20] },
      { t: 0.75, shape: SHAPES.ring, pos: [0.44, 0.68], rot: [0, -35, 20] },
      { t: 0.95, shape: SHAPES.ring, pos: [0.42, 0.7], rot: [0, -35, 20] },
      { t: 2.2, shape: SHAPES.ring, pos: [0.42, 0.7], rot: [0, -35, 20] },
      { t: 2.7, shape: SHAPES.rest, pos: REST, rot: [0, -35, 20] },
      { t: 3.1, shape: SHAPES.rest, pos: REST, rot: [0, -35, 20] },
    ],
  },
  plokho: {
    keys: [
      { t: 0, shape: SHAPES.rest, pos: REST, rot: [0, -50, 0] },
      { t: 0.55, shape: SHAPES.pinky, pos: [0.4, 0.95], rot: [0, -50, 0] },
      { t: 2.2, shape: SHAPES.pinky, pos: [0.4, 0.95], rot: [0, -50, 0] },
      { t: 2.7, shape: SHAPES.rest, pos: REST, rot: [0, -50, 0] },
      { t: 3.1, shape: SHAPES.rest, pos: REST, rot: [0, -50, 0] },
    ],
  },
}
