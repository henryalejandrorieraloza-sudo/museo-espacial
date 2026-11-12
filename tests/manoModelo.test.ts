// Pruebas del modelo articulado de la mano (src/visual/manoModelo.ts), sin cámara.
// Ejecutar: node --test tests/manoModelo.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizarOpciones, tablaLimitesPorDefecto } from '../src/game/opciones.ts';
import {
  ajustarMano,
  dentroDeLimites,
  LIMITES_PARAMETROS,
  MAX_PASO_POR_FRAME,
  NUM_PARAMETROS,
  limitesParametros,
  poseRelajada,
  posicionesModelo,
  proyectarALimites,
  type Vec3,
} from '../src/visual/manoModelo.ts';

const GRADOS = Math.PI / 180;
/** HAND_BONE_RADIUS de manosGeometria.ts. */
const RADIO = 0.011;

/** Generador pseudoaleatorio determinista (LCG), para que las pruebas se repitan. */
function generador(semilla: number): () => number {
  let s = semilla >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function gaussiana(rnd: () => number): number {
  const u = rnd() || 1e-9;
  const v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Pose aleatoria, proyectada sobre los límites (con el acoplamiento de la abducción). La palma, pequeña. */
function poseAleatoria(rnd: () => number): Float64Array {
  const p = new Float64Array(NUM_PARAMETROS);
  for (let j = 0; j < NUM_PARAMETROS; j++) {
    const [min, max] = LIMITES_PARAMETROS[j];
    p[j] = j < 3 ? (rnd() - 0.5) * 0.8 : min + (max - min) * rnd();
  }
  proyectarALimites(p);
  return p;
}

/** Diferencia máxima (rad) entre dos poses en el rango de parámetros [desde, hasta). */
const diferenciaMaxima = (a: ArrayLike<number>, b: ArrayLike<number>, desde = 0, hasta = NUM_PARAMETROS): number => {
  let m = 0;
  for (let j = desde; j < hasta; j++) m = Math.max(m, Math.abs(a[j] - b[j]));
  return m;
};

/** Observación sintética a partir de una pose conocida, con ruido en z y confianza elegida por punto. */
function observacionSintetica(
  pose: Float64Array,
  rnd: () => number,
  confianza: (i: number) => number,
  ruido = true,
): { puntos: Vec3[]; confianza: number[]; lado: 'Left' } {
  const puntos = posicionesModelo(pose);
  const longitud = Math.hypot(puntos[12].x, puntos[12].y, puntos[12].z);
  const sigma = 0.05 * longitud;
  const ruidosos = puntos.map((p) => ({ x: p.x, y: p.y, z: p.z + (ruido ? sigma * gaussiana(rnd) : 0) }));
  return { puntos: ruidosos, confianza: puntos.map((_, i) => confianza(i)), lado: 'Left' };
}

/** Distancia mínima entre dos segmentos 3D (a–b y c–d). */
function distanciaSegmentos(a: Vec3, b: Vec3, c: Vec3, d: Vec3): number {
  const sub = (u: Vec3, v: Vec3): Vec3 => ({ x: u.x - v.x, y: u.y - v.y, z: u.z - v.z });
  const dot = (u: Vec3, v: Vec3): number => u.x * v.x + u.y * v.y + u.z * v.z;
  const u = sub(b, a);
  const v = sub(d, c);
  const w = sub(a, c);
  const A = dot(u, u);
  const B = dot(u, v);
  const C = dot(v, v);
  const D = dot(u, w);
  const E = dot(v, w);
  const den = A * C - B * B;
  let s = den > 1e-12 ? Math.min(1, Math.max(0, (B * E - C * D) / den)) : 0;
  let t = C > 1e-12 ? (E + B * s) / C : 0;
  if (t < 0) {
    t = 0;
    s = A > 1e-12 ? Math.min(1, Math.max(0, -D / A)) : 0;
  } else if (t > 1) {
    t = 1;
    s = A > 1e-12 ? Math.min(1, Math.max(0, (B - D) / A)) : 0;
  }
  const p = { x: a.x + u.x * s, y: a.y + u.y * s, z: a.z + u.z * s };
  const q = { x: c.x + v.x * t, y: c.y + v.y * t, z: c.z + v.z * t };
  return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
}

test('1000 poses aleatorias: todos los ángulos dentro de rango, con el acoplamiento de la abducción', () => {
  const rnd = generador(1);
  for (let k = 0; k < 1000; k++) {
    const p = poseAleatoria(rnd);
    assert.ok(dentroDeLimites(p), `pose ${k} fuera de límites`);
  }
});

test('1000 poses aleatorias: PIP y DIP están en el plano del MCP y de la abducción (distancia < 1e-6 m)', () => {
  const rnd = generador(2);
  for (let k = 0; k < 1000; k++) {
    const p = poseAleatoria(rnd);
    // Palma en reposo: la normal del plano de cada dedo es F × z, con F = (−sen b, cos b, 0) y b la abducción MCP.
    p[0] = 0;
    p[1] = 0;
    p[2] = 0;
    const puntos = posicionesModelo(p);
    for (let f = 0; f < 4; f++) {
      const b = p[3 + 4 * f + 1];
      const n = { x: Math.cos(b), y: Math.sin(b), z: 0 };
      const mcp = puntos[5 + 4 * f];
      for (const i of [6 + 4 * f, 7 + 4 * f, 8 + 4 * f]) {
        const q = puntos[i];
        const d = Math.abs((q.x - mcp.x) * n.x + (q.y - mcp.y) * n.y + (q.z - mcp.z) * n.z);
        assert.ok(d < 1e-6, `pose ${k}, dedo ${f}, punto ${i}: distancia al plano ${d}`);
      }
    }
  }
});

test('1000 poses aleatorias: vecinos separados ≥ 1.5 × radio, y las puntas conservan el orden lateral', () => {
  const rnd = generador(3);
  let cruces = 0;
  for (let k = 0; k < 1000; k++) {
    const p = poseAleatoria(rnd);
    p[0] = 0;
    p[1] = 0;
    p[2] = 0;
    const v = posicionesModelo(p);
    for (let f = 0; f < 3; f++) {
      const dedoA = [5 + 4 * f, 6 + 4 * f, 7 + 4 * f, 8 + 4 * f];
      const dedoB = [5 + 4 * (f + 1), 6 + 4 * (f + 1), 7 + 4 * (f + 1), 8 + 4 * (f + 1)];
      let minima = Infinity;
      for (let s = 0; s < 3; s++) {
        for (let t = 0; t < 3; t++) {
          minima = Math.min(minima, distanciaSegmentos(v[dedoA[s]], v[dedoA[s + 1]], v[dedoB[t]], v[dedoB[t + 1]]));
        }
      }
      assert.ok(minima >= 1.5 * RADIO, `pose ${k}, dedos ${f} y ${f + 1}: distancia ${minima.toFixed(4)} m`);
    }
    // Eje lateral de la palma: las puntas de índice, medio, anular y meñique no se cruzan en x.
    const xs = [8, 12, 16, 20].map((i) => v[i].x);
    for (let f = 0; f < 3; f++) {
      if (xs[f] > xs[f + 1]) cruces++;
    }
  }
  assert.equal(cruces, 0, `puntas cruzadas en el eje lateral: ${cruces}`);
});

test('dedos en el límite de 90° de flexión: el signo de la abducción se recupera (corrección del error de signo)', () => {
  const verdad = poseRelajada();
  verdad[3 + 4] = 88 * GRADOS; // medio, flexión MCP cerca de 90°
  verdad[3 + 4 + 1] = 2 * GRADOS; // abducción pequeña (el acoplamiento la reduce a ese flexión)
  verdad[3 + 4 + 2] = 10 * GRADOS;
  verdad[3 + 4 + 3] = 5 * GRADOS;
  proyectarALimites(verdad);
  const obs = observacionSintetica(verdad, generador(9), () => 1, false);
  const r = ajustarMano(obs, null);
  assert.ok(r);
  assert.ok(Math.abs(r.parametros[3 + 4] - verdad[3 + 4]) < 2 * GRADOS, 'flexión MCP');
  assert.ok(Math.abs(r.parametros[3 + 4 + 1] - verdad[3 + 4 + 1]) < 2 * GRADOS, 'abducción MCP');
});

test('con cualquier observación, ningún parámetro sale de los límites', () => {
  const rnd = generador(7);
  for (let k = 0; k < 50; k++) {
    const basura = Array.from({ length: 21 }, () => ({ x: rnd() * 0.2 - 0.1, y: rnd() * 0.2 - 0.1, z: rnd() * 0.2 - 0.1 }));
    const r = ajustarMano({ puntos: basura, confianza: basura.map(() => rnd()), lado: 'Left' }, null);
    assert.ok(r, 'el ajuste devuelve resultado con puntos completos');
    assert.ok(dentroDeLimites(r.parametros), `observación ${k} fuera de límites`);
  }
});

test('con la pose anterior, ningún parámetro cambia más de MAX_PASO_POR_FRAME en un fotograma', () => {
  const rnd = generador(11);
  for (let k = 0; k < 50; k++) {
    const anterior = poseAleatoria(rnd);
    const objetivo = poseAleatoria(rnd);
    const obs = observacionSintetica(objetivo, rnd, () => 1);
    const r = ajustarMano(obs, anterior);
    assert.ok(r);
    assert.ok(diferenciaMaxima(r.parametros, anterior) <= MAX_PASO_POR_FRAME + 1e-12);
  }
});

test('un salto de 90° en la entrada de un fotograma no cambia la pose dibujada más de 20° en ese fotograma', () => {
  const anterior = poseRelajada();
  const saltada = Float64Array.from(anterior);
  // Medio: flexión MCP y PIP de 90° de golpe.
  saltada[3 + 4] = 90 * GRADOS;
  saltada[3 + 4 + 2] = 90 * GRADOS;
  proyectarALimites(saltada);
  const obs = observacionSintetica(saltada, generador(3), () => 1);
  const r = ajustarMano(obs, anterior);
  assert.ok(r);
  assert.ok(diferenciaMaxima(r.parametros, anterior) <= 20 * GRADOS + 1e-12);
});

test('recupera los ángulos de medio, anular, meñique y pulgar con error < 10° cuando el índice no tiene evidencia (sintético con ruido)', () => {
  for (let semilla = 1; semilla <= 10; semilla++) {
    const rnd = generador(100 + semilla);
    const verdad = poseAleatoria(rnd);
    // Índice (puntos 5 a 8) sin confianza: el ajuste no debe usar esos puntos.
    const obs = observacionSintetica(verdad, rnd, (i) => (i >= 5 && i <= 8 ? 0 : 1));
    const r = ajustarMano(obs, null);
    assert.ok(r);
    // Parámetros 7–18: medio, anular y meñique. 19–23: pulgar.
    const errorDedos = diferenciaMaxima(r.parametros, verdad, 7, 19);
    const errorPulgar = diferenciaMaxima(r.parametros, verdad, 19, 24);
    assert.ok(errorDedos < 10 * GRADOS, `semilla ${semilla}: error de dedos ${(errorDedos / GRADOS).toFixed(1)}°`);
    assert.ok(errorPulgar < 10 * GRADOS, `semilla ${semilla}: error del pulgar ${(errorPulgar / GRADOS).toFixed(1)}°`);
    // El índice sin evidencia queda dentro de límites.
    assert.ok(dentroDeLimites(r.parametros), `semilla ${semilla}: índice fuera de límites`);
  }
});

test('cada ajuste tarda menos de 2 ms por mano (media de 200 ajustes)', () => {
  const rnd = generador(42);
  const casos = Array.from({ length: 200 }, () => {
    const verdad = poseAleatoria(rnd);
    return { obs: observacionSintetica(verdad, rnd, () => 1), anterior: poseAleatoria(rnd) };
  });
  const t0 = performance.now();
  for (const c of casos) ajustarMano(c.obs, c.anterior);
  const media = (performance.now() - t0) / casos.length;
  console.log(`tiempo medio por ajuste: ${media.toFixed(3)} ms`);
  assert.ok(media < 2, `tiempo medio ${media.toFixed(3)} ms`);
});

test('tabla de topes editable: un tope personalizado se respeta en el ajuste', () => {
  const tabla = tablaLimitesPorDefecto();
  // Medio: flexión MCP limitada a 0°…30° (en vez de −20°…90°).
  tabla.medio.mcpFlexion = [0, 30];
  const verdad = poseRelajada();
  verdad[7] = 70 * GRADOS;
  const obs = observacionSintetica(verdad, generador(5), () => 1, false);
  const r = ajustarMano(obs, null, tabla);
  assert.ok(r);
  assert.ok(r.parametros[7] <= 30 * GRADOS + 1e-9, `flexión MCP del medio ${(r.parametros[7] / GRADOS).toFixed(1)}° sobre el tope`);
  assert.ok(dentroDeLimites(r.parametros, limitesParametros(tabla)));
});

test('normalización de topes: se ordenan mín y máx, se acotan a ±180° y los valores inválidos vuelven al defecto', () => {
  const tabla = tablaLimitesPorDefecto();
  tabla.indice.mcpFlexion = [120, -40] as unknown as [number, number];
  tabla.indice.mcpAbduccion = [-300, 300] as unknown as [number, number];
  tabla.indice.pipFlexion = [Number.NaN, 5] as unknown as [number, number];
  const o = normalizarOpciones({ limitesMano: tabla });
  assert.deepEqual(o.limitesMano.indice.mcpFlexion, [-40, 120]);
  assert.deepEqual(o.limitesMano.indice.mcpAbduccion, [-180, 180]);
  assert.deepEqual(o.limitesMano.indice.pipFlexion, tablaLimitesPorDefecto().indice.pipFlexion);
});

// Capturas reales (tecla P). Sin capturas en tests/fixtures/manos/ esta prueba se salta.
// Las poses sintéticas ("sintetica": true, ver el README de esa carpeta) no cuentan como capturas reales.
const carpetaCapturas = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'manos');
const capturas = readdirSync(carpetaCapturas)
  .filter((f) => f.endsWith('.json'))
  .filter((f) => !(JSON.parse(readFileSync(join(carpetaCapturas, f), 'utf8')) as { sintetica?: boolean }).sintetica);

test('con las capturas reales: ángulos dentro de límites', { skip: capturas.length === 0 && 'sin capturas (tecla P)' }, () => {
  for (const archivo of capturas) {
    const captura = JSON.parse(readFileSync(join(carpetaCapturas, archivo), 'utf8')) as {
      manos: { label: 'Left' | 'Right' | 'Unknown'; worldLandmarks: Vec3[] }[];
    };
    for (const mano of captura.manos) {
      const obs = { puntos: mano.worldLandmarks, confianza: mano.worldLandmarks.map(() => 1), lado: mano.label };
      const r = ajustarMano(obs, null);
      assert.ok(r, `${archivo}: no se pudo ajustar`);
      assert.ok(dentroDeLimites(r.parametros), `${archivo}: fuera de límites`);
    }
  }
});
