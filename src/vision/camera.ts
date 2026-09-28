export class CameraError extends Error {
  readonly hint: string

  constructor(message: string, hint: string) {
    super(message)
    this.hint = hint
  }
}

/** Включает фронтальную камеру и ждёт первый кадр. */
export async function startCamera(video: HTMLVideoElement): Promise<void> {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw new CameraError(
      'Браузер не даёт доступ к камере',
      'Откройте приложение по https:// или через localhost',
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
        'Разрешите доступ к камере в адресной строке браузера и обновите страницу',
      )
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      throw new CameraError('Камера не найдена', 'Подключите веб-камеру и обновите страницу')
    }
    if (name === 'NotReadableError') {
      throw new CameraError(
        'Камера занята другим приложением',
        'Закройте Zoom, Teams или другую вкладку с камерой и обновите страницу',
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
