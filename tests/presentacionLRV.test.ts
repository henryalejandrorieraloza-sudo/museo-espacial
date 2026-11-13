// Pruebas de la presentación del LRV (src/game/presentacionLRV.ts): guion, duración, voz y saltar.
// Ejecutar: node --test tests/presentacionLRV.test.ts  (Node 22.6+ quita los tipos de forma nativa; sin dependencias).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  GUION,
  MARGEN_VOZ_S,
  PRIMERA_ESCENA_SALTABLE,
  PresentacionLRV,
  SEGUNDOS_LISTO,
  duracionMinimaS,
  poseEn,
  type EventoPresentacion,
} from '../src/game/presentacionLRV.ts';

const es = JSON.parse(readFileSync(new URL('../src/i18n/es.json', import.meta.url), 'utf8')) as Record<string, string>;
const en = JSON.parse(readFileSync(new URL('../src/i18n/en.json', import.meta.url), 'utf8')) as Record<string, string>;

/** Avanza la presentación a pasos de `dt` hasta `fin` segundos; la voz termina `vozS` s después de cada frase. */
function recorrer(p: PresentacionLRV, opciones: { vozS?: number | null; dt?: number; hastaS?: number } = {}): { eventos: EventoPresentacion[]; s: number } {
  const { vozS = 1, dt = 0.05, hastaS = 300 } = opciones;
  const eventos: EventoPresentacion[] = [...p.iniciar()];
  let finVoz = vozS === null ? Infinity : vozS;
  let s = 0;
  while (s < hastaS && p.fase !== 'terminada') {
    s += dt;
    finVoz -= dt;
    if (finVoz <= 0) {
      p.terminoVoz();
      finVoz = Infinity;
    }
    for (const e of p.actualizar(dt)) {
      eventos.push(e);
      if ((e.tipo === 'tramo' || e.tipo === 'listo') && vozS !== null) finVoz = vozS;
    }
  }
  return { eventos, s };
}

test('el orden de las escenas es el pedido: introducción, chasis, ruedas y asientos, electrónica, energía, propulsión y cierre', () => {
  assert.deepEqual(
    GUION.map((e) => e.id),
    ['introduccion', 'chasis', 'ruedas_asientos', 'electronica', 'energia', 'propulsion', 'cierre'],
  );
});

test('la animación dura entre 60 y 90 s', () => {
  const d = duracionMinimaS();
  assert.ok(d >= 60 && d <= 90, `duración mínima ${d} s`);
});

test('todas las frases y rótulos existen en español y en inglés', () => {
  for (const escena of GUION) {
    for (const tramo of escena.tramos) {
      const claves = [tramo.narracion, ...tramo.marcas.map((m) => m.rotulo)].filter((c): c is NonNullable<typeof c> => c !== null);
      for (const clave of claves) {
        assert.ok(es[clave], `falta ${clave} en es.json`);
        assert.ok(en[clave], `falta ${clave} en en.json`);
      }
    }
  }
  for (const clave of ['pres_listo', 'pres_peso_tierra', 'pres_peso_luna', 'pres_peso_masa', 'pres_ayuda', 'pres_ayuda_intro']) {
    assert.ok(es[clave] && en[clave], clave);
  }
});

test('las cifras y el mando en T dicen lo mismo que la fuente', () => {
  assert.match(es.pres_peso, /460 libras/);
  assert.match(es.pres_peso, /76/);
  assert.match(es.pres_intro, /Apolo 15, 16 y 17/);
  // El mando en T: hacia atrás frena; la marcha atrás va con un interruptor (NSSDC).
  assert.match(es.pres_mando_movimientos, /hacia atrás frena/);
});

test('cada movimiento de cámara dura de 2 a 4 s (los ajustes lentos, de pocos grados o centímetros, aparte)', () => {
  for (const escena of GUION) {
    for (const tramo of escena.tramos) {
      const tomas = tramo.tomas;
      for (let i = 1; i < tomas.length; i++) {
        const a = tomas[i - 1];
        const b = tomas[i];
        const dur = b.t - a.t;
        const mira = Math.hypot(b.mira[0] - a.mira[0], b.mira[1] - a.mira[1], b.mira[2] - a.mira[2]);
        const grande = Math.abs(b.az - a.az) > 8 || Math.abs(b.el - a.el) > 5 || Math.abs(b.dist - a.dist) > 0.6 || mira > 0.6;
        if (grande) assert.ok(dur >= 2 && dur <= 4, `${escena.id}: movimiento de ${dur} s`);
      }
      // Entrada desde la toma anterior (misma escena): también de 2 a 4 s.
      if (tomas.length > 0 && tomas[0].t > 0) assert.ok(tomas[0].t >= 2 && tomas[0].t <= 4, `${escena.id}: entrada de ${tomas[0].t} s`);
    }
  }
});

test('recorre todos los tramos en orden, dice "listo" y termina', () => {
  const p = new PresentacionLRV();
  const { eventos, s } = recorrer(p);
  const tramos = eventos.filter((e) => e.tipo === 'tramo');
  const total = GUION.reduce((n, e) => n + e.tramos.length, 0);
  assert.equal(tramos.length, total);
  assert.deepEqual(
    eventos.filter((e) => e.tipo !== 'tramo').map((e) => e.tipo),
    ['listo', 'fin'],
  );
  assert.ok(s >= duracionMinimaS() + SEGUNDOS_LISTO - 0.2);
  assert.ok(s <= duracionMinimaS() + SEGUNDOS_LISTO + 1);
});

test('un tramo espera a que termine su frase', () => {
  const p = new PresentacionLRV();
  p.iniciar();
  const min = GUION[0].tramos[0].minS;
  // La voz dura 3 s más que el tramo: no pasa al siguiente hasta que termina.
  const eventos: EventoPresentacion[] = [];
  for (let s = 0; s < min + 3; s += 0.05) eventos.push(...p.actualizar(0.05));
  assert.equal(p.escena, 0);
  p.terminoVoz();
  for (let s = 0; s < 1; s += 0.05) eventos.push(...p.actualizar(0.05));
  assert.equal(p.escena, 1);
});

test('sin voz (nunca llega el fin), la presentación no se queda parada', () => {
  const p = new PresentacionLRV();
  const { eventos } = recorrer(p, { vozS: null, hastaS: 2000 });
  assert.equal(eventos.at(-1)?.tipo, 'fin');
  assert.equal(p.fase, 'terminada');
  assert.ok(MARGEN_VOZ_S > 0);
});

test('la introducción no se puede saltar; después, saltar va a "listo"', () => {
  const p = new PresentacionLRV();
  p.iniciar();
  assert.equal(p.saltable, false);
  assert.equal(p.saltar(), false);
  p.terminoVoz();
  while (p.escena < PRIMERA_ESCENA_SALTABLE) p.actualizar(0.05);
  assert.equal(p.saltable, true);
  assert.equal(p.saltar(), true);
  assert.deepEqual(p.actualizar(0.05).map((e) => e.tipo), ['listo']);
  assert.equal(p.saltar(), false);
});

test('forzarFinal (sin escena 3D) va a "listo" y luego a "fin"', () => {
  const p = new PresentacionLRV();
  p.iniciar();
  assert.deepEqual(p.forzarFinal().map((e) => e.tipo), ['listo']);
  p.terminoVoz();
  let fin = false;
  for (let s = 0; s < SEGUNDOS_LISTO + 1; s += 0.05) fin ||= p.actualizar(0.05).some((e) => e.tipo === 'fin');
  assert.ok(fin);
});

test('el fundido oscurece al final de una escena y aclara al empezar la siguiente', () => {
  const p = new PresentacionLRV();
  p.iniciar();
  p.terminoVoz();
  assert.equal(p.fundido, 0);
  while (p.fase === 'tramo') p.actualizar(0.05);
  assert.equal(p.fase, 'salida');
  p.actualizar(0.25);
  assert.ok(p.fundido > 0.3 && p.fundido < 0.7);
  while (p.fase === 'salida') p.actualizar(0.05);
  assert.equal(p.escena, 1);
  assert.ok(p.fundido > 0.5);
  p.actualizar(0.6);
  assert.equal(p.fundido, 0);
});

test('poseEn: interpola con ease-in-out, por el camino corto del azimut, y sale de la pose previa', () => {
  const tomas = [
    { t: 0, az: 170, el: 10, dist: 4, mira: [0, 0, 0] as const },
    { t: 2, az: -170, el: 30, dist: 2, mira: [1, 1, 1] as const },
  ];
  const medio = poseEn(tomas, 1, null);
  assert.ok(Math.abs(Math.abs(medio.az) - 180) < 1e-6);
  assert.ok(Math.abs(medio.el - 20) < 1e-6);
  assert.deepEqual(poseEn(tomas, 5, null).mira, [1, 1, 1]);
  const previa = { t: 0, az: 0, el: 0, dist: 10, mira: [0, 0, 0] as const };
  const conPrevia = poseEn([{ t: 2, az: 90, el: 0, dist: 10, mira: [0, 0, 0] }], 0, previa);
  assert.equal(conPrevia.az, 0);
});
