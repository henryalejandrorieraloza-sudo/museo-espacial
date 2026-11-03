import {
  FaceLandmarker,
  FilesetResolver,
  HandLandmarker,
  PoseLandmarker,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision';
import { assetUrl } from './assets';

export interface TrackedHand {
  /** Lateralidad según MediaPipe: corresponde a la mano real del jugador. */
  label: 'Left' | 'Right' | 'Unknown';
  landmarks: NormalizedLandmark[];
}

export interface TrackingFrame {
  /** Tamaño del vídeo en píxeles; las coordenadas normalizadas se multiplican por esto. */
  width: number;
  height: number;
  face: NormalizedLandmark[] | null;
  pose: NormalizedLandmark[] | null;
  hands: TrackedHand[];
}

type Delegate = 'GPU' | 'CPU';

async function createWithFallback<T>(create: (delegate: Delegate) => Promise<T>): Promise<T> {
  try {
    return await create('GPU');
  } catch (err) {
    console.warn('[tracking] GPU no disponible, usando CPU:', err);
    return create('CPU');
  }
}

/**
 * Envuelve los tres detectores de MediaPipe (cara, pose, manos).
 * Todo se ejecuta en el navegador; no hay backend.
 */
export class Tracker {
  private lastVideoTime = -1;

  private constructor(
    private readonly faceLandmarker: FaceLandmarker,
    private readonly poseLandmarker: PoseLandmarker,
    private readonly handLandmarker: HandLandmarker,
  ) {}

  static async create(onStatus: (message: string) => void = () => {}): Promise<Tracker> {
    onStatus('Cargando runtime de MediaPipe…');
    const vision = await FilesetResolver.forVisionTasks(assetUrl('wasm'));

    onStatus('Cargando modelo de cara…');
    const faceLandmarker = await createWithFallback((delegate) =>
      FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: assetUrl('models/face_landmarker.task'), delegate },
        runningMode: 'VIDEO',
        numFaces: 1,
      }),
    );

    onStatus('Cargando modelo de cuerpo…');
    const poseLandmarker = await createWithFallback((delegate) =>
      PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: assetUrl('models/pose_landmarker_lite.task'), delegate },
        runningMode: 'VIDEO',
        numPoses: 1,
      }),
    );

    onStatus('Cargando modelo de manos…');
    const handLandmarker = await createWithFallback((delegate) =>
      HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: assetUrl('models/hand_landmarker.task'), delegate },
        runningMode: 'VIDEO',
        numHands: 2,
      }),
    );

    return new Tracker(faceLandmarker, poseLandmarker, handLandmarker);
  }

  /**
   * Procesa el fotograma actual del vídeo. Devuelve null si el vídeo aún no está listo
   * o si es el mismo fotograma que la llamada anterior.
   * `timestampMs` debe ser creciente entre llamadas (usa performance.now()).
   */
  detect(video: HTMLVideoElement, timestampMs: number): TrackingFrame | null {
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null;
    if (video.currentTime === this.lastVideoTime) return null;
    this.lastVideoTime = video.currentTime;

    const face = this.faceLandmarker.detectForVideo(video, timestampMs);
    const pose = this.poseLandmarker.detectForVideo(video, timestampMs);
    const hands = this.handLandmarker.detectForVideo(video, timestampMs);

    return {
      width: video.videoWidth,
      height: video.videoHeight,
      face: face.faceLandmarks[0] ?? null,
      pose: pose.landmarks[0] ?? null,
      hands: hands.landmarks.map((landmarks, i) => {
        const name = hands.handedness[i]?.[0]?.categoryName;
        const label: TrackedHand['label'] = name === 'Left' || name === 'Right' ? name : 'Unknown';
        return { label, landmarks };
      }),
    };
  }

  close(): void {
    this.faceLandmarker.close();
    this.poseLandmarker.close();
    this.handLandmarker.close();
  }
}
