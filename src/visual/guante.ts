// Guante de traje espacial low poly para las manos del avatar (spec-visual-museo §9).
// Solo geometría y colores, generados en código. Cada pieza se construye una vez; manos.ts las mueve
// con transformaciones en cada fotograma (nunca reconstruye geometría).
//
// Piezas de cada mano (una llamada de dibujo por pieza):
// - puño: manga, anillo de cierre con dos tiras de color, anillo metálico y parche genérico. Rígido, sin escala.
// - palma: almohadilla presurizada con un pliegue sutil y una costura. Se escala al ancho y largo de la palma.
// - segmentos: los tres segmentos de cada dedo (15 instancias). Se estiran a lo largo del hueso; el grosor no cambia.
// - fuelles: costillas metálicas en cada articulación (14 instancias). Tamaño fijo.
// - puntas: punta redondeada y algo más gruesa (5 instancias). Tamaño fijo.
//
// Los anillos y fuelles son solo decoración: no cambian ningún punto, ángulo ni longitud de hueso.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HAND_BONE_RADIUS } from './manosGeometria.ts';

export type EstiloGuante = 'blanco' | 'plata';

/** Estilo del guante: "blanco" (tela blanco hueso con fuelles grises) o "plata" (metálico con puntas negras). */
export const GUANTE_ESTILO: EstiloGuante = 'blanco';

export interface ColoresGuante {
  /** Tela del guante, la palma y la manga. */
  tela: number;
  /** Fuelles, costuras y anillo metálico. */
  metal: number;
  /** Puntas de los dedos. */
  punta: number;
  /** Las dos tiras de color del puño. */
  tiraA: number;
  tiraB: number;
  /** Parche genérico de la manga: fondo, círculo exterior e interior. Sin logos de agencias ni misiones. */
  parcheFondo: number;
  parcheExterior: number;
  parcheInterior: number;
  rugosidad: number;
  metalicidad: number;
}

export const COLORES_GUANTE: Record<EstiloGuante, ColoresGuante> = {
  blanco: {
    tela: 0xe9e6df,
    metal: 0x9aa0a6,
    punta: 0xe9e6df,
    tiraA: 0x2f6fd0,
    tiraB: 0xc8463c,
    parcheFondo: 0xf4f2ec,
    parcheExterior: 0xc8463c,
    parcheInterior: 0x2f6fd0,
    rugosidad: 0.8,
    metalicidad: 0.1,
  },
  plata: {
    tela: 0xc5c9cf,
    metal: 0x7d838b,
    punta: 0x1c1e22,
    tiraA: 0x2f6fd0,
    tiraB: 0xc8463c,
    parcheFondo: 0xe2e4e8,
    parcheExterior: 0xc8463c,
    parcheInterior: 0x2f6fd0,
    rugosidad: 0.5,
    metalicidad: 0.3,
  },
};

/** Lados de los dedos, fuelles y puntas (sección octogonal, low poly). */
const LADOS_DEDO = 8;
/** Lados del puño y la manga. */
const LADOS_PUNO = 12;
/** Radio de la tela de los dedos (m). Igual que el grosor de hueso de antes: los dedos no engordan. */
export const RADIO_DEDO = HAND_BONE_RADIUS;
/** Radio de las costillas del fuelle: sobresalen un poco de la tela. */
export const RADIO_COSTILLA = RADIO_DEDO * 1.2;
/** Costillas por fuelle y distancia entre ellas (m). */
export const COSTILLAS_FUELLE = 5;
export const PASO_COSTILLA = 0.0026;
/** Radio máximo de la punta: algo más gruesa que el dedo. */
export const RADIO_PUNTA = RADIO_DEDO * 1.14;
/** Largo de la punta redondeada (m), hacia atrás desde el landmark de la punta. No alarga el dedo. */
const LARGO_PUNTA = 0.015;

/** Sección de un tubo a lo largo de Y: altura, radios en x y z, y color de la franja que empieza aquí. */
interface Perfil {
  y: number;
  rx: number;
  rz: number;
  color: number;
}

/**
 * Tubo low poly por secciones a lo largo de Y, sin índices, con color por vértice y normales planas.
 * `tapas` cierra el primer y/o el último perfil con un abanico.
 */
function tuboPerfiles(perfiles: readonly Perfil[], lados: number, tapas: { inicio?: boolean; fin?: boolean } = {}): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  const anillo = (p: Perfil, k: number): [number, number, number] => {
    // Desfase de media cara: una cara plana mira al frente (z), como en el resto del museo low poly.
    const a = ((k + 0.5) / lados) * Math.PI * 2;
    return [Math.cos(a) * p.rx, p.y, Math.sin(a) * p.rz];
  };
  const tri = (a: number[], b: number[], d: number[], color: number): void => {
    pos.push(...a, ...b, ...d);
    c.setHex(color);
    for (let i = 0; i < 3; i++) col.push(c.r, c.g, c.b);
  };

  for (let i = 0; i + 1 < perfiles.length; i++) {
    const p0 = perfiles[i];
    const p1 = perfiles[i + 1];
    for (let k = 0; k < lados; k++) {
      const A = anillo(p0, k);
      const B = anillo(p0, k + 1);
      const C = anillo(p1, k);
      const D = anillo(p1, k + 1);
      // Orden antihorario visto desde fuera: la normal apunta hacia afuera.
      tri(A, C, B, p0.color);
      tri(B, C, D, p0.color);
    }
  }
  if (tapas.inicio) {
    const p = perfiles[0];
    for (let k = 0; k < lados; k++) tri([0, p.y, 0], anillo(p, k), anillo(p, k + 1), p.color);
  }
  if (tapas.fin) {
    const p = perfiles[perfiles.length - 1];
    const color = perfiles[perfiles.length - 2]?.color ?? p.color;
    for (let k = 0; k < lados; k++) tri([0, p.y, 0], anillo(p, k + 1), anillo(p, k), color);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

/** Da color por vértice a una geometría y la deja sin índices, para fusionarla con las demás. */
function pintar(geo: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const c = new THREE.Color(color);
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function fusionar(partes: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const geo = mergeGeometries(partes);
  if (!geo) throw new Error('No se pudo fusionar la geometría del guante');
  return geo;
}

/** Segmento de dedo de largo 1 (de y = 0 a y = 1). Se estira en Y hasta el largo del hueso; el radio es fijo. */
function geometriaSegmento(col: ColoresGuante): THREE.BufferGeometry {
  return tuboPerfiles(
    [
      { y: 0, rx: RADIO_DEDO, rz: RADIO_DEDO, color: col.tela },
      { y: 1, rx: RADIO_DEDO * 0.96, rz: RADIO_DEDO * 0.96, color: col.tela },
    ],
    LADOS_DEDO,
  );
}

/** Fuelle centrado en la articulación: costillas metálicas alternadas con valles, y un núcleo que tapa el hueco del doblez. */
function geometriaFuelle(col: ColoresGuante): THREE.BufferGeometry {
  const largo = COSTILLAS_FUELLE * PASO_COSTILLA;
  const perfiles: Perfil[] = [];
  const valle = RADIO_DEDO * 0.98;
  perfiles.push({ y: -largo / 2, rx: valle, rz: valle, color: col.metal });
  for (let i = 0; i < COSTILLAS_FUELLE; i++) {
    const y0 = -largo / 2 + i * PASO_COSTILLA;
    perfiles.push({ y: y0 + PASO_COSTILLA / 2, rx: RADIO_COSTILLA, rz: RADIO_COSTILLA, color: col.metal });
    perfiles.push({ y: y0 + PASO_COSTILLA, rx: valle, rz: valle, color: col.metal });
  }
  const nucleo = pintar(new THREE.IcosahedronGeometry(RADIO_DEDO, 0), col.metal);
  return fusionar([tuboPerfiles(perfiles, LADOS_DEDO), nucleo]);
}

/** Punta redondeada: termina en y = 0 (el landmark de la punta) y se extiende hacia atrás. Algo más gruesa que el dedo. */
function geometriaPunta(col: ColoresGuante): THREE.BufferGeometry {
  const L = LARGO_PUNTA;
  const r = RADIO_PUNTA;
  return tuboPerfiles(
    [
      { y: -L, rx: RADIO_DEDO, rz: RADIO_DEDO, color: col.punta },
      { y: -L * 0.6, rx: r, rz: r, color: col.punta },
      { y: -L * 0.3, rx: r * 0.96, rz: r * 0.96, color: col.punta },
      { y: -L * 0.1, rx: r * 0.72, rz: r * 0.72, color: col.punta },
      { y: 0, rx: r * 0.32, rz: r * 0.32, color: col.punta },
    ],
    LADOS_DEDO,
    { fin: true },
  );
}

/**
 * Palma presurizada en unidades de la palma: x en anchos de nudillos (índice a meñique = 1), y en largos
 * (muñeca = 0, centro de los nudillos = 1). El grosor (z) va en metros y no se escala.
 * Lleva un pliegue sutil a media palma y una costura metálica junto a los nudillos.
 */
function geometriaPalma(col: ColoresGuante): THREE.BufferGeometry {
  const t = col.tela;
  return tuboPerfiles(
    [
      { y: -0.06, rx: 0.36, rz: 0.0145, color: t },
      { y: 0.18, rx: 0.42, rz: 0.0165, color: t },
      { y: 0.48, rx: 0.56, rz: 0.0172, color: t },
      // Pliegue: la tela se recoge un poco a media palma.
      { y: 0.54, rx: 0.545, rz: 0.0158, color: t },
      { y: 0.6, rx: 0.585, rz: 0.017, color: t },
      { y: 0.86, rx: 0.66, rz: 0.0162, color: col.metal },
      // Costura junto a los nudillos.
      { y: 0.9, rx: 0.665, rz: 0.0164, color: t },
      { y: 1.0, rx: 0.655, rz: 0.0145, color: t },
      { y: 1.1, rx: 0.56, rz: 0.0095, color: t },
    ],
    LADOS_DEDO,
    { inicio: true, fin: true },
  );
}

/**
 * Puño en el sistema de la muñeca (metros, sin escala): y hacia los dedos, −y hacia el antebrazo.
 * Manga, dos tiras de color, anillo de cierre, anillo metálico y, en el dorso, un parche genérico.
 * `ladoDorso` (+1 o −1) indica hacia qué z queda el dorso de la mano.
 */
function geometriaPuno(col: ColoresGuante, ladoDorso: 1 | -1): THREE.BufferGeometry {
  const t = col.tela;
  const puno = tuboPerfiles(
    [
      // Manga hacia el antebrazo.
      { y: -0.085, rx: 0.033, rz: 0.027, color: t },
      // Dos tiras de color sobre la manga.
      { y: -0.04, rx: 0.0335, rz: 0.0275, color: col.tiraA },
      { y: -0.035, rx: 0.0335, rz: 0.0275, color: col.tiraB },
      { y: -0.03, rx: 0.0335, rz: 0.0275, color: t },
      // Anillo de cierre grande.
      { y: -0.028, rx: 0.0375, rz: 0.0315, color: t },
      { y: -0.012, rx: 0.0375, rz: 0.0315, color: col.metal },
      // Anillo metálico encima.
      { y: -0.01, rx: 0.039, rz: 0.033, color: col.metal },
      { y: -0.002, rx: 0.039, rz: 0.033, color: col.metal },
      { y: 0.0, rx: 0.034, rz: 0.028, color: t },
      // Cuello hacia la palma.
      { y: 0.012, rx: 0.029, rz: 0.019, color: t },
    ],
    LADOS_PUNO,
    { inicio: true, fin: true },
  );

  // Parche de manga genérico: cuadrado de esquinas cortadas con un círculo rojo y otro azul encima. Sin logos.
  const z0 = ladoDorso * 0.0285;
  const placa = pintar(new THREE.CylinderGeometry(0.0115, 0.0115, 0.0016, 8), col.parcheFondo);
  const exterior = pintar(new THREE.CylinderGeometry(0.0078, 0.0078, 0.0008, 8), col.parcheExterior);
  const interior = pintar(new THREE.CylinderGeometry(0.0048, 0.0048, 0.0008, 8), col.parcheInterior);
  const colocar = (geo: THREE.BufferGeometry, dz: number): THREE.BufferGeometry => {
    // El cilindro va a lo largo de Y: se tumba para que su cara mire hacia el dorso (±z).
    geo.rotateX(Math.PI / 2);
    // Octógono girado 22.5°: los lados quedan rectos arriba, abajo y a los lados (cuadrado redondeado).
    geo.rotateZ(Math.PI / 8);
    geo.translate(0, -0.06, z0 + ladoDorso * dz);
    return geo;
  };
  return fusionar([puno, colocar(placa, 0), colocar(exterior, 0.0011), colocar(interior, 0.0018)]);
}

export interface GeometriasGuante {
  material: THREE.MeshStandardMaterial;
  segmento: THREE.BufferGeometry;
  fuelle: THREE.BufferGeometry;
  punta: THREE.BufferGeometry;
  palma: THREE.BufferGeometry;
  /** Puño con el parche en +z y en −z: cada mano usa el que cae en su dorso. */
  punoDorsoPositivo: THREE.BufferGeometry;
  punoDorsoNegativo: THREE.BufferGeometry;
}

/** Geometrías y material del guante para un estilo. Se crean una vez y las comparten las dos manos. */
export function crearGeometriasGuante(estilo: EstiloGuante = GUANTE_ESTILO): GeometriasGuante {
  const col = COLORES_GUANTE[estilo];
  return {
    material: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      flatShading: true,
      roughness: col.rugosidad,
      metalness: col.metalicidad,
    }),
    segmento: geometriaSegmento(col),
    fuelle: geometriaFuelle(col),
    punta: geometriaPunta(col),
    palma: geometriaPalma(col),
    punoDorsoPositivo: geometriaPuno(col, 1),
    punoDorsoNegativo: geometriaPuno(col, -1),
  };
}
