import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Paleta, materiales y ayudas de geometría del museo.
// Todo lo estático se fusiona en un `Lote`: un solo color por vértice y una llamada de dibujo por tipo de material.

/** Arquitectura: aquí sí manda la estética (no representa ningún objeto real). */
export const ARQ = {
  fondoPared: 0x1c0d38,
  purpura: 0x5c2484,
  violeta: 0x8a38b0,
  lila: 0x9271dc,
  indigo: 0x341c6e,
  suelo: 0x2b1a5c,
  sueloClaro: 0x3b2878,
  sueloBase: 0x0e0720,
  cobre: 0xc46f3c,
  ladrillo: 0xa63f2c,
  ladrilloClaro: 0xcc5a3c,
  ambar: 0xffa63d,
  dorado: 0xf0b84c,
  cian: 0x3fe9ff,
  magenta: 0xd24bff,
  oscuro: 0x140a26,
} as const;

/** Objetos históricos: colores cercanos a los reales (SPEC §0). No se pintan con la paleta de la arquitectura. */
export const HIST = {
  /** Traje A7LB de Apollo: exterior blanco, visor dorado y franjas rojas del comandante. */
  traje: 0xe9e5d8,
  visor: 0xdcae3c,
  franjaRoja: 0xb3262b,
  conectorAzul: 0x2a5fb0,
  guante: 0x9aa6b8,
  suela: 0x6b7480,
  /** LRV: chasis de aluminio, ruedas de malla metálica con chevrones, cubiertas claras. */
  aluminio: 0xbdb8aa,
  malla: 0xa59773,
  chevron: 0xc7a05a,
  cubierta: 0xd7c48a,
  asiento: 0xcfc8b4,
  antena: 0xe6e2d6,
  /** Perseverance: cuerpo blanco, ruedas de aluminio, generador oscuro con aletas. */
  blancoRover: 0xe8e6dc,
  ruedaRover: 0xa8a8a0,
  generador: 0x2f2d2b,
  lente: 0x15161a,
  /** Saturn V: blanco con negro. Atlas V: etapa central naranja salmón y cofia blanca. */
  blancoCohete: 0xece8da,
  negro: 0x171416,
  plateado: 0xc4c4c0,
  salmon: 0xd8965f,
  /**
   * Módulo lunar: la etapa de descenso va forrada de mantas de Kapton aluminizado ámbar, ámbar oscuro (rojizo),
   * negro, plata y amarillo (Wikipedia, "Apollo Lunar Module", a partir de la documentación de Grumman).
   * La etapa de ascenso es gris claro con zonas negras alrededor del túnel y los propulsores.
   */
  kaptonAmbar: 0xc99a3e,
  kaptonOscuro: 0x8c5a2c,
  kaptonAmarillo: 0xd8b85a,
  ascensoGris: 0xb4b3ad,
  ascensoOscuro: 0x2b2a2c,
  toberaDescenso: 0x3a3836,
  /** LRV: guardabarros de fibra de vidrio, claros. // VERIFICAR: tono exacto (en las fotos se ven gris claro). */
  guardabarros: 0xbdb8aa,
  /** Consola del LRV: paneles oscuros con instrumentos. */
  consola: 0x2c2c2e,
} as const;

/**
 * Suelo de Taurus-Littrow: regolito del fondo del valle en gris cálido y ocre, más claro en los macizos.
 * Son tonos aproximados para la escena, no medidas de albedo. El suelo naranja de Shorty (estación 4) era
 * de vidrio volcánico naranja (muestra 74220) y quedaba enterrado bajo la capa gris: ver sitioApollo17.ts.
 */
export const SUELO_LUNA = {
  gris: 0x8a8781,
  grisCalido: 0x938e85,
  grisClaro: 0xa19c93,
  ocre: 0x9a8f7a,
  ocreOscuro: 0x857c6c,
  /** Material fresco expulsado por cráteres jóvenes: algo más claro. */
  fresco: 0xaeaaa2,
  /** Macizos de las tierras altas: más claros que el fondo del valle. */
  macizo: 0xa6a198,
  macizoSombra: 0x938e85,
  /** Rocas: basalto gris oscuro y brecha más clara. */
  basalto: 0x5f5c58,
  brecha: 0x8a857c,
  /** Vidrio volcánico naranja de Shorty. // VERIFICAR: tono (ver la foto AS17-137-21009 citada por LROC). */
  naranja: 0xb8733a,
} as const;

export type V3 = [number, number, number];
/** Color constante, o función del centro de cada cara (en coordenadas de la geometría). */
export type ColorCara = number | ((centro: THREE.Vector3) => number);

export interface Transformacion {
  p?: V3;
  r?: V3;
  e?: V3;
  /** Variación de brillo por cara (0–1): da el aspecto facetado en rocas, planetas y cúpula. */
  v?: number;
}

/** Generador pseudoaleatorio con semilla: el museo se ve igual en cada carga. */
export function azar(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Rugosidad y metalicidad dentro de los rangos pedidos: 0.6–0.9 y 0.1–0.3.
const crearOpaco = (fog: boolean): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.75, metalness: 0.2, fog });
const OPACO = crearOpaco(true);
const OPACO_SIN_NIEBLA = crearOpaco(false);
/**
 * Mate del todo, para el regolito, las rocas y los macizos de la Luna: con algo de metalicidad, el suelo a contraluz
 * con el Sol rasante brillaría como asfalto mojado, y el polvo lunar no tiene brillo especular.
 */
const MATE = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0, fog: false });
/** Sin iluminación y con colores mayores que 1: es lo único que supera el umbral del bloom. */
const EMISIVO = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
const ADITIVO = new THREE.MeshBasicMaterial({
  vertexColors: true,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
  fog: false,
});
/** Sin iluminación a propósito: en un panel plano, el brillo especular cubriría todo el cristal de un solo color. */
const VIDRIO = new THREE.MeshBasicMaterial({
  color: 0x7fe4ff,
  transparent: true,
  opacity: 0.045,
  depthWrite: false,
  side: THREE.DoubleSide,
  fog: false,
});

const _centro = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _color = new THREE.Color();
const _euler = new THREE.Euler();
const _q = new THREE.Quaternion();

/** Acumula piezas estáticas y las fusiona por material. */
export class Lote {
  private readonly opacas: THREE.BufferGeometry[] = [];
  private readonly emisivas: THREE.BufferGeometry[] = [];
  private readonly aditivas: THREE.BufferGeometry[] = [];
  private readonly vidrios: THREE.BufferGeometry[] = [];
  private readonly azarCara = azar(7);
  private matriz = new THREE.Matrix4();

  /** `acabado`: 'museo' (rugosidad 0.75 y metalicidad 0.2, como pide el estilo) o 'mate' (suelo lunar). */
  constructor(
    private readonly niebla = true,
    private readonly acabado: 'museo' | 'mate' = 'museo',
  ) {}

  /** Ejecuta `fn` con un sistema de coordenadas local (posición, giro y escala). */
  en(p: V3, r: V3, fn: () => void, e: V3 = [1, 1, 1]): void {
    const anterior = this.matriz;
    this.matriz = anterior.clone().multiply(this.matrizDe({ p, r, e }));
    fn();
    this.matriz = anterior;
  }

  /** Pieza mate iluminada. */
  pieza(geo: THREE.BufferGeometry, color: ColorCara, t: Transformacion = {}): void {
    this.opacas.push(this.preparar(geo, color, 1, t));
  }

  /** Pieza que emite luz. `intensidad` > 1.2 hace que florezca con el bloom. */
  emisiva(geo: THREE.BufferGeometry, color: ColorCara, intensidad = 2.5, t: Transformacion = {}): void {
    this.emisivas.push(this.preparar(geo, color, intensidad, t));
  }

  /** Luz falsa aditiva (halos, haces, hologramas). `colorV` da el color lineal de cada vértice. */
  aditiva(geo: THREE.BufferGeometry, colorV: (p: THREE.Vector3) => THREE.Color, t: Transformacion = {}): void {
    const g = limpiar(geo);
    const pos = g.getAttribute('position');
    const colores = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const c = colorV(_a.fromBufferAttribute(pos, i));
      colores.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colores, 3));
    g.applyMatrix4(this.matriz.clone().multiply(this.matrizDe(t)));
    this.aditivas.push(g);
  }

  /** Cristal transparente. */
  vidrio(geo: THREE.BufferGeometry, t: Transformacion = {}): void {
    const g = limpiar(geo);
    g.applyMatrix4(this.matriz.clone().multiply(this.matrizDe(t)));
    this.vidrios.push(g);
  }

  /** Fusiona lo acumulado en un grupo con una malla por material. */
  construir(): THREE.Group {
    const grupo = new THREE.Group();
    const anadir = (lista: THREE.BufferGeometry[], material: THREE.Material, orden = 0): void => {
      if (lista.length === 0) return;
      const fusion = mergeGeometries(lista, false);
      if (!fusion) throw new Error('No se pudieron fusionar las geometrías del lote');
      const malla = new THREE.Mesh(fusion, material);
      malla.renderOrder = orden;
      grupo.add(malla);
      for (const g of lista) g.dispose();
      lista.length = 0;
    };
    anadir(this.opacas, this.acabado === 'mate' ? MATE : this.niebla ? OPACO : OPACO_SIN_NIEBLA);
    anadir(this.emisivas, EMISIVO);
    anadir(this.vidrios, VIDRIO, 1);
    anadir(this.aditivas, ADITIVO, 2);
    return grupo;
  }

  private matrizDe({ p = [0, 0, 0], r = [0, 0, 0], e = [1, 1, 1] }: Transformacion): THREE.Matrix4 {
    _a.set(...p);
    _euler.set(...r);
    _q.setFromEuler(_euler);
    _b.set(...e);
    return new THREE.Matrix4().compose(_a.clone(), _q.clone(), _b.clone());
  }

  private preparar(geo: THREE.BufferGeometry, color: ColorCara, intensidad: number, t: Transformacion): THREE.BufferGeometry {
    const g = limpiar(geo);
    const pos = g.getAttribute('position');
    const colores = new Float32Array(pos.count * 3);
    const variacion = t.v ?? 0;
    for (let i = 0; i < pos.count; i += 3) {
      if (typeof color === 'function') {
        _a.fromBufferAttribute(pos, i);
        _b.fromBufferAttribute(pos, i + 1);
        _c.fromBufferAttribute(pos, i + 2);
        _color.setHex(color(_centro.copy(_a).add(_b).add(_c).divideScalar(3)));
      } else {
        _color.setHex(color);
      }
      const brillo = intensidad * (1 + (this.azarCara() - 0.5) * variacion);
      for (let k = 0; k < 3; k++) {
        colores.set([_color.r * brillo, _color.g * brillo, _color.b * brillo], (i + k) * 3);
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(colores, 3));
    g.applyMatrix4(this.matriz.clone().multiply(this.matrizDe(t)));
    return g;
  }
}

/** Copia sin índices y solo con posiciones: con sombreado plano no hacen falta normales ni UV. */
function limpiar(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const nombre of Object.keys(g.attributes)) {
    if (nombre !== 'position') g.deleteAttribute(nombre);
  }
  g.clearGroups();
  return g;
}

// ---------------------------------------------------------------------------
// Geometrías
// ---------------------------------------------------------------------------

function extruir(forma: THREE.Shape, fondo: number, bisel: number): THREE.BufferGeometry {
  const geo = new THREE.ExtrudeGeometry(forma, {
    depth: Math.max(fondo - bisel * 2, 0.001),
    bevelEnabled: bisel > 0,
    bevelThickness: bisel,
    bevelSize: bisel,
    bevelSegments: 1,
    curveSegments: 1,
  });
  geo.translate(0, 0, -(fondo - bisel * 2) / 2);
  return geo;
}

/** Caja con las aristas biseladas, centrada. */
export function cajaBiselada(ancho: number, alto: number, fondo: number, bisel = 0.03): THREE.BufferGeometry {
  const w = ancho / 2 - bisel;
  const h = alto / 2 - bisel;
  const forma = new THREE.Shape();
  forma.moveTo(-w, -h);
  forma.lineTo(w, -h);
  forma.lineTo(w, h);
  forma.lineTo(-w, h);
  forma.closePath();
  return extruir(forma, fondo, bisel);
}

/** Placa de esquinas cortadas (el marco octogonal de las referencias), biselada y centrada. El espesor va en Z. */
export function placaChaflan(ancho: number, alto: number, fondo: number, corte = 0.2, bisel = 0.02): THREE.BufferGeometry {
  const w = ancho / 2 - bisel;
  const h = alto / 2 - bisel;
  const c = Math.min(corte, w, h);
  const forma = new THREE.Shape();
  forma.moveTo(-w + c, -h);
  forma.lineTo(w - c, -h);
  forma.lineTo(w, -h + c);
  forma.lineTo(w, h - c);
  forma.lineTo(w - c, h);
  forma.lineTo(-w + c, h);
  forma.lineTo(-w, h - c);
  forma.lineTo(-w, -h + c);
  forma.closePath();
  return extruir(forma, fondo, bisel);
}

/** Bloque curvo entre dos radios y dos ángulos (X = r·cos a, Z = r·sin a), de y0 a y1. */
export function segmentoAnillo(r0: number, r1: number, a0: number, a1: number, y0: number, y1: number): THREE.BufferGeometry {
  const v = (r: number, a: number, y: number): V3 => [r * Math.cos(a), y, r * Math.sin(a)];
  const A = v(r0, a0, y1);
  const B = v(r1, a0, y1);
  const C = v(r1, a1, y1);
  const D = v(r0, a1, y1);
  const A2 = v(r0, a0, y0);
  const B2 = v(r1, a0, y0);
  const C2 = v(r1, a1, y0);
  const D2 = v(r0, a1, y0);
  const caras: [V3, V3, V3, V3][] = [
    [A, D, C, B],
    [A2, B2, C2, D2],
    [B, C, C2, B2],
    [D, A, A2, D2],
    [A, B, B2, A2],
    [C, D, D2, C2],
  ];
  const pos: number[] = [];
  for (const [p0, p1, p2, p3] of caras) pos.push(...p0, ...p1, ...p2, ...p0, ...p2, ...p3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return geo;
}

/** Tubo recto entre dos puntos. */
export function tuboEntre(a: V3, b: V3, radio: number, lados = 6): THREE.BufferGeometry {
  const inicio = new THREE.Vector3(...a);
  const fin = new THREE.Vector3(...b);
  const eje = fin.clone().sub(inicio);
  const geo = new THREE.CylinderGeometry(radio, radio, eje.length(), lados);
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), eje.clone().normalize()));
  const medio = inicio.add(fin).multiplyScalar(0.5);
  geo.translate(medio.x, medio.y, medio.z);
  return geo;
}

/** Roca irregular: icosaedro con los vértices desplazados de forma coherente. */
export function geometriaRoca(semilla: number, detalle = 1): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(1, detalle);
  const rnd = azar(semilla);
  const desplazamientos = new Map<string, number>();
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const v = _a.fromBufferAttribute(pos, i);
    const clave = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    let d = desplazamientos.get(clave);
    if (d === undefined) {
      d = 0.72 + rnd() * 0.5;
      desplazamientos.set(clave, d);
    }
    pos.setXYZ(i, v.x * d, v.y * d, v.z * d);
  }
  return geo;
}

/** Color lineal `hex` multiplicado por `intensidad`, para la luz falsa aditiva. */
export function tinte(hex: number, intensidad: number): THREE.Color {
  return new THREE.Color(hex).multiplyScalar(intensidad);
}
