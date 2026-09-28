import type { Engine, Tick } from '../app/engine.ts'
import type { Sfx } from '../audio/sfx.ts'
import { wait, type Voice } from '../audio/voice.ts'
import { SignDemo } from '../demo/signDemo.ts'
import { Coach } from '../meeting/coach.ts'
import { PARTNER_NAME } from '../meeting/script.ts'
import { SIGNS, type SignId } from '../signs/catalog.ts'
import { SignRecognizer } from '../signs/recognizer.ts'
import { h } from './dom.ts'
import { HintBar } from './hintBar.ts'
import { SignCard } from './signCard.ts'

/** Порядок обучения: как жесты понадобятся во встрече. */
export const TRAINING: SignId[] = ['privet', 'khorosho', 'otlichno', 'plokho', 'da', 'net', 'spasibo', 'poka']

/** Если жест не выходит, через это время идём дальше: потренироваться можно и во встрече. */
const SIGN_TIMEOUT_MS = 30_000

const COLOR = { idle: '#4f7cff', warn: '#ffb547', ok: '#3ddc97' }

/**
 * Обучение перед встречей: Айгерим показывает жест, человек повторяет как в зеркале.
 * Подсказки режима «ошибка» работают так же, как во встрече.
 */
export class Training {
  readonly el: HTMLElement
  private demo = new SignDemo()
  private hint = new HintBar()
  private selfTile: HTMLElement
  private cardBox: HTMLElement
  private stepLabel: HTMLElement
  private dots: HTMLElement[]
  private card: SignCard | null = null
  private recognizer = new SignRecognizer()
  private coach = new Coach()
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

    this.stepLabel = h('span', { class: 'topbar__step' })
    this.dots = TRAINING.map(() => h('i'))
    this.selfTile = h('div', { class: 'tile tile--self' }, this.hint.el, h('div', { class: 'tile__label' }, 'Ты'))
    this.cardBox = h('div', { class: 'training__card' })

    this.el = h('section', { class: 'screen meeting training' },
      h('header', { class: 'topbar' },
        h('span', { class: 'topbar__title' }, 'Обучение'),
        this.stepLabel,
        h('span', { class: 'dots', 'aria-hidden': true }, ...this.dots),
      ),
      h('div', { class: 'stage' },
        h('div', { class: 'tile tile--partner' }, this.demo.el, h('div', { class: 'tile__label' }, `${PARTNER_NAME} показывает`)),
        this.selfTile,
      ),
      h('p', { class: 'training__lead' }, `Смотри, как показывает ${PARTNER_NAME}, и повтори правой рукой, как в зеркале.`),
      this.cardBox,
    )

    engine.mount(this.selfTile)
    engine.handColor = COLOR.idle
    this.off = engine.on((t) => this.tick(t))
    this.run().then(() => {
      if (!this.closed) onDone()
    })
  }

  private async run() {
    await this.say(`Привет! Я ${PARTNER_NAME}. Сначала выучим восемь жестов для нашей встречи.`)
    // Для разработки: ?from=spasibo начинает обучение с этого жеста.
    const from = import.meta.env.DEV ? TRAINING.indexOf(new URLSearchParams(location.search).get('from') as SignId) : -1
    for (const [i, id] of TRAINING.entries()) {
      if (i < from) continue
      if (this.closed) return
      this.stepLabel.textContent = `Жест ${i + 1} из ${TRAINING.length}`
      this.dots.forEach((d, j) => d.classList.toggle('on', j <= i))
      this.card?.destroy()
      // Показ уже идёт слева крупно, в карточке дублировать не нужно.
      this.card = new SignCard(id, false)
      this.cardBox.replaceChildren(this.card.el)
      this.demo.play(id)
      await this.say(`Жест «${SIGNS[id].word}». Повтори за мной.`)
      const ok = await this.expect(id)
      if (ok) {
        this.card.celebrate()
        this.selfTile.dataset.said = SIGNS[id].word
        this.selfTile.classList.add('is-success')
        await this.say(i === TRAINING.length - 1 ? 'Отлично!' : ['Получилось!', 'Отлично!', 'Здорово!'][i % 3])
        this.selfTile.classList.remove('is-success')
      } else {
        await this.say('Ничего, потренируемся ещё во время встречи.')
      }
    }
    this.demo.stop()
    this.stepLabel.textContent = 'Готово'
    await this.say('Молодец! Теперь давай поговорим.')
  }

  private async say(text: string) {
    this.demo.figure.setSpeaking(true)
    await this.voice.say(text, 'partner')
    this.demo.figure.setSpeaking(false)
  }

  private expect(id: SignId): Promise<boolean> {
    this.recognizer.reset()
    this.coach.reset(performance.now())
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
    this.card?.update(state.evals[0], true)
    this.engine.handColor = hint && hint.kind !== 'info' ? COLOR.warn : COLOR.idle
    this.engine.guide = state.recognized ? null : (hint?.guide ?? null)

    if (state.recognized) {
      this.engine.handColor = COLOR.ok
      this.sfx.success()
      this.finish(true)
    } else if (performance.now() - target.started > SIGN_TIMEOUT_MS) {
      this.finish(false)
    }
  }

  private finish(ok: boolean) {
    const t = this.target
    this.target = null
    this.engine.guide = null
    this.hint.show(null)
    t?.resolve(ok)
    wait(900).then(() => {
      if (!this.target) this.engine.handColor = COLOR.idle
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
