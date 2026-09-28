import './styles/base.css'
import './styles/lobby.css'
import './styles/training.css'
import './styles/meeting.css'
import './styles/results.css'
import { App } from './app/app.ts'

new App(document.querySelector<HTMLElement>('#app')!).start()
