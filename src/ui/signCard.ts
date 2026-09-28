import { SignDemo, THUMB_CROP } from '../demo/signDemo.ts'
import { SIGNS, type SignId } from '../signs/catalog.ts'
import { PASS, type SignEval } from '../signs/recognizer.ts'
import { h } from './dom.ts'

export interface SignCardOptions {
  /** Маленькая анимация «как показать» прямо в карточке. */
  demo?: boolean
  /** Карточка одна на экране: крупнее, чек-лист справа отдельной колонкой (на узком экране под текстом). */
  wide?: boolean
}

/** Карточка жеста: как его показать, насколько похоже и что из условий уже выполнено. */
export class SignCard {
  readonly el: HTMLDivElement
  readonly id: SignId
  private bar: HTMLElement
  private meter: HTMLElement
  private checks: HTMLUListElement
  private demo: SignDemo | null
  private percent = -1

  constructor(id: SignId, { demo = true, wide = false }: SignCardOptions = {}) {
    this.id = id
    const def = SIGNS[id]
    this.bar = h('i')
    this.meter = h('div', { class: 'sign-card__bar', role: 'progressbar', 'aria-label': 'Насколько похоже', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': 0 }, this.bar)
    this.checks = h('ul', { class: 'sign-card__checks' })
    this.demo = demo ? new SignDemo(id, THUMB_CROP) : null
    this.el = h(
      'div',
      { class: wide ? 'sign-card sign-card--wide' : 'sign-card', 'data-sign': id },
      this.demo && h('div', { class: 'sign-card__demo' }, this.demo.el),
      h('div', { class: 'sign-card__body' },
        h('div', { class: 'sign-card__word' }, def.word),
        h('div', { class: 'sign-card__how' }, def.how),
        h('div', { class: 'sign-card__meter' },
          h('span', { class: 'sign-card__meter-label', 'aria-hidden': true }, 'Насколько похоже'),
          this.meter,
        ),
        this.checks,
      ),
    )
  }

  destroy() {
    this.demo?.destroy()
  }

  /**
   * Обновляет полоску близости и список условий; подробности показываем только у самого близкого жеста.
   * Первое невыполненное условие получает класс is-now: это то же, что сейчас в подсказке на видео.
   */
  update(e: SignEval | undefined, focused: boolean) {
    const score = e?.score ?? 0
    const percent = Math.round(score * 100)
    if (percent !== this.percent) {
      this.percent = percent
      this.bar.style.width = `${percent}%`
      this.meter.setAttribute('aria-valuenow', String(percent))
    }
    this.el.classList.toggle('is-focused', focused && score > 0)
    if (!focused || !e) {
      this.checks.replaceChildren()
      return
    }
    // Одинаковые подсказки (например, у разных этапов движения) показываем один раз.
    const seen = new Set<string>()
    const items = e.checks.filter((c) => !seen.has(c.hint) && seen.add(c.hint))
    const now = items.findIndex((c) => c.ok < PASS)
    this.checks.replaceChildren(
      ...items.map((c, i) => h('li', { class: c.ok >= PASS ? 'ok' : i === now ? 'is-now' : '' }, c.hint)),
    )
  }

  celebrate() {
    this.el.classList.add('is-done')
  }
}
