// Presentación del LRV (animación informativa entre la vitrina del LRV y la misión lunar). Lógica pura, sin Three.js:
// el guion (escenas, tramos, tomas de cámara, resaltes y rótulos) y la máquina de estados que lo recorre. El render
// está en visual/presentacionLRV.ts y los textos en pantalla, en ui/presentacionUi.ts; juego.ts lo une todo y pone
// la voz del mentor (la misma del robot del museo).
//
// Cada tramo dice una frase (o ninguna) y dura lo que dure más: su tiempo mínimo o la frase. Así la imagen y los
// subtítulos nunca se desfasan, aunque la voz del navegador vaya más lenta o más rápida. Las escenas empiezan y
// terminan con un fundido; los tramos de una misma escena se encadenan sin corte.
//
// Coordenadas de las tomas: ejes del LRV (frente hacia −Z, derecha +X, arriba +Y, origen en el suelo, en el centro),
// con el LRV en su posición de partida. La altura del punto de mira es sobre el suelo que hay debajo de él. `az` es el
// azimut de la cámara alrededor del punto al que mira: 0 = delante del LRV, +90 = a su derecha, 180 = detrás. `el` es
// la elevación (°) y `dist`, la distancia (m).
//
// Fuentes de los datos que se dicen o se rotulan:
// - NSSDC (NASA), "The Apollo Lunar Roving Vehicle": vehículo eléctrico de Apollo 15, 16 y 17; masa de 210 kg; ruedas
//   de malla de acero cincado con chevrones de titanio y, dentro, un marco de tope de 64.8 cm de diámetro; asientos
//   de tubo de aluminio con correas de nailon; dos baterías de plata-zinc de 36 V; mando en T: adelante avanza, a los
//   lados gira, atrás frena, y con un interruptor del mando, atrás va marcha atrás.
// - Wikipedia, "Lunar Roving Vehicle": 460 lb (210 kg) en la Tierra; en la Luna pesa una sexta parte (76 lb).
// - ALSJ, Apollo 17, estación 4: Schmitt encontró el suelo naranja (vidrio volcánico, muestra 74220) en el borde del
//   cráter Shorty, al que llegaron en el LRV durante la EVA-2.

import type { ClaveTexto } from '../i18n';

/** Fundido a negro (s) al terminar una escena, y desde negro al empezar la siguiente. */
export const FUNDIDO_ESCENA_S = 0.5;
/** Tras "Estás listo para la misión", segundos mínimos en pantalla antes de entrar a la Luna. */
export const SEGUNDOS_LISTO = 2.5;
/**
 * Si la voz nunca avisa de que terminó, el tramo sigue igual pasado este margen sobre su tiempo mínimo. La voz ya tiene
 * su propio respaldo (audio/voz.ts); esto es una segunda red para que la presentación nunca se quede parada.
 */
export const MARGEN_VOZ_S = 20;

/** Piezas que se pueden resaltar. Las de la rueda son de la rueda delantera izquierda; `ruedas`, de las cuatro. */
export type Resalte =
  | 'lrv'
  | 'chasis'
  | 'ruedas'
  | 'malla'
  | 'chevrones'
  | 'marcoInterior'
  | 'asientos'
  | 'consola'
  | 'mando'
  | 'camaraTV'
  | 'antenaAlta'
  | 'antenaBaja'
  | 'baterias'
  | 'mylar'
  | 'panelPotencia'
  | 'panelDireccion'
  | 'panelHabilitar'
  | 'sueloNaranja';

export type V3 = readonly [number, number, number];

/** Pose de la cámara en el instante `t` (s desde el inicio del tramo). Entre dos poses, la cámara va con ease-in-out. */
export interface Toma {
  t: number;
  az: number;
  el: number;
  dist: number;
  mira: V3;
  /** Campo de visión vertical (°). Por defecto, CAMPO_VISION. */
  fov?: number;
}

/** Resalte (contorno azul celeste) con o sin rótulo, de `desde` a `hasta` (s del tramo). Aparece y se va suave. */
export interface Marca {
  resalte: Resalte;
  rotulo: ClaveTexto | null;
  desde: number;
  /** Infinity = hasta el final del tramo. */
  hasta: number;
  /** Solo el rótulo, sin contorno. */
  sinContorno?: boolean;
  /** Desplazamiento del rótulo en pantalla (px) respecto al centro de la pieza. Por defecto, encima. */
  rotuloPx?: readonly [number, number];
}

/** Inclinación de la palanca del mando en T en el instante `t`: −1…1 adelante (+) o atrás (−), y a la derecha (+). */
export interface PoseMando {
  t: number;
  adelante: number;
  lado: number;
}

export interface Tramo {
  /** Frase del narrador (clave de es.json), o null para un tramo sin voz. */
  narracion: ClaveTexto | null;
  /** Duración mínima (s). */
  minS: number;
  tomas: readonly Toma[];
  marcas: readonly Marca[];
  /** Tarjeta del peso en la Tierra y en la Luna, de `desde` a `hasta` (s del tramo). */
  tarjetaPeso?: readonly [number, number];
  /** Movimiento de la palanca del mando en T. */
  mando?: readonly PoseMando[];
  /** El LRV avanza `metros` hacia delante entre `desde` y `hasta` (s del tramo), con ease-in-out. */
  avance?: { desde: number; hasta: number; metros: number };
  /** Las tomas son relativas a la posición del LRV mientras avanza (la cámara lo sigue). */
  camaraSigueLRV?: boolean;
}

export interface EscenaPresentacion {
  id: string;
  tramos: readonly Tramo[];
}

/** Campo de visión vertical por defecto (°). */
export const CAMPO_VISION = 40;

// Puntos del LRV que se usan en las tomas (ejes del LRV, m). Salen de las medidas de visual/lrv.ts.
const CENTRO: V3 = [0, 0.6, 0];
const RUEDA_DI: V3 = [-0.915, 0.41, -1.143];
const ASIENTOS: V3 = [-0.05, 0.72, 0.22];
const CONSOLA_Y_MANDO: V3 = [0, 0.96, -0.42];
const CAMARA_TV: V3 = [0.1, 1.2, -1.46];
const BATERIAS: V3 = [0, 0.55, -0.95];
const MYLAR: V3 = [0.05, 0.92, -1.42];
const MANDO: V3 = [0, 0.86, -0.07];
const PANEL: V3 = [0, 0.95, -0.56];

/**
 * Metros que avanza el LRV en la escena de cierre. Con el perfil de `avanceEn` (smoothstep, pico 1.5 veces la media)
 * en 8 s, la velocidad máxima es 2.6 m/s: por debajo de su máximo de diseño, 6 mph (2.7 m/s).
 */
export const AVANCE_CIERRE_M = 14;

/**
 * Guion de la presentación, en orden. Las capturas de referencia de Henry (tomas de cámara, no imágenes del proyecto)
 * se citan como "ref 46" para la captura_46.png.
 */
export const GUION: readonly EscenaPresentacion[] = [
  {
    // 1. Introducción: plano alto y lejano con el LRV pequeño (ref 06) y acercamiento a 3/4 frontal (ref 05, 22).
    id: 'introduccion',
    tramos: [
      {
        narracion: 'pres_intro',
        minS: 8,
        tomas: [
          { t: 0, az: -35, el: 40, dist: 22, mira: CENTRO },
          { t: 4, az: -42, el: 16, dist: 7.5, mira: CENTRO },
          { t: 8, az: -48, el: 13, dist: 6.6, mira: CENTRO },
        ],
        marcas: [{ resalte: 'lrv', rotulo: 'rot_lrv', desde: 4.2, hasta: 7.6, sinContorno: true, rotuloPx: [0, -150] }],
      },
    ],
  },
  {
    // 2. Chasis: 3/4 frontal (ref 46) y giro lento alrededor del LRV.
    id: 'chasis',
    tramos: [
      {
        narracion: 'pres_chasis',
        minS: 8.5,
        tomas: [
          { t: 0, az: -40, el: 16, dist: 6.6, mira: [0, 0.6, 0] },
          { t: 2.8, az: -55, el: 14, dist: 6.0, mira: [0, 0.6, 0] },
          { t: 5.6, az: -95, el: 18, dist: 6.0, mira: [0, 0.6, 0] },
          { t: 8.5, az: -130, el: 22, dist: 6.3, mira: [0, 0.6, 0] },
        ],
        marcas: [{ resalte: 'chasis', rotulo: 'rot_chasis', desde: 0.8, hasta: Infinity, rotuloPx: [0, -90] }],
      },
    ],
  },
  {
    // 3. Ruedas y asientos: 3/4 de la rueda (ref 07, 08), malla (ref 10), chevrones (ref 11, 12), marco interior
    // (ref 14), asientos de lado (ref 48) y la tarjeta del peso (ref 44).
    id: 'ruedas_asientos',
    tramos: [
      {
        narracion: 'pres_ruedas',
        minS: 8,
        tomas: [
          { t: 0, az: -48, el: 16, dist: 2.8, mira: RUEDA_DI },
          { t: 2.5, az: -36, el: 14, dist: 1.7, mira: RUEDA_DI },
          { t: 5, az: -24, el: 10, dist: 1.25, mira: [-0.93, 0.34, -1.48] },
          { t: 8, az: -86, el: 6, dist: 1.6, mira: RUEDA_DI },
        ],
        marcas: [
          { resalte: 'ruedas', rotulo: 'rot_ruedas', desde: 0.3, hasta: 2.4, rotuloPx: [0, -170] },
          { resalte: 'malla', rotulo: 'rot_malla', desde: 2.6, hasta: 4.9, rotuloPx: [0, -190] },
          { resalte: 'chevrones', rotulo: 'rot_chevrones', desde: 5.1, hasta: 7.0, rotuloPx: [160, 140] },
          { resalte: 'marcoInterior', rotulo: 'rot_marco', desde: 7.2, hasta: Infinity, rotuloPx: [200, 60] },
        ],
      },
      {
        narracion: 'pres_asientos',
        minS: 3.5,
        tomas: [{ t: 3, az: -98, el: 24, dist: 3.8, mira: ASIENTOS }],
        marcas: [{ resalte: 'asientos', rotulo: 'rot_asientos', desde: 1.2, hasta: Infinity, rotuloPx: [0, -150] }],
      },
      {
        narracion: 'pres_peso',
        minS: 4,
        tomas: [{ t: 3, az: -50, el: 20, dist: 6.8, mira: CENTRO }],
        marcas: [],
        tarjetaPeso: [0.3, Infinity],
      },
    ],
  },
  {
    // 4. Electrónica y comunicaciones: consola y mando desde detrás de los asientos (ref 49), cámara de TV (ref 50) y
    // antenas (ref 51), con la de alta ganancia apuntando a la Tierra.
    id: 'electronica',
    tramos: [
      {
        narracion: 'pres_consola',
        minS: 5.5,
        tomas: [
          { t: 0, az: -150, el: 34, dist: 2.4, mira: CONSOLA_Y_MANDO },
          { t: 3, az: -162, el: 32, dist: 1.9, mira: CONSOLA_Y_MANDO },
          { t: 5.5, az: -168, el: 30, dist: 1.8, mira: CONSOLA_Y_MANDO },
        ],
        marcas: [
          { resalte: 'consola', rotulo: 'rot_consola', desde: 0.6, hasta: Infinity, rotuloPx: [0, -150] },
          { resalte: 'mando', rotulo: 'rot_mando', desde: 2.2, hasta: Infinity, rotuloPx: [150, 40] },
        ],
      },
      {
        narracion: 'pres_comunicaciones',
        minS: 8.5,
        tomas: [
          { t: 2.5, az: -32, el: 22, dist: 1.9, mira: CAMARA_TV },
          { t: 4, az: -32, el: 22, dist: 1.8, mira: CAMARA_TV },
          { t: 6.5, az: -150, el: 6, dist: 4.6, mira: [-0.1, 1.55, -1.3], fov: 50 },
          { t: 8.5, az: -156, el: 6, dist: 4.4, mira: [-0.1, 1.55, -1.3], fov: 50 },
        ],
        marcas: [
          { resalte: 'camaraTV', rotulo: 'rot_camara', desde: 1.6, hasta: 4.2, rotuloPx: [0, -120] },
          { resalte: 'antenaAlta', rotulo: 'rot_antena_alta', desde: 6.0, hasta: Infinity, rotuloPx: [0, -130] },
          { resalte: 'antenaBaja', rotulo: 'rot_antena_baja', desde: 6.3, hasta: Infinity, rotuloPx: [0, -90] },
        ],
      },
    ],
  },
  {
    // 5. Energía: vista desde arriba de la sección delantera, con las baterías resaltadas (ref 39), y el Mylar (ref 53).
    // En el LRV las baterías iban en el chasis delantero (NSSDC), no en la plataforma trasera.
    id: 'energia',
    tramos: [
      {
        narracion: 'pres_baterias',
        minS: 5,
        tomas: [
          { t: 0, az: 80, el: 52, dist: 2.7, mira: BATERIAS },
          { t: 3, az: 92, el: 62, dist: 2.2, mira: BATERIAS },
          { t: 5, az: 96, el: 64, dist: 2.1, mira: BATERIAS },
        ],
        marcas: [{ resalte: 'baterias', rotulo: 'rot_baterias', desde: 0.8, hasta: Infinity, rotuloPx: [0, -120] }],
      },
      {
        narracion: 'pres_mylar',
        minS: 5,
        tomas: [
          { t: 3, az: -38, el: 14, dist: 1.7, mira: MYLAR },
          { t: 5, az: -44, el: 14, dist: 1.6, mira: MYLAR },
        ],
        marcas: [{ resalte: 'mylar', rotulo: 'rot_mylar', desde: 1.8, hasta: Infinity, rotuloPx: [-200, 0] }],
      },
    ],
  },
  {
    // 6. Propulsión: vista cenital (ref 25 a 34, la mitad izquierda) y acercamiento al mando en T (ref 24, 33) y al
    // panel con los interruptores de tracción y dirección.
    id: 'propulsion',
    tramos: [
      {
        narracion: 'pres_mando',
        minS: 5,
        tomas: [
          { t: 0, az: 180, el: 87, dist: 7.5, mira: [0, 0.5, 0] },
          { t: 2, az: 180, el: 87, dist: 7, mira: [0, 0.5, 0] },
          { t: 5, az: -150, el: 42, dist: 0.95, mira: MANDO },
        ],
        marcas: [{ resalte: 'mando', rotulo: 'rot_mando', desde: 3.3, hasta: Infinity, rotuloPx: [0, -130] }],
      },
      {
        narracion: 'pres_mando_movimientos',
        minS: 8,
        tomas: [
          { t: 0, az: -150, el: 42, dist: 0.95, mira: MANDO },
          { t: 8, az: -145, el: 41, dist: 0.95, mira: MANDO },
        ],
        mando: [
          { t: 0.3, adelante: 0, lado: 0 },
          { t: 0.9, adelante: 1, lado: 0 },
          { t: 1.8, adelante: 1, lado: 0 },
          { t: 2.4, adelante: 0, lado: 0 },
          { t: 2.9, adelante: 0, lado: 1 },
          { t: 3.7, adelante: 0, lado: 1 },
          { t: 4.2, adelante: 0, lado: 0 },
          { t: 4.7, adelante: -1, lado: 0 },
          { t: 5.6, adelante: -1, lado: 0 },
          { t: 6.2, adelante: 0, lado: 0 },
        ],
        marcas: [
          { resalte: 'mando', rotulo: 'rot_adelante', desde: 0.5, hasta: 2.2, rotuloPx: [0, -130] },
          { resalte: 'mando', rotulo: 'rot_lado', desde: 2.5, hasta: 4.0, rotuloPx: [0, -130] },
          { resalte: 'mando', rotulo: 'rot_atras', desde: 4.3, hasta: 6.0, rotuloPx: [0, -130] },
          { resalte: 'mando', rotulo: 'rot_marcha_atras', desde: 6.2, hasta: Infinity, rotuloPx: [0, -130], sinContorno: true },
        ],
      },
      {
        narracion: null,
        minS: 3.5,
        tomas: [
          { t: 2.5, az: 180, el: 26, dist: 0.8, mira: PANEL },
          { t: 3.5, az: 177, el: 26, dist: 0.78, mira: PANEL },
        ],
        marcas: [
          { resalte: 'panelPotencia', rotulo: 'rot_potencia', desde: 1.6, hasta: Infinity, rotuloPx: [-140, 70] },
          { resalte: 'panelDireccion', rotulo: 'rot_direccion', desde: 2.0, hasta: Infinity, rotuloPx: [0, 110] },
          { resalte: 'panelHabilitar', rotulo: 'rot_habilitar', desde: 2.4, hasta: Infinity, rotuloPx: [150, 70] },
        ],
      },
    ],
  },
  {
    // 7. Cierre: el LRV avanza por el terreno (ref 19, 20) hasta el borde del cráter Shorty, con la zona del suelo
    // naranja marcada.
    id: 'cierre',
    tramos: [
      {
        narracion: 'pres_cierre',
        minS: 10,
        tomas: [
          { t: 0, az: -120, el: 10, dist: 8, mira: [0, 0.6, -0.5] },
          { t: 4, az: -105, el: 12, dist: 8.5, mira: [0, 0.6, -1] },
          { t: 8, az: -155, el: 30, dist: 13, mira: [0.2, 0.5, -2.6] },
          { t: 10, az: -158, el: 32, dist: 13, mira: [0.2, 0.5, -2.6] },
        ],
        avance: { desde: 0.5, hasta: 8.5, metros: AVANCE_CIERRE_M },
        camaraSigueLRV: true,
        marcas: [{ resalte: 'sueloNaranja', rotulo: 'rot_suelo_naranja', desde: 6, hasta: Infinity, rotuloPx: [0, -90] }],
      },
    ],
  },
];

/** Escenas desde la que se puede saltar: la introducción siempre se ve entera. */
export const PRIMERA_ESCENA_SALTABLE = 1;

/** Duración mínima de la presentación (s): tramos y fundidos entre escenas, sin contar "Estás listo". */
export function duracionMinimaS(guion: readonly EscenaPresentacion[] = GUION): number {
  const tramos = guion.reduce((s, e) => s + e.tramos.reduce((a, t) => a + t.minS, 0), 0);
  return tramos + Math.max(0, guion.length - 1) * FUNDIDO_ESCENA_S;
}

export type EventoPresentacion =
  /** Empieza un tramo: juego.ts dice su frase, si tiene. */
  | { tipo: 'tramo'; escena: number; tramo: number }
  /** Terminó (o se saltó) la animación: se muestra y se dice "Estás listo para la misión". */
  | { tipo: 'listo' }
  /** Ya se puede entrar a la Luna. */
  | { tipo: 'fin' };

type Fase = 'espera' | 'tramo' | 'salida' | 'listo' | 'terminada';

/** Máquina de estados de la presentación. `actualizar` se llama en cada vuelta del bucle con el tiempo transcurrido. */
export class PresentacionLRV {
  private faseActual: Fase = 'espera';
  private indiceEscena = 0;
  private indiceTramo = 0;
  private t = 0;
  private tSalida = 0;
  private vozPendiente = false;
  private eventos: EventoPresentacion[] = [];
  private readonly guion: readonly EscenaPresentacion[];

  constructor(guion: readonly EscenaPresentacion[] = GUION) {
    this.guion = guion;
  }

  get fase(): Fase {
    return this.faseActual;
  }
  get escena(): number {
    return this.indiceEscena;
  }
  get tramo(): number {
    return this.indiceTramo;
  }
  /** Segundos desde el inicio del tramo actual. */
  get tiempoTramo(): number {
    return this.t;
  }
  get tramoActual(): Tramo | null {
    return this.guion[this.indiceEscena]?.tramos[this.indiceTramo] ?? null;
  }
  /** Se puede saltar ahora (no durante la introducción, ni después de terminar). */
  get saltable(): boolean {
    return (this.faseActual === 'tramo' || this.faseActual === 'salida') && this.indiceEscena >= PRIMERA_ESCENA_SALTABLE;
  }

  /** Opacidad del fundido entre escenas (0 = imagen, 1 = negro). La primera escena entra con el fundido del museo. */
  get fundido(): number {
    if (this.faseActual === 'salida') return Math.min(1, this.tSalida / FUNDIDO_ESCENA_S);
    if (this.faseActual === 'tramo' && this.indiceTramo === 0 && this.indiceEscena > 0) {
      return Math.max(0, 1 - this.t / FUNDIDO_ESCENA_S);
    }
    return 0;
  }

  /** Empieza por la primera escena. */
  iniciar(): EventoPresentacion[] {
    if (this.faseActual !== 'espera') return [];
    this.empezarTramo(0, 0);
    return this.sacarEventos();
  }

  /** La frase del tramo actual (o "Estás listo") terminó de sonar. */
  terminoVoz(): void {
    this.vozPendiente = false;
  }

  /** Salta al final ("Estás listo para la misión"). Devuelve false si ahora no se puede. */
  saltar(): boolean {
    if (!this.saltable) return false;
    this.pasarAListo();
    return true;
  }

  /** Va directo al final sin condiciones (p. ej., si la escena 3D no se pudo montar). */
  forzarFinal(): EventoPresentacion[] {
    if (this.faseActual === 'listo' || this.faseActual === 'terminada') return [];
    this.pasarAListo();
    return this.sacarEventos();
  }

  actualizar(dtS: number): EventoPresentacion[] {
    const dt = Math.max(0, dtS);
    switch (this.faseActual) {
      case 'tramo': {
        this.t += dt;
        const tramo = this.tramoActual;
        if (!tramo) break;
        const vozLista = !this.vozPendiente || this.t >= tramo.minS + MARGEN_VOZ_S;
        if (this.t < tramo.minS || !vozLista) break;
        const escena = this.guion[this.indiceEscena];
        if (this.indiceTramo + 1 < escena.tramos.length) {
          this.empezarTramo(this.indiceEscena, this.indiceTramo + 1);
        } else if (this.indiceEscena + 1 < this.guion.length) {
          this.faseActual = 'salida';
          this.tSalida = 0;
        } else {
          this.pasarAListo();
        }
        break;
      }
      case 'salida':
        this.tSalida += dt;
        // La imagen sigue moviéndose mientras se funde a negro.
        this.t += dt;
        if (this.tSalida >= FUNDIDO_ESCENA_S) this.empezarTramo(this.indiceEscena + 1, 0);
        break;
      case 'listo': {
        this.t += dt;
        const vozLista = !this.vozPendiente || this.t >= SEGUNDOS_LISTO + MARGEN_VOZ_S;
        if (this.t >= SEGUNDOS_LISTO && vozLista) {
          this.faseActual = 'terminada';
          this.eventos.push({ tipo: 'fin' });
        }
        break;
      }
      default:
        break;
    }
    return this.sacarEventos();
  }

  private empezarTramo(escena: number, tramo: number): void {
    this.faseActual = 'tramo';
    this.indiceEscena = escena;
    this.indiceTramo = tramo;
    this.t = 0;
    this.vozPendiente = this.tramoActual?.narracion != null;
    this.eventos.push({ tipo: 'tramo', escena, tramo });
  }

  private pasarAListo(): void {
    this.faseActual = 'listo';
    this.t = 0;
    this.vozPendiente = true;
    this.eventos.push({ tipo: 'listo' });
  }

  private sacarEventos(): EventoPresentacion[] {
    const salida = this.eventos;
    this.eventos = [];
    return salida;
  }
}

/** Ease-in-out cúbico (0–1). */
export function suavizar(u: number): number {
  const x = Math.min(1, Math.max(0, u));
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

/**
 * Pose de la cámara en el instante `t` de un tramo: entre dos tomas, interpola azimut, elevación, distancia, punto de
 * mira y campo de visión con ease-in-out. Si la primera toma empieza después de 0, la cámara sale de `previa` (la pose
 * en que quedó el tramo anterior). Pasada la última, se queda en ella.
 */
export function poseEn(tomas: readonly Toma[], t: number, previa: Toma | null): Toma {
  const lista = previa && tomas.length > 0 && tomas[0].t > 0 ? [{ ...previa, t: 0 }, ...tomas] : tomas;
  if (lista.length === 0) return previa ?? { t: 0, az: 0, el: 20, dist: 6, mira: CENTRO };
  if (t <= lista[0].t) return lista[0];
  for (let i = 1; i < lista.length; i++) {
    const b = lista[i];
    if (t > b.t) continue;
    const a = lista[i - 1];
    const u = suavizar((t - a.t) / Math.max(1e-6, b.t - a.t));
    const lerp = (x: number, y: number): number => x + (y - x) * u;
    // El azimut va por el camino corto.
    let daz = b.az - a.az;
    daz = ((((daz + 180) % 360) + 360) % 360) - 180;
    return {
      t,
      az: a.az + daz * u,
      el: lerp(a.el, b.el),
      dist: lerp(a.dist, b.dist),
      mira: [lerp(a.mira[0], b.mira[0]), lerp(a.mira[1], b.mira[1]), lerp(a.mira[2], b.mira[2])],
      fov: lerp(a.fov ?? CAMPO_VISION, b.fov ?? CAMPO_VISION),
    };
  }
  return lista[lista.length - 1];
}

/** Opacidad (0–1) de una marca en el instante `t` del tramo: entra y sale en FUNDIDO_MARCA_S. */
export const FUNDIDO_MARCA_S = 0.5;
export function opacidadMarca(m: Marca, t: number): number {
  if (t < m.desde || t > m.hasta) return 0;
  const entrada = (t - m.desde) / FUNDIDO_MARCA_S;
  const salida = Number.isFinite(m.hasta) ? (m.hasta - t) / FUNDIDO_MARCA_S : 1;
  return suavizar(Math.min(1, entrada, salida));
}

/** Inclinación de la palanca del mando en `t` (interpolada con ease-in-out entre poses). */
export function mandoEn(poses: readonly PoseMando[] | undefined, t: number): { adelante: number; lado: number } {
  if (!poses || poses.length === 0) return { adelante: 0, lado: 0 };
  if (t <= poses[0].t) return poses[0];
  for (let i = 1; i < poses.length; i++) {
    const b = poses[i];
    if (t > b.t) continue;
    const a = poses[i - 1];
    const u = suavizar((t - a.t) / Math.max(1e-6, b.t - a.t));
    return { adelante: a.adelante + (b.adelante - a.adelante) * u, lado: a.lado + (b.lado - a.lado) * u };
  }
  return poses[poses.length - 1];
}

/** Metros recorridos por el LRV en `t`: arranca y frena suave (smoothstep) entre `desde` y `hasta`. */
export function avanceEn(tramo: Tramo, t: number): number {
  const a = tramo.avance;
  if (!a) return 0;
  const u = Math.min(1, Math.max(0, (t - a.desde) / Math.max(1e-6, a.hasta - a.desde)));
  return a.metros * u * u * (3 - 2 * u);
}
