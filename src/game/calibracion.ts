// Calibración de la cabeza (SPEC 3): guarda el roll y el cabeceo neutrales (mirando al frente).
// Se hace una sola vez y se guarda en localStorage. Sin persistencia, se recalibra al recargar.

// v2: se añadió el cabeceo neutral. Las calibraciones v1 no sirven y se rehacen una vez.
const CLAVE = 'museo-espacial:calibracion:v2';
/** Segundos que la cabeza debe estar quieta para calibrar. */
export const CALIBRACION_SEGUNDOS = 2;
/** Si el roll o el cabeceo se apartan más de esto (°) de la media, la cabeza no está quieta y se empieza de nuevo. */
const TOLERANCIA_GRADOS = 6;

export interface Calibracion {
  rollNeutralGrados: number;
  /** Cabeceo neutral (°). Sin matriz de pose al calibrar vale 0 y el cabeceo queda inactivo. */
  pitchNeutralGrados: number;
}

export function cargarCalibracion(): Calibracion | null {
  try {
    const raw = localStorage.getItem(CLAVE);
    if (!raw) return null;
    const datos = JSON.parse(raw) as Partial<Calibracion>;
    const valido = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
    return valido(datos.rollNeutralGrados) && valido(datos.pitchNeutralGrados)
      ? { rollNeutralGrados: datos.rollNeutralGrados, pitchNeutralGrados: datos.pitchNeutralGrados }
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
 * Reúne el roll y el cabeceo durante CALIBRACION_SEGUNDOS con el encuadre correcto y la cabeza quieta.
 * Si se pierde el encuadre o la cara, o la cabeza se mueve, empieza de nuevo.
 */
export class Calibrador {
  private muestras: { roll: number; pitch: number }[] = [];
  private inicioS: number | null = null;
  /** Progreso 0–1. */
  progreso = 0;

  /**
   * `roll` es null si no hay cara; `pitch` es null si no hay matriz de pose (entonces cuenta como 0);
   * `apto` indica encuadre correcto. Devuelve la calibración al terminar.
   */
  alimentar(ahoraS: number, roll: number | null, pitch: number | null, apto: boolean): Calibracion | null {
    if (!apto || roll === null) {
      this.reiniciar();
      return null;
    }
    const p = pitch ?? 0;
    if (this.muestras.length > 0) {
      const media = this.media();
      if (Math.abs(roll - media.roll) > TOLERANCIA_GRADOS || Math.abs(p - media.pitch) > TOLERANCIA_GRADOS) {
        this.reiniciar();
      }
    }
    if (this.inicioS === null) this.inicioS = ahoraS;
    this.muestras.push({ roll, pitch: p });

    const transcurrido = ahoraS - this.inicioS;
    this.progreso = Math.min(1, transcurrido / CALIBRACION_SEGUNDOS);
    if (transcurrido >= CALIBRACION_SEGUNDOS) {
      const media = this.media();
      return { rollNeutralGrados: media.roll, pitchNeutralGrados: media.pitch };
    }
    return null;
  }

  private media(): { roll: number; pitch: number } {
    const n = this.muestras.length;
    return {
      roll: this.muestras.reduce((suma, m) => suma + m.roll, 0) / n,
      pitch: this.muestras.reduce((suma, m) => suma + m.pitch, 0) / n,
    };
  }

  private reiniciar(): void {
    this.muestras = [];
    this.inicioS = null;
    this.progreso = 0;
  }
}
