import type { TrackedHand, TrackingFrame } from '../tracking/tracker';
import { FACE_IDX, HAND_IDX, POSE_IDX } from '../tracking/metrics';

const COLORS = {
  face: 'rgba(0, 229, 255, 0.55)',
  faceEye: '#00e5ff',
  shoulder: '#ff9f1c',
  knee: '#b388ff',
  handLeft: '#7CFC00',
  handRight: '#ff4f9a',
};

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function line(
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  color: string,
): void {
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
}

/** Dibuja cara, hombros, rodillas y manos en un canvas del mismo tamaño que el vídeo. */
export function drawTracking(ctx: CanvasRenderingContext2D, frame: TrackingFrame): void {
  const { width: w, height: h } = frame;
  ctx.clearRect(0, 0, w, h);

  if (frame.face) {
    for (const p of frame.face) dot(ctx, p.x * w, p.y * h, 1.2, COLORS.face);
    for (const idx of [FACE_IDX.eyeOuterA, FACE_IDX.eyeOuterB]) {
      const p = frame.face[idx];
      dot(ctx, p.x * w, p.y * h, 5, COLORS.faceEye);
    }
  }

  if (frame.pose) {
    const l = frame.pose[POSE_IDX.leftShoulder];
    const r = frame.pose[POSE_IDX.rightShoulder];
    line(ctx, l.x * w, l.y * h, r.x * w, r.y * h, COLORS.shoulder);
    dot(ctx, l.x * w, l.y * h, 6, COLORS.shoulder);
    dot(ctx, r.x * w, r.y * h, 6, COLORS.shoulder);

    // Rodillas: el indicador de caminar. Se dibujan siempre; el color no cambia con la visibilidad.
    for (const idx of [POSE_IDX.leftKnee, POSE_IDX.rightKnee]) {
      const k = frame.pose[idx];
      dot(ctx, k.x * w, k.y * h, 7, COLORS.knee);
    }
  }

  for (const hand of frame.hands) drawHand(ctx, hand, w, h);
}

function drawHand(ctx: CanvasRenderingContext2D, hand: TrackedHand, w: number, h: number): void {
  const color = hand.label === 'Right' ? COLORS.handRight : COLORS.handLeft;
  const lm = hand.landmarks;

  for (const p of lm) dot(ctx, p.x * w, p.y * h, 3, color);

  // Pulgar-índice: el segmento que se usa para el pellizco.
  const thumb = lm[HAND_IDX.thumbTip];
  const index = lm[HAND_IDX.indexTip];
  line(ctx, thumb.x * w, thumb.y * h, index.x * w, index.y * h, color);
  dot(ctx, thumb.x * w, thumb.y * h, 5, '#ffffff');
  dot(ctx, index.x * w, index.y * h, 5, '#ffffff');
}
