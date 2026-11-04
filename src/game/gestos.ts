// Traducción de la postura del jugador a acciones del museo (SPEC 4 y 5). Funciones puras.

import { HAND_IDX, POSE_IDX, shoulderWidthPx } from '../tracking/metrics';
import type { TrackedHand, TrackingFrame } from '../tracking/tracker';

/** Inclinación lateral (°) a partir de la cual la cabeza gira la vista (SPEC 4: 15°). */
export const UMBRAL_GIRO_GRADOS = 15;
/** Velocidad de giro (°/s) mientras la cabeza sigue inclinada. Valor provisional. */
export const VELOCIDAD_GIRO_GRADOS_S = 45;
/** Factor del rayo de señalar: cuánto se desvía el rayo por cada ancho de hombro de desplazamiento. */
export const SENSIBILIDAD_SENALAR = 1.0;
/** Visibilidad mínima del hombro usado para señalar. */
const HOMBRO_VISIBILIDAD_MIN = 0.5;

/**
 * Giro de la vista en grados para este fotograma (+ = derecha).
 * roll negativo = cabeza inclinada hacia la derecha del jugador (ojo 33 bajo, ojo 263 alto; ver tracking/metrics.ts),
 * así que gira a la derecha. La cabeza siempre mira al frente: solo cuenta la inclinación.
 */
export function giroCabeza(rollGrados: number, neutralGrados: number, dtS: number): number {
  const inclinacion = rollGrados - neutralGrados;
  if (Math.abs(inclinacion) <= UMBRAL_GIRO_GRADOS) return 0;
  const sentido = inclinacion < 0 ? 1 : -1;
  return sentido * VELOCIDAD_GIRO_GRADOS_S * dtS;
}

/** Mano que señala: la derecha si está visible; si no, la izquierda. */
export function manoSenaladora(frame: TrackingFrame): TrackedHand | undefined {
  return frame.hands.find((mano) => mano.label === 'Right') ?? frame.hands.find((mano) => mano.label === 'Left');
}

/**
 * Dirección del rayo de señalar en coordenadas de la cámara del jugador: x a la derecha, y arriba,
 * z negativa hacia delante. El rayo sale del hombro hacia la punta del índice (SPEC 5.3).
 * La imagen no está en espejo, así que el desplazamiento de la imagen se invierte en x e y.
 * Devuelve null si no hay mano, hombro o pose fiables.
 */
export function direccionSenalar(frame: TrackingFrame): { x: number; y: number; z: number } | null {
  const mano = manoSenaladora(frame);
  const pose = frame.pose;
  if (!mano || !pose) return null;

  const hombro = pose[mano.label === 'Left' ? POSE_IDX.leftShoulder : POSE_IDX.rightShoulder];
  const punta = mano.landmarks[HAND_IDX.indexTip];
  if (!hombro || !punta || (hombro.visibility ?? 0) < HOMBRO_VISIBILIDAD_MIN) return null;

  const ancho = shoulderWidthPx(pose, frame.width, frame.height);
  if (ancho < 1) return null;

  const vx = ((punta.x - hombro.x) * frame.width) / ancho;
  const vy = ((punta.y - hombro.y) * frame.height) / ancho;
  return { x: -SENSIBILIDAD_SENALAR * vx, y: -SENSIBILIDAD_SENALAR * vy, z: -1 };
}
