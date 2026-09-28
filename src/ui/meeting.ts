import type { Engine, Tick } from '../app/engine.ts'
import type { Sfx } from '../audio/sfx.ts'
import { wait, type Voice } from '../audio/voice.ts'
import { Coach, bestEval } from '../meeting/coach.ts'
import { PARTNER_NAME, SCRIPT, SKIP_LINE, STEP_TIMEOUT_MS } from '../meeting/script.ts'
import { ALL_SIGNS, SIGNS, type SignId } from '../signs/catalog.ts'
import { SignRecognizer } from '../signs/recognizer.ts'
import { SignDemo } from '../demo/signDemo.ts'
import type { Mood } from './avatar.ts'
import { Caption } from './caption.ts'
import { formatTime, h } from './dom.ts'
import { HintBar } from './hintBar.ts'
import { icon, type IconName } from './icons.ts'
import { SignCard } from './signCard.ts'
import { hintState, showState, tileStatus } from './state.ts'

/** Итог одного вопроса: что спросили, чем ответили, сколько времени и подсказок понадобилось. */
export interface Answer {
  question: string
  expect: SignId[]
  sign: SignId | null
  ms: number
  fixes: number
  /** Какие подсказки понадобились, по порядку. */
  hints: string[]
}

/** Если ответа всё нет, Айгерим сама показывает подходящие жесты. */
const SHOW_HOW_MS = 6000

/**
 * Что сейчас происходит с вопросом. Заголовок над карточками и сегмент прогресса следуют за этим:
 *   listen: Айгерим спрашивает, карточки ответа видны заранее, но приглушены;
 *   answer: ход человека; show: Айгерим показывает жесты сама;
 *   done:   жест понят; skip: время вышло, идём дальше.
 */
type Phase = 'listen' | 'answer' | 'show' | 'done' | 'skip'

const PHASE_ICON: Record<Phase, IconName> = { listen: 'chat', answer: 'hand', show: 'eye', done: 'check', skip: 'skip' }

export class Meeting {
  readonly el: HTMLElement
  /** Айгерим: говорит и при необходимости показывает жест рукой. */
  private partner = new SignDemo()
  private showingHow = false
  private hint = new HintBar()
  private selfTile: HTMLElement
  private partnerTile: HTMLElement
  private partnerLabel: HTMLElement
  /** Субтитры: реплики Айгерим и перевод жестов человека. */
  private caption = new Caption()
  private cardsBox: HTMLElement
  private answerTitle: HTMLElement
  private stepLabel: HTMLElement
  /** Пять сегментов прогресса: по одному на вопрос. */
  private segments: HTMLElement[]
  private timer: HTMLElement
  private cards: SignCard[] = []
  private recognizer = new SignRecognizer()
  /** Ловит жесты, которых сейчас не ждут, чтобы сказать «это похоже на другой жест». */
  private others = new SignRecognizer()
  private coach = new Coach()
  private listening: { expect: SignId[]; resolve: (id: SignId | null) => void; started: number } | null = null
  private off: () => void
  private clock: number
  private startedAt = performance.now()
  private closed = false
  private readonly engine: Engine
  private readonly voice: Voice
  private readonly sfx: Sfx

  constructor(engine: Engine, voice: Voice, sfx: Sfx, onFinish: (answers: Answer[], ms: number) => void) {
    this.engine = engine
    this.voice = voice
    this.sfx = sfx

    this.stepLabel = h('span', { class: 'topbar__step chip chip--blue' })
    this.segments = SCRIPT.map(() => h('i'))
    this.timer = h('span', { class: 'num' }, '00:00')
    this.partnerLabel = h('div', { class: 'tile__label' }, PARTNER_NAME)
    this.partnerTile = h('div', { class: 'tile tile--partner' }, this.partner.el, this.partnerLabel)
    this.selfTile = h('div', { class: 'tile tile--self' }, this.hint.el, tileStatus(), h('div', { class: 'tile__label' }, 'Ты'))
    this.answerTitle = h('div', { class: 'answer__title' })
    this.cardsBox = h('div', { class: 'answer__cards' })

    this.el = h('section', { class: 'screen call meeting' },
      h('header', { class: 'topbar' },
        h('span', { class: 'meeting__head' },
          h('span', { class: 'topbar__rec', 'aria-hidden': true }),
          h('h1', { class: 'topbar__title' }, `Встреча с ${PARTNER_NAME}`),
        ),
        this.stepLabel,
        // Для экранного диктора хватает «Вопрос N из 5» в чипе рядом.
        h('span', { class: 'meeting__progress', 'aria-hidden': true }, ...this.segments),
        h('span', { class: 'topbar__timer', title: 'Время встречи' }, icon('clock'), this.timer),
      ),
      h('div', { class: 'stage' }, this.partnerTile, this.selfTile),
      this.caption.el,
      h('div', { class: 'answer' }, this.answerTitle, this.cardsBox),
    )

    engine.mount(this.selfTile)
    showState(engine, this.selfTile, null)
    this.off = engine.on((t) => this.tick(t))
    this.clock = window.setInterval(() => (this.timer.textContent = formatTime(performance.now() - this.startedAt)), 500)
    this.run().then((answers) => {
      if (!this.closed) onFinish(answers, performance.now() - this.startedAt)
    })
  }

  private async run(): Promise<Answer[]> {
    const answers: Answer[] = []
    for (const [i, step] of SCRIPT.entries()) {
      if (this.closed) break
      this.stepLabel.textContent = `Вопрос ${i + 1} из ${SCRIPT.length}`
      this.setSegment(i, 'listen')
      // Пока Айгерим спрашивает, варианты ответа уже видны, но приглушены: пустого места нет.
      this.showCards(step.expect)
      this.setPhase('listen', 'Слушай собеседницу', step.expect.length > 1 ? 'Потом ответишь одним из этих жестов' : 'Потом ответишь этим жестом')
      await this.partnerSay(step.say, step.mood)
      if (this.closed) break

      const started = performance.now()
      for (const c of this.cards) c.el.classList.remove('is-muted')
      this.setPhase('answer', step.expect.length > 1 ? 'Ответь одним из жестов' : 'Ответь жестом')
      this.setSegment(i, 'answer')
      const sign = await this.listen(step.expect)
      answers.push({ question: step.say, expect: step.expect, sign, ms: performance.now() - started, fixes: this.coach.fixes, hints: [...this.coach.log] })
      if (this.closed) break

      this.setSegment(i, sign ? 'done' : 'skip')
      // Остальные варианты уходят на второй план: без полосы и чек-листа.
      for (const c of this.cards) {
        if (c.id === sign) continue
        c.clear()
        c.el.classList.add('is-dim')
      }
      if (sign) {
        // Кивает: жест понят. Ответит, когда прозвучит перевод.
        this.partner.figure.nod()
        this.cards.find((c) => c.id === sign)?.celebrate()
        this.setPhase('done', `${PARTNER_NAME} поняла тебя`)
        await this.userSay(SIGNS[sign].word)
        const react = step.react[sign]!
        await this.partnerSay(react.say, react.mood)
      } else {
        this.setPhase('skip', 'Этот вопрос пропустим')
        await this.partnerSay(SKIP_LINE, 'neutral')
      }
    }
    this.sfx.finish()
    await wait(600)
    return answers
  }

  private async partnerSay(text: string, mood: Mood) {
    this.partner.figure.setListening(false)
    this.partner.figure.setMood(mood)
    this.partner.figure.setSpeaking(true)
    this.partnerTile.classList.add('is-speaking')
    this.caption.partner(text)
    await this.voice.say(text, 'partner')
    this.partner.figure.setSpeaking(false)
    this.partnerTile.classList.remove('is-speaking')
  }

  /** Перевод жеста: показываем словом и озвучиваем, как будто человек сказал это вслух. */
  private async userSay(word: string) {
    this.caption.user(word)
    this.selfTile.dataset.said = word
    this.selfTile.classList.add('is-success')
    await this.voice.say(word, 'user')
    await wait(300)
    this.selfTile.classList.remove('is-success')
    showState(this.engine, this.selfTile, null)
  }

  /** Карточки ответа на вопрос. Сначала приглушены: Айгерим ещё спрашивает. */
  private showCards(expect: SignId[]) {
    for (const c of this.cards) c.destroy()
    this.cards = expect.map((id) => new SignCard(id, { wide: expect.length === 1 }))
    for (const c of this.cards) c.el.classList.add('is-muted')
    this.cardsBox.classList.toggle('is-multi', expect.length > 1)
    this.cardsBox.replaceChildren(...this.cards.map((c) => c.el))
  }

  /** Заголовок над карточками: значок, текст и тихое пояснение. */
  private setPhase(phase: Phase, text: string, note = '') {
    this.answerTitle.dataset.phase = phase
    this.answerTitle.replaceChildren(
      icon(PHASE_ICON[phase]),
      h('span', { class: 'answer__line' },
        h('span', { class: 'answer__text' }, text),
        note && h('span', { class: 'answer__note' }, note),
      ),
    )
  }

  /** Сегмент прогресса: пройденные зелёные (пропущенные серые), текущий синий и заполняется по ходу вопроса. */
  private setSegment(i: number, phase: 'listen' | 'answer' | 'done' | 'skip') {
    const seg = this.segments[i]
    if (!seg) return
    seg.className = phase === 'done' ? 'is-done' : phase === 'skip' ? 'is-skip' : 'is-now'
    seg.dataset.phase = phase
  }

  private listen(expect: SignId[]): Promise<SignId | null> {
    this.recognizer.reset()
    this.others.reset()
    this.coach.reset(performance.now())
    this.partner.figure.setListening(true)
    showState(this.engine, this.selfTile, 'turn')
    // Ход человека: пока руки не видно, в карточке строка «подними руку в кадр» (styles/base.css).
    this.cardsBox.classList.add('is-trying')
    return new Promise((resolve) => {
      this.listening = { expect, resolve, started: performance.now() }
    })
  }

  private tick({ features }: Tick) {
    const l = this.listening
    if (!l) return
    const t = features.timestamp
    const state = this.recognizer.update(features, l.expect)
    const other = this.others.update(features, ALL_SIGNS.filter((id) => !l.expect.includes(id)))
    if (other.recognized) this.coach.noticeOther(other.recognized, t)

    const hint = this.coach.update(t, features, state, l.expect)
    this.hint.show(state.recognized ? null : hint)
    const best = bestEval(state.evals)
    // Подсказка на видео про самый близкий жест: то же условие в его чек-листе янтарное.
    const fix = !state.recognized && hint && hintState(hint) === 'fix' ? hint.text : null
    for (const card of this.cards) card.update(state.evals.find((e) => e.id === card.id), card.id === best?.id, fix)
    showState(this.engine, this.selfTile, hintState(hint))
    this.engine.guide = state.recognized ? null : (hint?.guide ?? null)

    const waited = performance.now() - l.started
    if (!state.recognized && !this.showingHow && waited > SHOW_HOW_MS) {
      this.showingHow = true
      this.partner.playAll(l.expect)
      this.partnerLabel.textContent = `${PARTNER_NAME} показывает`
      this.setPhase('show', `${PARTNER_NAME} показывает, как ответить. Повтори за ней`)
    }

    if (state.recognized) {
      showState(this.engine, this.selfTile, 'ok')
      this.sfx.success()
      this.finishListening(state.recognized)
    } else if (waited > STEP_TIMEOUT_MS) {
      this.finishListening(null)
    }
  }

  private finishListening(sign: SignId | null) {
    const l = this.listening
    this.listening = null
    this.showingHow = false
    this.partnerLabel.textContent = PARTNER_NAME
    this.engine.guide = null
    this.partner.stop()
    this.hint.show(null)
    this.cardsBox.classList.remove('is-trying')
    // Жест понят: зелёный держится, пока звучит перевод (userSay снимет). Иначе ход закончен.
    if (!sign) showState(this.engine, this.selfTile, null)
    l?.resolve(sign)
  }

  destroy() {
    this.closed = true
    this.off()
    clearInterval(this.clock)
    for (const c of this.cards) c.destroy()
    this.partner.destroy()
    this.voice.stop()
    this.finishListening(null)
  }
}
