import { describe, expect, it } from 'vitest'
import { synthFrames } from '../demo/synth.ts'
import { Coach } from '../meeting/coach.ts'
import { SCRIPT } from '../meeting/script.ts'
import { FeatureExtractor } from '../vision/features.ts'
import { ALL_SIGNS, SIGNS, type SignId } from './catalog.ts'
import { SignRecognizer } from './recognizer.ts'

/** Прогоняет показ жеста через распознаватель, который ждёт только candidate. */
function detects(shown: SignId, candidate: SignId, opts = {}): boolean {
  const features = new FeatureExtractor()
  const rec = new SignRecognizer()
  return synthFrames(shown, opts).some((f) => rec.update(features.extract(f), [candidate]).recognized === candidate)
}

describe('показ Айгерим проходит распознавание', () => {
  for (const id of ALL_SIGNS) {
    it(`«${SIGNS[id].word}» распознаётся`, () => {
      expect(detects(id, id)).toBe(true)
    })
  }
})

describe('в одном вопросе ответы не путаются', () => {
  for (const step of SCRIPT.filter((s) => s.expect.length > 1)) {
    for (const shown of step.expect) {
      for (const other of step.expect.filter((id) => id !== shown)) {
        it(`«${SIGNS[shown].word}» не принимается за «${SIGNS[other].word}»`, () => {
          expect(detects(shown, other)).toBe(false)
        })
      }
    }
  }
})

describe('без лица и плеч в кадре', () => {
  for (const id of ALL_SIGNS.filter((id) => !SIGNS[id].needsBody)) {
    it(`«${SIGNS[id].word}» распознаётся по одной кисти`, () => {
      expect(detects(id, id, { noBody: true })).toBe(true)
    })
  }
})

describe('режим «ошибка»', () => {
  it('на «хорошо» вместо «плохо» просит поднять мизинец', () => {
    const features = new FeatureExtractor()
    const rec = new SignRecognizer()
    const coach = new Coach()
    const frames = synthFrames('khorosho')
    coach.reset(frames[0].timestamp)
    const hints = new Set<string>()
    for (const f of frames) {
      const ff = features.extract(f)
      const hint = coach.update(ff.timestamp, ff, rec.update(ff, ['plokho']), ['plokho'])
      if (hint) hints.add(hint.text)
    }
    expect([...hints]).toContain('Подними мизинец')
  })

  it('когда показан другой жест, говорит, какой именно', () => {
    const features = new FeatureExtractor()
    const rec = new SignRecognizer()
    const others = new SignRecognizer()
    const coach = new Coach()
    const frames = synthFrames('privet')
    coach.reset(frames[0].timestamp)
    let text = ''
    for (const f of frames) {
      const ff = features.extract(f)
      const other = others.update(ff, ALL_SIGNS.filter((id) => id !== 'poka'))
      if (other.recognized) coach.noticeOther(other.recognized, ff.timestamp)
      const hint = coach.update(ff.timestamp, ff, rec.update(ff, ['poka']), ['poka'])
      if (hint?.kind === 'near') text = hint.text
    }
    expect(text).toMatch(/Это жест «Привет», а нужен «Пока»/)
  })
})
