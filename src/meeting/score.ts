import type { Answer } from '../ui/meeting.ts'

export const MAX_PER_ANSWER = 100

/**
 * Очки за ответ: 100 за жест, минус 10 за каждую подсказку (не больше 40)
 * и минус 3 за каждую секунду сверх четырёх (не больше 30). Пропуск: 0.
 */
export function answerScore(a: Answer): number {
  if (!a.sign) return 0
  const hints = Math.min(40, a.fixes * 10)
  const slow = Math.min(30, Math.max(0, Math.round(((a.ms - 4000) / 1000) * 3)))
  return MAX_PER_ANSWER - hints - slow
}

export interface Record {
  score: number
  ms: number
  date: string
}

const KEY = 'ishara.records'
const LAST = 'ishara.last'

/** Результат прошлой попытки в этом браузере: для строки «лучше, чем в прошлый раз». */
export function swapLastScore(score: number): number | null {
  try {
    const prev = localStorage.getItem(LAST)
    localStorage.setItem(LAST, String(score))
    return prev === null ? null : Number(prev)
  } catch {
    return null
  }
}

/** Самые частые подсказки за встречу: что стоит потренировать. */
export function topMistakes(hints: string[], limit = 3): { text: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const h of hints) counts.set(h, (counts.get(h) ?? 0) + 1)
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([text, count]) => ({ text, count }))
}

/** Рекорды хранятся только в этом браузере. Если хранилище недоступно, просто не запоминаем. */
export function loadRecords(): Record[] {
  try {
    const raw = localStorage.getItem(KEY)
    const list = raw ? (JSON.parse(raw) as Record[]) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export function saveRecord(r: Record): Record[] {
  const list = [...loadRecords(), r].sort((a, b) => b.score - a.score || a.ms - b.ms).slice(0, 5)
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // приватный режим или запрет на хранение: рекорды живут до перезагрузки
  }
  return list
}
