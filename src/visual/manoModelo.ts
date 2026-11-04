// Modelo articulado de la mano (SPEC 5.5 y 8.1). Lógica pura: sin Three.js, sin cámara ni DOM.
//
// Una pose son 24 parámetros: rotación de la palma (3); cada dedo (4: flexión MCP, abducción MCP, flexión PIP,
// flexión DIP); pulgar (5: flexión CMC, abducción CMC, flexión MCP, abducción MCP, flexión IP).
// Cada dedo se mueve en un solo plano: PIP y DIP solo flexionan, sin movimiento lateral ni rotación axial.
// El DIP es libre, pero hay una penalización suave hacia DIP ≈ 2/3 PIP. La rotación axial del CMC del pulgar
// no es parámetro: se calcula a partir de su abducción.
// La palma es rígida y la muñeca no se ajusta: sigue saliendo del tracker. Las longitudes de hueso son fijas
// (HAND_BONE_LENGTHS, sin escalar). Los límites se aplican dentro del optimizador, en cada iteración.
//
// Convenciones (metros y radianes en el código): x de índice a meñique, y hacia los dedos, z hacia la cara palmar.
// Flexión positiva = hacia la palma. Abducción positiva = hacia el pulgar (radial). Las manos derechas se reflejan en x.

import { HAND_BONE_LENGTHS } from './manosGeometria.ts';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Observación de una mano: puntos del tracker (metros, con origen en la mano), confianza de cada uno y lateralidad. */
export interface ObservacionMano {
  /** 21 puntos. Un punto ausente o no finito no aporta. */
  puntos: readonly (Vec3 | undefined)[];
  /** Confianza de cada punto, 0–1. Con 0 el punto no aporta nada al ajuste. */
  confianza: readonly number[];
  lado: 'Left' | 'Right' | 'Unknown';
}

export interface ResultadoAjuste {
  /** Los 24 parámetros ajustados (radianes). */
  parametros: Float64Array;
  /** Suma de los residuos de los landmarks (sin los términos de regularización). */
  residuo: number;
  /** 21 puntos del modelo en metros, con la muñeca en el origen y con la lateralidad de la observación. */
  puntos: Vec3[];
}

const GRADOS = Math.PI / 180;

/**
 * Límites anatómicos de referencia, en grados (mínimo, máximo). Son valores de partida de biomecánica general,
 * no medidos: déjalos aquí para ajustarlos. Flexión positiva = hacia la palma; abducción positiva = hacia el pulgar.
 * Los movimientos laterales y las rotaciones axiales de PIP y DIP son 0 y no son parámetros.
 */
export const HAND_JOINT_LIMITS = {
  indice: { mcpFlexion: [0, 90], mcpAbduccion: [-45, 45], pipFlexion: [0, 90], dipFlexion: [0, 90] },
  medio: { mcpFlexion: [0, 90], mcpAbduccion: [-45, 45], pipFlexion: [0, 90], dipFlexion: [0, 90] },
  anular: { mcpFlexion: [0, 90], mcpAbduccion: [-45, 45], pipFlexion: [0, 90], dipFlexion: [0, 90] },
  menique: { mcpFlexion: [0, 90], mcpAbduccion: [-45, 45], pipFlexion: [0, 90], dipFlexion: [0, 90] },
  pulgar: {
    cmcFlexion: [-20, 30],
    cmcAbduccion: [0, 20],
    cmcRotacionAxial: [0, 20], // Se calcula con la abducción del CMC; no es parámetro libre.
    mcpFlexion: [0, 90],
    mcpAbduccion: [-8, 8],
    ipFlexion: [0, 90],
  },
} as const;

/** Con flexión f > 0 del MCP, la abducción máxima se reduce a abducción_base × (1 − ACOPLE × f / 90°). */
export const ACOPLE_ABDUCCION_FLEXION = 0.8;

/** Máximo cambio de un parámetro entre dos fotogramas (rad). Evita que la pose dibujada salte. */
export const MAX_PASO_POR_FRAME = 20 * GRADOS;

export const NUM_PARAMETROS = 24;

const rad = ([min, max]: readonly [number, number]): readonly [number, number] => [min * GRADOS, max * GRADOS];
const DEDOS = ['indice', 'medio', 'anular', 'menique'] as const;

/** Tabla de límites editable (grados): articulación → parámetro → [mínimo, máximo]. Mismo formato que HAND_JOINT_LIMITS. */
export type TablaLimites = Record<string, Record<string, readonly [number, number]>>;

/**
 * Límites de los 24 parámetros de la pose, en radianes y en el orden: palma (3); dedos índice, medio, anular y meñique
 * (MCP flexión, MCP abducción, PIP flexión, DIP flexión); pulgar (CMC flexión, CMC abducción, MCP flexión,
 * MCP abducción, IP flexión). Se calculan a partir de una tabla en grados.
 */
export function limitesParametros(tabla: TablaLimites = HAND_JOINT_LIMITS): (readonly [number, number])[] {
  const t = tabla;
  return [
    rad([-180, 180]), rad([-180, 180]), rad([-180, 180]),
    ...DEDOS.flatMap((d) => [
      rad(t[d].mcpFlexion),
      rad(t[d].mcpAbduccion),
      rad(t[d].pipFlexion),
      rad(t[d].dipFlexion),
    ]),
    rad(t.pulgar.cmcFlexion),
    rad(t.pulgar.cmcAbduccion),
    rad(t.pulgar.mcpFlexion),
    rad(t.pulgar.mcpAbduccion),
    rad(t.pulgar.ipFlexion),
  ];
}

export const LIMITES_PARAMETROS: readonly (readonly [number, number])[] = limitesParametros();

/** Peso de la profundidad z frente a x e y: es lo más ruidoso del tracking. */
const PESO_Z = 0.3;
/** Peso de la continuidad temporal (alejarse de la pose anterior). */
const LAMBDA_CONTINUIDAD = 0.005;
/** Peso de la pose relajada para los dedos y el pulgar sin evidencia. */
const LAMBDA_RELAJADA = 0.002;
/** Peso de la penalización suave DIP ≈ 2/3 PIP (no es un límite: un dedo puede tener PIP doblado y DIP recto). */
const LAMBDA_DIP = 0.01;
const ITERACIONES_MAX = 6;
const PASO_DERIVADA = 1e-6;
const FILAS_PUNTOS = 20 * 3;
const FILAS = FILAS_PUNTOS + NUM_PARAMETROS + (NUM_PARAMETROS - 3) + 4;

/** Posición de la base de cada dedo en la palma (índice, medio, anular, meñique), en metros. */
const BASE_MCP: readonly Vec3[] = [
  { x: -0.027, y: 0.087, z: 0 },
  { x: -0.009, y: 0.092, z: 0 },
  { x: 0.009, y: 0.088, z: 0 },
  { x: 0.027, y: 0.080, z: 0 },
];
/** Articulación CMC del pulgar, en la palma. */
const CMC_PULGAR: Vec3 = { x: -0.036, y: 0.025, z: 0 };

const EJE_X: Vec3 = { x: 1, y: 0, z: 0 };
const EJE_Y: Vec3 = { x: 0, y: 1, z: 0 };
const EJE_Z: Vec3 = { x: 0, y: 0, z: 1 };

const suma = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const resta = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const escala = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const producto = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const punto = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const unitario = (a: Vec3): Vec3 | null => {
  const n = Math.hypot(a.x, a.y, a.z);
  return n > 1e-12 ? escala(a, 1 / n) : null;
};
const finito = (p: Vec3 | undefined): p is Vec3 =>
  p !== undefined && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
const acotar = (v: number, [min, max]: readonly [number, number]): number => Math.min(max, Math.max(min, v));
/** Ángulo en (−π, π]. */
const envolver = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/** Longitud de hueso según el punto hijo de MediaPipe (ver HAND_BONE_LENGTHS). */
const L = HAND_BONE_LENGTHS;
/** Dirección del pulgar en reposo, en el plano de la palma (hacia el lado del índice y hacia delante). */
const DIR_PULGAR: Vec3 = { x: -0.6, y: 0.8, z: 0 };

/** Índices de los parámetros de abducción MCP de los dedos (4, 8, 12, 16). */
const esAbduccionDedo = (j: number): boolean => j >= 4 && j <= 16 && (j - 4) % 4 === 0;

/**
 * Límite efectivo de un parámetro dado el resto de la pose. La abducción del MCP se reduce con la flexión del MCP,
 * así que su rango depende del parámetro de flexión anterior (que debe estar ya acotado).
 */
function rangoEfectivo(j: number, p: ArrayLike<number>, lim: readonly (readonly [number, number])[]): readonly [number, number] {
  const base = lim[j];
  if (!esAbduccionDedo(j)) return base;
  const flexion = Math.min(Math.max(p[j - 1], 0), 90 * GRADOS);
  const factor = 1 - (ACOPLE_ABDUCCION_FLEXION * flexion) / (90 * GRADOS);
  return [base[0] * factor, base[1] * factor];
}

/** Proyecta la pose sobre los límites (con el acoplamiento de la abducción). Modifica `p`. */
export function proyectarALimites(p: Float64Array, lim: readonly (readonly [number, number])[] = LIMITES_PARAMETROS): void {
  for (let j = 0; j < NUM_PARAMETROS; j++) p[j] = acotar(p[j], rangoEfectivo(j, p, lim));
}

/** Comprueba que todos los parámetros están dentro de sus límites efectivos. */
export function dentroDeLimites(p: ArrayLike<number>, lim: readonly (readonly [number, number])[] = LIMITES_PARAMETROS): boolean {
  for (let j = 0; j < NUM_PARAMETROS; j++) {
    const [min, max] = rangoEfectivo(j, p, lim);
    if (p[j] < min - 1e-12 || p[j] > max + 1e-12) return false;
  }
  return true;
}

/** Gira `v` alrededor de z un ángulo `theta` (plano de la palma). */
function girarZ(v: Vec3, theta: number): Vec3 {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c, z: v.z };
}

/** Dirección de un hueso dentro del plano de flexión (F, N) con ángulo `theta` desde F hacia N. */
function direccionPlano(F: Vec3, theta: number, N: Vec3 = EJE_Z): Vec3 {
  return suma(escala(F, Math.cos(theta)), escala(N, Math.sin(theta)));
}

/** Columnas de una rotación: imagen de los ejes x, y, z de la palma en el sistema de la muñeca. */
type Columnas = [Vec3, Vec3, Vec3];

/** Matriz de rotación a partir de un vector de rotación (Rodrigues). */
function columnasDeRotacion(r: ArrayLike<number>): Columnas {
  const th = Math.hypot(r[0], r[1], r[2]);
  if (th < 1e-12) return [EJE_X, EJE_Y, EJE_Z];
  const k = escala({ x: r[0], y: r[1], z: r[2] }, 1 / th);
  const c = Math.cos(th);
  const s = Math.sin(th);
  const rotar = (v: Vec3): Vec3 =>
    suma(suma(escala(v, c), escala(producto(k, v), s)), escala(k, punto(k, v) * (1 - c)));
  return [rotar(EJE_X), rotar(EJE_Y), rotar(EJE_Z)];
}

/** Aplica la rotación (columnas) a un punto. */
function aplicar(c: Columnas, v: Vec3): Vec3 {
  return suma(suma(escala(c[0], v.x), escala(c[1], v.y)), escala(c[2], v.z));
}

/** Vector de rotación de una matriz de rotación (logaritmo). Devuelve (0,0,0) si la rotación es degenerada. */
function rvecDeColumnas(c: Columnas): [number, number, number] {
  const traza = c[0].x + c[1].y + c[2].z;
  const th = Math.acos(Math.min(1, Math.max(-1, (traza - 1) / 2)));
  const s = Math.sin(th);
  if (th < 1e-9 || s < 1e-9) return [0, 0, 0];
  const vx = c[1].z - c[2].y;
  const vy = c[2].x - c[0].z;
  const vz = c[0].y - c[1].x;
  const f = th / (2 * s);
  return [vx * f, vy * f, vz * f];
}

/** Base de la palma a partir de la observación (muñeca en el origen), o null si los puntos no bastan. */
function columnasDeMarco(q: readonly Vec3[]): Columnas | null {
  const x = unitario(resta(q[17], q[5]));
  const yRaw = unitario(q[9]);
  if (!x || !yRaw) return null;
  const z = unitario(producto(x, yRaw));
  if (!z) return null;
  const y = unitario(producto(z, x));
  if (!y) return null;
  return [x, y, z];
}

/** Pose de reposo para los dedos sin evidencia: dedos ligeramente flexionados, sin abducción. */
export function poseRelajada(): Float64Array {
  const p = new Float64Array(NUM_PARAMETROS);
  for (let f = 0; f < 4; f++) {
    const b = 3 + 4 * f;
    p[b] = 20 * GRADOS;
    p[b + 2] = 20 * GRADOS;
    p[b + 3] = (2 / 3) * 20 * GRADOS;
  }
  p[21] = 10 * GRADOS;
  p[23] = 10 * GRADOS;
  return p;
}

/**
 * Posiciones de los 21 puntos del modelo, con la muñeca en el origen y en el orden de MediaPipe.
 * Es la función directa (parámetros → puntos) que usa el ajuste y el dibujado.
 */
export function posicionesModelo(p: ArrayLike<number>, tabla: TablaLimites = HAND_JOINT_LIMITS): Vec3[] {
  const R = columnasDeRotacion([p[0], p[1], p[2]]);
  const salida: Vec3[] = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));

  for (let f = 0; f < 4; f++) {
    const b = 3 + 4 * f;
    // Cada dedo es una cadena plana: la abducción MCP gira el plano de flexión alrededor de z.
    const F = girarZ(EJE_Y, p[b + 1]);
    const flexMcp = p[b];
    const flexPip = flexMcp + p[b + 2];
    const flexDip = flexPip + p[b + 3];
    const mcp = BASE_MCP[f];
    const pip = suma(mcp, escala(direccionPlano(F, flexMcp), L[6 + 4 * f]));
    const dip = suma(pip, escala(direccionPlano(F, flexPip), L[7 + 4 * f]));
    const tip = suma(dip, escala(direccionPlano(F, flexDip), L[8 + 4 * f]));
    salida[5 + 4 * f] = aplicar(R, mcp);
    salida[6 + 4 * f] = aplicar(R, pip);
    salida[7 + 4 * f] = aplicar(R, dip);
    salida[8 + 4 * f] = aplicar(R, tip);
  }

  // Pulgar: CMC (punto 1), MCP (2), IP (3) y punta (4). El segmento 0→1 es fijo en la palma.
  const cmcFlex = p[19];
  const cmcAbd = p[20];
  const mcpFlex = p[21];
  const mcpAbd = p[22];
  const ipFlex = p[23];
  // La rotación axial del CMC no es parámetro: crece con la abducción hasta su máximo de la tabla.
  const rotMax = tabla.pulgar.cmcRotacionAxial[1] * GRADOS;
  const abdMax = tabla.pulgar.cmcAbduccion[1] * GRADOS;
  const rho = Math.min(1, Math.max(0, cmcAbd / abdMax)) * rotMax;
  const F0 = girarZ(DIR_PULGAR, cmcAbd);
  const N = suma(escala(EJE_Z, Math.cos(rho)), escala(producto(F0, EJE_Z), Math.sin(rho)));
  // La abducción del MCP gira F alrededor de N.
  const F1 = suma(escala(F0, Math.cos(mcpAbd)), escala(producto(N, F0), Math.sin(mcpAbd)));
  const j1 = CMC_PULGAR;
  const j2 = suma(j1, escala(direccionPlano(F0, cmcFlex, N), L[2]));
  const j3 = suma(j2, escala(direccionPlano(F1, cmcFlex + mcpFlex, N), L[3]));
  const j4 = suma(j3, escala(direccionPlano(F1, cmcFlex + mcpFlex + ipFlex, N), L[4]));
  salida[1] = aplicar(R, j1);
  salida[2] = aplicar(R, j2);
  salida[3] = aplicar(R, j3);
  salida[4] = aplicar(R, j4);

  return salida;
}

interface Datos {
  /** Tabla de límites: la rotación axial del pulgar depende de ella. */
  tabla: TablaLimites;
  /** Landmarks observados, con la muñeca en el origen y reflejados si la mano es derecha. */
  q: readonly Vec3[];
  /** Confianza de cada punto (0 = no aporta). */
  w: readonly number[];
  /** Pose anterior (continuidad temporal), o null si no hay. */
  ancla: Float64Array | null;
  relajada: Float64Array;
}

/** Residuos del ajuste: distancia ponderada de cada articulación, más los términos de regularización. */
function residuos(p: Float64Array, d: Datos, salida: Float64Array): void {
  const m = posicionesModelo(p, d.tabla);
  let k = 0;
  for (let i = 1; i < 21; i++) {
    const wi = d.w[i];
    salida[k++] = wi * (m[i].x - d.q[i].x);
    salida[k++] = wi * (m[i].y - d.q[i].y);
    salida[k++] = wi * PESO_Z * (m[i].z - d.q[i].z);
  }
  for (let j = 0; j < NUM_PARAMETROS; j++) {
    salida[k++] = d.ancla ? LAMBDA_CONTINUIDAD * (p[j] - d.ancla[j]) : 0;
  }
  for (let j = 3; j < NUM_PARAMETROS; j++) {
    salida[k++] = LAMBDA_RELAJADA * (p[j] - d.relajada[j]);
  }
  for (let f = 0; f < 4; f++) {
    const b = 3 + 4 * f;
    salida[k++] = LAMBDA_DIP * (p[b + 3] - (2 / 3) * p[b + 2]);
  }
}

function sumaCuadrados(v: Float64Array, hasta = v.length): number {
  let s = 0;
  for (let i = 0; i < hasta; i++) s += v[i] * v[i];
  return s;
}

/** Resuelve A·x = b por eliminación gaussiana con pivote parcial. */
function resolver(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((fila, i) => [...fila, b[i]]);
  for (let c = 0; c < n; c++) {
    let mejor = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[mejor][c])) mejor = r;
    [M[c], M[mejor]] = [M[mejor], M[c]];
    const piv = M[c][c];
    if (Math.abs(piv) < 1e-14) return new Array(n).fill(0);
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / piv;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

/** Limita cada parámetro a MAX_PASO_POR_FRAME alrededor de la pose anterior, sin salir de los límites efectivos. */
function limitarPaso(p: Float64Array, anterior: Float64Array, lim: readonly (readonly [number, number])[]): void {
  for (let j = 0; j < NUM_PARAMETROS; j++) {
    const [min, max] = rangoEfectivo(j, p, lim);
    const lo = Math.max(anterior[j] - MAX_PASO_POR_FRAME, min);
    const hi = Math.min(anterior[j] + MAX_PASO_POR_FRAME, max);
    p[j] = lo <= hi ? acotar(p[j], [lo, hi]) : acotar(p[j], [min, max]);
  }
}

/**
 * Pose inicial cuando no hay pose anterior: los ángulos se leen de los segmentos observados, en el marco de la palma.
 * Sin esto, 6 iteraciones no bastan para llegar desde la pose relajada a poses alejadas.
 */
function poseDesdeObservacion(q: readonly Vec3[], marco: Columnas): Float64Array {
  const p = poseRelajada();
  const r = rvecDeColumnas(marco);
  p[0] = r[0];
  p[1] = r[1];
  p[2] = r[2];
  const local = (i: number): Vec3 => ({ x: punto(q[i], marco[0]), y: punto(q[i], marco[1]), z: punto(q[i], marco[2]) });

  for (let f = 0; f < 4; f++) {
    const b = 3 + 4 * f;
    const d1 = unitario(resta(local(6 + 4 * f), local(5 + 4 * f)));
    const d2 = unitario(resta(local(7 + 4 * f), local(6 + 4 * f)));
    const d3 = unitario(resta(local(8 + 4 * f), local(7 + 4 * f)));
    if (!d1 || !d2 || !d3) continue;
    // Si la flexión supera 90°, la parte horizontal del segmento cambia de signo: se toma la representación con |desv| menor.
    let desv = Math.atan2(-d1.x, d1.y);
    if (Math.abs(desv) > Math.PI / 2) desv = envolver(desv + Math.PI);
    const F = girarZ(EJE_Y, desv);
    const t1 = Math.atan2(punto(d1, EJE_Z), punto(d1, F));
    const t2 = Math.atan2(punto(d2, EJE_Z), punto(d2, F));
    const t3 = Math.atan2(punto(d3, EJE_Z), punto(d3, F));
    p[b] = t1;
    p[b + 1] = desv;
    p[b + 2] = envolver(t2 - t1);
    p[b + 3] = envolver(t3 - t2);
  }

  const e1 = unitario(resta(local(2), local(1)));
  const e2 = unitario(resta(local(3), local(2)));
  const e3 = unitario(resta(local(4), local(3)));
  if (e1 && e2 && e3) {
    // Igual que en los dedos: si el CMC pasa de 90° el signo horizontal se invierte; se toma |abducción| menor.
    let abd = envolver(Math.atan2(e1.y, e1.x) - Math.atan2(DIR_PULGAR.y, DIR_PULGAR.x));
    if (Math.abs(abd) > Math.PI / 2) abd = envolver(abd + Math.PI);
    const F = girarZ(DIR_PULGAR, abd);
    const cmc = Math.atan2(punto(e1, EJE_Z), punto(e1, F));
    const a2 = Math.atan2(punto(e2, EJE_Z), punto(e2, F));
    const a3 = Math.atan2(punto(e3, EJE_Z), punto(e3, F));
    p[19] = cmc;
    p[20] = abd;
    p[21] = envolver(a2 - cmc);
    p[22] = 0;
    p[23] = envolver(a3 - a2);
  }
  return p;
}

/**
 * Ajusta la pose de la mano a la observación (Levenberg–Marquardt, máximo 6 iteraciones, jacobiano numérico).
 * Arranca de la pose anterior; sin ella, de los ángulos leídos de la observación. Los límites se aplican en cada
 * iteración. Devuelve null si faltan la muñeca o los puntos que definen la palma.
 */
export function ajustarMano(
  obs: ObservacionMano,
  anterior: ArrayLike<number> | null,
  tabla: TablaLimites = HAND_JOINT_LIMITS,
): ResultadoAjuste | null {
  const lim = limitesParametros(tabla);
  const espejo = obs.lado === 'Right' ? -1 : 1;
  const P = obs.puntos;
  const base = P[0];
  if (!finito(base) || !finito(P[5]) || !finito(P[9]) || !finito(P[17])) return null;

  // Trabajamos siempre en la mano izquierda: las derechas se reflejan en x y la salida se vuelve a reflejar.
  const q: Vec3[] = P.map((p) =>
    finito(p) ? { x: espejo * (p.x - base.x), y: p.y - base.y, z: p.z - base.z } : { x: 0, y: 0, z: 0 },
  );
  const w = P.map((p, i) => (finito(p) ? Math.min(1, Math.max(0, obs.confianza[i] ?? 0)) : 0));

  const relajada = poseRelajada();
  let p: Float64Array;
  if (anterior) {
    p = Float64Array.from(anterior);
  } else {
    const marco = columnasDeMarco(q);
    if (!marco) return null;
    p = poseDesdeObservacion(q, marco);
  }
  proyectarALimites(p, lim);

  const datos: Datos = { q, w, ancla: anterior ? Float64Array.from(anterior) : null, relajada, tabla };
  const n = NUM_PARAMETROS;
  const r = new Float64Array(FILAS);
  const rp = new Float64Array(FILAS);
  const J = new Float64Array(FILAS * n);
  const pp = new Float64Array(n);
  const pn = new Float64Array(n);

  residuos(p, datos, r);
  let coste = sumaCuadrados(r);
  let mu = 1e-3;

  for (let it = 0; it < ITERACIONES_MAX; it++) {
    // Jacobiano numérico (diferencias finitas hacia delante).
    for (let j = 0; j < n; j++) {
      pp.set(p);
      pp[j] += PASO_DERIVADA;
      residuos(pp, datos, rp);
      for (let k = 0; k < FILAS; k++) J[k * n + j] = (rp[k] - r[k]) / PASO_DERIVADA;
    }
    const A: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    const g = new Array(n).fill(0);
    for (let k = 0; k < FILAS; k++) {
      for (let a = 0; a < n; a++) {
        const ja = J[k * n + a];
        g[a] += ja * r[k];
        for (let b = 0; b < n; b++) A[a][b] += ja * J[k * n + b];
      }
    }

    let aceptado = false;
    for (let intento = 0; intento < 4 && !aceptado; intento++) {
      const M = A.map((fila, a) => fila.map((v, b) => (a === b ? v + mu * (v + 1e-9) : v)));
      const delta = resolver(M, g.map((v) => -v));
      for (let j = 0; j < n; j++) pn[j] = p[j] + delta[j];
      proyectarALimites(pn, lim);
      residuos(pn, datos, rp);
      const cn = sumaCuadrados(rp);
      if (cn < coste) {
        p.set(pn);
        r.set(rp);
        coste = cn;
        mu = Math.max(mu / 3, 1e-7);
        aceptado = true;
      } else {
        mu *= 4;
      }
    }
    if (!aceptado) break;
  }

  if (anterior) limitarPaso(p, Float64Array.from(anterior), lim);

  const puntos = posicionesModelo(p, tabla).map((v) => ({ x: espejo * v.x, y: v.y, z: v.z }));
  return { parametros: p, residuo: sumaCuadrados(r, FILAS_PUNTOS), puntos };
}
