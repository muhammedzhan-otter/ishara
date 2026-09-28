import { SignDemo } from '../demo/signDemo.ts'
import { SIGNS, type SignId } from '../signs/catalog.ts'
import { PASS, type SignEval } from '../signs/recognizer.ts'
import { h } from './dom.ts'

/** Карточка жеста: как его показать и что из условий уже выполнено. */
export class SignCard {
  readonly el: HTMLDivElement
  readonly id: SignId
  private bar: HTMLElement
  private checks: HTMLUListElement
  private demo: SignDemo | null

  /** withDemo: маленькая анимация «как показать» прямо в карточке. */
  constructor(id: SignId, withDemo = true) {
    this.id = id
    const def = SIGNS[id]
    this.bar = h('i')
    this.checks = h('ul', { class: 'sign-card__checks' })
    this.demo = withDemo ? new SignDemo(id) : null
    this.el = h(
      'div',
      { class: 'sign-card', 'data-sign': id },
      this.demo && h('div', { class: 'sign-card__demo' }, this.demo.el),
      h('div', { class: 'sign-card__body' },
        h('div', { class: 'sign-card__word' }, def.word),
        h('div', { class: 'sign-card__how' }, def.how),
        h('div', { class: 'sign-card__bar' }, this.bar),
        this.checks,
      ),
    )
  }

  destroy() {
    this.demo?.destroy()
  }

  /** Обновляет полоску близости и список условий; подробности показываем только у самого близкого жеста. */
  update(e: SignEval | undefined, focused: boolean) {
    const score = e?.score ?? 0
    this.bar.style.width = `${Math.round(score * 100)}%`
    this.el.classList.toggle('is-focused', focused && score > 0)
    if (!focused || !e) {
      this.checks.replaceChildren()
      return
    }
    // Одинаковые подсказки (например, у разных этапов движения) показываем один раз.
    const seen = new Set<string>()
    const items = e.checks.filter((c) => !seen.has(c.hint) && seen.add(c.hint))
    this.checks.replaceChildren(...items.map((c) => h('li', { class: c.ok >= PASS ? 'ok' : '' }, c.hint)))
  }

  celebrate() {
    this.el.classList.add('is-done')
  }
}
