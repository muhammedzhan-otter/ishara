import { MotionTrack } from '../vision/features.ts'
import type { Body, HandFeatures } from '../vision/features.ts'

/*
 * Словарь жестов РЖЯ (источники в docs/signs.md).
 * Каждый жест описан списком условий по порядку важности. Условие возвращает степень
 * выполнения 0..1 и подсказку, что исправить, если оно не выполнено. Из этих подсказок
 * и складывается режим «ошибка».
 */

export type SignId = 'privet' | 'poka' | 'spasibo' | 'da' | 'net' | 'khorosho' | 'otlichno' | 'plokho'

export interface Check {
  ok: number
  hint: string
}

export interface Sample {
  t: number
  f: HandFeatures
}

export interface SignContext {
  f: HandFeatures
  /** История этой руки за последние ~2 секунды, от старых кадров к новым. */
  hist: Sample[]
  body: Body
  t: number
}

export interface SignDef {
  id: SignId
  word: string
  /** Как выполнить жест, одной фразой: показывается в обучении. */
  how: string
  /** Статичный жест нужно подержать, динамичный засчитывается в момент завершения движения. */
  kind: 'static' | 'dynamic'
  checks(ctx: SignContext): Check[]
}

/** Плавный переход: 0 при значении bad, 1 при good (работает в обе стороны). */
export function ramp(v: number, bad: number, good: number): number {
  const k = (v - bad) / (good - bad)
  return Math.max(0, Math.min(1, k))
}

const recent = (ctx: SignContext, ms: number) => ctx.hist.filter((s) => ctx.t - s.t <= ms)

function track(samples: Sample[], pick: (f: HandFeatures) => { x: number; y: number } | null): MotionTrack {
  const m = new MotionTrack(3000)
  for (const s of samples) {
    const p = pick(s.f)
    if (p) m.push(s.t, p)
  }
  return m
}

/** Самый разогнутый из четырёх пальцев: у кулака он всё равно согнут. */
const maxExt4 = (f: HandFeatures) => Math.max(f.ext.index, f.ext.middle, f.ext.ring, f.ext.pinky)

/** Кисть поднята примерно до уровня плеча. */
const atShoulder = (ctx: SignContext): Check => ({
  ok: ramp(ctx.f.palmPos!.y, ctx.body.shoulderY + 0.7, ctx.body.shoulderY + 0.35),
  hint: 'Подними кисть до уровня плеча',
})

const palmToPartner = (ctx: SignContext, from = 0.2, to = 0.5): Check => ({
  ok: ramp(ctx.f.palm.toCamera, from, to),
  hint: 'Разверни ладонь к собеседнику',
})

export const SIGNS: Record<SignId, SignDef> = {
  privet: {
    id: 'privet',
    word: 'Привет',
    how: 'Открытая ладонь у плеча смотрит на собеседника, покачай ею влево и вправо',
    kind: 'dynamic',
    checks: (ctx) => {
      const last = recent(ctx, 1500)
      const tips = track(last, (f) => f.tipPos)
      const minOpen = Math.min(...recent(ctx, 1000).map((s) => s.f.open))
      return [
        { ok: ramp(ctx.f.open, 0.45, 0.65), hint: 'Выпрями пальцы, ладонь открыта' },
        palmToPartner(ctx),
        atShoulder(ctx),
        { ok: ramp(minOpen, 0.3, 0.5), hint: 'Пальцы не сгибай, качай всей ладонью' },
        { ok: ramp(tips.swings(1500, 'x', 0.08), 0, 2), hint: 'Покачай ладонью влево и вправо' },
      ]
    },
  },

  poka: {
    id: 'poka',
    word: 'Пока',
    how: 'Ладонь у плеча смотрит на собеседника, все пальцы разом сгибаются и разгибаются, как будто сжимаешь мячик',
    kind: 'dynamic',
    checks: (ctx) => {
      const last = recent(ctx, 1500)
      const openTrack = track(last, (f) => ({ x: f.open, y: 0 }))
      const palms = track(recent(ctx, 1000), (f) => f.palmPos)
      return [
        palmToPartner(ctx, 0.15, 0.4),
        atShoulder(ctx),
        { ok: ramp(palms.range(1000, 'x'), 0.35, 0.2), hint: 'Держи кисть на месте, двигаются только пальцы' },
        { ok: ramp(openTrack.swings(1500, 'x', 0.1), 0, 2), hint: 'Сгибай и разгибай все пальцы разом, как будто сжимаешь мячик' },
      ]
    },
  },

  spasibo: {
    id: 'spasibo',
    word: 'Спасибо',
    how: 'Кулак касается лба, затем опускается и костяшками касается подбородка',
    kind: 'dynamic',
    checks: (ctx) => {
      const { body } = ctx
      const last = recent(ctx, 2500)
      // Этап 1: кулак у лба (кончики пальцев выше линии глаз, у лица).
      const i = last.findIndex(
        (s) => s.f.tipPos && s.f.tipPos.y <= body.eyeY + 0.02 && Math.abs(s.f.tipPos.x) <= 0.5 && maxExt4(s.f) < 0.55,
      )
      const forehead = i >= 0
      const highest = Math.min(...last.map((s) => s.f.tipPos?.y ?? 9))
      // Этап 2: после лба кулак опустился к подбородку и сейчас там.
      // Меряем от самой высокой точки ладони после касания лба, а не от первого кадра у лба.
      const p = ctx.f.palmPos!
      const top = forehead ? Math.min(...last.slice(i).map((s) => s.f.palmPos?.y ?? 9)) : p.y
      const nearChin = p.y >= body.mouthY - 0.05 && p.y <= body.chinY + 0.3 && Math.abs(p.x) <= 0.45
      return [
        { ok: ramp(maxExt4(ctx.f), 0.55, 0.35), hint: 'Сожми кулак' },
        { ok: forehead ? 1 : ramp(highest, body.chinY, body.eyeY), hint: 'Начни с касания лба кулаком' },
        {
          ok: forehead && nearChin ? ramp(p.y - top, 0.08, 0.18) : 0,
          hint: 'Теперь опусти кулак ко рту и коснись подбородка',
        },
      ]
    },
  },

  da: {
    id: 'da',
    word: 'Да',
    how: 'Перед грудью вытянутые указательный и средний пальцы сгибаются в кулак, кисть коротко кивает вниз',
    kind: 'dynamic',
    checks: (ctx) => {
      const { f, body, t } = ctx
      // Последний кадр с вытянутыми пальцами: от него до кулака должно пройти не больше секунды.
      const start = recent(ctx, 1200)
        .filter((s) => t - s.t >= 150 && s.f.ext.index >= 0.55 && s.f.ext.middle >= 0.55)
        .at(-1)
      const dy = start?.f.palmPos ? f.palmPos!.y - start.f.palmPos.y : 0
      // Кулак должен задержаться на месте: так «да» не путается с рукой, которую просто опускают.
      const tail = recent(ctx, 200)
      const tailYs = tail.map((s) => s.f.palmPos?.y ?? 0)
      const steady = tail.length >= 3 && Math.max(...tailYs) - Math.min(...tailYs) <= 0.08
      return [
        { ok: ramp(f.palmPos!.y, body.chinY - 0.15, body.chinY + 0.05), hint: 'Опусти руку ниже, к груди' },
        { ok: ramp(f.palmPos!.y, body.shoulderY + 1.3, body.shoulderY + 0.9), hint: 'Подними руку выше, к груди' },
        { ok: start ? 1 : 0, hint: 'Начни с вытянутых указательного и среднего пальцев' },
        { ok: ramp(Math.max(f.ext.index, f.ext.middle), 0.5, 0.3), hint: 'Согни эти пальцы в кулак' },
        { ok: start ? ramp(dy, 0.02, 0.06) : 0, hint: 'Сгибая пальцы, чуть опусти кисть, как кивок' },
        { ok: steady ? 1 : 0, hint: 'Задержи кулак перед грудью' },
      ]
    },
  },

  net: {
    id: 'net',
    word: 'Нет',
    how: 'Открытая ладонь одним движением отмахивается от середины груди в сторону',
    kind: 'dynamic',
    checks: (ctx) => {
      const last = recent(ctx, 900)
      // Наружу для правой руки это вправо по зеркальному экрану, для левой влево.
      const out = ctx.f.side === 'Right' ? 1 : -1
      const xs = last.filter((s) => s.f.palmPos).map((s) => s.f.palmPos!.x * out)
      const sweep = xs.length ? xs[xs.length - 1] - Math.min(...xs) : 0
      const startX = xs.length ? Math.min(...xs) : 9
      const back = track(recent(ctx, 1500), (f) => f.palmPos).swings(1500, 'x', 0.15)
      return [
        { ok: ramp(ctx.f.open, 0.4, 0.6), hint: 'Раскрой ладонь, пальцы держи вместе' },
        { ok: ramp(startX, 0.7, 0.4), hint: 'Начни движение от середины груди' },
        { ok: ramp(sweep, 0.2, 0.45), hint: 'Одним движением отведи ладонь в сторону' },
        { ok: ramp(back, 2, 1), hint: 'Без возврата: только одно движение в сторону' },
      ]
    },
  },

  khorosho: {
    id: 'khorosho',
    word: 'Хорошо',
    how: 'Кулак перед грудью, большой палец поднят вверх',
    kind: 'static',
    checks: (ctx) => [
      { ok: ramp(maxExt4(ctx.f), 0.55, 0.35), hint: 'Сожми четыре пальца в кулак' },
      { ok: ramp(ctx.f.thumbDir.up, 0.3, 0.6), hint: 'Большой палец направь вверх' },
      { ok: ramp(ctx.f.thumbAbove, 0.15, 0.4), hint: 'Отставь большой палец от кулака' },
    ],
  },

  otlichno: {
    id: 'otlichno',
    word: 'Отлично',
    how: 'Большой и указательный пальцы соединены в колечко, остальные три пальца прямые',
    kind: 'static',
    checks: (ctx) => [
      {
        ok: ramp(Math.min(ctx.f.ext.middle, ctx.f.ext.ring, ctx.f.ext.pinky), 0.4, 0.6),
        hint: 'Выпрями средний, безымянный и мизинец',
      },
      { ok: ramp(ctx.f.pinch, 0.7, 0.5), hint: 'Соедини кончики большого и указательного в колечко' },
      palmToPartner(ctx, 0, 0.3),
    ],
  },

  plokho: {
    id: 'plokho',
    word: 'Плохо',
    how: 'Кулак, поднят только мизинец',
    kind: 'static',
    checks: (ctx) => [
      { ok: ramp(ctx.f.ext.pinky, 0.4, 0.6), hint: 'Подними мизинец' },
      {
        ok: ramp(Math.max(ctx.f.ext.index, ctx.f.ext.middle, ctx.f.ext.ring), 0.5, 0.3),
        hint: 'Согни указательный, средний и безымянный пальцы',
      },
      { ok: ramp(ctx.f.thumbAbove, 0.45, 0.25), hint: 'Прижми большой палец к кулаку' },
    ],
  },
}

export const ALL_SIGNS = Object.keys(SIGNS) as SignId[]
