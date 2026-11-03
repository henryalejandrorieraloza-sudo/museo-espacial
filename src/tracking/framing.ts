import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { POSE_IDX } from './metrics';

/**
 * Estado de encuadre (SPEC 2.1):
 * - `ok`: ambas rodillas visibles y dentro del encuadre.
 * - `retroceder`: el cuerpo está demasiado cerca (rodillas en el borde inferior o fuera de la imagen).
 * - `acercarse`: el cuerpo está demasiado lejos, no se ven las rodillas o no hay cuerpo.
 */
export type FramingStatus = 'ok' | 'retroceder' | 'acercarse';

/** Visibilidad mínima de cada rodilla (SPEC 2.1: “mayor a 0.5”). */
export const KNEE_VISIBILITY_MIN = 0.5;

/** Umbral vertical a partir del cual una rodilla visible se considera pegada al borde inferior. */
const BOTTOM_EDGE_Y = 0.97;

const isVisible = (p: NormalizedLandmark): boolean => (p.visibility ?? 0) > KNEE_VISIBILITY_MIN;

/**
 * Comprueba si el cuerpo está bien encuadrado para jugar, usando las rodillas como referencia.
 * Las coordenadas son normalizadas (0 = arriba/izquierda, 1 = abajo/derecha).
 */
export function checkFraming(pose: NormalizedLandmark[] | null): FramingStatus {
  if (!pose) return 'acercarse';

  const leftKnee = pose[POSE_IDX.leftKnee];
  const rightKnee = pose[POSE_IDX.rightKnee];

  if (!isVisible(leftKnee) || !isVisible(rightKnee)) {
    // Rodillas estimadas fuera del borde inferior: el cuerpo ocupa demasiado el encuadre.
    const beyondBottom = leftKnee.y > 1 || rightKnee.y > 1;
    return beyondBottom ? 'retroceder' : 'acercarse';
  }

  // Rodillas visibles pero pegadas al borde inferior: a punto de salir de la imagen.
  if (leftKnee.y > BOTTOM_EDGE_Y || rightKnee.y > BOTTOM_EDGE_Y) return 'retroceder';

  return 'ok';
}
