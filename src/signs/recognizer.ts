import type { FrameFeatures, HandFeatures } from '../vision/features.ts'
import { SIGNS, type Check, type Sample, type SignId } from './catalog.ts'

/** Условие считается выполненным с этой степени. */
export const PASS = 0.75
/** Статичный жест нужно удерживать столько, чтобы случайная форма кисти не засчиталась. */
const HOLD_MS = 350
const HISTORY_MS = 2500
/** Если руку не видно дольше, её история сбрасывается. */
const LOST_MS = 400
const COOLDOWN_MS = 900

export interface SignEval {
  id: SignId
  side: HandFeatures['side']
  checks: Check[]
  /** Средняя степень выполнения: насколько человек близок к жесту. */
  score: number
  /** Первое по важности невыполненное условие. */
  failed: Check | null
  /** Где сейчас ладонь этой руки, в координатах тела: от неё рисуем стрелку к цели. */
  palm: HandFeatures['palmPos']
}

export interface RecognizerState {
  handVisible: boolean
  bodyVisible: boolean
  /** Среди ожидаемых есть жесты, которым нужно видеть лицо и плечи, а их не видно. */
  needBody: boolean
  evals: SignEval[]
  /** Жест, распознанный в этом кадре. */
  recognized: SignId | null
}

export class SignRecognizer {
  private hist: Record<HandFeatures['side'], Sample[]> = { Left: [], Right: [] }
  private lastSeen: Record<HandFeatures['side'], number> = { Left: -Infinity, Right: -Infinity }
  private holdSince = new Map<string, number>()
  private cooldownUntil = -Infinity

  reset() {
    this.hist = { Left: [], Right: [] }
    this.holdSince.clear()
  }

  update(frame: FrameFeatures, signs: SignId[]): RecognizerState {
    const t = frame.timestamp
    for (const h of frame.hands) {
      const list = this.hist[h.side]
      if (t - this.lastSeen[h.side] > LOST_MS) list.length = 0
      this.lastSeen[h.side] = t
      list.push({ t, f: h })
      while (list.length && t - list[0].t > HISTORY_MS) list.shift()
    }

    const body = frame.body
    const state: RecognizerState = {
      handVisible: frame.hands.length > 0,
      bodyVisible: body !== null,
      needBody: body === null && signs.some((id) => SIGNS[id].needsBody),
      evals: [],
      recognized: null,
    }

    for (const id of signs) {
      const def = SIGNS[id]
      if (def.needsBody && !body) continue
      let best: SignEval | null = null
      for (const h of frame.hands) {
        if (def.needsBody && !h.palmPos) continue
        const checks = def.checks({ f: h, hist: this.hist[h.side], body, t })
        const score = checks.reduce((a, c) => a + c.ok, 0) / checks.length
        const failed = checks.find((c) => c.ok < PASS) ?? null
        if (!best || score > best.score) best = { id, side: h.side, checks, score, failed, palm: h.palmPos }
      }
      if (best) state.evals.push(best)
    }

    if (t < this.cooldownUntil) return state
    for (const e of state.evals) {
      const key = `${e.id}.${e.side}`
      if (e.failed) {
        this.holdSince.delete(key)
        continue
      }
      if (SIGNS[e.id].kind === 'static') {
        const since = this.holdSince.get(key) ?? t
        this.holdSince.set(key, since)
        if (t - since < HOLD_MS) continue
      }
      state.recognized = e.id
      this.cooldownUntil = t + COOLDOWN_MS
      this.reset()
      break
    }
    return state
  }
}
