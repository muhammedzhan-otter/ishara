import './style.css'
import { CameraError, startCamera } from './vision/camera.ts'
import { FeatureExtractor, FINGERS, type FrameFeatures } from './vision/features.ts'
import { HAND_CONNECTIONS, Tracker, type Frame } from './vision/tracker.ts'

const video = document.querySelector<HTMLVideoElement>('#video')!
const canvas = document.querySelector<HTMLCanvasElement>('#overlay')!
const status = document.querySelector<HTMLParagraphElement>('#status')!
const debug = document.querySelector<HTMLPreElement>('#debug')!
const ctx = canvas.getContext('2d')!

const REGION: Record<string, string> = {
  head: 'над глазами',
  face: 'у лица',
  chin: 'у подбородка',
  chest: 'у груди',
  belly: 'ниже груди',
  side: 'сбоку',
}

/** Отладочная панель: что система видит в каждой руке. Нужна, чтобы настраивать пороги жестов. */
function renderDebug(f: FrameFeatures) {
  const bar = (v: number) => '█'.repeat(Math.round(v * 5)).padEnd(5, '·')
  const n = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(2)
  const lines = f.hands.map((h) =>
    [
      `${h.side === 'Right' ? 'Правая' : 'Левая'}  ${h.region ? REGION[h.region] : 'тело не видно'}`,
      FINGERS.map((k) => `${k.padEnd(6)} ${bar(h.ext[k])}`).join('\n'),
      `большой отведён ${bar(h.thumbOut)}  щепоть ${h.pinch.toFixed(2)}`,
      `ладонь: к камере ${n(h.palm.toCamera)} вверх ${n(h.palm.up)} вправо ${n(h.palm.right)}`,
      `пальцы: вверх ${n(h.pointing.up)} вправо ${n(h.pointing.right)}`,
      h.palmPos ? `позиция: x ${n(h.palmPos.x)} y ${n(h.palmPos.y)}` : '',
    ].join('\n'),
  )
  debug.textContent = lines.join('\n\n')
}

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
  const features = new FeatureExtractor()
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
    renderDebug(features.extract(frame))

    fps = fps * 0.9 + (1000 / Math.max(1, now - last)) * 0.1
    last = now
    const sides = frame.hands.map((h) => (h.side === 'Right' ? 'правая' : 'левая')).join(' + ')
    status.textContent = `${frame.hands.length ? `Руки: ${sides}` : 'Покажите руки в камеру'} · ${Math.round(fps)} к/с`

    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}

main()
