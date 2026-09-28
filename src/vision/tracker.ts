import {
  FilesetResolver,
  HandLandmarker,
  PoseLandmarker,
  type Landmark,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision'
import { fetchAll, type Progress } from './loader.ts'

const BASE = import.meta.env.BASE_URL

export interface Hand {
  /** 21 точка кисти в координатах кадра (0..1). */
  points: NormalizedLandmark[]
  /** Те же точки в метрах относительно центра кисти: по ним считаем углы, они не зависят от удалённости. */
  world: Landmark[]
  /** «Left» / «Right» с точки зрения самого человека. */
  side: 'Left' | 'Right'
  score: number
}

export interface Frame {
  hands: Hand[]
  /** 33 точки тела; нужны лицо и плечи, чтобы понимать, где рука относительно головы. */
  pose: NormalizedLandmark[] | null
  /** Размер кадра в пикселях: нужен, чтобы расстояния по x и y были в одних единицах. */
  width: number
  height: number
  timestamp: number
}

/** Распознавание рук и позы в реальном времени через MediaPipe. */
export class Tracker {
  private hands!: HandLandmarker
  private pose!: PoseLandmarker
  private lastTs = -1
  private frameNo = 0
  private lastPose: NormalizedLandmark[] | null = null

  /** Загружает модели; onProgress получает долю скачанного от 0 до 1. */
  async init(onProgress?: Progress): Promise<void> {
    // WASM качаем заранее только ради прогресса: MediaPipe потом возьмёт его из кэша браузера.
    const [handModel, poseModel] = await fetchAll(
      [
        `${BASE}models/hand_landmarker.task`,
        `${BASE}models/pose_landmarker_lite.task`,
        `${BASE}mediapipe/wasm/vision_wasm_internal.wasm`,
      ],
      onProgress,
    )
    const vision = await FilesetResolver.forVisionTasks(`${BASE}mediapipe/wasm`)
    const create = async (delegate: 'GPU' | 'CPU') => {
      const [hands, pose] = await Promise.all([
        HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetBuffer: handModel, delegate },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        }),
        PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetBuffer: poseModel, delegate },
          runningMode: 'VIDEO',
          numPoses: 1,
        }),
      ])
      this.hands = hands
      this.pose = pose
    }
    try {
      await create('GPU')
    } catch (err) {
      console.warn('GPU недоступен, переключаюсь на CPU', err)
      await create('CPU')
    }
  }

  detect(video: HTMLVideoElement, now: number): Frame {
    // MediaPipe требует строго возрастающие метки времени.
    const ts = now <= this.lastTs ? this.lastTs + 1 : now
    this.lastTs = ts

    const h = this.hands.detectForVideo(video, ts)
    // Поза меняется медленнее кистей, её хватает считать через кадр: так вдвое меньше работы.
    if (this.frameNo++ % 2 === 0) this.lastPose = this.pose.detectForVideo(video, ts).landmarks[0] ?? null

    const hands: Hand[] = h.landmarks.map((points, i) => {
      const cat = h.handedness[i]?.[0]
      // Проверено на словарных видео: MediaPipe Tasks для неотзеркаленного кадра
      // сразу отдаёт руку с точки зрения человека, менять метки не нужно.
      const side = cat?.categoryName === 'Left' ? 'Left' : 'Right'
      return { points, world: h.worldLandmarks[i], side, score: cat?.score ?? 0 }
    })

    return {
      hands,
      pose: this.lastPose,
      width: video.videoWidth,
      height: video.videoHeight,
      timestamp: ts,
    }
  }
}

export const HAND_CONNECTIONS = HandLandmarker.HAND_CONNECTIONS
