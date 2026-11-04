import { HAND_IDX, palmDistanceRatio, pinchRatio } from './metrics';
import type { TrackedHand } from './tracker';

// Gestos de SPEC 5.2 (aplauso), 5.4 (pellizco), 4 (inclinación de mano) y 8.2 (volante).
// Todas las funciones son puras: el estado que necesitan (cooldown del aplauso) se pasa y se devuelve.

/** Umbrales por defecto. Cada función los acepta como parámetro. */
export const PELLIZCO_UMBRAL_DEFAULT = 0.25;
/** Ventana (s) del mínimo de distancia de pellizco que se muestra en /debug/. */
export const PELLIZCO_VENTANA_S = 5;
export const VOLANTE_NEUTRAL_DEFAULT = 10;

const toPx = (p: { x: number; y: number }, w: number, h: number) => ({ x: p.x * w, y: p.y * h });

// ---------------------------------------------------------------------------
// Aplauso (SPEC 5.2)
// ---------------------------------------------------------------------------

/** Velocidad mínima de acercamiento de las palmas (× hombros por segundo). */
export const APLAUSO_VELOCIDAD_DEFAULT = 3.0;
/** Distancia entre palmas (× hombros) por debajo de la cual se confirma tras un acercamiento rápido. */
export const APLAUSO_CONFIRMA_DEFAULT = 0.5;
/** Distancia (× hombros) que debía tener la otra mano en el último fotograma con dos manos. */
export const APLAUSO_PERDIDA_DEFAULT = 0.9;
/** Ventana (s) tras un acercamiento rápido en la que una mano debe desaparecer. */
export const APLAUSO_VENTANA_PERDIDA_DEFAULT = 0.2;
/** Cooldown (s) entre aplausos. */
export const APLAUSO_COOLDOWN_S = 1.5;
/** Duración (s) del indicador “aplauso” de /debug/. */
export const APLAUSO_INDICADOR_S = 1.5;
/** Tiempo (s) que un acercamiento rápido sigue pendiente de confirmarse por cercanía. */
export const APLAUSO_VENTANA_ACERCAMIENTO_S = 1.0;
/** Si las dos manos no se ven durante más de esto (s), no se cuenta nada y se olvida el movimiento previo. */
export const APLAUSO_SIN_DOS_MANOS_S = 0.3;

export interface AplausoOpciones {
  velocidadMin: number;
  distanciaConfirma: number;
  distanciaPerdida: number;
  ventanaPerdidaS: number;
  cooldownS: number;
  ventanaAcercamientoS: number;
  sinDosManosS: number;
}

export const APLAUSO_OPCIONES_DEFAULT: AplausoOpciones = {
  velocidadMin: APLAUSO_VELOCIDAD_DEFAULT,
  distanciaConfirma: APLAUSO_CONFIRMA_DEFAULT,
  distanciaPerdida: APLAUSO_PERDIDA_DEFAULT,
  ventanaPerdidaS: APLAUSO_VENTANA_PERDIDA_DEFAULT,
  cooldownS: APLAUSO_COOLDOWN_S,
  ventanaAcercamientoS: APLAUSO_VENTANA_ACERCAMIENTO_S,
  sinDosManosS: APLAUSO_SIN_DOS_MANOS_S,
};

/** Motivo del último resultado de aplauso, para /debug/. */
export type MotivoAplauso = 'acercamiento rápido + cerca' | 'mano perdida tras acercamiento' | 'no válido';

export interface AplausoEstado {
  /** Instante (s) del último disparo; -Infinity si nunca ha disparado. */
  ultimoDisparo: number;
  /** Instante (s) del último fotograma con las dos manos; -Infinity si nunca. */
  ultimasDosManos: number;
  /** Último fotograma con las dos manos: distancia (× hombros) e instante (s); null si no hay. */
  anterior: { ratio: number; t: number } | null;
  /** Instante (s) del último fotograma con acercamiento rápido pendiente de confirmar; null si no hay. */
  acercamientoT: number | null;
  /** Último motivo registrado; null si aún no hubo ninguno. */
  ultimoMotivo: MotivoAplauso | null;
}

export const aplausoEstadoInicial: AplausoEstado = {
  ultimoDisparo: Number.NEGATIVE_INFINITY,
  ultimasDosManos: Number.NEGATIVE_INFINITY,
  anterior: null,
  acercamientoT: null,
  ultimoMotivo: null,
};

export interface AplausoResultado {
  /** Distancia entre centros de palmas (× hombros); null si falta una mano o los hombros. */
  ratio: number | null;
  /** Velocidad de acercamiento (× hombros por s); positiva = se acercan. null si no se puede calcular. */
  velocidad: number | null;
  /** Manos visibles en este fotograma. */
  manosVisibles: number;
  /** True solo en el fotograma en que se confirma el aplauso. */
  detectado: boolean;
  estado: AplausoEstado;
}

/**
 * Aplauso por acercamiento rápido de las palmas (× ancho de hombros, por segundo).
 * - Velocidad = (distancia anterior − distancia actual) / tiempo transcurrido. Positiva = se acercan.
 * - Velocidad ≥ velocidadMin marca un acercamiento rápido pendiente (instante `acercamientoT`).
 * - Se confirma en dos casos:
 *   a) Dos manos visibles y distancia < distanciaConfirma mientras el acercamiento sigue pendiente.
 *   b) Una mano desaparece dentro de ventanaPerdidaS tras el acercamiento, y la otra estaba
 *      a menos de distanciaPerdida en el último fotograma con dos manos.
 * - Cooldown entre aplausos. Si las dos manos no se ven durante más de sinDosManosS, no se cuenta
 *   nada y se olvida el movimiento previo.
 * `ahora` en segundos.
 */
export function aplauso(
  hands: TrackedHand[],
  shoulderPx: number | null,
  w: number,
  h: number,
  previo: AplausoEstado,
  ahora: number,
  opciones: Partial<AplausoOpciones> = {},
): AplausoResultado {
  const o: AplausoOpciones = { ...APLAUSO_OPCIONES_DEFAULT, ...opciones };
  const ratio = palmDistanceRatio(hands, shoulderPx, w, h);
  const enCooldown = ahora - previo.ultimoDisparo < o.cooldownS;
  const estado: AplausoEstado = { ...previo };
  let motivo = previo.ultimoMotivo;
  let detectado = false;
  let velocidad: number | null = null;

  // Un acercamiento rápido solo sirve si ocurrió hace poco.
  if (estado.acercamientoT !== null && ahora - estado.acercamientoT > o.ventanaAcercamientoS) {
    estado.acercamientoT = null;
    motivo = 'no válido';
  }

  if (ratio !== null) {
    if (previo.anterior && ahora > previo.anterior.t) {
      velocidad = (previo.anterior.ratio - ratio) / (ahora - previo.anterior.t);
      if (velocidad >= o.velocidadMin) estado.acercamientoT = ahora;
    }

    // Caso a: dos manos y cerca tras un acercamiento rápido.
    if (estado.acercamientoT !== null && ratio < o.distanciaConfirma) {
      estado.acercamientoT = null;
      if (enCooldown) {
        motivo = 'no válido';
      } else {
        detectado = true;
        motivo = 'acercamiento rápido + cerca';
      }
    }

    estado.anterior = { ratio, t: ahora };
    estado.ultimasDosManos = ahora;
  } else {
    // Caso b: una mano (o las dos) desaparece justo después de un acercamiento rápido.
    // En un aplauso real, al juntarse las manos se solapan y el modelo a menudo pierde
    // las DOS a la vez (no solo una): por eso se acepta hands.length 0 ó 1, no solo 1.
    const pendiente = estado.acercamientoT;
    if (pendiente !== null) {
      estado.acercamientoT = null;
      const otraCerca = previo.anterior !== null && previo.anterior.ratio < o.distanciaPerdida;
      if (hands.length <= 1 && ahora - pendiente <= o.ventanaPerdidaS && otraCerca && !enCooldown) {
        detectado = true;
        motivo = 'mano perdida tras acercamiento';
      } else {
        motivo = 'no válido';
      }
    }

    // Dos manos perdidas durante demasiado tiempo: no se cuenta nada.
    if (ahora - previo.ultimasDosManos > o.sinDosManosS) {
      estado.anterior = null;
      estado.acercamientoT = null;
    }
  }

  estado.ultimoMotivo = motivo;
  if (detectado) estado.ultimoDisparo = ahora;

  return { ratio, velocidad, manosVisibles: hands.length, detectado, estado };
}

// ---------------------------------------------------------------------------
// Mínimo reciente (depuración del pellizco)
// ---------------------------------------------------------------------------

/** Guarda muestras de los últimos `ventanaS` segundos y devuelve su mínimo. */
export class MinimoVentana {
  private muestras: { t: number; v: number }[] = [];

  constructor(private readonly ventanaS = PELLIZCO_VENTANA_S) {}

  push(t: number, v: number): void {
    this.muestras.push({ t, v });
    this.trim(t);
  }

  /** Mínimo en la ventana que termina en `t`; null si no hay muestras. */
  minimo(t: number): number | null {
    this.trim(t);
    if (this.muestras.length === 0) return null;
    return Math.min(...this.muestras.map((m) => m.v));
  }

  private trim(t: number): void {
    const corte = t - this.ventanaS;
    while (this.muestras.length > 0 && this.muestras[0].t < corte) this.muestras.shift();
  }
}

// ---------------------------------------------------------------------------
// Pellizco (SPEC 5.4)
// ---------------------------------------------------------------------------

export interface PellizcoResultado {
  /** Distancia pulgar-índice / tamaño de la mano. */
  distancia: number;
  cerrado: boolean;
}

/** Pellizco de una mano. Devuelve null si la mano no está visible. */
export function pellizco(
  mano: TrackedHand | undefined,
  w: number,
  h: number,
  umbral = PELLIZCO_UMBRAL_DEFAULT,
): PellizcoResultado | null {
  if (!mano) return null;
  const distancia = pinchRatio(mano, w, h);
  return { distancia, cerrado: distancia < umbral };
}

// ---------------------------------------------------------------------------
// Inclinación de mano (SPEC 4)
// ---------------------------------------------------------------------------

export type ZonaInclinacion = 'arriba' | 'neutral' | 'abajo';

export interface OpcionesInclinacion {
  /** Inclinación (−1…+1) por encima de la cual la zona es “arriba”. */
  arriba: number;
  /** Inclinación por debajo de la cual la zona es “abajo”. */
  abajo: number;
  /** Histéresis: para salir de una zona hay que cruzar el umbral ± esta distancia. */
  histeresis: number;
}

export const INCLINACION_OPCIONES_DEFAULT: OpcionesInclinacion = { arriba: 0.5, abajo: -0.5, histeresis: 0.05 };
/**
 * Longitud mínima de muñeca (0) → nudillo medio (9) para confiar en la inclinación.
 * Se mide en coordenadas normalizadas (0–1 del encuadre).
 */
export const INCLINACION_LONGITUD_MIN = 0.02;

export interface InclinacionResultado {
  /** Inclinación vertical: +1 dedos arriba, −1 dedos abajo, ~0 mano horizontal. null si no es confiable. */
  valor: number | null;
  /** Zona con histéresis; null si no es confiable. */
  zona: ZonaInclinacion | null;
  /** Ángulo respecto a la vertical. Solo referencia: no se usa para decidir la zona. */
  grados: number;
  /** False si la longitud muñeca → nudillo medio es menor que INCLINACION_LONGITUD_MIN. */
  confiable: boolean;
}

/**
 * Zona de una inclinación con histéresis: para cambiar de zona hay que cruzar el umbral
 * más la histéresis, así que la zona no parpadea cerca del umbral.
 */
export function zonaInclinacion(valor: number, previa: ZonaInclinacion, o: OpcionesInclinacion): ZonaInclinacion {
  if (previa === 'arriba' && valor > o.arriba - o.histeresis) return 'arriba';
  if (previa === 'abajo' && valor < o.abajo + o.histeresis) return 'abajo';
  if (valor > o.arriba) return 'arriba';
  if (valor < o.abajo) return 'abajo';
  return 'neutral';
}

/**
 * Inclinación vertical de una mano con el vector muñeca (0) → nudillo medio del dedo medio (9):
 * inclinación = −dy / longitud, con dy en coordenadas de imagen (y crece hacia abajo).
 * El vector se calcula en píxeles para que el ángulo no se deforme si el vídeo no es cuadrado.
 * `previa` es la zona del fotograma anterior (para la histéresis). Devuelve null si no hay mano.
 */
export function inclinacionMano(
  mano: TrackedHand | undefined,
  w: number,
  h: number,
  previa: ZonaInclinacion = 'neutral',
  o: OpcionesInclinacion = INCLINACION_OPCIONES_DEFAULT,
): InclinacionResultado | null {
  if (!mano) return null;
  const wrist = mano.landmarks[HAND_IDX.wrist];
  const mcp = mano.landmarks[HAND_IDX.middleMcp];
  const longitudNorm = Math.hypot(mcp.x - wrist.x, mcp.y - wrist.y);
  const dxPx = (mcp.x - wrist.x) * w;
  const dyPx = (mcp.y - wrist.y) * h;
  // Solo referencia: 0° = dedos hacia arriba, positivo hacia la derecha de la imagen.
  const grados = (Math.atan2(dxPx, -dyPx) * 180) / Math.PI;

  if (longitudNorm < INCLINACION_LONGITUD_MIN) return { valor: null, zona: null, grados, confiable: false };

  const valor = -dyPx / Math.hypot(dxPx, dyPx);
  return { valor, zona: zonaInclinacion(valor, previa, o), grados, confiable: true };
}

// ---------------------------------------------------------------------------
// Conducción del rover (SPEC 9.2 y 6)
// ---------------------------------------------------------------------------

export interface OpcionesConduccion {
  /** Cambio de velocidad por segundo al acelerar (1 = velocidad máxima). */
  aceleracion: number;
  /** Cambio por segundo al frenar o invertir. */
  frenado: number;
  /** Cambio por segundo al perder la mano (desaceleración gradual, SPEC 6). */
  perdida: number;
}

export const CONDUCCION_OPCIONES_DEFAULT: OpcionesConduccion = { aceleracion: 0.5, frenado: 1, perdida: 0.75 };

/** Velocidad objetivo de una zona: arriba = +1 (avanza), neutral = 0 (detenido), abajo = −1 (retrocede). */
export function objetivoConduccion(zona: ZonaInclinacion | null): number | null {
  if (zona === null) return null;
  return zona === 'arriba' ? 1 : zona === 'abajo' ? -1 : 0;
}

/**
 * Avanza la velocidad (−1…+1) hacia el objetivo durante `dtS` segundos.
 * Acelera al alejarse de cero y frena al acercarse, invertir incluido. Con objetivo null
 * (mano no visible o no confiable) desacelera hacia cero con la tasa de pérdida.
 */
export function avanzaConduccion(
  velocidad: number,
  objetivo: number | null,
  dtS: number,
  o: OpcionesConduccion = CONDUCCION_OPCIONES_DEFAULT,
): number {
  const destino = objetivo ?? 0;
  const alejando =
    Math.abs(destino) > Math.abs(velocidad) && (velocidad === 0 || Math.sign(velocidad) === Math.sign(destino));
  const tasa = objetivo === null ? o.perdida : alejando ? o.aceleracion : o.frenado;
  const paso = tasa * Math.max(0, dtS);
  const delta = destino - velocidad;
  if (Math.abs(delta) <= paso) return destino;
  return velocidad + Math.sign(delta) * paso;
}

// ---------------------------------------------------------------------------
// Volante (SPEC 4 y 8.2)
// ---------------------------------------------------------------------------

export type ZonaVolante = 'izquierda' | 'neutral' | 'derecha';

export interface VolanteResultado {
  /** Ángulo de la línea entre muñecas respecto a la horizontal, en (−90°, +90°]. */
  grados: number;
  zona: ZonaVolante;
}

/**
 * Volante: ángulo de la línea que une las muñecas de ambas manos respecto a la horizontal.
 * Usa la mano izquierda y derecha según MediaPipe. Signo positivo = giro a la derecha del jugador
 * (la imagen es espejo, así que el signo se invierte respecto al de la imagen).
 * Devuelve null si falta alguna mano.
 */
export function volante(
  hands: TrackedHand[],
  w: number,
  h: number,
  neutral = VOLANTE_NEUTRAL_DEFAULT,
): VolanteResultado | null {
  const izq = hands.find((hand) => hand.label === 'Left');
  const der = hands.find((hand) => hand.label === 'Right');
  if (!izq || !der) return null;

  const a = toPx(izq.landmarks[HAND_IDX.wrist], w, h);
  const b = toPx(der.landmarks[HAND_IDX.wrist], w, h);
  let grados = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  // La línea no tiene orientación: se normaliza para que no salte al cambiar de mano de referencia.
  if (grados > 90) grados -= 180;
  else if (grados <= -90) grados += 180;
  // Imagen en espejo: girar a la derecha da positivo y a la izquierda negativo.
  grados = -grados;

  const zonaActual: ZonaVolante = grados > neutral ? 'derecha' : grados < -neutral ? 'izquierda' : 'neutral';
  return { grados, zona: zonaActual };
}
