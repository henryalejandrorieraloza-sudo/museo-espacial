// Genera las cinco poses SINTÉTICAS de la mano (no son capturas de cámara).
// Ejecutar: node tests/fixtures/manos/generar-sinteticas.ts
//
// Sirven para las capturas de pantalla de tests/capturas/manos/ mientras no haya capturas reales (tecla P).
// Cada archivo lleva "sintetica": true. Las pruebas de "capturas reales" las ignoran.
//
// Convención de MediaPipe (imagen sin espejo): x a la derecha de la imagen, y hacia abajo, z negativa hacia la webcam.
// La mano es una mano derecha de adulto aproximada, con etiqueta "Right": el proyecto supone que la etiqueta de
// MediaPipe coincide con la mano real (game/gestos.ts usa el hombro del mismo lado).

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

type V = [number, number, number];

const GRADOS = Math.PI / 180;
const suma = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const escala = (a: V, s: number): V => [a[0] * s, a[1] * s, a[2] * s];
const punto = (a: V, b: V): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cruz = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: V): V => escala(a, 1 / Math.hypot(...a));

/**
 * Mano en coordenadas locales (t, f, n): t hacia el pulgar, f hacia los dedos, n hacia la cara palmar. Metros.
 * `flex` (grados por articulación) dobla los dedos hacia la palma. Puntos de la palma: muñeca y nudillos.
 */
function manoLocal(flex: number, flexPulgar: number): V[] {
  const p: V[] = new Array(21);
  p[0] = [0, 0, 0];
  // Nudillos (MCP) en un arco suave; el medio es el más alto.
  const mcp: Record<number, V> = { 5: [0.023, 0.087, 0], 9: [0.003, 0.091, 0], 13: [-0.016, 0.086, 0], 17: [-0.032, 0.077, 0] };
  // Largos de las falanges (m) y apertura lateral de cada dedo (grados hacia el pulgar).
  const dedos: [number, number[], number][] = [
    [5, [0.045, 0.027, 0.02], 6],
    [9, [0.05, 0.03, 0.022], 0],
    [13, [0.045, 0.027, 0.02], -6],
    [17, [0.04, 0.025, 0.02], -13],
  ];
  for (const [base, largos, abre] of dedos) {
    p[base] = mcp[base];
    const a = abre * GRADOS;
    let angulo = 0;
    let actual = mcp[base];
    largos.forEach((largo, k) => {
      angulo += flex * GRADOS * (k === 0 ? 0.8 : 1);
      // Dirección: abre en el plano t-f y se dobla hacia n.
      const dir: V = [Math.sin(a) * Math.cos(angulo), Math.cos(a) * Math.cos(angulo), Math.sin(angulo)];
      actual = suma(actual, escala(dir, largo));
      p[base + 1 + k] = actual;
    });
  }
  // Pulgar: sale de la base de la palma hacia el lado del pulgar y algo hacia la cara palmar.
  const cmc: V = [0.02, 0.024, 0.01];
  p[1] = cmc;
  let dir = unit([0.62, 0.72, 0.3]);
  let actual = cmc;
  [0.035, 0.03, 0.025].forEach((largo, k) => {
    if (k > 0) dir = unit(suma(dir, escala([-0.25, 0.1, 0.55], Math.tan(flexPulgar * GRADOS))));
    actual = suma(actual, escala(dir, largo));
    p[2 + k] = actual;
  });
  return p;
}

interface Pose {
  /** Dirección de los dedos y hacia dónde mira la palma, en coordenadas de MediaPipe (se ortogonalizan). */
  dedos: V;
  palma: V;
  flex: number;
  flexPulgar: number;
  /** Muñeca en la imagen (0 a 1). */
  muneca: [number, number];
  descripcion: string;
}

const POSES: Record<string, Pose> = {
  palma_frente: {
    dedos: [0, -1, 0], palma: [0, 0, -1], flex: 8, flexPulgar: 10, muneca: [0.5, 0.68],
    descripcion: 'Palma hacia la webcam, dedos hacia arriba, ligeramente relajados.',
  },
  mano_canto: {
    dedos: [0, -1, 0], palma: [-1, 0, 0], flex: 10, flexPulgar: 10, muneca: [0.5, 0.68],
    descripcion: 'Mano de canto: palma hacia un lado, pulgar hacia la webcam.',
  },
  palma_abajo: {
    dedos: [1, -0.25, -0.35], palma: [0, 1, 0], flex: 12, flexPulgar: 12, muneca: [0.38, 0.55],
    descripcion: 'Palma hacia el suelo, dedos hacia dentro y un poco hacia la webcam.',
  },
  dedos_hacia_camara: {
    dedos: [0, -0.15, -1], palma: [-0.25, 1, 0], flex: 6, flexPulgar: 8, muneca: [0.5, 0.58],
    descripcion: 'Dedos apuntando a la webcam, palma hacia abajo.',
  },
  mano_colgando: {
    dedos: [0.1, 1, -0.3], palma: [0, 0, 1], flex: 32, flexPulgar: 20, muneca: [0.5, 0.36],
    descripcion: 'Mano colgando de la muñeca, relajada, palma hacia el jugador.',
  },
};

const ANCHO = 640;
const ALTO = 480;
/** Escala aproximada de metros a fracción de imagen a ~0.5 m de la webcam (solo para los landmarks normalizados). */
const M_A_IMAGEN = 1.6;

const carpeta = dirname(fileURLToPath(import.meta.url));
for (const [nombre, pose] of Object.entries(POSES)) {
  const F = unit(pose.dedos);
  const N = unit(suma(pose.palma, escala(F, -punto(pose.palma, F))));
  const T = cruz(F, N);
  const locales = manoLocal(pose.flex, pose.flexPulgar);
  // worldLandmarks de MediaPipe: centrados en la mano (aquí, en el centro de la palma).
  const mundo = locales.map(([t, f, n]) => suma(suma(escala(T, t), escala(F, f)), escala(N, n)));
  const centro = escala(mundo[9], 0.5);
  const worldLandmarks = mundo.map((p) => {
    const [x, y, z] = suma(p, escala(centro, -1));
    return { x: +x.toFixed(5), y: +y.toFixed(5), z: +z.toFixed(5) };
  });
  const landmarks = mundo.map(([x, y, z]) => ({
    x: +(pose.muneca[0] + x * M_A_IMAGEN).toFixed(5),
    y: +(pose.muneca[1] + y * M_A_IMAGEN * (ANCHO / ALTO)).toFixed(5),
    z: +(z * M_A_IMAGEN).toFixed(5),
  }));
  const datos = {
    version: 1,
    sintetica: true,
    descripcion: `SINTÉTICA, no es una captura de cámara. ${pose.descripcion}`,
    fecha: null,
    ancho: ANCHO,
    alto: ALTO,
    manos: [{ label: 'Right', score: null, landmarks, worldLandmarks }],
  };
  writeFileSync(join(carpeta, `${nombre}.json`), JSON.stringify(datos, null, 2) + '\n');
  console.log(`${nombre}.json`);
}
