import type { Hint } from '../meeting/coach.ts'
import { h } from './dom.ts'
import { icon } from './icons.ts'

/** Метка над текстом подсказки. У служебных надписей («подними руку в кадр») метки нет. */
const KICKER: Record<Hint['kind'], string> = { fix: 'Поправь', near: 'Другой жест', info: '' }

/**
 * Полоса подсказки внизу видео, цвета состояния: info синяя, fix и near янтарные.
 * Разметка: .hint[data-kind] > .hint__icon + .hint__body > .hint__kicker + .hint__text > .hint__sign
 * Если подсказка про один из нескольких жестов («Хорошо»: сожми…), слово выносится в .hint__sign.
 * Меняет текст только когда подсказка действительно другая.
 */
export class HintBar {
  readonly el: HTMLDivElement
  private icons = { info: icon('info'), alert: icon('alert') }
  private iconBox: HTMLElement
  private kicker: HTMLElement
  private sign: HTMLElement
  private body: Text
  private text = ''

  constructor() {
    this.iconBox = h('span', { class: 'hint__icon', 'aria-hidden': true })
    this.kicker = h('span', { class: 'hint__kicker' })
    this.sign = h('span', { class: 'hint__sign' })
    this.body = document.createTextNode('')
    this.el = h('div', { class: 'hint', role: 'status', 'aria-live': 'polite' },
      this.iconBox,
      h('span', { class: 'hint__body' }, this.kicker, h('span', { class: 'hint__text' }, this.sign, this.body)),
    )
  }

  show(hint: Hint | null) {
    const text = hint?.text ?? ''
    if (text === this.text) return
    this.text = text
    this.el.classList.toggle('is-visible', Boolean(hint))
    // При скрытии прежний текст остаётся, пока полоса гаснет.
    if (!hint) return
    const m = /^«([^»]+)»: (.+)$/.exec(hint.text)
    this.sign.textContent = m ? m[1] : ''
    this.body.data = m ? m[2] : hint.text
    this.kicker.textContent = KICKER[hint.kind]
    this.iconBox.replaceChildren(hint.kind === 'info' ? this.icons.info : this.icons.alert)
    this.el.dataset.kind = hint.kind
  }
}
