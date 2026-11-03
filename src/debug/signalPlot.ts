import { SERIES_WINDOW_S, type LegState } from '../tracking/metrics';

/** Rango vertical mínimo de la gráfica, en % de la altura del cuerpo. */
const MIN_RANGE_PCT = 6;

/**
 * Dibuja la señal diferencia (izq. − der.) en vivo: línea, umbrales de amplitud mínima,
 * picos marcados (verde = contó, gris = rechazado) y huecos cuando la rodilla no es visible.
 */
export function drawSignal(ctx: CanvasRenderingContext2D, state: LegState, now: number): void {
  const { width: w, height: h } = ctx.canvas;
  const pad = 6;
  const amp = state.swingPct;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, w, h);

  // Escala vertical simétrica: al menos ±MIN_RANGE_PCT, o lo que ocupe la señal visible.
  let maxAbs = Math.max(MIN_RANGE_PCT, amp * 2);
  for (const p of state.series) if (p.v !== null) maxAbs = Math.max(maxAbs, Math.abs(p.v) * 1.1);
  const yOf = (v: number): number => h / 2 - (v / maxAbs) * (h / 2 - pad);
  const xOf = (t: number): number => w - ((now - t) / SERIES_WINDOW_S) * w;

  // Línea de cero y umbrales de amplitud mínima (+/-).
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#30363d';
  line(ctx, 0, h / 2, w, h / 2);
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = '#ffb703';
  line(ctx, 0, yOf(amp), w, yOf(amp));
  line(ctx, 0, yOf(-amp), w, yOf(-amp));
  ctx.setLineDash([]);

  // Señal: una línea simple; los huecos (rodilla no visible) cortan el trazo.
  ctx.strokeStyle = '#58a6ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  let drawing = false;
  for (const p of state.series) {
    if (p.v === null) {
      drawing = false;
      continue;
    }
    const x = xOf(p.t);
    const y = yOf(p.v);
    if (drawing) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
    drawing = true;
  }
  ctx.stroke();

  // Picos: verde si contaron, gris si se rechazaron.
  for (const p of state.series) {
    if (p.v === null || p.peak === null) continue;
    ctx.beginPath();
    ctx.arc(xOf(p.t), yOf(p.v), 4, 0, Math.PI * 2);
    ctx.fillStyle = p.peak === 'step' ? '#3fb950' : '#6e7681';
    ctx.fill();
  }

  // Etiquetas de escala.
  ctx.fillStyle = '#8b949e';
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText(`+${amp.toFixed(1)} %`, 4, yOf(amp) - 3);
  ctx.fillText(`−${amp.toFixed(1)} %`, 4, yOf(-amp) + 12);
  ctx.fillText(`±${maxAbs.toFixed(0)} %`, w - 40, 12);
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
