import type { Engine, Tick } from '../app/engine.ts'
import { DEMOS } from '../demo/signDemos.ts'
import { KEY_MOMENT, SignDemo } from '../demo/signDemo.ts'
import { Coach } from '../meeting/coach.ts'
import { MAX_PER_ANSWER, answerScore, saveRecord, swapLastScore, topMistakes } from '../meeting/score.ts'
import { PARTNER_NAME } from '../meeting/script.ts'
import { SIGNS } from '../signs/catalog.ts'
import { SignRecognizer } from '../signs/recognizer.ts'
import { formatTime, h, plural } from './dom.ts'
import { HintBar } from './hintBar.ts'
import { icon, type IconName } from './icons.ts'
import type { Answer } from './meeting.ts'
import { hintState, showState, tileStatus } from './state.ts'

/** Сначала даём посмотреть итоги: иначе прощальный взмах сразу запустил бы встречу заново. */
const IGNORE_MS = 4000
/** Счёт набегает от нуля за это время. */
const COUNT_MS = 1100
/** Айгерим машет на прощание три раза, потом просто сидит и улыбается. */
const WAVES = 3
/** Конфетти успевает упасть за это время (самая поздняя задержка плюс самое долгое падение). */
const CONFETTI_MS = 6500
const BYE = 'Пока! До встречи!'

/** Итоги встречи и рекорды. Начать заново можно тем же жестом «Привет». */
export class Results {
  readonly el: HTMLElement
  private off: () => void
  private recognizer = new SignRecognizer()
  /** Здесь ждём не ответ, а взмах: служебная подсказка говорит об этом. */
  private coach = new Coach('Подними руку в кадр и помаши, чтобы начать заново')
  private hint = new HintBar()
  private partner = new SignDemo()
  private readyAt = performance.now() + IGNORE_MS
  private again: HTMLElement
  private tile: HTMLElement
  private countRaf = 0
  private waveTimer = 0
  private confettiTimer = 0
  private readonly engine: Engine
  private readonly onRestart: () => void

  constructor(engine: Engine, answers: Answer[], ms: number, onRestart: () => void) {
    this.engine = engine
    this.onRestart = onRestart
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const scores = answers.map(answerScore)
    const total = scores.reduce((a, b) => a + b, 0)
    const max = answers.length * MAX_PER_ANSWER
    const stars = total >= max * 0.8 ? 3 : total >= max * 0.5 ? 2 : total > 0 ? 1 : 0
    const now = new Date()
    const date = now.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
    const records = saveRecord({ score: total, ms, date })
    const firstTry = answers.filter((a) => a.sign && a.fixes === 0).length
    const fixes = answers.reduce((a, b) => a + b.fixes, 0)
    const prev = swapLastScore(total)
    const mistakes = topMistakes(answers.flatMap((a) => a.hints))
    // Пропущенные вопросы (время вышло): подсказок могло не быть, но жест не получился.
    const skipped = answers.filter((a) => !a.sign)

    // Счёт: крупные золотые цифры, набегают от нуля. Экранный диктор сразу читает итог.
    const num = h('span', { class: `results__num num${calm ? ' is-final' : ''}`, 'aria-hidden': true }, calm ? String(total) : '0')
    const score = h('p', { class: 'results__score' },
      h('span', { class: 'visually-hidden' }, `${total} ${plural(total, 'очко', 'очка', 'очков')} из ${max}`),
      num,
      h('span', { class: 'results__of', 'aria-hidden': true }, `из ${max}`),
    )

    // Айгерим прощается: машет открытой ладонью, её реплика внизу плитки. Это тот же взмах «Привет»,
    // которым человек начнёт встречу заново: она заодно показывает, что сделать.
    this.partner.play('privet')
    if (calm) {
      this.partner.seek(KEY_MOMENT.privet)
      this.partner.figure.el.classList.add('still')
    } else {
      const loop = DEMOS.privet.keys.at(-1)!.t * 1000
      this.waveTimer = window.setTimeout(() => this.partner.stop(), WAVES * loop)
    }

    // Праздник за хороший результат. Когда конфетти упадёт, убираем его из страницы.
    const party = stars >= 2 && !calm ? confetti() : null
    if (party) this.confettiTimer = window.setTimeout(() => party.remove(), CONFETTI_MS)

    this.tile = h('div', { class: 'tile tile--self' }, this.hint.el, tileStatus(), h('div', { class: 'tile__label' }, 'Ты'))

    this.el = h('section', { class: 'screen results' },
      h('div', { class: 'results__layout' },
        h('section', { class: `results__hero panel stars-${stars}`, 'aria-labelledby': 'results-title' },
          party,
          h('h1', { class: 'results__kicker', id: 'results-title' }, icon('check'), `Встреча с ${PARTNER_NAME} завершена`),
          score,
          h('div', { class: 'results__stars', role: 'img', 'aria-label': `${stars} ${plural(stars, 'звезда', 'звезды', 'звёзд')} из 3` },
            ...[0, 1, 2].map((i) => h('span', { class: i < stars ? 'is-on' : '' }, icon('star', 'icon icon--fill'))),
          ),
          progressLine(total, prev),
          h('dl', { class: 'results__metrics' },
            metric('clock', 'Время', formatTime(ms)),
            metric('check', 'С первой попытки', String(firstTry), ` из ${answers.length}`),
            metric('info', 'Подсказки', String(fixes)),
          ),
        ),

        h('figure', { class: 'results__partner' },
          h('div', { class: 'tile tile--partner' }, this.partner.el, h('div', { class: 'tile__label' }, PARTNER_NAME)),
          h('figcaption', { class: 'results__bye' },
            h('b', {}, `${PARTNER_NAME}:`), ' ', h('span', {}, BYE),
          ),
        ),

        (this.again = h('section', { class: 'again is-waiting', 'aria-label': 'Начать заново' },
          this.tile,
          h('p', { class: 'again__text' },
            h('span', { class: 'again__icon', 'aria-hidden': true }, icon('hand')),
            h('span', {}, h('strong', {}, 'Помаши рукой'), ', чтобы начать заново'),
          ),
        )),

        h('section', { class: 'mistakes panel' },
          h('h2', {}, icon('target'), 'Над чем поработать'),
          mistakes.length
            ? h('p', { class: 'results__sub' }, 'Подсказки, которые появлялись чаще всего')
            : null,
          mistakes.length
            ? h('ol', {}, ...mistakes.map((m, i) =>
              h('li', {},
                h('span', { class: 'mistakes__n num', 'aria-hidden': true }, String(i + 1)),
                mistakeText(m.text),
                m.count > 1 ? h('span', { class: 'chip chip--amber num' }, `${m.count} ${plural(m.count, 'раз', 'раза', 'раз')}`) : null,
              )))
            : null,
          skipped.length ? skippedNote(skipped) : null,
          !mistakes.length && !skipped.length
            ? h('p', { class: 'mistakes__none' }, icon('check'), 'Подсказки не понадобились. Все жесты получились сразу!')
            : null,
        ),

        h('section', { class: 'records panel' },
          h('h2', {}, icon('trophy'), 'Лучшие результаты'),
          h('ol', {}, ...recordRows(records, total, date)),
        ),

        h('section', { class: 'qa panel' },
          h('h2', {}, icon('list'), 'Ответы по вопросам'),
          h('div', { class: 'qa__head', 'aria-hidden': true },
            h('span', {}, 'Вопрос'), h('span', {}, 'Твой жест'), h('span', {}, 'Время'), h('span', {}, 'Подсказки'), h('span', {}, 'Очки'),
          ),
          h('ol', { class: 'qa__list' }, ...answers.map((a, i) => answerRow(a, i, scores[i]))),
        ),
      ),
    )

    engine.mount(this.tile)
    showState(engine, this.tile, null)
    this.coach.reset(performance.now())
    this.off = engine.on((t) => this.tick(t))
    if (!calm) this.countUp(num, total)
  }

  /** Счёт набегает от нуля с замедлением к концу. */
  private countUp(el: HTMLElement, total: number) {
    const start = performance.now()
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / COUNT_MS)
      el.textContent = String(Math.round(total * (1 - (1 - k) ** 3)))
      if (k < 1) this.countRaf = requestAnimationFrame(step)
      else el.classList.add('is-final')
    }
    this.countRaf = requestAnimationFrame(step)
  }

  private tick({ features }: Tick) {
    if (performance.now() < this.readyAt) {
      this.recognizer.reset()
      return
    }
    this.again.classList.remove('is-waiting')
    const state = this.recognizer.update(features, ['privet'])
    const hint = this.coach.update(features.timestamp, features, state, ['privet'])
    this.hint.show(state.recognized ? null : hint)
    this.engine.guide = state.recognized ? null : (hint?.guide ?? null)
    showState(this.engine, this.tile, state.recognized ? 'ok' : hintState(hint))
    if (state.recognized) this.onRestart()
  }

  destroy() {
    this.off()
    cancelAnimationFrame(this.countRaf)
    clearTimeout(this.waveTimer)
    clearTimeout(this.confettiTimer)
    this.partner.destroy()
    this.engine.guide = null
  }
}

/** Строка сравнения с прошлой попыткой: зелёная, если стало лучше. */
function progressLine(total: number, prev: number | null): HTMLElement | null {
  if (prev === null) return null
  const diff = total - prev
  const [name, text]: [IconName, string] =
    diff > 0 ? ['trend', `На ${diff} ${plural(diff, 'очко', 'очка', 'очков')} лучше, чем в прошлый раз`]
    : diff === 0 ? ['repeat', 'Столько же, сколько в прошлый раз']
    : ['repeat', `В прошлый раз было ${prev}. Получится лучше!`]
  return h('p', { class: `results__progress chip${diff > 0 ? ' chip--green' : ''}` }, icon(name), text)
}

function metric(name: IconName, label: string, value: string, small = ''): HTMLElement {
  return h('div', { class: 'metric' },
    h('dt', {}, icon(name), label),
    h('dd', { class: 'num' }, value, small ? h('small', {}, small) : null),
  )
}

/**
 * Подсказка про один из нескольких жестов («Да»: опусти руку…): слово выносим в метку, как на видео.
 * Для экранного диктора после метки двоеточие, иначе он прочитал бы слово и текст слитно.
 */
function mistakeText(text: string): HTMLElement {
  const m = /^«([^»]+)»: (.+)$/.exec(text)
  return h('span', { class: 'mistakes__text' },
    m ? h('span', { class: 'mistakes__sign' }, m[1]) : null,
    m ? h('span', { class: 'visually-hidden' }, ': ') : null,
    m ? m[2] : text,
  )
}

/** Вопросы, на которые время вышло: какие жесты повторить. */
function skippedNote(skipped: Answer[]): HTMLElement {
  const n = skipped.length
  const signs = [...new Set(skipped.flatMap((a) => a.expect))]
  return h('div', { class: 'mistakes__skipped' },
    h('p', {}, icon('skip'),
      h('span', {}, `${n === 1 ? 'Пропущен' : 'Пропущено'} ${n} ${plural(n, 'вопрос', 'вопроса', 'вопросов')}. Эти жесты стоит повторить:`),
    ),
    h('ul', {}, ...signs.map((id) => h('li', { class: 'chip' }, SIGNS[id].word))),
  )
}

function recordRows(records: { score: number; ms: number; date: string }[], total: number, date: string): HTMLElement[] {
  let marked = false
  return records.map((r, i) => {
    const current = !marked && r.score === total && r.date === date
    if (current) marked = true
    const badge = !current ? null
      : i === 0 && records.length > 1 ? h('span', { class: 'chip records__badge records__badge--best' }, 'Новый рекорд')
      : h('span', { class: 'chip chip--green records__badge' }, 'Сейчас')
    return h('li', { class: current ? 'is-current' : '' },
      h('span', { class: 'records__place num', 'aria-hidden': true }, String(i + 1)),
      h('b', { class: 'records__score num' }, String(r.score)),
      h('span', { class: 'records__when' },
        h('span', {}, r.date),
        h('span', { class: 'records__meta' },
          h('span', { class: 'records__time num' }, icon('clock'), h('span', { class: 'visually-hidden' }, 'время '), formatTime(r.ms)),
          badge,
        ),
      ),
    )
  })
}

function answerRow(a: Answer, i: number, score: number): HTMLElement {
  const share = Math.round((score / MAX_PER_ANSWER) * 100)
  return h('li', { class: `qa__row${a.sign ? '' : ' is-missed'}` },
    h('span', { class: 'qa__n num', 'aria-hidden': true }, String(i + 1)),
    h('p', { class: 'qa__q' }, a.question),
    h('span', { class: 'qa__sign' },
      a.sign
        ? h('span', { class: 'chip chip--green' }, icon('check'), h('span', { class: 'visually-hidden' }, 'Твой жест: '), SIGNS[a.sign].word)
        : h('span', { class: 'chip' }, 'пропущен'),
    ),
    // На широком экране время и подсказки стоят отдельными колонками (display: contents), на узком одной строкой.
    h('span', { class: 'qa__meta' },
      h('span', { class: 'qa__time num' }, icon('clock'), h('span', { class: 'visually-hidden' }, 'Время: '), formatTime(a.ms)),
      h('span', { class: `qa__hints num${a.fixes ? ' has-hints' : ''}` }, icon('info'), h('span', { class: 'qa__label' }, 'Подсказки: '), String(a.fixes)),
    ),
    h('span', { class: 'qa__score' },
      h('b', { class: 'num' }, String(score), h('span', { class: 'visually-hidden' }, ` ${plural(score, 'очко', 'очка', 'очков')}`)),
      h('span', { class: 'qa__bar', 'aria-hidden': true }, h('i', { style: `width: ${share}%` })),
    ),
  )
}

/**
 * Праздничное конфетти за счётом: чистый CSS, анимацию ведёт сам браузер, даже когда распознавание
 * загружает процессор. Цвета кусочков задаёт results.css из токенов.
 */
function confetti(): HTMLElement {
  const box = h('div', { class: 'confetti', 'aria-hidden': true })
  for (let i = 0; i < 44; i++) {
    const piece = h('i')
    piece.style.left = `${Math.random() * 100}%`
    piece.style.animationDelay = `${Math.random() * 1.4}s`
    piece.style.animationDuration = `${2.6 + Math.random() * 2}s`
    piece.style.setProperty('--drift', `${(Math.random() - 0.5) * 140}px`)
    piece.style.setProperty('--spin', `${Math.random() * 720 - 360}deg`)
    box.append(piece)
  }
  return box
}
