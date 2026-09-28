import type { Engine, Tick } from '../app/engine.ts'
import type { Sfx } from '../audio/sfx.ts'
import type { Voice } from '../audio/voice.ts'
import { PARTNER_NAME, SCRIPT } from '../meeting/script.ts'
import { ALL_SIGNS, SIGNS } from '../signs/catalog.ts'
import { CameraError } from '../vision/camera.ts'
import { SignDemo } from '../demo/signDemo.ts'
import { Avatar } from './avatar.ts'
import { h, plural } from './dom.ts'
import type { Hint } from '../meeting/coach.ts'
import { HintBar } from './hintBar.ts'
import { stateColor } from './state.ts'

/** Сколько держать руку в кадре, чтобы начать: случайное движение не считается. */
const HOLD_MS = 1500

/**
 * Первый экран: что это за встреча, как сесть перед камерой и какие жесты понадобятся.
 * Здесь же калибровка: проверяем, что видно лицо, плечи и руку. Жестов человек ещё
 * не знает, поэтому чтобы начать, достаточно поднять руку и подержать.
 */
export class Lobby {
  readonly el: HTMLElement
  private off: (() => void) | null = null
  private holdSince: number | null = null
  private lastHand = 0
  private demos: SignDemo[] = []
  private meter: HTMLElement
  private tile: HTMLElement
  private hint = new HintBar()
  private button: HTMLButtonElement
  private status: HTMLElement
  private enter: HTMLElement
  private checks: Record<'camera' | 'body' | 'hand', HTMLElement>
  private readonly engine: Engine
  private readonly voice: Voice
  private readonly sfx: Sfx
  private readonly onEnter: () => void

  constructor(engine: Engine, voice: Voice, sfx: Sfx, onEnter: () => void) {
    this.engine = engine
    this.voice = voice
    this.sfx = sfx
    this.onEnter = onEnter

    const avatar = new Avatar()
    avatar.setMood('happy')
    this.button = h('button', { class: 'btn btn--primary', type: 'button' }, 'Включить камеру')
    this.status = h('p', { class: 'lobby__status' }, 'Загружаем распознавание…')
    this.meter = h('i')
    this.enter = h('div', { class: 'enter', hidden: true },
      h('strong', {}, 'Подними руку и подержи, чтобы начать'),
      h('span', {}, `Сначала ${PARTNER_NAME} покажет жесты, а ты повторишь. Потом начнётся встреча.`),
      h('div', { class: 'enter__meter' }, this.meter),
    )
    const check = (text: string) => h('li', {}, text)
    this.checks = {
      camera: check('Камера включена'),
      body: check('Видны лицо и плечи'),
      hand: check('Видна рука'),
    }
    this.tile = h('div', { class: 'tile tile--self' },
      h('div', { class: 'tile__empty' }, 'Здесь будет видео с твоей камеры'),
      this.hint.el,
      h('div', { class: 'tile__label' }, 'Ты'),
    )

    this.el = h('section', { class: 'screen lobby' },
      h('header', { class: 'brand' }, h('span', { class: 'brand__name' }, 'Ishara'), h('span', { class: 'brand__tag' }, 'видеовстреча на языке жестов')),
      h('div', { class: 'lobby__grid' },
        h('div', { class: 'lobby__main' },
          this.tile,
          h('ul', { class: 'checks' }, this.checks.camera, this.checks.body, this.checks.hand),
        ),
        h('aside', { class: 'meet-card' },
          h('div', { class: 'meet-card__avatar' }, avatar.el),
          h('h1', {}, `Встреча с ${PARTNER_NAME}`),
          h('p', { class: 'meet-card__meta' }, `Обучение и ${SCRIPT.length} ${plural(SCRIPT.length, 'вопрос', 'вопроса', 'вопросов')}, около пяти минут. Ответы на русском жестовом языке.`),
          h('ol', { class: 'howto' },
            h('li', {}, 'Сядь так, чтобы камера видела лицо, плечи и руки.'),
            h('li', {}, `Сначала ${PARTNER_NAME} покажет восемь жестов, а ты повторишь их за ней.`),
            h('li', {}, 'Потом встреча: она говорит, а ты отвечаешь жестами.'),
            h('li', {}, 'Если жест не получается, под видео появится подсказка, что именно поправить.'),
          ),
          this.button,
          this.enter,
          this.status,
        ),
      ),
      h('section', { class: 'dictionary' },
        h('h2', {}, 'Жесты этой встречи'),
        h('div', { class: 'dictionary__grid' },
          ...ALL_SIGNS.map((id) => {
            const demo = new SignDemo(id)
            this.demos.push(demo)
            return h('figure', { class: 'dict-card' }, h('div', { class: 'dict-card__demo' }, demo.el), h('figcaption', {}, SIGNS[id].word))
          }),
        ),
        h('p', { class: 'dictionary__note' }, 'Жесты взяты из словарей русского жестового языка, которым пользуются глухие в Казахстане.'),
      ),
    )

    engine.loadModels((p) => (this.status.textContent = `Загружаем распознавание: ${Math.round(p * 100)}%`))
      .then(() => (this.status.textContent = 'Распознавание готово'))
      .catch(() => (this.status.textContent = 'Не удалось загрузить распознавание. Обнови страницу.'))
    this.button.addEventListener('click', () => this.start())
  }

  private async start() {
    // Клик нужен браузеру, чтобы разрешить звук и голос; дальше всё управляется руками.
    this.sfx.unlock()
    this.voice.unlock()
    this.button.disabled = true
    this.button.textContent = 'Включаем камеру…'
    try {
      await this.engine.start()
    } catch (err) {
      this.button.disabled = false
      this.button.textContent = 'Попробовать ещё раз'
      this.status.textContent = err instanceof CameraError ? `${err.message}. ${err.hint}.` : `Ошибка: ${String(err)}`
      return
    }
    this.tile.querySelector('.tile__empty')?.remove()
    this.engine.mount(this.tile)
    // На телефоне окно камеры ниже карточки: показываем его.
    this.tile.scrollIntoView({ behavior: 'smooth', block: 'start' })
    this.button.hidden = true
    this.enter.hidden = false
    this.status.textContent = ''
    this.checks.camera.classList.add('ok')
    this.off = this.engine.on((t) => this.tick(t))
  }

  private tick({ features }: Tick) {
    const t = features.timestamp
    const body = features.body !== null
    const hand = features.hands.length > 0
    this.checks.body.classList.toggle('ok', body)
    this.checks.hand.classList.toggle('ok', hand)

    let hint: Hint | null = null
    if (!hand) hint = { kind: 'info', text: 'Подними руку в кадр' }
    else if (!body) hint = { kind: 'info', text: 'Лучше отодвинься, чтобы было видно лицо и плечи' }
    this.hint.show(hint)

    // Начать можно и без плеч в кадре: подсказка про посадку останется видна.
    // Если MediaPipe на миг потерял кисть, прогресс не сбрасываем.
    if (hand) {
      this.lastHand = t
      this.holdSince ??= t
    } else if (t - this.lastHand > 300) {
      this.holdSince = null
    }
    const progress = this.holdSince === null ? 0 : Math.min(1, (t - this.holdSince) / HOLD_MS)
    this.meter.style.width = `${Math.round(progress * 100)}%`
    this.engine.handColor = stateColor(progress > 0 ? 'ok' : 'turn')
    if (progress >= 1) {
      this.off?.()
      this.off = null
      this.sfx.join()
      this.onEnter()
    }
  }

  destroy() {
    this.off?.()
    for (const d of this.demos) d.destroy()
  }
}
