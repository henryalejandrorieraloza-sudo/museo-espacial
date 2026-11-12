// Capa de entrada: interfaz común de las fuentes de control (cámara con gestos, o teclado y ratón).
// juego.ts lee una `LecturaEntrada` por vuelta del bucle y la reparte al museo y a las misiones.
// Ni game/museo.ts ni las misiones saben de qué fuente viene cada acción.

import type { ModoControl } from '../game/opciones';
import type { TrackedHand } from '../tracking/tracker';

export type { ModoControl };

/** Hacia dónde señala el jugador. */
export type Senal =
  /** Punto de pantalla (0–1, origen arriba a la izquierda). Con `activo` en false se dibuja atenuado y no señala nada. */
  | { tipo: 'cursor'; x: number; y: number; activo: boolean }
  /** Rayo desde el hombro, en coordenadas de la cámara (x derecha, y arriba, z negativa hacia delante). */
  | { tipo: 'rayo'; direccion: { x: number; y: number; z: number } | null };

/** Manos detectadas en un fotograma de la webcam, para dibujar el avatar. */
export interface ManosFotograma {
  manos: TrackedHand[];
  ancho: number;
  alto: number;
}

export interface LecturaEntrada {
  ahoraS: number;
  /** Tiempo desde la lectura anterior con datos (s), ya limitado para no saltar tras una pausa. */
  dtS: number;
  /** false mientras la fuente se prepara (encuadre y calibración): el juego no recibe acciones. */
  listo: boolean;
  /** true si hay algo nuevo que procesar (fotograma nuevo, tecla o ratón). */
  hayDatos: boolean;
  /** Mensaje para el jugador (encuadre, calibración, sin seguimiento, clic para mirar) o null. */
  aviso: string | null;
  /**
   * Hay datos para moverse en este fotograma. Si es false, el movimiento se congela (SPEC 6):
   * giro, cabeceo, caminata y señalar no cuentan, pero el aplauso sí.
   */
  conMovimiento: boolean;
  /** Giro de la vista en grados para este fotograma (+ = derecha). Equivale a inclinar la cabeza. */
  giroGrados: number;
  /** Cabeceo de la vista en grados para este fotograma (+ = arriba). */
  cabeceoGrados: number;
  /** Metros hacia delante (+) o hacia atrás (−) en este fotograma. */
  avanceM: number;
  /** Metros a la derecha (+) o a la izquierda (−) en este fotograma. Solo el teclado se desplaza de lado. */
  lateralM: number;
  /** Aplauso (o barra espaciadora) en este fotograma. */
  aplauso: boolean;
  /** Señal de la mano que señala, o null si no hay nada que mostrar. */
  senal: Senal | null;
  /** El pellizco de la mano que señala se acaba de cerrar. */
  pellizcoNuevo: boolean;
  /** Cierre nuevo del agarre en cualquiera de las dos manos (misión lunar). */
  agarreNuevo: boolean;
  /** Velocidad de golpe hacia abajo, en hombros/s (misión lunar). 0 si no hay golpe. */
  golpeHombrosS: number;
  /** Ángulo del volante en grados (+ = derecha), o null si no hay volante (manos no visibles). */
  volanteGrados: number | null;
  /** Bajarse del LRV en este fotograma: tecla B, o pellizco sostenido con las dos manos (misión lunar). */
  bajarse: boolean;
  /** Manos para el avatar: dibujarlas, ocultarlas o dejarlas como están (null). */
  manos: ManosFotograma | 'ocultar' | null;
}

export interface FuenteEntrada {
  readonly modo: ModoControl;
  /** Lee la entrada de esta vuelta del bucle. Se llama una vez por vuelta, haya o no datos nuevos. */
  leer(ahoraS: number): LecturaEntrada;
  /** Pausa la entrada mientras el panel de opciones está abierto (las teclas no cuentan). */
  pausar(pausada: boolean): void;
}

/** Lectura sin acciones: todo a cero. Cada fuente rellena lo que tenga. */
export function lecturaVacia(ahoraS: number): LecturaEntrada {
  return {
    ahoraS,
    dtS: 0,
    listo: true,
    hayDatos: false,
    aviso: null,
    conMovimiento: false,
    giroGrados: 0,
    cabeceoGrados: 0,
    avanceM: 0,
    lateralM: 0,
    aplauso: false,
    senal: null,
    pellizcoNuevo: false,
    agarreNuevo: false,
    golpeHombrosS: 0,
    volanteGrados: null,
    bajarse: false,
    manos: null,
  };
}

/** True si la tecla se pulsó escribiendo en un campo de formulario: entonces no es una acción del juego. */
export function enCampoDeTexto(destino: EventTarget | null): boolean {
  return destino instanceof HTMLElement && destino.closest('input, select, textarea, [contenteditable]') !== null;
}
