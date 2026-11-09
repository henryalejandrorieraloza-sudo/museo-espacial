import * as THREE from 'three';
import { CAPA_LEJOS } from './cielo';
import { Lote, SUELO_LUNA, azar, geometriaRoca } from './paleta';
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

// Suelo de Taurus-Littrow: disco facetado con la curvatura de la Luna, cráteres, rocas y macizos lejanos.
//
// Horizonte: a 1.6 m de altura, el horizonte de una esfera de 1737.4 km está a √(2·R·h) ≈ 2.36 km, con una caída
// de solo 0.08°. El disco llega un poco más allá; lo que asoma por encima son crestas, bordes de cráter y macizos.
//
// Relieve: Steno y el cráter de la estación 1 están en sitioApollo17.ts. El resto de cráteres y rocas son
// genéricos (distribución aleatoria con semilla): dan el aspecto del valle, pero no copian su topografía real.
// Para la topografía real habría que usar el modelo de elevación NAC de LROC del sitio de Apollo 17.

/** Radio del disco de terreno (m): un poco más allá del horizonte. */
export const RADIO_TERRENO_M = 3200;
/** Divisiones del disco: anillos con radio creciente (más finos cerca del LM) y sectores. */
const PRIMER_ANILLO_M = 0.6;
const CRECIMIENTO_ANILLO = 1.045;
const SECTORES = 160;

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

function generarCrateres(): Crater[] {
  const rnd = azar(17);
  const lista: Crater[] = [];
  const anadir = (x: number, z: number, diametro: number, frescura: number): void => {
    const profundidad = diametro * THREE.MathUtils.lerp(0.06, 0.18, frescura);
    const borde = diametro * THREE.MathUtils.lerp(0.012, 0.035, frescura);
    lista.push({ x, z, radio: diametro / 2, profundidad, borde, frescura });
  };
  // Genéricos: muchos pequeños y pocos grandes (ley de potencia), más densos cerca del LM.
  const zonas = [
    { cantidad: 260, radioMin: 0, radioMax: 260, dMin: 1.2, dMax: 22 },
    { cantidad: 260, radioMin: 120, radioMax: 1200, dMin: 8, dMax: 90 },
    { cantidad: 180, radioMin: 600, radioMax: RADIO_TERRENO_M, dMin: 30, dMax: 260 },
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

/** Perfil de un cráter simple: cuenco parabólico, borde elevado y manto de eyecta que se desvanece a 3 radios. */
function perfilCrater(c: Crater, distancia: number): number {
  const q = distancia / c.radio;
  if (q >= 3) return 0;
  if (q < 1) return -c.profundidad * (1 - q * q) + c.borde * q * q * q * q;
  const f = (3 - q) / 2;
  return c.borde * f * f;
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

/** Ondulación suave del fondo del valle: lomas amplias y bultos pequeños. */
function ondulacion(x: number, z: number): number {
  return (
    (ruido2(x / 700, z / 700) - 0.5) * 14 +
    (ruido2(x / 140 + 7, z / 140 + 3) - 0.5) * 2.6 +
    (ruido2(x / 28 + 13, z / 28 + 5) - 0.5) * 0.5 +
    (ruido2(x / 7 + 2, z / 7 + 9) - 0.5) * 0.12
  );
}

/** Caída por la curvatura de la Luna a `r` metros del LM (m). */
function caidaCurvatura(r2: number): number {
  return r2 / (2 * RADIO_LUNA_M);
}

/**
 * Altura del suelo (m) en (x, z), con la curvatura incluida. La usan la malla, las rocas, la cámara del jugador y
 * las ruedas del LRV. El LM está en el origen, a altura ~0.
 */
export function alturaLuna(x: number, z: number): number {
  let h = ondulacion(x, z) - ondulacion(0, 0);
  for (const c of CRATERES) {
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
  for (const c of CRATERES) {
    if (c.frescura < 0.5) continue;
    const dx = x - c.x;
    const dz = z - c.z;
    if (Math.abs(dx) > c.radio * 1.8 || Math.abs(dz) > c.radio * 1.8) continue;
    const d = Math.hypot(dx, dz) / c.radio;
    if (d > 0.7 && d < 1.8) f = Math.max(f, c.frescura * (1 - Math.abs(d - 1.15) / 0.65));
  }
  return f;
}

/** Disco polar: centro en el LM, anillos cada vez más anchos y anillos alternos girados medio sector. */
function geometriaTerreno(): THREE.BufferGeometry {
  const radios: number[] = [];
  for (let r = PRIMER_ANILLO_M; r < RADIO_TERRENO_M; r *= CRECIMIENTO_ANILLO) radios.push(r);
  radios.push(RADIO_TERRENO_M);
  const posiciones: number[] = [0, alturaLuna(0, 0), 0];
  for (const [i, r] of radios.entries()) {
    const desfase = (i % 2) * (Math.PI / SECTORES);
    for (let s = 0; s < SECTORES; s++) {
      const a = (s / SECTORES) * Math.PI * 2 + desfase;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      posiciones.push(x, alturaLuna(x, z), z);
    }
  }
  const indices: number[] = [];
  const v = (anillo: number, s: number): number => 1 + anillo * SECTORES + (((s % SECTORES) + SECTORES) % SECTORES);
  for (let s = 0; s < SECTORES; s++) indices.push(0, v(0, s + 1), v(0, s));
  for (let i = 0; i < radios.length - 1; i++) {
    // Con el desfase alterno, la diagonal de cada cuadrilátero cambia de lado en cada anillo.
    const par = i % 2 === 0;
    for (let s = 0; s < SECTORES; s++) {
      const a = v(i, s);
      const b = v(i, s + 1);
      const c = v(i + 1, s);
      const d = v(i + 1, s + 1);
      if (par) indices.push(a, b, c, b, d, c);
      else indices.push(a, b, d, a, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(posiciones, 3));
  geo.setIndex(indices);
  return geo;
}

/** Color de cada cara del suelo: gris cálido y ocre en manchas grandes, más claro en el material fresco. */
function colorSuelo(c: THREE.Vector3): number {
  const mancha = ruido2(c.x / 55 + 40, c.z / 55 - 12);
  const ocre = ruido2(c.x / 160 - 9, c.z / 160 + 21);
  const fresco = frescuraEn(c.x, c.z);
  if (fresco > 0.45) return fresco > 0.75 ? SUELO_LUNA.fresco : SUELO_LUNA.grisClaro;
  if (ocre > 0.62) return mancha > 0.5 ? SUELO_LUNA.ocre : SUELO_LUNA.ocreOscuro;
  if (mancha > 0.66) return SUELO_LUNA.grisClaro;
  return mancha > 0.33 ? SUELO_LUNA.grisCalido : SUELO_LUNA.gris;
}

/** Rocas sueltas alrededor del LM y bloques cerca del cráter de la estación 1. Facetadas, sin catalogar. */
function anadirRocas(l: Lote): void {
  const rnd = azar(72);
  const colocar = (x: number, z: number, tam: number, semilla: number): void => {
    const y = alturaLuna(x, z) + tam * 0.25;
    const color = rnd() > 0.35 ? SUELO_LUNA.basalto : SUELO_LUNA.brecha;
    l.pieza(geometriaRoca(semilla, 0), color, {
      p: [x, y, z],
      r: [rnd() * 6, rnd() * 6, rnd() * 6],
      e: [tam * (0.8 + rnd() * 0.5), tam * (0.45 + rnd() * 0.3), tam * (0.8 + rnd() * 0.4)],
      v: 0.22,
    });
  };
  // Piedras pequeñas (hasta 0.35 m) y algunos bloques (hasta 1.5 m), más densas cerca.
  for (const zona of [
    { cantidad: 520, radioMax: 90, tamMin: 0.05, tamMax: 0.35 },
    { cantidad: 140, radioMax: 400, tamMin: 0.2, tamMax: 1.5 },
  ]) {
    for (let i = 0; i < zona.cantidad; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * zona.radioMax;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const tam = zona.tamMin + Math.pow(rnd(), 2.5) * (zona.tamMax - zona.tamMin);
      if (enZonaLibre(x, z, tam > 0.2 ? 1 : -1.5)) continue;
      colocar(x, z, tam, 100 + (i % 9));
    }
  }
  // Bloques en el borde del cráter de la estación 1 (allí había bloques de ~0.6 m; ALSJ).
  for (let i = 0; i < 14; i++) {
    const a = rnd() * Math.PI * 2;
    const r = ESTACION1_CRATER.diametro / 2 + 0.5 + rnd() * 4;
    const x = ESTACION1_CRATER.x + Math.cos(a) * r;
    const z = ESTACION1_CRATER.z + Math.sin(a) * r;
    if (Math.hypot(x - ROCA_ESTACION1.x, z - ROCA_ESTACION1.z) < 2.5) continue;
    colocar(x, z, 0.25 + rnd() * 0.7, 120 + (i % 5));
  }
}

/** Suelo, cráteres y rocas (capa cercana). Recibe y proyecta sombras. */
export function crearSuelo(): THREE.Group {
  const l = new Lote(false, 'mate');
  l.pieza(geometriaTerreno(), colorSuelo, { v: 0.1 });
  anadirRocas(l);
  const grupo = l.construir();
  grupo.name = 'suelo_luna';
  grupo.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  return grupo;
}

/** Un macizo como rejilla polar entre su pie y su cima. Los que cruzan el norte terminan en más de 360°. */
function crearMacizo(l: Lote, m: Macizo): void {
  const rnd = azar(m.semilla);
  const pasosA = Math.max(8, Math.round((m.azimutHasta - m.azimutDesde) / 2.4));
  // Perfil radial: pie, ladera, cima ancha y ladera trasera. Los macizos de Taurus-Littrow tienen laderas largas y
  // redondeadas, no picos afilados.
  const radios = [m.distanciaPie, ...[0.3, 0.6, 0.85, 1].map((f) => m.distanciaPie + (m.distanciaCima - m.distanciaPie) * f), m.distanciaCima * 1.3];
  const perfil = [0, 0.3, 0.66, 0.9, 1, 0.6];
  // Cresta suave: dos ondulaciones con fase aleatoria y un temblor mínimo por vértice (más temblor hace un
  // damero de caras claras y oscuras cuando el Sol las roza).
  const fases = [rnd() * Math.PI * 2, rnd() * Math.PI * 2];
  const cresta = (t: number): number => 0.86 + 0.1 * Math.sin(t * Math.PI * 2.2 + fases[0]) + 0.05 * Math.sin(t * Math.PI * 5.3 + fases[1]);
  const alturas: number[][] = [];
  for (let i = 0; i <= pasosA; i++) {
    const t = i / pasosA;
    const envolvente = Math.pow(Math.sin(Math.PI * t), 0.7);
    alturas.push(perfil.map((p, k) => (k === 0 ? 0 : m.altura * p * envolvente * cresta(t) * (0.99 + rnd() * 0.02))));
  }
  const pos: number[] = [];
  const vertice = (i: number, k: number): [number, number, number] => {
    const a = THREE.MathUtils.degToRad(m.azimutDesde + ((m.azimutHasta - m.azimutDesde) * i) / pasosA);
    const r = radios[k];
    // El pie se hunde bajo la línea del horizonte para que el suelo cercano lo tape sin dejar huecos.
    const y = alturas[i][k] - caidaCurvatura(r * r) - (k === 0 ? 40 : 0);
    return [Math.sin(a) * r, y, -Math.cos(a) * r];
  };
  for (let i = 0; i < pasosA; i++) {
    for (let k = 0; k < radios.length - 1; k++) {
      const a = vertice(i, k);
      const b = vertice(i + 1, k);
      const c = vertice(i, k + 1);
      const d = vertice(i + 1, k + 1);
      pos.push(...a, ...b, ...c, ...b, ...d, ...c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const alto = m.altura;
  l.pieza(geo, (c) => (c.y > alto * 0.45 ? SUELO_LUNA.macizo : SUELO_LUNA.macizoSombra), { v: 0.12 });
}

/** Macizos, colinas y escarpe más allá del horizonte (capa lejana, sin sombras). */
export function crearMacizos(): THREE.Group {
  const l = new Lote(false, 'mate');
  for (const m of MACIZOS) crearMacizo(l, m);
  const grupo = l.construir();
  grupo.name = 'macizos_luna';
  grupo.traverse((o) => o.layers.set(CAPA_LEJOS));
  return grupo;
}
