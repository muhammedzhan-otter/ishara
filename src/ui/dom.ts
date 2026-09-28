type Attrs = Record<string, string | number | boolean | undefined>
type Child = Node | string | null | undefined | false

/** Короткая запись для создания элементов: h('div', { class: 'x' }, 'текст', h('span')). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue
    el.setAttribute(k, v === true ? '' : String(v))
  }
  for (const c of children) if (c) el.append(c)
  return el
}

export function formatTime(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/**
 * Слово в нужной форме после числа: plural(1, 'очко', 'очка', 'очков') → «очко»,
 * plural(3, …) → «очка», plural(5, …) и plural(11, …) → «очков».
 */
export function plural(n: number, one: string, few: string, many: string): string {
  const n100 = Math.abs(Math.trunc(n)) % 100
  const n10 = n100 % 10
  if (n100 >= 11 && n100 <= 14) return many
  if (n10 === 1) return one
  if (n10 >= 2 && n10 <= 4) return few
  return many
}
