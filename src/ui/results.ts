import type { Engine, Tick } from '../app/engine.ts'
import { Coach } from '../meeting/coach.ts'
import { MAX_PER_ANSWER, answerScore, saveRecord } from '../meeting/score.ts'
import { PARTNER_NAME } from '../meeting/script.ts'
import { SIGNS } from '../signs/catalog.ts'
import { SignRecognizer } from '../signs/recognizer.ts'
import { formatTime, h } from './dom.ts'
import { HintBar } from './hintBar.ts'
import type { Answer } from './meeting.ts'

/** Сначала даём посмотреть итоги: иначе прощальный взмах сразу запустил бы встречу заново. */
const IGNORE_MS = 4000

/** Итоги встречи и рекорды. Начать заново можно тем же жестом «Привет». */
export class Results {
  readonly el: HTMLElement
  private off: () => void
  private recognizer = new SignRecognizer()
  private coach = new Coach()
  private hint = new HintBar()
  private readyAt = performance.now() + IGNORE_MS
  private again: HTMLElement
  private readonly onRestart: () => void

  constructor(engine: Engine, answers: Answer[], ms: number, onRestart: () => void) {
    this.onRestart = onRestart
    const scores = answers.map(answerScore)
    const total = scores.reduce((a, b) => a + b, 0)
    const max = answers.length * MAX_PER_ANSWER
    const stars = total >= max * 0.8 ? 3 : total >= max * 0.5 ? 2 : total > 0 ? 1 : 0
    const now = new Date()
    const date = now.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
    const records = saveRecord({ score: total, ms, date })
    const firstTry = answers.filter((a) => a.sign && a.fixes === 0).length

    const tile = h('div', { class: 'tile tile--self tile--small' }, this.hint.el, h('div', { class: 'tile__label' }, 'Ты'))
    this.el = h('section', { class: 'screen results' },
      h('div', { class: 'results__card' },
        h('p', { class: 'results__kicker' }, `Встреча с ${PARTNER_NAME} завершена`),
        h('div', { class: 'results__score' }, String(total), h('small', {}, ` из ${max}`)),
        h('div', { class: 'results__stars', 'aria-label': `${stars} из 3` },
          ...[0, 1, 2].map((i) => h('span', { class: i < stars ? 'on' : '' }, '★')),
        ),
        h('p', { class: 'results__summary' },
          `Время ${formatTime(ms)}. С первой попытки: ${firstTry} из ${answers.length}.`,
        ),
        h('table', { class: 'results__table' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Вопрос'), h('th', {}, 'Твой жест'), h('th', {}, 'Время'), h('th', {}, 'Подсказки'), h('th', {}, 'Очки'))),
          h('tbody', {},
            ...answers.map((a, i) =>
              h('tr', { class: a.sign ? '' : 'is-missed' },
                h('td', {}, a.question),
                h('td', {}, a.sign ? SIGNS[a.sign].word : 'пропущен'),
                h('td', {}, formatTime(a.ms)),
                h('td', {}, String(a.fixes)),
                h('td', {}, String(scores[i])),
              ),
            ),
          ),
        ),
        h('div', { class: 'results__bottom' },
          h('div', { class: 'records' },
            h('h2', {}, 'Лучшие результаты'),
            h('ol', {},
              ...records.map((r) =>
                h('li', { class: r.score === total && r.date === date ? 'is-current' : '' },
                  h('b', {}, String(r.score)), ` ${r.date}, ${formatTime(r.ms)}`),
              ),
            ),
          ),
          (this.again = h('div', { class: 'again is-waiting' }, tile, h('p', {}, h('strong', {}, 'Помаши рукой'), ', чтобы начать встречу заново'))),
        ),
      ),
    )
    engine.mount(tile)
    engine.handColor = '#4f7cff'
    this.coach.reset(performance.now())
    this.off = engine.on((t) => this.tick(t))
  }

  private tick({ features }: Tick) {
    if (performance.now() < this.readyAt) {
      this.recognizer.reset()
      return
    }
    this.again.classList.remove('is-waiting')
    const state = this.recognizer.update(features, ['privet'])
    const hint = this.coach.update(features.timestamp, features, state, ['privet'])
    this.hint.show(hint)
    if (state.recognized) this.onRestart()
  }

  destroy() {
    this.off()
  }
}
