// Balanceo de la caminata en el museo (solo visual). Lógica pura: no toca la posición del jugador ni los datos de
// seguimiento; devuelve la postura de la cámara (desplazamiento lateral, subida y bajada, inclinación).
//
// Como al caminar de verdad, en cada paso el cuerpo:
//   - se desplaza de lado (un ciclo izquierda-derecha son dos pasos; cada paso es un extremo),
//   - sube y baja dos veces por ciclo (más alto al apoyar un pie, más bajo entre pasos),
//   - se inclina ligeramente hacia el lado del peso,
//   - cambia un poco la amplitud de un paso a otro y con el ritmo de la caminata.
// Con teclas, el ritmo sale de la velocidad; con movimiento corporal, cada paso detectado alinea la fase.

/** Amplitud (m) del balanceo lateral a plena caminata: desplazamiento de la cámara a cada lado. */
export const WALK_SWAY_AMPLITUDE = 0.02;
/** Amplitud (m) de la subida y bajada de la vista, dos veces por ciclo. */
export const BOB_VERTICAL_AMPLITUDE = 0.005;
/** Inclinación (°) máxima de la vista hacia el lado del peso. Solo visual: no es la detección de roll. */
export const ROLL_VISTA_MAX_GRADOS = 0.3;
/** Tiempo (s) con el que cada paso detectado corrige la fase: la alineación entra suave, sin saltos. */
export const TIEMPO_SINCRONIA_PASO_S = 0.06;
/** Ritmo (pasos/s) de una caminata normal: a este ritmo el balanceo tiene su amplitud de referencia. */
export const PASOS_POR_SEGUNDO_REFERENCIA = 1.8;
/** Límites del factor de amplitud por ritmo, para que correr o andar muy despacio no se salgan de lo natural. */
const FACTOR_RITMO_MIN = 0.7;
const FACTOR_RITMO_MAX = 1.3;
/** Variación de la amplitud de un paso a otro (fracción). Suave y continua, para que no haya saltos. */
const VARIACION_AMPLITUD = 0.12;
/** Tiempo (s) para que la amplitud suba de cero a plena al empezar a caminar. */
export const TIEMPO_SUBIDA_BALANCEO_S = 0.5;
/** Tiempo (s) para que la amplitud baje a cero al parar. */
export const TIEMPO_BAJADA_BALANCEO_S = 0.3;
/** Intervalo (s) entre pasos hasta tener dos pasos para medirlo (cadencia de caminata normal). */
const INTERVALO_PASO_INICIAL_S = 0.5;
/** Límites (s) del intervalo entre pasos, para que un dato raro no dispare el balanceo. */
const INTERVALO_PASO_MIN_S = 0.25;
const INTERVALO_PASO_MAX_S = 1.5;
/** Tiempo máximo (s) que cuenta un tramo entre dos llamadas, para no saltar tras una pausa. */
const DT_MAX_S = 0.1;

/** Lo que sabe el balanceo en cada vuelta del bucle. */
export interface EntradaBalanceo {
  /** Hay caminata en curso: teclas hacia delante o hacia atrás, o pasos recientes con el cuerpo. */
  caminando: boolean;
  /** Pasos detectados desde la vuelta anterior (solo con movimiento corporal). */
  pasosNuevos: number;
  /** Cadencia (pasos/s) para el balanceo por tiempo (teclado). null = sincronizado con los pasos detectados. */
  pasosPorSegundo: number | null;
}

/** Postura de la cámara por el balanceo, relativa a la posición del jugador. */
export interface PosturaCaminata {
  /** Desplazamiento lateral (m); + = a la derecha. */
  lateralM: number;
  /** Subida (+) o bajada (−) de la vista (m). */
  verticalM: number;
  /** Inclinación de la vista (°); + = inclinada a la derecha. Solo visual. */
  rollGrados: number;
}

const POSTURA_NEUTRAL: PosturaCaminata = { lateralM: 0, verticalM: 0, rollGrados: 0 };

function clamp(valor: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, valor));
}

export class BalanceoCaminata {
  /** Amplitud relativa lineal (0–1): sube al caminar y baja al parar. Se suaviza con smoothstep al usarla. */
  private envolvente = 0;
  /** Corrección pendiente de la fase (rad), que se aplica poco a poco tras cada paso detectado. */
  private correccion = 0;
  /** Fase (rad): cada paso avanza π, así que un ciclo completo son dos pasos. */
  private fase = 0;
  private previoS: number | null = null;
  private pasosTotales = 0;
  private ultimoPasoS: number | null = null;
  private intervaloPasoS = INTERVALO_PASO_INICIAL_S;

  /**
   * Postura de la cámara en `ahoraS`. Sin caminata, la envolvente llega a cero y la postura vuelve a neutral sin saltos.
   */
  avanzar(ahoraS: number, entrada: EntradaBalanceo): PosturaCaminata {
    const dtS = this.previoS === null ? 0 : Math.min(DT_MAX_S, Math.max(0, ahoraS - this.previoS));
    this.previoS = ahoraS;

    const meta = entrada.caminando ? 1 : 0;
    const tiempo = meta > this.envolvente ? TIEMPO_SUBIDA_BALANCEO_S : TIEMPO_BAJADA_BALANCEO_S;
    const paso = dtS / tiempo;
    const delta = meta - this.envolvente;
    this.envolvente = Math.abs(delta) <= paso ? meta : this.envolvente + Math.sign(delta) * paso;

    if (entrada.pasosPorSegundo !== null) {
      // Por tiempo (teclas): la fase avanza π por paso, a la cadencia de la velocidad actual.
      this.fase += Math.PI * entrada.pasosPorSegundo * dtS;
    } else if (entrada.pasosNuevos > 0) {
      this.registrarPasos(ahoraS, entrada.pasosNuevos);
    } else if (entrada.caminando) {
      // Entre pasos detectados, la fase sigue al ritmo del último intervalo.
      this.fase += (Math.PI / this.intervaloPasoS) * dtS;
    }

    // Corrección de la fase hacia el último paso detectado, gradual para que no haya tirones.
    const avance = this.correccion * Math.min(1, dtS / TIEMPO_SINCRONIA_PASO_S);
    this.fase += avance;
    this.correccion -= avance;

    if (this.envolvente === 0) return POSTURA_NEUTRAL;
    // Smoothstep: la amplitud arranca y se frena sin esquinas, tanto al empezar como al parar.
    const suave = this.envolvente * this.envolvente * (3 - 2 * this.envolvente);
    // Ritmo: caminar más rápido balancea más; andar despacio, menos.
    const cadencia = entrada.pasosPorSegundo ?? (entrada.caminando ? 1 / this.intervaloPasoS : 0);
    const factorRitmo = clamp(cadencia / PASOS_POR_SEGUNDO_REFERENCIA, FACTOR_RITMO_MIN, FACTOR_RITMO_MAX);
    // Variación suave de un paso a otro: dos senos a ritmos distintos, sin escalones.
    const variacion = 1 + VARIACION_AMPLITUD * (0.7 * Math.sin(0.5 * this.fase + 1.3) + 0.3 * Math.sin(1.13 * this.fase));
    const amplitud = suave * factorRitmo * variacion;
    const cuerpo = Math.cos(this.fase);
    return {
      lateralM: WALK_SWAY_AMPLITUDE * amplitud * cuerpo,
      // Dos subidas por ciclo: en cada paso la vista está más alta, y más baja a medio paso.
      verticalM: BOB_VERTICAL_AMPLITUDE * amplitud * Math.cos(2 * this.fase),
      // Se inclina hacia el lado del peso, en fase con el desplazamiento lateral.
      rollGrados: ROLL_VISTA_MAX_GRADOS * amplitud * Math.sin(this.fase),
    };
  }

  /** Cada paso detectado es un extremo del balanceo: la fase se alinea con él y se actualiza el ritmo. */
  private registrarPasos(ahoraS: number, pasos: number): void {
    if (this.ultimoPasoS !== null) {
      const desdeUltimo = ahoraS - this.ultimoPasoS;
      // Solo se mide el ritmo dentro de una misma caminata; tras una parada se vuelve al valor inicial.
      this.intervaloPasoS =
        desdeUltimo <= INTERVALO_PASO_MAX_S
          ? Math.min(INTERVALO_PASO_MAX_S, Math.max(INTERVALO_PASO_MIN_S, desdeUltimo / pasos))
          : INTERVALO_PASO_INICIAL_S;
    }
    this.ultimoPasoS = ahoraS;
    this.pasosTotales += pasos;
    const objetivo = Math.PI * this.pasosTotales;
    // Al arrancar tras una parada, o si la predicción se ha ido muy lejos, la fase salta directamente al paso.
    if (this.envolvente < 0.05 || Math.abs(objetivo - this.fase) > Math.PI / 2) {
      this.fase = objetivo;
      this.correccion = 0;
    } else {
      this.correccion = objetivo - this.fase;
    }
  }
}
