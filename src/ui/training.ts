import type { Engine, Tick } from '../app/engine.ts'
import type { Sfx } from '../audio/sfx.ts'
import { wait, type Voice } from '../audio/voice.ts'
import { SignDemo } from '../demo/signDemo.ts'
import { Coach } from '../meeting/coach.ts'
import { PARTNER_NAME } from '../meeting/script.ts'
import { SIGNS, type SignId } from '../signs/catalog.ts'
import { SignRecognizer } from '../signs/recognizer.ts'
import { Caption } from './caption.ts'
import { h, plural } from './dom.ts'
import { HintBar } from './hintBar.ts'
import { icon } from './icons.ts'
import { SignCard } from './signCard.ts'
import { hintState, showState, tileStatus } from './state.ts'

/** Порядок обучения: как жесты понадобятся во встрече. */
export const TRAINING: SignId[] = ['privet', 'khorosho', 'otlichno', 'plokho', 'da', 'net', 'spasibo', 'poka']

/** Если жест не выходит, через это время идём дальше: потренироваться можно и во встрече. */
const SIGN_TIMEOUT_MS = 30_000

/** Шаг пути в шапке: пройден, сейчас, не вышел (потренируем во встрече) или впереди (без класса). */
type PathState = 'done' | 'now' | 'missed'

/**
 * Обучение перед встречей: Айгерим показывает жест, человек повторяет как в зеркале.
 * Подсказки режима «ошибка» работают так же, как во встрече.
 *
 * Разметка: .topbar (название, «Жест N из 8», путь из восьми имён, «Пропустить обучение»),
 * две плитки, субтитры с репликами Айгерим, карточка жеста с советом «как в зеркале» внизу.
 */
export class Training {
  readonly el: HTMLElement
  private demo = new SignDemo()
  private hint = new HintBar()
  /** Что говорит Айгерим, текстом: для тех, кто не слышит или без звука. */
  private caption = new Caption()
  private selfTile: HTMLElement
  private partnerTile: HTMLElement
  /** Подпись плитки Айгерим: «показывает», только пока она показывает жест рукой. */
  private partnerLabel: HTMLElement
  private cardBox: HTMLElement
  private stepLabel: HTMLElement
  /** Путь обучения: восемь жестов по именам, по одному пункту на жест из TRAINING. */
  private path: HTMLLIElement[]
  private card: SignCard | null = null
  private recognizer = new SignRecognizer()
  private coach = new Coach(`Подними руку в кадр и повтори жест за ${PARTNER_NAME}`)
  private target: { id: SignId; resolve: (ok: boolean) => void; started: number } | null = null
  private off: () => void
  private closed = false
  private readonly engine: Engine
  private readonly voice: Voice
  private readonly sfx: Sfx

  constructor(engine: Engine, voice: Voice, sfx: Sfx, onDone: () => void) {
    this.engine = engine
    this.voice = voice
    this.sfx = sfx

    this.stepLabel = h('span', { class: 'topbar__step' }, `${TRAINING.length} ${plural(TRAINING.length, 'жест', 'жеста', 'жестов')}`)
    this.path = TRAINING.map((id) => h('li', { title: SIGNS[id].word }, h('span', { class: 'training__path-word' }, SIGNS[id].word)))
    this.selfTile = h('div', { class: 'tile tile--self' }, this.hint.el, tileStatus(), h('div', { class: 'tile__label' }, 'Ты'))
    this.partnerLabel = h('div', { class: 'tile__label' }, PARTNER_NAME)
    this.partnerTile = h('div', { class: 'tile tile--partner' }, this.demo.el, this.partnerLabel)
    this.cardBox = h('div', { class: 'training__card' })
    // Для тех, кто уже знает жесты или проходит второй раз: сразу к встрече. Тихая кнопка в шапке.
    const skip = h('button', { class: 'btn btn--ghost training__skip', type: 'button', 'aria-label': 'Пропустить обучение' },
      icon('skip'),
      h('span', {}, 'Пропустить', h('span', { class: 'training__skip-long' }, ' обучение')),
    )
    skip.addEventListener('click', () => {
      if (this.closed) return
      this.closed = true
      onDone()
    })

    this.el = h('section', { class: 'screen call training' },
      h('header', { class: 'topbar training__top' },
        h('h1', { class: 'topbar__title' }, 'Обучение'),
        this.stepLabel,
        h('ol', { class: 'training__path', 'aria-label': 'Жесты обучения' }, ...this.path),
        skip,
      ),
      h('div', { class: 'stage' },
        this.partnerTile,
        this.selfTile,
      ),
      this.caption.el,
      this.cardBox,
    )

    engine.mount(this.selfTile)
    showState(engine, this.selfTile, null)
    this.off = engine.on((t) => this.tick(t))
    this.run().then(() => {
      if (!this.closed) onDone()
    })
  }

  private async run() {
    // Для разработки: ?from=spasibo начинает обучение с этого жеста.
    const from = import.meta.env.DEV ? TRAINING.indexOf(new URLSearchParams(location.search).get('from') as SignId) : -1
    // Пока Айгерим здоровается, первая карточка уже видна приглушённой: место под ней не прыгает.
    this.showCard(TRAINING[Math.max(0, from)], true)
    await this.say(`Привет! Я ${PARTNER_NAME}. Сначала выучим восемь жестов для нашей встречи.`)
    for (const [i, id] of TRAINING.entries()) {
      if (i < from) continue
      if (this.closed) return
      this.stepLabel.textContent = `Жест ${i + 1} из ${TRAINING.length}`
      this.mark(i, 'now')
      this.showCard(id)
      this.demo.play(id)
      this.partnerLabel.textContent = `${PARTNER_NAME} показывает`
      await this.say(`Жест «${SIGNS[id].word}». Повтори за мной.`)
      const ok = await this.expect(id)
      if (this.closed) return
      this.mark(i, ok ? 'done' : 'missed')
      if (ok) {
        this.demo.figure.nod()
        this.card?.celebrate()
        this.selfTile.dataset.said = SIGNS[id].word
        this.selfTile.classList.add('is-success')
        await this.say(i === TRAINING.length - 1 ? 'Отлично!' : ['Получилось!', 'Отлично!', 'Здорово!'][i % 3])
        this.selfTile.classList.remove('is-success')
      } else {
        await this.say('Ничего, потренируемся ещё во время встречи.')
      }
    }
    this.demo.stop()
    this.partnerLabel.textContent = PARTNER_NAME
    this.stepLabel.textContent = 'Готово'
    this.stepLabel.classList.add('is-done')
    await this.say('Молодец! Теперь давай поговорим.')
  }

  /**
   * Карточка жеста: слово, как показать, «насколько похоже» и чек-лист справа.
   * Рядом со словом чип «Получилось», внизу совет «как в зеркале». Пока руки не видно, на месте
   * чек-листа строка «подними руку» (её показывает CSS, только пока ждём жест, см. .is-trying).
   * muted: предпросмотр, пока Айгерим здоровается.
   */
  private showCard(id: SignId, muted = false) {
    if (this.card?.id === id) {
      this.card.el.classList.toggle('is-muted', muted)
      return
    }
    this.card?.destroy()
    // Показ уже идёт слева крупно, в карточке дублировать не нужно.
    const card = new SignCard(id, {
      demo: false,
      wide: true,
      badge: h('span', { class: 'chip chip--green training__done' }, icon('check'), 'Получилось'),
      footer: h('p', { class: 'training__lead' }, icon('mirror'), `Смотри, как показывает ${PARTNER_NAME}, и повтори правой рукой, как в зеркале.`),
    })
    card.el.classList.toggle('is-muted', muted)
    this.card = card
    this.cardBox.replaceChildren(card.el)
  }

  /** Состояние шага на пути в шапке. У текущего aria-current, чтобы экранный диктор знал, где мы. */
  private mark(i: number, state: PathState) {
    const li = this.path[i]
    li.classList.remove('is-done', 'is-now', 'is-missed')
    li.classList.add(`is-${state}`)
    if (state === 'now') li.setAttribute('aria-current', 'step')
    else li.removeAttribute('aria-current')
  }

  private async say(text: string) {
    // После «Пропустить» обучение закрыто: Айгерим не должна договаривать поверх встречи.
    if (this.closed) return
    this.demo.figure.setListening(false)
    this.demo.figure.setSpeaking(true)
    this.partnerTile.classList.add('is-speaking')
    this.caption.partner(text)
    await this.voice.say(text, 'partner')
    this.demo.figure.setSpeaking(false)
    this.partnerTile.classList.remove('is-speaking')
  }

  private expect(id: SignId): Promise<boolean> {
    this.recognizer.reset()
    this.coach.reset(performance.now())
    // Пока человек пробует, Айгерим слушает: голова чуть наклонена.
    this.demo.figure.setListening(true)
    showState(this.engine, this.selfTile, 'turn')
    this.cardBox.classList.add('is-trying')
    return new Promise((resolve) => {
      this.target = { id, resolve, started: performance.now() }
    })
  }

  private tick({ features }: Tick) {
    const target = this.target
    if (!target) return
    const state = this.recognizer.update(features, [target.id])
    const hint = this.coach.update(features.timestamp, features, state, [target.id])
    this.hint.show(state.recognized ? null : hint)
    const now = performance.now()
    // Короткую потерю руки карточка переживает сама (удержание в SignCard).
    this.card?.update(state.evals[0], true, !state.recognized && hint && hintState(hint) === 'fix' ? hint.text : null)
    showState(this.engine, this.selfTile, hintState(hint))
    this.engine.guide = state.recognized ? null : (hint?.guide ?? null)

    if (state.recognized) {
      showState(this.engine, this.selfTile, 'ok')
      this.sfx.success()
      this.finish(true)
    } else if (now - target.started > SIGN_TIMEOUT_MS) {
      this.finish(false)
    }
  }

  private finish(ok: boolean) {
    const t = this.target
    this.target = null
    this.engine.guide = null
    this.hint.show(null)
    this.cardBox.classList.remove('is-trying')
    t?.resolve(ok)
    wait(900).then(() => {
      if (!this.target && !this.closed) showState(this.engine, this.selfTile, null)
    })
  }

  destroy() {
    this.closed = true
    this.off()
    this.demo.destroy()
    this.card?.destroy()
    this.voice.stop()
    this.finish(false)
  }
}
