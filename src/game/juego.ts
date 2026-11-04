// Bucle principal del juego: encuadre → calibración → museo (SPEC 2.1, 3, 7).
// Une el seguimiento (tracking/), la lógica del museo (game/museo.ts) y la interfaz (ui/).

import { abrirWebcam } from '../tracking/camara';
import { checkFraming, type FramingStatus } from '../tracking/framing';
import { aplauso, aplausoEstadoInicial, pellizco, volante, type AplausoEstado } from '../tracking/gestures';
import {
  HAND_IDX,
  LegAlternationCounter,
  SWING_PCT_DEFAULT,
  headRollDeg,
  legSample,
  shoulderWidthPx,
} from '../tracking/metrics';
import { Tracker, type TrackingFrame } from '../tracking/tracker';
import { visual } from '../visual/museo';
import { crearVoz, type Voz } from '../audio/voz';
import { t, type ClaveTexto } from '../i18n';
import { requireEl } from '../ui/dom';
import { crearCursor, type CursorUi } from '../ui/cursor';
import { crearOpcionesUi } from '../ui/opcionesUi';
import { crearUi, type JuegoUi } from '../ui/juegoUi';
import { Caminata } from './caminata';
import { Calibrador, cargarCalibracion, guardarCalibracion, type Calibracion } from './calibracion';
import { cargarOpciones, type Opciones } from './opciones';
import { CursorSuavizado, puntaACursor } from './cursor';
import { direccionSenalar, giroCabeza } from './gestos';
import { Museo, type EventoMuseo } from './museo';
import { descargarCaptura } from '../ui/captura';
import { MisionLuna, type EntradaLuna, type EstadoLuna } from './luna';

/** Si el último fotograma es más viejo que esto (s), el movimiento se congela (SPEC 6). */
const FRESCO_S = 0.5;
/** Tiempo máximo (s) que cuenta un fotograma para el giro y la caminata, para no saltar tras una pausa. */
const DT_MAX_S = 0.1;

/** Misión lunar activa (SPEC 8). Solo existe mientras la pantalla es la escena de Luna. */
let mision: MisionLuna | null = null;

/** Último frame procesado, para la captura de depuración (tecla P, solo en desarrollo). */
let ultimoFrame: TrackingFrame | null = null;

/** Frase de voz de cada estado de la misión. `entrando_museo` se dice al abrir la escena, no aquí. */
const FRASES_LUNA: Partial<Record<EstadoLuna, ClaveTexto>> = {
  sentado_en_LRV: 'luna_sentado_en_LRV',
  cerca_de_roca: 'luna_cerca_de_roca',
  golpeando: 'luna_golpeando',
  muestra_recogida: 'luna_muestra_recogida',
};

/** Dice una frase de voz con subtítulo. Corta la anterior para que no se pisen. Sin voz, el subtítulo sale igual. */
function decirFrase(voz: Voz, ui: JuegoUi, clave: ClaveTexto): void {
  voz.cancelar();
  voz.hablar(t(clave), undefined, (frase) => ui.subtitulos(frase));
}

export async function iniciarJuego(container: HTMLElement): Promise<void> {
  const voz = crearVoz('es-ES');
  const museo = new Museo();
  const ui = crearUi(() => museo.volver());
  const cursorUi = crearCursor();

  // Opciones (SPEC 13): el panel modifica este mismo objeto al cambiar un valor.
  const opciones = cargarOpciones();
  crearOpcionesUi(opciones, (nuevas) => Object.assign(opciones, nuevas));

  museo.onEvento((evento: EventoMuseo) => {
    switch (evento.tipo) {
      case 'vitrinaSeleccionada':
        // El mentor explica la vitrina frase a frase; cada frase va como subtítulo al empezar.
        // Al terminar la última (no antes) se habilita entrar (SPEC 7.2).
        ui.indicarEntrar(null);
        voz.hablar(
          t(evento.id),
          () => museo.terminoVoz(evento.id),
          (frase) => ui.subtitulos(frase),
        );
        break;
      case 'listoParaEntrar':
        ui.indicarEntrar(t('entrar_aplauso'));
        break;
      case 'vitrinaDeseleccionada':
        // Sin vitrina seleccionada no hay explicación ni entrada: se corta la voz y los textos.
        voz.cancelar();
        ui.subtitulos(null);
        ui.indicarEntrar(null);
        break;
      case 'misionAbierta':
        voz.cancelar();
        ui.subtitulos(null);
        ui.indicarEntrar(null);
        if (evento.mision === 'luna') {
          // Misión lunar (SPEC 8): sin cartel de "en construcción". El primer aplauso dentro sienta al jugador.
          mision = new MisionLuna();
          cursorUi.mostrar(false);
          decirFrase(voz, ui, 'luna_entrando_museo');
        } else {
          ui.mostrarMision(t('escena_marte_construccion'));
        }
        break;
      case 'regresoMuseo':
        // Se quita el texto de la escena y el mentor da su conclusión (voz y subtítulos).
        mision = null;
        ui.ocultarMision();
        ui.subtitulos(t('regreso_museo'));
        voz.hablar(t('regreso_museo'));
        break;
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

  // Captura de depuración: P descarga el frame actual como JSON. Solo en desarrollo (SPEC no lo incluye en producción).
  if (import.meta.env.DEV) {
    window.addEventListener('keydown', (ev) => {
      if (ev.code === 'KeyP' && !ev.repeat && ultimoFrame) descargarCaptura(ultimoFrame);
    });
  }

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
    const sesion = nuevaSesion(museo, ui, cursorUi, opciones, cargarCalibracion(), voz);
    ui.aviso(sesion.calibracion === null ? t('encuadre_acercarse') : null);

    const bucle = (): void => {
      const ahoraS = performance.now() / 1000;
      sesion.museo.tick(ahoraS);
      const nuevo = tracker.detect(video, ahoraS * 1000);
      const espacio = espacioPendiente;
      espacioPendiente = false;

      if (nuevo) {
        procesarFotograma(sesion, nuevo, ahoraS, espacio);
      } else if (espacio && sesion.calibracion !== null) {
        // Sin fotograma nuevo el movimiento está congelado, pero la barra espaciadora debe funcionar.
        if (mision !== null) {
          aplicarLuna(sesion, {
            ahoraS,
            dtS: 0,
            aplauso: true,
            metros: 0,
            volanteGrados: null,
            velocidadGolpeHombrosS: 0,
            agarreNuevo: false,
          });
        } else {
          museo.actualizar({ ahoraS, giroGrados: 0, metros: 0, apuntando: null, accion: true });
        }
      }
      if (ahoraS - sesion.ultimoDatoS > FRESCO_S) visual.museo.ocultarManos();
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
  cursorUi: CursorUi;
  /** Opciones vivas: el panel las modifica en el mismo objeto. */
  opciones: Opciones;
  calibracion: Calibracion | null;
  calibrador: Calibrador;
  piernas: LegAlternationCounter;
  caminata: Caminata;
  cursorSuavizado: CursorSuavizado;
  /** Si el pellizco de la mano que señala estaba cerrado en el fotograma anterior. */
  pellizcoCerrado: boolean;
  pasosVistos: number;
  aplausoEstado: AplausoEstado;
  ultimoFrescoS: number | null;
  ultimoDatoS: number;
  voz: Voz;
  /** Última posición (px) y tiempo de cada muñeca, para medir la velocidad de golpe (SPEC 8.3). */
  munecasPrevias: Partial<Record<'Left' | 'Right', { y: number; ahoraS: number }>>;
  /** Pellizco cerrado en el fotograma anterior, por mano (agarre de la misión lunar). */
  pellizcosLuna: Partial<Record<'Left' | 'Right', boolean>>;
}

function nuevaSesion(
  museo: Museo,
  ui: JuegoUi,
  cursorUi: CursorUi,
  opciones: Opciones,
  calibracion: Calibracion | null,
  voz: Voz,
): Sesion {
  return {
    museo,
    ui,
    cursorUi,
    opciones,
    calibracion,
    voz,
    munecasPrevias: {},
    pellizcosLuna: {},
    calibrador: new Calibrador(),
    piernas: new LegAlternationCounter(SWING_PCT_DEFAULT),
    caminata: new Caminata(),
    cursorSuavizado: new CursorSuavizado(),
    pellizcoCerrado: false,
    pasosVistos: 0,
    aplausoEstado: aplausoEstadoInicial,
    ultimoFrescoS: null,
    ultimoDatoS: Number.NEGATIVE_INFINITY,
  };
}

/** Procesa un fotograma nuevo: encuadre y calibración, o bien las acciones del museo. */
function procesarFotograma(sesion: Sesion, frame: TrackingFrame, ahoraS: number, espacio: boolean): void {
  ultimoFrame = frame;
  const dtS = sesion.ultimoFrescoS === null ? 0 : Math.min(DT_MAX_S, ahoraS - sesion.ultimoFrescoS);
  sesion.ultimoFrescoS = ahoraS;
  sesion.ultimoDatoS = ahoraS;
  // Las manos del avatar copian las detectadas; si no hay mano, su avatar se oculta (SPEC 5.5).
  visual.museo.actualizarManos(frame.hands, frame.width, frame.height, sesion.opciones.tamanoMano, {
    separacion: sesion.opciones.separacionManos,
    ajuste: sesion.opciones.ajusteManoModelo,
    limites: sesion.opciones.limitesMano,
    ahoraS,
    tiempoOcultarS: sesion.opciones.tiempoOcultarManoS,
    umbralSaltoM: sesion.opciones.umbralSaltoManoM,
  });

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

  // Señalar y pellizco dependen solo de la mano que señala, así que siguen funcionando sin cara.
  const senal = senalar(sesion, frame);
  // Entrar y volver a la escena solo con aplauso o barra espaciadora (SPEC 5.2 y 7.2).
  const accion = ap.detectado || espacio;

  // Escena lunar: sus gestos (volante, caminata, golpe, agarre) van a la máquina de estados (SPEC 8).
  if (mision !== null) {
    procesarMisionLuna(sesion, frame, {
      ahoraS,
      dtS,
      pasos,
      roll,
      aplauso: accion,
      shoulderPx,
    });
    return;
  }

  // Sin cara no hay giro ni pasos: el movimiento se congela (SPEC 6). El aplauso, el espacio y el pellizco sí cuentan.
  if (roll === null) {
    if (accion) {
      sesion.museo.actualizar({ ahoraS, giroGrados: 0, metros: 0, apuntando: null, accion: true });
    }
    return;
  }

  sesion.museo.actualizar({
    ahoraS,
    giroGrados: giroCabeza(roll, sesion.calibracion.rollNeutralGrados, dtS, sesion.opciones.sensibilidadGiro),
    metros: sesion.caminata.avanzar(ahoraS, dtS, pasos, sesion.opciones),
    apuntando: senal.apuntando,
    accion,
  });
}

interface DatosMision {
  ahoraS: number;
  dtS: number;
  pasos: number;
  roll: number | null;
  aplauso: boolean;
  shoulderPx: number | null;
}

/** Arma la entrada de la misión lunar a partir del fotograma y la envía a la máquina de estados. */
function procesarMisionLuna(sesion: Sesion, frame: TrackingFrame, datos: DatosMision): void {
  // Sin cara no hay caminata (el movimiento se congela, SPEC 6); el volante sigue con las manos.
  const metros = datos.roll === null ? 0 : sesion.caminata.avanzar(datos.ahoraS, datos.dtS, datos.pasos, sesion.opciones);
  aplicarLuna(sesion, {
    ahoraS: datos.ahoraS,
    dtS: datos.dtS,
    aplauso: datos.aplauso,
    metros,
    volanteGrados: volante(frame.hands, frame.width, frame.height)?.grados ?? null,
    velocidadGolpeHombrosS: velocidadGolpe(sesion, frame, datos.ahoraS, datos.shoulderPx),
    agarreNuevo: agarreNuevo(sesion, frame),
  });
}

/** Avanza la misión lunar un fotograma, actualiza la escena y reacciona a los eventos (voz, volver). */
function aplicarLuna(sesion: Sesion, entrada: EntradaLuna): void {
  if (mision === null || sesion.museo.enTransicion) return;
  const eventos = mision.update(entrada);
  visual.museo.actualizarLuna({
    x: mision.posicion.x,
    z: mision.posicion.z,
    rumboGrados: mision.rumboGrados,
    sentado: mision.estado !== 'entrando_museo',
    rocaResaltada: mision.rocaResaltada,
  });
  for (const evento of eventos) {
    if (evento.tipo === 'estado') {
      const clave = FRASES_LUNA[evento.estado];
      if (clave) decirFrase(sesion.voz, sesion.ui, clave);
    } else if (evento.tipo === 'golpeFallido') {
      decirFrase(sesion.voz, sesion.ui, 'luna_golpe_fallido');
    } else if (evento.tipo === 'volver') {
      sesion.museo.volver();
    }
  }
}

/** Velocidad máxima hacia abajo de las muñecas, en hombros/s (SPEC 8.3). Negativa o cero si suben o no hay datos. */
function velocidadGolpe(sesion: Sesion, frame: TrackingFrame, ahoraS: number, shoulderPx: number | null): number {
  let mayor = 0;
  for (const mano of frame.hands) {
    if (mano.label === 'Unknown') continue;
    const y = mano.landmarks[HAND_IDX.wrist].y * frame.height;
    const previa = sesion.munecasPrevias[mano.label];
    sesion.munecasPrevias[mano.label] = { y, ahoraS };
    if (!previa || shoulderPx === null || shoulderPx < 1) continue;
    const dtS = ahoraS - previa.ahoraS;
    if (dtS <= 0) continue;
    mayor = Math.max(mayor, (y - previa.y) / shoulderPx / dtS);
  }
  return mayor;
}

/** Cierre nuevo del pellizco en cualquiera de las dos manos: el agarre de la misión lunar (SPEC 8.3). */
function agarreNuevo(sesion: Sesion, frame: TrackingFrame): boolean {
  let nuevo = false;
  for (const lado of ['Left', 'Right'] as const) {
    const mano = frame.hands.find((m) => m.label === lado);
    const cerrado = pellizco(mano, frame.width, frame.height)?.cerrado ?? false;
    if (cerrado && !sesion.pellizcosLuna[lado]) nuevo = true;
    sesion.pellizcosLuna[lado] = cerrado;
  }
  return nuevo;
}

interface ResultadoSenalar {
  /** Vitrina bajo el cursor o apuntada por el rayo; null si ninguna. */
  apuntando: string | null;
  /** True solo en el fotograma en que el pellizco de la mano que señala se cierra. */
  pellizcoNuevo: boolean;
}

/**
 * Cursor (o rayo, según opciones) y pellizco de la mano que señala. El cursor se dibuja y se
 * mueve siempre que haya mano; si la mano no se ve, queda en su última posición, atenuado y sin vitrina.
 */
function senalar(sesion: Sesion, frame: TrackingFrame): ResultadoSenalar {
  const { opciones, cursorUi } = sesion;
  const mano = frame.hands.find((m) => m.label === opciones.manoSenaladora);

  const pinch = pellizco(mano, frame.width, frame.height);
  const cerrado = pinch?.cerrado ?? false;
  const pellizcoNuevo = cerrado && !sesion.pellizcoCerrado;
  sesion.pellizcoCerrado = cerrado;

  // En una escena no hay vitrinas que señalar: se oculta el cursor.
  if (sesion.museo.pantalla.tipo !== 'museo') {
    cursorUi.mostrar(false);
    return { apuntando: null, pellizcoNuevo: false };
  }

  if (opciones.metodoSenalar === 'rayo') {
    cursorUi.mostrar(false);
    const dir = direccionSenalar(frame, opciones.manoSenaladora);
    return { apuntando: dir ? visual.museo.vitrinaEnDireccion(dir) : null, pellizcoNuevo };
  }

  if (mano) {
    const punta = mano.landmarks[HAND_IDX.indexTip];
    const pos = sesion.cursorSuavizado.actualizar(
      puntaACursor(punta, opciones.sensibilidadCursor),
      opciones.suavizadoCursor,
    );
    cursorUi.mostrar(true);
    cursorUi.mover(pos.x, pos.y, false);
    return { apuntando: visual.museo.vitrinaEnPantalla(pos.x, pos.y), pellizcoNuevo };
  }

  const ultima = sesion.cursorSuavizado.ultima();
  cursorUi.mostrar(ultima !== null);
  if (ultima) cursorUi.mover(ultima.x, ultima.y, true);
  return { apuntando: null, pellizcoNuevo };
}

/** Aviso durante la calibración: encuadre primero, luego instrucción y progreso (SPEC 2.1 y 3). */
function avisoCalibracion(framing: FramingStatus, progreso: number, terminada: boolean): string | null {
  if (terminada) return null;
  if (framing === 'retroceder') return t('encuadre_retroceder');
  if (framing === 'acercarse') return t('encuadre_acercarse');
  const porcentaje = String(Math.round(progreso * 100));
  return `${t('calibracion_instruccion')} ${t('calibracion_progreso', { porcentaje })}`;
}
