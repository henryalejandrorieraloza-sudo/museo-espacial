// Bucle principal del juego: encuadre → calibración → museo (SPEC 2.1, 3, 7).
// Une el seguimiento (tracking/), la lógica del museo (game/museo.ts) y la interfaz (ui/).

import { abrirWebcam } from '../tracking/camara';
import { checkFraming, type FramingStatus } from '../tracking/framing';
import { aplauso, aplausoEstadoInicial, type AplausoEstado } from '../tracking/gestures';
import {
  LegAlternationCounter,
  SWING_PCT_DEFAULT,
  headRollDeg,
  legSample,
  shoulderWidthPx,
} from '../tracking/metrics';
import { Tracker, type TrackingFrame } from '../tracking/tracker';
import { visual } from '../visual/museo';
import { crearVoz } from '../audio/voz';
import { t } from '../i18n';
import { requireEl } from '../ui/dom';
import { crearUi, type JuegoUi } from '../ui/juegoUi';
import { Calibrador, cargarCalibracion, guardarCalibracion, type Calibracion } from './calibracion';
import { direccionSenalar, giroCabeza } from './gestos';
import { Museo, type EventoMuseo } from './museo';

/** Si el último fotograma es más viejo que esto (s), el movimiento se congela (SPEC 6). */
const FRESCO_S = 0.5;
/** Tiempo máximo (s) que cuenta un fotograma para el giro, para no saltar tras una pausa. */
const DT_MAX_S = 0.1;

export async function iniciarJuego(container: HTMLElement): Promise<void> {
  const voz = crearVoz('es-ES');
  const museo = new Museo();
  const ui = crearUi(() => museo.volver());

  museo.onEvento((evento: EventoMuseo) => {
    if (evento.tipo === 'vitrinaSeleccionada') {
      ui.subtitulos(t(evento.id));
      voz.hablar(t(evento.id));
    } else if (evento.tipo === 'misionAbierta') {
      voz.cancelar();
      ui.subtitulos(null);
      ui.mostrarMision(t(evento.mision === 'luna' ? 'mision_luna' : 'mision_marte'));
    } else {
      ui.ocultarMision();
    }
  });

  requireEl('ayuda').textContent = t('ayuda');

  // Barra espaciadora: respaldo del aplauso (SPEC 4). Se consume en el siguiente fotograma o bucle.
  let espacioPendiente = false;
  window.addEventListener('keydown', (ev) => {
    if (ev.code !== 'Space') return;
    ev.preventDefault();
    if (!ev.repeat) espacioPendiente = true;
  });

  try {
    ui.aviso(t('arranque'));
    await visual.museo.iniciar(container);

    const video = requireEl<HTMLVideoElement>('camara');
    try {
      await abrirWebcam(video);
    } catch (err) {
      ui.aviso(t('camara_error', { error: err instanceof Error ? err.message : String(err) }));
      return;
    }

    const tracker = await Tracker.create((mensaje) => ui.aviso(mensaje));
    const sesion = nuevaSesion(museo, ui, cargarCalibracion());
    ui.aviso(sesion.calibracion === null ? t('encuadre_acercarse') : null);

    const bucle = (): void => {
      const ahoraS = performance.now() / 1000;
      const nuevo = tracker.detect(video, ahoraS * 1000);
      const espacio = espacioPendiente;
      espacioPendiente = false;

      if (nuevo) {
        procesarFotograma(sesion, nuevo, ahoraS, espacio);
      } else if (espacio && sesion.calibracion !== null) {
        // Sin fotograma nuevo el movimiento está congelado, pero la barra espaciadora debe funcionar.
        museo.actualizar({ ahoraS, giroGrados: 0, pasos: 0, apuntando: null, accion: true });
      }
      if (sesion.calibracion !== null && ahoraS - sesion.ultimoDatoS > FRESCO_S) {
        ui.aviso(t('sin_seguimiento'));
      }

      requestAnimationFrame(bucle);
    };
    requestAnimationFrame(bucle);
  } catch (err) {
    ui.aviso(`Error: ${err instanceof Error ? err.message : String(err)}`);
    console.error(err);
  }
}

/** Estado que persiste entre fotogramas. */
interface Sesion {
  museo: Museo;
  ui: JuegoUi;
  calibracion: Calibracion | null;
  calibrador: Calibrador;
  piernas: LegAlternationCounter;
  pasosVistos: number;
  aplausoEstado: AplausoEstado;
  ultimoFrescoS: number | null;
  ultimoDatoS: number;
}

function nuevaSesion(museo: Museo, ui: JuegoUi, calibracion: Calibracion | null): Sesion {
  return {
    museo,
    ui,
    calibracion,
    calibrador: new Calibrador(),
    piernas: new LegAlternationCounter(SWING_PCT_DEFAULT),
    pasosVistos: 0,
    aplausoEstado: aplausoEstadoInicial,
    ultimoFrescoS: null,
    ultimoDatoS: Number.NEGATIVE_INFINITY,
  };
}

/** Procesa un fotograma nuevo: encuadre y calibración, o bien las acciones del museo. */
function procesarFotograma(sesion: Sesion, frame: TrackingFrame, ahoraS: number, espacio: boolean): void {
  const dtS = sesion.ultimoFrescoS === null ? 0 : Math.min(DT_MAX_S, ahoraS - sesion.ultimoFrescoS);
  sesion.ultimoFrescoS = ahoraS;
  sesion.ultimoDatoS = ahoraS;

  const framing = checkFraming(frame.pose);
  const roll = frame.face ? headRollDeg(frame.face, frame.width, frame.height) : null;

  // Los pasos se cuentan siempre para no acumularlos de golpe al terminar la calibración.
  sesion.piernas.feed(ahoraS, legSample(frame.pose));
  const pasosTotales = sesion.piernas.state(ahoraS).steps;
  const pasos = pasosTotales - sesion.pasosVistos;
  sesion.pasosVistos = pasosTotales;

  const shoulderPx = frame.pose ? shoulderWidthPx(frame.pose, frame.width, frame.height) : null;
  const ap = aplauso(frame.hands, shoulderPx, frame.width, frame.height, sesion.aplausoEstado, ahoraS);
  sesion.aplausoEstado = ap.estado;

  if (sesion.calibracion === null) {
    const nueva = sesion.calibrador.alimentar(ahoraS, roll, framing === 'ok');
    if (nueva) {
      sesion.calibracion = nueva;
      guardarCalibracion(nueva);
    }
    sesion.ui.aviso(avisoCalibracion(framing, sesion.calibrador.progreso, sesion.calibracion !== null));
    return;
  }

  // Sin cara no hay giro ni pasos: el movimiento se congela (SPEC 6). El aplauso y el espacio sí cuentan.
  if (roll === null) {
    if (ap.detectado || espacio) {
      sesion.museo.actualizar({ ahoraS, giroGrados: 0, pasos: 0, apuntando: null, accion: true });
    }
    return;
  }

  const dir = direccionSenalar(frame);
  sesion.museo.actualizar({
    ahoraS,
    giroGrados: giroCabeza(roll, sesion.calibracion.rollNeutralGrados, dtS),
    pasos,
    apuntando: dir ? visual.museo.vitrinaEnDireccion(dir) : null,
    accion: ap.detectado || espacio,
  });
}

/** Aviso durante la calibración: encuadre primero, luego instrucción y progreso (SPEC 2.1 y 3). */
function avisoCalibracion(framing: FramingStatus, progreso: number, terminada: boolean): string | null {
  if (terminada) return null;
  if (framing === 'retroceder') return t('encuadre_retroceder');
  if (framing === 'acercarse') return t('encuadre_acercarse');
  const porcentaje = String(Math.round(progreso * 100));
  return `${t('calibracion_instruccion')} ${t('calibracion_progreso', { porcentaje })}`;
}
