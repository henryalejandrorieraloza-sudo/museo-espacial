// Pruebas de los topes de velocidad de la misión lunar (src/game/luna.ts): a pie, el LRV y su aceleración y frenado.
// Ejecutar: node --test tests/velocidadLuna.test.ts  (Node 22.6+ quita los tipos de forma nativa; sin dependencias).
// Las estimaciones (MOON_WALK_MAX_SPEED, LRV_MAX_SPEED, LRV_ACCEL, LRV_BRAKE) están en src/game/luna.ts.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LRV_ACCEL,
  LRV_BRAKE,
  LRV_MAX_SPEED,
  MOON_WALK_MAX_SPEED,
  MisionLuna,
  acercarVelocidadLRV,
  metrosAPieLuna,
  objetivoVelocidadLRV,
  type EntradaLuna,
} from '../src/game/luna.ts';
import { Caminata, type OpcionesCaminata } from '../src/game/caminata.ts';
import { LM } from '../src/visual/sitioApollo17.ts';

const DT = 1 / 30;
/** Margen para errores de coma flotante. */
const EPS = 1e-9;

/** Fotograma de la misión con el LRV conduciendo, sin nada más que hacer. */
function fotograma(extra: Partial<EntradaLuna> = {}): EntradaLuna {
  return {
    ahoraS: 0,
    dtS: DT,
    aplauso: false,
    metros: 0,
    volanteGrados: null,
    velocidadGolpeHombrosS: 0,
    agarreNuevo: false,
    jugador: { x: 0, z: 0 },
    ...extra,
  };
}

// --- A pie -----------------------------------------------------------------------------------------------------

test('a pie en la Luna, el avance por fotograma nunca pasa de MOON_WALK_MAX_SPEED', () => {
  for (const metros of [0.01, 0.05, 0.1, 0.5, 2]) {
    assert.ok(metrosAPieLuna(metros, DT) <= MOON_WALK_MAX_SPEED * DT + EPS, `metros ${metros}`);
  }
  // Por debajo del tope, no cambia nada.
  assert.equal(metrosAPieLuna(0.02, DT), 0.02);
  assert.equal(metrosAPieLuna(0, DT), 0);
  assert.equal(metrosAPieLuna(-0.5, DT), -MOON_WALK_MAX_SPEED * DT);
});

test('con cadencia alta y velocidad de Opciones alta, la caminata a pie no pasa de 1.2 m/s', () => {
  // Opciones al máximo (3 m/s) y 10 pasos por segundo de 0.4 m: la caminata del museo iría a 3 m/s.
  const opciones: OpcionesCaminata = { metrosPorPaso: 0.4, velocidadMax: 3, tiempoAceleracion: 0.5 };
  const caminata = new Caminata();
  let t = 0;
  let pasosAcumulados = 0;
  let velocidadMaxVista = 0;
  for (let i = 0; i < 300; i++) {
    t += DT;
    // Pasos enteros: 10 pasos/s repartidos por fotograma.
    const pasosHastaAhora = Math.floor(t * 10);
    const pasos = pasosHastaAhora - pasosAcumulados;
    pasosAcumulados = pasosHastaAhora;
    const metros = caminata.avanzar(t, DT, pasos, opciones);
    const aPie = metrosAPieLuna(metros, DT);
    velocidadMaxVista = Math.max(velocidadMaxVista, aPie / DT);
  }
  assert.ok(velocidadMaxVista <= MOON_WALK_MAX_SPEED + EPS, `velocidad a pie ${velocidadMaxVista} m/s`);
  // Y sí llega al tope, así que el tope se alcanza y no se queda corto.
  assert.ok(velocidadMaxVista > MOON_WALK_MAX_SPEED - 0.05, `no llega al tope: ${velocidadMaxVista} m/s`);
});

// --- Aceleración y frenado -------------------------------------------------------------------------------------

test('la velocidad del LRV acelera y frena como mucho a LRV_ACCEL y LRV_BRAKE, y se para en el objetivo', () => {
  let v = 0;
  let maxAcel = 0;
  for (let i = 0; i < 30 * 30; i++) {
    const previa = v;
    v = acercarVelocidadLRV(v, LRV_MAX_SPEED, DT);
    maxAcel = Math.max(maxAcel, v - previa);
  }
  assert.ok(maxAcel <= LRV_ACCEL * DT + EPS, `aceleración ${maxAcel / DT} m/s²`);
  assert.equal(v, LRV_MAX_SPEED);

  let maxFrenado = 0;
  for (let i = 0; i < 30 * 30; i++) {
    const previa = v;
    v = acercarVelocidadLRV(v, 0, DT);
    maxFrenado = Math.max(maxFrenado, previa - v);
  }
  assert.ok(maxFrenado <= LRV_BRAKE * DT + EPS, `frenado ${maxFrenado / DT} m/s²`);
  assert.equal(v, 0);
});

test('el objetivo del LRV nunca pasa de LRV_MAX_SPEED aunque se camine mucho más rápido', () => {
  assert.equal(objetivoVelocidadLRV(10 * DT, DT), LRV_MAX_SPEED);
  assert.equal(objetivoVelocidadLRV(-10 * DT, DT), -LRV_MAX_SPEED);
  assert.equal(objetivoVelocidadLRV(0, DT), 0);
  assert.equal(objetivoVelocidadLRV(1, 0), 0, 'sin tiempo no hay velocidad');
});

// --- LRV en la misión --------------------------------------------------------------------------------------------

/** LRV en un tramo libre (lejos del LM y de la roca), conduciendo hacia el norte (rumbo 0). */
function lrvLibre(): MisionLuna {
  return new MisionLuna('conduciendo', { x: LM.x - 150, z: LM.z }, 0);
}

/** Velocidad (m/s) entre dos posiciones de un fotograma. */
function velocidad(a: { z: number }, b: { z: number }): number {
  return Math.abs(b.z - a.z) / DT;
}

test('el LRV en la misión nunca pasa de 5 m/s y acelera con suavidad', () => {
  const m = lrvLibre();
  let previa = m.posicion;
  let velPrevia = 0;
  let maxVel = 0;
  let maxSubida = 0;
  // Caminando muy rápido en el sitio (3 m/s): la caminata quiere más que el tope del LRV.
  for (let i = 0; i < 30 * 15; i++) {
    m.update(fotograma({ metros: 3 * DT }));
    const ahora = m.posicion;
    const v = velocidad(previa, ahora);
    maxVel = Math.max(maxVel, v);
    maxSubida = Math.max(maxSubida, v - velPrevia);
    previa = ahora;
    velPrevia = v;
  }
  assert.ok(maxVel <= LRV_MAX_SPEED + 1e-6, `velocidad del LRV ${maxVel} m/s`);
  assert.ok(maxVel > LRV_MAX_SPEED - 0.1, `no llega a su tope: ${maxVel} m/s`);
  assert.ok(maxSubida <= LRV_ACCEL * DT + 1e-6, `aceleración ${maxSubida / DT} m/s²`);
});

test('al dejar de caminar, el LRV se detiene en un tiempo razonable (≤ 6 s desde 5 m/s)', () => {
  const m = lrvLibre();
  // Primero se llega a la velocidad máxima caminando rápido.
  let previa = m.posicion;
  let velPrevia = 0;
  for (let i = 0; i < 30 * 15; i++) {
    m.update(fotograma({ metros: 3 * DT }));
    velPrevia = velocidad(previa, m.posicion);
    previa = m.posicion;
  }
  assert.ok(velPrevia > LRV_MAX_SPEED - 0.1, `antes de frenar debe ir cerca del tope: ${velPrevia} m/s`);

  // Luego se deja de caminar: el LRV debe frenar hasta parar.
  let parado = false;
  let maxFrenado = 0;
  let frames = 0;
  while (frames < 30 * 6 && !parado) {
    m.update(fotograma({ metros: 0 }));
    frames++;
    const v = velocidad(previa, m.posicion);
    maxFrenado = Math.max(maxFrenado, velPrevia - v);
    parado = v < 1e-6;
    previa = m.posicion;
    velPrevia = v;
  }
  assert.ok(parado, 'el LRV debe pararse dentro de 6 s');
  const segundos = frames * DT;
  // Desde 5 m/s con 1 m/s² son 5 s: el tiempo debe ser de ese orden.
  assert.ok(segundos >= LRV_MAX_SPEED / LRV_BRAKE - 0.2 && segundos <= 6, `se detuvo en ${segundos.toFixed(2)} s`);
  assert.ok(maxFrenado <= LRV_BRAKE * DT + 1e-6, `frenado ${maxFrenado / DT} m/s²`);
});
