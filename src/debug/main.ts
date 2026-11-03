import '../styles.css';
import { Tracker, type TrackingFrame } from '../tracking/tracker';
import {
  LegAlternationCounter,
  POSE_IDX,
  SWING_PCT_DEFAULT,
  clampSwingPct,
  headRollDeg,
  legSample,
  pinchRatio,
  shoulderCenterY,
  shoulderWidthPx,
  wristDistance,
  type LegState,
} from '../tracking/metrics';
import { checkFraming, KNEE_VISIBILITY_MIN, type FramingStatus } from '../tracking/framing';
import { drawTracking } from '../ui/overlay';
import { requireEl, setValue } from '../ui/dom';
import { drawSignal } from './signalPlot';

const fmt = (value: number | null, digits: number, unit = ''): string =>
  value === null || !Number.isFinite(value) ? '—' : `${value.toFixed(digits)}${unit}`;

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

    const legs = new LegAlternationCounter(SWING_PCT_DEFAULT);
    swingInput.value = String(legs.amplitudePct);

    swingInput.addEventListener('change', () => {
      const pct = clampSwingPct(Number(swingInput.value));
      legs.setSwingPct(pct);
      swingInput.value = String(pct);
    });

    let latest: TrackingFrame | null = null;
    let frames = 0;
    let fpsSince = performance.now();

    const loop = (): void => {
      const now = performance.now();
      const frame = tracker.detect(video, now);

      // La señal se alimenta solo con fotogramas nuevos; el tiempo decide "detenido".
      if (frame) {
        latest = frame;
        legs.feed(now / 1000, legSample(frame.pose));

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
