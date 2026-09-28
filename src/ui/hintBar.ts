import type { Hint } from '../meeting/coach.ts'
import { h } from './dom.ts'
import { icon } from './icons.ts'

/** Метка перед текстом подсказки. У служебных надписей («подними руку в кадр») метки нет. */
const KICKER: Record<Hint['kind'], string> = { fix: 'Поправь', near: 'Другой жест', info: '' }

/**
 * Полоса подсказки внизу видео, цвета состояния: info синяя, fix и near янтарные.
 * Разметка: .hint[data-kind] > .hint__icon + .hint__body > .hint__kicker + .hint__text > .hint__sign
 * Полоса короткая, не больше двух строк, чтобы не закрывать руки:
 *   «Хорошо»: сожми…  → слово уходит в метку .hint__sign перед текстом;
 *   Это жест «Хорошо», а нужен «Привет». Выпрями… → «Это «Хорошо», а нужен «Привет»» становится
 *   меткой над текстом, в тексте остаётся только исправление.
 * Экранный диктор читает исходную фразу целиком (скрытый текст), видимые части от него спрятаны.
 * Меняет текст только когда подсказка действительно другая.
 */
export class HintBar {
  readonly el: HTMLDivElement
  private icons = { info: icon('info'), alert: icon('alert') }
  private iconBox: HTMLElement
  private kicker: HTMLElement
  private sign: HTMLElement
  private body: Text
  private spoken: HTMLElement
  private text = ''

  constructor() {
    this.iconBox = h('span', { class: 'hint__icon', 'aria-hidden': true })
    this.kicker = h('span', { class: 'hint__kicker' })
    this.sign = h('span', { class: 'hint__sign' })
    this.body = document.createTextNode('')
    this.spoken = h('span', { class: 'visually-hidden' })
    this.el = h('div', { class: 'hint', role: 'status', 'aria-live': 'polite' },
      this.iconBox,
      h('span', { class: 'hint__body', 'aria-hidden': true }, this.kicker, h('span', { class: 'hint__text' }, this.sign, this.body)),
      this.spoken,
    )
  }

  show(hint: Hint | null) {
    const text = hint?.text ?? ''
    if (text === this.text) return
    this.text = text
    this.el.classList.toggle('is-visible', Boolean(hint))
    // При скрытии прежний текст остаётся, пока полоса гаснет.
    if (!hint) return
    let kicker = KICKER[hint.kind]
    let sign = ''
    let body = hint.text
    const near = hint.kind === 'near' ? /^Это жест («[^»]+»), а нужен (.+?)\.(?: (.+))?$/.exec(hint.text) : null
    const one = /^«([^»]+)»: (.+)$/.exec(hint.text)
    if (near) {
      kicker = `Это ${near[1]}, а нужен ${near[2]}`
      body = near[3] ?? ''
    } else if (one) {
      sign = one[1]
      body = one[2]
    }
    this.kicker.textContent = kicker
    this.sign.textContent = sign
    this.body.data = body
    this.el.classList.toggle('has-long-kicker', Boolean(near))
    this.spoken.textContent = KICKER[hint.kind] ? `${KICKER[hint.kind]}: ${hint.text}` : hint.text
    this.iconBox.replaceChildren(hint.kind === 'info' ? this.icons.info : this.icons.alert)
    this.el.dataset.kind = hint.kind
  }
}
