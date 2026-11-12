// Guante de traje espacial low poly facetado para las manos del avatar (spec-visual-museo §9).
// Solo geometría y colores, generados en código. Cada pieza se construye una vez; manos.ts las mueve
// con transformaciones en cada fotograma (nunca reconstruye geometría).
//
// Forma (referencia low poly): prismas hexagonales, caras planas, normales por cara (flatShading) y un tono distinto
// por cara según su orientación. Piezas de cada mano (una llamada de dibujo por pieza):
// - puño: manga octogonal con dos franjas (azul y roja), anillo de cierre metálico, cuello y emblema circular.
//   Rígido. Su anillo del cuello es el anillo de la muñeca de la palma (vértices compartidos).
// - palma (dinámica): bloque de 8 caras que se estrecha hacia la muñeca. Su borde superior pasa por los 4 MCP.
// - cuña tenar (dinámica): de la muñeca a la base del pulgar; su anillo final es el primer anillo del pulgar.
// - dedos (dinámica): cada dedo es un tubo hexagonal cerrado con anillos compartidos en cada unión (inglete), que se
//   afina de 1.0 a 0.75. Las bandas de las articulaciones son caras de color del propio tubo.
// Las piezas dinámicas se reescriben cada fotograma con transformaciones de puntos (nunca se mueve un vértice
// compartido después de crearlo). Presupuesto: unos 690 triángulos por mano.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type EstiloGuante = 'blanco' | 'plata';

/** Estilo del guante: "blanco" (tela blanco hueso con bandas grises) o "plata" (metálico con puntas negras). */
export const GUANTE_ESTILO: EstiloGuante = 'blanco';

export interface ColoresGuante {
  /** Tela del guante, el dorso de la palma y la manga. */
  tela: number;
  /** Panel palmar de la palma y de los dedos (un tono más gris que la tela). */
  panel: number;
  /** Costuras y fuelles laterales de los dedos (fourchettes). */
  costura: number;
  /** Fuelles, anillos y trabas. */
  metal: number;
  /** Ranuras de los anillos metálicos. */
  metalOscuro: number;
  /** Puntas de los dedos. */
  punta: number;
  /** Tapa de la manga hacia el antebrazo: tela en sombra (un negro se leería como un guante vacío). */
  interior: number;
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
    panel: 0xd9d5cc,
    costura: 0xcbc6bc,
    metal: 0x9aa0a6,
    metalOscuro: 0x6c7279,
    punta: 0xe9e6df,
    interior: 0x8a857c,
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
    panel: 0xb3b8bf,
    costura: 0xa2a7ae,
    metal: 0x7d838b,
    metalOscuro: 0x565b62,
    punta: 0x1c1e22,
    interior: 0x6f737a,
    tiraA: 0x2f6fd0,
    tiraB: 0xc8463c,
    parcheFondo: 0xe2e4e8,
    parcheExterior: 0xc8463c,
    parcheInterior: 0x2f6fd0,
    rugosidad: 0.5,
    metalicidad: 0.3,
  },
};

const TAU = Math.PI * 2;
/** Lados de los dedos, bandas y puntas (hexágono con una cara plana mirando al frente). */
const LADOS_DEDO = 6;
/** Lados de la palma y el puño (octógono: caras planas arriba, abajo y a los lados). */
const LADOS_PALMA = 8;

/**
 * Radio de cada segmento (m) en el landmark donde empieza. Cada dedo se afina de 1.0 a 0.75 (AFINADO_SEGMENTO por
 * tramo: 0.909³ ≈ 0.75). No depende del Tamaño de la mano (que solo escala longitudes).
 */
export const RADIO_SEGMENTO: Readonly<Record<number, number>> = {
  1: 0.0145, 2: 0.0128, 3: 0.01163, // pulgar (la clave 1 es la eminencia tenar)
  5: 0.0115, 6: 0.01045, 7: 0.0095, // índice
  9: 0.0118, 10: 0.01073, 11: 0.00975, // medio
  13: 0.0112, 14: 0.01018, 15: 0.00925, // anular
  17: 0.0101, 18: 0.00918, 19: 0.00835, // meñique
};
export const AFINADO_SEGMENTO = 0.909;
/** Largo (m) de cada banda de articulación. Todas iguales, en los cinco dedos. */
export const LARGO_BANDA = 0.012;
/** Largo (m) del bisel de la punta y radio relativo del corte plano. */
const LARGO_PUNTA = 0.008;
const CORTE_PUNTA = 0.8;

/**
 * Cadenas de landmarks de cada dedo: [MCP, PIP, DIP, punta]; el pulgar [MCP, IP, punta]. Los cinco dedos se
 * generan con el mismo bucle. Las uniones con banda son todos los puntos salvo la punta: 4 × 3 + 2 = 14.
 */
export const CADENAS_DEDO: Readonly<Record<'pulgar' | 'indice' | 'medio' | 'anular' | 'menique', readonly number[]>> = {
  pulgar: [2, 3, 4],
  indice: [5, 6, 7, 8],
  medio: [9, 10, 11, 12],
  anular: [13, 14, 15, 16],
  menique: [17, 18, 19, 20],
};
/** Uniones con banda de cada dedo (landmarks). */
export const UNIONES_DEDO: Readonly<Record<string, readonly number[]>> = Object.fromEntries(
  Object.entries(CADENAS_DEDO).map(([n, c]) => [n, c.slice(0, -1)]),
);

/**
 * Perfil de la palma, en unidades de la palma: y en largos (muñeca = 0, centro de los nudillos = 1), rx (lado del
 * meñique) y rxPulgar (lado del pulgar) en anchos de nudillos. dorso y palmar son semiespesores en metros (no se escalan).
 * hipotenar: grosor extra (m) de la cara palmar en el lado del meñique. Exportado para la comprobación de las capturas.
 */
export const PERFIL_PALMA: readonly { y: number; rx: number; rxPulgar: number; dorso: number; palmar: number; hipotenar: number }[] = [
  { y: 0, rx: 0.34, rxPulgar: 0.3, dorso: 0.014, palmar: 0.013, hipotenar: 0 },
  { y: 0.45, rx: 0.5, rxPulgar: 0.47, dorso: 0.0185, palmar: 0.017, hipotenar: 0.004 },
  { y: 0.8, rx: 0.6, rxPulgar: 0.58, dorso: 0.017, palmar: 0.0155, hipotenar: 0.002 },
  { y: 1, rx: 0.62, rxPulgar: 0.62, dorso: 0.014, palmar: 0.0125, hipotenar: 0 },
];
/**
 * Límites de la palma en su marco local. Lateral: el MCP del meñique (y del índice) está a 0.5 anchos del eje muñeca →
 * nudillos; la palma puede sobrepasarlo como mucho 0.12 anchos (el ancho ya incluye HAND_SCALE). Longitudinal: de la
 * muñeca (y = 0) a la línea de los MCP (y = 1); el puño queda fuera de este bloque.
 */
export const LIMITE_LATERAL_PALMA = 0.5 + 0.12;
export const LIMITE_Y_PALMA: readonly [number, number] = [0, 1];

/** Sección de un tubo: punto (x, z) del contorno para el ángulo `a`. */
type Seccion = (a: number) => readonly [number, number];

interface Anillo {
  y: number;
  seccion: Seccion;
}

const elipse = (rx: number, rz: number): Seccion => (a) => [Math.cos(a) * rx, Math.sin(a) * rz];
const circulo = (r: number): Seccion => elipse(r, r);

/**
 * Tubo low poly por anillos a lo largo de Y, sin índices, con color por cara.
 * `desfase`: giro del primer vértice en fracción de cara (0.5 = una cara plana mira a +x y +z; 0 = un vértice en +x,
 * hexágono con cara plana en +z). `colorCara(banda, k)`: color de la cara k entre el anillo `banda` y el siguiente.
 * `tapas` cierra el primer y/o el último anillo con un abanico del color dado.
 */
function tubo(
  anillos: readonly Anillo[],
  lados: number,
  desfase: number,
  colorCara: (banda: number, k: number) => number,
  tapas: { inicio?: number; fin?: number; invertir?: boolean } = {},
): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  const puntos = anillos.map((an) =>
    Array.from({ length: lados }, (_, k) => {
      const [x, z] = an.seccion(((k + desfase) / lados) * TAU);
      return [x, an.y, z];
    }),
  );
  const v = (i: number, k: number): number[] => puntos[i][((k % lados) + lados) % lados];
  const tri = (a: number[], b: number[], d: number[], color: number): void => {
    // Pieza reflejada (lateralidad): el reflejo invierte el sentido de las caras, así que se intercambian dos vértices.
    if (tapas.invertir) pos.push(...a, ...d, ...b);
    else pos.push(...a, ...b, ...d);
    c.setHex(color);
    for (let i = 0; i < 3; i++) col.push(c.r, c.g, c.b);
  };
  const centro = (i: number): number[] => {
    let x = 0;
    let z = 0;
    for (const p of puntos[i]) {
      x += p[0];
      z += p[2];
    }
    return [x / lados, anillos[i].y, z / lados];
  };

  for (let i = 0; i + 1 < anillos.length; i++) {
    for (let k = 0; k < lados; k++) {
      const color = colorCara(i, k);
      // Orden antihorario visto desde fuera: la normal apunta hacia afuera.
      tri(v(i, k), v(i + 1, k), v(i, k + 1), color);
      tri(v(i, k + 1), v(i + 1, k), v(i + 1, k + 1), color);
    }
  }
  if (tapas.inicio !== undefined) {
    const o = centro(0);
    for (let k = 0; k < lados; k++) tri(o, v(0, k), v(0, k + 1), tapas.inicio);
  }
  if (tapas.fin !== undefined) {
    const n = anillos.length - 1;
    const o = centro(n);
    for (let k = 0; k < lados; k++) tri(o, v(n, k + 1), v(n, k), tapas.fin);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return geo;
}

/** Fuerza de la variación de tono por cara (fracción del color). */
const MATIZ_CARA = 0.1;

/**
 * Normales por cara (sin suavizado) y un tono ligeramente distinto por cara según su orientación: las caras que miran
 * hacia arriba y a la derecha se aclaran y las que miran abajo e izquierda se oscurecen. Así la forma se lee aunque la luz sea plana.
 */
function facetar(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  geo.computeVertexNormals(); // sin índices: una normal por cara
  const n = geo.getAttribute('normal');
  const col = geo.getAttribute('color');
  for (let f = 0; f < n.count / 3; f++) {
    const a = 3 * f;
    const k = 1 + MATIZ_CARA * (0.55 * n.getY(a) + 0.4 * n.getX(a) + 0.25 * n.getZ(a));
    for (let i = a; i < a + 3; i++) col.setXYZ(i, Math.min(1, col.getX(i) * k), Math.min(1, col.getY(i) * k), Math.min(1, col.getZ(i) * k));
  }
  return geo;
}

function fusionar(partes: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const geo = mergeGeometries(partes);
  if (!geo) throw new Error('No se pudo fusionar la geometría del guante');
  return geo;
}

/** Seno del ángulo del centro de la cara k (decide si es palmar o dorsal). */
function senoCara(k: number, lados: number, desfase: number): number {
  return Math.sin(((k + desfase + 0.5) / lados) * TAU);
}

const V3 = (): THREE.Vector3 => new THREE.Vector3();

/**
 * Anillo hexagonal de un dedo (6 vértices) centrado en `c`. `d1` es la dirección del tramo que llega y `d2` la del
 * que sale (null en los extremos). En una unión el anillo va en el plano de la bisectriz y se estira a lo largo del
 * plano del doblez (inglete), así los dos tramos comparten el mismo anillo y el codo no deja hueco ni escalón.
 * Una cara plana mira a +z del marco (como en `tubo` con desfase 0). `X`: eje lateral de la palma.
 */
export function anilloDedo(c: THREE.Vector3, d1: THREE.Vector3, d2: THREE.Vector3 | null, r: number, X: THREE.Vector3): THREE.Vector3[] {
  const m = V3().copy(d1);
  if (d2) m.add(d2);
  if (m.lengthSq() < 1e-10) m.copy(d1);
  m.normalize();
  const A = V3().copy(X).addScaledVector(m, -X.dot(m));
  if (A.lengthSq() < 1e-10) A.set(0, 0, 1).addScaledVector(m, -m.z);
  A.normalize();
  const B = V3().crossVectors(A, m);
  let e: THREE.Vector3 | null = null;
  let estira = 1;
  if (d2) {
    const n = V3().crossVectors(d1, d2);
    if (n.lengthSq() > 1e-8) {
      e = V3().crossVectors(n.normalize(), m).normalize();
      estira = 1 / Math.max(0.5, m.dot(d1));
    }
  }
  return Array.from({ length: LADOS_DEDO }, (_, k) => {
    const a = (k / LADOS_DEDO) * TAU;
    const w = V3().addScaledVector(A, Math.cos(a) * r).addScaledVector(B, Math.sin(a) * r);
    if (e) w.addScaledVector(e, w.dot(e) * (estira - 1));
    return w.add(c);
  });
}

/** Tipo de cara de un dedo: banda de articulación, tramo de tela, bisel de la punta o tapa. */
export type TipoCara = 'banda' | 'tramo' | 'bisel' | 'tapa';
interface SalidaTriangulos {
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, tipo: TipoCara, k: number): void;
}

/** Triángulos de un dedo: 12 por cada par de anillos y una tapa de 4 en la punta (y en la base salvo el pulgar). */
export function trianguloDeDedo(cadena: readonly number[]): number {
  const n = cadena.length - 1;
  return 12 * (2 * n + 1) + 4 + (cadena[0] === 2 ? 0 : 4);
}
const distanciaUnica = (a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3 => V3().subVectors(b, a);

/**
 * Emite los triángulos de un dedo como UN tubo hexagonal cerrado, con anillos compartidos en cada unión:
 * base (en el MCP) → banda → tramo → [banda en la unión → tramo]… → bisel → corte plano de la punta.
 * Las bandas son caras de color (metal) del propio tubo: no cambian la forma. El pulgar no lleva tapa en la base:
 * su primer anillo es el último de la cuña tenar (mismos vértices). Los largos de banda y bisel se reducen si los
 * huesos son muy cortos (Tamaño de la mano pequeño).
 */
function emitirDedo(cadena: readonly number[], p: readonly THREE.Vector3[], X: THREE.Vector3, sal: SalidaTriangulos): void {
  const n = cadena.length - 1;
  const Q = cadena.map((j) => p[j]);
  const d: THREE.Vector3[] = [];
  let minimo = Infinity;
  for (let i = 0; i < n; i++) {
    const v = distanciaUnica(Q[i], Q[i + 1]);
    const l = v.length();
    minimo = Math.min(minimo, l);
    d.push(l > 1e-9 ? v.divideScalar(l) : (d[i - 1] ?? V3().set(0, 1, 0)).clone());
  }
  const f = Math.min(1, Math.max(0.4, minimo / 0.024));
  const h = (LARGO_BANDA / 2) * f;
  const radio = (i: number): number => RADIO_SEGMENTO[cadena[i]];
  const anillos: THREE.Vector3[][] = [];
  const tipos: TipoCara[] = []; // tipo de las caras entre el anillo i y el i + 1
  anillos.push(anilloDedo(Q[0], d[0], null, radio(0), X));
  anillos.push(anilloDedo(V3().copy(Q[0]).addScaledVector(d[0], 2 * h), d[0], null, radio(0), X));
  tipos.push('banda');
  for (let j = 1; j < n; j++) {
    const m = V3().addVectors(d[j - 1], d[j]);
    if (m.lengthSq() < 1e-10) m.copy(d[j]);
    m.normalize();
    anillos.push(anilloDedo(V3().copy(Q[j]).addScaledVector(m, -h), d[j - 1], d[j], radio(j), X));
    tipos.push('tramo');
    anillos.push(anilloDedo(V3().copy(Q[j]).addScaledVector(m, h), d[j - 1], d[j], radio(j), X));
    tipos.push('banda');
  }
  const rFin = radio(n - 1) * AFINADO_SEGMENTO;
  anillos.push(anilloDedo(V3().copy(Q[n]).addScaledVector(d[n - 1], -LARGO_PUNTA * f), d[n - 1], null, rFin, X));
  tipos.push('tramo');
  anillos.push(anilloDedo(Q[n], d[n - 1], null, rFin * CORTE_PUNTA, X));
  tipos.push('bisel');

  const v = (i: number, k: number): THREE.Vector3 => anillos[i][((k % LADOS_DEDO) + LADOS_DEDO) % LADOS_DEDO];
  for (let i = 0; i + 1 < anillos.length; i++) {
    for (let k = 0; k < LADOS_DEDO; k++) {
      sal.tri(v(i, k), v(i + 1, k), v(i, k + 1), tipos[i], k);
      sal.tri(v(i, k + 1), v(i + 1, k), v(i + 1, k + 1), tipos[i], k);
    }
  }
  // Tapas de 4 triángulos (hexágono convexo): en la base (todos menos el pulgar) y en el corte de la punta.
  if (cadena[0] !== 2) for (let k = 1; k <= 4; k++) sal.tri(v(0, 0), v(0, k), v(0, k + 1), 'tapa', k);
  const u = anillos.length - 1;
  for (let k = 1; k <= 4; k++) sal.tri(v(u, 0), v(u, k + 1), v(u, k), 'tapa', k);
}

/** Posiciones de los cinco dedos (pulgar, índice, medio, anular, meñique) a partir de los 21 puntos. */
export function actualizarDedos(pos: Float32Array, p: readonly THREE.Vector3[], X: THREE.Vector3): void {
  let i = 0;
  const sal: SalidaTriangulos = {
    tri(a, b, c) {
      for (const q of [a, b, c]) {
        pos[i++] = q.x;
        pos[i++] = q.y;
        pos[i++] = q.z;
      }
    },
  };
  for (const cadena of Object.values(CADENAS_DEDO)) emitirDedo(cadena, p, X, sal);
}

/** Triángulos de cada dedo y su posición (en triángulos) dentro de la geometría de los dedos. */
export const DISEÑO_DEDOS: readonly { nombre: string; cadena: readonly number[]; inicio: number; triangulos: number }[] = (() => {
  let inicio = 0;
  return Object.entries(CADENAS_DEDO).map(([nombre, cadena]) => {
    const triangulos = trianguloDeDedo(cadena);
    const e = { nombre, cadena, inicio, triangulos };
    inicio += triangulos;
    return e;
  });
})();
export const TRIANGULOS_DEDOS = DISEÑO_DEDOS.reduce((t, d) => t + d.triangulos, 0);

/** Geometría de los dedos (dinámica: `actualizarDedos` reescribe las posiciones). Plantilla con colores por cara. */
function geometriaDedos(col: ColoresGuante, ladoDorso: 1 | -1): THREE.BufferGeometry {
  // Mano de plantilla con los dedos rectos, solo para dar forma inicial a los datos.
  const p = Array.from({ length: 21 }, () => V3());
  Object.values(CADENAS_DEDO).forEach((cadena, f) => cadena.forEach((j, i) => p[j].set(f * 0.025, 0.09 + i * 0.03, 0)));
  const pos: number[] = [];
  const colores: number[] = [];
  const c = new THREE.Color();
  const sal: SalidaTriangulos = {
    tri(a, b, d, tipo, k) {
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z, d.x, d.y, d.z);
      let color = col.tela;
      if (tipo === 'banda') color = col.metal;
      else if (tipo === 'tramo' && Math.sin(((k + 0.5) / LADOS_DEDO) * TAU) * ladoDorso < -0.5) color = col.panel;
      else if (tipo === 'bisel' || tipo === 'tapa') color = col.punta;
      c.setHex(color);
      for (let i = 0; i < 3; i++) colores.push(c.r, c.g, c.b);
    },
  };
  const X = V3().set(1, 0, 0);
  for (const cadena of Object.values(CADENAS_DEDO)) emitirDedo(cadena, p, X, sal);
  const geo = new THREE.BufferGeometry();
  const attr = new THREE.BufferAttribute(new Float32Array(pos), 3);
  attr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', attr);
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colores), 3));
  return facetar(geo);
}

/** Semiejes (m) de la base de la cuña en la muñeca. */
const TENAR_BASE_X = 0.022;
const TENAR_BASE_Z = 0.011;

/**
 * Escribe los 18 triángulos de la cuña tenar (12 laterales + tapa de 6 en la muñeca) en `pos`. Base: hexágono elíptico
 * en la muñeca (marco X, Z). Final: el anillo base del pulgar (`anilloFin`, calculado con `anilloDedo` igual que en el
 * primer anillo del dedo): mismos vértices, así que la cuña y el pulgar forman una sola malla cerrada.
 */
export function actualizarTenar(
  pos: Float32Array,
  muneca: THREE.Vector3,
  X: THREE.Vector3,
  Z: THREE.Vector3,
  anilloFin: readonly THREE.Vector3[],
): void {
  const n = LADOS_DEDO;
  const base = Array.from({ length: n }, (_, k) => {
    const a = (k / n) * TAU;
    return V3().copy(muneca).addScaledVector(X, Math.cos(a) * TENAR_BASE_X).addScaledVector(Z, Math.sin(a) * TENAR_BASE_Z);
  });
  const centro = V3();
  for (const q of base) centro.add(q);
  centro.multiplyScalar(1 / n);
  let i = 0;
  const tri = (a: THREE.Vector3, b: THREE.Vector3, d: THREE.Vector3): void => {
    for (const q of [a, b, d]) {
      pos[i++] = q.x;
      pos[i++] = q.y;
      pos[i++] = q.z;
    }
  };
  for (let k = 0; k < n; k++) {
    tri(base[k], anilloFin[k], base[(k + 1) % n]);
    tri(base[(k + 1) % n], anilloFin[k], anilloFin[(k + 1) % n]);
  }
  for (let k = 0; k < n; k++) tri(centro, base[k], base[(k + 1) % n]);
}

/** Cuña de la eminencia tenar: plano inclinado de la muñeca a la base del pulgar. Dinámica; una copia por mano. */
function geometriaTenar(col: ColoresGuante): THREE.BufferGeometry {
  const pos = new Float32Array(18 * 9);
  const anillo = anilloDedo(V3().set(0, 0.07, 0), V3().set(0, 1, 0), null, RADIO_SEGMENTO[2], V3().set(1, 0, 0));
  actualizarTenar(pos, V3(), V3().set(1, 0, 0), V3().set(0, 0, 1), anillo);
  const geo = new THREE.BufferGeometry();
  const attr = new THREE.BufferAttribute(pos, 3);
  attr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', attr);
  const c = new THREE.Color(col.tela);
  const cols = new Float32Array(pos.length);
  for (let i = 0; i < cols.length; i += 3) cols.set([c.r, c.g, c.b], i);
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return facetar(geo);
}

/**
 * Anillo del cuello del puño, en su marco (y hacia los dedos). La palma empieza en este mismo anillo: puño y palma
 * comparten sus 8 vértices, sin escalón ni hueco en ninguna pose.
 */
export const CUELLO = { y: 0.015, rx: 0.029, rz: 0.0195 } as const;

/** MCP (landmark) de cada vértice del anillo superior de la palma: pulgar → meñique en el dorso, y de vuelta en la cara palmar. */
export const MCP_ANILLO_SUPERIOR: readonly number[] = [17, 13, 9, 5, 5, 9, 13, 17];
/** Semiespesor (m) del borde superior de la palma. Simétrico: el MCP queda en el punto medio de sus dos vértices. */
export const ESPESOR_BORDE_MCP = 0.0125;

/**
 * Escribe en `pos` los triángulos de la palma (mismo orden que `tubo`, 64 triángulos). Se reescribe cada fotograma.
 * Los anillos de la muñeca y del medio salen de PERFIL_PALMA en el marco local de la palma (X lateral, Y muñeca →
 * nudillos, Z normal; `ancho` y `largo` ya incluyen HAND_SCALE). El anillo superior no sale de una plantilla: sus
 * vértices se colocan sobre los 4 MCP reales (dorso y cara palmar de cada uno, a ± ESPESOR_BORDE_MCP), así que el borde
 * superior de la palma pasa exactamente por el origen de cada dedo, y los MCP nunca se mueven. Hacia el pulgar el
 * borde acaba en el MCP del índice y hacia el meñique en el del meñique: no sobresale lateralmente.
 * `mcp`: puntos de los landmarks 5, 9, 13 y 17 (en ese orden).
 */
export function actualizarPalma(
  pos: Float32Array,
  ladoDorso: 1 | -1,
  muneca: THREE.Vector3,
  X: THREE.Vector3,
  Y: THREE.Vector3,
  Z: THREE.Vector3,
  ancho: number,
  largo: number,
  mcp: readonly THREE.Vector3[],
): void {
  const n = LADOS_PALMA;
  const anillos: THREE.Vector3[][] = [];
  // Anillo de la muñeca: el cuello del puño (mismos vértices).
  anillos.push(
    Array.from({ length: n }, (_, k) => {
      const a = ((k + 0.5) / n) * TAU;
      return V3().copy(muneca).addScaledVector(X, Math.cos(a) * CUELLO.rx).addScaledVector(Y, CUELLO.y).addScaledVector(Z, Math.sin(a) * CUELLO.rz * ladoDorso);
    }),
  );
  for (let r = 1; r < PERFIL_PALMA.length - 1; r++) {
    const p = PERFIL_PALMA[r];
    anillos.push(
      Array.from({ length: n }, (_, k) => {
        const a = ((k + 0.5) / n) * TAU;
        const c = Math.cos(a);
        const sn = Math.sin(a);
        const x = c * Math.min(c < 0 ? p.rxPulgar : p.rx, LIMITE_LATERAL_PALMA);
        const z = (sn >= 0 ? sn * p.dorso : sn * (p.palmar + p.hipotenar * Math.max(0, c))) * ladoDorso;
        return V3().copy(muneca).addScaledVector(X, x * ancho).addScaledVector(Y, p.y * largo).addScaledVector(Z, z);
      }),
    );
  }
  const indices = [5, 9, 13, 17];
  anillos.push(
    MCP_ANILLO_SUPERIOR.map((j, k) => V3().copy(mcp[indices.indexOf(j)]).addScaledVector(Z, (k < n / 2 ? 1 : -1) * ladoDorso * ESPESOR_BORDE_MCP)),
  );
  const centro = (i: number): THREE.Vector3 => anillos[i].reduce((t, q) => t.add(q), V3()).multiplyScalar(1 / n);
  let i = 0;
  const tri = (a: THREE.Vector3, b: THREE.Vector3, d: THREE.Vector3): void => {
    const orden = ladoDorso < 0 ? [a, d, b] : [a, b, d];
    for (const q of orden) {
      pos[i++] = q.x;
      pos[i++] = q.y;
      pos[i++] = q.z;
    }
  };
  const v = (r: number, k: number): THREE.Vector3 => anillos[r][((k % n) + n) % n];
  for (let r = 0; r + 1 < anillos.length; r++) {
    for (let k = 0; k < n; k++) {
      tri(v(r, k), v(r + 1, k), v(r, k + 1));
      tri(v(r, k + 1), v(r + 1, k), v(r + 1, k + 1));
    }
  }
  const last = anillos.length - 1;
  const o1 = centro(last);
  for (let k = 0; k < n; k++) tri(o1, v(last, k + 1), v(last, k));
}

/**
 * Palma facetada: bloque de 8 caras que se estrecha hacia la muñeca; los nudillos forman una línea ancha y masa
 * hipotenar en el lado del meñique. Geometría dinámica (ver `actualizarPalma`); aquí se crea la plantilla con el color
 * de cada cara y el tono por orientación. `ladoDorso` (+1 o −1) indica hacia qué z queda el dorso.
 */
function geometriaPalma(col: ColoresGuante, ladoDorso: 1 | -1): THREE.BufferGeometry {
  const anillos: Anillo[] = PERFIL_PALMA.map((p) => ({
    y: p.y * 0.11,
    seccion: (a: number) => {
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const x = c * Math.min(c < 0 ? p.rxPulgar : p.rx, LIMITE_LATERAL_PALMA) * 0.075;
      const z = sn >= 0 ? sn * p.dorso : sn * (p.palmar + p.hipotenar * Math.max(0, c));
      return [x, z * ladoDorso];
    },
  }));
  const geo = tubo(
    anillos,
    LADOS_PALMA,
    0.5,
    (_, k) => (senoCara(k, LADOS_PALMA, 0.5) * ladoDorso < -0.3 ? col.panel : col.tela),
    { fin: col.tela, invertir: ladoDorso < 0 },
  );
  (geo.getAttribute('position') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
  return facetar(geo);
}

/**
 * Puño en el sistema de la muñeca (metros, sin escala): y hacia los dedos, −y hacia el antebrazo.
 * Manga octogonal con una franja azul y otra roja, anillo de cierre metálico biselado, cuello hacia la palma y, en el
 * dorso, un emblema circular genérico (sin logos de agencias ni misiones). `ladoDorso` (+1 o −1): z del dorso.
 */
function geometriaPuno(col: ColoresGuante, ladoDorso: 1 | -1): THREE.BufferGeometry {
  const t = col.tela;
  // [y, rx, rz, color de la banda que empieza aquí]
  const perfil: [number, number, number, number][] = [
    [-0.085, 0.033, 0.027, t],
    [-0.054, 0.0335, 0.0275, col.tiraA],
    [-0.047, 0.0335, 0.0275, col.tiraB],
    [-0.04, 0.0335, 0.0275, t],
    [-0.032, 0.0335, 0.0275, col.metal],
    [-0.028, 0.0375, 0.0315, col.metal],
    [-0.004, 0.0375, 0.0315, col.metalOscuro],
    [-0.001, 0.031, 0.0235, t],
    [CUELLO.y, CUELLO.rx, CUELLO.rz, t],
  ];
  const anillos = perfil.map(([y, rx, rz]) => ({ y, seccion: elipse(rx, rz) }));
  const puno = facetar(tubo(anillos, LADOS_PALMA, 0.5, (i) => perfil[i][3], { inicio: col.interior }));

  // Emblema circular en el dorso de la manga: dos prismas hexagonales cerrados (círculo rojo y círculo azul encima).
  const zCara = ladoDorso * Math.sin(Math.PI / 4 + Math.PI / 8) * 0.0275;
  const prisma = (r: number, alto: number, color: number): THREE.BufferGeometry => {
    const g = tubo([{ y: 0, seccion: circulo(r) }, { y: alto, seccion: circulo(r) }], LADOS_DEDO, 0, () => color, { inicio: color, fin: color });
    g.rotateX((ladoDorso * Math.PI) / 2); // el eje del prisma (y) pasa a ±z, hacia afuera del dorso
    g.translate(0, -0.069, zCara - ladoDorso * 0.0004);
    return facetar(g);
  };
  return fusionar([puno, prisma(0.0105, 0.0016, col.parcheExterior), prisma(0.006, 0.0026, col.parcheInterior)]);
}

/** Piezas que dependen de hacia qué z queda el dorso de la mano (lateralidad). */
export interface PiezasLado {
  /** Dedos: geometría dinámica, una copia por mano (`.clone()`). */
  dedos: THREE.BufferGeometry;
  /** Palma: geometría dinámica, una copia por mano (`.clone()`). */
  palma: THREE.BufferGeometry;
  puno: THREE.BufferGeometry;
}

export interface GeometriasGuante {
  material: THREE.MeshStandardMaterial;
  /** Cuña tenar (dinámica): cada mano debe usar su propia copia (`.clone()`). */
  tenar: THREE.BufferGeometry;
  /** Piezas con el dorso en +z y en −z: un único constructor con la lateralidad como parámetro. */
  dorsoPositivo: PiezasLado;
  dorsoNegativo: PiezasLado;
}

/** Geometrías y material del guante para un estilo. Se crean una vez y las comparten las dos manos. */
export function crearGeometriasGuante(estilo: EstiloGuante = GUANTE_ESTILO): GeometriasGuante {
  const col = COLORES_GUANTE[estilo];
  const lado = (ladoDorso: 1 | -1): PiezasLado => ({
    dedos: geometriaDedos(col, ladoDorso),
    palma: geometriaPalma(col, ladoDorso),
    puno: geometriaPuno(col, ladoDorso),
  });
  return {
    // flatShading: normales por cara, sin suavizado.
    material: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      flatShading: true,
      roughness: col.rugosidad,
      metalness: col.metalicidad,
    }),
    tenar: geometriaTenar(col),
    dorsoPositivo: lado(1),
    dorsoNegativo: lado(-1),
  };
}
