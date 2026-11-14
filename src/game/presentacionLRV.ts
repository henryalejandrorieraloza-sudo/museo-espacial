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

import type { Guion } from '../audio/guion';
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
/**
 * Silencio (s) entre que termina la voz de un tramo y empieza el siguiente. Un tramo con frase acaba en cuanto
 * termina la voz más esta pausa, sin esperar a su tiempo mínimo (que solo cuenta para los tramos sin voz).
 */
export const PAUSA_ENTRE_FRASES_S = 0.6;

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
  | 'interruptor'
  | 'navegacion'
  | 'trazoCorto'
  | 'trazoLargo'
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
  /** Solo existe si el texto de este idioma tiene esa marca de plano ("{@id}"); con "!id", solo si no la tiene. */
  ancla?: string;
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
  /** En la vista dividida, en qué mitad está la pieza (por defecto, pantalla completa). */
  vista?: 'izquierda' | 'derecha';
  /** Solo existe si el texto de este idioma tiene esa marca de plano ("{@id}"); con "!id", solo si no la tiene. */
  ancla?: string;
}

/** Instante del guion (s nominales del tramo) en que debe empezar la palabra marcada con "{@id}" en el texto. */
export interface Ancla {
  id: string;
  t: number;
}

/** Inclinación de la palanca del mando en T en el instante `t`: −1…1 adelante (+) o atrás (−), y a la derecha (+). */
export interface PoseMando {
  t: number;
  adelante: number;
  lado: number;
  /** Interruptor de marcha atrás del mando: 0 = sin activar, 1 = activado. Por defecto, 0. */
  interruptor?: number;
}

export interface Tramo {
  /** Frase del narrador (clave de es.json), o null para un tramo sin voz. */
  narracion: ClaveTexto | null;
  /**
   * Con voz: duración nominal del guion (s), la que tarda la frase en español. El tiempo real lo manda la voz: el reloj
   * (RelojNarrado) estira o encoge el guion para que su último instante coincida con el final de la frase, en cualquier
   * idioma. Sin voz: duración mínima del tramo.
   */
  minS: number;
  /**
   * Marcas de plano del texto ("{@id}" en es.json y en.json) y su instante en el guion. Todos los tiempos de las tomas,
   * marcas, mando y avance son nominales: el reloj los lleva a la palabra marcada, que en cada idioma está en otro sitio.
   * Una marca que un idioma no tiene se ignora (y con ella, sus tomas y marcas con `ancla`).
   */
  anclas?: readonly Ancla[];
  tomas: readonly Toma[];
  marcas: readonly Marca[];
  /** Tarjeta del peso en la Tierra y en la Luna, de `desde` a `hasta` (s del tramo). */
  tarjetaPeso?: readonly [number, number];
  /** Movimiento de la palanca del mando en T (y del interruptor de marcha atrás). */
  mando?: readonly PoseMando[];
  /** El LRV se mueve según el mando (`movimientoEn`): adelante avanza, a un lado gira, atrás frena o, con el interruptor, retrocede. */
  conduccion?: boolean;
  /** Vista dividida: cámara de la mitad izquierda y de la derecha. Con `conduccion`, la izquierda sigue al LRV y la derecha va con él. */
  division?: { izquierda: readonly Toma[]; derecha: readonly Toma[] };
  /** Trazos sobre el terreno (escena de distancias): cada uno se dibuja entre `[desde, hasta]` (s del tramo). */
  trazos?: { corto: readonly [number, number]; largo: readonly [number, number] };
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
const CONSOLA_Y_MANDO: V3 = [0, 0.96, -0.42];
const CAMARA_TV: V3 = [0.1, 1.2, -1.46];
const BATERIAS: V3 = [0, 0.55, -0.95];
const MYLAR: V3 = [0.05, 0.92, -1.42];
const MANDO: V3 = [0, 0.86, -0.07];
/** Rueda trasera izquierda (ejes del LRV): las ruedas traseras están en z > 0. */
const RUEDA_TI: V3 = [-0.915, 0.41, 1.143];
/** Las dos antenas, en la parte delantera. */
const ANTENAS: V3 = [-0.1, 1.5, -1.35];
/**
 * Punto al que mira la cámara para ver la antena de alta ganancia y, sobre ella, la Tierra. La Tierra está 45.3° sobre el
 * horizonte, a 18.9° a la derecha del frente del LRV (azimut 240.7° contra su rumbo de 221.8°; ver RUMBO_LRV en
 * visual/presentacionLRV.ts). Con la cámara detrás a la izquierda (az −161°), a 5 m y mirando 22° hacia arriba, la
 * antena queda 16° bajo el centro y la Tierra, 23° sobre él.
 */
const HACIA_TIERRA: V3 = [-0.1, 2.9, -1.3];

/** Distancias de la escena "Distancias" (km). Fuentes: NSSDC (NASA), ver el comentario del guion. */
export const DISTANCIA_LRV_KM = 36;
export const DISTANCIA_A_PIE_KM = 3.45;
/** Centro de los trazos en el terreno (ejes del LRV, m): lejos del LRV y de los cráteres. */
export const CENTRO_TRAZOS: V3 = [0, 0, 220];

/**
 * Metros que avanza el LRV en la escena de cierre. Con el perfil de `avanceEn` (smoothstep, pico 1.5 veces la media)
 * en 8 s, la velocidad máxima es 2.6 m/s: por debajo de su máximo de diseño, 6 mph (2.7 m/s).
 */
export const AVANCE_CIERRE_M = 14;

/**
 * Guion de la presentación, en orden. Las capturas de referencia de Henry (tomas de cámara, no imágenes del proyecto)
 * se citan como "ref 46" para la captura_46.png. Objetivo: unos 70 s en total, con fundidos de 0.5 s entre escenas.
 *
 * Cifras (verificadas en NASA; ver SPEC §8.6):
 * - 36 km: NSSDC, 35.9 km conducidos por el LRV del Apolo 17 (SP-4029: 35.7 km).
 * - ~3.45 km: NSSDC, recorrido a pie de la EVA-2 del Apolo 14, la más larga de las misiones sin vehículo (Apolo 11:
 *   unos 250 m). Solo se usa para la proporción del trazo corto; el rótulo no lleva cifra.
 */
export const GUION: readonly EscenaPresentacion[] = [
  {
    // 1. Introducción: plano alto y lejano con el LRV pequeño (ref 06) que se acerca a 3/4 frontal (ref 05, 22) mientras
    // dice el nombre, y órbita lenta mientras habla de los astronautas.
    id: 'introduccion',
    tramos: [
      {
        narracion: 'pres_intro',
        minS: 12,
        anclas: [
          { id: 'nombre', t: 2.1 },
          { id: 'electrico', t: 4.8 },
          { id: 'astronautas', t: 8.4 },
        ],
        tomas: [
          { t: 0, az: -35, el: 40, dist: 22, mira: CENTRO },
          { t: 3.2, az: -42, el: 16, dist: 7.5, mira: CENTRO },
          { t: 6.5, az: -52, el: 13, dist: 6.6, mira: CENTRO },
          { t: 8.8, az: -64, el: 14, dist: 6.2, mira: CENTRO },
          { t: 12, az: -86, el: 17, dist: 7.2, mira: CENTRO },
        ],
        marcas: [{ resalte: 'lrv', rotulo: 'rot_lrv', desde: 3.4, hasta: 9, sinContorno: true, rotuloPx: [0, -150] }],
      },
    ],
  },
  {
    // 2. Peso: la tarjeta de la Tierra y la Luna, con el LRV en órbita lenta detrás.
    id: 'peso',
    tramos: [
      {
        narracion: 'pres_peso',
        minS: 5.7,
        tomas: [
          { t: 0, az: -50, el: 20, dist: 6.8, mira: CENTRO },
          { t: 5.7, az: -36, el: 17, dist: 5.9, mira: CENTRO },
        ],
        marcas: [],
        tarjetaPeso: [0.3, Infinity],
      },
    ],
  },
  {
    // 3. Distancias: por qué existe el LRV. Dos trazos sobre el mismo terreno, visto desde arriba (ref 1 y 2): el corto,
    // a pie (rótulo "Caminando"), mientras habla de caminar, y el largo, que se dibuja más rápido, cuando entra el
    // moon buggy ("Con el LRV: 36 km"). La cámara baja y gira despacio.
    id: 'distancias',
    tramos: [
      {
        narracion: 'pres_distancias',
        minS: 13.4,
        anclas: [{ id: 'buggy', t: 4.6 }],
        tomas: [
          { t: 0, az: 180, el: 55, dist: 150, mira: CENTRO_TRAZOS },
          { t: 13.4, az: 168, el: 60, dist: 142, mira: CENTRO_TRAZOS },
        ],
        trazos: { corto: [0.3, 3.4], largo: [4.9, 8.2] },
        marcas: [
          { resalte: 'trazoCorto', rotulo: 'rot_caminando', desde: 3, hasta: Infinity, sinContorno: true, rotuloPx: [0, -34] },
          { resalte: 'trazoLargo', rotulo: 'rot_con_lrv', desde: 7.6, hasta: Infinity, sinContorno: true, rotuloPx: [0, -34] },
        ],
      },
    ],
  },
  {
    // 4. Chasis: 3/4 frontal (ref 46), acercamiento mientras pregunta cómo meterlo en una nave, giro lento alrededor del
    // LRV con el chasis resaltado y, al final, un plano más abierto.
    id: 'chasis',
    tramos: [
      {
        narracion: 'pres_chasis',
        minS: 15,
        anclas: [
          { id: 'chasis', t: 4.5 },
          { id: 'ingenieria', t: 12.3 },
        ],
        tomas: [
          { t: 0, az: -40, el: 16, dist: 6.6, mira: [0, 0.6, 0] },
          { t: 4.2, az: -58, el: 15, dist: 5.8, mira: [0, 0.6, 0] },
          { t: 9, az: -98, el: 18, dist: 6.0, mira: [0, 0.6, 0] },
          { t: 12.3, az: -118, el: 20, dist: 6.3, mira: [0, 0.6, 0] },
          { t: 15, az: -135, el: 25, dist: 7.6, mira: [0, 0.6, 0] },
        ],
        marcas: [{ resalte: 'chasis', rotulo: 'rot_chasis', desde: 4.7, hasta: Infinity, rotuloPx: [0, -90] }],
      },
    ],
  },
  {
    // 5. Ruedas: 3/4 de la rueda (ref 07, 08), malla (ref 10), chevrones (ref 11, 12) y, si el texto lo dice ("Diseñadas
    // para rodar por otro mundo"), un plano abierto con las cuatro ruedas. El marco interior ya no se rotula: la
    // narración no lo menciona.
    id: 'ruedas',
    tramos: [
      {
        narracion: 'pres_ruedas',
        minS: 13.7,
        anclas: [
          { id: 'malla', t: 3.3 },
          { id: 'chevrones', t: 7.1 },
          { id: 'disenadas', t: 11.1 },
        ],
        tomas: [
          { t: 0, az: -48, el: 16, dist: 2.8, mira: RUEDA_DI },
          { t: 3.3, az: -36, el: 14, dist: 1.7, mira: RUEDA_DI },
          { t: 5.6, az: -33, el: 13, dist: 1.55, mira: RUEDA_DI },
          { t: 7.1, az: -24, el: 10, dist: 1.25, mira: [-0.93, 0.34, -1.48] },
          { t: 9.2, az: -22, el: 10, dist: 1.2, mira: [-0.93, 0.34, -1.49] },
          { t: 11.1, az: -52, el: 17, dist: 5.4, mira: CENTRO, ancla: 'disenadas' },
          { t: 13.7, az: -66, el: 19, dist: 5.8, mira: CENTRO, ancla: 'disenadas' },
          { t: 13.7, az: -19, el: 9, dist: 1.1, mira: [-0.93, 0.34, -1.5], ancla: '!disenadas' },
        ],
        marcas: [
          { resalte: 'ruedas', rotulo: 'rot_ruedas', desde: 0.3, hasta: 3.4, rotuloPx: [0, -170] },
          { resalte: 'malla', rotulo: 'rot_malla', desde: 3.5, hasta: 7.2, rotuloPx: [0, -190] },
          { resalte: 'chevrones', rotulo: 'rot_chevrones', desde: 7.4, hasta: 10.9, rotuloPx: [160, 140], ancla: 'disenadas' },
          { resalte: 'chevrones', rotulo: 'rot_chevrones', desde: 7.4, hasta: Infinity, rotuloPx: [160, 140], ancla: '!disenadas' },
          { resalte: 'ruedas', rotulo: 'rot_ruedas', desde: 11.3, hasta: Infinity, rotuloPx: [0, -170], ancla: 'disenadas' },
        ],
      },
    ],
  },
  {
    // 6. Electrónica y navegación: consola desde detrás de los asientos (ref 49); la navegación, en la misma toma y con
    // un giro a la rueda trasera izquierda cuando habla de las vueltas de las ruedas; cámara de TV (ref 50), antena
    // (ref 51) y, al decir que las señales viajan a la Tierra, la antena de alta ganancia con la Tierra en el cielo.
    // El mando no se rotula aquí: la narración no lo menciona.
    id: 'electronica',
    tramos: [
      {
        narracion: 'pres_consola',
        minS: 4,
        tomas: [
          { t: 0, az: -150, el: 34, dist: 2.4, mira: CONSOLA_Y_MANDO },
          { t: 4, az: -170, el: 29, dist: 1.75, mira: CONSOLA_Y_MANDO },
        ],
        marcas: [{ resalte: 'consola', rotulo: 'rot_consola', desde: 0.4, hasta: Infinity, rotuloPx: [0, -150] }],
      },
      {
        // Empieza donde terminó el tramo anterior.
        narracion: 'pres_navegacion',
        minS: 8.4,
        anclas: [
          { id: 'nav', t: 2.8 },
          { id: 'vueltas', t: 4.3 },
        ],
        tomas: [
          { t: 0, az: -170, el: 29, dist: 1.75, mira: CONSOLA_Y_MANDO },
          { t: 2.7, az: -173, el: 28, dist: 1.7, mira: CONSOLA_Y_MANDO },
          { t: 4.3, az: -130, el: 12, dist: 2.2, mira: RUEDA_TI },
          { t: 8.4, az: -110, el: 10, dist: 2, mira: RUEDA_TI },
        ],
        marcas: [
          { resalte: 'navegacion', rotulo: 'rot_navegacion', desde: 2.9, hasta: 4.5, rotuloPx: [0, -110] },
          { resalte: 'ruedas', rotulo: 'rot_ruedas', desde: 4.4, hasta: Infinity, rotuloPx: [0, -130] },
        ],
      },
      {
        narracion: 'pres_comunicaciones',
        minS: 10,
        anclas: [
          { id: 'camara', t: 1.1 },
          { id: 'antenas', t: 3 },
          { id: 'tierra', t: 6 },
        ],
        tomas: [
          { t: 2, az: -55, el: 22, dist: 1.9, mira: CAMARA_TV },
          { t: 3.6, az: -85, el: 12, dist: 3.3, mira: ANTENAS, fov: 50 },
          { t: 4.2, az: -90, el: 11, dist: 3.4, mira: ANTENAS, fov: 50 },
          { t: 6, az: -161, el: -22, dist: 5, mira: HACIA_TIERRA, fov: 55 },
          { t: 10, az: -172, el: -20, dist: 5.4, mira: HACIA_TIERRA, fov: 55 },
        ],
        marcas: [
          { resalte: 'camaraTV', rotulo: 'rot_camara', desde: 1.8, hasta: 3.6, rotuloPx: [0, -120] },
          { resalte: 'antenaAlta', rotulo: 'rot_antena_alta', desde: 3.9, hasta: Infinity, rotuloPx: [0, -130] },
          { resalte: 'antenaBaja', rotulo: 'rot_antena_baja', desde: 4.2, hasta: 6.3, rotuloPx: [0, -90] },
        ],
      },
    ],
  },
  {
    // 7. Energía: plano abierto del LRV mientras pregunta dónde se recarga (solo en español), vista desde arriba de la
    // sección delantera con las baterías resaltadas (ref 39) y, al llegar al "Mylar", la cubierta dorada (ref 53). En el
    // LRV las baterías iban en el chasis delantero (NSSDC), no en la plataforma trasera.
    id: 'energia',
    tramos: [
      {
        narracion: 'pres_energia',
        minS: 17.4,
        anclas: [
          { id: 'recarga', t: 0 },
          { id: 'baterias', t: 6.1 },
          { id: 'mylar', t: 9.9 },
        ],
        tomas: [
          { t: 0, az: -55, el: 52, dist: 2.7, mira: BATERIAS, ancla: '!recarga' },
          { t: 0, az: -130, el: 18, dist: 9.5, mira: CENTRO, ancla: 'recarga' },
          { t: 4.2, az: -20, el: 34, dist: 6, mira: [0, 0.55, -0.5], ancla: 'recarga' },
          { t: 6.5, az: -55, el: 52, dist: 2.7, mira: BATERIAS },
          { t: 7.8, az: -52, el: 56, dist: 2.4, mira: BATERIAS },
          { t: 9.9, az: -38, el: 14, dist: 1.7, mira: MYLAR },
          { t: 17.4, az: -46, el: 15, dist: 1.5, mira: MYLAR },
        ],
        marcas: [
          { resalte: 'baterias', rotulo: 'rot_baterias', desde: 6.4, hasta: 9.8, rotuloPx: [0, -120] },
          { resalte: 'mylar', rotulo: 'rot_mylar', desde: 10.1, hasta: Infinity, rotuloPx: [-200, 0] },
        ],
      },
    ],
  },
  {
    // 8. Mando y movimiento, en vista dividida como en las referencias (ref 3 a 7): a la izquierda, el LRV visto desde
    // arriba, que se mueve según el mando; a la derecha, el primer plano del mando, que se ve moverse. Cada movimiento
    // empieza cuando la voz lo dice ("hacia adelante", "a los lados", "hacia atrás", "un interruptor", "mueves la
    // palanca hacia atrás").
    id: 'mando',
    tramos: [
      {
        narracion: 'pres_mando_movimientos',
        minS: 16.6,
        anclas: [
          { id: 'palanca', t: 2.5 },
          { id: 'adelante', t: 5.7 },
          { id: 'lados', t: 7.7 },
          { id: 'atras', t: 9.2 },
          { id: 'marcha', t: 11 },
          { id: 'interruptor', t: 12.7 },
          { id: 'reversa', t: 14.4 },
        ],
        // Cámara izquierda: casi cenital, baja despacio y sigue al LRV sin girar (sin pasar de 80° para que el "arriba" de la
        // imagen no cambie). Derecha: primer plano del mando, va con el LRV y gira despacio.
        tomas: [],
        division: {
          izquierda: [
            { t: 0, az: 180, el: 84, dist: 9.5, mira: [0, 0.5, 0] },
            { t: 16.6, az: 180, el: 87, dist: 7, mira: [0, 0.5, 0] },
          ],
          derecha: [
            { t: 0, az: -150, el: 28, dist: 0.8, mira: MANDO },
            { t: 16.6, az: -134, el: 25, dist: 0.72, mira: MANDO },
          ],
        },
        conduccion: true,
        // Adelante, a un lado (se inclina también un poco hacia delante: el LRV gira rodando), atrás sin interruptor =
        // frena y, tras el clic del interruptor, atrás = marcha atrás.
        mando: [
          { t: 5.4, adelante: 0, lado: 0 },
          { t: 6.1, adelante: 1, lado: 0 },
          { t: 7.3, adelante: 1, lado: 0 },
          { t: 7.9, adelante: 0.6, lado: 0 },
          { t: 8.5, adelante: 0.6, lado: 1 },
          { t: 9, adelante: 0.6, lado: 1 },
          { t: 9.6, adelante: 0, lado: 0 },
          { t: 10, adelante: -1, lado: 0 },
          { t: 10.8, adelante: -1, lado: 0 },
          { t: 11.3, adelante: 0, lado: 0 },
          { t: 13, adelante: 0, lado: 0, interruptor: 0 },
          { t: 13.4, adelante: 0, lado: 0, interruptor: 1 },
          { t: 14.4, adelante: 0, lado: 0, interruptor: 1 },
          { t: 14.9, adelante: -1, lado: 0, interruptor: 1 },
          { t: 16.1, adelante: -1, lado: 0, interruptor: 1 },
          { t: 16.6, adelante: 0, lado: 0, interruptor: 1 },
        ],
        marcas: [
          { resalte: 'mando', rotulo: 'rot_mando', desde: 2.7, hasta: 5.4, rotuloPx: [0, -150], vista: 'derecha', ancla: 'palanca' },
          { resalte: 'mando', rotulo: 'rot_adelante', desde: 5.8, hasta: 7.6, rotuloPx: [0, -150], vista: 'derecha' },
          { resalte: 'mando', rotulo: 'rot_lado', desde: 7.9, hasta: 9.1, rotuloPx: [0, -150], vista: 'derecha' },
          { resalte: 'mando', rotulo: 'rot_atras', desde: 9.4, hasta: 11, rotuloPx: [0, -150], vista: 'derecha' },
          { resalte: 'interruptor', rotulo: null, desde: 11.2, hasta: 14.3, vista: 'derecha' },
          { resalte: 'mando', rotulo: 'rot_marcha_atras', desde: 13, hasta: Infinity, rotuloPx: [0, -150], sinContorno: true, vista: 'derecha' },
        ],
      },
    ],
  },
  {
    // 9. Cierre: el LRV avanza por el terreno (ref 19, 20) hasta el borde del cráter Shorty, con la zona del suelo
    // naranja marcada cuando la voz la nombra, y la cámara se abre hasta un plano de revelación con el LRV entero y el
    // terreno. Ese plano es el primero de "Estás listo" (TRAMO_LISTO): la cámara no se detiene entre uno y otro.
    id: 'cierre',
    tramos: [
      {
        narracion: 'pres_cierre',
        minS: 9.4,
        anclas: [{ id: 'suelo', t: 4.1 }],
        tomas: [
          { t: 0, az: -120, el: 10, dist: 8, mira: [0, 0.6, -0.5] },
          { t: 4.4, az: -108, el: 12, dist: 8.5, mira: [0, 0.6, -1] },
          { t: 8.2, az: -155, el: 30, dist: 13, mira: [0.2, 0.5, -2.6] },
          { t: 9.4, az: -160, el: 32, dist: 13.6, mira: [0.2, 0.5, -2.6] },
        ],
        avance: { desde: 0.4, hasta: 8.4, metros: AVANCE_CIERRE_M },
        camaraSigueLRV: true,
        marcas: [{ resalte: 'sueloNaranja', rotulo: 'rot_suelo_naranja', desde: 4.3, hasta: Infinity, rotuloPx: [0, -90] }],
      },
    ],
  },
];

/**
 * "Estás listo para la misión": la imagen de fondo de la última frase y de la espera posterior. Sigue desde el plano de
 * revelación del cierre (LRV ya en el borde del cráter) con una órbita lenta, para que la cámara no pare mientras habla.
 * Si se llega por Enter, la escena salta directamente a este plano: es el estado final de la animación.
 */
export const TRAMO_LISTO: Tramo = {
  narracion: 'pres_listo',
  minS: 12,
  tomas: [
    { t: 0, az: -160, el: 32, dist: 13.6, mira: [0.2, 0.5, -2.6] },
    { t: 5, az: -176, el: 29, dist: 14.6, mira: [0.2, 0.5, -2.6] },
    { t: 12, az: -204, el: 26, dist: 16, mira: [0.2, 0.5, -2.6] },
  ],
  marcas: [],
  avance: { desde: 0, hasta: 0.001, metros: AVANCE_CIERRE_M },
  camaraSigueLRV: true,
};

// ---------------------------------------------------------------------------
// Reloj narrado: lleva el guion (tiempos nominales) a la voz real, en cualquier idioma
// ---------------------------------------------------------------------------

/** Lo que el reloj necesita saber del texto que se dice en un tramo, en el idioma activo. */
export interface InfoNarracion {
  /** Caracteres del texto limpio (el que se ve en los subtítulos). */
  largo: number;
  /** Marcas de plano ("{@id}") del texto: posición (caracteres) y, con audio grabado, segundo del audio en que suenan. */
  planos: readonly { id: string; pos: number; s?: number }[];
  /** Con audio grabado: segundo del audio en que termina la última palabra. */
  finS?: number;
}

/** Info de un texto ya analizado. `tiempos` (audio grabado): inicio de cada palabra y fin de la línea, en segundos. */
export function infoNarracion(guion: Guion, tiempos?: { inicios: readonly number[]; fin: number }): InfoNarracion {
  const planos: { id: string; pos: number; s?: number }[] = [];
  guion.palabras.forEach((p, i) => {
    for (const id of p.planos) planos.push({ id, pos: p.inicio, s: tiempos?.inicios[i] });
  });
  return { largo: guion.texto.length, planos, finS: tiempos?.fin };
}

/** Ritmo inicial de la voz (s por carácter): el mismo que usa la voz sin síntesis (audio/voz.ts, 15 caracteres por segundo). */
export const RITMO_INICIAL_S_POR_CARACTER = 1 / 15;
const RITMO_MINIMO = 0.035;
const RITMO_MAXIMO = 0.14;
/** Lo que tarda en sonar la primera palabra desde que empieza el tramo, mientras no se sepa (s). */
export const LATENCIA_VOZ_S = 0.4;
/** Una marca que no llega pasado este margen sobre lo previsto se da por llegada (la voz perdió ese evento). */
export const TOLERANCIA_MARCA_S = 1.2;
/** Constante de tiempo (s) con que el guion sigue a su objetivo: sin saltos al corregir una previsión. */
export const SUAVIZADO_RELOJ_S = 0.3;
/** Una marca en los primeros caracteres no deja tiempo para su preludio: el guion empieza ya en ella. */
const POS_SIN_PRELUDIO = 8;
/** Mientras la voz siga, el final previsto del tramo no está nunca a menos de tanto del instante actual (s). */
const PRORROGA_FINAL_S = 1.2;
/** Mínimo de caracteres entre dos marcas para fiarse de lo medido. */
const MIN_CARACTERES_MEDIDA = 12;

/** Ritmo de la voz medido (s por carácter), compartido por todos los tramos y recalibrado con cada frase. */
export interface RitmoVoz {
  segPorCaracter: number;
}

/** Tramo con solo lo que existe en este idioma: sin las tomas y marcas atadas a una marca de plano que el texto no tiene. */
export function tramoParaIdioma(tramo: Tramo, activas: ReadonlySet<string>): Tramo {
  const existe = (a: string | undefined): boolean => a === undefined || (a.startsWith('!') ? !activas.has(a.slice(1)) : activas.has(a));
  return { ...tramo, tomas: tramo.tomas.filter((x) => existe(x.ancla)), marcas: tramo.marcas.filter((m) => existe(m.ancla)) };
}

/**
 * Convierte el tiempo real de un tramo en tiempo nominal del guion (`nu`). Cada marca de plano que sonó fija en su
 * instante nominal el instante real en que la voz dijo esa palabra; las que aún no han sonado se prevén con el ritmo de
 * la voz (caracteres por segundo, medido en las frases anteriores). La última, el fin de la frase, lleva el último
 * instante del guion. Así cada toma de cámara cae en su palabra y el movimiento termina con la frase, aunque en inglés
 * las palabras estén en otro sitio y la voz tarde otro tanto. Si el audio está grabado, sus tiempos mandan.
 */
export class RelojNarrado {
  /** Instante nominal actual (s del guion). */
  nu = 0;
  private readonly anclas: { id: string; tNominal: number; pos: number; s?: number }[] = [];
  private readonly disparos = new Map<string, number>();
  private t0Voz = LATENCIA_VOZ_S;
  private vozVista = false;
  private vozFin: number | null = null;
  private readonly nuInicio: number;
  private readonly tramo: Tramo;
  private readonly info: InfoNarracion | null;
  private readonly ritmo: RitmoVoz;

  constructor(tramo: Tramo, info: InfoNarracion | null, ritmo: RitmoVoz) {
    this.tramo = tramo;
    this.info = info;
    this.ritmo = ritmo;
    if (info) {
      let posPrevia = -1;
      for (const a of [...(tramo.anclas ?? [])].sort((x, y) => x.t - y.t)) {
        const marca = info.planos.find((p) => p.id === a.id);
        // Solo las que están en el texto, en el mismo orden que en el guion.
        if (!marca || marca.pos < posPrevia) continue;
        posPrevia = marca.pos;
        this.anclas.push({ id: a.id, tNominal: a.t, pos: marca.pos, s: marca.s });
      }
    }
    // Si la primera marca suena nada más empezar, el guion arranca en ella (se salta lo que iba antes). Salvo que el tramo
    // empiece con una entrada desde la cámara anterior: saltársela sería un corte a medio movimiento.
    const entraDesdeAntes = tramo.tomas.length > 0 && tramo.tomas[0].t > 0;
    this.nuInicio = this.anclas.length > 0 && this.anclas[0].pos < POS_SIN_PRELUDIO && !entraDesdeAntes ? this.anclas[0].tNominal : 0;
    this.nu = this.nuInicio;
  }

  /** Marcas del texto que tienen toma o marca en el guion. */
  get activas(): ReadonlySet<string> {
    return new Set(this.anclas.map((a) => a.id));
  }

  /** La voz empezó a sonar (primera frase): desde aquí se cuentan los tiempos del texto. */
  vozEmpezo(t: number): void {
    if (this.vozVista) return;
    this.vozVista = true;
    this.t0Voz = t;
  }

  /** La palabra marcada con `id` acaba de empezar a sonar. */
  planoDicho(id: string, t: number): void {
    const ancla = this.anclas.find((a) => a.id === id);
    if (!ancla || this.disparos.has(id)) return;
    const base = this.base(ancla.pos);
    this.medir(t - base.t, ancla.pos - base.pos);
    this.disparos.set(id, t);
  }

  /** Terminó la voz de la frase entera. */
  vozTerminada(t: number): void {
    if (this.vozFin !== null) return;
    const base = this.base(Infinity);
    if (this.info) this.medir(t - base.t, this.info.largo - base.pos);
    this.vozFin = t;
  }

  /** Último punto conocido (instante real y posición en el texto) antes de `pos`: una marca dicha o el inicio de la voz. */
  private base(pos: number): { t: number; pos: number } {
    let mejor = { t: this.t0Voz, pos: 0 };
    for (const a of this.anclas) {
      const d = this.disparos.get(a.id);
      if (d !== undefined && a.pos < pos && a.pos >= mejor.pos) mejor = { t: d, pos: a.pos };
    }
    return mejor;
  }

  private medir(segundos: number, caracteres: number): void {
    if (caracteres < MIN_CARACTERES_MEDIDA || segundos <= 0) return;
    const medida = segundos / caracteres;
    this.ritmo.segPorCaracter = Math.min(RITMO_MAXIMO, Math.max(RITMO_MINIMO, this.ritmo.segPorCaracter * 0.6 + medida * 0.4));
  }

  /** Avanza el reloj `dt` s hasta el instante real `t` del tramo. */
  actualizar(dt: number, t: number): void {
    if (!this.info) {
      this.nu = t;
      return;
    }
    const info = this.info;
    const spc = this.ritmo.segPorCaracter;
    const puntos: { r: number; n: number }[] = [{ r: 0, n: this.nuInicio }];
    let baseT = this.t0Voz;
    let basePos = 0;
    let tope = Infinity;
    for (const a of this.anclas) {
      let disparo = this.disparos.get(a.id);
      if (disparo === undefined && this.vozFin !== null) {
        disparo = this.vozFin;
        this.disparos.set(a.id, disparo);
      }
      let r: number;
      if (disparo !== undefined) {
        r = disparo;
        baseT = disparo;
        basePos = a.pos;
      } else {
        r = a.s !== undefined ? this.t0Voz + a.s : baseT + (a.pos - basePos) * spc;
        // La marca no llegó cuando tocaba: el guion espera justo antes de ella; pasada la tolerancia, sigue sin ella.
        if (t > r + TOLERANCIA_MARCA_S) {
          this.disparos.set(a.id, t);
          r = t;
          baseT = t;
          basePos = a.pos;
        } else if (tope === Infinity) {
          tope = a.tNominal - 0.05;
        }
      }
      puntos.push({ r: Math.max(r, puntos[puntos.length - 1].r), n: a.tNominal });
    }
    let finPrevisto =
      this.vozFin ?? (info.finS !== undefined ? this.t0Voz + info.finS : baseT + Math.max(0, info.largo - basePos) * spc);
    // Si la voz sigue cuando el guion creía que ya acababa, el final se aleja: el movimiento se frena poco a poco, sin
    // pararse del todo, hasta que la voz termina de verdad.
    if (this.vozFin === null) finPrevisto = Math.max(finPrevisto, t + PRORROGA_FINAL_S);
    puntos.push({ r: Math.max(finPrevisto, puntos[puntos.length - 1].r + 0.05), n: Math.max(this.tramo.minS, puntos[puntos.length - 1].n) });

    // Objetivo en el instante real de ahora más el retraso del suavizado, para que el guion llegue a su palabra a tiempo.
    const x = t + SUAVIZADO_RELOJ_S;
    let objetivo = puntos[puntos.length - 1].n;
    for (let i = 1; i < puntos.length; i++) {
      if (x > puntos[i].r) continue;
      const a = puntos[i - 1];
      const b = puntos[i];
      objetivo = a.n + ((b.n - a.n) * (x - a.r)) / Math.max(1e-6, b.r - a.r);
      break;
    }
    objetivo = Math.min(objetivo, tope);
    // Sin saltos ni vueltas atrás: el guion se acerca a su objetivo.
    const siguiente = this.nu + (objetivo - this.nu) * (1 - Math.exp(-Math.max(0, dt) / SUAVIZADO_RELOJ_S));
    this.nu = Math.max(this.nu, siguiente);
  }
}

/**
 * Movimiento lento de fondo de la cámara (siempre activo): un balanceo suave de azimut, elevación y distancia, para que
 * la escena respire aun cuando el plano no se mueva. Empieza en cero y no depende del plano.
 */
export function movimientoAmbiente(tS: number): { az: number; el: number; distRel: number } {
  const w = 2 * Math.PI;
  return {
    az: 1.8 * Math.sin((w * tS) / 11) + 0.7 * Math.sin((w * tS) / 5.3 + 1.1) - 0.7 * Math.sin(1.1),
    el: 0.9 * Math.sin((w * tS) / 9 + 0.6) - 0.9 * Math.sin(0.6),
    distRel: 1 + 0.012 * Math.sin((w * tS) / 13 + 2) - 0.012 * Math.sin(2),
  };
}

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
  /** Instante (s del tramo) en que terminó la voz del tramo actual; null mientras no haya terminado. */
  private tVozFin: number | null = null;
  private eventos: EventoPresentacion[] = [];
  private readonly guion: readonly EscenaPresentacion[];
  /** Ritmo de la voz medido en las frases ya dichas (se aprende solo, por idioma y por voz). */
  private readonly ritmo: RitmoVoz = { segPorCaracter: RITMO_INICIAL_S_POR_CARACTER };
  /** Reloj del tramo actual: pasa el tiempo real al del guion. */
  private reloj: RelojNarrado | null = null;
  /** El tramo actual sin lo que no existe en este idioma (ver tramoParaIdioma). */
  private tramoIdioma: Tramo | null = null;

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
  /** El tramo que se ve ahora, con solo lo que existe en el idioma activo. En "Estás listo", su plano de revelación. */
  get tramoActual(): Tramo | null {
    if (this.faseActual === 'listo' || this.faseActual === 'terminada') return TRAMO_LISTO;
    return this.tramoIdioma;
  }
  /** Tiempo del guion (s nominales del tramo) al que corresponde ahora la imagen: tomas, marcas, mando y avance van con él. */
  get tiempoNominal(): number {
    return this.reloj && this.faseActual !== 'listo' ? this.reloj.nu : this.t;
  }
  /** Ritmo de la voz medido hasta ahora (s por carácter). */
  get segundosPorCaracter(): number {
    return this.ritmo.segPorCaracter;
  }
  private get tramoGuion(): Tramo | null {
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
    this.tVozFin = this.t;
    this.reloj?.vozTerminada(this.t);
  }

  /**
   * Dice qué texto va a sonar en el tramo actual (en el idioma activo): dónde están sus marcas de plano y cuánto mide. Sin
   * esto, el tiempo del guion es el real. Hay que llamarlo al empezar el tramo, antes de dar paso a la voz.
   */
  fijarNarracion(info: InfoNarracion): void {
    const tramo = this.tramoGuion;
    if (!tramo || this.faseActual !== 'tramo') return;
    const reloj = new RelojNarrado(tramo, info, this.ritmo);
    this.reloj = reloj;
    this.tramoIdioma = tramoParaIdioma(tramo, reloj.activas);
    reloj.actualizar(0, this.t);
  }

  /** La primera frase del tramo empezó a sonar. */
  vozEmpezo(): void {
    if (this.faseActual === 'tramo') this.reloj?.vozEmpezo(this.t);
  }

  /** La voz llegó a la palabra marcada con `{@id}` en el texto del tramo. */
  planoDicho(id: string): void {
    if (this.faseActual === 'tramo') this.reloj?.planoDicho(id, this.t);
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
        this.reloj?.actualizar(dt, this.t);
        const tramo = this.tramoGuion;
        if (!tramo) break;
        // Con frase, el tramo acaba PAUSA_ENTRE_FRASES_S después de la voz; si la voz nunca avisa, pasa MARGEN_VOZ_S tras su tiempo mínimo.
        const listo = tramo.narracion
          ? this.tVozFin !== null
            ? this.t >= this.tVozFin + PAUSA_ENTRE_FRASES_S
            : this.t >= tramo.minS + MARGEN_VOZ_S
          : this.t >= tramo.minS;
        if (!listo) break;
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
        this.reloj?.actualizar(dt, this.t);
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
    const actual = this.tramoGuion;
    this.vozPendiente = actual?.narracion != null;
    this.tVozFin = null;
    // Mientras no se sepa qué texto suena, vale todo el guion y el tiempo del guion es el real.
    this.reloj = actual ? new RelojNarrado(actual, null, this.ritmo) : null;
    this.tramoIdioma = actual ? tramoParaIdioma(actual, new Set((actual.anclas ?? []).map((a) => a.id))) : null;
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
 * Pose de la cámara en el instante `t` de un tramo. Cada magnitud (azimut, elevación, distancia, punto de mira y campo
 * de visión) pasa por las tomas con una curva cúbica monótona (Fritsch–Carlson): suave, sin rebotes y sin parar en cada
 * toma, solo frenando y arrancando donde el movimiento cambia de sentido, al principio y al final (ease-in-out). Si la
 * primera toma empieza después de 0, la cámara sale de `previa` (la pose en que quedó el tramo anterior). Pasada la
 * última, se queda en ella. El azimut va por el camino corto.
 */
export function poseEn(tomas: readonly Toma[], t: number, previa: Toma | null): Toma {
  const lista = previa && tomas.length > 0 && tomas[0].t > 0 ? [{ ...previa, t: 0 }, ...tomas] : tomas;
  if (lista.length === 0) return previa ?? { t: 0, az: 0, el: 20, dist: 6, mira: CENTRO };
  if (t <= lista[0].t) return lista[0];
  const n = lista.length;
  if (t >= lista[n - 1].t) return lista[n - 1];
  let i = 1;
  while (i < n - 1 && t > lista[i].t) i++;
  const a = lista[i - 1];
  const b = lista[i];
  const h = Math.max(1e-6, b.t - a.t);
  const u = (t - a.t) / h;
  const u2 = u * u;
  const u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1;
  const h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 = u3 - u2;
  // Valor de una magnitud en las tomas i-2 … i+1 (el azimut, desenrollado por el camino corto desde la primera).
  const valor = (k: number, campo: (x: Toma) => number): number => campo(lista[Math.min(n - 1, Math.max(0, k))]);
  const evaluar = (campo: (x: Toma) => number, enrollado = false): number => {
    const ys: number[] = [];
    for (let k = 0; k < n; k++) {
      let y = valor(k, campo);
      if (enrollado && k > 0) {
        const d = ((((y - lista[k - 1].az + 180) % 360) + 360) % 360) - 180;
        y = ys[k - 1] + d;
      }
      ys.push(y);
    }
    const pendiente = (k: number): number => (ys[k + 1] - ys[k]) / Math.max(1e-6, lista[k + 1].t - lista[k].t);
    // Tangente de la toma k: 0 en los extremos y donde cambia el sentido; si no, media armónica ponderada de las dos pendientes.
    const tangente = (k: number): number => {
      if (k === 0 || k === n - 1) return 0;
      const d0 = pendiente(k - 1);
      const d1 = pendiente(k);
      if (d0 * d1 <= 0) return 0;
      const h0 = lista[k].t - lista[k - 1].t;
      const h1 = lista[k + 1].t - lista[k].t;
      const w1 = 2 * h1 + h0;
      const w2 = h1 + 2 * h0;
      return (w1 + w2) / (w1 / d0 + w2 / d1);
    };
    return h00 * ys[i - 1] + h10 * h * tangente(i - 1) + h01 * ys[i] + h11 * h * tangente(i);
  };
  return {
    t,
    az: evaluar((x) => x.az, true),
    el: evaluar((x) => x.el),
    dist: evaluar((x) => x.dist),
    mira: [evaluar((x) => x.mira[0]), evaluar((x) => x.mira[1]), evaluar((x) => x.mira[2])],
    fov: evaluar((x) => x.fov ?? CAMPO_VISION),
  };
}

/** Opacidad (0–1) de una marca en el instante `t` del tramo: entra y sale en FUNDIDO_MARCA_S. */
export const FUNDIDO_MARCA_S = 0.5;
export function opacidadMarca(m: Marca, t: number): number {
  if (t < m.desde || t > m.hasta) return 0;
  const entrada = (t - m.desde) / FUNDIDO_MARCA_S;
  const salida = Number.isFinite(m.hasta) ? (m.hasta - t) / FUNDIDO_MARCA_S : 1;
  return suavizar(Math.min(1, entrada, salida));
}

/** Inclinación de la palanca del mando en `t` y estado del interruptor de marcha atrás (interpolados con ease-in-out entre poses). */
export function mandoEn(poses: readonly PoseMando[] | undefined, t: number): { adelante: number; lado: number; interruptor: number } {
  if (!poses || poses.length === 0) return { adelante: 0, lado: 0, interruptor: 0 };
  const completa = (p: PoseMando): { adelante: number; lado: number; interruptor: number } => ({
    adelante: p.adelante,
    lado: p.lado,
    interruptor: p.interruptor ?? 0,
  });
  if (t <= poses[0].t) return completa(poses[0]);
  for (let i = 1; i < poses.length; i++) {
    const b = poses[i];
    if (t > b.t) continue;
    const a = completa(poses[i - 1]);
    const c = completa(b);
    const u = suavizar((t - poses[i - 1].t) / Math.max(1e-6, b.t - poses[i - 1].t));
    return {
      adelante: a.adelante + (c.adelante - a.adelante) * u,
      lado: a.lado + (c.lado - a.lado) * u,
      interruptor: a.interruptor + (c.interruptor - a.interruptor) * u,
    };
  }
  return completa(poses[poses.length - 1]);
}

/** Velocidad máxima hacia delante en la escena del mando (m/s): por debajo del máximo de diseño del LRV (2.7 m/s). */
export const VELOCIDAD_ADELANTE_MS = 1.6;
/** Velocidad máxima de marcha atrás (m/s): se va más despacio. */
export const VELOCIDAD_ATRAS_MS = 0.9;
export const ACELERACION_MS2 = 1.1;
export const FRENADA_MS2 = 3;
/** Radio de giro mínimo del LRV: 3.1 m (NSSDC, con dirección en las cuatro ruedas). */
export const RADIO_GIRO_M = 3.1;
/** Ángulo de dirección de las ruedas con el mando del todo a un lado (°). */
export const DIRECCION_MAX_GRADOS = 20;

/** Estado del LRV en la escena del mando: posición (m, ejes del LRV en su salida), rumbo (rad, + = a la izquierda) y velocidad (m/s, − = marcha atrás). */
export interface MovimientoLRV {
  x: number;
  z: number;
  rumbo: number;
  v: number;
  /** Dirección de las ruedas (°, + = derecha). */
  direccionGrados: number;
}

/**
 * Dónde está el LRV en `t` si lo conduce el mando de `poses`: adelante acelera, a un lado gira (con el radio de giro del
 * LRV), atrás sin el interruptor frena y atrás con el interruptor va marcha atrás. Se integra desde 0 a pasos fijos,
 * así el resultado depende solo de `t` (no de cuántos fotogramas haya habido).
 */
export function movimientoEn(poses: readonly PoseMando[] | undefined, t: number, paso = 1 / 60): MovimientoLRV {
  let x = 0;
  let z = 0;
  let rumbo = 0;
  let v = 0;
  const fin = Math.max(0, t);
  for (let tk = 0; tk < fin; tk += paso) {
    const dt = Math.min(paso, fin - tk);
    const m = mandoEn(poses, tk + dt / 2);
    let objetivo = 0;
    if (m.adelante > 0) objetivo = m.adelante * VELOCIDAD_ADELANTE_MS;
    else if (m.adelante < 0 && m.interruptor > 0.5) objetivo = m.adelante * VELOCIDAD_ATRAS_MS;
    const frenando = Math.abs(objetivo) < Math.abs(v) || objetivo * v < 0;
    const tasa = (frenando ? FRENADA_MS2 : ACELERACION_MS2) * dt;
    v += Math.min(tasa, Math.max(-tasa, objetivo - v));
    // Hacia la derecha el rumbo baja (el frente es −Z y un giro positivo lo lleva hacia −X).
    rumbo -= (v * m.lado * dt) / RADIO_GIRO_M;
    x -= Math.sin(rumbo) * v * dt;
    z -= Math.cos(rumbo) * v * dt;
  }
  const m = mandoEn(poses, fin);
  return { x, z, rumbo, v, direccionGrados: m.lado * DIRECCION_MAX_GRADOS };
}

/** Metros recorridos por el LRV en `t`: arranca y frena suave (smoothstep) entre `desde` y `hasta`. */
export function avanceEn(tramo: Tramo, t: number): number {
  const a = tramo.avance;
  if (!a) return 0;
  const u = Math.min(1, Math.max(0, (t - a.desde) / Math.max(1e-6, a.hasta - a.desde)));
  return a.metros * u * u * (3 - 2 * u);
}
