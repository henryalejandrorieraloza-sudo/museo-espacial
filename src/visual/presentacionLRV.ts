import * as THREE from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import {
  CAMPO_VISION,
  avanceEn,
  mandoEn,
  opacidadMarca,
  poseEn,
  type Resalte,
  type Toma,
  type Tramo,
} from '../game/presentacionLRV';
import { DIRECCION_SOL, DIRECCION_TIERRA, SOL, crearCielo } from './cielo';
import {
  BATALLA_LRV,
  RADIO_RUEDA_LRV,
  ANCHO_RUEDA_LRV,
  RUEDAS_LRV,
  VIA_LRV,
  POSE_DESPLEGADO,
  crearLRVLuna,
  type PlegadoLRV,
  type RuedasLRV,
} from './lrv';
import {
  BRILLO_HALO,
  COLOR_HALO,
  COLOR_RELLENO_CIELO,
  COLOR_RELLENO_SUELO,
  COLOR_SOL,
  INTENSIDAD_RELLENO,
  INTENSIDAD_SOL,
  LEJANO_CAMARA_LUNA_M,
  PIXELES_MAXIMOS,
  crearPostprocesoLuna,
} from './lunaEscena';
import { SUELO_LUNA, azar, geometriaRoca, tinte } from './paleta';
import { crearMaterialRoca, crearMaterialSuelo } from './regolito';
import { RADIO_LUNA_M, SHORTY } from './sitioApollo17';

// Escena 3D de la presentación del LRV (guion en game/presentacionLRV.ts). Solo el LRV, sin astronautas ni figuras
// humanas: suelo de regolito gris claro, cielo negro con el Sol, la Tierra y las estrellas de la escena lunar
// (cielo.ts), un solo Sol con sombras duras y el mismo render de dos pasadas que la misión, así el LRV se ve igual
// que al llegar a la Luna. El LRV es el mismo modelo que se conduce (lrv.ts), construido con el registro de partes
// para poder resaltar sus piezas con un contorno azul celeste (el color del halo, SPEC 10).
//
// Todo lo del suelo va en el grupo `mundo`, en ejes del LRV en su posición de partida (frente hacia −Z). El grupo se
// gira al rumbo del LRV; el cielo y el Sol quedan en los ejes del mundo (+X este, −Z norte), como en la misión.

/**
 * Rumbo del LRV (°, desde el norte hacia el este): el Sol de la EVA-1 (azimut 96.8°, altura 15.7°) le llega desde
 * atrás a la izquierda. Así el costado izquierdo, la consola (que mira hacia atrás) y las tomas de 3/4 frontal por la
 * izquierda quedan al sol, y la Tierra (azimut 240.7°, altura 45.3°) queda delante del LRV, hacia donde apunta la
 * antena de alta ganancia. Es una elección de la presentación: no reproduce una parada concreta.
 */
const RUMBO_LRV = SOL.azimut + 125;
/** Grosor de los contornos (px de pantalla). */
const GROSOR_CONTORNO_PX = 2.6;
/** Ángulo (°) a partir del cual una arista entre dos caras se dibuja en el contorno. */
const ANGULO_ARISTA = 32;
/** Inclinación máxima de la palanca del mando en T en la animación (rad). // VERIFICAR: recorrido real del mando. */
const INCLINACION_MANDO = THREE.MathUtils.degToRad(16);
/** Diámetro del marco de tope dentro de cada rueda: 64.8 cm (NSSDC). // VERIFICAR: su forma (aquí, dos aros con riostras). */
const RADIO_MARCO_INTERIOR = 0.324;
/** Sombras: caja de ±LADO_SOMBRA_M alrededor del LRV. */
const LADO_SOMBRA_M = 14;
const TAMANO_MAPA_SOMBRA = 2048;
/** Radio del disco de suelo (m). Más allá, el cielo negro hace de horizonte. */
const RADIO_SUELO_M = 900;

/**
 * Cráter Shorty (LROC: 110 m de diámetro, ~14 m de profundidad) delante del LRV: el suelo naranja está en su borde,
 * justo donde el LRV termina su recorrido en la escena de cierre. El borde levantado (~1.5 m) es del modelo.
 * // VERIFICAR: altura del borde.
 */
const RADIO_SHORTY = SHORTY.diametro / 2;
const BORDE_SHORTY_M = 1.5;
/** Centro del suelo naranja (ejes del LRV): 3.5 m por delante del morro del LRV al final del recorrido. */
const SUELO_NARANJA = { x: 0.5, z: -19 } as const;
const CENTRO_SHORTY = { x: 0.3, z: SUELO_NARANJA.z - RADIO_SHORTY - 1.2 } as const;
/** Banda de vidrio naranja a la vista (m): Schmitt la encontró al remover la capa gris en el borde (ALSJ). */
const LARGO_NARANJA_M = 3.4;
const ANCHO_NARANJA_M = 1.0;

/** Cráteres pequeños alrededor (x, z, radio en m), fuera del recorrido del LRV. */
const CRATERES: readonly (readonly [number, number, number])[] = [
  [7, 5, 1.6],
  [-6.5, -5, 2.4],
  [10, -11, 3.2],
  [-13, 3, 4.5],
  [4, 11, 1.3],
  [-5, 16, 2.8],
  [17, 7, 6],
  [-20, -16, 7],
  [24, -24, 5],
  [-9, 30, 9],
  [30, 18, 11],
  [-34, -2, 4],
  [6.5, -4, 0.9],
  [-3.5, 6.5, 1.1],
];

/** Perfil de un cráter degradado: cuenco hasta el borde y borde que se desvanece por fuera. `u` = distancia / radio. */
function perfilCrater(u: number, profundidad: number, borde: number, anchoBorde: number): number {
  const cuenco = u < 1 ? -profundidad * (1 - u * u) ** 1.4 : 0;
  return cuenco + borde * Math.exp(-(((u - 1) / anchoBorde) ** 2));
}

/** Altura del suelo (m) en ejes del LRV. */
export function alturaPresentacion(x: number, z: number): number {
  let h = 0.12 * Math.sin(x / 9.3 + 0.7) * Math.cos(z / 13.1 - 0.4) + 0.07 * Math.sin((x + z) / 4.7);
  const shorty = Math.hypot(x - CENTRO_SHORTY.x, z - CENTRO_SHORTY.z) / RADIO_SHORTY;
  h += perfilCrater(shorty, SHORTY.profundidad, BORDE_SHORTY_M, 0.25);
  for (const [cx, cz, r] of CRATERES) {
    const u = Math.hypot(x - cx, z - cz) / r;
    if (u < 2.2) h += perfilCrater(u, 0.18 * r, 0.04 * r, 0.35);
  }
  // Curvatura de la Luna: a 900 m baja unos 23 cm.
  const r2 = x * x + z * z;
  return h - r2 / (2 * RADIO_LUNA_M);
}

/** Suelo: disco polar con anillos cada vez más separados, color por vértice y regolito por píxel (regolito.ts). */
function crearSueloPresentacion(): THREE.Mesh {
  const radios: number[] = [0];
  let r = 0;
  while (r < RADIO_SUELO_M) {
    r += r < 24 ? 0.3 : r * 0.045;
    radios.push(Math.min(r, RADIO_SUELO_M));
  }
  const lados = 256;
  const cx = 0;
  const cz = -8;
  const posiciones: number[] = [];
  const colores: number[] = [];
  const rnd = azar(1217);
  const gris = new THREE.Color(SUELO_LUNA.gris);
  const manto = new THREE.Color(SUELO_LUNA.mantoOscuro);
  const fresco = new THREE.Color(SUELO_LUNA.fresco);
  const c = new THREE.Color();
  for (let i = 0; i < radios.length; i++) {
    const n = i === 0 ? 1 : lados;
    for (let k = 0; k < n; k++) {
      const a = (k / lados) * Math.PI * 2;
      const x = cx + Math.cos(a) * radios[i];
      const z = cz + Math.sin(a) * radios[i];
      posiciones.push(x, alturaPresentacion(x, z), z);
      // Manchas suaves de manto oscuro y material fresco en los bordes de los cráteres.
      const mancha = 0.5 + 0.5 * Math.sin(x / 23 + 1.3) * Math.cos(z / 17 - 0.6);
      c.copy(gris).lerp(manto, 0.45 * mancha * mancha);
      const u = Math.hypot(x - CENTRO_SHORTY.x, z - CENTRO_SHORTY.z) / RADIO_SHORTY;
      if (u > 0.8 && u < 1.5) c.lerp(fresco, 0.25 * (1 - Math.abs(u - 1.1) / 0.4));
      c.multiplyScalar(1 + (rnd() - 0.5) * 0.04);
      colores.push(c.r, c.g, c.b);
    }
  }
  const indices: number[] = [];
  for (let k = 0; k < lados; k++) indices.push(0, 1 + ((k + 1) % lados), 1 + k);
  for (let i = 1; i < radios.length - 1; i++) {
    const a0 = 1 + (i - 1) * lados;
    const a1 = 1 + i * lados;
    for (let k = 0; k < lados; k++) {
      const k1 = (k + 1) % lados;
      indices.push(a0 + k, a0 + k1, a1 + k, a0 + k1, a1 + k1, a1 + k);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(posiciones, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colores, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const suelo = new THREE.Mesh(geo, crearMaterialSuelo());
  suelo.name = 'suelo_presentacion';
  suelo.receiveShadow = true;
  suelo.castShadow = true;
  return suelo;
}

/** Rocas sueltas de basalto y brecha, fuera del recorrido del LRV y lejos de sus ruedas. */
function crearRocasPresentacion(): THREE.InstancedMesh {
  const rnd = azar(74220);
  const material = crearMaterialRoca();
  const geo = geometriaRoca(5, 1);
  const total = 140;
  const rocas = new THREE.InstancedMesh(geo, material, total);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const colores = [SUELO_LUNA.basalto, SUELO_LUNA.brecha, SUELO_LUNA.rocaClara];
  const c = new THREE.Color();
  let n = 0;
  while (n < total) {
    const a = rnd() * Math.PI * 2;
    const d = 2.5 + rnd() ** 1.6 * 45;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d - 6;
    // Fuera de la franja por la que pasa el LRV y del entorno del suelo naranja.
    if (Math.abs(x) < 2.6 && z < 4 && z > -22) continue;
    const tam = 0.04 + rnd() ** 3 * 0.45;
    e.set(rnd() * 3, rnd() * 3, rnd() * 3);
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(x, alturaPresentacion(x, z) + tam * 0.25, z), q, new THREE.Vector3(tam, tam * (0.6 + rnd() * 0.3), tam * (0.8 + rnd() * 0.4)));
    rocas.setMatrixAt(n, m);
    rocas.setColorAt(n, c.setHex(colores[Math.floor(rnd() * colores.length)]));
    n++;
  }
  rocas.castShadow = true;
  rocas.receiveShadow = true;
  rocas.computeBoundingSphere();
  return rocas;
}

/**
 * Banda de suelo naranja a la vista en el borde de Shorty: rejilla pegada al suelo, con el borde irregular y que se
 * desvanece (color por vértice con alfa). El tono es el de la paleta (SUELO_LUNA.naranja, // VERIFICAR).
 */
function crearSueloNaranja(): THREE.Mesh {
  const nx = 24;
  const nz = 8;
  const rnd = azar(74220);
  const base = new THREE.Color(SUELO_LUNA.naranja);
  const posiciones: number[] = [];
  const colores: number[] = [];
  const indices: number[] = [];
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const u = i / nx - 0.5;
      const v = j / nz - 0.5;
      // Ligeramente curvada siguiendo el borde del cráter.
      const x = SUELO_NARANJA.x + u * LARGO_NARANJA_M;
      const z = SUELO_NARANJA.z + v * ANCHO_NARANJA_M * (1 - 0.35 * Math.abs(u) * 2) - 0.6 * u * u;
      posiciones.push(x, alturaPresentacion(x, z) + 0.012, z);
      const borde = Math.max(Math.abs(u) * 2, Math.abs(v) * 2);
      const alfa = THREE.MathUtils.clamp((1 - borde) * 3 + (rnd() - 0.5) * 0.8, 0, 1) * 0.92;
      const tono = 0.88 + rnd() * 0.22;
      colores.push(base.r * tono, base.g * tono, base.b * tono, alfa);
    }
  }
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      const b = a + nx + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(posiciones, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colores, 4));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    transparent: true,
    roughness: 1,
    metalness: 0,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  });
  const malla = new THREE.Mesh(geo, material);
  malla.name = 'suelo_naranja';
  malla.receiveShadow = true;
  return malla;
}

/** Huellas de las ruedas: franjas algo más oscuras pegadas al suelo. Detrás del LRV ya están (llegó conduciendo). */
const PASO_HUELLA_M = 0.25;
const INICIO_HUELLA_Z = 45;
function crearHuellas(finZ: number): { malla: THREE.Mesh; mostrarHasta(z: number): void } {
  const posiciones: number[] = [];
  const indices: number[] = [];
  const pasos = Math.ceil((INICIO_HUELLA_Z - finZ) / PASO_HUELLA_M);
  const medio = ANCHO_RUEDA_LRV / 2;
  for (const lado of [-1, 1]) {
    const x0 = (lado * VIA_LRV) / 2;
    const base = posiciones.length / 3;
    for (let k = 0; k <= pasos; k++) {
      const z = INICIO_HUELLA_Z - k * PASO_HUELLA_M;
      for (const s of [-1, 1]) {
        const x = x0 + s * medio;
        posiciones.push(x, alturaPresentacion(x, z) + 0.02, z);
      }
    }
    for (let k = 0; k < pasos; k++) {
      const a = base + k * 2;
      // Caras hacia arriba: de un borde al otro y luego hacia delante (−Z).
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(posiciones, 3));
  // Las dos franjas van una detrás de otra en el índice: cada una tiene `pasos` tramos de 6 índices.
  const porFranja = pasos * 6;
  const indicesOrden: number[] = [];
  for (let k = 0; k < pasos; k++) {
    indicesOrden.push(...indices.slice(k * 6, k * 6 + 6), ...indices.slice(porFranja + k * 6, porFranja + k * 6 + 6));
  }
  geo.setIndex(indicesOrden);
  geo.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    color: 0x4e4c48,
    transparent: true,
    opacity: 0.7,
    roughness: 1,
    metalness: 0,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  });
  const malla = new THREE.Mesh(geo, material);
  malla.name = 'huellas_lrv';
  malla.receiveShadow = true;
  return {
    malla,
    mostrarHasta(z) {
      const k = THREE.MathUtils.clamp(Math.floor((INICIO_HUELLA_Z - z) / PASO_HUELLA_M), 0, pasos);
      geo.setDrawRange(0, k * 12);
    },
  };
}

/** Coloca el LRV sobre el suelo de la presentación (como colocarLRV en lunaEscena.ts), en ejes del LRV. */
function apoyarLRV(lrv: THREE.Object3D, z: number): void {
  const alturas = RUEDAS_LRV.map(([rx, rz]) => alturaPresentacion(rx, z + rz));
  const [di, dd, ti, td] = alturas;
  lrv.position.set(0, (di + dd + ti + td) / 4, z);
  lrv.rotation.set(Math.atan2((di + dd - ti - td) / 2, BATALLA_LRV), 0, Math.atan2((dd + td - di - ti) / 2, VIA_LRV), 'YXZ');
}

// ---------------------------------------------------------------------------
// Contornos
// ---------------------------------------------------------------------------

interface Contorno {
  objeto: THREE.Object3D;
  lineas: LineMaterial;
  /** Centro de la pieza en ejes de `objeto`, para colocar el rótulo. */
  centro: THREE.Vector3;
}

const COLOR_CONTORNO = tinte(COLOR_HALO, BRILLO_HALO);

function materialLineas(rayosX: boolean): LineMaterial {
  return new LineMaterial({
    color: COLOR_CONTORNO,
    linewidth: GROSOR_CONTORNO_PX,
    transparent: true,
    opacity: 0,
    depthTest: !rayosX,
    depthWrite: false,
    polygonOffset: !rayosX,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -8,
  });
}

/**
 * Contorno de una pieza: sus aristas marcadas, gruesas (en píxeles), sin relleno, así la pieza conserva su color (el
 * dorado del Mylar, el naranja de los asientos). Con `rayosX`, el contorno se ve también a través del LRV (como en la
 * referencia), para piezas pequeñas o tapadas.
 */
function contornoDe(geo: THREE.BufferGeometry, rayosX: boolean, angulo = ANGULO_ARISTA): Contorno {
  const grupo = new THREE.Group();
  const aristas = new THREE.EdgesGeometry(geo, angulo);
  const lineasGeo = new LineSegmentsGeometry().fromEdgesGeometry(aristas);
  aristas.dispose();
  const lineas = materialLineas(rayosX);
  const segmentos = new LineSegments2(lineasGeo, lineas);
  segmentos.renderOrder = 20;
  grupo.add(segmentos);
  geo.computeBoundingBox();
  const centro = geo.boundingBox ? geo.boundingBox.getCenter(new THREE.Vector3()) : new THREE.Vector3();
  grupo.visible = false;
  grupo.traverse((o) => {
    o.castShadow = false;
    o.receiveShadow = false;
  });
  return { objeto: grupo, lineas, centro };
}

/** Contorno hecho de líneas sueltas (pares de puntos), sin relleno. */
function contornoDeLineas(puntos: THREE.Vector3[], rayosX: boolean): Contorno {
  const geo = new LineSegmentsGeometry().setPositions(puntos.flatMap((p) => [p.x, p.y, p.z]));
  const lineas = materialLineas(rayosX);
  const segmentos = new LineSegments2(geo, lineas);
  segmentos.renderOrder = 20;
  const grupo = new THREE.Group();
  grupo.add(segmentos);
  grupo.visible = false;
  const caja = new THREE.Box3().setFromPoints(puntos);
  return { objeto: grupo, lineas, centro: caja.getCenter(new THREE.Vector3()) };
}

/** Círculo en el plano YZ (eje X) de radio `r`, a la altura `x` del eje, como pares de puntos. */
function circuloX(x: number, r: number, lados = 32): THREE.Vector3[] {
  const puntos: THREE.Vector3[] = [];
  for (let k = 0; k < lados; k++) {
    const a0 = (k / lados) * Math.PI * 2;
    const a1 = ((k + 1) / lados) * Math.PI * 2;
    puntos.push(new THREE.Vector3(x, Math.cos(a0) * r, Math.sin(a0) * r), new THREE.Vector3(x, Math.cos(a1) * r, Math.sin(a1) * r));
  }
  return puntos;
}

// ---------------------------------------------------------------------------
// Presentación
// ---------------------------------------------------------------------------

/** Estado de un fotograma: el tramo actual y el tiempo dentro de él. */
export interface EstadoPresentacionVisual {
  tramo: Tramo;
  /** Segundos desde el inicio del tramo. */
  t: number;
  dtS: number;
}

/** Posición en pantalla (px, desde arriba a la izquierda) del centro de la pieza de cada marca del tramo. */
export interface PosicionMarca {
  x: number;
  y: number;
  /** false si la pieza queda detrás de la cámara. */
  enPantalla: boolean;
}

export interface PresentacionVisual {
  /** Aplica un fotograma: cámara, LRV, mando, resaltes. Devuelve la posición de cada marca del tramo. */
  actualizar(estado: EstadoPresentacionVisual): PosicionMarca[];
  render(): void;
  ajustar(ancho: number, alto: number): void;
  /** Vuelve al principio (LRV en su sitio, sin resaltes), para verla otra vez. */
  reiniciar(): void;
}

export function crearPresentacionVisual(renderer: THREE.WebGLRenderer): PresentacionVisual {
  const escena = new THREE.Scene();
  escena.name = 'presentacion_lrv';
  const camara = new THREE.PerspectiveCamera(CAMPO_VISION, 16 / 9, 0.04, LEJANO_CAMARA_LUNA_M);
  escena.add(camara);

  const mundo = new THREE.Group();
  mundo.name = 'mundo_presentacion';
  mundo.rotation.y = -THREE.MathUtils.degToRad(RUMBO_LRV);
  escena.add(mundo);

  // Un solo Sol, con sombras duras, y el relleno que rebota en el suelo (lunaEscena.ts).
  const sol = new THREE.DirectionalLight(COLOR_SOL, INTENSIDAD_SOL);
  sol.castShadow = true;
  sol.shadow.mapSize.set(TAMANO_MAPA_SOMBRA, TAMANO_MAPA_SOMBRA);
  const camSombra = sol.shadow.camera;
  camSombra.left = -LADO_SOMBRA_M;
  camSombra.right = LADO_SOMBRA_M;
  camSombra.top = LADO_SOMBRA_M;
  camSombra.bottom = -LADO_SOMBRA_M;
  camSombra.near = 1;
  camSombra.far = 400;
  sol.shadow.bias = -0.0004;
  sol.shadow.normalBias = 0.04;
  const relleno = new THREE.HemisphereLight(COLOR_RELLENO_CIELO, COLOR_RELLENO_SUELO, INTENSIDAD_RELLENO);
  escena.add(sol, sol.target, relleno);

  const cielo = crearCielo();
  escena.add(cielo);

  // LRV desplegado y cargado, con la antena de alta ganancia apuntando a la Tierra.
  const haciaTierra = DIRECCION_TIERRA.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(RUMBO_LRV));
  const lrv = crearLRVLuna(haciaTierra, true);
  lrv.name = 'lrv_presentacion';
  (lrv.userData.plegado as PlegadoLRV).aplicar(POSE_DESPLEGADO);
  const ruedas = lrv.userData.ruedas as RuedasLRV;
  const palanca = lrv.getObjectByName('mando_T');
  const huellas = crearHuellas(-16.5);
  mundo.add(crearSueloPresentacion(), crearRocasPresentacion(), crearSueloNaranja(), huellas.malla, lrv);
  apoyarLRV(lrv, 0);

  // Contornos de las piezas registradas (lrv.ts): cuelgan del grupo de su lote, así siguen pivotes y ruedas.
  const contornos = new Map<Resalte, Contorno[]>();
  const anadir = (resalte: Resalte, c: Contorno, padre: THREE.Object3D): void => {
    padre.add(c.objeto);
    const lista = contornos.get(resalte) ?? [];
    lista.push(c);
    contornos.set(resalte, lista);
  };
  const RESALTES_PIEZA: Partial<Record<string, { resalte: Resalte; rayosX: boolean }>> = {
    chasis: { resalte: 'chasis', rayosX: true },
    malla: { resalte: 'malla', rayosX: false },
    chevrones: { resalte: 'chevrones', rayosX: false },
    asientos: { resalte: 'asientos', rayosX: false },
    mando: { resalte: 'mando', rayosX: true },
    consola: { resalte: 'consola', rayosX: false },
    panelPotencia: { resalte: 'panelPotencia', rayosX: true },
    panelDireccion: { resalte: 'panelDireccion', rayosX: true },
    panelHabilitar: { resalte: 'panelHabilitar', rayosX: true },
    baterias: { resalte: 'baterias', rayosX: true },
    mylar: { resalte: 'mylar', rayosX: false },
    camaraTV: { resalte: 'camaraTV', rayosX: true },
    antenaAlta: { resalte: 'antenaAlta', rayosX: true },
    antenaBaja: { resalte: 'antenaBaja', rayosX: true },
  };
  const bujeDI = lrv.getObjectByName('rueda_delantera_izquierda_buje');
  const enRuedaDI = (o: THREE.Object3D): boolean => {
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p === bujeDI) return true;
    return false;
  };
  const lotes: THREE.Object3D[] = [];
  lrv.traverse((o) => {
    if (o.userData.partes instanceof Map) lotes.push(o);
  });
  for (const lote of lotes) {
    for (const [nombre, geo] of lote.userData.partes as Map<string, THREE.BufferGeometry>) {
      const def = RESALTES_PIEZA[nombre];
      if (!def) continue;
      // La malla y los chevrones se resaltan solo en la rueda delantera izquierda (la de las tomas).
      if ((nombre === 'malla' || nombre === 'chevrones') && !enRuedaDI(lote)) continue;
      // La malla es de cuerdas en relieve muy poco anguladas: sin un ángulo bajo apenas tendría aristas.
      anadir(def.resalte, contornoDe(geo, def.rayosX, nombre === 'malla' ? 8 : ANGULO_ARISTA), lote);
    }
  }
  // Ruedas: aros de la banda y del cubo de las cuatro ruedas.
  const r = RADIO_RUEDA_LRV;
  const w = ANCHO_RUEDA_LRV / 2;
  for (const nombre of ['delantera_izquierda', 'delantera_derecha', 'trasera_izquierda', 'trasera_derecha']) {
    const buje = lrv.getObjectByName(`rueda_${nombre}_buje`);
    if (!buje) continue;
    const fuera = nombre.endsWith('izquierda') ? -1 : 1;
    const c = contornoDeLineas([...circuloX(-w, r + 0.01), ...circuloX(w, r + 0.01), ...circuloX(fuera * (w + 0.03), 0.25, 24)], false);
    // El centro de "Ruedas" es el de la rueda delantera izquierda (la primera de la lista).
    anadir('ruedas', c, buje);
  }
  // Marco interior (tope) de la rueda delantera izquierda: dos aros unidos por riostras, visto a través de la malla.
  if (bujeDI) {
    const puntos: THREE.Vector3[] = [...circuloX(-0.06, RADIO_MARCO_INTERIOR, 36), ...circuloX(0.06, RADIO_MARCO_INTERIOR, 36)];
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2;
      const b = ((k + 0.5) / 18) * Math.PI * 2;
      const p = (x: number, ang: number, rad: number): THREE.Vector3 => new THREE.Vector3(x, Math.cos(ang) * rad, Math.sin(ang) * rad);
      puntos.push(p(-0.06, a, RADIO_MARCO_INTERIOR), p(0.06, b, RADIO_MARCO_INTERIOR));
      puntos.push(p(0.06, b, RADIO_MARCO_INTERIOR), p(-0.06, a + Math.PI / 9, RADIO_MARCO_INTERIOR));
      // Radios hacia el cubo.
      if (k % 3 === 0) puntos.push(p(0, a, RADIO_MARCO_INTERIOR), p(0, a, 0.2));
    }
    anadir('marcoInterior', contornoDeLineas(puntos, true), bujeDI);
  }
  // Suelo naranja: círculo marcado alrededor de la banda, pegado al suelo.
  {
    const puntos: THREE.Vector3[] = [];
    const radio = 2.4;
    const lados = 48;
    const punto = (a: number): THREE.Vector3 => {
      const x = SUELO_NARANJA.x + Math.cos(a) * radio;
      const z = SUELO_NARANJA.z + Math.sin(a) * radio * 0.75;
      return new THREE.Vector3(x, alturaPresentacion(x, z) + 0.05, z);
    };
    for (let k = 0; k < lados; k++) puntos.push(punto((k / lados) * Math.PI * 2), punto(((k + 1) / lados) * Math.PI * 2));
    const c = contornoDeLineas(puntos, false);
    c.centro.set(SUELO_NARANJA.x, alturaPresentacion(SUELO_NARANJA.x, SUELO_NARANJA.z) + 0.3, SUELO_NARANJA.z);
    anadir('sueloNaranja', c, mundo);
  }
  // LRV entero (solo para el rótulo de la introducción): el centro de lo alto del LRV.
  {
    const c = contornoDeLineas([new THREE.Vector3(), new THREE.Vector3()], false);
    c.centro.set(0, 1.3, -0.3);
    anadir('lrv', c, lrv);
  }

  const composer = crearPostprocesoLuna(renderer, escena, camara);
  let ancho = 1;
  let alto = 1;
  let posePrevia: Toma | null = null;
  let ultimaPose: Toma | null = null;
  let tramoPrevio: Tramo | null = null;
  let avancePrevio = 0;

  const _p = new THREE.Vector3();
  const _m = new THREE.Vector3();
  const _adelante = new THREE.Vector3();

  const colocarCamara = (pose: Toma): void => {
    const az = THREE.MathUtils.degToRad(pose.az);
    const el = THREE.MathUtils.degToRad(pose.el);
    // La altura del punto de mira es sobre el suelo que hay debajo (el borde de Shorty levanta el terreno).
    _m.set(pose.mira[0], pose.mira[1] + alturaPresentacion(pose.mira[0], pose.mira[2]), pose.mira[2]);
    _p.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).multiplyScalar(pose.dist).add(_m);
    // La cámara no baja del suelo (10 cm por encima, como mínimo).
    _p.y = Math.max(_p.y, alturaPresentacion(_p.x, _p.z) + 0.1);
    mundo.localToWorld(_p);
    mundo.localToWorld(_m);
    camara.position.copy(_p);
    // Mirando casi en vertical, "arriba" en pantalla es el frente del LRV.
    if (pose.el > 80) camara.up.copy(_adelante.set(0, 0, -1).transformDirection(mundo.matrixWorld));
    else camara.up.set(0, 1, 0);
    camara.lookAt(_m);
    const fov = pose.fov ?? CAMPO_VISION;
    if (camara.fov !== fov) {
      camara.fov = fov;
      camara.updateProjectionMatrix();
    }
  };

  const sombraSigue = (): void => {
    lrv.getWorldPosition(_p);
    sol.target.position.copy(_p);
    sol.position.copy(_p).addScaledVector(DIRECCION_SOL, 150);
    sol.target.updateMatrixWorld();
  };

  const proyectar = (c: Contorno): PosicionMarca => {
    c.objeto.parent?.updateWorldMatrix(true, false);
    _p.copy(c.centro);
    c.objeto.parent?.localToWorld(_p);
    _p.project(camara);
    return { x: ((_p.x + 1) / 2) * ancho, y: ((1 - _p.y) / 2) * alto, enPantalla: _p.z < 1 && _p.z > -1 };
  };

  const ocultarContornos = (): void => {
    for (const lista of contornos.values()) for (const c of lista) c.objeto.visible = false;
  };

  return {
    actualizar({ tramo, t, dtS }) {
      if (tramo !== tramoPrevio) {
        posePrevia = ultimaPose;
        tramoPrevio = tramo;
      }
      mundo.updateMatrixWorld(true);

      // LRV: avance (escena de cierre) con las ruedas rodando, o quieto en su sitio.
      const metros = avanceEn(tramo, t);
      const dz = tramo.avance ? metros - avancePrevio : 0;
      avancePrevio = tramo.avance ? metros : 0;
      apoyarLRV(lrv, -metros);
      ruedas.actualizar(0, dz, Math.max(dtS, 1e-3));
      huellas.mostrarHasta(-metros + RUEDAS_LRV[0][1]);
      sombraSigue();

      // Palanca del mando en T: adelante gira la parte de arriba hacia −Z; a la derecha, hacia +X.
      const mando = mandoEn(tramo.mando, t);
      if (palanca) palanca.rotation.set(-mando.adelante * INCLINACION_MANDO, 0, -mando.lado * INCLINACION_MANDO);

      const pose = poseEn(tramo.tomas, t, posePrevia);
      ultimaPose = pose;
      colocarCamara(tramo.camaraSigueLRV ? { ...pose, mira: [pose.mira[0], pose.mira[1], pose.mira[2] - metros] } : pose);
      cielo.position.copy(camara.position);
      camara.updateMatrixWorld();

      // Resaltes: cada pieza con la opacidad máxima de sus marcas con contorno.
      const opacidad = new Map<Resalte, number>();
      for (const m of tramo.marcas) {
        if (m.sinContorno) continue;
        opacidad.set(m.resalte, Math.max(opacidad.get(m.resalte) ?? 0, opacidadMarca(m, t)));
      }
      for (const [resalte, lista] of contornos) {
        const a = opacidad.get(resalte) ?? 0;
        for (const c of lista) {
          c.objeto.visible = a > 0.001;
          c.lineas.opacity = a;
        }
      }
      return tramo.marcas.map((m) => {
        const c = contornos.get(m.resalte)?.[0];
        return c ? proyectar(c) : { x: 0, y: 0, enPantalla: false };
      });
    },
    render() {
      composer.render();
    },
    ajustar(nuevoAncho, nuevoAlto) {
      ancho = Math.max(1, nuevoAncho);
      alto = Math.max(1, nuevoAlto);
      camara.aspect = ancho / alto;
      camara.updateProjectionMatrix();
      composer.ajustar(ancho, alto);
      const pixeles = Math.min(window.devicePixelRatio, PIXELES_MAXIMOS);
      for (const lista of contornos.values()) for (const c of lista) c.lineas.resolution.set(ancho * pixeles, alto * pixeles);
    },
    reiniciar() {
      posePrevia = null;
      ultimaPose = null;
      tramoPrevio = null;
      avancePrevio = 0;
      ruedas.reiniciar();
      palanca?.rotation.set(0, 0, 0);
      apoyarLRV(lrv, 0);
      ocultarContornos();
    },
  };
}
