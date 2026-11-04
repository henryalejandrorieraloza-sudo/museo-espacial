// Cursor con el dedo índice (SPEC 4 y 5.3): de la punta del índice a una posición de pantalla.
// Lógica pura: no importa Three.js. El dibujo está en src/ui/cursor.ts.

/**
 * Fracción del encuadre de la webcam que recorre la mano para cubrir la pantalla entera.
 * 0.6 significa que la mano va del 20 % al 80 % del encuadre y eso ya llega a los bordes.
 */
export const RANGO_MANO = 0.6;

export interface PuntoNormalizado {
  /** 0 = borde izquierdo / superior, 1 = borde derecho / inferior. */
  x: number;
  y: number;
}

const acotar01 = (v: number): number => Math.min(1, Math.max(0, v));

/**
 * Posición de pantalla (0–1) del cursor a partir de la punta del índice (landmark 8, coordenadas
 * normalizadas de la imagen, sin espejo). La imagen es espejo, así que x se invierte para que el
 * cursor siga a la mano como un espejo. El centro del encuadre va al centro de la pantalla.
 */
export function puntaACursor(punta: PuntoNormalizado, sensibilidad: number): PuntoNormalizado {
  const xEspejo = 1 - punta.x;
  return {
    x: acotar01(0.5 + ((xEspejo - 0.5) * sensibilidad) / RANGO_MANO),
    y: acotar01(0.5 + ((punta.y - 0.5) * sensibilidad) / RANGO_MANO),
  };
}

/**
 * Filtro exponencial: pos = pos + factor × (objetivo − pos). El primer valor se toma tal cual.
 * `factor` es el peso de la posición nueva (por defecto 0.3).
 */
export class CursorSuavizado {
  private actual: PuntoNormalizado | null = null;

  actualizar(objetivo: PuntoNormalizado, factor: number): PuntoNormalizado {
    if (this.actual === null) {
      this.actual = { ...objetivo };
    } else {
      this.actual = {
        x: this.actual.x + factor * (objetivo.x - this.actual.x),
        y: this.actual.y + factor * (objetivo.y - this.actual.y),
      };
    }
    return { ...this.actual };
  }

  /** Última posición calculada, o null si aún no hubo ninguna. */
  ultima(): PuntoNormalizado | null {
    return this.actual === null ? null : { ...this.actual };
  }
}
