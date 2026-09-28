import { SIGNS, type SignId } from '../signs/catalog.ts'
import type { RecognizerState, SignEval } from '../signs/recognizer.ts'
import type { FrameFeatures } from '../vision/features.ts'

/*
 * Режим «ошибка»: решает, какую одну подсказку показать прямо сейчас.
 * Порядок: сначала то, без чего жест не увидеть вообще (лицо, рука в кадре), потом
 * путаница с другим жестом, потом первое невыполненное условие самого близкого жеста.
 * Подсказка держится на экране минимум полторы секунды, чтобы её успели прочитать.
 */

export type HintKind = 'info' | 'fix' | 'near'

export interface Hint {
  text: string
  kind: HintKind
}

const HOLD_MS = 1500
/** Сколько человек должен пробовать, прежде чем мы начнём поправлять. */
const TRY_MS = 1200
const NO_HAND_MS = 2500
const NO_BODY_MS = 1000
/** Сколько помним чужой распознанный жест, чтобы сказать «это похоже на…». */
const NEAR_MS = 2500

export class Coach {
  /** Сколько разных подсказок-исправлений получил человек на этом шаге. */
  fixes = 0
  private current: Hint | null = null
  private shownAt = 0
  private handSince: number | null = null
  private lastHand = 0
  private lastBody = 0
  private stepStart = 0
  private near: { id: SignId; t: number } | null = null

  reset(t: number) {
    this.fixes = 0
    this.current = null
    this.handSince = null
    this.lastHand = this.lastBody = this.stepStart = t
    this.near = null
  }

  /** Человек показал жест, которого сейчас не ждут. */
  noticeOther(id: SignId, t: number) {
    this.near = { id, t }
  }

  update(t: number, f: FrameFeatures, state: RecognizerState, expect: SignId[]): Hint | null {
    if (state.handVisible) {
      this.lastHand = t
      this.handSince ??= t
    } else if (t - this.lastHand > 300) {
      this.handSince = null
    }
    if (state.bodyVisible) this.lastBody = t

    const next = this.pick(t, f, state, expect)
    // Не дёргаем текст: исправление держится, пока его не успели прочитать.
    // Служебные надписи («подними руку в кадр») убираем сразу, как только они неверны.
    const holding = this.current?.kind !== 'info' && next?.kind !== 'info' && t - this.shownAt < HOLD_MS
    if (this.current && next?.text !== this.current.text && holding) return this.current
    if (next?.text !== this.current?.text) {
      this.shownAt = t
      if (next && next.kind !== 'info') this.fixes++
    }
    this.current = next
    return next
  }

  private pick(t: number, f: FrameFeatures, state: RecognizerState, expect: SignId[]): Hint | null {
    if (t - this.lastBody > NO_BODY_MS && t - this.stepStart > NO_BODY_MS) {
      return { kind: 'info', text: 'Сядь так, чтобы в кадре были видны лицо и плечи' }
    }
    if (!state.handVisible) {
      return t - this.lastHand > NO_HAND_MS ? { kind: 'info', text: 'Подними руку в кадр, чтобы ответить жестом' } : null
    }
    const edge = f.hands.find((h) => h.screen.x < 0.06 || h.screen.x > 0.94 || h.screen.y > 0.94)
    if (edge) return { kind: 'fix', text: 'Рука у края кадра, сдвинь её ближе к центру' }

    const best = bestEval(state.evals)
    const want = expect.map((id) => `«${SIGNS[id].word}»`).join(' или ')
    if (this.near && t - this.near.t < NEAR_MS && !expect.includes(this.near.id)) {
      const fix = best?.failed ? ` ${best.failed.hint}.` : ''
      return { kind: 'near', text: `Это жест «${SIGNS[this.near.id].word}», а нужен ${want}.${fix}` }
    }
    if (this.handSince === null || t - this.handSince < TRY_MS || !best?.failed) return null
    const prefix = expect.length > 1 ? `«${SIGNS[best.id].word}»: ` : ''
    return { kind: 'fix', text: prefix + best.failed.hint }
  }
}

export function bestEval(evals: SignEval[]): SignEval | null {
  return evals.reduce<SignEval | null>((a, e) => (!a || e.score > a.score ? e : a), null)
}
