// Fuente de entrada por cámara (gestos): webcam + MediaPipe. Encuadre y calibración (SPEC 2.1 y 3),
// y traducción de cada fotograma a la lectura común (fuente.ts): cabeza, rodillas, aplauso, señalar,
// pellizco, volante, golpe y agarre. La lógica es la misma que antes vivía en juego.ts.

import { checkFraming, type FramingStatus } from '../tracking/framing';
import {
  aplauso,
  aplausoEstadoInicial,
  pellizco,
  pellizcoDoble,
  pellizcoDobleEstadoInicial,
  volante,
  type AplausoEstado,
  type PellizcoDobleEstado,
} from '../tracking/gestures';
import {
  HAND_IDX,
  LegAlternationCounter,
  SWING_PCT_DEFAULT,
  headPitchDeg,
  headRollDeg,
  legSample,
  shoulderWidthPx,
} from '../tracking/metrics';
import { Tracker, type TrackingFrame } from '../tracking/tracker';
import { abrirWebcam, cerrarWebcam } from '../tracking/camara';
import { Caminata } from '../game/caminata';
import { Calibrador, cargarCalibracion, guardarCalibracion, type Calibracion } from '../game/calibracion';
import { CursorSuavizado, puntaACursor } from '../game/cursor';
import { cabeceoCabeza, direccionSenalar, giroCabeza } from '../game/gestos';
import type { Opciones } from '../game/opciones';
import { descargarCaptura } from '../ui/captura';
import { t } from '../i18n';
import { enCampoDeTexto, lecturaVacia, type FuenteEntrada, type LecturaEntrada, type Senal } from './fuente';

/** Si el último fotograma es más viejo que esto (s), el movimiento se congela y las manos se ocultan (SPEC 6). */
const FRESCO_S = 0.5;
/** Tiempo máximo (s) que cuenta un fotograma para el giro y la caminata, para no saltar tras una pausa. */
const DT_MAX_S = 0.1;

export class FuenteCamara implements FuenteEntrada {
  readonly modo = 'camara' as const;

  private calibracion: Calibracion | null = cargarCalibracion();
  private readonly calibrador = new Calibrador();
  private readonly piernas = new LegAlternationCounter(SWING_PCT_DEFAULT);
  private readonly caminata = new Caminata();
  private readonly cursorSuavizado = new CursorSuavizado();
  /** Si el pellizco de la mano que señala estaba cerrado en el fotograma anterior. */
  private pellizcoCerrado = false;
  private pasosVistos = 0;
  private aplausoEstado: AplausoEstado = aplausoEstadoInicial;
  /** Pellizco sostenido con las dos manos: bajarse del LRV. */
  private pellizcoDobleEstado: PellizcoDobleEstado = pellizcoDobleEstadoInicial;
  private ultimoFrescoS: number | null = null;
  private ultimoDatoS = Number.NEGATIVE_INFINITY;
  /** Última posición (px) y tiempo de cada muñeca, para medir la velocidad de golpe (SPEC 8.3). */
  private readonly munecasPrevias: Partial<Record<'Left' | 'Right', { y: number; ahoraS: number }>> = {};
  /** Pellizco cerrado en el fotograma anterior, por mano (agarre de la misión lunar). */
  private readonly pellizcosAgarre: Partial<Record<'Left' | 'Right', boolean>> = {};
  /** Barra espaciadora: respaldo del aplauso (SPEC 4). Se consume en la siguiente lectura. */
  private espacioPendiente = false;
  /** Tecla E mantenida: desplegar el LRV en la misión lunar. Aún no tiene gesto propio. */
  private eMantenida = false;
  private pausada = false;
  private aviso: string | null;
  /** Último fotograma procesado, para la captura de depuración (tecla P, solo en desarrollo). */
  private ultimoFrame: TrackingFrame | null = null;

  private constructor(
    private readonly video: HTMLVideoElement,
    private readonly tracker: Tracker,
    /** Opciones vivas: el panel las modifica en el mismo objeto. */
    private readonly opciones: Opciones,
  ) {
    this.aviso = this.calibracion === null ? t('encuadre_acercarse') : null;
    window.addEventListener('keydown', (ev) => {
      if (ev.code !== 'Space' || this.pausada || enCampoDeTexto(ev.target)) return;
      ev.preventDefault();
      if (!ev.repeat) this.espacioPendiente = true;
    });
    window.addEventListener('keydown', (ev) => {
      if (ev.code === 'KeyE' && !this.pausada && !enCampoDeTexto(ev.target)) this.eMantenida = true;
    });
    window.addEventListener('keyup', (ev) => {
      if (ev.code === 'KeyE') this.eMantenida = false;
    });
    // Al perder el foco no llega el keyup.
    window.addEventListener('blur', () => {
      this.eMantenida = false;
    });
    // Captura de depuración: P descarga el frame actual como JSON. Solo en desarrollo.
    if (import.meta.env.DEV) {
      window.addEventListener('keydown', (ev) => {
        if (ev.code === 'KeyP' && !ev.repeat && this.ultimoFrame) descargarCaptura(this.ultimoFrame);
      });
    }
  }

  /**
   * Abre la webcam y carga MediaPipe. Lanza un error si la cámara o el seguimiento fallan;
   * en ese caso la webcam queda cerrada, para poder ofrecer el modo teclado.
   */
  static async crear(video: HTMLVideoElement, opciones: Opciones, onEstado: (mensaje: string) => void): Promise<FuenteCamara> {
    await abrirWebcam(video);
    try {
      const tracker = await Tracker.create(onEstado);
      return new FuenteCamara(video, tracker, opciones);
    } catch (err) {
      cerrarWebcam(video);
      throw err;
    }
  }

  pausar(pausada: boolean): void {
    this.pausada = pausada;
    if (pausada) {
      this.espacioPendiente = false;
      this.eMantenida = false;
    }
  }

  leer(ahoraS: number): LecturaEntrada {
    const espacio = this.espacioPendiente;
    this.espacioPendiente = false;
    const frame = this.tracker.detect(this.video, ahoraS * 1000);
    if (frame) {
      const conFotograma = this.procesarFotograma(frame, ahoraS, espacio);
      conFotograma.desplegarMantenido = this.eMantenida;
      return conFotograma;
    }

    // Sin fotograma nuevo el movimiento está congelado, pero la barra espaciadora debe funcionar.
    const viejo = ahoraS - this.ultimoDatoS > FRESCO_S;
    if (this.calibracion !== null && viejo) this.aviso = t('sin_seguimiento');
    const lectura = lecturaVacia(ahoraS);
    lectura.listo = this.calibracion !== null;
    lectura.aviso = this.aviso;
    lectura.hayDatos = espacio && lectura.listo;
    lectura.aplauso = lectura.hayDatos;
    lectura.manos = viejo ? 'ocultar' : null;
    lectura.desplegarMantenido = this.eMantenida;
    return lectura;
  }

  /** Procesa un fotograma nuevo: encuadre y calibración, o bien las señales del juego. */
  private procesarFotograma(frame: TrackingFrame, ahoraS: number, espacio: boolean): LecturaEntrada {
    this.ultimoFrame = frame;
    const dtS = this.ultimoFrescoS === null ? 0 : Math.min(DT_MAX_S, ahoraS - this.ultimoFrescoS);
    this.ultimoFrescoS = ahoraS;
    this.ultimoDatoS = ahoraS;

    const lectura = lecturaVacia(ahoraS);
    lectura.dtS = dtS;
    // Las manos del avatar copian las detectadas; si no hay mano, su avatar se oculta (SPEC 5.5).
    lectura.manos = { manos: frame.hands, ancho: frame.width, alto: frame.height };

    const framing = checkFraming(frame.pose);
    const roll = frame.face ? headRollDeg(frame.face, frame.width, frame.height) : null;
    const pitch = frame.facePose ? headPitchDeg(frame.facePose) : null;

    // Los pasos se cuentan siempre para no acumularlos de golpe al terminar la calibración.
    this.piernas.feed(ahoraS, legSample(frame.pose));
    const pasosTotales = this.piernas.state(ahoraS).steps;
    const pasos = pasosTotales - this.pasosVistos;
    this.pasosVistos = pasosTotales;

    const shoulderPx = frame.pose ? shoulderWidthPx(frame.pose, frame.width, frame.height) : null;
    const ap = aplauso(frame.hands, shoulderPx, frame.width, frame.height, this.aplausoEstado, ahoraS);
    this.aplausoEstado = ap.estado;
    // Golpe y agarre se miden en cada fotograma, para que su estado anterior esté siempre al día.
    lectura.golpeHombrosS = this.velocidadGolpe(frame, ahoraS, shoulderPx);
    lectura.agarreNuevo = this.agarreNuevo(frame);
    lectura.volanteGrados = volante(frame.hands, frame.width, frame.height)?.grados ?? null;
    const doble = pellizcoDoble(frame.hands, frame.width, frame.height, this.pellizcoDobleEstado, ahoraS);
    this.pellizcoDobleEstado = doble.estado;

    if (this.calibracion === null) {
      const nueva = this.calibrador.alimentar(ahoraS, roll, pitch, framing === 'ok');
      if (nueva) {
        this.calibracion = nueva;
        guardarCalibracion(nueva);
      }
      this.aviso = avisoCalibracion(framing, this.calibrador.progreso, this.calibracion !== null);
      lectura.listo = false;
      lectura.aviso = this.aviso;
      return lectura;
    }

    this.aviso = null;
    lectura.aviso = null;
    lectura.hayDatos = true;
    // Entrar y volver a la escena solo con aplauso o barra espaciadora (SPEC 5.2 y 7.2).
    lectura.aplauso = ap.detectado || (espacio && !this.pausada);
    // Bajarse del LRV: solo la misión lunar lo usa, y solo con el jugador sentado.
    lectura.bajarse = doble.detectado && !this.pausada;
    // Señalar y pellizco dependen solo de la mano que señala.
    this.senalar(frame, lectura);

    // Sin cara no hay giro ni pasos: el movimiento se congela (SPEC 6). El aplauso y el pellizco sí cuentan.
    lectura.conMovimiento = roll !== null;
    if (roll === null) return lectura;

    const { calibracion, opciones } = this;
    lectura.giroGrados = giroCabeza(roll, calibracion.rollNeutralGrados, dtS, opciones.sensibilidadGiro);
    lectura.cabeceoGrados =
      pitch === null ? 0 : cabeceoCabeza(pitch, calibracion.pitchNeutralGrados, dtS, opciones.sensibilidadGiro);
    lectura.avanceM = this.caminata.avanzar(ahoraS, dtS, pasos, opciones);
    return lectura;
  }

  /**
   * Cursor (o rayo, según opciones) y pellizco de la mano que señala. Con mano, el cursor sigue la punta del índice;
   * sin mano, queda en su última posición, atenuado y sin señalar.
   */
  private senalar(frame: TrackingFrame, lectura: LecturaEntrada): void {
    const { opciones } = this;
    const mano = frame.hands.find((m) => m.label === opciones.manoSenaladora);

    const cerrado = pellizco(mano, frame.width, frame.height)?.cerrado ?? false;
    lectura.pellizcoNuevo = cerrado && !this.pellizcoCerrado;
    this.pellizcoCerrado = cerrado;

    let senal: Senal | null;
    if (opciones.metodoSenalar === 'rayo') {
      senal = { tipo: 'rayo', direccion: direccionSenalar(frame, opciones.manoSenaladora) };
    } else if (mano) {
      const pos = this.cursorSuavizado.actualizar(
        puntaACursor(mano.landmarks[HAND_IDX.indexTip], opciones.sensibilidadCursor),
        opciones.suavizadoCursor,
      );
      senal = { tipo: 'cursor', x: pos.x, y: pos.y, activo: true };
    } else {
      const ultima = this.cursorSuavizado.ultima();
      senal = ultima ? { tipo: 'cursor', x: ultima.x, y: ultima.y, activo: false } : null;
    }
    lectura.senal = senal;
  }

  /** Velocidad máxima hacia abajo de las muñecas, en hombros/s (SPEC 8.3). Negativa o cero si suben o no hay datos. */
  private velocidadGolpe(frame: TrackingFrame, ahoraS: number, shoulderPx: number | null): number {
    let mayor = 0;
    for (const mano of frame.hands) {
      if (mano.label === 'Unknown') continue;
      const y = mano.landmarks[HAND_IDX.wrist].y * frame.height;
      const previa = this.munecasPrevias[mano.label];
      this.munecasPrevias[mano.label] = { y, ahoraS };
      if (!previa || shoulderPx === null || shoulderPx < 1) continue;
      const dtS = ahoraS - previa.ahoraS;
      if (dtS <= 0) continue;
      mayor = Math.max(mayor, (y - previa.y) / shoulderPx / dtS);
    }
    return mayor;
  }

  /** Cierre nuevo del pellizco en cualquiera de las dos manos: el agarre de la misión lunar (SPEC 8.3). */
  private agarreNuevo(frame: TrackingFrame): boolean {
    let nuevo = false;
    for (const lado of ['Left', 'Right'] as const) {
      const mano = frame.hands.find((m) => m.label === lado);
      const cerrado = pellizco(mano, frame.width, frame.height)?.cerrado ?? false;
      if (cerrado && !this.pellizcosAgarre[lado]) nuevo = true;
      this.pellizcosAgarre[lado] = cerrado;
    }
    return nuevo;
  }
}

/** Aviso durante la calibración: encuadre primero, luego instrucción y progreso (SPEC 2.1 y 3). */
function avisoCalibracion(framing: FramingStatus, progreso: number, terminada: boolean): string | null {
  if (terminada) return null;
  if (framing === 'retroceder') return t('encuadre_retroceder');
  if (framing === 'acercarse') return t('encuadre_acercarse');
  const porcentaje = String(Math.round(progreso * 100));
  return `${t('calibracion_instruccion')} ${t('calibracion_progreso', { porcentaje })}`;
}
