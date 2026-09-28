import { PARTNER_NAME } from '../meeting/script.ts'
import { Avatar } from './avatar.ts'
import { h } from './dom.ts'
import { icon } from './icons.ts'

/** Кадр лица Айгерим для круглого значка в субтитрах (координаты её SVG). */
const FACE_CROP = '150 58 100 100'

/**
 * Субтитры под плитками: кто говорит и что. Общие для обучения и встречи.
 * Реплики Айгерим синие с её лицом, перевод жеста человека зелёный со значком руки.
 * Разметка: .caption[data-who] > .caption__face + .caption__line > .caption__who + .caption__text
 */
export class Caption {
  readonly el: HTMLElement
  private who: HTMLElement
  private text: HTMLElement
  private readonly partnerName: string

  constructor(partnerName = PARTNER_NAME) {
    this.partnerName = partnerName
    const face = new Avatar()
    face.setMood('happy')
    // Стоп-кадр: маленькому значку не нужны дыхание и моргание.
    face.el.classList.add('still')
    face.el.querySelector('svg')!.setAttribute('viewBox', FACE_CROP)
    // Пробелы из разметки SVG иначе попадут в textContent субтитров.
    const walker = document.createTreeWalker(face.el, NodeFilter.SHOW_TEXT)
    const blank: Node[] = []
    while (walker.nextNode()) if (!walker.currentNode.nodeValue?.trim()) blank.push(walker.currentNode)
    for (const node of blank) node.parentNode?.removeChild(node)
    this.who = h('b', { class: 'caption__who' })
    this.text = h('span', { class: 'caption__text' })
    this.el = h('div', { class: 'caption', 'data-who': 'none', 'aria-live': 'polite' },
      h('span', { class: 'caption__face', 'aria-hidden': true }, face.el, icon('hand')),
      h('p', { class: 'caption__line' }, this.who, ' ', this.text),
    )
  }

  /** Реплика собеседницы. */
  partner(text: string) {
    this.set('partner', `${this.partnerName}:`, text)
  }

  /** Перевод жеста человека: показываем словом в кавычках. */
  user(word: string, label = 'Ты жестом:') {
    this.set('user', label, `«${word}»`)
  }

  clear() {
    this.set('none', '', '')
  }

  private set(who: 'partner' | 'user' | 'none', label: string, text: string) {
    this.el.dataset.who = who
    this.who.textContent = label
    this.text.textContent = text
  }
}
