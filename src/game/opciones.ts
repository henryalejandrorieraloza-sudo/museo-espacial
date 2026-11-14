// Opciones del juego (SPEC 13): cómo se señala y cuánto camina el jugador. Lógica pura.
// Se guardan en localStorage; si no hay almacenamiento, valen solo para esta carga de la página.

import { HAND_JOINT_LIMITS, type TablaLimites } from '../visual/manoModelo.ts';

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
  /** Tamaño de la mano en la escena (0.6–2.0). Solo escala longitudes; el grosor de los huesos no cambia. */
  tamanoMano: number;
  /** Separación total entre las dos manos en metros (0–0.6). Cada mano se desplaza la mitad hacia su lado. */
  separacionManos: number;
  /** Ajuste de un modelo articulado de la mano a los landmarks (manoModelo.ts). Apagado por defecto. */
  ajusteManoModelo: boolean;
  /** Topes de cada articulación de la mano, en grados (mínimo, máximo). Solo se usan con el ajuste de modelo activo. */
  limitesMano: TablaLimites;
  /** Segundos sin detección de la mano antes de que desaparezca. La mano se queda quieta mientras tanto. */
  tiempoOcultarManoS: number;
  /** Salto (m) por debajo del cual la mano reaparece deslizándose; por encima, aparece de golpe donde la detecta la cámara. */
  umbralSaltoManoM: number;
  /**
   * Subtítulos en la animación del LRV (activados por defecto). Se cambian aquí o con la tecla C durante la animación.
   * Las opciones guardadas antes de existir este campo se leen igual: toma el valor por defecto.
   */
  subtitulosPresentacion: boolean;
}

/** Separación inicial entre las manos (m): 0 = las manos como antes. */
export const HAND_SEPARATION_DEFAULT = 0;
/** Valor inicial de la casilla de ajuste del modelo de mano: apagado, para comparar con la versión actual. */
export const HAND_FIT_DEFAULT = false;

/** Copia profunda de la tabla de topes por defecto. */
export function tablaLimitesPorDefecto(): TablaLimites {
  return Object.fromEntries(
    Object.entries(HAND_JOINT_LIMITS).map(([articulacion, params]) => [
      articulacion,
      Object.fromEntries(Object.entries(params).map(([nombre, [min, max]]) => [nombre, [min, max] as const])),
    ]),
  );
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
  tamanoMano: 1.25,
  separacionManos: HAND_SEPARATION_DEFAULT,
  ajusteManoModelo: HAND_FIT_DEFAULT,
  limitesMano: tablaLimitesPorDefecto(),
  tiempoOcultarManoS: 1,
  umbralSaltoManoM: 0.05,
  subtitulosPresentacion: true,
};

/** Rangos aceptados. Un valor fuera de rango se ajusta al límite más cercano. */
export const RANGOS = {
  sensibilidadCursor: [0.2, 3],
  suavizadoCursor: [0.05, 1],
  metrosPorPaso: [0.05, 1],
  velocidadMax: [0.2, 3],
  tiempoAceleracion: [0.05, 3],
  sensibilidadGiro: [0.2, 1],
  tamanoMano: [0.6, 2],
  tiempoOcultarManoS: [0.1, 5],
  umbralSaltoManoM: [0, 0.5],
  separacionManos: [0, 0.6],
} as const;

/** Ajusta un número al rango; si no es finito, devuelve el valor por defecto. */
function enRango(valor: unknown, [min, max]: readonly [number, number], defecto: number): number {
  return typeof valor === 'number' && Number.isFinite(valor) ? Math.min(max, Math.max(min, valor)) : defecto;
}

/** Combina valores (quizá incompletos o corruptos) con los valores por defecto. */
/**
 * Topes de la mano: cada par se ordena (mínimo ≤ máximo) y se acota a [−180°, 180°]. Un valor inválido vuelve al por defecto.
 * Solo se aceptan las articulaciones y parámetros de la tabla por defecto.
 */
function normalizarLimites(datos: unknown): TablaLimites {
  const defecto = tablaLimitesPorDefecto();
  const origen = (datos ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const salida: TablaLimites = {};
  for (const [articulacion, params] of Object.entries(defecto)) {
    salida[articulacion] = {};
    for (const [nombre, [minD, maxD]] of Object.entries(params)) {
      const v = origen[articulacion]?.[nombre];
      const valido =
        Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'number' && Number.isFinite(x));
      if (!valido) {
        salida[articulacion][nombre] = [minD, maxD];
        continue;
      }
      const [a, b] = v as [number, number];
      const min = Math.min(180, Math.max(-180, Math.min(a, b)));
      const max = Math.min(180, Math.max(-180, Math.max(a, b)));
      salida[articulacion][nombre] = [min, max];
    }
  }
  return salida;
}

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
    tamanoMano: enRango(datos.tamanoMano, RANGOS.tamanoMano, d.tamanoMano),
    separacionManos: enRango(datos.separacionManos, RANGOS.separacionManos, d.separacionManos),
    ajusteManoModelo: typeof datos.ajusteManoModelo === 'boolean' ? datos.ajusteManoModelo : d.ajusteManoModelo,
    limitesMano: normalizarLimites(datos.limitesMano),
    tiempoOcultarManoS: enRango(datos.tiempoOcultarManoS, RANGOS.tiempoOcultarManoS, d.tiempoOcultarManoS),
    umbralSaltoManoM: enRango(datos.umbralSaltoManoM, RANGOS.umbralSaltoManoM, d.umbralSaltoManoM),
    subtitulosPresentacion:
      typeof datos.subtitulosPresentacion === 'boolean' ? datos.subtitulosPresentacion : d.subtitulosPresentacion,
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

// ---------------------------------------------------------------------------
// Control elegido en la pantalla de inicio: cámara (gestos) o teclado y ratón. Clave propia, versionada.
// ---------------------------------------------------------------------------

const CLAVE_CONTROL = 'museo-espacial:control:v1';

export type ModoControl = 'camara' | 'teclado';

/** Control guardado, o null si el jugador aún no eligió (o no hay almacenamiento). */
export function cargarControl(): ModoControl | null {
  try {
    const valor = localStorage.getItem(CLAVE_CONTROL);
    return valor === 'camara' || valor === 'teclado' ? valor : null;
  } catch {
    return null;
  }
}

export function guardarControl(modo: ModoControl): void {
  try {
    localStorage.setItem(CLAVE_CONTROL, modo);
  } catch {
    // Sin localStorage: la elección vale solo para esta carga de la página.
  }
}

// ---------------------------------------------------------------------------
// Nombre del viajero, que se pide en la pantalla de inicio. Clave propia, versionada.
// ---------------------------------------------------------------------------

const CLAVE_NOMBRE = 'museo-espacial:viajero:v1';
/** Largo máximo del nombre (caracteres). */
export const LARGO_MAX_NOMBRE = 24;

/**
 * Limpia el nombre escrito: sin espacios de más, sin llaves (marcarían gestos del mentor en los textos) ni
 * caracteres de control, y como mucho LARGO_MAX_NOMBRE caracteres.
 */
export function limpiarNombre(nombre: string): string {
  return Array.from(
    nombre
      .replace(/[{}<>\p{Cc}]/gu, '')
      .replace(/\s+/g, ' ')
      .trim(),
  )
    .slice(0, LARGO_MAX_NOMBRE)
    .join('')
    .trim();
}

/** Nombre guardado, o cadena vacía si no hay. */
export function cargarNombre(): string {
  try {
    return limpiarNombre(localStorage.getItem(CLAVE_NOMBRE) ?? '');
  } catch {
    return '';
  }
}

export function guardarNombre(nombre: string): void {
  try {
    localStorage.setItem(CLAVE_NOMBRE, nombre);
  } catch {
    // Sin localStorage: el nombre vale solo para esta carga de la página.
  }
}
