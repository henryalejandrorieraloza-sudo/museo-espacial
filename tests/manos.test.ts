// Pruebas de la geometría de las manos del avatar (src/visual/manosGeometria.ts), con landmarks simulados.
// Ejecutar: node --test tests/manos.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  CONEXIONES_MANO,
  HAND_BONE_LENGTHS,
  HAND_BONE_RADIUS,
  HAND_FIXED_DISTANCE,
  HAND_SCALE,
  escalaHueso,
  estimarPuntosOcultos,
  padreDe,
  puntosManoMundo,
  type PuntoMano,
  type VistaCamara,
} from '../src/visual/manosGeometria.ts';
import { HAND_SEPARATION_DEFAULT, normalizarOpciones } from '../src/game/opciones.ts';
import type { PuntoMundo } from '../src/tracking/tracker.ts';

/** Vídeo 4:3 (640×480). Escena 16:9 con FOV vertical de 60°. */
const VISTA: VistaCamara = { ancho: 640, alto: 480, aspectoEscena: 16 / 9, fovVertical: (60 * Math.PI) / 180, escala: HAND_SCALE };
const TAN = Math.tan(VISTA.fovVertical / 2);
/** Palma real del simulado (m). */
const PALMA = 0.09;

/** Mano normalizada: muñeca en (mx, my); nudillo del dedo medio a `palmaPx` píxeles hacia arriba; resto repartido. */
function manoNormalizada(mx: number, my: number, palmaPx: number): PuntoMano[] {
  return Array.from({ length: 21 }, (_, i) => {
    if (i === 0) return { x: mx, y: my, z: 0 };
    if (i === 9) return { x: mx, y: my - palmaPx / VISTA.alto, z: 0 };
    return { x: mx + ((i % 5) - 2) * 0.012, y: my - (i / 21) * 0.1, z: 0 };
  });
}

/** worldLandmarks simulados a partir de los normalizados: la misma forma, con la palma a PALMA metros. */
function mundoDesde(normalizada: readonly PuntoMano[]): PuntoMundo[] {
  const palmaPx = Math.hypot(
    (normalizada[9].x - normalizada[0].x) * VISTA.ancho,
    (normalizada[9].y - normalizada[0].y) * VISTA.alto,
  );
  const s = PALMA / palmaPx;
  return normalizada.map((p) => ({
    x: (p.x - normalizada[0].x) * VISTA.ancho * s,
    y: (p.y - normalizada[0].y) * VISTA.alto * s,
    z: p.z * VISTA.ancho * s,
  }));
}

/** Mano completa: normalizada y en metros. `retoque` cambia puntos concretos antes de medirla. */
function mano(mx: number, my: number, palmaPx: number, retoque?: (p: PuntoMano[]) => void) {
  const normalizada = manoNormalizada(mx, my, palmaPx);
  retoque?.(normalizada);
  return { normalizada, mundo: mundoDesde(normalizada) };
}

function distancia(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Pares padre → hijo del árbol de la mano (cada punto con su padre en la cadena). */
const HUESOS_ARBOL: readonly (readonly [number, number])[] = Array.from({ length: 20 }, (_, k) => k + 1).map(
  (hijo) => [padreDe(hijo), hijo] as const,
);

/** Tamaño proyectado de un segmento (en unidades de altura de pantalla), viendo desde la cámara en (0, 0, 0). */
function tamanoProyectado(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  const profundidad = -a.z;
  const dx = (b.x - a.x) / (VISTA.aspectoEscena * profundidad * TAN);
  const dy = (b.y - a.y) / (profundidad * TAN);
  return Math.hypot(dx, dy);
}

test('cada hueso mide su longitud fija × HAND_SCALE, sea cual sea la distancia de la mano', () => {
  for (const palmaPx of [60, 200]) {
    const { normalizada, mundo } = mano(0.5, 0.6, palmaPx);
    const puntos = puntosManoMundo(normalizada, mundo, VISTA);
    assert.ok(puntos, `palmaPx=${palmaPx}`);
    for (const [a, b] of HUESOS_ARBOL) {
      assert.ok(
        Math.abs(distancia(puntos[a], puntos[b]) - HAND_SCALE * HAND_BONE_LENGTHS[b]) < 1e-9,
        `hueso ${a}-${b} a palmaPx=${palmaPx}`,
      );
    }
  }
});

test('la misma pose con los landmarks escalados ×0.5 y ×2 produce huesos de exactamente la misma longitud', () => {
  const { normalizada, mundo } = mano(0.5, 0.5, 100);
  const escalados = (k: number): PuntoMundo[] => mundo.map((p) => ({ x: p.x * k, y: p.y * k, z: p.z * k }));
  const mitad = puntosManoMundo(normalizada, escalados(0.5), VISTA);
  const doble = puntosManoMundo(normalizada, escalados(2), VISTA);
  assert.ok(mitad && doble);
  for (const [a, b] of HUESOS_ARBOL) {
    assert.ok(Math.abs(distancia(mitad[a], mitad[b]) - distancia(doble[a], doble[b])) < 1e-12, `hueso ${a}-${b}`);
  }
});

test('la muñeca se mueve con la mano, pero la forma y el tamaño de la mano no cambian', () => {
  const izquierda = mano(0.3, 0.6, 100);
  const derecha = mano(0.7, 0.4, 100);
  const a = puntosManoMundo(izquierda.normalizada, izquierda.mundo, VISTA);
  const b = puntosManoMundo(derecha.normalizada, derecha.mundo, VISTA);
  assert.ok(a && b);
  assert.ok(distancia(a[0], b[0]) > 0.01, 'la muñeca se desplaza en la escena');
  for (const [p, q] of CONEXIONES_MANO) {
    assert.ok(Math.abs(distancia(a[p], a[q]) - distancia(b[p], b[q])) < 1e-9, `hueso ${p}-${q}`);
  }
});

test('la muñeca se coloca siempre a HAND_FIXED_DISTANCE de la cámara, sin importar la distancia real de la mano', () => {
  for (const palmaPx of [60, 120, 200]) {
    const { normalizada, mundo } = mano(0.5, 0.5, palmaPx);
    const puntos = puntosManoMundo(normalizada, mundo, VISTA);
    assert.ok(puntos);
    assert.ok(Math.abs(-puntos[0].z - HAND_FIXED_DISTANCE) < 1e-12, `palmaPx=${palmaPx}`);
  }
});

test('el tamaño proyectado de la mano es el mismo con la muñeca cerca de la webcam y lejos', () => {
  // Misma pose en metros. Acercar la mano a la webcam solo cambia su tamaño en la imagen (escala normalizada).
  const base = mano(0.5, 0.5, 100);
  const cerca = manoNormalizada(0.5, 0.5, 100).map((p) => ({ x: 0.5 + (p.x - 0.5) * 2, y: 0.5 + (p.y - 0.5) * 2, z: p.z }));
  const a = puntosManoMundo(cerca, base.mundo, VISTA);
  const b = puntosManoMundo(base.normalizada, base.mundo, VISTA);
  assert.ok(a && b);
  const tamanoCerca = tamanoProyectado(a[0], a[12]);
  const tamanoLejos = tamanoProyectado(b[0], b[12]);
  assert.ok(Math.abs(tamanoCerca - tamanoLejos) < 1e-9, `${tamanoCerca} vs ${tamanoLejos}`);
});

test('calibración: la mano extendida mide unos 0.37 del alto de la pantalla a HAND_FIXED_DISTANCE', () => {
  // Mano recta: todos los huesos apuntan hacia arriba, así que la distancia muñeca → punta es la suma de la cadena.
  const recta: PuntoMundo[] = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  for (let i = 1; i < 21; i++) recta[i] = { x: 0, y: recta[padreDe(i)].y - 1, z: 0 };
  const puntos = puntosManoMundo(manoNormalizada(0.5, 0.5, 100), recta, VISTA);
  assert.ok(puntos);
  const altoVisible = 2 * HAND_FIXED_DISTANCE * TAN; // alto de la pantalla a esa distancia
  const muñecaADedoMedio = distancia(puntos[0], puntos[12]);
  const fraccion = muñecaADedoMedio / altoVisible;
  // Con HAND_SCALE (1.25) la mano ocupa 0.212 × 1.25 / 0.577 ≈ 0.46 del alto de la pantalla.
  assert.ok(Math.abs(fraccion - 0.212 * HAND_SCALE / altoVisible) < 1e-9, `fracción ${fraccion}`);
});

test('el tamaño de la mano es ajustable: cada hueso mide su longitud base por la escala elegida', () => {
  const { normalizada, mundo } = mano(0.5, 0.5, 100);
  for (const escala of [0.6, 1.25, 2]) {
    const puntos = puntosManoMundo(normalizada, mundo, { ...VISTA, escala });
    assert.ok(puntos, `escala=${escala}`);
    for (const [a, b] of HUESOS_ARBOL) {
      assert.ok(Math.abs(distancia(puntos[a], puntos[b]) - escala * HAND_BONE_LENGTHS[b]) < 1e-9, `hueso ${a}-${b} con escala ${escala}`);
    }
  }
});

test('la escala no toca el radio de los huesos', () => {
  assert.equal(HAND_BONE_RADIUS, 0.011);
  const e = escalaHueso(0.05);
  assert.equal(e.x, 1);
  assert.equal(e.z, 1);
});

test('el deslizador de tamaño se ajusta al rango 0.6–2.0 y su valor inicial es 1.25', () => {
  assert.equal(normalizarOpciones({}).tamanoMano, 1.25);
  assert.equal(normalizarOpciones({ tamanoMano: 5 }).tamanoMano, 2);
  assert.equal(normalizarOpciones({ tamanoMano: 0.1 }).tamanoMano, 0.6);
  assert.equal(normalizarOpciones({ tamanoMano: Number.NaN }).tamanoMano, 1.25);
  assert.equal(normalizarOpciones({ tamanoMano: 1.5 }).tamanoMano, 1.5);
});

test('el deslizador de separación entre manos se ajusta al rango 0–0.6 m y su valor inicial es 0', () => {
  assert.equal(HAND_SEPARATION_DEFAULT, 0);
  assert.equal(normalizarOpciones({}).separacionManos, 0);
  assert.equal(normalizarOpciones({ separacionManos: 1 }).separacionManos, 0.6);
  assert.equal(normalizarOpciones({ separacionManos: -0.2 }).separacionManos, 0);
  assert.equal(normalizarOpciones({ separacionManos: 0.4 }).separacionManos, 0.4);
});

test('el radio de los huesos y las articulaciones es el mismo en todos los dedos y a cualquier profundidad', () => {
  assert.ok(HAND_BONE_RADIUS > 0);
  for (const largo of [0.01, 0.05, 0.3]) {
    const e = escalaHueso(largo);
    assert.equal(e.x, 1, 'el radio no se escala en x');
    assert.equal(e.z, 1, 'el radio no se escala en z');
    assert.equal(e.y, largo, 'solo la longitud cambia');
  }
});

test('la dirección de cada hueso coincide con la de los landmarks, con z invertida', () => {
  const { normalizada, mundo } = mano(0.5, 0.5, 100);
  const puntos = puntosManoMundo(normalizada, mundo, VISTA);
  assert.ok(puntos);
  for (const [p, h] of HUESOS_ARBOL) {
    const largo = distancia(puntos[p], puntos[h]);
    const escena = { x: (puntos[h].x - puntos[p].x) / largo, y: (puntos[h].y - puntos[p].y) / largo, z: (puntos[h].z - puntos[p].z) / largo };
    const w = { x: mundo[h].x - mundo[p].x, y: mundo[h].y - mundo[p].y, z: mundo[h].z - mundo[p].z };
    const n = Math.hypot(w.x, w.y, w.z);
    // x e y van en espejo; z va sin invertir en la dirección de la pose (la inversión ya está en el signo de z).
    assert.ok(Math.abs(escena.x + w.x / n) < 1e-9, `x del hueso ${p}-${h}`);
    assert.ok(Math.abs(escena.y + w.y / n) < 1e-9, `y del hueso ${p}-${h}`);
    assert.ok(Math.abs(escena.z - w.z / n) < 1e-9, `z del hueso ${p}-${h}`);
  }
});

test('la inversión de profundidad sigue cambiando la pose: lo cercano a la webcam se dibuja lejos', () => {
  const { normalizada, mundo } = mano(0.5, 0.5, 100);
  // Índice hacia la webcam (z negativa) y pulgar hacia atrás (z positiva).
  const pose: PuntoMundo[] = mundo.map((p, i) => (i >= 5 && i <= 8 ? { ...p, z: -0.05 } : i >= 1 && i <= 4 ? { ...p, z: 0.05 } : p));
  const puntos = puntosManoMundo(normalizada, pose, VISTA);
  assert.ok(puntos);
  assert.ok(puntos[8].z < puntos[4].z);
});

test('con palma hacia la cámara, el pulgar queda a la izquierda en espejo', () => {
  // Mano derecha con la palma hacia la webcam: el pulgar aparece a la derecha de la imagen cruda (x mayor).
  const { normalizada, mundo } = mano(0.5, 0.7, 90, (p) => {
    p[1] = { x: 0.56, y: 0.64, z: 0 };
    p[2] = { x: 0.58, y: 0.6, z: 0 };
    p[3] = { x: 0.6, y: 0.57, z: 0 };
    p[4] = { x: 0.62, y: 0.55, z: 0 };
    p[5] = { x: 0.48, y: 0.56, z: 0 };
    p[6] = { x: 0.46, y: 0.5, z: 0 };
    p[7] = { x: 0.45, y: 0.47, z: 0 };
    p[8] = { x: 0.44, y: 0.45, z: 0 };
  });
  const puntos = puntosManoMundo(normalizada, mundo, VISTA);
  assert.ok(puntos);
  assert.ok(puntos[4].x < puntos[8].x, 'el pulgar queda a la izquierda del índice en la escena');
});

test('con el pulgar doblado y los demás dedos extendidos, el pulgar queda plegado sobre la palma', () => {
  const { normalizada, mundo } = mano(0.5, 0.7, 86, (p) => {
    p[1] = { x: 0.46, y: 0.66, z: 0 };
    p[2] = { x: 0.45, y: 0.62, z: 0 };
    p[3] = { x: 0.46, y: 0.6, z: 0 };
    p[4] = { x: 0.47, y: 0.6, z: 0 };
  });
  const puntos = puntosManoMundo(normalizada, mundo, VISTA);
  assert.ok(puntos);
  assert.ok(puntos.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)));
  // Plegado: la punta queda dentro de la palma, más cerca de la muñeca que el nudillo del índice.
  assert.ok(distancia(puntos[4], puntos[0]) < distancia(puntos[5], puntos[0]), 'la punta del pulgar está dentro de la palma');
});

test('un punto oculto se estima desde la anatomía: no se copia la última posición y mantiene la longitud del hueso', () => {
  const { mundo } = mano(0.5, 0.5, 100);
  const oculto: (PuntoMundo | undefined)[] = [...mundo];
  oculto[8] = { x: Number.NaN, y: Number.NaN, z: Number.NaN };
  const estimado = estimarPuntosOcultos(oculto);
  assert.ok(estimado);
  assert.equal(estimado.length, 21);
  assert.ok(estimado.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)));
  assert.ok(Math.abs(distancia(estimado[8], estimado[7]) - distancia(estimado[7], estimado[6])) < 1e-9);
  assert.ok(distancia(estimado[8], estimado[7]) > 1e-6);
});

test('el punto oculto cambia cuando cambia la trayectoria del dedo: no se congela en una posición anterior', () => {
  const primera = mano(0.5, 0.5, 100).mundo;
  const segunda = mano(0.5, 0.5, 100, (p) => {
    p[7] = { x: 0.48, y: 0.45, z: 0 };
  }).mundo;
  const ocultar = (m: PuntoMundo[]): (PuntoMundo | undefined)[] => {
    const r: (PuntoMundo | undefined)[] = [...m];
    r[8] = { x: Number.NaN, y: Number.NaN, z: Number.NaN };
    return r;
  };
  const a = estimarPuntosOcultos(ocultar(primera));
  const b = estimarPuntosOcultos(ocultar(segunda));
  assert.ok(a && b);
  assert.ok(distancia(a[8], b[8]) > 1e-6, 'la estimación sigue la nueva pose del dedo');
});

test('sin muñeca no hay estimación', () => {
  const sinMuneca: (PuntoMundo | undefined)[] = Array.from({ length: 21 }, () => undefined);
  assert.equal(estimarPuntosOcultos(sinMuneca), null);
});

test('una muñeca fuera del recuadro no se dibuja', () => {
  const { normalizada, mundo } = mano(0.5, 1.05, 100);
  assert.equal(puntosManoMundo(normalizada, mundo, VISTA), null);
});

test('ninguna constante de posición de ojos existe en el código de la escena', () => {
  const carpeta = new URL('../src/', import.meta.url);
  const archivos: string[] = [];
  const recorrer = (dir: URL): void => {
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      const ruta = new URL(entrada.name + (entrada.isDirectory() ? '/' : ''), dir);
      if (entrada.isDirectory()) recorrer(ruta);
      else if (entrada.name.endsWith('.ts')) archivos.push(readFileSync(ruta, 'utf8'));
    }
  };
  recorrer(carpeta);
  for (const contenido of archivos) {
    assert.doesNotMatch(contenido, /DISTANCIA_OJOS|distanciaOjos|EYE_OFFSET/);
  }
});
