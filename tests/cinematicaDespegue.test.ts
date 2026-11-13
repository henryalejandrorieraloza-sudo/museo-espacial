// Pruebas de la cinemática del despegue (src/game/cinematicaDespegue.ts): línea de tiempo, textos, fundidos, omitir y
// reanudar. Ejecutar: node --test tests/cinematicaDespegue.test.ts  (Node 22.6+ quita los tipos de forma nativa).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CLAVE_PROGRESO_DESPEGUE,
  CinematicaDespegue,
  LINEA_DESPEGUE,
  cargarProgresoDespegue,
  estadoEn,
  fundidoEn,
  opacidadTexto,
  type EventoCinematica,
} from '../src/game/cinematicaDespegue.ts';

/** localStorage de mentira para las pruebas de reanudar. */
const almacen = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => almacen.get(k) ?? null,
  setItem: (k: string, v: string) => void almacen.set(k, v),
  removeItem: (k: string) => void almacen.delete(k),
};

function correr(c: CinematicaDespegue, hastaS: number, paso = 1 / 30): EventoCinematica[] {
  const eventos: EventoCinematica[] = [];
  while (c.tiempoS < hastaS - 1e-9 && !c.terminada) eventos.push(...c.actualizar(Math.min(paso, hastaS - c.tiempoS)));
  return eventos;
}

test('las tomas van en orden, sin huecos, de la pausa al modo libre', () => {
  const { tomas, libreS } = LINEA_DESPEGUE;
  assert.equal(tomas[0].desdeS, 1.5);
  for (let i = 1; i < tomas.length; i++) assert.equal(tomas[i].desdeS, tomas[i - 1].hastaS);
  assert.equal(tomas.at(-1)?.hastaS, libreS);
  assert.deepEqual(
    tomas.map((t) => t.id),
    ['exteriorLRV', 'camaraTV', 'seguimientoTV', 'ventanaLM', 'finalLRV'],
  );
});

test('los textos existen en es.json y en.json', () => {
  for (const idioma of ['es', 'en']) {
    const textos = JSON.parse(readFileSync(new URL(`../src/i18n/${idioma}.json`, import.meta.url), 'utf8')) as Record<string, string>;
    for (const texto of LINEA_DESPEGUE.textos) assert.ok(textos[texto.clave], `${idioma}: falta ${texto.clave}`);
    assert.ok(textos.cine_omitir);
  }
});

test('pausa sin toma, fundido a negro antes de la primera toma y negro al final', () => {
  assert.equal(estadoEn(LINEA_DESPEGUE, 0.5).toma, null);
  assert.equal(fundidoEn(LINEA_DESPEGUE.fundidos, 0.5), 0);
  assert.equal(fundidoEn(LINEA_DESPEGUE.fundidos, 1.5), 1);
  assert.ok(fundidoEn(LINEA_DESPEGUE.fundidos, 3) < 1e-9);
  assert.equal(fundidoEn(LINEA_DESPEGUE.fundidos, 40), 1);
  assert.ok(fundidoEn(LINEA_DESPEGUE.fundidos, 40.8) < 1e-9);
});

test('el motor se enciende durante el plano fijo de la cámara de TV', () => {
  const camara = LINEA_DESPEGUE.tomas.find((t) => t.id === 'camaraTV');
  assert.ok(camara && LINEA_DESPEGUE.ignicionS > camara.desdeS && LINEA_DESPEGUE.ignicionS < camara.hastaS);
  assert.ok(estadoEn(LINEA_DESPEGUE, 7).vueloS < 0);
  assert.ok(estadoEn(LINEA_DESPEGUE, 15).vueloS > 0);
  assert.ok(estadoEn(LINEA_DESPEGUE, 19).sobreexposicion > estadoEn(LINEA_DESPEGUE, 13).sobreexposicion);
});

test('los textos entran y salen con fundido', () => {
  const [primero] = LINEA_DESPEGUE.textos;
  assert.equal(opacidadTexto(primero, primero.desdeS), 0);
  assert.equal(opacidadTexto(primero, (primero.desdeS + primero.hastaS) / 2), 1);
  assert.equal(opacidadTexto(primero, primero.hastaS), 0);
});

test('de principio a fin: modo libre a los 40 s y fin tras el fundido de salida', () => {
  almacen.clear();
  const c = new CinematicaDespegue();
  const eventos = correr(c, 50);
  const tipos = eventos.map((e) => e.tipo);
  assert.equal(tipos.filter((t) => t === 'toma').length, 5);
  assert.equal(tipos.filter((t) => t === 'libre').length, 1);
  assert.equal(tipos.at(-1), 'fin');
  assert.ok(c.terminada);
  assert.equal(almacen.has(CLAVE_PROGRESO_DESPEGUE), false, 'al terminar no queda nada que reanudar');
});

test('omitir salta al modo libre y deja el fundido de salida', () => {
  almacen.clear();
  const c = new CinematicaDespegue();
  correr(c, 10);
  assert.ok(almacen.has(CLAVE_PROGRESO_DESPEGUE));
  const eventos = c.saltar();
  assert.deepEqual(eventos.map((e) => e.tipo), ['libre']);
  assert.ok(c.enModoLibre);
  assert.equal(c.fundido, 1);
  assert.deepEqual(c.saltar(), []);
  assert.equal(almacen.has(CLAVE_PROGRESO_DESPEGUE), false);
  assert.equal(correr(c, 41).at(-1)?.tipo, 'fin');
});

test('se guarda el progreso y se reanuda desde ahí', () => {
  almacen.clear();
  const c = new CinematicaDespegue();
  correr(c, 23.2);
  const guardado = cargarProgresoDespegue();
  assert.ok(guardado !== null && guardado > 22.5 && guardado <= 23.2);
  const r = new CinematicaDespegue(guardado);
  assert.equal(r.estado.toma?.id, 'ventanaLM');
  const eventos = correr(r, 50);
  assert.equal(eventos.filter((e) => e.tipo === 'toma').length, 2, 'la toma en curso y la final');
  assert.equal(eventos.at(-1)?.tipo, 'fin');
});

test('un progreso guardado roto no se reanuda', () => {
  almacen.set(CLAVE_PROGRESO_DESPEGUE, '{"tiempoS":"x"}');
  assert.equal(cargarProgresoDespegue(), null);
  almacen.set(CLAVE_PROGRESO_DESPEGUE, 'no es json');
  assert.equal(cargarProgresoDespegue(), null);
});

test('cada texto se lee una vez y la cinemática espera a que termine la voz', () => {
  almacen.clear();
  const [primero, segundo] = LINEA_DESPEGUE.textos;
  const c = new CinematicaDespegue();
  const eventos = correr(c, primero.desdeS + 0.1);
  assert.deepEqual(eventos.filter((e) => e.tipo === 'texto'), [{ tipo: 'texto', clave: primero.clave }]);
  // La voz sigue: se detiene justo antes del desvanecido, con el texto entero en pantalla.
  for (let k = 0; k < 150; k++) c.actualizar(1 / 30);
  const limite = primero.hastaS - primero.fundidoS;
  assert.ok(Math.abs(c.tiempoS - limite) < 1e-9);
  assert.ok(c.esperandoVoz);
  assert.equal(c.textos[0]?.opacidad, 1);
  // Termina la voz: sigue, y el siguiente texto se lee al aparecer.
  c.vozTermino(primero.clave);
  assert.equal(c.esperandoVoz, false);
  const despues = correr(c, segundo.desdeS + 0.1);
  assert.deepEqual(despues.filter((e) => e.tipo === 'texto'), [{ tipo: 'texto', clave: segundo.clave }]);
});

test('si la voz termina antes, no hay espera', () => {
  almacen.clear();
  const [primero] = LINEA_DESPEGUE.textos;
  const c = new CinematicaDespegue();
  correr(c, primero.desdeS + 0.1);
  c.vozTermino(primero.clave);
  correr(c, primero.hastaS + 0.2);
  assert.ok(c.tiempoS >= primero.hastaS + 0.2 - 1e-9);
});

test('si la voz nunca avisa, la espera tiene tope', () => {
  almacen.clear();
  const [primero] = LINEA_DESPEGUE.textos;
  const c = new CinematicaDespegue();
  correr(c, primero.desdeS + 0.1);
  let pasos = 0;
  while (c.tiempoS <= primero.hastaS - primero.fundidoS && pasos < 10_000) {
    c.actualizar(0.1);
    pasos++;
  }
  const esperado = (primero.hastaS - primero.fundidoS - primero.desdeS + LINEA_DESPEGUE.esperaVozMaxS) / 0.1;
  assert.ok(pasos <= esperado + 3, `pasos ${pasos}`);
});

test('al reanudar en mitad de un texto, se vuelve a leer; los anteriores no', () => {
  almacen.clear();
  const [primero, segundo] = LINEA_DESPEGUE.textos;
  const c = new CinematicaDespegue(segundo.desdeS + 1);
  const eventos = c.actualizar(0);
  assert.deepEqual(eventos.filter((e) => e.tipo === 'texto'), [{ tipo: 'texto', clave: segundo.clave }]);
  assert.notEqual(segundo.clave, primero.clave);
});
