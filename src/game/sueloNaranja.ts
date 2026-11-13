// Suelo naranja de la estación 1 en la misión lunar: avisos y recogida de muestras con E.
// Máquina de estados pura: sin Three.js, sin DOM y sin tracking. juego.ts le pasa dónde están el jugador y el LRV, la
// E mantenida, y recibe los eventos y el progreso del anillo y del hundimiento.

import { ROCA_ESTACION1 } from '../visual/sitioApollo17.ts';
import { avanzarAnilloMantener } from './despliegueLRV';

/**
 * Distancia (m) al centro del suelo naranja a la que se avisa de que el LRV está cerca. Subida de 4 a 6 m a petición
 * de Henry (avisa desde más lejos). La mancha tiene unos 2.1 m de radio. Es el único sitio donde se define.
 */
export const ORANGE_SOIL_TRIGGER_DISTANCE = 6;

/**
 * Distancia (m) del jugador a pie al centro del LRV para recoger la muestra con E. Más grande que la de subirse
 * (DISTANCIA_SUBIR_M en luna.ts, que no cambia): así la zona de recogida es más amplia.
 */
export const DISTANCIA_RECOGER_MUESTRA_M = 5;

/** Tiempo (s) que dura el hundimiento del suelo tras recoger la muestra. Estimación de partida, a ojo. */
export const DURACION_HUNDIMIENTO_SUELO_S = 2.5;

export type EventoSuelo =
  /** El LRV (sentado) llega cerca del suelo naranja: una sola vez por visita a la misión. */
  | { tipo: 'cercania' }
  /** A pie, junto al LRV y cerca del suelo: ya se puede recoger con E. Una sola vez por visita. */
  | { tipo: 'puedeRecoger' }
  /** El anillo de E se completó: se recoge la muestra. */
  | { tipo: 'recogido' };

export interface EntradaSuelo {
  /** Duración de este fotograma (s). */
  dtS: number;
  /** Posición del jugador a pie (m). */
  jugador: { x: number; z: number };
  /** Posición del LRV (m). */
  lrv: { x: number; z: number };
  /** El jugador está a pie. */
  aPie: boolean;
  /** E mantenida en este fotograma (ya filtrada por el listo del juego). */
  manteniendoE: boolean;
  /** El LRV ya está desplegado (game/despliegueLRV.ts). Sin eso no hay avisos ni recogida. */
  activo: boolean;
}

function distanciaA(p: { x: number; z: number }): number {
  return Math.hypot(p.x - ROCA_ESTACION1.x, p.z - ROCA_ESTACION1.z);
}

export class SueloNaranja {
  private anillo = 0;
  private recogido: boolean;
  private tiempoHundimientoS: number;
  private avisadoCercania = false;
  private avisadoRecoger = false;

  /**
   * `recogidoAntes`: la muestra ya se recogió en esta sesión (el suelo sigue hundido y no hay avisos ni recogida).
   */
  constructor(recogidoAntes = false) {
    this.recogido = recogidoAntes;
    this.tiempoHundimientoS = recogidoAntes ? DURACION_HUNDIMIENTO_SUELO_S : 0;
  }

  /** Llenado del anillo de E (0–1). */
  get anilloProgreso(): number {
    return this.anillo;
  }

  /** La muestra ya se recogió: el suelo se desvanece y se hunde. */
  get recogidoYa(): boolean {
    return this.recogido;
  }

  /** Hundimiento (0–1): 0 antes de recoger, 1 cuando el hundimiento ha terminado. */
  get hundimiento(): number {
    return this.recogido ? Math.min(1, this.tiempoHundimientoS / DURACION_HUNDIMIENTO_SUELO_S) : 0;
  }

  /** Avanza un fotograma. Devuelve los eventos ocurridos en él. */
  update(entrada: EntradaSuelo): EventoSuelo[] {
    const eventos: EventoSuelo[] = [];
    const dt = Math.max(0, entrada.dtS);
    if (this.recogido) {
      this.tiempoHundimientoS += dt;
      return eventos;
    }
    if (!entrada.activo) {
      this.anillo = 0;
      return eventos;
    }

    // Aviso del LRV: sentado y cerca del suelo, una sola vez.
    if (!entrada.aPie && distanciaA(entrada.lrv) < ORANGE_SOIL_TRIGGER_DISTANCE && !this.avisadoCercania) {
      this.avisadoCercania = true;
      eventos.push({ tipo: 'cercania' });
    }

    // A pie y cerca del suelo: primer aviso para mantener E. Recoger además exige estar junto al LRV, dentro de
    // DISTANCIA_RECOGER_MUESTRA_M.
    const aPieCerca = entrada.aPie && distanciaA(entrada.jugador) < ORANGE_SOIL_TRIGGER_DISTANCE;
    if (aPieCerca && !this.avisadoRecoger) {
      this.avisadoRecoger = true;
      eventos.push({ tipo: 'puedeRecoger' });
    }
    const junto =
      aPieCerca &&
      Math.hypot(entrada.jugador.x - entrada.lrv.x, entrada.jugador.z - entrada.lrv.z) <= DISTANCIA_RECOGER_MUESTRA_M;

    // Mismo anillo que el despliegue: mantener E lo llena; soltarla antes lo vacía sin recoger nada.
    this.anillo = avanzarAnilloMantener(this.anillo, dt, junto && entrada.manteniendoE);
    if (this.anillo >= 1) {
      this.anillo = 0;
      this.recogido = true;
      this.tiempoHundimientoS = 0;
      eventos.push({ tipo: 'recogido' });
    }
    return eventos;
  }
}
