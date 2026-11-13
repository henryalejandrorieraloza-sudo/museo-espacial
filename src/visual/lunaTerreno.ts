import * as THREE from 'three';
import { CAPA_LEJOS } from './cielo';
import { SUELO_LUNA, azar, geometriaRoca } from './paleta';
import { crearMaterialRoca, crearMaterialSuelo } from './regolito';
import {
  ESTACION1_CRATER,
  LLEGADA,
  LRV_ESTACIONADO,
  MACIZOS,
  RADIO_LUNA_M,
  ROCA_ESTACION1,
  STENO,
  type Macizo,
  type PuntoSuelo,
} from './sitioApollo17';

// Suelo de Taurus-Littrow: disco con la curvatura de la Luna, lomas, cráteres de todos los tamaños, rocas y macizos.
//
// Horizonte: a 1.6 m de altura, el horizonte de una esfera de 1737.4 km está a √(2·R·h) ≈ 2.36 km, con una caída
// de solo 0.08°. El disco llega un poco más allá; lo que asoma por encima son crestas, bordes de cráter y macizos.
//
// Tres escalas de detalle, para parecerse a las fotos de superficie de Apollo 17:
// - Malla (este archivo): lomas de decenas de metros y cráteres de 2.5 m hacia arriba (los menores no caben en la
//   malla y saldrían como manchas borrosas). Vértices cada 0.3 m junto al LM y cada ~1 m a 70 m, con normales suaves
//   (el suelo real no tiene facetas; las rocas sí).
// - Rocas (este archivo): decenas de miles de piedras con una distribución de tamaños en ley de potencia, muchas
//   pequeñas y pocos bloques, más bloques en el borde de los cráteres frescos. Medio enterradas.
// - Shader (regolito.ts): hoyitos, terrones y motas de centímetros a un metro, solo en la normal y el color.
//
// Más allá del suelo, un solo relieve lejano facetado (low poly) rodea el valle: colinas bajas por todo el horizonte
// y, encima, los macizos con cumbres, collados y barrancos. Las crestas son estilizadas (ruido, no topografía real;
// los macizos reales de Taurus-Littrow son más redondeados); sus alturas de sitioApollo17.ts son el máximo.
//
// Steno y el cráter de la estación 1 están en sitioApollo17.ts. El resto de cráteres y rocas son genéricos
// (distribución aleatoria con semilla): dan el aspecto del valle, pero no copian su topografía real. Para la
// topografía real habría que usar el modelo de elevación NAC de LROC del sitio de Apollo 17.

/** Radio del disco de terreno (m): un poco más allá del horizonte. */
export const RADIO_TERRENO_M = 3200;
/** Separación de los vértices del suelo: ESPACIADO_MIN_M cerca del LM y una fracción de la distancia más lejos. */
const ESPACIADO_MIN_M = 0.3;
const ESPACIADO_RELATIVO = 0.015;
/** Más allá de esta distancia la malla se aclara a la mitad: allí solo se ven lomas y cráteres grandes. */
const RADIO_MALLA_FINA_M = 400;
const ESPACIADO_RELATIVO_LEJOS = 0.03;
/** Sectores del primer anillo; se duplican (o se reducen a la mitad) para mantener celdas casi cuadradas. */
const SECTORES_BASE = 24;

interface Crater {
  x: number;
  z: number;
  radio: number;
  /** Profundidad del fondo bajo el terreno de alrededor (m). */
  profundidad: number;
  /** Altura del borde (m). */
  borde: number;
  /** 0 = muy degradado, 1 = fresco (borde más claro y con bloques). */
  frescura: number;
}

/** Zonas sin cráteres grandes ni rocas: el LM, el LRV, la llegada y el camino hasta la roca. */
function enZonaLibre(x: number, z: number, margen: number): boolean {
  const cerca = (p: PuntoSuelo, r: number): boolean => Math.hypot(x - p.x, z - p.z) < r + margen;
  if (cerca({ x: 0, z: 0 }, 8) || cerca(LRV_ESTACIONADO, 3) || cerca(LLEGADA, 3)) return true;
  // Camino recto del LRV a la roca de la estación 1.
  const ax = LRV_ESTACIONADO.x;
  const az = LRV_ESTACIONADO.z;
  const bx = ROCA_ESTACION1.x;
  const bz = ROCA_ESTACION1.z;
  const t = THREE.MathUtils.clamp(((x - ax) * (bx - ax) + (z - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2), 0, 1);
  return Math.hypot(x - (ax + t * (bx - ax)), z - (az + t * (bz - az))) < 2.5 + margen;
}

/**
 * Cráteres genéricos: muchos pequeños y pocos grandes (ley de potencia), más densos cerca del LM. En el fondo del
 * valle los cráteres de pocos metros están casi saturados: se solapan y la mayoría están muy degradados.
 */
function generarCrateres(): Crater[] {
  const rnd = azar(17);
  const lista: Crater[] = [];
  const anadir = (x: number, z: number, diametro: number, frescura: number): void => {
    const profundidad = diametro * THREE.MathUtils.lerp(0.05, 0.18, frescura);
    const borde = diametro * THREE.MathUtils.lerp(0.01, 0.035, frescura);
    lista.push({ x, z, radio: diametro / 2, profundidad, borde, frescura });
  };
  const zonas = [
    { cantidad: 900, radioMin: 0, radioMax: 160, dMin: 2.5, dMax: 14 },
    { cantidad: 500, radioMin: 60, radioMax: 600, dMin: 5, dMax: 45 },
    { cantidad: 260, radioMin: 300, radioMax: 1500, dMin: 15, dMax: 120 },
    { cantidad: 180, radioMin: 900, radioMax: RADIO_TERRENO_M, dMin: 30, dMax: 260 },
  ];
  for (const zona of zonas) {
    let colocados = 0;
    for (let intento = 0; colocados < zona.cantidad && intento < zona.cantidad * 6; intento++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(THREE.MathUtils.lerp(zona.radioMin ** 2, zona.radioMax ** 2, rnd()));
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const diametro = zona.dMin + Math.pow(rnd(), 3.2) * (zona.dMax - zona.dMin);
      if (enZonaLibre(x, z, diametro * 0.75)) continue;
      // Ni encima del cráter de la estación 1 ni de Steno.
      if (Math.hypot(x - ESTACION1_CRATER.x, z - ESTACION1_CRATER.z) < ESTACION1_CRATER.diametro + diametro) continue;
      if (Math.hypot(x - STENO.x, z - STENO.z) < STENO.diametro * 0.7 + diametro) continue;
      anadir(x, z, diametro, Math.pow(rnd(), 2));
      colocados++;
    }
  }
  // Cráter compacto de la estación 1 (fresco, ~20 m y 3.5 m de fondo) y Steno.
  lista.push({ ...ESTACION1_CRATER, radio: ESTACION1_CRATER.diametro / 2, borde: 0.7, frescura: 1 });
  lista.push({ ...STENO, radio: STENO.diametro / 2, borde: STENO.diametro * 0.03, frescura: 0.5 });
  return lista;
}

const CRATERES = generarCrateres();

/** Rejilla de cráteres: cada celda guarda los cráteres cuyo manto de eyecta (3 radios) la toca. */
const CELDA_CRATERES_M = 32;
const LADO_REJILLA = Math.ceil((2 * RADIO_TERRENO_M) / CELDA_CRATERES_M) + 1;
const REJILLA_CRATERES = new Map<number, Crater[]>();
const celdaDe = (v: number): number =>
  THREE.MathUtils.clamp(Math.floor((v + RADIO_TERRENO_M) / CELDA_CRATERES_M), 0, LADO_REJILLA - 1);
for (const c of CRATERES) {
  const alcance = c.radio * 3;
  for (let i = celdaDe(c.x - alcance); i <= celdaDe(c.x + alcance); i++) {
    for (let k = celdaDe(c.z - alcance); k <= celdaDe(c.z + alcance); k++) {
      const clave = i * LADO_REJILLA + k;
      const lista = REJILLA_CRATERES.get(clave);
      if (lista) lista.push(c);
      else REJILLA_CRATERES.set(clave, [c]);
    }
  }
}
const SIN_CRATERES: Crater[] = [];
const crateresCerca = (x: number, z: number): Crater[] =>
  REJILLA_CRATERES.get(celdaDe(x) * LADO_REJILLA + celdaDe(z)) ?? SIN_CRATERES;

/**
 * Perfil de un cráter simple: cuenco, borde elevado y manto de eyecta que se desvanece a 3 radios. Los frescos tienen
 * el borde marcado; los degradados (la mayoría) lo tienen redondeado, sin arista, como en las fotos.
 */
function perfilCrater(c: Crater, distancia: number): number {
  const q = distancia / c.radio;
  if (q >= 3) return 0;
  const nitidez = c.frescura * c.frescura;
  if (q < 1) {
    const q2 = q * q;
    const marcado = -c.profundidad * (1 - q2) + c.borde * q2 * q2;
    const suave = -c.profundidad * (1 - q2) * (1 - q2) + c.borde * q2 * q2 * (3 - 2 * q2);
    return THREE.MathUtils.lerp(suave, marcado, nitidez);
  }
  const f = (3 - q) / 2;
  return c.borde * THREE.MathUtils.lerp(f * f * (3 - 2 * f), f * f, nitidez);
}

/** Ruido de valor 2D con semilla, suave (0–1). */
function hash2(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function ruido2(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

/**
 * Ondulación del fondo del valle: lomas amplias y, encima, bultos de decenas y pocos metros (el suelo de las fotos
 * nunca es liso). Los bultos pequeños se apagan junto al LM, donde se apoyan sus patas.
 */
function ondulacion(x: number, z: number): number {
  const lomas = (ruido2(x / 700, z / 700) - 0.5) * 14 + (ruido2(x / 140 + 7, z / 140 + 3) - 0.5) * 2.6;
  const bultos =
    (ruido2(x / 30 + 13, z / 30 + 5) - 0.5) * 1.1 +
    (ruido2(x / 9 + 2, z / 9 + 9) - 0.5) * 0.4 +
    (ruido2(x / 3.1 + 31, z / 3.1 + 17) - 0.5) * 0.12;
  return lomas + bultos * THREE.MathUtils.smoothstep(Math.hypot(x, z), 5, 12);
}

/** Caída por la curvatura de la Luna a `r` metros del LM (m). */
function caidaCurvatura(r2: number): number {
  return r2 / (2 * RADIO_LUNA_M);
}

const ONDULACION_ORIGEN = ondulacion(0, 0);

/**
 * Altura del suelo (m) en (x, z), con la curvatura incluida. La usan la malla, las rocas, la cámara del jugador y
 * las ruedas del LRV. El LM está en el origen, a altura ~0.
 */
export function alturaLuna(x: number, z: number): number {
  let h = ondulacion(x, z) - ONDULACION_ORIGEN;
  for (const c of crateresCerca(x, z)) {
    const dx = x - c.x;
    const dz = z - c.z;
    const alcance = c.radio * 3;
    if (Math.abs(dx) > alcance || Math.abs(dz) > alcance) continue;
    const d = Math.hypot(dx, dz);
    if (d < alcance) h += perfilCrater(c, d);
  }
  return h - caidaCurvatura(x * x + z * z);
}

/** Cuánto material fresco hay en (x, z): borde y eyecta cercana de cráteres jóvenes (0–1). */
function frescuraEn(x: number, z: number): number {
  let f = 0;
  for (const c of crateresCerca(x, z)) {
    if (c.frescura < 0.5) continue;
    const dx = x - c.x;
    const dz = z - c.z;
    if (Math.abs(dx) > c.radio * 1.8 || Math.abs(dz) > c.radio * 1.8) continue;
    const d = Math.hypot(dx, dz) / c.radio;
    if (d > 0.7 && d < 1.8) f = Math.max(f, c.frescura * (1 - Math.abs(d - 1.15) / 0.65));
  }
  return f;
}

/** Separación de vértices deseada a `r` metros del LM. */
function espaciado(r: number): number {
  return r < RADIO_MALLA_FINA_M ? Math.max(ESPACIADO_MIN_M, r * ESPACIADO_RELATIVO) : r * ESPACIADO_RELATIVO_LEJOS;
}

const _base = new THREE.Color();
const _otro = new THREE.Color();

/** Color del suelo en (x, z): gris con manchas suaves de manto oscuro, más claro en el material fresco. */
function colorSuelo(x: number, z: number, destino: THREE.Color): THREE.Color {
  const mancha = ruido2(x / 55 + 40, z / 55 - 12);
  const manto = THREE.MathUtils.smoothstep(ruido2(x / 160 - 9, z / 160 + 21), 0.5, 0.75);
  destino.setHex(SUELO_LUNA.gris).lerp(_otro.setHex(SUELO_LUNA.grisClaro), THREE.MathUtils.smoothstep(mancha, 0.3, 0.8));
  destino.lerp(_base.setHex(SUELO_LUNA.mantoOscuro), manto * 0.8);
  return destino.lerp(_otro.setHex(SUELO_LUNA.fresco), THREE.MathUtils.smoothstep(frescuraEn(x, z), 0.2, 0.8));
}

/**
 * Disco polar con normales suaves. Los anillos se separan según `espaciado`; cuando el arco de un sector se hace
 * demasiado largo (o corto), el anillo siguiente duplica (o divide a la mitad) los sectores y se cose con triángulos
 * de transición, así las celdas quedan casi cuadradas a cualquier distancia.
 */
function geometriaTerreno(): THREE.BufferGeometry {
  const radios: number[] = [];
  const sectores: number[] = [];
  for (let r = ESPACIADO_MIN_M; ; r += espaciado(r)) {
    const radio = Math.min(r, RADIO_TERRENO_M);
    let n = SECTORES_BASE;
    while ((2 * Math.PI * radio) / n > espaciado(radio) * 1.25) n *= 2;
    const previo = sectores[sectores.length - 1] ?? n;
    radios.push(radio);
    sectores.push(THREE.MathUtils.clamp(n, previo / 2, previo * 2));
    if (radio >= RADIO_TERRENO_M) break;
  }

  const total = 1 + sectores.reduce((a, b) => a + b, 0);
  const posiciones = new Float32Array(total * 3);
  const normales = new Float32Array(total * 3);
  const colores = new Float32Array(total * 3);
  const color = new THREE.Color();
  const normal = new THREE.Vector3();
  const inicio: number[] = [];
  let i = 0;
  const vertice = (x: number, z: number, paso: number): void => {
    posiciones.set([x, alturaLuna(x, z), z], i * 3);
    // Normal por diferencias centrales a media celda: suaviza el detalle que la malla no puede representar.
    const e = Math.max(0.12, paso * 0.5);
    normal.set(alturaLuna(x - e, z) - alturaLuna(x + e, z), 2 * e, alturaLuna(x, z - e) - alturaLuna(x, z + e)).normalize();
    normales.set([normal.x, normal.y, normal.z], i * 3);
    colorSuelo(x, z, color);
    colores.set([color.r, color.g, color.b], i * 3);
    i++;
  };
  vertice(0, 0, ESPACIADO_MIN_M);
  for (const [k, r] of radios.entries()) {
    inicio.push(i);
    for (let s = 0; s < sectores[k]; s++) {
      const a = (s / sectores[k]) * Math.PI * 2;
      vertice(Math.cos(a) * r, Math.sin(a) * r, espaciado(r));
    }
  }

  const indices: number[] = [];
  const v = (k: number, s: number): number => inicio[k] + (((s % sectores[k]) + sectores[k]) % sectores[k]);
  for (let s = 0; s < sectores[0]; s++) indices.push(0, v(0, s + 1), v(0, s));
  for (let k = 0; k < radios.length - 1; k++) {
    const n = sectores[k];
    const m = sectores[k + 1];
    if (m === n) {
      for (let s = 0; s < n; s++) indices.push(v(k, s), v(k, s + 1), v(k + 1, s), v(k, s + 1), v(k + 1, s + 1), v(k + 1, s));
    } else if (m === n * 2) {
      for (let s = 0; s < n; s++) {
        const [a, b] = [v(k, s), v(k, s + 1)];
        const [c, d, e] = [v(k + 1, 2 * s), v(k + 1, 2 * s + 1), v(k + 1, 2 * s + 2)];
        indices.push(a, b, d, a, d, c, b, e, d);
      }
    } else {
      for (let t = 0; t < m; t++) {
        const [a, b, c] = [v(k, 2 * t), v(k, 2 * t + 1), v(k, 2 * t + 2)];
        const [d, e] = [v(k + 1, t), v(k + 1, t + 1)];
        indices.push(a, b, d, b, c, e, b, e, d);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(posiciones, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normales, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colores, 3));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

interface Roca {
  x: number;
  z: number;
  /** Tamaño (m), aproximadamente el diámetro mayor. */
  tam: number;
}

/** Tamaño entre `min` y `max` con distribución acumulada ∝ tamaño^−exponente (ley de potencia truncada). */
function tamanoPotencia(u: number, min: number, max: number, exponente: number): number {
  return min * Math.pow(1 - u * (1 - Math.pow(min / max, exponente)), -1 / exponente);
}

/**
 * Poblaciones de rocas genéricas (sin catalogar). En las fotos del fondo del valle hay piedrecitas por todas partes,
 * piedras de un palmo cada pocos metros y bloques sueltos; los bloques se concentran alrededor de los cráteres
 * frescos, que excavaron la roca bajo el regolito.
 */
const POBLACIONES_ROCA = [
  { cantidad: 14000, radioMax: 30, min: 0.03, max: 0.1, exponente: 2, sombra: false },
  { cantidad: 12000, radioMax: 75, min: 0.03, max: 0.1, exponente: 2, sombra: false },
  { cantidad: 26000, radioMax: 130, min: 0.08, max: 0.45, exponente: 2.1, sombra: true },
  { cantidad: 6000, radioMax: 120, min: 0.2, max: 0.9, exponente: 2, sombra: true },
  { cantidad: 6000, radioMax: 300, min: 0.1, max: 0.6, exponente: 2.2, sombra: true },
  { cantidad: 1500, radioMax: 700, min: 0.35, max: 1.6, exponente: 2.2, sombra: true },
  { cantidad: 60, radioMax: 300, min: 1, max: 2.5, exponente: 2, sombra: true },
  { cantidad: 120, radioMax: 2000, min: 1.2, max: 3.5, exponente: 2, sombra: true },
] as const;
/**
 * Campos de bloques: grupos de piedras angulosas de unos metros, restos de un impacto que rompió roca. En las fotos
 * las rocas no están repartidas de forma uniforme; hay zonas peladas y zonas sembradas.
 */
const CAMPOS_BLOQUES = { cantidad: 140, radioMax: 260, radioCampoMin: 2, radioCampoMax: 7, rocasMin: 15, rocasMax: 55 } as const;
/** Formas según el tamaño: octaedros deformados (8 caras), icosaedros angulosos (20) e icosaedros subdivididos (80). */
const TAM_PIEDRA_M = 0.12;
const TAM_BLOQUE_M = 1.2;
const VARIANTES_POR_FORMA = 8;

function generarRocas(): { conSombra: Roca[]; sinSombra: Roca[] } {
  const rnd = azar(72);
  const conSombra: Roca[] = [];
  const sinSombra: Roca[] = [];
  for (const p of POBLACIONES_ROCA) {
    for (let i = 0; i < p.cantidad; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * p.radioMax;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const tam = tamanoPotencia(rnd(), p.min, p.max, p.exponente);
      if (enZonaLibre(x, z, tam > 0.15 ? 1 : -1.5)) continue;
      (p.sombra ? conSombra : sinSombra).push({ x, z, tam });
    }
  }
  const campos = CAMPOS_BLOQUES;
  for (let i = 0; i < campos.cantidad; i++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * campos.radioMax;
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;
    const radioCampo = THREE.MathUtils.lerp(campos.radioCampoMin, campos.radioCampoMax, rnd());
    if (enZonaLibre(cx, cz, radioCampo)) continue;
    const cantidad = Math.round(THREE.MathUtils.lerp(campos.rocasMin, campos.rocasMax, rnd()));
    for (let k = 0; k < cantidad; k++) {
      // Más densas en el centro del campo.
      const b = rnd() * Math.PI * 2;
      const d = Math.pow(rnd(), 1.5) * radioCampo;
      conSombra.push({ x: cx + Math.cos(b) * d, z: cz + Math.sin(b) * d, tam: tamanoPotencia(rnd(), 0.08, 0.8, 1.8) });
    }
  }
  // Bloques de eyecta en el borde de los cráteres frescos, más cerca del borde que lejos.
  for (const c of CRATERES) {
    if (c.frescura < 0.55 || c.radio < 1.5 || Math.hypot(c.x, c.z) > 900) continue;
    const cantidad = Math.round(c.radio * 3 * c.frescura);
    for (let i = 0; i < cantidad; i++) {
      const a = rnd() * Math.PI * 2;
      const r = c.radio * (0.8 + Math.pow(rnd(), 2) * 1.4);
      const x = c.x + Math.cos(a) * r;
      const z = c.z + Math.sin(a) * r;
      const tam = tamanoPotencia(rnd(), 0.08, Math.min(2.5, c.radio * 0.12), 2.2);
      if (enZonaLibre(x, z, 1) || Math.hypot(x - ROCA_ESTACION1.x, z - ROCA_ESTACION1.z) < 2.5) continue;
      conSombra.push({ x, z, tam });
    }
  }
  return { conSombra, sinSombra };
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

/** Rocas como mallas instanciadas (una por forma), con color, tamaño, giro y enterramiento propios. */
function crearRocas(material: THREE.Material): THREE.Group {
  const grupo = new THREE.Group();
  grupo.name = 'rocas_luna';
  const rnd = azar(91);
  const { conSombra, sinSombra } = generarRocas();
  const tonos = [SUELO_LUNA.basalto, SUELO_LUNA.brecha, SUELO_LUNA.brecha, SUELO_LUNA.rocaClara];
  const instanciar = (rocas: Roca[], sombra: boolean): void => {
    const porVariante = new Map<number, Roca[]>();
    for (const roca of rocas) {
      const forma = roca.tam < TAM_PIEDRA_M ? 0 : roca.tam < TAM_BLOQUE_M ? 1 : 2;
      const variante = forma * VARIANTES_POR_FORMA + Math.floor(rnd() * VARIANTES_POR_FORMA);
      const lista = porVariante.get(variante);
      if (lista) lista.push(roca);
      else porVariante.set(variante, [roca]);
    }
    for (const [variante, lista] of porVariante) {
      const forma = Math.floor(variante / VARIANTES_POR_FORMA);
      const grande = forma === 2;
      const geometria = geometriaRoca(200 + variante, forma === 2 ? 1 : 0, forma === 0 ? 'octaedro' : 'icosaedro');
      const malla = new THREE.InstancedMesh(geometria, material, lista.length);
      for (const [i, roca] of lista.entries()) {
        const radio = roca.tam / 2;
        // Achatadas (las piedras sueltas descansan sobre su cara más ancha) y medio enterradas.
        _s.set(radio * (0.75 + rnd() * 0.5), radio * (0.4 + rnd() * 0.4), radio * (0.75 + rnd() * 0.5));
        const inclinacion = grande ? 0.25 : 1.2;
        _q.setFromEuler(_e.set((rnd() - 0.5) * inclinacion, rnd() * Math.PI * 2, (rnd() - 0.5) * inclinacion));
        _p.set(roca.x, alturaLuna(roca.x, roca.z) + _s.y * (0.35 - rnd() * 0.55), roca.z);
        malla.setMatrixAt(i, _m.compose(_p, _q, _s));
        malla.setColorAt(i, _c.setHex(tonos[Math.floor(rnd() * tonos.length)]).multiplyScalar(0.85 + rnd() * 0.3));
      }
      malla.castShadow = sombra;
      malla.receiveShadow = true;
      malla.computeBoundingSphere();
      grupo.add(malla);
    }
  };
  instanciar(conSombra, true);
  instanciar(sinSombra, false);

  // Bloques en el borde del cráter de la estación 1 (allí había bloques de ~0.6 m; ALSJ).
  const bloques: Roca[] = [];
  for (let i = 0; i < 14; i++) {
    const a = rnd() * Math.PI * 2;
    const r = ESTACION1_CRATER.diametro / 2 + 0.5 + rnd() * 4;
    const x = ESTACION1_CRATER.x + Math.cos(a) * r;
    const z = ESTACION1_CRATER.z + Math.sin(a) * r;
    if (Math.hypot(x - ROCA_ESTACION1.x, z - ROCA_ESTACION1.z) < 2.5) continue;
    bloques.push({ x, z, tam: 0.5 + rnd() * 1.4 });
  }
  instanciar(bloques, true);
  return grupo;
}

/** Suelo, cráteres y rocas (capa cercana). Reciben y proyectan sombras (salvo las piedrecitas). */
export function crearSuelo(): THREE.Group {
  const grupo = new THREE.Group();
  grupo.name = 'suelo_luna';
  const suelo = new THREE.Mesh(geometriaTerreno(), crearMaterialSuelo());
  suelo.name = 'terreno_luna';
  suelo.castShadow = true;
  suelo.receiveShadow = true;
  grupo.add(suelo, crearRocas(crearMaterialRoca()));
  return grupo;
}

/** Radio (m) de la depresión que deja la muestra recogida: un poco más que la mancha naranja (2.1 m). */
export const RADIO_HUNDIMIENTO_M = 3.2;
/** Profundidad (m) en el centro de la depresión. Estimación de partida, a ojo. */
export const PROFUNDIDAD_HUNDIMIENTO_M = 0.3;

/**
 * Desnivel (0–1) de la depresión a (dx, dz) del centro: 1 en el centro y 0 en el borde, con pendiente nula en el borde
 * (C¹), así que el hundimiento no tiene escalón. Fuera del radio vale 0.
 */
export function desnivelHundimiento(dx: number, dz: number): number {
  const u2 = (dx * dx + dz * dz) / (RADIO_HUNDIMIENTO_M * RADIO_HUNDIMIENTO_M);
  return u2 < 1 ? (1 - u2) * (1 - u2) : 0;
}

/**
 * Prepara el hundimiento del suelo alrededor de (cx, cz) en la malla del terreno. Devuelve una función que, con
 * `progreso` (0 = suelo intacto, 1 = hundido del todo), mueve solo los vértices dentro del radio y ajusta sus normales
 * para que el sombreado siga la cuenca. Los vértices y sus normales base se guardan al preparar.
 */
export function crearHundimientoSuelo(malla: THREE.Mesh, cx: number, cz: number): (progreso: number) => void {
  const geo = malla.geometry;
  const posicion = geo.getAttribute('position') as THREE.BufferAttribute;
  const normal = geo.getAttribute('normal') as THREE.BufferAttribute;
  const dentro: number[] = [];
  for (let i = 0; i < posicion.count; i++) {
    if (Math.hypot(posicion.getX(i) - cx, posicion.getZ(i) - cz) < RADIO_HUNDIMIENTO_M) dentro.push(i);
  }
  const alturaBase = dentro.map((i) => posicion.getY(i));
  const normalBase = dentro.map((i) => [normal.getX(i), normal.getY(i), normal.getZ(i)]);
  let ultimo = -1;
  const R2 = RADIO_HUNDIMIENTO_M * RADIO_HUNDIMIENTO_M;

  return (progreso: number): void => {
    const p = THREE.MathUtils.clamp(progreso, 0, 1);
    if (p === ultimo) return;
    ultimo = p;
    // Caída suave: smoothstep en el tiempo para que empiece y acabe sin tirón.
    const f = p * p * (3 - 2 * p);
    dentro.forEach((i, k) => {
      const dx = posicion.getX(i) - cx;
      const dz = posicion.getZ(i) - cz;
      const u2 = (dx * dx + dz * dz) / R2;
      const w = u2 < 1 ? (1 - u2) * (1 - u2) : 0;
      posicion.setY(i, alturaBase[k] - PROFUNDIDAD_HUNDIMIENTO_M * f * w);
      // Pendiente del desnivel: ∂Δy/∂x = 4·D·f·dx·(1−u²)/R². La normal base se corrige restándole esa pendiente.
      const pendienteX = (4 * PROFUNDIDAD_HUNDIMIENTO_M * f * dx * (u2 < 1 ? 1 - u2 : 0)) / R2;
      const pendienteZ = (4 * PROFUNDIDAD_HUNDIMIENTO_M * f * dz * (u2 < 1 ? 1 - u2 : 0)) / R2;
      const [nx, ny, nz] = normalBase[k];
      const longitud = Math.hypot(nx - pendienteX, ny, nz - pendienteZ);
      normal.setXYZ(i, (nx - pendienteX) / longitud, ny / longitud, (nz - pendienteZ) / longitud);
    });
    posicion.needsUpdate = true;
    normal.needsUpdate = true;
  };
}

/** Ruido con crestas (0–1): líneas afiladas donde el ruido de valor cruza 0.5. Da espolones y aristas. */
function crestas(x: number, z: number): number {
  return 1 - Math.abs(2 * ruido2(x, z) - 1);
}

/** Relieve lejano: anillo polar alrededor del LM, de RADIO_RELIEVE_MIN_M a RADIO_RELIEVE_MAX_M. */
const RADIO_RELIEVE_MIN_M = 2300;
const RADIO_RELIEVE_MAX_M = 14000;
/** Paso en azimut (°) y crecimiento de los anillos: caras de ~65–130 m a 5 km, bien visibles (low poly). */
const PASO_AZIMUT_RELIEVE = 0.75;
const CRECIMIENTO_RELIEVE = 1.025;
/** Colinas bajas por todo el horizonte (m): unen el suelo con los macizos. VERIFICAR: alturas reales del valle. */
const ALTURA_COLINAS_M = 140;

/** Crestas en coordenadas del mundo (0–1): picos, collados y aristas en todas direcciones, en tres escalas. */
function crestasMundo(x: number, z: number, k: number): number {
  const a = crestas(x / 2400 + k, z / 2400 - k);
  const b = crestas(x / 950 - k, z / 950 + k * 2);
  const c = crestas(x / 380 + k * 3, z / 380 + k);
  return 0.55 * a * a + 0.33 * b * b + 0.12 * c * c;
}

/**
 * Altura de un macizo (m sobre el valle). La forma general sale de un perfil radial (falda delante del pie, ladera
 * y cima) y de una envolvente en azimut; el frente avanza y retrocede en contrafuertes. Encima, crestas en
 * coordenadas del mundo dan cumbres, collados, aristas y barrancos. La altura de `Macizo` es el máximo.
 */
function alturaMacizo(m: Macizo, azimut: number, r: number, x: number, z: number): number {
  const ancho = m.azimutHasta - m.azimutDesde;
  let d = (azimut - m.azimutDesde) % 360;
  if (d < 0) d += 360;
  if (d > 180 + ancho / 2) d -= 360;
  const t = d / ancho;
  const envolvente = THREE.MathUtils.smoothstep(t, -0.1, 0.22) * (1 - THREE.MathUtils.smoothstep(t, 0.78, 1.1));
  if (envolvente <= 0) return 0;
  const k = m.semilla * 7.3;
  const fondo = m.distanciaCima - m.distanciaPie;
  const contrafuerte = (ruido2(x / 2600 + k, z / 2600 - k) - 0.5) * 0.5 * fondo;
  const u = (r - m.distanciaPie - contrafuerte) / fondo;
  let perfil: number;
  if (u < -0.4) return 0;
  else if (u < 0) perfil = 0.07 * ((u + 0.4) / 0.4) ** 2;
  // Mitad recta y mitad curva S: la pendiente máxima es solo 1.25 veces la media (sin paredes).
  else if (u <= 1) perfil = 0.07 + 0.93 * (0.5 * u + 0.5 * u * u * (3 - 2 * u));
  else perfil = 1 - 0.45 * THREE.MathUtils.smoothstep(u, 1, 1.8);
  const forma = perfil * envolvente;
  const relieve = 0.5 + 0.55 * crestasMundo(x, z, k);
  return m.altura * Math.min(1, forma * relieve);
}

/** Colinas bajas y lomas (m) en todo el horizonte, que crecen poco a poco desde el borde del suelo. */
function alturaColinas(azimut: number, r: number): number {
  const s = THREE.MathUtils.degToRad(azimut) * 4000;
  const rampa = THREE.MathUtils.smoothstep(r, RADIO_RELIEVE_MIN_M, 4200);
  const lomas = Math.pow(crestas(s / 1100 + 5, r / 1000), 1.6) * 0.7 + ruido2(s / 400 + 9, r / 400) * 0.3;
  return ALTURA_COLINAS_M * rampa * lomas;
}

/** Altura total del relieve lejano (m sobre el valle): el macizo más alto en ese punto, sobre las colinas. */
function alturaRelieve(azimut: number, r: number, x: number, z: number): number {
  let h = 0;
  for (const m of MACIZOS) h = Math.max(h, alturaMacizo(m, azimut, r, x, z));
  return h + alturaColinas(azimut, r) * (1 - THREE.MathUtils.smoothstep(h, 0, 600) * 0.6);
}

/**
 * Relieve lejano como una sola malla: colinas, macizos y escarpe salen del mismo suelo, sin piezas sueltas detrás
 * del horizonte. Va en la pasada de lo lejano; el suelo cercano lo tapa hasta la línea del horizonte, así que solo
 * asoma lo que sube por encima. Facetado (sombreado plano), como el resto del juego.
 */
function geometriaRelieve(): THREE.BufferGeometry {
  const radios: number[] = [];
  for (let r = RADIO_RELIEVE_MIN_M; r < RADIO_RELIEVE_MAX_M; r *= CRECIMIENTO_RELIEVE) radios.push(r);
  radios.push(RADIO_RELIEVE_MAX_M);
  const pasos = Math.round(360 / PASO_AZIMUT_RELIEVE);
  const pos = new Float32Array(pasos * radios.length * 3);
  const colores = new Float32Array(pasos * radios.length * 3);
  const color = new THREE.Color();
  const valle = new THREE.Color(SUELO_LUNA.gris);
  const ladera = new THREE.Color(SUELO_LUNA.macizoSombra);
  const cima = new THREE.Color(SUELO_LUNA.macizo);
  let n = 0;
  for (let i = 0; i < pasos; i++) {
    const azimut = i * PASO_AZIMUT_RELIEVE;
    const a = THREE.MathUtils.degToRad(azimut);
    for (const r of radios) {
      const x = Math.sin(a) * r;
      const z = -Math.cos(a) * r;
      const h = alturaRelieve(azimut, r, x, z);
      // El borde interior se hunde bajo el horizonte para que no quede hueco entre el suelo y el relieve.
      const hundido = r === RADIO_RELIEVE_MIN_M ? 30 : 0;
      pos.set([x, h - caidaCurvatura(r * r) - hundido, z], n * 3);
      // Más claro cuanto más alto (tierras altas), con vetas que bajan por la ladera.
      const vetas = (ruido2(a * 900, r / 700) - 0.5) * 0.12;
      color.copy(valle).lerp(ladera, THREE.MathUtils.smoothstep(h, 20, 250)).lerp(cima, THREE.MathUtils.smoothstep(h, 400, 1600));
      color.multiplyScalar(1 + vetas);
      colores.set([color.r, color.g, color.b], n * 3);
      n++;
    }
  }
  const anillos = radios.length;
  const indices: number[] = [];
  const v = (i: number, k: number): number => (i % pasos) * anillos + k;
  for (let i = 0; i < pasos; i++) {
    for (let k = 0; k < anillos - 1; k++) {
      // Diagonal alterna: evita que todas las caras se alineen en rayas.
      if ((i + k) % 2 === 0) indices.push(v(i, k), v(i + 1, k), v(i, k + 1), v(i + 1, k), v(i + 1, k + 1), v(i, k + 1));
      else indices.push(v(i, k), v(i + 1, k + 1), v(i, k + 1), v(i, k), v(i + 1, k), v(i + 1, k + 1));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colores, 3));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

/** Colinas, macizos y escarpe más allá del horizonte (capa lejana, sin sombras). */
export function crearMacizos(): THREE.Group {
  const grupo = new THREE.Group();
  grupo.name = 'macizos_luna';
  const malla = new THREE.Mesh(geometriaRelieve(), crearMaterialSuelo(true));
  malla.name = 'relieve_lejano';
  malla.layers.set(CAPA_LEJOS);
  grupo.add(malla);
  return grupo;
}
