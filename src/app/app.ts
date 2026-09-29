import { Sfx } from '../audio/sfx.ts'
import { Voice } from '../audio/voice.ts'
import { Lobby } from '../ui/lobby.ts'
import { Meeting, type Answer } from '../ui/meeting.ts'
import { Results } from '../ui/results.ts'
import { Training } from '../ui/training.ts'
import { Engine } from './engine.ts'

interface Screen {
  el: HTMLElement
  destroy(): void
}

/** Переключает экраны: вход → обучение → встреча → итоги → снова встреча. */
export class App {
  private engine = new Engine()
  private voice = new Voice()
  private sfx = new Sfx()
  private screen: Screen | null = null
  private readonly root: HTMLElement

  constructor(root: HTMLElement) {
    this.root = root
  }

  start() {
    this.show(() => new Lobby(this.engine, this.voice, this.sfx, () => this.training()))
  }

  private training() {
    this.show(() => new Training(this.engine, this.voice, this.sfx, () => this.meeting()))
  }

  private meeting() {
    this.show(() => new Meeting(this.engine, this.voice, this.sfx, (answers, ms) => this.results(answers, ms)))
  }

  private results(answers: Answer[], ms: number) {
    this.show(() => new Results(this.engine, answers, ms, () => this.meeting()))
  }

  /**
   * Старый экран закрываем до того, как создать новый: экран сразу начинает говорить,
   * а destroy() старого останавливает голос и оборвал бы первую реплику нового.
   */
  private show(make: () => Screen) {
    this.screen?.destroy()
    this.screen = null
    const next = make()
    this.screen = next
    this.root.replaceChildren(next.el)
    window.scrollTo(0, 0)
  }
}
