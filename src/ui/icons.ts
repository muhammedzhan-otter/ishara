/*
 * Небольшой набор иконок для интерфейса: линии 24×24, цвет берут из currentColor.
 * Размер и толщину задаёт класс .icon в styles/base.css.
 */

const PATHS = {
  camera: 'M4.5 6.5h9a2.5 2.5 0 0 1 2.5 2.5v6a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 2 15V9a2.5 2.5 0 0 1 2.5-2.5zM16 10.5l6-3.5v10l-6-3.5',
  hand: 'M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11V4a1.5 1.5 0 0 1 3 0v7M14 11V5.5a1.5 1.5 0 0 1 3 0V13M17 9.5a1.5 1.5 0 0 1 3 0V15a7 7 0 0 1-7 7h-1.5a6 6 0 0 1-4.6-2.2L3.6 15.9a1.6 1.6 0 0 1 2.4-2.1L8 16',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  info: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM12 11v5.5M12 7.6v.01',
  alert: 'M12 6.5v7.5M12 17.6v.01',
  clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM12 7v5l3.2 2',
  mirror: 'M12 3v2.5M12 9.5v5M12 18.5V21M8.5 7L3.5 12l5 5zM15.5 7l5 5-5 5z',
  skip: 'M5.5 5.5l9 6.5-9 6.5zM18.5 5.5v13',
  trend: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  chat: 'M20.5 12a8.5 8.5 0 0 1-12.4 7.6L3.5 20.5l1-4.4A8.5 8.5 0 1 1 20.5 12z',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  repeat: 'M17 2.5l3.5 3.5L17 9.5M3.5 11v-1A4 4 0 0 1 7.5 6h13M7 21.5L3.5 18 7 14.5M20.5 13v1a4 4 0 0 1-4 4h-13',
  star: 'M12 2.8l2.8 5.8 6.4.9-4.6 4.5 1.1 6.3L12 17.3l-5.7 3 1.1-6.3-4.6-4.5 6.4-.9z',
  trophy: 'M8 21h8M12 16.5V21M7 3.5h10V9a5 5 0 0 1-10 0zM17 5h3v1.5A3.5 3.5 0 0 1 16.6 10M7 5H4v1.5A3.5 3.5 0 0 0 7.4 10',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6v.01M4.5 12v.01M4.5 18v.01',
  target: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0zM12 12v.01',
  arrowUp: 'M12 19V5M5.5 11.5L12 5l6.5 6.5',
} as const

export type IconName = keyof typeof PATHS

const NS = 'http://www.w3.org/2000/svg'

/** Иконка как элемент: icon('hand'), icon('star', 'icon icon--fill'). Для экранного диктора скрыта. */
export function icon(name: IconName, className = 'icon'): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('class', className)
  svg.setAttribute('aria-hidden', 'true')
  const path = document.createElementNS(NS, 'path')
  path.setAttribute('d', PATHS[name])
  svg.append(path)
  return svg
}
