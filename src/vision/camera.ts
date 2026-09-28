export class CameraError extends Error {
  readonly hint: string

  constructor(message: string, hint: string) {
    super(message)
    this.hint = hint
  }
}

/** Включает фронтальную камеру и ждёт первый кадр. */
export async function startCamera(video: HTMLVideoElement): Promise<void> {
  // Для разработки: ?video=a.mp4,b.mp4 подставляет записи вместо камеры, по кругу.
  const fake = import.meta.env.DEV ? new URLSearchParams(location.search).get('video') : null
  if (fake) return playFiles(video, fake.split(','))

  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw new CameraError(
      'Браузер не даёт доступ к камере',
      'Открой приложение по https:// или через localhost',
    )
  }

  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
    })
  } catch (err) {
    const name = (err as DOMException).name
    if (name === 'NotAllowedError') {
      throw new CameraError(
        'Нет разрешения на камеру',
        'Разреши доступ к камере в адресной строке браузера и обнови страницу',
      )
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      throw new CameraError('Камера не найдена', 'Подключи веб-камеру и обнови страницу')
    }
    if (name === 'NotReadableError') {
      throw new CameraError(
        'Камера занята другим приложением',
        'Закрой Zoom, Teams или другую вкладку с камерой и обнови страницу',
      )
    }
    throw new CameraError('Не удалось включить камеру', String(err))
  }

  video.srcObject = stream
  video.muted = true
  video.playsInline = true
  await video.play()
  if (video.readyState < 2) {
    await new Promise((resolve) => video.addEventListener('loadeddata', resolve, { once: true }))
  }
}

async function playFiles(video: HTMLVideoElement, files: string[]): Promise<void> {
  let i = 0
  video.muted = true
  video.playsInline = true
  video.onended = () => {
    i = (i + 1) % files.length
    video.src = files[i]
    video.play()
  }
  video.src = files[0]
  await video.play()
}
