import '../styles.css';
import { Tracker, type TrackingFrame } from '../tracking/tracker';
import {
  ShoulderOscillation,
  headRollDeg,
  pinchRatio,
  shoulderCenterY,
  shoulderWidthPx,
  wristDistance,
  type ShoulderState,
} from '../tracking/metrics';
import { drawTracking } from '../ui/overlay';
import { requireEl, setValue } from '../ui/dom';

const fmt = (value: number | null, digits: number, unit = ''): string =>
  value === null || !Number.isFinite(value) ? '—' : `${value.toFixed(digits)}${unit}`;

async function openWebcam(video: HTMLVideoElement): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
}

function showValues(frame: TrackingFrame, shoulders: ShoulderState): void {
  const { width: w, height: h } = frame;

  const roll = frame.face ? headRollDeg(frame.face, w, h) : null;
  setValue('roll', fmt(roll, 1, '°'));

  setValue('amplitude', fmt(shoulders.amplitude * 100, 1, ' %'));
  setValue('steps', String(shoulders.steps));
  setValue('cadence', fmt(shoulders.cadence, 2));
  setValue('walking', shoulders.walking ? 'caminando' : 'detenido');

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
  const status = requireEl('status');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo obtener el contexto 2D del canvas');

  try {
    status.textContent = 'Pidiendo acceso a la webcam…';
    await openWebcam(video);

    const tracker = await Tracker.create((message) => {
      status.textContent = message;
    });
    status.textContent = 'Seguimiento activo';

    const shoulders = new ShoulderOscillation();
    let lastRawY: number | null = null;
    let latest: TrackingFrame | null = null;
    let shoulderNow: ShoulderState = shoulders.update(0, null);

    let frames = 0;
    let fpsSince = performance.now();

    const loop = (): void => {
      const now = performance.now();
      const frame = tracker.detect(video, now);

      if (frame) {
        latest = frame;
        lastRawY = frame.pose ? shoulderCenterY(frame.pose) : null;

        if (canvas.width !== frame.width || canvas.height !== frame.height) {
          canvas.width = frame.width;
          canvas.height = frame.height;
        }
        drawTracking(ctx, frame);
        frames += 1;
      }

      // Hombros: se alimenta solo con fotogramas nuevos; el paso del tiempo decide "detenido".
      shoulderNow = shoulders.update(now / 1000, frame ? lastRawY : null);

      if (latest) showValues(latest, shoulderNow);

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
