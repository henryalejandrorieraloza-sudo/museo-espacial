// Traducción de la postura del jugador a acciones del museo (SPEC 4 y 5). Funciones puras.

import { HAND_IDX, POSE_IDX, shoulderWidthPx } from '../tracking/metrics';
import type { TrackedHand, TrackingFrame } from '../tracking/tracker';
import type { ManoSenaladora } from './opciones';

/** Zona muerta (°) alrededor del centro: dentro de ±este valor no gira nada (SPEC 4). */
export const ZONA_MUERTA_GIRO_GRADOS = 3;
/** Límite de la velocidad de giro (°/s), para que el giro nunca sea brusco (SPEC 4). */
export const VELOCIDAD_MAX_GIRO_GRADOS_S = 60;
/** Factor del rayo de señalar: cuánto se desvía el rayo por cada ancho de hombro de desplazamiento. */
export const SENSIBILIDAD_SENALAR = 1.0;
/** Visibilidad mínima del hombro usado para señalar. */
const HOMBRO_VISIBILIDAD_MIN = 0.5;

/**
 * Velocidad de giro (°/s) proporcional a la inclinación de la cabeza (SPEC 4):
 * velocidad = (|inclinación| − zona muerta) × sensibilidad, limitada a VELOCIDAD_MAX_GIRO_GRADOS_S.
 * Dentro de la zona muerta devuelve 0. Devuelve un valor positivo; el signo se decide fuera.
 */
export function velocidadGiroGradosS(inclinacionGrados: number, sensibilidad: number): number {
  const exceso = Math.abs(inclinacionGrados) - ZONA_MUERTA_GIRO_GRADOS;
  if (exceso <= 0) return 0;
  return Math.min(VELOCIDAD_MAX_GIRO_GRADOS_S, exceso * sensibilidad);
}

/**
 * Giro de la vista en grados para este fotograma (+ = derecha).
 * roll negativo = cabeza inclinada hacia la derecha del jugador (ojo 33 bajo, ojo 263 alto; ver tracking/metrics.ts),
 * así que gira a la derecha. La cabeza siempre mira al frente: solo cuenta la inclinación.
 * `sensibilidad` (opciones, 0.2–1.0; 0.6 por defecto) es el factor de la velocidad proporcional.
 */
export function giroCabeza(rollGrados: number, neutralGrados: number, dtS: number, sensibilidad: number): number {
  const inclinacion = rollGrados - neutralGrados;
  const sentido = inclinacion < 0 ? 1 : -1;
  return sentido * velocidadGiroGradosS(inclinacion, sensibilidad) * dtS;
}

/**
 * Cabeceo de la vista en grados para este fotograma (+ = mirar arriba). Misma regla que giroCabeza, en vertical:
 * velocidad proporcional a la inclinación, con la misma zona muerta y sensibilidad.
 * Sentido: si al subir la cabeza la vista baja, invertir `sentido` aquí. Pendiente de validar con cámara real.
 */
export function cabeceoCabeza(pitchGrados: number, neutralGrados: number, dtS: number, sensibilidad: number): number {
  const inclinacion = pitchGrados - neutralGrados;
  const sentido = inclinacion > 0 ? 1 : -1;
  return sentido * velocidadGiroGradosS(inclinacion, sensibilidad) * dtS;
}

/** Mano que señala: la preferida (opciones) si está visible; si no, la otra. */
export function manoSenaladora(frame: TrackingFrame, preferida: ManoSenaladora): TrackedHand | undefined {
  const otra: ManoSenaladora = preferida === 'Right' ? 'Left' : 'Right';
  return frame.hands.find((mano) => mano.label === preferida) ?? frame.hands.find((mano) => mano.label === otra);
}

/**
 * Dirección del rayo de señalar en coordenadas de la cámara del jugador: x a la derecha, y arriba,
 * z negativa hacia delante. El rayo sale del hombro hacia la punta del índice (SPEC 5.3).
 * La imagen no está en espejo, así que el desplazamiento de la imagen se invierte en x e y.
 * Devuelve null si no hay mano, hombro o pose fiables.
 */
export function direccionSenalar(
  frame: TrackingFrame,
  preferida: ManoSenaladora = 'Right',
): { x: number; y: number; z: number } | null {
  const mano = manoSenaladora(frame, preferida);
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
