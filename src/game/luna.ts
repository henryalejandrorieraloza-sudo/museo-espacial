// Misión lunar, Apollo 17 (SPEC 8). Máquina de estados pura: sin Three.js, sin DOM y sin tracking.
// El que la usa (juego.ts, cuando se conecte) le pasa en cada fotograma lo que el jugador hace
// (aplauso, metros caminados, ángulo del volante, golpe y agarre) y recibe los eventos.
// Las constantes de posición replican las de src/visual/museo.ts y src/visual/config.ts; si cambian, cámbialas aquí también.

/** Distancia (m) entre el LRV y la roca para resaltarla (SPEC 8.3). */
export const DISTANCIA_ROCA_M = 2;
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

/** Posición inicial del LRV (m, plano del suelo). Igual que `lrv_placeholder` en la escena. */
export const POSICION_LRV_INICIAL = { x: 0, z: -4 };
/** Posición de la roca (m). Igual que `roca_placeholder` en la escena. */
export const POSICION_ROCA = { x: 2.5, z: -3 };

export type EstadoLuna =
  | 'entrando_museo'
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
}

export type EventoLuna =
  | { tipo: 'estado'; estado: EstadoLuna }
  /** Golpe sin agarre a tiempo: vuelve a conducir o a estar cerca de la roca. */
  | { tipo: 'golpeFallido' }
  | { tipo: 'muestraRecogida' }
  /** El jugador pidió volver al museo (aplauso). */
  | { tipo: 'volver' };

/** ¿Cuenta como golpe una velocidad de muñeca (hombros/s, positiva = bajando)? */
export function esGolpe(velocidadHombrosS: number): boolean {
  return velocidadHombrosS >= GOLPE_VELOCIDAD_HOMBROS_S;
}

/** Giro del LRV (°/s) para un ángulo de volante: proporcional fuera de la zona neutral, con tope. */
export function giroVolanteGradosS(anguloGrados: number): number {
  const exceso = Math.abs(anguloGrados) - VOLANTE_NEUTRAL_GRADOS;
  if (exceso <= 0) return 0;
  const velocidad = Math.min(VOLANTE_VELOCIDAD_MAX_GRADOS_S, exceso * VOLANTE_SENSIBILIDAD);
  return Math.sign(anguloGrados) * velocidad;
}

export class MisionLuna {
  private estadoActual: EstadoLuna;
  private x: number;
  private z: number;
  /** Rumbo del LRV (°). 0 = hacia −Z; positivo = hacia la derecha. */
  private rumbo = 0;
  /** Instante (s) hasta el que vale el agarre tras un golpe; null si no hay golpe pendiente. */
  private finAgarreS: number | null = null;

  /**
   * `estadoInicial` por defecto es `entrando_museo`: la escena se abre con el aplauso de la vitrina
   * (lo gestiona Museo) y el primer aplauso dentro de la escena sienta al jugador.
   */
  constructor(estadoInicial: EstadoLuna = 'entrando_museo', posicion = POSICION_LRV_INICIAL) {
    this.estadoActual = estadoInicial;
    this.x = posicion.x;
    this.z = posicion.z;
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

  distanciaRoca(): number {
    return Math.hypot(this.x - POSICION_ROCA.x, this.z - POSICION_ROCA.z);
  }

  /** La roca se resalta mientras el LRV está a `DISTANCIA_ROCA_M` o menos (SPEC 8.3). */
  get rocaResaltada(): boolean {
    return this.distanciaRoca() <= DISTANCIA_ROCA_M;
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

    // El aplauso sienta al jugador al entrar o vuelve al museo en cualquier otro estado (SPEC 8.3 y 8.4).
    if (entrada.aplauso) {
      if (this.estadoActual === 'entrando_museo') {
        ir('sentado_en_LRV');
      } else {
        ir('volviendo');
        eventos.push({ tipo: 'volver' });
      }
      return eventos;
    }

    if (this.estadoActual === 'sentado_en_LRV' && entrada.metros > 0) ir('conduciendo');

    if (this.estadoActual === 'conduciendo' || this.estadoActual === 'cerca_de_roca') {
      this.avanzar(entrada);
      ir(this.rocaResaltada ? 'cerca_de_roca' : 'conduciendo');
      if (this.estadoActual === 'cerca_de_roca' && esGolpe(entrada.velocidadGolpeHombrosS)) {
        this.finAgarreS = entrada.ahoraS + VENTANA_AGARRE_S;
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
        ir('agarrando');
        ir('muestra_recogida');
        eventos.push({ tipo: 'muestraRecogida' });
      }
    }

    return eventos;
  }

  /** Giro con el volante y avance con los metros de la caminata. Solo se llama conduciendo o cerca de la roca. */
  private avanzar(entrada: EntradaLuna): void {
    if (entrada.volanteGrados !== null) {
      this.rumbo += giroVolanteGradosS(entrada.volanteGrados) * entrada.dtS;
    }
    const rad = (this.rumbo * Math.PI) / 180;
    this.x += Math.sin(rad) * entrada.metros;
    this.z -= Math.cos(rad) * entrada.metros;
  }
}
