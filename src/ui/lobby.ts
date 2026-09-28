import type { Engine, Tick } from '../app/engine.ts'
import type { Sfx } from '../audio/sfx.ts'
import type { Voice } from '../audio/voice.ts'
import { Coach } from '../meeting/coach.ts'
import { PARTNER_NAME, SCRIPT } from '../meeting/script.ts'
import { ALL_SIGNS, SIGNS } from '../signs/catalog.ts'
import { SignRecognizer } from '../signs/recognizer.ts'
import { CameraError } from '../vision/camera.ts'
import { Avatar } from './avatar.ts'
import { h } from './dom.ts'
import { HintBar } from './hintBar.ts'

/**
 * Первый экран: что это за встреча, как сесть перед камерой и какие жесты понадобятся.
 * Здесь же калибровка: проверяем, что видно лицо, плечи и руку, а войти можно,
 * только помахав рукой, то есть показав первый жест.
 */
export class Lobby {
  readonly el: HTMLElement
  private off: (() => void) | null = null
  private recognizer = new SignRecognizer()
  private coach = new Coach()
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
    this.enter = h('div', { class: 'enter', hidden: true },
      h('strong', {}, 'Помаши рукой, чтобы войти'),
      h('span', {}, 'Это жест «Привет»: открытая ладонь у плеча, покачай ею влево и вправо'),
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
          h('p', { class: 'meet-card__meta' }, `${SCRIPT.length} вопросов, около трёх минут, ответы на русском жестовом языке`),
          h('ol', { class: 'howto' },
            h('li', {}, 'Сядь так, чтобы камера видела лицо, плечи и руки.'),
            h('li', {}, `${PARTNER_NAME} говорит, а ты отвечаешь жестами. Карточки внизу покажут, какие жесты подходят.`),
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
          ...ALL_SIGNS.map((id) => h('div', { class: 'dict-card' }, h('b', {}, SIGNS[id].word), h('span', {}, SIGNS[id].how))),
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
    this.button.hidden = true
    this.enter.hidden = false
    this.status.textContent = ''
    this.checks.camera.classList.add('ok')
    this.coach.reset(performance.now())
    this.off = this.engine.on((t) => this.tick(t))
  }

  private tick({ features }: Tick) {
    const state = this.recognizer.update(features, ['privet'])
    this.checks.body.classList.toggle('ok', state.bodyVisible)
    this.checks.hand.classList.toggle('ok', state.handVisible)
    const hint = this.coach.update(features.timestamp, features, state, ['privet'])
    this.hint.show(hint)
    this.engine.handColor = hint && hint.kind !== 'info' ? '#ffb547' : '#4f7cff'
    if (state.recognized) {
      this.engine.handColor = '#3ddc97'
      this.sfx.join()
      this.onEnter()
    }
  }

  destroy() {
    this.off?.()
  }
}
