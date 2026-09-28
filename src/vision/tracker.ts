import {
  FilesetResolver,
  HandLandmarker,
  PoseLandmarker,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision'

const BASE = import.meta.env.BASE_URL

export interface Hand {
  /** 21 точка кисти в координатах кадра (0..1). */
  points: NormalizedLandmark[]
  /** «Left» / «Right» с точки зрения самого человека. */
  side: 'Left' | 'Right'
  score: number
}

export interface Frame {
  hands: Hand[]
  /** 33 точки тела; нужны лицо и плечи, чтобы понимать, где рука относительно головы. */
  pose: NormalizedLandmark[] | null
  timestamp: number
}

/** Распознавание рук и позы в реальном времени через MediaPipe. */
export class Tracker {
  private hands!: HandLandmarker
  private pose!: PoseLandmarker
  private lastTs = -1

  async init(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(`${BASE}mediapipe/wasm`)
    const create = async (delegate: 'GPU' | 'CPU') => {
      const [hands, pose] = await Promise.all([
        HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: `${BASE}models/hand_landmarker.task`, delegate },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        }),
        PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: `${BASE}models/pose_landmarker_lite.task`, delegate },
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
    const p = this.pose.detectForVideo(video, ts)

    const hands: Hand[] = h.landmarks.map((points, i) => {
      const cat = h.handedness[i]?.[0]
      // Кадр с камеры не отзеркален, поэтому метки MediaPipe меняем местами.
      const side = cat?.categoryName === 'Left' ? 'Right' : 'Left'
      return { points, side, score: cat?.score ?? 0 }
    })

    return { hands, pose: p.landmarks[0] ?? null, timestamp: ts }
  }
}

export const HAND_CONNECTIONS = HandLandmarker.HAND_CONNECTIONS
