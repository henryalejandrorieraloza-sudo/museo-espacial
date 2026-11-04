// Geometría de las manos del avatar (SPEC 5.5 y 8.1). Pura, sin Three.js: la parte visual está en manos.ts.
//
// La mano es un esqueleto de longitudes y grosor fijos. MediaPipe solo aporta la pose: la dirección de cada hueso
// (worldLandmarks, en metros). Nunca se usan las distancias medidas entre landmarks para dibujar.
// La muñeca se coloca siempre a una distancia fija de la cámara virtual (HAND_FIXED_DISTANCE) y solo sigue x e y
// del tracking. Así el tamaño proyectado de la mano no depende de lo cerca o lejos que esté de la webcam.
// La inversión de z se aplica solo a las direcciones de los huesos (la pose).

import type { PuntoMundo } from '../tracking/tracker';

/** Punto de la mano tal como lo da MediaPipe: x e y entre 0 y 1 (y hacia abajo); z relativa a la muñeca. */
export interface PuntoMano {
  x: number;
  y: number;
  z: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Parámetros de la vista: tamaño del vídeo, aspecto de la escena y campo vertical de la cámara (radianes). */
export interface VistaCamara {
  /** Tamaño del vídeo en píxeles. */
  ancho: number;
  alto: number;
  /** Aspecto (ancho / alto) del canvas de la escena. */
  aspectoEscena: number;
  /** Campo de visión vertical de la cámara de la escena, en radianes. */
  fovVertical: number;
  /** Tamaño de la mano (multiplica las longitudes de los huesos). Viene de las opciones del jugador. */
  escala: number;
}

/** Aspecto del recuadro de la webcam (PiP): 200×150 y 120×90 en móvil. Se muestra con object-fit: cover. */
export const ASPECTO_PIP = 4 / 3;
/** Flexión plausible de cada articulación al estimar un punto oculto (rad). 20° por articulación. */
export const FLEXION_ESTIMADA_RAD = (20 * Math.PI) / 180;

/**
 * Distancia fija (m) de la muñeca a la cámara virtual. La mano se dibuja siempre a esta distancia, así que su tamaño
 * proyectado no cambia al acercarla o alejarla de la webcam. Solo x e y del tracking mueven la muñeca.
 */
export const HAND_FIXED_DISTANCE = 0.5;
/**
 * Tamaño por defecto de la mano (valor inicial del deslizador de Opciones). Con 1.25 y HAND_FIXED_DISTANCE = 0.5 m,
 * la mano extendida (muñeca a punta del dedo medio, 0.212 m de huesos) mide unos 0.46 del alto de la pantalla con
 * FOV vertical de 60°. Solo escala longitudes de hueso y posiciones de articulaciones; el radio no cambia.
 */
export const HAND_SCALE = 1.25;
/**
 * Radio de huesos y articulaciones, en metros de la escena. Igual en todos los dedos y constante: no depende de la
 * profundidad. Subir o bajar este valor hace la mano más gruesa o más fina.
 */
export const HAND_BONE_RADIUS = 0.011;

const MUNECA = 0;
const NUDILLO_MEDIO = 9;
const INDICE_MCP = 5;
const MENIQUE_MCP = 17;

/** Huesos de la mano según el orden de 21 puntos de MediaPipe (pulgar, índice, medio, anular, meñique y palma). */
export const CONEXIONES_MANO: readonly (readonly [number, number])[] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

/**
 * Longitud fija (m) de cada hueso de la cadena, indexada por el punto hijo (pareja padre → hijo). Son valores
 * aproximados de una mano adulta promedio, no medidas verificadas. Se multiplican por el tamaño de la mano (vista.escala) al dibujar.
 */
export const HAND_BONE_LENGTHS: Readonly<Record<number, number>> = {
  1: 0.045, 2: 0.035, 3: 0.03, 4: 0.025, // pulgar
  5: 0.09, 6: 0.045, 7: 0.027, 8: 0.02, // índice (desde la muñeca)
  9: 0.02, 10: 0.05, 11: 0.03, 12: 0.022, // medio
  13: 0.02, 14: 0.045, 15: 0.027, 16: 0.02, // anular
  17: 0.02, 18: 0.04, 19: 0.025, 20: 0.02, // meñique
};

type V = { x: number; y: number; z: number };

const resta = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const suma = (a: V, b: V): V => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const escala = (a: V, s: number): V => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const producto = (a: V, b: V): V => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const punto = (a: V, b: V): number => a.x * b.x + a.y * b.y + a.z * b.z;
const norma = (a: V): number => Math.hypot(a.x, a.y, a.z);
const unitario = (a: V): V | null => {
  const n = norma(a);
  return n > 1e-9 ? escala(a, 1 / n) : null;
};
/** Rota `v` un ángulo `theta` alrededor del eje unitario `k` (fórmula de Rodrigues). */
function rotar(v: V, k: V, theta: number): V {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const kv = producto(k, v);
  return suma(suma(escala(v, c), escala(kv, s)), escala(k, punto(k, v) * (1 - c)));
}

function finito(p: { x: number; y: number; z: number } | undefined): p is PuntoMundo {
  return p !== undefined && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}

/** Articulación anterior de `i` en la cadena de la mano (-1 para la muñeca). */
export function padreDe(i: number): number {
  const conexion = CONEXIONES_MANO.find(([, b]) => b === i);
  return conexion ? conexion[0] : -1;
}

/**
 * Completa los 21 puntos en metros. Un punto válido se conserva tal cual. Un punto no válido (NaN o ausente)
 * se estima con un modelo anatómico: continúa la dirección del hueso anterior, doblada un ángulo plausible
 * hacia la palma y con la misma longitud. Nunca se copia la última posición. Devuelve null si falta la muñeca
 * o la palma, porque sin ellas no hay en qué apoyar la estimación.
 */
export function estimarPuntosOcultos(mundo: readonly (PuntoMundo | undefined)[]): PuntoMundo[] | null {
  const muneca = mundo[MUNECA];
  const nudillo = mundo[NUDILLO_MEDIO];
  const indice = mundo[INDICE_MCP];
  const menique = mundo[MENIQUE_MCP];
  if (!finito(muneca) || !finito(nudillo) || !finito(indice) || !finito(menique)) return null;

  // Dirección de la palma (muñeca → nudillo medio) y normal de la palma (perpendicular a la palma y al ancho).
  const palma = unitario(resta(nudillo, muneca));
  const ancho = resta(menique, indice);
  const normal = palma ? unitario(producto(ancho, palma)) : null;
  if (!palma || !normal) return null;
  const palmaM = norma(resta(nudillo, muneca));

  const salida: PuntoMundo[] = [];
  for (let i = 0; i < 21; i++) {
    const actual = mundo[i];
    if (finito(actual)) {
      salida.push(actual);
      continue;
    }
    const padre = padreDe(i);
    if (padre < 0 || !salida[padre]) return null;
    const P = salida[padre];
    const abuelo = padreDe(padre);
    if (abuelo >= 0 && salida[abuelo]) {
      // Hueso anterior (del abuelo al padre): se dobla hacia la palma y se mantiene su longitud.
      const hueso = resta(P, salida[abuelo]);
      const longitud = norma(hueso);
      const dir = unitario(hueso);
      if (!dir || longitud < 1e-6) return null;
      const eje = unitario(producto(dir, normal));
      if (!eje) return null;
      const doblado = unitario(rotar(dir, eje, FLEXION_ESTIMADA_RAD)) ?? dir;
      salida.push(suma(P, escala(doblado, longitud)));
    } else {
      // Primer hueso del dedo (desde la muñeca): sigue la dirección de la palma, a media palma de distancia.
      salida.push(suma(P, escala(palma, palmaM * 0.5)));
    }
  }
  return salida;
}

/**
 * Esqueleto de la mano con longitudes fijas. Solo se toma de MediaPipe la dirección de cada hueso (del padre al hijo).
 * Devuelve 21 desplazamientos desde la muñeca, en metros (sin escalar). La muñeca es el origen.
 */
export function esqueletoMano(mundo: readonly PuntoMundo[]): Vec3[] {
  const desplazamientos: Vec3[] = [{ x: 0, y: 0, z: 0 }];
  let anterior: Vec3 = { x: 0, y: -1, z: 0 }; // si una dirección es degenerada, los dedos siguen hacia arriba
  for (let i = 1; i < 21; i++) {
    const padre = padreDe(i);
    const dir = unitario(resta(mundo[i], mundo[padre])) ?? anterior;
    anterior = dir;
    desplazamientos.push(suma(desplazamientos[padre], escala(dir, HAND_BONE_LENGTHS[i])));
  }
  return desplazamientos;
}

/** Parte del vídeo que se ve en el PiP (object-fit: cover). Devuelve el tamaño visible en fracción del vídeo. */
function recorteCover(aspectoVideo: number): { cw: number; ch: number } {
  if (aspectoVideo > ASPECTO_PIP) return { cw: ASPECTO_PIP / aspectoVideo, ch: 1 };
  return { cw: 1, ch: aspectoVideo / ASPECTO_PIP };
}

/**
 * Posición de la mano en la escena, o null si no se debe dibujar (muñeca fuera del recuadro o datos incompletos).
 *
 * - `normalizados`: los 21 puntos de la imagen (0 a 1). Solo se usa la muñeca, en x e y.
 * - `mundo`: los 21 puntos en metros, ya completos (ver estimarPuntosOcultos). Solo se usan sus direcciones.
 *
 * La cámara de la escena está en la webcam y mira hacia el jugador (−z). x a la derecha del jugador, y arriba.
 * El PiP está en espejo (scaleX(-1)), así que la escena también. La muñeca va a HAND_FIXED_DISTANCE: su z no se usa.
 */
export function puntosManoMundo(
  normalizados: readonly PuntoMano[],
  mundo: readonly PuntoMundo[],
  vista: VistaCamara,
): Vec3[] | null {
  if (normalizados.length < 21 || mundo.length < 21) return null;
  const { ancho: w, alto: h, aspectoEscena, fovVertical } = vista;
  const muneca = normalizados[MUNECA];
  if (!muneca) return null;

  // Muñeca dentro del recuadro visible del PiP.
  const { cw, ch } = recorteCover(w / h);
  const enRecuadro = (p: { x: number; y: number }): { x: number; y: number } => ({
    x: (p.x - (1 - cw) / 2) / cw,
    y: (p.y - (1 - ch) / 2) / ch,
  });
  const munecaRec = enRecuadro(muneca);
  if (munecaRec.x < 0 || munecaRec.x > 1 || munecaRec.y < 0 || munecaRec.y > 1) return null;

  // Coordenadas de pantalla (−1 a 1) del PiP encajado en la escena (contain). Espejo horizontal.
  const sx = Math.min(1, ASPECTO_PIP / aspectoEscena);
  const sy = Math.min(1, aspectoEscena / ASPECTO_PIP);
  const r = enRecuadro(muneca);
  const pantallaX = (1 - 2 * r.x) * sx;
  const pantallaY = (1 - 2 * r.y) * sy;

  // Muñeca a distancia fija: x e y del tracking, z fijo. Así el tamaño proyectado no depende de la distancia real.
  const tan = Math.tan(fovVertical / 2);
  const ax = pantallaX * HAND_FIXED_DISTANCE * tan * aspectoEscena;
  const ay = pantallaY * HAND_FIXED_DISTANCE * tan;
  const az = -HAND_FIXED_DISTANCE;

  // Pose: las direcciones de los huesos de MediaPipe con longitudes fijas. Inversión de z solo aquí: lo que estaba
  // cerca de la webcam (z negativa) se dibuja lejos. x e y se espejan.
  const escala = vista.escala;
  return esqueletoMano(mundo).map((d) => ({
    x: ax - escala * d.x,
    y: ay - escala * d.y,
    z: az + escala * d.z,
  }));
}

/** Escala de un hueso: el cilindro tiene radio fijo (HAND_BONE_RADIUS) y altura 1; solo se estira en longitud. */
export function escalaHueso(largoM: number): Vec3 {
  return { x: 1, y: largoM, z: 1 };
}
