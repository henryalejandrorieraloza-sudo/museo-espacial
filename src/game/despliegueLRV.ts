// Despliegue del LRV en la misión lunar. Máquina de estados pura: sin Three.js, sin DOM y sin tracking.
// El LRV empieza plegado en la bahía del LM. Mantener E llena un anillo en SEGUNDOS_MANTENER_DESPLEGAR; soltarla
// antes lo vacía sin hacer nada. Lleno, arranca la animación (DURACION_DESPLIEGUE_LRV_S) y la tecla deja de contar
// hasta que termina. Solo desplegado se puede subir al LRV (lo comprueba game/luna.ts).

import { DURACION_DESPLIEGUE_LRV_S, faseDespliegueEn, type FaseDespliegueLRV } from '../visual/despliegueApollo17';

/** Tiempo (s) que hay que mantener E para desplegar el LRV. */
export const SEGUNDOS_MANTENER_DESPLEGAR = 3;
/** Tiempo (s) en que el anillo lleno se vacía al soltar E antes de tiempo. */
export const SEGUNDOS_VACIAR_ANILLO = 0.35;

export type EstadoDespliegue = 'plegado' | 'desplegando' | 'desplegado';

export type EventoDespliegue =
  /** El anillo se completó: empieza la animación. */
  | { tipo: 'iniciado' }
  /** Empieza una fase de la secuencia real (también la primera). */
  | { tipo: 'fase'; fase: FaseDespliegueLRV }
  /** La animación terminó: el LRV está listo para conducir. */
  | { tipo: 'terminado' };

export class DespliegueLRV {
  private estadoActual: EstadoDespliegue;
  private progresoAnillo = 0;
  private tiempo = 0;
  private indiceFase = -1;

  constructor(estadoInicial: EstadoDespliegue = 'plegado') {
    this.estadoActual = estadoInicial;
    if (estadoInicial === 'desplegado') this.tiempo = DURACION_DESPLIEGUE_LRV_S;
  }

  get estado(): EstadoDespliegue {
    return this.estadoActual;
  }

  /** Llenado del anillo de mantener E (0–1). Solo plegado puede ser mayor que 0. */
  get anillo(): number {
    return this.progresoAnillo;
  }

  /** Segundos de animación transcurridos (0 plegado, DURACION_DESPLIEGUE_LRV_S desplegado). */
  get tiempoS(): number {
    return this.tiempo;
  }

  get desplegado(): boolean {
    return this.estadoActual === 'desplegado';
  }

  /** Avanza `dtS` segundos. `manteniendo`: E pulsada en este fotograma. Devuelve los eventos ocurridos. */
  actualizar(dtS: number, manteniendo: boolean): EventoDespliegue[] {
    const dt = Math.max(0, dtS);
    const eventos: EventoDespliegue[] = [];
    if (this.estadoActual === 'plegado') {
      if (manteniendo) {
        this.progresoAnillo = Math.min(1, this.progresoAnillo + dt / SEGUNDOS_MANTENER_DESPLEGAR);
      } else {
        this.progresoAnillo = Math.max(0, this.progresoAnillo - dt / SEGUNDOS_VACIAR_ANILLO);
      }
      if (this.progresoAnillo < 1) return eventos;
      // Anillo completo: se bloquea E y empieza la animación en el siguiente fotograma.
      this.progresoAnillo = 0;
      this.estadoActual = 'desplegando';
      this.tiempo = 0;
      this.indiceFase = 0;
      eventos.push({ tipo: 'iniciado' }, { tipo: 'fase', fase: faseDespliegueEn(0).fase });
      return eventos;
    }
    if (this.estadoActual === 'desplegando') {
      // `manteniendo` no cuenta: E queda bloqueada hasta el final.
      this.tiempo = Math.min(DURACION_DESPLIEGUE_LRV_S, this.tiempo + dt);
      const { fase, indice } = faseDespliegueEn(this.tiempo);
      if (this.tiempo >= DURACION_DESPLIEGUE_LRV_S) {
        this.estadoActual = 'desplegado';
        eventos.push({ tipo: 'terminado' });
      } else if (indice !== this.indiceFase) {
        this.indiceFase = indice;
        eventos.push({ tipo: 'fase', fase });
      }
    }
    return eventos;
  }
}
