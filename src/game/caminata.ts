// Caminata suave (SPEC 5.1 y 13): cada paso avanza una distancia fija; la velocidad sube y baja
// de forma gradual y nunca supera el máximo. Lógica pura.

/** Ventana (s) para medir la cadencia de pasos. */
export const VENTANA_CADENCIA_S = 1.0;
/** Tiempo (s) para frenar desde la velocidad máxima hasta parar. */
export const TIEMPO_FRENADO_S = 0.5;

export interface OpcionesCaminata {
  metrosPorPaso: number;
  velocidadMax: number;
  tiempoAceleracion: number;
}

export class Caminata {
  /** Velocidad actual (m/s). */
  private velocidad = 0;
  /** Instantes (s) de los pasos dentro de la ventana de cadencia. */
  private pasosS: number[] = [];

  /** Velocidad actual (m/s), para depuración o interfaz. */
  get velocidadActual(): number {
    return this.velocidad;
  }

  /**
   * Avanza un fotograma. `pasos` son los pasos nuevos de este fotograma y `dtS` el tiempo
   * transcurrido. Devuelve los metros a recorrer en este fotograma.
   *
   * Velocidad objetivo = min(velocidad máxima, metros por paso × pasos por segundo).
   * La velocidad real se acerca al objetivo como mucho a velocidadMax / tiempoAceleracion m/s²
   * al acelerar y velocidadMax / TIEMPO_FRENADO_S m/s² al frenar.
   */
  avanzar(ahoraS: number, dtS: number, pasos: number, o: OpcionesCaminata): number {
    for (let i = 0; i < pasos; i++) this.pasosS.push(ahoraS);
    while (this.pasosS.length > 0 && this.pasosS[0] < ahoraS - VENTANA_CADENCIA_S) this.pasosS.shift();

    const cadencia = this.pasosS.length / VENTANA_CADENCIA_S;
    const objetivo = Math.min(o.velocidadMax, o.metrosPorPaso * cadencia);

    const tasa = objetivo > this.velocidad ? o.velocidadMax / o.tiempoAceleracion : o.velocidadMax / TIEMPO_FRENADO_S;
    const paso = tasa * Math.max(0, dtS);
    const delta = objetivo - this.velocidad;
    this.velocidad = Math.abs(delta) <= paso ? objetivo : this.velocidad + Math.sign(delta) * paso;

    return this.velocidad * Math.max(0, dtS);
  }
}
