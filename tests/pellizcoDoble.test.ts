// Pellizco sostenido con las dos manos para bajarse del LRV (src/tracking/gestures.ts), con manos sintéticas.
// Ejecutar: node --test tests/pellizcoDoble.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PELLIZCO_DOBLE_COOLDOWN_S,
  PELLIZCO_DOBLE_SOSTENER_S,
  pellizcoDoble,
  pellizcoDobleEstadoInicial,
  type PellizcoDobleEstado,
} from '../src/tracking/gestures.ts';
import type { TrackedHand } from '../src/tracking/tracker.ts';

type Forma = 'ok' | 'puno' | 'abierta';
const W = 640;
const H = 480;

/**
 * Mano sintética en coordenadas normalizadas. 'ok': pulgar e índice juntos y los otros tres dedos extendidos.
 * 'puno': puño cerrado sujetando el volante (pulgar junto al índice, puntas dobladas hacia la palma).
 * 'abierta': todos los dedos extendidos, pulgar separado.
 */
function mano(label: 'Left' | 'Right', forma: Forma, cx = label === 'Left' ? 0.65 : 0.35): TrackedHand {
  const p = (x: number, y: number) => ({ x: cx + x, y: 0.6 + y, z: 0 });
  const lm = Array.from({ length: 21 }, () => p(0, 0));
  lm[0] = p(0, 0.1); // muñeca
  lm[9] = p(0, 0); // base del corazón: tamaño de mano 0.1
  lm[5] = p(-0.03, 0.005);
  lm[17] = p(0.05, 0.02);
  // PIP del corazón, anular y meñique.
  lm[10] = p(0, -0.035);
  lm[14] = p(0.025, -0.03);
  lm[18] = p(0.045, -0.015);
  if (forma === 'puno') {
    lm[4] = p(-0.03, 0.0);
    lm[8] = p(-0.025, 0.01);
    lm[12] = p(0, 0.03);
    lm[16] = p(0.02, 0.035);
    lm[20] = p(0.04, 0.04);
  } else {
    lm[12] = p(0, -0.09);
    lm[16] = p(0.03, -0.08);
    lm[20] = p(0.055, -0.06);
    lm[4] = forma === 'ok' ? p(-0.04, -0.04) : p(-0.08, 0.0);
    lm[8] = forma === 'ok' ? p(-0.035, -0.045) : p(-0.035, -0.09);
  }
  return { label, landmarks: lm, worldLandmarks: [], score: 1 };
}

/** Corre el gesto a 30 fps durante `segundos` y devuelve cuántas veces disparó. */
function correr(manos: TrackedHand[], desdeS: number, segundos: number, estado: { e: PellizcoDobleEstado }): number {
  let disparos = 0;
  for (let t = desdeS; t < desdeS + segundos; t += 1 / 30) {
    const r = pellizcoDoble(manos, W, H, estado.e, t);
    estado.e = r.estado;
    if (r.detectado) disparos++;
  }
  return disparos;
}

const OK = [mano('Left', 'ok'), mano('Right', 'ok')];

test('pellizco doble sostenido 0.4 s dispara una vez', () => {
  const s = { e: pellizcoDobleEstadoInicial };
  assert.equal(correr(OK, 0, PELLIZCO_DOBLE_SOSTENER_S - 0.05, s), 0, 'antes de 0.4 s no dispara');
  assert.equal(correr(OK, PELLIZCO_DOBLE_SOSTENER_S - 0.05, 3, s), 1, 'sostenerlo más no vuelve a disparar');
});

test('un solo pellizco no dispara', () => {
  const s = { e: pellizcoDobleEstadoInicial };
  assert.equal(correr([mano('Left', 'ok'), mano('Right', 'abierta')], 0, 2, s), 0);
  assert.equal(correr([mano('Left', 'ok')], 2, 2, s), 0, 'ni con una sola mano a la vista');
});

test('sujetar el volante con los puños no dispara', () => {
  const s = { e: pellizcoDobleEstadoInicial };
  assert.equal(correr([mano('Left', 'puno'), mano('Right', 'puno')], 0, 3, s), 0);
});

test('cooldown: soltar y volver a pellizcar enseguida no dispara otra vez', () => {
  const s = { e: pellizcoDobleEstadoInicial };
  assert.equal(correr(OK, 0, 0.6, s), 1);
  correr([mano('Left', 'abierta'), mano('Right', 'abierta')], 0.6, 0.1, s);
  assert.equal(correr(OK, 0.7, 0.6, s), 0, 'dentro del cooldown');
  correr([mano('Left', 'abierta'), mano('Right', 'abierta')], 1.3, 0.1, s);
  assert.equal(correr(OK, 0.4 + PELLIZCO_DOBLE_COOLDOWN_S, 0.6, s), 1, 'pasado el cooldown, sí');
});
