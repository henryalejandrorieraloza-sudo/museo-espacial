// Pruebas de la máquina de estados de la misión lunar (src/game/luna.ts).
// Ejecutar: node --test tests/luna.test.ts  (Node 22.6+ quita los tipos de forma nativa; sin dependencias).
// Este archivo vive fuera de src/, así que `npm run build` no lo comprueba con tsc.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DIRECCION_MAX_GRADOS,
  DISTANCIA_ROCA_M,
  MisionLuna,
  direccionVolanteGrados,
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
    jugador: { x: 0, z: 0 },
    ...extra,
  };
}

/** Misión ya dentro de la escena, sentada en el LRV (aplauso de entrada hecho), con rumbo 0 (hacia −Z). */
function sentada(posicion?: { x: number; z: number }): MisionLuna {
  const m = new MisionLuna('sentado_en_LRV', posicion, 0);
  return m;
}

/** Posición a `metros` de la roca, en el lado de −X (no entra en la zona de la roca). */
const LEJOS = { x: POSICION_ROCA.x - 5, z: POSICION_ROCA.z };
/** Posición dentro de la zona de la roca (1 m). */
const CERCA = { x: POSICION_ROCA.x - 1, z: POSICION_ROCA.z };

test('el primer aplauso dentro de la escena sienta al jugador', () => {
  const m = new MisionLuna();
  assert.equal(m.estado, 'entrando_museo');
  m.update(entrada({ aplauso: true, jugador: m.posicion }));
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

test('bajarse del LRV deja la posición del LRV donde estaba y pasa a pie', () => {
  const m = sentada(LEJOS);
  m.update(entrada({ metros: 0.5 }));
  const donde = m.posicion;
  const eventos = m.update(entrada({ metros: 0.5, bajarse: true }));
  assert.equal(m.estado, 'a_pie');
  assert.equal(m.aPie, true);
  assert.deepEqual(m.posicion, donde, 'el LRV se detiene: no avanza en el fotograma de bajarse');
  assert.ok(eventos.some((e) => e.tipo === 'bajado' && !e.conMuestra));
  m.update(entrada({ metros: 1, volanteGrados: 40, dtS: 1 }));
  assert.deepEqual(m.posicion, donde, 'a pie, la caminata ya no mueve el LRV');
});

test('bajarse conserva la muestra; el aplauso a pie vuelve al museo y el halo sigue apagado', () => {
  const m = new MisionLuna('cerca_de_roca', CERCA);
  m.update(entrada({ ahoraS: 10, velocidadGolpeHombrosS: 2 }));
  m.update(entrada({ ahoraS: 10.5, agarreNuevo: true }));
  assert.equal(m.estado, 'muestra_recogida');
  const eventos = m.update(entrada({ ahoraS: 11, bajarse: true }));
  assert.equal(m.estado, 'a_pie');
  assert.ok(eventos.some((e) => e.tipo === 'bajado' && e.conMuestra));
  assert.equal(m.muestraRecogida, true);
  assert.equal(m.haloVisible, false);
  const lejos = { x: m.posicion.x + 50, z: m.posicion.z };
  m.update(entrada({ aplauso: true, jugador: lejos }));
  assert.equal(m.estado, 'volviendo');
});

test('bajado sin muestra, el aplauso junto al LRV vuelve a sentarlo y lejos no', () => {
  const m = sentada(LEJOS);
  m.update(entrada({ bajarse: true }));
  const ev = m.update(entrada({ aplauso: true, jugador: { x: LEJOS.x + 20, z: LEJOS.z } }));
  assert.equal(m.estado, 'a_pie');
  assert.ok(ev.some((e) => e.tipo === 'lejosDelLRV'));
  m.update(entrada({ aplauso: true, jugador: { x: LEJOS.x + 2, z: LEJOS.z } }));
  assert.equal(m.estado, 'sentado_en_LRV');
});

test('no se baja a pie, ni durante el golpe (perdería el agarre)', () => {
  const llegada = new MisionLuna();
  llegada.update(entrada({ bajarse: true }));
  assert.equal(llegada.estado, 'entrando_museo');
  const m = new MisionLuna('cerca_de_roca', CERCA);
  m.update(entrada({ ahoraS: 10, velocidadGolpeHombrosS: 2 }));
  m.update(entrada({ ahoraS: 10.2, bajarse: true }));
  assert.equal(m.estado, 'golpeando');
});

test('la dirección de las ruedas sigue al volante, con el signo del giro, y se queda sin manos', () => {
  assert.equal(direccionVolanteGrados(5), 0);
  assert.equal(direccionVolanteGrados(70), DIRECCION_MAX_GRADOS);
  assert.equal(direccionVolanteGrados(180), DIRECCION_MAX_GRADOS);
  assert.ok(direccionVolanteGrados(-30) < 0);
  const m = sentada(LEJOS);
  m.update(entrada({ volanteGrados: 40 }));
  assert.ok(m.direccionGrados > 0, 'parado, el volante ya gira las ruedas');
  const antes = m.direccionGrados;
  m.update(entrada({ volanteGrados: null, metros: 0.1 }));
  assert.equal(m.direccionGrados, antes, 'sin manos, el último ángulo');
  m.update(entrada({ volanteGrados: null, metros: 0 }));
  assert.equal(m.direccionGrados, antes, 'al detenerse, mantiene el ángulo');
});

test('con teclado se puede retroceder desde parado', () => {
  const m = sentada(LEJOS);
  const antes = m.posicion;
  m.update(entrada({ metros: -0.2 }));
  assert.equal(m.estado, 'conduciendo');
  assert.ok(m.posicion.z > antes.z, 'con rumbo 0, retroceder va hacia +Z');
});

test('con teclado, espacio sentado no vuelve al museo; la E mantenida (volver) sí', () => {
  const m = sentada();
  const sinVolver = m.update(entrada({ aplauso: true, aplausoVuelve: false, jugador: m.posicion }));
  assert.equal(sinVolver.some((e) => e.tipo === 'volver'), false);
  assert.notEqual(m.estado, 'volviendo');
  const eventos = m.update(entrada({ volver: true, jugador: m.posicion }));
  assert.equal(eventos.some((e) => e.tipo === 'volver'), true);
  assert.equal(m.estado, 'volviendo');
});

test('con cámara, el aplauso sentado sigue volviendo al museo', () => {
  const m = sentada();
  const eventos = m.update(entrada({ aplauso: true, jugador: m.posicion }));
  assert.equal(eventos.some((e) => e.tipo === 'volver'), true);
});
