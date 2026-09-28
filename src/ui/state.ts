import type { Engine } from '../app/engine.ts'
import type { Hint } from '../meeting/coach.ts'
import { h } from './dom.ts'

/*
 * Цвет означает состояние, и он один и тот же везде: кольцо плитки, скелет руки,
 * подсказка, текущий пункт чек-листа.
 *   turn: синий, «твой ход, жду жест» (и «говорит» у плитки собеседницы, класс .is-speaking);
 *   fix:  янтарный, «поправь»;
 *   ok:   зелёный, «получилось».
 * Сами цвета живут в токенах styles/base.css (--blue, --amber, --green), canvas берёт их оттуда.
 */
export type CallState = 'turn' | 'fix' | 'ok'

const STATES: CallState[] = ['turn', 'fix', 'ok']
const TOKEN: Record<CallState, string> = { turn: '--blue', fix: '--amber', ok: '--green' }
/** Если стили ещё не загружены: те же значения, что в токенах. */
const FALLBACK: Record<CallState, string> = { turn: '#8198ff', fix: '#ffb547', ok: '#3ddc97' }
const cache = new Map<CallState, string>()

/** Цвет состояния из CSS-токена, для canvas (скелет руки, круг-цель). */
export function stateColor(state: CallState): string {
  let color = cache.get(state)
  if (!color) {
    color = getComputedStyle(document.documentElement).getPropertyValue(TOKEN[state]).trim()
    if (!color) return FALLBACK[state]
    cache.set(state, color)
  }
  return color
}

/** Кольцо плитки: .is-turn, .is-fix или .is-ok (null снимает все три). */
export function setTileState(tile: HTMLElement, state: CallState | null) {
  for (const s of STATES) tile.classList.toggle(`is-${s}`, s === state)
}

/** Кольцо плитки и скелет руки одним вызовом. Без состояния рука синяя, кольца нет. */
export function showState(engine: Engine, tile: HTMLElement | null, state: CallState | null) {
  engine.handColor = stateColor(state ?? 'turn')
  if (tile) setTileState(tile, state)
}

/** Во время ожидания жеста: янтарный, если на экране исправление, иначе синий. */
export function hintState(hint: Hint | null): CallState {
  return hint && hint.kind !== 'info' ? 'fix' : 'turn'
}

/** Чип в правом верхнем углу плитки «Ты»: виден только в состоянии .is-turn. */
export function tileStatus(text = 'Жду твой жест'): HTMLElement {
  return h('div', { class: 'tile__status chip chip--blue', 'aria-hidden': true }, h('span', { class: 'chip__dot' }), text)
}
