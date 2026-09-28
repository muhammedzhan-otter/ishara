import type { Engine, Tick } from '../app/engine.ts'
import type { Sfx } from '../audio/sfx.ts'
import { wait, type Voice } from '../audio/voice.ts'
import { Coach, bestEval } from '../meeting/coach.ts'
import { PARTNER_NAME, SCRIPT, SKIP_LINE, STEP_TIMEOUT_MS } from '../meeting/script.ts'
import { ALL_SIGNS, SIGNS, type SignId } from '../signs/catalog.ts'
import { SignRecognizer } from '../signs/recognizer.ts'
import { SignDemo } from '../demo/signDemo.ts'
import type { Mood } from './avatar.ts'
import { formatTime, h } from './dom.ts'
import { HintBar } from './hintBar.ts'
import { SignCard } from './signCard.ts'

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

const COLOR = { idle: '#4f7cff', warn: '#ffb547', ok: '#3ddc97' }
/** Если ответа всё нет, Айгерим сама показывает подходящие жесты. */
const SHOW_HOW_MS = 6000

export class Meeting {
  readonly el: HTMLElement
  /** Айгерим: говорит и при необходимости показывает жест рукой. */
  private partner = new SignDemo()
  private showingHow = false
  private hint = new HintBar()
  private selfTile: HTMLElement
  private partnerTile: HTMLElement
  private caption: HTMLElement
  private captionWho: HTMLElement
  private cardsBox: HTMLElement
  private answerTitle: HTMLElement
  private stepLabel: HTMLElement
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

    this.stepLabel = h('span', { class: 'topbar__step' })
    this.timer = h('span', { class: 'topbar__timer' }, '00:00')
    this.partnerTile = h('div', { class: 'tile tile--partner' }, this.partner.el, h('div', { class: 'tile__label' }, PARTNER_NAME))
    this.selfTile = h('div', { class: 'tile tile--self' }, this.hint.el, h('div', { class: 'tile__label' }, 'Ты'))
    this.captionWho = h('b')
    this.caption = h('span')
    this.answerTitle = h('div', { class: 'answer__title' })
    this.cardsBox = h('div', { class: 'answer__cards' })

    this.el = h('section', { class: 'screen meeting' },
      h('header', { class: 'topbar' },
        h('span', { class: 'topbar__rec', 'aria-hidden': true }),
        h('span', { class: 'topbar__title' }, `Встреча с ${PARTNER_NAME}`),
        this.stepLabel,
        this.timer,
      ),
      h('div', { class: 'stage' }, this.partnerTile, this.selfTile),
      h('div', { class: 'caption', 'aria-live': 'polite' }, this.captionWho, this.caption),
      h('div', { class: 'answer' }, this.answerTitle, this.cardsBox),
    )

    engine.mount(this.selfTile)
    engine.handColor = COLOR.idle
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
      this.showCards([], 'Слушай собеседницу')
      await this.partnerSay(step.say, step.mood)

      const started = performance.now()
      this.showCards(step.expect, step.expect.length > 1 ? 'Ответь одним из жестов' : 'Ответь жестом')
      const sign = await this.listen(step.expect)
      answers.push({ question: step.say, expect: step.expect, sign, ms: performance.now() - started, fixes: this.coach.fixes, hints: [...this.coach.log] })

      if (sign) {
        this.cards.find((c) => c.id === sign)?.celebrate()
        await this.userSay(SIGNS[sign].word)
        const react = step.react[sign]!
        await this.partnerSay(react.say, react.mood)
      } else {
        await this.partnerSay(SKIP_LINE, 'neutral')
      }
    }
    this.sfx.finish()
    await wait(600)
    return answers
  }

  private async partnerSay(text: string, mood: Mood) {
    this.partner.figure.setMood(mood)
    this.partner.figure.setSpeaking(true)
    this.partnerTile.classList.add('is-speaking')
    this.captionWho.textContent = `${PARTNER_NAME}:`
    this.caption.textContent = text
    this.caption.parentElement!.dataset.who = 'partner'
    await this.voice.say(text, 'partner')
    this.partner.figure.setSpeaking(false)
    this.partnerTile.classList.remove('is-speaking')
  }

  /** Перевод жеста: показываем словом и озвучиваем, как будто человек сказал это вслух. */
  private async userSay(word: string) {
    this.captionWho.textContent = 'Ты жестом:'
    this.caption.textContent = `«${word}»`
    this.caption.parentElement!.dataset.who = 'user'
    this.selfTile.dataset.said = word
    this.selfTile.classList.add('is-success')
    await this.voice.say(word, 'user')
    await wait(300)
    this.selfTile.classList.remove('is-success')
    this.engine.handColor = COLOR.idle
  }

  private showCards(expect: SignId[], title: string) {
    this.answerTitle.textContent = title
    for (const c of this.cards) c.destroy()
    this.cards = expect.map((id) => new SignCard(id))
    this.cardsBox.replaceChildren(...this.cards.map((c) => c.el))
  }

  private listen(expect: SignId[]): Promise<SignId | null> {
    this.recognizer.reset()
    this.others.reset()
    this.coach.reset(performance.now())
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
    for (const card of this.cards) card.update(state.evals.find((e) => e.id === card.id), card.id === best?.id)
    this.engine.handColor = hint && hint.kind !== 'info' ? COLOR.warn : COLOR.idle
    this.engine.guide = state.recognized ? null : (hint?.guide ?? null)

    const waited = performance.now() - l.started
    if (!state.recognized && !this.showingHow && waited > SHOW_HOW_MS) {
      this.showingHow = true
      this.partner.playAll(l.expect)
      this.answerTitle.textContent = `${PARTNER_NAME} показывает, как ответить. Повтори за ней`
    }

    if (state.recognized) {
      this.engine.handColor = COLOR.ok
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
    this.engine.guide = null
    this.partner.stop()
    this.hint.show(null)
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
