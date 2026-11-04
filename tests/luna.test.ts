// Pruebas de la máquina de estados de la misión lunar (src/game/luna.ts).
// Ejecutar: node --test tests/luna.test.ts  (Node 22.6+ quita los tipos de forma nativa; sin dependencias).
// Este archivo vive fuera de src/, así que `npm run build` no lo comprueba con tsc.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DISTANCIA_ROCA_M,
  MisionLuna,
  POSICION_ROCA,
  esGolpe,
  giroVolanteGradosS,
  type EntradaLuna,
} from '../src/game/luna.ts';

/** Fotograma sin nada que hacer; cada prueba cambia solo lo que le importa. */
function entrada(extra: Partial<EntradaLuna> = {}): EntradaLuna {
  return {
    ahoraS: 0,
    dtS: 1 / 30,
    aplauso: false,
    metros: 0,
    volanteGrados: null,
    velocidadGolpeHombrosS: 0,
    agarreNuevo: false,
    ...extra,
  };
}

/** Misión ya dentro de la escena, sentada en el LRV (aplauso de entrada hecho). */
function sentada(posicion?: { x: number; z: number }): MisionLuna {
  const m = new MisionLuna('sentado_en_LRV', posicion);
  return m;
}

/** Posición a `metros` de la roca, en el lado de −X (no entra en la zona de la roca). */
const LEJOS = { x: POSICION_ROCA.x - 5, z: POSICION_ROCA.z };
/** Posición dentro de la zona de la roca (1 m). */
const CERCA = { x: POSICION_ROCA.x - 1, z: POSICION_ROCA.z };

test('el primer aplauso dentro de la escena sienta al jugador', () => {
  const m = new MisionLuna();
  assert.equal(m.estado, 'entrando_museo');
  m.update(entrada({ aplauso: true }));
  assert.equal(m.estado, 'sentado_en_LRV');
});

test('sentado pasa a conducir al empezar a caminar', () => {
  const m = sentada();
  m.update(entrada({ metros: 0 }));
  assert.equal(m.estado, 'sentado_en_LRV');
  m.update(entrada({ metros: 0.02 }));
  assert.equal(m.estado, 'conduciendo');
});

test('el volante gira a la derecha con ángulo positivo y no gira dentro de la zona neutral', () => {
  const m = sentada();
  m.update(entrada({ metros: 0.02, volanteGrados: 5, dtS: 1 }));
  assert.equal(m.rumboGrados, 0, 'dentro de la zona neutral no gira');
  m.update(entrada({ metros: 0.02, volanteGrados: 30, dtS: 1 }));
  assert.ok(m.rumboGrados > 0, 'con volante a la derecha el rumbo crece');
});

test('el giro del volante es proporcional y tiene tope de 60°/s', () => {
  assert.equal(giroVolanteGradosS(5), 0);
  assert.equal(giroVolanteGradosS(30), 20);
  assert.equal(giroVolanteGradosS(-30), -20);
  assert.equal(giroVolanteGradosS(180), 60);
});

test('el avance sigue el rumbo: con rumbo 0 el LRV va hacia −Z', () => {
  const m = sentada(LEJOS);
  const antes = m.posicion;
  m.update(entrada({ metros: 0.5 }));
  assert.ok(m.posicion.z < antes.z);
  assert.ok(Math.abs(m.posicion.x - antes.x) < 1e-9);
});

test('la roca se resalta a 2 m o menos y no antes', () => {
  const dentro = new MisionLuna('conduciendo', { x: POSICION_ROCA.x - DISTANCIA_ROCA_M, z: POSICION_ROCA.z });
  assert.equal(dentro.rocaResaltada, true);
  const fuera = new MisionLuna('conduciendo', { x: POSICION_ROCA.x - DISTANCIA_ROCA_M - 0.01, z: POSICION_ROCA.z });
  assert.equal(fuera.rocaResaltada, false);
});

test('conducir cerca de la roca cambia a cerca_de_roca y al alejarse vuelve a conduciendo', () => {
  const m = new MisionLuna('conduciendo', CERCA);
  m.update(entrada({ metros: 0 }));
  assert.equal(m.estado, 'cerca_de_roca');
  const lejos = new MisionLuna('cerca_de_roca', LEJOS);
  lejos.update(entrada({ metros: 0 }));
  assert.equal(lejos.estado, 'conduciendo');
});

test('un golpe lejos de la roca no hace nada', () => {
  const m = new MisionLuna('conduciendo', LEJOS);
  m.update(entrada({ velocidadGolpeHombrosS: 3 }));
  assert.equal(m.estado, 'conduciendo');
});

test('el golpe necesita al menos 1.5 hombros/s hacia abajo', () => {
  assert.equal(esGolpe(1.49), false);
  assert.equal(esGolpe(1.5), true);
  assert.equal(esGolpe(-4), false, 'una muñeca que sube no cuenta');
  const flojo = new MisionLuna('cerca_de_roca', CERCA);
  flojo.update(entrada({ velocidadGolpeHombrosS: 1.4 }));
  assert.equal(flojo.estado, 'cerca_de_roca');
  const fuerte = new MisionLuna('cerca_de_roca', CERCA);
  fuerte.update(entrada({ velocidadGolpeHombrosS: 1.5 }));
  assert.equal(fuerte.estado, 'golpeando');
});

test('golpe seguido de agarre dentro de 1 s recoge la muestra', () => {
  const m = new MisionLuna('cerca_de_roca', CERCA);
  m.update(entrada({ ahoraS: 10, velocidadGolpeHombrosS: 2 }));
  assert.equal(m.estado, 'golpeando');
  const eventos = m.update(entrada({ ahoraS: 10.5, agarreNuevo: true }));
  assert.equal(m.estado, 'muestra_recogida');
  assert.ok(eventos.some((e) => e.tipo === 'muestraRecogida'));
});

test('golpe sin agarre a tiempo: no hay muestra y el golpe falla', () => {
  const m = new MisionLuna('cerca_de_roca', CERCA);
  m.update(entrada({ ahoraS: 10, velocidadGolpeHombrosS: 2 }));
  assert.equal(m.estado, 'golpeando');
  // El agarre llega a 1.2 s del golpe: ya fuera de la ventana de 1 s.
  const eventos = m.update(entrada({ ahoraS: 11.2, agarreNuevo: true }));
  assert.notEqual(m.estado, 'muestra_recogida');
  assert.notEqual(m.estado, 'agarrando');
  assert.ok(eventos.some((e) => e.tipo === 'golpeFallido'));
  assert.equal(m.estado, 'cerca_de_roca', 'sigue cerca de la roca y puede intentarlo otra vez');
  assert.ok(!eventos.some((e) => e.tipo === 'muestraRecogida'));
});

test('el aplauso en cualquier estado de la escena devuelve al museo y congela el resto', () => {
  const m = sentada();
  const eventos = m.update(entrada({ aplauso: true }));
  assert.equal(m.estado, 'volviendo');
  assert.ok(eventos.some((e) => e.tipo === 'volver'));
  m.update(entrada({ metros: 1, volanteGrados: 40, dtS: 1 }));
  assert.equal(m.estado, 'volviendo', 'no vuelve a cambiar tras volver');
});

test('volver sin recoger la muestra es posible y no tiene sanción', () => {
  const m = new MisionLuna('conduciendo', LEJOS);
  const eventos = m.update(entrada({ aplauso: true }));
  assert.equal(m.estado, 'volviendo');
  assert.ok(eventos.some((e) => e.tipo === 'volver'));
  assert.ok(!eventos.some((e) => e.tipo === 'golpeFallido' || e.tipo === 'muestraRecogida'));
});

test('tras recoger la muestra, el aplauso vuelve al museo', () => {
  const m = new MisionLuna('muestra_recogida', CERCA);
  m.update(entrada({ aplauso: true }));
  assert.equal(m.estado, 'volviendo');
});
