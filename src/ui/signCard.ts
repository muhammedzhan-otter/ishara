import { SignDemo, THUMB_CROP } from '../demo/signDemo.ts'
import { PARTNER_NAME } from '../meeting/script.ts'
import { SIGNS, type SignId } from '../signs/catalog.ts'
import { PASS, type SignEval } from '../signs/recognizer.ts'
import { h } from './dom.ts'
import { icon } from './icons.ts'

/**
 * Рука на миг пропала из кадра: последнюю оценку держим столько, чтобы чек-лист не мигал и карточка
 * не прыгала по высоте. Не меньше, чем держится подсказка на видео (HOLD_MS в meeting/coach.ts):
 * пока там «Поправь…», чек-лист с тем же пунктом не должен исчезать.
 */
const EVAL_HOLD_MS = 1500

export interface SignCardOptions {
  /** Маленькая анимация «как показать» прямо в карточке. */
  demo?: boolean
  /** Карточка одна на экране: крупнее, чек-лист справа отдельной колонкой (на узком экране под текстом). */
  wide?: boolean
  /** Элемент рядом со словом, например чип «Получилось» в обучении. */
  badge?: Node
  /** Последняя строка карточки во всю ширину, например совет «как в зеркале». */
  footer?: Node
}

/**
 * Карточка жеста: как его показать, насколько похоже и что из условий уже выполнено.
 * Разметка:
 *   .sign-card > .sign-card__demo? + .sign-card__body > (.sign-card__word > badge?) + .sign-card__how
 *     + .sign-card__meter + .sign-card__checks + .sign-card__wait, затем footer?
 * .sign-card__wait: пока руки не видно, на месте чек-листа строка «дослушай» или, в ход человека,
 * «подними руку в кадр». Какую показать и показывать ли, решает CSS (styles/base.css).
 */
export class SignCard {
  readonly el: HTMLDivElement
  readonly id: SignId
  private bar: HTMLElement
  private meter: HTMLElement
  private checks: HTMLUListElement
  private demo: SignDemo | null
  private percent = -1
  /** Последняя оценка, пока рука была в кадре, и была ли карточка тогда в фокусе. */
  private held: { e: SignEval; focused: boolean; t: number } | null = null
  /** Что сейчас нарисовано в чек-листе: не пересобираем список без изменений. */
  private drawn = ''

  constructor(id: SignId, { demo = true, wide = false, badge, footer }: SignCardOptions = {}) {
    this.id = id
    const def = SIGNS[id]
    this.bar = h('i')
    this.meter = h('div', { class: 'sign-card__bar', role: 'progressbar', 'aria-label': 'Насколько похоже', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': 0 }, this.bar)
    this.checks = h('ul', { class: 'sign-card__checks', 'aria-label': 'Условия жеста' })
    this.demo = demo ? new SignDemo(id, THUMB_CROP) : null
    this.el = h(
      'div',
      { class: wide ? 'sign-card sign-card--wide' : 'sign-card', 'data-sign': id },
      this.demo && h('div', { class: 'sign-card__demo' }, this.demo.el),
      h('div', { class: 'sign-card__body' },
        h('div', { class: 'sign-card__word' }, h('span', { class: 'sign-card__name' }, def.word), badge),
        h('div', { class: 'sign-card__how' }, def.how),
        h('div', { class: 'sign-card__meter' },
          h('span', { class: 'sign-card__meter-label', 'aria-hidden': true }, 'Насколько похоже'),
          this.meter,
        ),
        this.checks,
        h('p', { class: 'sign-card__wait' },
          icon('hand'),
          h('span', { class: 'sign-card__wait-listen' }, `Дослушай ${PARTNER_NAME}, потом покажи жест. Здесь будет видно, что получается и что поправить.`),
          h('span', { class: 'sign-card__wait-turn' }, 'Подними руку в кадр: здесь будет видно, что уже получается и что поправить.'),
        ),
      ),
      footer,
    )
  }

  destroy() {
    this.demo?.destroy()
  }

  /**
   * Обновляет полоску близости и список условий; подробности показываем только у самого близкого жеста.
   * fix: текст подсказки «Поправь» или «Другой жест», которая сейчас на видео (null, если её нет).
   * Условие из этой подсказки янтарное (is-now), как сама подсказка. Без неё первое невыполненное
   * условие синее (is-next): янтарь значит «поправь» и появляется в карточке не раньше, чем на видео.
   */
  update(e: SignEval | undefined, focused: boolean, fix: string | null = null) {
    const now = performance.now()
    if (e) {
      this.held = { e, focused, t: now }
    } else if (this.held && now - this.held.t < EVAL_HOLD_MS) {
      e = this.held.e
      focused = this.held.focused
    }
    const score = e?.score ?? 0
    const percent = Math.round(score * 100)
    if (percent !== this.percent) {
      this.percent = percent
      this.bar.style.width = `${percent}%`
      this.meter.setAttribute('aria-valuenow', String(percent))
    }
    this.el.classList.toggle('is-focused', focused && score > 0)
    this.el.classList.toggle('is-fixing', focused && fix !== null)
    if (!focused || !e) {
      this.draw([])
      return
    }
    // Одинаковые подсказки (например, у разных этапов движения) показываем один раз.
    const seen = new Set<string>()
    const items = e.checks.filter((c) => !seen.has(c.hint) && seen.add(c.hint))
    // Подсказка на видео держится полторы секунды и может говорить не о первом невыполненном условии.
    const fixing = fix === null ? -1 : items.findIndex((c) => c.ok < PASS && fix.includes(c.hint))
    const next = items.findIndex((c) => c.ok < PASS)
    this.draw(items.map((c, i) => [c.hint, c.ok >= PASS ? 'ok' : i === fixing ? 'is-now' : fixing < 0 && i === next ? 'is-next' : '']))
  }

  /** Сразу убрать полосу и чек-лист, без удержания: карточка ушла на второй план. */
  clear() {
    this.held = null
    this.update(undefined, false)
  }

  private draw(items: [string, string][]) {
    const key = items.map(([text, cls]) => `${cls}:${text}`).join('|')
    if (key === this.drawn) return
    this.drawn = key
    this.checks.replaceChildren(...items.map(([text, cls]) => h('li', { class: cls }, text)))
  }

  celebrate() {
    this.el.classList.add('is-done')
  }
}
