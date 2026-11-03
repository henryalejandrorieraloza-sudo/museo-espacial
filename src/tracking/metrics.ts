import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { TrackedHand } from './tracker';

// Índices de landmarks de MediaPipe usados por el proyecto.
export const FACE_IDX = { eyeOuterA: 33, eyeOuterB: 263 } as const;
export const POSE_IDX = { leftShoulder: 11, rightShoulder: 12 } as const;
export const HAND_IDX = { wrist: 0, middleMcp: 9, thumbTip: 4, indexTip: 8 } as const;

interface Px {
  x: number;
  y: number;
}

const toPx = (p: NormalizedLandmark, w: number, h: number): Px => ({ x: p.x * w, y: p.y * h });
const dist = (a: Px, b: Px): number => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Roll de la cabeza en grados: ángulo de la recta que une las comisuras externas de los ojos.
 * 0° = cabeza recta. Se calcula en píxeles para que la proporción del vídeo no lo distorsione.
 */
export function headRollDeg(face: NormalizedLandmark[], w: number, h: number): number {
  const a = toPx(face[FACE_IDX.eyeOuterA], w, h);
  const b = toPx(face[FACE_IDX.eyeOuterB], w, h);
  return Math.atan2(b.y - a.y, b.x - a.x) * (180 / Math.PI);
}

/** Altura media de los hombros, en coordenadas normalizadas (0 = arriba, 1 = abajo). */
export function shoulderCenterY(pose: NormalizedLandmark[]): number {
  return (pose[POSE_IDX.leftShoulder].y + pose[POSE_IDX.rightShoulder].y) / 2;
}

/** Ancho de hombros en píxeles: unidad de referencia para distancias entre manos. */
export function shoulderWidthPx(pose: NormalizedLandmark[], w: number, h: number): number {
  return dist(
    toPx(pose[POSE_IDX.leftShoulder], w, h),
    toPx(pose[POSE_IDX.rightShoulder], w, h),
  );
}

export interface ShoulderState {
  walking: boolean;
  steps: number;
  /** Pasos por segundo en la ventana reciente. */
  cadence: number;
  /** Amplitud del último ciclo (pico a valle), en coordenadas normalizadas de altura. */
  amplitude: number;
}

/**
 * Cuenta ciclos de oscilación vertical de los hombros (pico → valle → pico = 1 paso).
 * Usa histéresis: un extremo solo se confirma si el movimiento supera `hysteresis`,
 * así se ignoran las oscilaciones pequeñas (p. ej. la respiración).
 * Si no hay movimiento durante `stopAfterS`, el jugador se considera detenido.
 */
export class ShoulderOscillation {
  private smoothed: number | null = null;
  private hi = 0;
  private lo = 0;
  private seekingPeak = true;
  private lastPeak: number | null = null;
  private lastValley: number | null = null;
  private amplitude = 0;
  private lastMoveTime = Number.NEGATIVE_INFINITY;
  private stepTimes: number[] = [];
  private steps = 0;

  constructor(
    private readonly hysteresis = 0.015,
    private readonly stopAfterS = 0.5,
    private readonly cadenceWindowS = 2,
  ) {}

  /** `now` en segundos. `rawY` es null cuando no hay hombros visibles. */
  update(now: number, rawY: number | null): ShoulderState {
    if (rawY !== null) this.feed(now, rawY);

    this.stepTimes = this.stepTimes.filter((t) => now - t <= this.cadenceWindowS);
    return {
      walking: now - this.lastMoveTime < this.stopAfterS,
      steps: this.steps,
      cadence: this.stepTimes.length / this.cadenceWindowS,
      amplitude: this.amplitude,
    };
  }

  private feed(now: number, raw: number): void {
    // Suavizado exponencial para reducir el ruido del detector.
    const y = this.smoothed === null ? raw : this.smoothed + 0.5 * (raw - this.smoothed);
    if (this.smoothed === null) {
      this.hi = y;
      this.lo = y;
    }
    this.smoothed = y;

    if (this.seekingPeak) {
      if (y > this.hi) {
        this.hi = y;
      } else if (this.hi - y > this.hysteresis) {
        this.onExtreme(now, 'peak', this.hi);
        this.seekingPeak = false;
        this.lo = y;
      }
    } else {
      if (y < this.lo) {
        this.lo = y;
      } else if (y - this.lo > this.hysteresis) {
        this.onExtreme(now, 'valley', this.lo);
        this.seekingPeak = true;
        this.hi = y;
      }
    }
  }

  private onExtreme(now: number, kind: 'peak' | 'valley', value: number): void {
    this.lastMoveTime = now;
    if (kind === 'peak') {
      if (this.lastValley !== null) {
        this.amplitude = Math.abs(value - this.lastValley);
        this.steps += 1;
        this.stepTimes.push(now);
      }
      this.lastPeak = value;
    } else {
      if (this.lastPeak !== null) this.amplitude = Math.abs(this.lastPeak - value);
      this.lastValley = value;
    }
  }
}

/**
 * Distancia entre las dos muñecas. `ratio` está en unidades de ancho de hombros
 * (independiente de la distancia a la cámara); es null si no hay hombros visibles.
 */
export function wristDistance(
  hands: TrackedHand[],
  shoulderPx: number | null,
  w: number,
  h: number,
): { px: number; ratio: number | null } | null {
  if (hands.length < 2) return null;
  const px = dist(
    toPx(hands[0].landmarks[HAND_IDX.wrist], w, h),
    toPx(hands[1].landmarks[HAND_IDX.wrist], w, h),
  );
  return { px, ratio: shoulderPx ? px / shoulderPx : null };
}

/**
 * Distancia pulgar-índice de una mano, normalizada por el tamaño de la mano
 * (muñeca → base del dedo corazón), para que sea independiente de la distancia a la cámara.
 */
export function pinchRatio(hand: TrackedHand, w: number, h: number): number {
  const lm = hand.landmarks;
  const thumb = toPx(lm[HAND_IDX.thumbTip], w, h);
  const index = toPx(lm[HAND_IDX.indexTip], w, h);
  const handSize = dist(toPx(lm[HAND_IDX.wrist], w, h), toPx(lm[HAND_IDX.middleMcp], w, h));
  return dist(thumb, index) / Math.max(handSize, 1e-6);
}
