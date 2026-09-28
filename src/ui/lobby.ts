import type { Engine, Tick } from '../app/engine.ts'
import type { Sfx } from '../audio/sfx.ts'
import type { Voice } from '../audio/voice.ts'
import { PARTNER_NAME, SCRIPT } from '../meeting/script.ts'
import { SIGNS } from '../signs/catalog.ts'
import { CameraError } from '../vision/camera.ts'
import { KEY_MOMENT, SignDemo, THUMB_CROP } from '../demo/signDemo.ts'
import { h, plural } from './dom.ts'
import type { Hint } from '../meeting/coach.ts'
import { HintBar } from './hintBar.ts'
import { icon, type IconName } from './icons.ts'
import { showState } from './state.ts'
import { TRAINING } from './training.ts'

/** Сколько держать руку в кадре, чтобы начать: случайное движение не считается. */
const HOLD_MS = 1500

/**
 * Пустая плитка камеры: как сесть. Пунктирные голова и плечи, поднятая рука (синяя: «твой ход»)
 * и уголки кадра. Координаты под плитку 16:9.
 */
const SILHOUETTE = `<svg class="lobby__pose" viewBox="0 0 320 180" fill="none" aria-hidden="true">
  <path class="lobby__pose-frame" d="M40 40V22h18M280 40V22h-18M40 150v18h18M280 150v18h-18" />
  <g class="lobby__pose-body">
    <ellipse cx="146" cy="72" rx="27" ry="33" />
    <path d="M82 180c3-36 28-60 64-62 36 2 61 26 64 62" />
    <path d="M201 142l17-40" />
  </g>
  <path class="lobby__pose-hand" transform="translate(195 34) scale(2.6)" d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11V4a1.5 1.5 0 0 1 3 0v7M14 11V5.5a1.5 1.5 0 0 1 3 0V13M17 9.5a1.5 1.5 0 0 1 3 0V15a7 7 0 0 1-7 7h-1.5a6 6 0 0 1-4.6-2.2L3.6 15.9a1.6 1.6 0 0 1 2.4-2.1L8 16" />
</svg>`

/** Что будет дальше: четыре коротких шага. */
const STEPS: [string, string][] = [
  ['Сядь перед камерой', 'Так, чтобы камера видела лицо, плечи и руки.'],
  [`Повтори за ${PARTNER_NAME}`, 'Она покажет восемь жестов, а ты повторишь их, как в зеркале.'],
  ['Ответь жестами', 'Потом встреча: она спрашивает, а ты отвечаешь жестами.'],
  ['Поправь по подсказке', 'Если жест не выходит, внизу видео появится подсказка, что именно поправить.'],
]

type StatusState = 'loading' | 'ready' | 'error'

/**
 * Первый экран: что это за встреча, превью звонка (Айгерим машет, рядом плитка камеры),
 * как сесть перед камерой и какие жесты понадобятся.
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
  private meterBox: HTMLElement
  private tile: HTMLElement
  private preview: HTMLElement
  private calib: HTMLElement
  private hint = new HintBar()
  private button: HTMLButtonElement
  private status: HTMLElement
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

    this.button = h('button', { class: 'btn btn--primary btn--lg lobby__start', type: 'button' })
    this.setButton(false, 'Включить камеру')
    this.status = h('p', { class: 'lobby__status', role: 'status', 'aria-live': 'polite' })
    this.setStatus('loading', 'Загружаем распознавание…')

    // Превью звонка: Айгерим машет «Привет», рядом плитка камеры с подсказкой, как сесть.
    const wave = new SignDemo('privet')
    wave.el.setAttribute('aria-hidden', 'true')
    // «Меньше движения»: взмах декоративный, Айгерим замирает с поднятой ладонью, как в итогах.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      wave.seek(KEY_MOMENT.privet)
      wave.figure.el.classList.add('still')
    }
    this.demos.push(wave)
    const partner = h('div', { class: 'tile tile--partner' },
      wave.el,
      h('div', { class: 'tile__label' }, h('span', { class: 'lobby__online', 'aria-hidden': true }), PARTNER_NAME),
    )
    const empty = h('div', { class: 'tile__empty lobby__empty' },
      h('strong', {}, 'Здесь будет видео с твоей камеры'),
      h('span', {}, 'Сядь так, чтобы в кадре были лицо, плечи и поднятая рука'),
    )
    empty.insertAdjacentHTML('afterbegin', SILHOUETTE)
    this.tile = h('div', { class: 'tile tile--self' },
      empty,
      this.hint.el,
      h('div', { class: 'tile__label' }, 'Ты'),
    )

    // Состояние проверки видно цветом и значком, экранному диктору его называет скрытый текст.
    const check = (text: string) => h('li', { class: 'chip' }, text, h('span', { class: 'visually-hidden' }, ': пока нет'))
    this.checks = {
      camera: check('Камера включена'),
      body: check('Видны лицо и плечи'),
      hand: check('Видна рука'),
    }
    this.meter = h('i')
    this.meterBox = h('div', {
      class: 'calib__meter',
      role: 'progressbar',
      'aria-label': 'Держи руку поднятой',
      'aria-valuemin': 0,
      'aria-valuemax': 100,
      'aria-valuenow': 0,
    }, this.meter)
    // До камеры: строка с пустыми отметками. После: панель «подними руку и подержи» со шкалой.
    this.calib = h('div', { class: 'calib' },
      h('span', { class: 'calib__icon', 'aria-hidden': true }, icon('hand')),
      h('div', { class: 'calib__text' },
        h('p', { class: 'calib__lead' }, 'Перед началом проверим, что камера тебя видит'),
        h('strong', { class: 'calib__title' }, 'Подними руку и подержи, чтобы начать'),
        h('span', { class: 'calib__sub' }, `Сначала ${PARTNER_NAME} покажет жесты, а ты повторишь. Потом начнётся встреча.`),
      ),
      h('ul', { class: 'checks', 'aria-label': 'Проверка камеры' }, this.checks.camera, this.checks.body, this.checks.hand),
      this.meterBox,
    )
    this.preview = h('section', { class: 'lobby__preview', 'aria-label': 'Превью встречи' },
      h('div', { class: 'stage' }, partner, this.tile),
      this.calib,
    )

    const fact = (name: IconName, ...children: (Node | string)[]) =>
      h('li', { class: 'chip' }, icon(name), ...children)
    const signs = TRAINING.length
    const questions = SCRIPT.length

    this.el = h('section', { class: 'screen lobby' },
      h('header', { class: 'brand' },
        h('span', { class: 'brand__mark', 'aria-hidden': true }, icon('hand')),
        h('span', { class: 'brand__name' }, 'Ishara'),
        h('span', { class: 'brand__tag' }, 'видеовстреча на языке жестов'),
      ),
      h('div', { class: 'lobby__hero' },
        h('p', { class: 'overline lobby__overline' }, `Встреча с ${PARTNER_NAME}`),
        h('h1', { class: 'display lobby__title' },
          h('span', { class: 'lobby__title-line' }, 'Скажи «Привет»'), ' ',
          h('span', { class: 'lobby__accent' }, 'рукой.'),
        ),
        h('p', { class: 'lobby__lead' }, `${PARTNER_NAME} покажет восемь жестов, а потом спросит, как у тебя дела. Отвечать будешь жестами.`),
        h('ul', { class: 'lobby__facts', 'aria-label': 'Коротко о встрече' },
          fact('hand', h('b', {}, String(signs)), ` ${plural(signs, 'жест', 'жеста', 'жестов')}`),
          fact('chat', h('b', {}, String(questions)), ` ${plural(questions, 'вопрос', 'вопроса', 'вопросов')}`),
          fact('clock', 'около ', h('b', {}, '5'), ' минут'),
        ),
        h('div', { class: 'lobby__cta' }, this.button, this.status),
      ),
      this.preview,
      h('section', { class: 'lobby__how', 'aria-labelledby': 'lobby-how' },
        h('h2', { id: 'lobby-how' }, 'Как это будет'),
        h('ol', { class: 'steps' },
          ...STEPS.map(([title, text], i) =>
            h('li', {},
              h('span', { class: 'steps__n', 'aria-hidden': true }, String(i + 1)),
              h('div', {}, h('strong', {}, title), h('p', {}, text)),
            ),
          ),
        ),
      ),
      h('section', { class: 'dictionary', 'aria-labelledby': 'lobby-dict' },
        h('div', { class: 'dictionary__head' },
          h('h2', { id: 'lobby-dict' }, 'Жесты этой встречи'),
          h('p', { class: 'dictionary__note' }, 'Из словарей русского жестового языка, которым пользуются глухие в Казахстане.'),
        ),
        h('ul', { class: 'dictionary__grid' },
          ...TRAINING.map((id) => {
            // Стоп-кадр в момент, где жест узнаётся лучше всего: восемь живых показов отвлекали бы.
            const demo = new SignDemo(id, THUMB_CROP)
            demo.seek(KEY_MOMENT[id])
            demo.figure.el.classList.add('still')
            if (id === 'plokho') demo.figure.setMood('sad')
            this.demos.push(demo)
            return h('li', { class: 'dict-card' },
              h('div', { class: 'dict-card__demo', 'aria-hidden': true }, demo.el),
              h('div', { class: 'dict-card__text' },
                h('strong', { class: 'dict-card__word' }, SIGNS[id].word),
                h('span', { class: 'dict-card__how' }, SIGNS[id].how),
              ),
            )
          }),
        ),
      ),
    )

    engine.loadModels((p) => this.setStatus('loading', `Загружаем распознавание: ${Math.round(p * 100)}%`))
      .then(() => this.setStatus('ready', 'Распознавание готово'))
      .catch(() => this.setStatus('error', 'Не удалось загрузить распознавание. Обнови страницу.'))
    this.button.addEventListener('click', () => this.start())
  }

  private setCheck(name: keyof Lobby['checks'], ok: boolean) {
    const li = this.checks[name]
    if (li.classList.contains('ok') === ok) return
    li.classList.toggle('ok', ok)
    li.lastElementChild!.textContent = ok ? ': готово' : ': пока нет'
  }

  private setButton(busy: boolean, text: string) {
    this.button.replaceChildren(busy ? h('span', { class: 'spinner', 'aria-hidden': true }) : icon('camera'), text)
  }

  private setStatus(state: StatusState, text: string) {
    this.status.dataset.state = state
    this.status.replaceChildren(
      state === 'loading' ? h('span', { class: 'spinner', 'aria-hidden': true }) : h('span', { class: 'lobby__status-dot', 'aria-hidden': true }),
      text,
    )
  }

  private async start() {
    // Клик нужен браузеру, чтобы разрешить звук и голос; дальше всё управляется руками.
    this.sfx.unlock()
    this.voice.unlock()
    this.button.disabled = true
    this.setButton(true, 'Включаем камеру…')
    try {
      await this.engine.start()
    } catch (err) {
      this.button.disabled = false
      this.setButton(false, 'Попробовать ещё раз')
      this.setStatus('error', err instanceof CameraError ? `${err.message}. ${err.hint}.` : `Ошибка: ${String(err)}`)
      return
    }
    this.tile.querySelector('.tile__empty')?.remove()
    this.engine.mount(this.tile)
    showState(this.engine, this.tile, 'turn')
    // Имя экрана остаётся последним классом: по нему называются скриншоты прогонов.
    this.el.className = 'screen is-live lobby'
    this.button.hidden = true
    this.status.replaceChildren()
    this.setCheck('camera', true)
    // Видео и шкала «подержи» в одном экране, на телефоне тоже: показываем превью целиком.
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    this.preview.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' })
    this.off = this.engine.on((t) => this.tick(t))
  }

  private tick({ features }: Tick) {
    const t = features.timestamp
    const body = features.body !== null
    const hand = features.hands.length > 0
    this.setCheck('body', body)
    this.setCheck('hand', hand)

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
    const pct = Math.round(progress * 100)
    this.meter.style.width = `${pct}%`
    this.meterBox.setAttribute('aria-valuenow', String(pct))
    // Ждём руку: синий «твой ход». Рука в кадре и шкала растёт: зелёный.
    const holding = progress > 0
    this.calib.classList.toggle('is-holding', holding)
    showState(this.engine, this.tile, holding ? 'ok' : 'turn')
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
