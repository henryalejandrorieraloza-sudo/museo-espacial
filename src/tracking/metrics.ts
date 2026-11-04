import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { TrackedHand } from './tracker';

// Índices de landmarks de MediaPipe usados por el proyecto.
export const FACE_IDX = { eyeOuterA: 33, eyeOuterB: 263 } as const;
export const POSE_IDX = {
  leftShoulder: 11,
  rightShoulder: 12,
  leftKnee: 25,
  rightKnee: 26,
} as const;
export const HAND_IDX = {
  wrist: 0,
  thumbTip: 4,
  indexMcp: 5,
  middleMcp: 9,
  pinkyMcp: 17,
  indexTip: 8,
} as const;

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

/**
 * Cabeceo de la cabeza en grados (pitch): giro alrededor del eje horizontal, leído de la matriz de pose
 * de la cara (4×4 por filas). 0° = mirando al frente. Con ZYX (R = Rz·Ry·Rx), el giro en X es atan2(R21, R22),
 * que no depende del roll. El signo (subir = positivo) se valida con cámara real: ver SENTIDO en game/gestos.ts.
 */
export function headPitchDeg(matriz: readonly number[]): number {
  return Math.atan2(matriz[9], matriz[10]) * (180 / Math.PI);
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

// ---------------------------------------------------------------------------
// Caminar por alternancia de piernas (SPEC 5.1)
// ---------------------------------------------------------------------------

/** Amplitud mínima de pico por defecto, en % de la altura del cuerpo. */
export const SWING_PCT_DEFAULT = 1;
export const SWING_PCT_MIN = 0.5;
export const SWING_PCT_MAX = 15;
/** Visibilidad mínima de cada rodilla para usar el fotograma (SPEC 5.1). */
export const LEG_VISIBILITY_MIN = 0.5;
/** Número de muestras de la media móvil que suaviza la señal. */
export const SMOOTH_SAMPLES = 4;
/** Altura mínima del cuerpo (normalizada) para que la señal sea fiable. */
const MIN_BODY_HEIGHT = 0.1;
/** Si no hay pasos durante este tiempo, el jugador se considera detenido. */
const STOP_AFTER_S = 0.5;
/** Ventana de cadencia, en segundos. */
const CADENCE_WINDOW_S = 2;
/** Ventana visible de la gráfica de depuración, en segundos. */
export const SERIES_WINDOW_S = 10;

/** Limita la amplitud mínima al rango configurable (0.5 %–15 %). */
export const clampSwingPct = (pct: number): number =>
  Number.isFinite(pct) ? Math.min(SWING_PCT_MAX, Math.max(SWING_PCT_MIN, pct)) : SWING_PCT_DEFAULT;

/** Un fotograma de la señal de piernas. */
export interface LegSample {
  /** y(rodilla izquierda) − y(rodilla derecha), en coordenadas normalizadas (0 = arriba). */
  diff: number;
  /** Altura del cuerpo en coordenadas normalizadas (extensión vertical de los landmarks fiables). */
  bodyHeight: number;
  /** True si las dos rodillas tienen visibilidad suficiente. */
  visible: boolean;
}

/** Extrae la señal de alternancia del fotograma; null si no hay cuerpo. */
export function legSample(pose: NormalizedLandmark[] | null): LegSample | null {
  if (!pose) return null;
  const lk = pose[POSE_IDX.leftKnee];
  const rk = pose[POSE_IDX.rightKnee];
  if (!lk || !rk) return null;

  let top = Infinity;
  let bottom = -Infinity;
  for (const p of pose) {
    if ((p.visibility ?? 0) < LEG_VISIBILITY_MIN) continue;
    top = Math.min(top, p.y);
    bottom = Math.max(bottom, p.y);
  }
  const bodyHeight = Number.isFinite(top) ? bottom - top : 0;

  const visible =
    (lk.visibility ?? 0) >= LEG_VISIBILITY_MIN &&
    (rk.visibility ?? 0) >= LEG_VISIBILITY_MIN &&
    bodyHeight >= MIN_BODY_HEIGHT;

  return { diff: lk.y - rk.y, bodyHeight, visible };
}

/** Punto de la gráfica: señal en % de la altura del cuerpo y marca de pico si la hay. */
export interface LegPoint {
  t: number;
  /** null cuando la rodilla no es visible (hueco en la gráfica). */
  v: number | null;
  /** 'step' = pico que contó; 'ignored' = pico rechazado (amplitud baja o mismo signo). */
  peak: 'step' | 'ignored' | null;
}

export interface LegState {
  /** True si el último fotograma tenía las dos rodillas visibles. */
  visible: boolean;
  walking: boolean;
  steps: number;
  /** Pasos por segundo en la ventana reciente. */
  cadence: number;
  /** Señal suavizada actual, % de la altura del cuerpo; null si no es visible. */
  signalPct: number | null;
  /** Amplitud del último pico detectado, % de la altura del cuerpo. */
  peakPct: number | null;
  /** Amplitud mínima para contar un paso, % de la altura del cuerpo. */
  swingPct: number;
  /** Historial reciente para la gráfica de depuración. */
  series: readonly LegPoint[];
}

type Extremum = { v: number; point: LegPoint };

/**
 * Cuenta pasos por alternancia de piernas:
 * - Señal = y(rodilla izq.) − y(rodilla der.). Cancela el movimiento de todo el cuerpo.
 * - Se suaviza con una media móvil corta.
 * - Un paso = pico (máximo o mínimo local) con amplitud ≥ amplitud mínima y signo opuesto al
 *   del último paso contado. Así cada paso alterna pierna.
 * - Los fotogramas sin rodillas visibles no cuentan y cortan la señal.
 */
export class LegAlternationCounter {
  private swingPct: number;
  private window: number[] = [];
  /** Últimos tres valores suavizados (anterior, pico candidato, actual). */
  private recent: Extremum[] = [];
  private lastSign: 1 | -1 | null = null;
  private steps = 0;
  private stepTimes: number[] = [];
  private lastStepTime = Number.NEGATIVE_INFINITY;
  private peakPct: number | null = null;
  private series: LegPoint[] = [];
  private visible = false;
  private signalPct: number | null = null;

  constructor(swingPct = SWING_PCT_DEFAULT) {
    this.swingPct = clampSwingPct(swingPct);
  }

  get amplitudePct(): number {
    return this.swingPct;
  }

  /** Cambia la amplitud mínima (se limita a 1 %–15 %). */
  setSwingPct(pct: number): void {
    this.swingPct = clampSwingPct(pct);
  }

  /** Procesa un fotograma nuevo. `sample` es null si no hay cuerpo. */
  feed(now: number, sample: LegSample | null): void {
    if (!sample || !sample.visible) {
      this.visible = false;
      this.signalPct = null;
      // Un hueco corta la señal: no se unen muestras a través de él.
      this.window = [];
      this.recent = [];
      this.series.push({ t: now, v: null, peak: null });
      return;
    }

    this.visible = true;
    const raw = (sample.diff / sample.bodyHeight) * 100;
    this.window.push(raw);
    if (this.window.length > SMOOTH_SAMPLES) this.window.shift();
    const smooth = this.window.reduce((sum, v) => sum + v, 0) / this.window.length;

    const point: LegPoint = { t: now, v: smooth, peak: null };
    this.series.push(point);
    this.signalPct = smooth;

    this.recent.push({ v: smooth, point });
    if (this.recent.length > 3) this.recent.shift();
    if (this.recent.length === 3) this.checkPeak(this.recent[0], this.recent[1], this.recent[2]);
  }

  /** Estado para la UI. `now` en segundos. */
  state(now: number): LegState {
    this.trim(now);
    this.stepTimes = this.stepTimes.filter((t) => now - t <= CADENCE_WINDOW_S);
    return {
      visible: this.visible,
      walking: this.visible && now - this.lastStepTime < STOP_AFTER_S,
      steps: this.steps,
      cadence: this.stepTimes.length / CADENCE_WINDOW_S,
      signalPct: this.signalPct,
      peakPct: this.peakPct,
      swingPct: this.swingPct,
      series: this.series,
    };
  }

  /**
   * Un pico es el valor central si es estrictamente mayor (o menor) que sus vecinos.
   * Estricto a ambos lados: una meseta no genera picos falsos.
   */
  private checkPeak(a: Extremum, b: Extremum, c: Extremum): void {
    const isMax = b.v > a.v && b.v > c.v;
    const isMin = b.v < a.v && b.v < c.v;
    if (!isMax && !isMin) return;

    const amp = Math.abs(b.v);
    this.peakPct = amp;
    const sign: 1 | -1 = b.v > 0 ? 1 : -1;

    if (amp < this.swingPct || sign === this.lastSign) {
      b.point.peak = 'ignored';
      return;
    }

    this.lastSign = sign;
    this.steps += 1;
    this.stepTimes.push(b.point.t);
    this.lastStepTime = b.point.t;
    b.point.peak = 'step';
  }

  /** Mantiene solo la ventana visible de la gráfica. */
  private trim(now: number): void {
    const cutoff = now - SERIES_WINDOW_S;
    while (this.series.length > 0 && this.series[0].t < cutoff) this.series.shift();
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
 * Centro de la palma de una mano en píxeles: promedio de los MCP del índice y del meñique.
 * Más estable que la muñeca para medir un aplauso.
 */
export function palmCenterPx(hand: TrackedHand, w: number, h: number): Px {
  const lm = hand.landmarks;
  const a = toPx(lm[HAND_IDX.indexMcp], w, h);
  const b = toPx(lm[HAND_IDX.pinkyMcp], w, h);
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Distancia entre los centros de las palmas de las dos manos, en unidades de ancho de hombros
 * (independiente de la distancia a la cámara). Devuelve null si faltan manos o hombros.
 */
export function palmDistanceRatio(
  hands: TrackedHand[],
  shoulderPx: number | null,
  w: number,
  h: number,
): number | null {
  if (hands.length < 2 || !shoulderPx) return null;
  return dist(palmCenterPx(hands[0], w, h), palmCenterPx(hands[1], w, h)) / shoulderPx;
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
