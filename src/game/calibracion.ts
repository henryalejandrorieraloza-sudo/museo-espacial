// Calibración de la cabeza (SPEC 3): guarda el roll neutral (mirando al frente).
// Se hace una sola vez y se guarda en localStorage. Sin persistencia, se recalibra al recargar.

const CLAVE = 'museo-espacial:calibracion:v1';
/** Segundos que la cabeza debe estar quieta para calibrar. */
export const CALIBRACION_SEGUNDOS = 2;
/** Si el roll se aparta más de esto (°) de la media, la cabeza no está quieta y se empieza de nuevo. */
const TOLERANCIA_GRADOS = 6;

export interface Calibracion {
  rollNeutralGrados: number;
}

export function cargarCalibracion(): Calibracion | null {
  try {
    const raw = localStorage.getItem(CLAVE);
    if (!raw) return null;
    const datos = JSON.parse(raw) as Partial<Calibracion>;
    return typeof datos.rollNeutralGrados === 'number' && Number.isFinite(datos.rollNeutralGrados)
      ? { rollNeutralGrados: datos.rollNeutralGrados }
      : null;
  } catch {
    return null;
  }
}

export function guardarCalibracion(calibracion: Calibracion): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(calibracion));
  } catch {
    // Sin localStorage: la calibración vale solo para esta carga de la página.
  }
}

/**
 * Reúne el roll durante CALIBRACION_SEGUNDOS con el encuadre correcto y la cabeza quieta.
 * Si se pierde el encuadre o la cara, o la cabeza se mueve, empieza de nuevo.
 */
export class Calibrador {
  private muestras: number[] = [];
  private inicioS: number | null = null;
  /** Progreso 0–1. */
  progreso = 0;

  /** `roll` es null si no hay cara; `apto` indica encuadre correcto. Devuelve la calibración al terminar. */
  alimentar(ahoraS: number, roll: number | null, apto: boolean): Calibracion | null {
    if (!apto || roll === null) {
      this.reiniciar();
      return null;
    }
    if (this.muestras.length > 0 && Math.abs(roll - this.media()) > TOLERANCIA_GRADOS) {
      this.reiniciar();
    }
    if (this.inicioS === null) this.inicioS = ahoraS;
    this.muestras.push(roll);

    const transcurrido = ahoraS - this.inicioS;
    this.progreso = Math.min(1, transcurrido / CALIBRACION_SEGUNDOS);
    if (transcurrido >= CALIBRACION_SEGUNDOS) return { rollNeutralGrados: this.media() };
    return null;
  }

  private media(): number {
    return this.muestras.reduce((suma, v) => suma + v, 0) / this.muestras.length;
  }

  private reiniciar(): void {
    this.muestras = [];
    this.inicioS = null;
    this.progreso = 0;
  }
}
