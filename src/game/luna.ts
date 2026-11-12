// Misión lunar, Apollo 17 (SPEC 8). Máquina de estados pura: sin Three.js, sin DOM y sin tracking.
// El que la usa (juego.ts) le pasa en cada fotograma lo que el jugador hace (aplauso, metros caminados, ángulo del
// volante, golpe, agarre y dónde está a pie) y recibe los eventos.
// Las posiciones del LRV y de la roca salen de src/visual/sitioApollo17.ts (datos sin Three.js), las mismas que
// usa la escena.

import { LM, LRV_ESTACIONADO, RADIO_LRV_M, RADIO_OBSTACULO_LM_M, ROCA_ESTACION1 } from '../visual/sitioApollo17.ts';

// ---------------------------------------------------------------------------------------------------------------
// VELOCIDADES DE LA MISIÓN LUNAR. Solo aplican en la Luna: el museo y Perseverance no las usan.
// Son ESTIMACIONES AJUSTABLES, no datos verificados: cámbialas aquí y el resto del código las sigue.
// ---------------------------------------------------------------------------------------------------------------
/**
 * Velocidad máxima a pie en la Luna (m/s). Estimación de partida: con 1/6 de la gravedad terrestre, el astronauta
 * avanza despacio con pasos largos. Se aplica al avance por fotograma (metrosAPieLuna) sin tocar la caminata del museo.
 */
export const MOON_WALK_MAX_SPEED = 1.2;
/**
 * Velocidad máxima del LRV (m/s). Estimación: 18 km/h, la velocidad máxima que se citó para el LRV real (5 m/s).
 */
export const LRV_MAX_SPEED = 5;
/** Aceleración máxima del LRV (m/s²). Estimación de partida para un arranque suave. */
export const LRV_ACCEL = 0.5;
/** Frenado máximo del LRV (m/s²). Estimación de partida: el LRV se para en ~5 s desde su velocidad máxima. */
export const LRV_BRAKE = 1;
/**
 * El LRV avanza este múltiplo de lo que se camina (metros por metro). Se deriva de los topes para que caminar al
 * tope a pie (MOON_WALK_MAX_SPEED) lleve al LRV a su tope (LRV_MAX_SPEED). Ajustar LRV_MAX_SPEED lo cambia solo.
 */
export const FACTOR_AVANCE_LRV = LRV_MAX_SPEED / MOON_WALK_MAX_SPEED;

/** Distancia (m) entre el centro del LRV y la roca para resaltarla (SPEC 8.3). El LRV mide 3 m de largo. */
export const DISTANCIA_ROCA_M = 3;
/** Distancia (m) del jugador a pie al centro del LRV para poder subirse con un aplauso. */
export const DISTANCIA_SUBIR_M = 3.2;
/** Velocidad (hombros/s) con la que la muñeca baja para contar como golpe (SPEC 8.3). */
export const GOLPE_VELOCIDAD_HOMBROS_S = 1.5;
/** Tiempo (s) después del golpe para cerrar el agarre (SPEC 8.3). */
export const VENTANA_AGARRE_S = 1;
/** Zona neutral del volante (°): dentro de ±este valor no gira. Mismo valor por defecto que tracking/gestures.ts. */
export const VOLANTE_NEUTRAL_GRADOS = 10;
/** Sensibilidad del volante: °/s por cada grado fuera de la zona neutral (giro proporcional). */
export const VOLANTE_SENSIBILIDAD = 1;
/** Velocidad máxima de giro del LRV (°/s). */
export const VOLANTE_VELOCIDAD_MAX_GRADOS_S = 60;
/**
 * Ángulo máximo de la rueda interior al girar (°). Con el giro del LRV a su tope (VOLANTE_VELOCIDAD_MAX_GRADOS_S),
 * la rueda interior llega a este ángulo; por debajo, es proporcional. Es el ángulo que dibuja la escena: el giro
 * del juego sigue saliendo de giroVolanteGradosS.
 * // VERIFICAR: 50° interior y 22° exterior según un documento de NASA NTRS (20230013087) que describe dirección
 * Ackermann delante y detrás. Con la batalla y la vía del LRV, 50° interior da 22° exterior y un radio de giro
 * de ~3 m, que cuadra con los 3.1 m de la NSSDC.
 */
export const DIRECCION_MAX_GRADOS = 50;

/** Posición inicial del LRV (m, plano del suelo): estacionado junto al LM. */
export const POSICION_LRV_INICIAL = { x: LRV_ESTACIONADO.x, z: LRV_ESTACIONADO.z };
/** Rumbo inicial del LRV (°): hacia la estación 1. */
export const RUMBO_LRV_INICIAL = LRV_ESTACIONADO.rumbo;
/** Posición de la roca de la estación 1 (m), a distancia acortada (ver sitioApollo17.ts). */
export const POSICION_ROCA = { x: ROCA_ESTACION1.x, z: ROCA_ESTACION1.z };
/** El LRV no se acerca al centro del LM a menos de esto (m): el radio del LM más medio LRV. */
const DISTANCIA_MINIMA_LM_M = RADIO_OBSTACULO_LM_M + 1.6;
/** Ni a la roca a menos de esto (m): se detiene delante sin pasarle por encima. */
const DISTANCIA_MINIMA_ROCA_M = 2.0;

/**
 * `entrando_museo`: el jugador acaba de llegar y está a pie; puede caminar y mirar hasta subirse al LRV.
 * `a_pie`: se bajó del LRV. El LRV se queda donde estaba y la muestra, si ya la recogió, sigue recogida.
 */
export type EstadoLuna =
  | 'entrando_museo'
  | 'a_pie'
  | 'sentado_en_LRV'
  | 'conduciendo'
  | 'cerca_de_roca'
  | 'golpeando'
  | 'agarrando'
  | 'muestra_recogida'
  | 'volviendo';

export interface EntradaLuna {
  /** Instante actual (s). Se usa para la ventana del agarre. */
  ahoraS: number;
  /** Duración de este fotograma (s). */
  dtS: number;
  /** Aplauso o barra espaciadora en este fotograma (ya filtrado por cooldown). */
  aplauso: boolean;
  /** Metros que avanza el LRV en este fotograma, según la caminata (0 si el jugador está parado). */
  metros: number;
  /** Ángulo del volante en grados (+ = derecha). null si no se ven las manos. */
  volanteGrados: number | null;
  /** Velocidad de la muñeca que golpea hacia abajo, en hombros/s. Negativa si sube. */
  velocidadGolpeHombrosS: number;
  /** El pellizco de la otra mano se acaba de cerrar en este fotograma. */
  agarreNuevo: boolean;
  /** Bajarse del LRV en este fotograma (tecla B o pellizco sostenido con las dos manos). Opcional: false. */
  bajarse?: boolean;
  /** Posición del jugador a pie (m). Solo cuenta antes de subirse al LRV. */
  jugador: { x: number; z: number };
}

export type EventoLuna =
  | { tipo: 'estado'; estado: EstadoLuna }
  /** Golpe sin agarre a tiempo: vuelve a conducir o a estar cerca de la roca. */
  | { tipo: 'golpeFallido' }
  | { tipo: 'muestraRecogida' }
  /** Aplauso a pie lejos del LRV: no se sube. */
  | { tipo: 'lejosDelLRV' }
  /** El jugador se bajó del LRV. `conMuestra`: ya había recogido la muestra. */
  | { tipo: 'bajado'; conMuestra: boolean }
  /** El jugador pidió volver al museo (aplauso). */
  | { tipo: 'volver' };

/** ¿Cuenta como golpe una velocidad de muñeca (hombros/s, positiva = bajando)? */
export function esGolpe(velocidadHombrosS: number): boolean {
  return velocidadHombrosS >= GOLPE_VELOCIDAD_HOMBROS_S;
}

/**
 * Metros que avanza el jugador a pie en este fotograma, con el tope de MOON_WALK_MAX_SPEED. La caminata del museo
 * (game/caminata.ts) sigue igual; solo la misión lunar recorta el avance.
 */
export function metrosAPieLuna(metros: number, dtS: number): number {
  const tope = MOON_WALK_MAX_SPEED * Math.max(0, dtS);
  return Math.max(-tope, Math.min(tope, metros));
}

/**
 * Acerca la velocidad del LRV (m/s) a la objetivo en un fotograma: acelera como mucho a LRV_ACCEL y frena como
 * mucho a LRV_BRAKE. El objetivo ya viene limitado a ±LRV_MAX_SPEED.
 */
export function acercarVelocidadLRV(actual: number, objetivo: number, dtS: number): number {
  const tasa = Math.abs(objetivo) > Math.abs(actual) ? LRV_ACCEL : LRV_BRAKE;
  const paso = tasa * Math.max(0, dtS);
  const delta = objetivo - actual;
  return Math.abs(delta) <= paso ? objetivo : actual + Math.sign(delta) * paso;
}

/** Velocidad objetivo del LRV (m/s) según los metros que la caminata da en el fotograma. */
export function objetivoVelocidadLRV(metros: number, dtS: number): number {
  if (dtS <= 0) return 0;
  const velocidad = (metros / dtS) * FACTOR_AVANCE_LRV;
  return Math.max(-LRV_MAX_SPEED, Math.min(LRV_MAX_SPEED, velocidad));
}

/** Giro del LRV (°/s) para un ángulo de volante: proporcional fuera de la zona neutral, con tope. */
export function giroVolanteGradosS(anguloGrados: number): number {
  const exceso = Math.abs(anguloGrados) - VOLANTE_NEUTRAL_GRADOS;
  if (exceso <= 0) return 0;
  const velocidad = Math.min(VOLANTE_VELOCIDAD_MAX_GRADOS_S, exceso * VOLANTE_SENSIBILIDAD);
  return Math.sign(anguloGrados) * velocidad;
}

/**
 * Ángulo de dirección (°, + = derecha) de la rueda interior delantera para un ángulo de volante: proporcional al
 * giro que produce el volante, con DIRECCION_MAX_GRADOS cuando el giro llega a su tope. Volante recto = 0.
 */
export function direccionVolanteGrados(anguloGrados: number): number {
  return (giroVolanteGradosS(anguloGrados) / VOLANTE_VELOCIDAD_MAX_GRADOS_S) * DIRECCION_MAX_GRADOS;
}

/** Estados en que el jugador va sentado en el LRV y puede bajarse. Golpeando o agarrando, no: perdería el golpe. */
const PUEDE_BAJARSE: readonly EstadoLuna[] = ['sentado_en_LRV', 'conduciendo', 'cerca_de_roca', 'muestra_recogida'];

export class MisionLuna {
  private estadoActual: EstadoLuna;
  private x: number;
  private z: number;
  /** Rumbo del LRV (°). 0 = hacia −Z (norte); positivo = hacia la derecha (igual que el azimut). */
  private rumbo: number;
  /** Instante (s) hasta el que vale el agarre tras un golpe; null si no hay golpe pendiente. */
  private finAgarreS: number | null = null;
  /** Ángulo de dirección de las ruedas (°, + = derecha). Se queda en el último valor si no se ven las manos. */
  private direccion = 0;
  /** La muestra ya se recogió. Se conserva aunque el jugador se baje del LRV. */
  private conMuestra: boolean;
  /** Velocidad actual del LRV (m/s, negativa al retroceder). Cambia con LRV_ACCEL y LRV_BRAKE. */
  private velocidadLRV = 0;

  /**
   * `estadoInicial` por defecto es `entrando_museo`: la escena se abre con el aplauso de la vitrina
   * (lo gestiona Museo) y el jugador llega a pie. Un aplauso junto al LRV lo sienta.
   */
  constructor(estadoInicial: EstadoLuna = 'entrando_museo', posicion = POSICION_LRV_INICIAL, rumbo = RUMBO_LRV_INICIAL) {
    this.estadoActual = estadoInicial;
    this.x = posicion.x;
    this.z = posicion.z;
    this.rumbo = rumbo;
    this.conMuestra = estadoInicial === 'muestra_recogida';
  }

  get estado(): EstadoLuna {
    return this.estadoActual;
  }

  get posicion(): { x: number; z: number } {
    return { x: this.x, z: this.z };
  }

  get rumboGrados(): number {
    return this.rumbo;
  }

  /** Ángulo de dirección de las ruedas (°, + = derecha), para dibujarlas. Ver direccionVolanteGrados. */
  get direccionGrados(): number {
    return this.direccion;
  }

  /** La muestra ya está recogida (aunque el jugador se haya bajado). */
  get muestraRecogida(): boolean {
    return this.conMuestra;
  }

  /** El jugador está a pie: al llegar, o después de bajarse del LRV. */
  get aPie(): boolean {
    return this.estadoActual === 'entrando_museo' || this.estadoActual === 'a_pie';
  }

  distanciaRoca(): number {
    return Math.hypot(this.x - POSICION_ROCA.x, this.z - POSICION_ROCA.z);
  }

  /** El LRV está lo bastante cerca para golpear la roca: a `DISTANCIA_ROCA_M` o menos (SPEC 8.3). */
  get rocaResaltada(): boolean {
    return this.distanciaRoca() <= DISTANCIA_ROCA_M;
  }

  /** El halo de la roca se ve desde que se llega hasta recoger la muestra (SPEC 10: visible hasta completar la acción). */
  get haloVisible(): boolean {
    return !this.conMuestra && this.estadoActual !== 'volviendo';
  }

  /** Avanza un fotograma. Devuelve los eventos ocurridos en él. */
  update(entrada: EntradaLuna): EventoLuna[] {
    const eventos: EventoLuna[] = [];
    const ir = (estado: EstadoLuna): void => {
      if (estado === this.estadoActual) return;
      this.estadoActual = estado;
      eventos.push({ tipo: 'estado', estado });
    };

    if (this.estadoActual === 'volviendo') return eventos;

    // El aplauso sienta al jugador si está junto al LRV, o vuelve al museo en cualquier otro estado (SPEC 8.3 y 8.4).
    // Bajado del LRV con la muestra ya recogida, el aplauso vuelve al museo esté donde esté.
    if (entrada.aplauso) {
      if (this.aPie && !(this.estadoActual === 'a_pie' && this.conMuestra)) {
        if (this.distanciaJugador(entrada.jugador) <= DISTANCIA_SUBIR_M) {
          ir(this.conMuestra ? 'muestra_recogida' : 'sentado_en_LRV');
        } else {
          eventos.push({ tipo: 'lejosDelLRV' });
        }
      } else {
        ir('volviendo');
        eventos.push({ tipo: 'volver' });
      }
      return eventos;
    }

    // Bajarse: el LRV se detiene donde está (no avanza en este fotograma) y conserva la muestra.
    if (entrada.bajarse && PUEDE_BAJARSE.includes(this.estadoActual)) {
      this.finAgarreS = null;
      this.velocidadLRV = 0;
      ir('a_pie');
      eventos.push({ tipo: 'bajado', conMuestra: this.conMuestra });
      return eventos;
    }

    // Sentado (también parado), el volante mueve las ruedas. Sin manos, se quedan en el último ángulo (SPEC 6).
    if (!this.aPie && entrada.volanteGrados !== null) {
      this.direccion = direccionVolanteGrados(entrada.volanteGrados);
    }

    if (this.estadoActual === 'sentado_en_LRV' && entrada.metros !== 0) ir('conduciendo');

    if (this.estadoActual === 'conduciendo' || this.estadoActual === 'cerca_de_roca') {
      this.velocidadLRV = acercarVelocidadLRV(this.velocidadLRV, objetivoVelocidadLRV(entrada.metros, entrada.dtS), entrada.dtS);
      this.avanzar(entrada);
      ir(this.rocaResaltada ? 'cerca_de_roca' : 'conduciendo');
      if (this.estadoActual === 'cerca_de_roca' && esGolpe(entrada.velocidadGolpeHombrosS)) {
        this.finAgarreS = entrada.ahoraS + VENTANA_AGARRE_S;
        // Para agarrar la muestra el LRV se detiene: no avanza durante golpeando ni agarrando.
        this.velocidadLRV = 0;
        ir('golpeando');
      }
      return eventos;
    }

    // Durante golpeando y agarrando el LRV no avanza ni gira. SPEC no lo especifica: es una decisión propia.
    if (this.estadoActual === 'golpeando') {
      // Sin agarre dentro de la ventana, el golpe no cuenta y el jugador sigue conduciendo.
      if (this.finAgarreS !== null && entrada.ahoraS > this.finAgarreS) {
        this.finAgarreS = null;
        ir(this.rocaResaltada ? 'cerca_de_roca' : 'conduciendo');
        eventos.push({ tipo: 'golpeFallido' });
        return eventos;
      }
      if (entrada.agarreNuevo) {
        this.finAgarreS = null;
        this.conMuestra = true;
        ir('agarrando');
        ir('muestra_recogida');
        eventos.push({ tipo: 'muestraRecogida' });
      }
    }

    return eventos;
  }

  /** Distancia (m) del jugador a pie al centro del LRV. */
  distanciaJugador(jugador: { x: number; z: number }): number {
    return Math.hypot(jugador.x - this.x, jugador.z - this.z);
  }

  /**
   * Giro con el volante y avance a la velocidad del LRV (velocidadLRV, con aceleración y frenado limitados). Solo se
   * llama conduciendo o cerca de la roca. El LRV no atraviesa el LM ni la roca, ni sale de RADIO_LRV_M alrededor del LM.
   */
  private avanzar(entrada: EntradaLuna): void {
    if (entrada.volanteGrados !== null) {
      this.rumbo += giroVolanteGradosS(entrada.volanteGrados) * entrada.dtS;
    }
    const rad = (this.rumbo * Math.PI) / 180;
    const metros = this.velocidadLRV * entrada.dtS;
    const x = this.x + Math.sin(rad) * metros;
    const z = this.z - Math.cos(rad) * metros;
    // Solo se bloquea el paso que entra en el LM o sale del radio: alejarse o volver siempre se puede.
    const desdeLM = Math.hypot(x - LM.x, z - LM.z);
    const antes = Math.hypot(this.x - LM.x, this.z - LM.z);
    if ((desdeLM < DISTANCIA_MINIMA_LM_M && desdeLM < antes) || (desdeLM > RADIO_LRV_M && desdeLM > antes)) return;
    const aRoca = Math.hypot(x - POSICION_ROCA.x, z - POSICION_ROCA.z);
    if (aRoca < DISTANCIA_MINIMA_ROCA_M && aRoca < this.distanciaRoca()) return;
    this.x = x;
    this.z = z;
  }
}
