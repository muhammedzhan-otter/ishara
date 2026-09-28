/** Короткие звуки интерфейса, синтезируются на лету: без файлов и лицензий. */
export class Sfx {
  private ctx: AudioContext | null = null

  /** Звук можно включить только после действия человека (клик), поэтому контекст создаётся лениво. */
  unlock() {
    this.ctx ??= new AudioContext()
    if (this.ctx.state === 'suspended') this.ctx.resume()
  }

  private tone(freq: number, start: number, dur: number, gain = 0.12, type: OscillatorType = 'sine') {
    const ctx = this.ctx
    if (!ctx || ctx.state !== 'running') return
    const t = ctx.currentTime + start
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = type
    osc.frequency.value = freq
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(gain, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(g).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + dur + 0.05)
  }

  success() {
    this.tone(660, 0, 0.18)
    this.tone(990, 0.1, 0.3)
  }

  hint() {
    this.tone(440, 0, 0.15, 0.06, 'triangle')
  }

  join() {
    this.tone(523, 0, 0.2)
    this.tone(659, 0.12, 0.2)
    this.tone(784, 0.24, 0.35)
  }

  finish() {
    this.tone(784, 0, 0.2)
    this.tone(659, 0.15, 0.2)
    this.tone(1046, 0.3, 0.5)
  }
}
