// Opciones del juego (SPEC 13): cómo se señala y cuánto camina el jugador. Lógica pura.
// Se guardan en localStorage; si no hay almacenamiento, valen solo para esta carga de la página.

const CLAVE = 'museo-espacial:opciones:v1';

export type MetodoSenalar = 'cursor' | 'rayo';
export type ManoSenaladora = 'Right' | 'Left';

export interface Opciones {
  /** Cursor con el dedo índice (por defecto) o rayo desde el hombro (SPEC 5.3). */
  metodoSenalar: MetodoSenalar;
  /** Mano que señala. */
  manoSenaladora: ManoSenaladora;
  /** Cuánto se mueve el cursor por cada unidad de movimiento de la mano. 1 = valor por defecto. */
  sensibilidadCursor: number;
  /** Factor del filtro exponencial del cursor: peso de la posición nueva (0–1). Menor = más suave. */
  suavizadoCursor: number;
  /** Metros que avanza el jugador por cada paso (alternancia de piernas). */
  metrosPorPaso: number;
  /** Velocidad máxima de caminata (m/s). */
  velocidadMax: number;
  /** Tiempo (s) para pasar de parado a la velocidad máxima. */
  tiempoAceleracion: number;
  /** Factor que multiplica la velocidad de giro de la vista con la cabeza (0.2–1.0). */
  sensibilidadGiro: number;
}

export const OPCIONES_DEFAULT: Opciones = {
  metodoSenalar: 'cursor',
  manoSenaladora: 'Right',
  sensibilidadCursor: 1.0,
  suavizadoCursor: 0.3,
  metrosPorPaso: 0.4,
  velocidadMax: 1.2,
  tiempoAceleracion: 0.5,
  sensibilidadGiro: 0.6,
};

/** Rangos aceptados. Un valor fuera de rango se ajusta al límite más cercano. */
export const RANGOS = {
  sensibilidadCursor: [0.2, 3],
  suavizadoCursor: [0.05, 1],
  metrosPorPaso: [0.05, 1],
  velocidadMax: [0.2, 3],
  tiempoAceleracion: [0.05, 3],
  sensibilidadGiro: [0.2, 1],
} as const;

/** Ajusta un número al rango; si no es finito, devuelve el valor por defecto. */
function enRango(valor: unknown, [min, max]: readonly [number, number], defecto: number): number {
  return typeof valor === 'number' && Number.isFinite(valor) ? Math.min(max, Math.max(min, valor)) : defecto;
}

/** Combina valores (quizá incompletos o corruptos) con los valores por defecto. */
export function normalizarOpciones(datos: Partial<Record<keyof Opciones, unknown>>): Opciones {
  const d = OPCIONES_DEFAULT;
  return {
    metodoSenalar: datos.metodoSenalar === 'rayo' ? 'rayo' : d.metodoSenalar,
    manoSenaladora: datos.manoSenaladora === 'Left' ? 'Left' : d.manoSenaladora,
    sensibilidadCursor: enRango(datos.sensibilidadCursor, RANGOS.sensibilidadCursor, d.sensibilidadCursor),
    suavizadoCursor: enRango(datos.suavizadoCursor, RANGOS.suavizadoCursor, d.suavizadoCursor),
    metrosPorPaso: enRango(datos.metrosPorPaso, RANGOS.metrosPorPaso, d.metrosPorPaso),
    velocidadMax: enRango(datos.velocidadMax, RANGOS.velocidadMax, d.velocidadMax),
    tiempoAceleracion: enRango(datos.tiempoAceleracion, RANGOS.tiempoAceleracion, d.tiempoAceleracion),
    sensibilidadGiro: enRango(datos.sensibilidadGiro, RANGOS.sensibilidadGiro, d.sensibilidadGiro),
  };
}

export function cargarOpciones(): Opciones {
  try {
    const raw = localStorage.getItem(CLAVE);
    if (!raw) return { ...OPCIONES_DEFAULT };
    return normalizarOpciones(JSON.parse(raw) as Partial<Record<keyof Opciones, unknown>>);
  } catch {
    return { ...OPCIONES_DEFAULT };
  }
}

export function guardarOpciones(opciones: Opciones): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(opciones));
  } catch {
    // Sin localStorage: las opciones valen solo para esta carga de la página.
  }
}
