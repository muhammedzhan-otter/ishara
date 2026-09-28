/*
 * Озвучка через встроенный синтез речи браузера: ничего не скачивается и работает офлайн.
 * Если голоса нет или браузер не разрешил звук, фраза просто показывается субтитрами,
 * а сценарий ждёт примерно столько, сколько заняла бы речь.
 */

export type Speaker = 'partner' | 'user'

// Женские русские голоса в разных системах; первый найденный станет голосом Айгерим.
const PARTNER_VOICES = ['Milena', 'Google русский', 'Irina', 'Svetlana', 'Katya', 'Alena', 'Dariya']
const USER_VOICES = ['Yuri', 'Pavel', 'Dmitri', 'Maxim']

/** Пауза между cancel() и новой фразой, иначе Chrome её молча пропускает. */
const STOP_GAP_MS = 250

export class Voice {
  enabled = true
  private stoppedAt = -Infinity
  private voices: SpeechSynthesisVoice[] = []
  private readonly synth = 'speechSynthesis' in window ? window.speechSynthesis : null

  constructor() {
    if (!this.synth) return
    const load = () => (this.voices = this.synth!.getVoices().filter((v) => v.lang.toLowerCase().startsWith('ru')))
    load()
    this.synth.addEventListener('voiceschanged', load)
  }

  private pick(who: Speaker): SpeechSynthesisVoice | undefined {
    const names = who === 'partner' ? PARTNER_VOICES : USER_VOICES
    for (const name of names) {
      const v = this.voices.find((v) => v.name.includes(name))
      if (v) return v
    }
    return this.voices[0]
  }

  /** Произносит фразу и ждёт её окончания. Никогда не зависает дольше, чем заняла бы речь. */
  say(text: string, who: Speaker): Promise<void> {
    const estimate = 700 + text.length * 65
    const voice = this.pick(who)
    if (!this.synth || !this.enabled || !voice) return wait(estimate)

    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text)
      u.voice = voice
      u.lang = voice.lang
      u.rate = 1.02
      // Если голос для человека совпал с голосом Айгерим, делаем его ниже.
      u.pitch = who === 'user' && voice === this.pick('partner') ? 0.7 : 1
      const done = () => {
        clearTimeout(guard)
        resolve()
      }
      // Safari иногда не присылает onend: страховка по времени.
      const guard = setTimeout(done, estimate + 2500)
      u.onend = done
      // Браузер запретил звук (не было клика) или голос сломался: даём время прочитать субтитры.
      u.onerror = () => {
        clearTimeout(guard)
        setTimeout(resolve, estimate)
      }
      // Chrome теряет фразу, если её запустить сразу после cancel(): например, когда
      // «Пропустить обучение» оборвал Айгерим и встреча тут же начала новую реплику.
      const sinceStop = performance.now() - this.stoppedAt
      if (sinceStop < STOP_GAP_MS) setTimeout(() => this.synth!.speak(u), STOP_GAP_MS - sinceStop)
      else this.synth!.speak(u)
    })
  }

  /** Safari разрешает синтез речи только после действия человека: вызываем из обработчика клика. */
  unlock() {
    if (!this.synth) return
    const u = new SpeechSynthesisUtterance(' ')
    u.volume = 0
    this.synth.speak(u)
  }

  stop() {
    this.synth?.cancel()
    this.stoppedAt = performance.now()
  }
}

export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
