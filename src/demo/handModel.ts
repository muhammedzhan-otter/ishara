/*
 * Модель кисти для показа жестов. Те же 21 точка, что у MediaPipe, но строятся
 * из понятных параметров: насколько согнут каждый палец и где большой палец.
 *
 * Локальные оси правой кисти «как в зеркале»: ладонь смотрит на зрителя,
 * пальцы вверх (+y), большой палец влево (-x), +z к зрителю. Единица длины:
 * расстояние от запястья до основания среднего пальца.
 */

export type V3 = [number, number, number]

export type ThumbPose = 'open' | 'up' | 'tucked' | 'hold' | 'pinch'

export interface Shape {
  /** Сгиб указательного, среднего, безымянного и мизинца: 0 прямой, 1 кулак. */
  curl: [number, number, number, number]
  thumb: ThumbPose
}

const DEG = Math.PI / 180

// Основания четырёх пальцев, длины фаланг и лёгкий веер пальцев.
const MCP: V3[] = [
  [-0.36, 0.92, 0],
  [-0.11, 1, 0],
  [0.14, 0.95, 0],
  [0.36, 0.84, 0],
]
const PHALANX = [
  [0.42, 0.25, 0.2],
  [0.47, 0.28, 0.21],
  [0.44, 0.26, 0.2],
  [0.34, 0.2, 0.18],
]
const SPREAD = [-7, 0, 6, 13]
const CMC: V3 = [-0.27, 0.2, 0.08]

// Положения большого пальца (основание, сустав, кончик) для разных форм кисти.
const THUMB: Record<Exclude<ThumbPose, 'pinch'>, [V3, V3, V3]> = {
  open: [
    [-0.52, 0.45, 0.12],
    [-0.72, 0.66, 0.16],
    [-0.86, 0.85, 0.18],
  ],
  // Кулак с отставленным большим пальцем: он идёт вдоль линии костяшек,
  // а вверх смотрит, когда кулак повёрнут (см. «хорошо» в signDemos.ts).
  up: [
    [-0.5, 0.5, 0.22],
    [-0.8, 0.56, 0.26],
    [-1.06, 0.6, 0.26],
  ],
  // Прижат поверх согнутых указательного и среднего.
  tucked: [
    [-0.36, 0.52, 0.3],
    [-0.2, 0.72, 0.5],
    [0.02, 0.78, 0.52],
  ],
  // Придерживает согнутые безымянный и мизинец.
  hold: [
    [-0.32, 0.5, 0.3],
    [-0.08, 0.62, 0.46],
    [0.14, 0.66, 0.46],
  ],
}

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k]
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const lerp3 = (a: V3, b: V3, k: number): V3 => add(a, mul(sub(b, a), k))

/** 21 точка кисти в локальных осях. */
export function handPoints(s: Shape): V3[] {
  const p: V3[] = new Array(21)
  p[0] = [0, 0, 0]
  for (let f = 0; f < 4; f++) {
    const c = s.curl[f]
    // Сжатые пальцы сходятся вместе, прямые чуть расходятся веером.
    const spread = SPREAD[f] * DEG * (1 - 0.7 * c)
    const up: V3 = [Math.sin(spread), Math.cos(spread), 0]
    const toward: V3 = [0, 0, 1]
    // Суммарный угол сгиба после каждого сустава: у кулака палец загибается к ладони.
    const bends = [c * 80, c * 185, c * 250].map((a) => a * DEG)
    let q = MCP[f]
    const i = 5 + f * 4
    p[i] = q
    for (let j = 0; j < 3; j++) {
      const d = add(mul(up, Math.cos(bends[j])), mul(toward, Math.sin(bends[j])))
      q = add(q, mul(d, PHALANX[f][j]))
      p[i + j + 1] = q
    }
  }

  p[1] = CMC
  if (s.thumb === 'pinch') {
    // Колечко: кончик большого пальца встречается с кончиком указательного.
    const tip = add(p[8], [-0.03, -0.03, 0.02])
    const span = sub(tip, CMC)
    p[2] = add(add(CMC, mul(span, 0.36)), [-0.12, 0, 0.06])
    p[3] = add(add(CMC, mul(span, 0.7)), [-0.1, 0, 0.1])
    p[4] = tip
  } else {
    ;[p[2], p[3], p[4]] = THUMB[s.thumb]
  }
  return p
}

export const SHAPES = {
  open: { curl: [0.05, 0.03, 0.05, 0.08], thumb: 'open' },
  /** Пальцы наполовину согнуты: середина движения «пока». */
  squeeze: { curl: [0.72, 0.75, 0.75, 0.72], thumb: 'open' },
  fist: { curl: [1, 1, 1, 1], thumb: 'tucked' },
  thumbUp: { curl: [1, 1, 1, 1], thumb: 'up' },
  pinky: { curl: [1, 1, 1, 0], thumb: 'tucked' },
  two: { curl: [0, 0, 1, 1], thumb: 'hold' },
  ring: { curl: [0.55, 0.05, 0.08, 0.1], thumb: 'pinch' },
  /** Расслабленная опущенная кисть. */
  rest: { curl: [0.35, 0.4, 0.45, 0.5], thumb: 'open' },
} satisfies Record<string, Shape>
