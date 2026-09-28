import type { SignId } from '../signs/catalog.ts'
import type { Mood } from '../ui/avatar.ts'

/** Одна реплика Айгерим и жесты, которыми на неё можно ответить. */
export interface Step {
  say: string
  mood: Mood
  expect: SignId[]
  /** Что Айгерим скажет в ответ на каждый жест. */
  react: Partial<Record<SignId, { say: string; mood: Mood }>>
}

export const PARTNER_NAME = 'Айгерим'

export const SCRIPT: Step[] = [
  {
    say: 'Привет! Я Айгерим. Рада тебя видеть!',
    mood: 'happy',
    expect: ['privet'],
    react: { privet: { say: 'Здорово, что ты здесь!', mood: 'happy' } },
  },
  {
    say: 'Как у тебя дела?',
    mood: 'neutral',
    expect: ['khorosho', 'otlichno', 'plokho'],
    react: {
      khorosho: { say: 'Хорошо, это здорово!', mood: 'happy' },
      otlichno: { say: 'Отлично! Ты прямо заряжаешь энергией.', mood: 'happy' },
      plokho: { say: 'Ой, сочувствую. Надеюсь, скоро станет лучше.', mood: 'sad' },
    },
  },
  {
    say: 'Тебе чем-нибудь помочь?',
    mood: 'neutral',
    expect: ['da', 'net'],
    react: {
      da: { say: 'Конечно! Я отправила тебе материалы в чат.', mood: 'happy' },
      net: { say: 'Хорошо. Если что, я всегда на связи.', mood: 'neutral' },
    },
  },
  {
    say: 'Кстати, у тебя здорово получаются жесты!',
    mood: 'happy',
    expect: ['spasibo'],
    react: { spasibo: { say: 'Пожалуйста!', mood: 'happy' } },
  },
  {
    say: 'Мне пора бежать. Пока!',
    mood: 'happy',
    expect: ['poka'],
    react: { poka: { say: 'Пока! До встречи!', mood: 'happy' } },
  },
]

/** Если ответа нет столько времени, Айгерим мягко идёт дальше: сценарий нельзя застрять. */
export const STEP_TIMEOUT_MS = 40_000
export const SKIP_LINE = 'Ничего страшного, давай дальше.'
