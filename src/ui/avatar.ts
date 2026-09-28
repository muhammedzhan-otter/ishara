/*
 * Айгерим: собеседница во встрече. Нарисована в SVG, чтобы не зависеть от чужих картинок.
 * Моргает сама, двигает губами, пока говорит, и меняет выражение лица по настроению.
 */

export type Mood = 'neutral' | 'happy' | 'sad'

const SVG = `
<svg viewBox="0 0 400 225" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Айгерим">
  <defs>
    <linearGradient id="av-bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#27304a"/>
      <stop offset="1" stop-color="#1a2031"/>
    </linearGradient>
    <linearGradient id="av-window" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#8fb6ff" stop-opacity=".35"/>
      <stop offset="1" stop-color="#ffd59e" stop-opacity=".25"/>
    </linearGradient>
  </defs>
  <rect width="400" height="225" fill="url(#av-bg)"/>
  <rect x="26" y="28" width="92" height="118" rx="10" fill="url(#av-window)"/>
  <path d="M72 28v118M26 87h92" stroke="#1a2031" stroke-width="4" opacity=".6"/>
  <rect x="300" y="120" width="70" height="6" rx="3" fill="#3a4466"/>
  <g class="av-plant">
    <rect x="322" y="96" width="26" height="24" rx="5" fill="#c9774f"/>
    <circle cx="327" cy="88" r="12" fill="#3f8f6b"/>
    <circle cx="343" cy="83" r="14" fill="#4ea57c"/>
    <circle cx="335" cy="72" r="11" fill="#5cb98b"/>
  </g>

  <g class="av-body">
    <path class="av-hair-back" d="M150 108c-6 50 2 86 16 104h68c14-18 22-54 16-104z" fill="#2b1d16"/>
    <path d="M110 225c6-40 38-60 90-60s84 20 90 60z" fill="#d9895b"/>
    <path d="M168 170c8 14 20 20 32 20s24-6 32-20" fill="none" stroke="#f3c9a1" stroke-width="3" opacity=".7"/>
    <path d="M184 150h32v24c-6 6-26 6-32 0z" fill="#e2ad85"/>

    <g class="av-head">
      <ellipse cx="200" cy="104" rx="41" ry="49" fill="#f0c7a0"/>
      <path class="av-hair-top" d="M157 104c-4-40 18-62 45-62 28 0 48 22 42 62-6-18-18-30-34-36-12 14-34 22-53 36z" fill="#2b1d16"/>
      <circle cx="160" cy="112" r="4" fill="#e8b27d"/>
      <circle cx="240" cy="112" r="4" fill="#e8b27d"/>
      <circle cx="159" cy="122" r="3" fill="#f2c14e"/>
      <circle cx="241" cy="122" r="3" fill="#f2c14e"/>

      <g class="av-brows">
        <path class="av-brow-l" d="M177 92q9-5 17 0" stroke="#2b1d16" stroke-width="3" fill="none" stroke-linecap="round"/>
        <path class="av-brow-r" d="M206 92q8-5 17 0" stroke="#2b1d16" stroke-width="3" fill="none" stroke-linecap="round"/>
      </g>
      <g class="av-eyes">
        <ellipse cx="185" cy="104" rx="4.5" ry="5.5" fill="#2b1d16"/>
        <ellipse cx="215" cy="104" rx="4.5" ry="5.5" fill="#2b1d16"/>
        <circle cx="186.5" cy="102" r="1.4" fill="#fff"/>
        <circle cx="216.5" cy="102" r="1.4" fill="#fff"/>
      </g>
      <circle cx="176" cy="121" r="7" fill="#f09a8a" opacity=".35"/>
      <circle cx="224" cy="121" r="7" fill="#f09a8a" opacity=".35"/>
      <path d="M200 108q-4 10 1 13" stroke="#d99a72" stroke-width="2.5" fill="none" stroke-linecap="round"/>

      <path class="av-mouth av-mouth-neutral" d="M189 132q11 7 22 0" stroke="#b3524a" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path class="av-mouth av-mouth-happy" d="M186 129q14 14 28 0z" fill="#b3524a"/>
      <path class="av-mouth av-mouth-sad" d="M189 136q11-6 22 0" stroke="#b3524a" stroke-width="3" fill="none" stroke-linecap="round"/>
      <ellipse class="av-mouth-talk" cx="200" cy="133" rx="8" ry="6" fill="#8e3a35"/>
    </g>
  </g>
</svg>`

export class Avatar {
  readonly el: HTMLDivElement

  constructor() {
    this.el = document.createElement('div')
    this.el.className = 'avatar mood-neutral'
    this.el.innerHTML = SVG
  }

  setSpeaking(on: boolean) {
    this.el.classList.toggle('speaking', on)
  }

  setMood(mood: Mood) {
    this.el.classList.remove('mood-neutral', 'mood-happy', 'mood-sad')
    this.el.classList.add(`mood-${mood}`)
  }
}
