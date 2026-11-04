import '../styles.css';
import { Tracker, type TrackingFrame } from '../tracking/tracker';
import {
  LegAlternationCounter,
  POSE_IDX,
  SWING_PCT_DEFAULT,
  clampSwingPct,
  headRollDeg,
  legSample,
  palmDistanceRatio,
  pinchRatio,
  shoulderCenterY,
  shoulderWidthPx,
  wristDistance,
  type LegState,
} from '../tracking/metrics';
import { checkFraming, KNEE_VISIBILITY_MIN, type FramingStatus } from '../tracking/framing';
import {
  APLAUSO_CONFIRMA_DEFAULT,
  APLAUSO_INDICADOR_S,
  APLAUSO_OPCIONES_DEFAULT,
  APLAUSO_PERDIDA_DEFAULT,
  APLAUSO_VELOCIDAD_DEFAULT,
  APLAUSO_VENTANA_PERDIDA_DEFAULT,
  PELLIZCO_UMBRAL_DEFAULT,
  PELLIZCO_VENTANA_S,
  CONDUCCION_OPCIONES_DEFAULT,
  INCLINACION_OPCIONES_DEFAULT,
  VOLANTE_NEUTRAL_DEFAULT,
  MinimoVentana,
  aplauso,
  aplausoEstadoInicial,
  avanzaConduccion,
  inclinacionMano,
  objetivoConduccion,
  pellizco,
  volante,
  type AplausoEstado,
  type AplausoOpciones,
  type AplausoResultado,
  type InclinacionResultado,
  type OpcionesInclinacion,
  type ZonaInclinacion,
  type ZonaVolante,
} from '../tracking/gestures';
import type { TrackedHand } from '../tracking/tracker';
import { MicAplausoSonoro, SONIDO_INDICADOR_S } from '../audio/aplausoSonoro';
import { drawTracking } from '../ui/overlay';
import { requireEl, setValue } from '../ui/dom';
import { drawSignal } from './signalPlot';

const fmt = (value: number | null, digits: number, unit = ''): string =>
  value === null || !Number.isFinite(value) ? '—' : `${value.toFixed(digits)}${unit}`;

/** Valor numérico configurable en /debug/: se limita a un rango; si no es válido, vuelve al defecto. */
const numOpcion = (value: number, def: number, min: number, max: number): number =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : def;

/** Si el último fotograma tiene más de esta antigüedad (s), los valores de gestos ya no se muestran. */
const GESTO_STALE_S = 0.5;

const ZONA_INCL_LABEL: Record<ZonaInclinacion, string> = {
  arriba: 'arriba',
  neutral: 'neutral',
  abajo: 'abajo',
};

const ZONA_VOL_LABEL: Record<ZonaVolante, string> = {
  izquierda: 'izquierda',
  neutral: 'neutral',
  derecha: 'derecha',
};

/** Estado de los gestos que se actualiza solo con fotogramas nuevos. */
interface GestoState {
  aplausoEstado: AplausoEstado;
  /** Último resultado de aplauso; null hasta el primer fotograma. */
  aplausoUltimo: AplausoResultado | null;
  /** Opciones de aplauso configuradas en /debug/. */
  aplausoOpciones: AplausoOpciones;
  /** Mínimo de distancia de pellizco de los últimos 5 s, por mano. */
  pinchMinL: MinimoVentana;
  pinchMinR: MinimoVentana;
  /** Inclinación de cada mano del último fotograma; null si no está visible. */
  inclL: InclinacionResultado | null;
  inclR: InclinacionResultado | null;
  /** Opciones de inclinación configuradas en /debug/. */
  inclOpciones: OpcionesInclinacion;
  /** Mano que conduce el rover: 'Left' o 'Right' (MediaPipe). */
  manoConduce: 'Left' | 'Right';
  /** Objetivo de velocidad del último fotograma nuevo: +1, 0, −1 o null (sin datos fiables). */
  objetivoConduce: number | null;
  /** Velocidad simulada del rover (−1…+1). */
  velocidadRover: number;
  /** Instante (ms) del último paso de conducción; null hasta el primero. */
  conduccionMs: number | null;
}

const OBJETIVO_LABEL = (v: number | null): string =>
  v === null ? 'sin datos' : v > 0 ? 'avanzar' : v < 0 ? 'retroceder' : 'detenido';

function setIndicator(key: string, on: boolean): void {
  const el = document.querySelector<HTMLElement>(`[data-key="${key}"]`);
  el?.classList.toggle('lit', on);
}

/**
 * Muestra la sección GESTOS. Cada valor que depende de una mano ausente muestra
 * “mano no visible” en vez de un valor anterior. Si el fotograma es viejo, todo se marca como sin datos.
 */
function showGestos(frame: TrackingFrame, gesto: GestoState, ahora: number): void {
  const { width: w, height: h } = frame;
  const left = frame.hands.find((hand) => hand.label === 'Left');
  const right = frame.hands.find((hand) => hand.label === 'Right');

  // Aplauso: distancia entre palmas, velocidad, manos visibles, último motivo e indicador.
  const ap = gesto.aplausoUltimo;
  setValue('apRatio', fmt(ap?.ratio ?? null, 2, ' × hombros'));
  setValue('apVel', fmt(ap?.velocidad ?? null, 2, ' /s'));
  setValue('apManos', ap ? String(ap.manosVisibles) : '—');
  setValue('apMotivo', gesto.aplausoEstado.ultimoMotivo ?? '—');
  const apLit = ahora - gesto.aplausoEstado.ultimoDisparo < APLAUSO_INDICADOR_S;
  setValue('apIndicator', apLit ? 'APLAUSO' : 'sin aplauso');
  setIndicator('apIndicator', apLit);

  // Pellizco izquierdo y derecho.
  const pinchL = pellizco(left, w, h, PELLIZCO_UMBRAL_DEFAULT);
  const pinchR = pellizco(right, w, h, PELLIZCO_UMBRAL_DEFAULT);
  const pinchText = (p: { distancia: number; cerrado: boolean } | null) =>
    p ? `${fmt(p.distancia, 2)} · ${p.cerrado ? 'cerrado' : 'abierto'}` : 'mano no visible';
  setValue('gPinchL', pinchText(pinchL));
  setValue('gPinchR', pinchText(pinchR));
  setValue('gPinchMinL', fmt(gesto.pinchMinL.minimo(ahora / 1000), 2));
  setValue('gPinchMinR', fmt(gesto.pinchMinR.minimo(ahora / 1000), 2));

  // Inclinación de cada mano: valor y zona son los que deciden; los grados son solo referencia.
  const inclText = (hand: TrackedHand | undefined, r: InclinacionResultado | null) => {
    if (!hand || !r) return 'mano no visible';
    if (!r.confiable) return `no confiable (longitud < 0.02) · ${fmt(r.grados, 1, '°')} ref.`;
    return `${fmt(r.valor, 2)} · ${r.zona ? ZONA_INCL_LABEL[r.zona] : '—'} · ${fmt(r.grados, 1, '°')} ref.`;
  };
  setValue('gInclL', inclText(left, gesto.inclL));
  setValue('gInclR', inclText(right, gesto.inclR));

  // Rover simulado: velocidad y objetivo de la mano que conduce.
  const conduceText = gesto.manoConduce === 'Left' ? 'izquierda' : 'derecha';
  setValue(
    'gRover',
    `${fmt(gesto.velocidadRover, 2)} · objetivo: ${OBJETIVO_LABEL(gesto.objetivoConduce)} (mano ${conduceText})`,
  );

  // Volante (ambas manos).
  const vol = volante(frame.hands, w, h, VOLANTE_NEUTRAL_DEFAULT);
  setValue(
    'gVolante',
    vol ? `${fmt(vol.grados, 1, '°')} · ${ZONA_VOL_LABEL[vol.zona]}` : 'faltan ambas manos',
  );

  const missing = [left ? null : 'izquierda', right ? null : 'derecha'].filter(Boolean);
  setValue(
    'gAviso',
    missing.length === 0
      ? ''
      : `Mano ${missing.join(' y ')} no visible: sus valores no se muestran.`,
  );
}

function showGestosSinDatos(): void {
  for (const key of [
    'apRatio',
    'apVel',
    'apManos',
    'apMotivo',
    'apIndicator',
    'gPinchL',
    'gPinchR',
    'gPinchMinL',
    'gPinchMinR',
    'gInclL',
    'gInclR',
    'gRover',
    'gVolante',
  ]) {
    setValue(key, 'sin datos recientes');
  }
  setIndicator('apIndicator', false);
  setValue('gAviso', 'Sin fotograma reciente: no se muestran valores antiguos.');
}

const FRAMING_LABEL: Record<FramingStatus, string> = {
  ok: 'correcto',
  retroceder: 'Retrocede',
  acercarse: 'Acércate',
};

async function openWebcam(video: HTMLVideoElement): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
}

function showValues(frame: TrackingFrame, legs: LegState): void {
  const { width: w, height: h } = frame;

  const roll = frame.face ? headRollDeg(frame.face, w, h) : null;
  setValue('roll', fmt(roll, 1, '°'));

  // Encuadre (SPEC 2.1): visibilidad de las rodillas y estado resultante.
  const framing = checkFraming(frame.pose);
  setValue('framing', FRAMING_LABEL[framing]);
  const kneeVis = frame.pose
    ? [POSE_IDX.leftKnee, POSE_IDX.rightKnee]
        .map((i) => (frame.pose?.[i].visibility ?? 0).toFixed(2))
        .join(' / ')
    : '—';
  setValue('kneeVis', `${kneeVis} (mín. ${KNEE_VISIBILITY_MIN})`);

  // Caminar por alternancia de piernas (SPEC 5.1).
  setValue(
    'legStatus',
    !legs.visible ? 'rodilla no visible' : legs.walking ? 'caminando' : 'detenido',
  );
  setValue('legSignal', fmt(legs.signalPct, 1, ' %'));
  setValue('legPeak', fmt(legs.peakPct, 1, ' %'));
  setValue('legSwing', fmt(legs.swingPct, 1, ' %'));
  setValue('steps', String(legs.steps));
  setValue('cadence', fmt(legs.cadence, 2));

  // Hombros: solo referencia de postura (SPEC 2 y 3).
  const shoulderY = frame.pose ? shoulderCenterY(frame.pose) : null;
  setValue('shoulderY', shoulderY === null ? '—' : fmt(shoulderY * 100, 1, ' %'));

  const shoulderPx = frame.pose ? shoulderWidthPx(frame.pose, w, h) : null;
  const wrists = wristDistance(frame.hands, shoulderPx, w, h);
  setValue('wristRatio', fmt(wrists?.ratio ?? null, 2));
  setValue('wristPx', wrists ? `${wrists.px.toFixed(0)} px` : '—');
  const palms = palmDistanceRatio(frame.hands, shoulderPx, w, h);
  setValue('palmRatio', fmt(palms, 2));

  const left = frame.hands.find((hand) => hand.label === 'Left');
  const right = frame.hands.find((hand) => hand.label === 'Right');
  setValue('pinchLeft', left ? fmt(pinchRatio(left, w, h), 2) : '—');
  setValue('pinchRight', right ? fmt(pinchRatio(right, w, h), 2) : '—');

  const mark = (ok: boolean) => (ok ? '✓' : '✗');
  setValue(
    'detected',
    `cara ${mark(!!frame.face)} · cuerpo ${mark(!!frame.pose)} · manos ${frame.hands.length}`,
  );
}

/**
 * Muestra el aplauso sonoro y el indicador combinado (visual o sonoro). Se llama en cada vuelta del
 * bucle, también sin fotograma nuevo, porque el sonido tiene su propio reloj.
 */
function showSonoro(
  mic: MicAplausoSonoro | null,
  micError: string | null,
  visualDisparoS: number,
  ahora: number,
): void {
  if (!mic) {
    setValue('apSonoroEstado', micError ? `sin micrófono: ${micError}` : 'pidiendo micrófono…');
  } else {
    setValue('apSonoroEstado', mic.pendiente ? 'pulsa en la página para activar el audio' : 'micrófono activo');
  }
  const e = mic?.estado ?? null;
  setValue('apSonoroNivel', e ? fmt(e.nivelDb, 1, ' dB') : '—');
  setValue('apSonoroCruces', e ? fmt(e.cruces, 2) : '—');
  setValue('apSonoroMotivo', e?.motivo ?? '—');

  const sonoroLit = mic !== null && ahora - mic.ultimoAplauso < SONIDO_INDICADOR_S;
  const visualLit = ahora - visualDisparoS < APLAUSO_INDICADOR_S;
  const lit = visualLit || sonoroLit;
  setValue('apCombinado', lit ? 'APLAUSO' : 'sin aplauso');
  setIndicator('apCombinado', lit);
}

async function main(): Promise<void> {
  const video = requireEl<HTMLVideoElement>('video');
  const canvas = requireEl<HTMLCanvasElement>('overlay');
  const signalCanvas = requireEl<HTMLCanvasElement>('signal');
  const status = requireEl('status');
  const swingInput = requireEl<HTMLInputElement>('swingPct');
  const ctx = canvas.getContext('2d');
  const signalCtx = signalCanvas.getContext('2d');
  if (!ctx || !signalCtx) throw new Error('No se pudo obtener el contexto 2D de un canvas');

  try {
    status.textContent = 'Pidiendo acceso a la webcam…';
    await openWebcam(video);

    const tracker = await Tracker.create((message) => {
      status.textContent = message;
    });
    status.textContent = 'Seguimiento activo';

    // Aplauso sonoro: si el micrófono se deniega o no existe, el aplauso visual sigue funcionando.
    let micSonoro: MicAplausoSonoro | null = null;
    let micError: string | null = null;
    try {
      micSonoro = await MicAplausoSonoro.start();
    } catch (err) {
      micError = err instanceof Error ? err.message : String(err);
    }

    const legs = new LegAlternationCounter(SWING_PCT_DEFAULT);
    swingInput.value = String(legs.amplitudePct);

    swingInput.addEventListener('change', () => {
      const pct = clampSwingPct(Number(swingInput.value));
      legs.setSwingPct(pct);
      swingInput.value = String(pct);
    });

    const aplausoVelInput = requireEl<HTMLInputElement>('aplausoVel');
    const aplausoConfirmaInput = requireEl<HTMLInputElement>('aplausoConfirma');
    const aplausoPerdidaInput = requireEl<HTMLInputElement>('aplausoPerdida');
    const aplausoVentanaInput = requireEl<HTMLInputElement>('aplausoVentana');

    aplausoVelInput.value = String(APLAUSO_VELOCIDAD_DEFAULT);
    aplausoVelInput.addEventListener('change', () => {
      const v = numOpcion(Number(aplausoVelInput.value), APLAUSO_VELOCIDAD_DEFAULT, 0.5, 20);
      gesto.aplausoOpciones.velocidadMin = v;
      aplausoVelInput.value = String(v);
    });

    aplausoConfirmaInput.value = String(APLAUSO_CONFIRMA_DEFAULT);
    aplausoConfirmaInput.addEventListener('change', () => {
      const v = numOpcion(Number(aplausoConfirmaInput.value), APLAUSO_CONFIRMA_DEFAULT, 0.1, 0.9);
      gesto.aplausoOpciones.distanciaConfirma = v;
      aplausoConfirmaInput.value = String(v);
    });

    aplausoPerdidaInput.value = String(APLAUSO_PERDIDA_DEFAULT);
    aplausoPerdidaInput.addEventListener('change', () => {
      const v = numOpcion(Number(aplausoPerdidaInput.value), APLAUSO_PERDIDA_DEFAULT, 0.1, 2);
      gesto.aplausoOpciones.distanciaPerdida = v;
      aplausoPerdidaInput.value = String(v);
    });

    aplausoVentanaInput.value = String(Math.round(APLAUSO_VENTANA_PERDIDA_DEFAULT * 1000));
    aplausoVentanaInput.addEventListener('change', () => {
      const ms = numOpcion(Number(aplausoVentanaInput.value), APLAUSO_VENTANA_PERDIDA_DEFAULT * 1000, 50, 1000);
      gesto.aplausoOpciones.ventanaPerdidaS = ms / 1000;
      aplausoVentanaInput.value = String(ms);
    });

    const manoConduceSel = requireEl<HTMLSelectElement>('manoConduce');
    const inclArribaInput = requireEl<HTMLInputElement>('inclArriba');
    const inclAbajoInput = requireEl<HTMLInputElement>('inclAbajo');
    const inclHistInput = requireEl<HTMLInputElement>('inclHist');

    manoConduceSel.value = 'Right';
    manoConduceSel.addEventListener('change', () => {
      gesto.manoConduce = manoConduceSel.value === 'Left' ? 'Left' : 'Right';
    });

    inclArribaInput.value = String(INCLINACION_OPCIONES_DEFAULT.arriba);
    inclArribaInput.addEventListener('change', () => {
      const v = numOpcion(Number(inclArribaInput.value), INCLINACION_OPCIONES_DEFAULT.arriba, 0.1, 0.95);
      gesto.inclOpciones.arriba = v;
      inclArribaInput.value = String(v);
    });

    inclAbajoInput.value = String(INCLINACION_OPCIONES_DEFAULT.abajo);
    inclAbajoInput.addEventListener('change', () => {
      const v = numOpcion(Number(inclAbajoInput.value), INCLINACION_OPCIONES_DEFAULT.abajo, -0.95, -0.1);
      gesto.inclOpciones.abajo = v;
      inclAbajoInput.value = String(v);
    });

    inclHistInput.value = String(INCLINACION_OPCIONES_DEFAULT.histeresis);
    inclHistInput.addEventListener('change', () => {
      const v = numOpcion(Number(inclHistInput.value), INCLINACION_OPCIONES_DEFAULT.histeresis, 0, 0.3);
      gesto.inclOpciones.histeresis = v;
      inclHistInput.value = String(v);
    });

    let latest: TrackingFrame | null = null;
    let latestAt = 0;
    let frames = 0;
    let fpsSince = performance.now();

    // Gestos: el estado avanza solo con fotogramas nuevos (el cooldown usa segundos).
    const gesto: GestoState = {
      aplausoEstado: aplausoEstadoInicial,
      aplausoUltimo: null,
      aplausoOpciones: { ...APLAUSO_OPCIONES_DEFAULT },
      pinchMinL: new MinimoVentana(PELLIZCO_VENTANA_S),
      pinchMinR: new MinimoVentana(PELLIZCO_VENTANA_S),
      inclL: null,
      inclR: null,
      inclOpciones: { ...INCLINACION_OPCIONES_DEFAULT },
      manoConduce: 'Right',
      objetivoConduce: null,
      velocidadRover: 0,
      conduccionMs: null,
    };

    const loop = (): void => {
      const now = performance.now();
      const frame = tracker.detect(video, now);

      // La señal se alimenta solo con fotogramas nuevos; el tiempo decide "detenido".
      if (frame) {
        latest = frame;
        latestAt = now;
        legs.feed(now / 1000, legSample(frame.pose));

        const shoulderPx = frame.pose ? shoulderWidthPx(frame.pose, frame.width, frame.height) : null;
        const ap = aplauso(
          frame.hands,
          shoulderPx,
          frame.width,
          frame.height,
          gesto.aplausoEstado,
          now / 1000,
          gesto.aplausoOpciones,
        );
        gesto.aplausoEstado = ap.estado;
        gesto.aplausoUltimo = ap;

        // Mínimos de pellizco de los últimos 5 s, por mano visible.
        const pinchL = pellizco(frame.hands.find((hand) => hand.label === 'Left'), frame.width, frame.height);
        const pinchR = pellizco(frame.hands.find((hand) => hand.label === 'Right'), frame.width, frame.height);
        if (pinchL) gesto.pinchMinL.push(now / 1000, pinchL.distancia);
        if (pinchR) gesto.pinchMinR.push(now / 1000, pinchR.distancia);

        // Inclinación de cada mano. Sin datos fiables, la zona previa vuelve a neutral (histéresis).
        const leftHand = frame.hands.find((hand) => hand.label === 'Left');
        const rightHand = frame.hands.find((hand) => hand.label === 'Right');
        gesto.inclL = inclinacionMano(leftHand, frame.width, frame.height, gesto.inclL?.zona ?? 'neutral', gesto.inclOpciones);
        gesto.inclR = inclinacionMano(rightHand, frame.width, frame.height, gesto.inclR?.zona ?? 'neutral', gesto.inclOpciones);

        // Objetivo del rover: solo la mano que conduce; sin mano fiable, null (el rover desacelera).
        const conduce = gesto.manoConduce === 'Left' ? gesto.inclL : gesto.inclR;
        gesto.objetivoConduce = objetivoConduccion(conduce?.zona ?? null);

        if (canvas.width !== frame.width || canvas.height !== frame.height) {
          canvas.width = frame.width;
          canvas.height = frame.height;
        }
        drawTracking(ctx, frame);
        frames += 1;
      }

      const legState = legs.state(now / 1000);
      drawSignal(signalCtx, legState, now / 1000);
      if (latest) showValues(latest, legState);

      if (latest && now - latestAt <= GESTO_STALE_S * 1000) {
        showGestos(latest, gesto, now / 1000);
      } else {
        showGestosSinDatos();
      }

      // Rover: avanza en cada vuelta del bucle. El objetivo solo cuenta si el último fotograma es reciente;
      // si no, el rover desacelera hacia cero (no se detiene de golpe).
      const fresco = latest !== null && now - latestAt <= GESTO_STALE_S * 1000;
      const dtS = gesto.conduccionMs === null ? 0 : Math.min(0.1, (now - gesto.conduccionMs) / 1000);
      gesto.conduccionMs = now;
      gesto.velocidadRover = avanzaConduccion(
        gesto.velocidadRover,
        fresco ? gesto.objetivoConduce : null,
        dtS,
        CONDUCCION_OPCIONES_DEFAULT,
      );

      showSonoro(micSonoro, micError, gesto.aplausoEstado.ultimoDisparo, now / 1000);

      if (now - fpsSince >= 1000) {
        setValue('fps', `${((frames * 1000) / (now - fpsSince)).toFixed(0)}`);
        frames = 0;
        fpsSince = now;
      }

      requestAnimationFrame(loop);
    };

    requestAnimationFrame(loop);
  } catch (err) {
    status.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
    console.error(err);
  }
}

void main();
