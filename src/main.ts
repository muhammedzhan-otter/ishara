import './style.css'
import { CameraError, startCamera } from './vision/camera.ts'
import { HAND_CONNECTIONS, Tracker, type Frame } from './vision/tracker.ts'

const video = document.querySelector<HTMLVideoElement>('#video')!
const canvas = document.querySelector<HTMLCanvasElement>('#overlay')!
const status = document.querySelector<HTMLParagraphElement>('#status')!
const ctx = canvas.getContext('2d')!

function drawHands(frame: Frame) {
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.lineWidth = 4
  ctx.lineCap = 'round'

  for (const hand of frame.hands) {
    const color = hand.side === 'Right' ? '#4f7cff' : '#3ddc97'
    const px = (i: number) => [hand.points[i].x * canvas.width, hand.points[i].y * canvas.height]

    ctx.strokeStyle = color
    for (const { start, end } of HAND_CONNECTIONS) {
      const [x1, y1] = px(start)
      const [x2, y2] = px(end)
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
    }
    ctx.fillStyle = '#fff'
    for (let i = 0; i < hand.points.length; i++) {
      const [x, y] = px(i)
      ctx.beginPath()
      ctx.arc(x, y, 4, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

async function main() {
  const tracker = new Tracker()
  try {
    await Promise.all([startCamera(video), tracker.init()])
  } catch (err) {
    status.textContent =
      err instanceof CameraError ? `${err.message}. ${err.hint}` : `Ошибка запуска: ${String(err)}`
    return
  }

  let fps = 0
  let last = performance.now()
  const loop = (now: number) => {
    const frame = tracker.detect(video, now)
    drawHands(frame)

    fps = fps * 0.9 + (1000 / Math.max(1, now - last)) * 0.1
    last = now
    const sides = frame.hands.map((h) => (h.side === 'Right' ? 'правая' : 'левая')).join(' + ')
    status.textContent = `${frame.hands.length ? `Руки: ${sides}` : 'Покажите руки в камеру'} · ${Math.round(fps)} к/с`

    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}

main()
