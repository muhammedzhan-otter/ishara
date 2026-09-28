// Шрифты лежат в сборке (Fontsource), без запросов к Google Fonts: кириллица и казахские буквы есть.
import '@fontsource-variable/onest'
import '@fontsource-variable/inter'
import './styles/base.css'
import './styles/lobby.css'
import './styles/training.css'
import './styles/meeting.css'
import './styles/results.css'
import { App } from './app/app.ts'

new App(document.querySelector<HTMLElement>('#app')!).start()
