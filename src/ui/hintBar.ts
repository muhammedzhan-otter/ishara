import type { Hint } from '../meeting/coach.ts'

/** Полоса подсказки внизу видео. Меняет текст только когда подсказка действительно другая. */
export class HintBar {
  readonly el = document.createElement('div')
  private text = ''

  constructor() {
    this.el.className = 'hint'
    this.el.setAttribute('role', 'status')
    this.el.setAttribute('aria-live', 'polite')
  }

  show(hint: Hint | null) {
    const text = hint?.text ?? ''
    if (text === this.text) return
    this.text = text
    this.el.textContent = text
    this.el.dataset.kind = hint?.kind ?? ''
    this.el.classList.toggle('is-visible', Boolean(hint))
  }
}
