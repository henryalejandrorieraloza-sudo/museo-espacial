import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { COLOR_LM, Lote, METALES_LM, MallaLibre, azar, cajaBiselada, tuboEntre, type V3 } from './paleta';

// Módulo lunar Challenger (LM-12) de Apollo 17, low poly facetado. Frente (escotilla, plataforma y escalera) hacia −Z
// y derecha de la tripulación hacia +X. Origen en el suelo, en el centro del módulo.
//
// Fuentes de las medidas:
// - Wikipedia, "Apollo Lunar Module" (datos de Grumman y la NASA): etapa de ascenso de 2.83 m de alto, 4.29 m de
//   ancho y 4.04 m de fondo; etapa de descenso de 4.22 m de ancho sin el tren y 9.4 m de pata a pata; escotilla
//   delantera de 0.81 m; cuatro grupos de cuatro propulsores RCS; dos antenas VHF, antena de banda S orientable y
//   radar de encuentro; sondas de contacto solo en las patas 2, 3 y 4 (se doblaban al posarse, no se dibujan).
// - NASA TN D-6850 (ALSJ): puntal principal con amortiguador, dos puntales secundarios a media altura, bloqueos y
//   armadura de despliegue; platos de apoyo de unas 37 in (0.94 m).
// - ALSJ: plataforma y escalera en la pata 1 (la delantera); bandera y rótulo "UNITED STATES" en el frente del
//   descenso (AS17-134-20481); MESA en el cuadrante 4; el LRV viajaba en el cuadrante 1 (despliegueApollo17.ts).
//
// Aspecto (referencias de Henry de 2026-11-12: modelo "Apollo 11 Lunar Lander" de TurboSquid y fotos del LM):
// etapa de descenso forrada de lámina dorada muy arrugada, con faldones y rollos negros arriba; patas forradas de
// lámina plateada con cintas doradas y el tramo inferior dorado; puntales secundarios oscuros con herrajes
// plateados; platos dorados; tobera oscura con anillos; etapa de ascenso facetada en poliedros de paneles crema y
// carbón con las aristas marcadas en claro; cuatro grupos RCS con toberas plateadas sobre paneles de lámina
// plateada; plato de banda S oscuro en su brazo, radar plateado arriba y brazos forrados de lámina. Todo con caras
// planas (sin superficies suaves), con muchos polígonos. Colores en COLOR_LM (paleta.ts).
//
// Aproximado (// VERIFICAR contra los planos de Grumman): el reparto de facetas y colores de la etapa de ascenso, la
// forma de las ventanas, la tobera (aquí corta y oscura como en la referencia) y la pose del MESA abierto.

/** Etapa de descenso: ancho entre caras opuestas del octógono (m), base y techo de su cuerpo. */
const ANCHO_DESCENSO = 4.22;
const BASE_DESCENSO = 1.55;
const TECHO_DESCENSO = 3.2;
/** Distancia del centro a cada pie (m): 9.45 m de punta a punta menos el radio del pie. */
const RADIO_PIES = 4.25;
/** Pie de cada pata: plato de ~0.94 m de diámetro (37 in, TN D-6850). */
const RADIO_PIE = 0.47;
/** Altura de la etapa de ascenso (m). */
const ALTO_ASCENSO = 2.83;
/** Altura (m, ejes del LM) de la base de la etapa de ascenso, donde está la tobera de su motor. */
export const BASE_ASCENSO_Y = TECHO_DESCENSO;
/** Altura (m, ejes del LM) del centro de la etapa de ascenso: pivote del grupo `lm_ascenso`. */
export const CENTRO_ASCENSO_Y = TECHO_DESCENSO + ALTO_ASCENSO / 2;
/** Peldaños de la escalera de la pata 1. */
const PELDANOS = 9;
/** Cintas doradas a lo largo del forro plateado de cada puntal principal. */
const CINTAS_PUNTAL = 6;

const MEDIA_CARA = (ANCHO_DESCENSO / 2) * Math.tan(Math.PI / 8);
const RADIO_OCTO = ANCHO_DESCENSO / 2 / Math.cos(Math.PI / 8);

/** Construye el LM. `haciaTierraLocal` orienta la antena de banda S orientable hacia la Tierra (en ejes del LM). */
export function crearModuloLunar(haciaTierraLocal: THREE.Vector3): THREE.Group {
  // Las láminas doradas y plateadas van con acabado metálico: brillan cuando les da el Sol.
  const l = new Lote(false, 'museo', METALES_LM);
  const rnd = azar(1972);
  etapaDescenso(l, rnd);
  // La etapa de ascenso va en su propio lote y grupo (`lm_ascenso`), para que pueda despegar (visual/despegueLM.ts).
  const la = new Lote(false, 'museo', METALES_LM);
  etapaAscenso(la, rnd, haciaTierraLocal);
  const grupo = l.construir();
  grupo.name = 'lm_challenger';
  // Pivote en el centro de la etapa de ascenso: así se inclina sobre sí misma al hacer el giro tras el despegue.
  const ascenso = new THREE.Group();
  ascenso.name = 'lm_ascenso';
  ascenso.position.y = CENTRO_ASCENSO_Y;
  const piezasAscenso = la.construir();
  piezasAscenso.position.y = -CENTRO_ASCENSO_Y;
  ascenso.add(piezasAscenso);
  grupo.add(ascenso);
  grupo.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  return grupo;
}

const v3 = (p: V3): THREE.Vector3 => new THREE.Vector3(...p);
const mezcla = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
type Rnd = () => number;

// ---------------------------------------------------------------------------
// Ayudas de geometría
// ---------------------------------------------------------------------------

/**
 * Manta térmica arrugada: rectángulo de `ancho` × `alto` centrado en `o`, en el plano de ejes `u` y `v` (unitarios)
 * con la normal `n`. Rejilla de `cols` × `filas` con los vértices interiores empujados al azar hacia fuera (hasta
 * `arruga` m): con caras planas da el aspecto de la lámina arrugada. Los bordes quedan en el plano.
 */
function manta(
  l: Lote,
  rnd: Rnd,
  o: THREE.Vector3,
  u: THREE.Vector3,
  v: THREE.Vector3,
  n: THREE.Vector3,
  ancho: number,
  alto: number,
  color: number,
  cols = 8,
  filas = 6,
  arruga = 0.03,
  acabado?: 'metal',
): void {
  const m = new MallaLibre();
  const p: THREE.Vector3[][] = [];
  for (let i = 0; i <= cols; i++) {
    p.push([]);
    for (let j = 0; j <= filas; j++) {
      const borde = i === 0 || j === 0 || i === cols || j === filas;
      p[i].push(
        o
          .clone()
          .addScaledVector(u, (i / cols - 0.5) * ancho)
          .addScaledVector(v, (j / filas - 0.5) * alto)
          .addScaledVector(n, borde ? 0 : (rnd() * 1.4 - 0.2) * arruga),
      );
    }
  }
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < filas; j++) m.quad(p[i][j], p[i + 1][j], p[i + 1][j + 1], p[i][j + 1], n);
  }
  l.pieza(m.geometria(), color, { v: color === COLOR_LM.oro ? 0.45 : 0.16, ...(acabado ? { m: acabado } : {}) });
}

/** Desplaza al azar (y de forma coherente en las costuras) los vértices de una geometría a lo largo de `dir(p)`. */
function arrugar(geo: THREE.BufferGeometry, rnd: Rnd, arruga: number, dir: (p: THREE.Vector3) => THREE.Vector3 | null): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  const hechos = new Map<string, THREE.Vector3>();
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const clave = `${p.x.toFixed(4)},${p.y.toFixed(4)},${p.z.toFixed(4)}`;
    let nuevo = hechos.get(clave);
    if (!nuevo) {
      const d = dir(p);
      nuevo = d ? p.clone().addScaledVector(d, (rnd() * 2 - 0.7) * arruga) : p.clone();
      hechos.set(clave, nuevo);
    }
    pos.setXYZ(i, nuevo.x, nuevo.y, nuevo.z);
  }
  return geo;
}

/** Tubo forrado de lámina arrugada de `a` a `b`, con los extremos redondos para encajar. */
function tuboArrugado(a: V3, b: V3, radio: number, rnd: Rnd, lados = 12, tramos = 6, arruga = 0.014): THREE.BufferGeometry {
  const inicio = v3(a);
  const eje = v3(b).sub(inicio);
  const largo = eje.length();
  const geo = new THREE.CylinderGeometry(radio, radio, largo, lados, tramos);
  arrugar(geo, rnd, arruga, (p) => {
    const r = Math.hypot(p.x, p.z);
    if (Math.abs(Math.abs(p.y) - largo / 2) < 1e-6 || r < 1e-6) return null;
    return new THREE.Vector3(p.x / r, 0, p.z / r);
  });
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), eje.clone().normalize()));
  const medio = inicio.addScaledVector(eje, 0.5);
  geo.translate(medio.x, medio.y, medio.z);
  return geo;
}

/** Tira de cinta sobre una costura, de `a` a `b`, apoyada en la cara de normal `n`. */
function costura(l: Lote, a: THREE.Vector3, b: THREE.Vector3, n: THREE.Vector3, color: number, ancho = 0.04): void {
  const eje = b.clone().sub(a);
  const largo = eje.length();
  const geo = new THREE.BoxGeometry(ancho, largo, 0.012);
  const y = eje.normalize();
  const z = n.clone().normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  geo.applyMatrix4(new THREE.Matrix4().makeBasis(x, y, z));
  const c = a.clone().add(b).multiplyScalar(0.5).addScaledVector(z, 0.008);
  geo.translate(c.x, c.y, c.z);
  l.pieza(geo, color);
}

/**
 * Poliedro convexo de paneles (la etapa de ascenso se arma con varios): envolvente de `puntos`, cada cara del color
 * que da `color(centro, normal)`, con las aristas entre caras marcadas por un perfil claro, como las juntas de los
 * paneles de la referencia. Devuelve la malla para poder apoyar piezas en sus caras.
 */
function casco(l: Lote, puntos: THREE.Vector3[], color: (c: THREE.Vector3, n: THREE.Vector3) => number): THREE.Mesh {
  const geo = new ConvexGeometry(puntos);
  const pos = geo.getAttribute('position');
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  // ColorCara solo recibe el centro de la cara: se busca su normal en un mapa por centro.
  const normales = new Map<string, THREE.Vector3>();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    const centro = a.clone().add(b).add(c).divideScalar(3);
    n.subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    normales.set(clave(centro), n.clone());
  }
  l.pieza(geo, (centro) => color(centro, normales.get(clave(centro)) ?? new THREE.Vector3(0, 1, 0)), { v: 0.05 });
  const aristas = new THREE.EdgesGeometry(geo, 12);
  const ap = aristas.getAttribute('position');
  for (let i = 0; i < ap.count; i += 2) {
    const p0: V3 = [ap.getX(i), ap.getY(i), ap.getZ(i)];
    const p1: V3 = [ap.getX(i + 1), ap.getY(i + 1), ap.getZ(i + 1)];
    if (v3(p0).distanceTo(v3(p1)) > 0.02) l.pieza(tuboEntre(p0, p1, 0.011, 4, false), COLOR_LM.costura);
  }
  return new THREE.Mesh(geo);
}

const clave = (p: THREE.Vector3): string => `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`;

/** Prisma de esquinas cortadas: los 24 puntos de una caja de `min` a `max` con un chaflán `c` en cada esquina. */
function cajaChaflan(min: V3, max: V3, c: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (const x of [min[0], max[0]]) {
    for (const y of [min[1], max[1]]) {
      for (const z of [min[2], max[2]]) {
        const sx = x === min[0] ? 1 : -1;
        const sy = y === min[1] ? 1 : -1;
        const sz = z === min[2] ? 1 : -1;
        pts.push(new THREE.Vector3(x + sx * c, y, z), new THREE.Vector3(x, y + sy * c, z), new THREE.Vector3(x, y, z + sz * c));
      }
    }
  }
  return pts;
}

/** Punto y normal de la cara de `malla` que corta el rayo desde `desde` en la dirección `dir`. */
function enCara(malla: THREE.Mesh, desde: THREE.Vector3, dir: THREE.Vector3): { p: THREE.Vector3; n: THREE.Vector3 } | null {
  malla.material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const r = new THREE.Raycaster(desde, dir.clone().normalize());
  const hit = r.intersectObject(malla)[0];
  if (!hit || !hit.face) return null;
  return { p: hit.point, n: hit.face.normal.clone() };
}

/** Coloca `fn` en ejes de una cara: origen en `p`, Z a lo largo de la normal `n` y X lo más horizontal posible. */
function sobreCara(l: Lote, p: THREE.Vector3, n: THREE.Vector3, fn: () => void): void {
  const z = n.clone().normalize();
  let x = new THREE.Vector3(0, 1, 0).cross(z);
  if (x.lengthSq() < 1e-6) x = new THREE.Vector3(1, 0, 0);
  x.normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  const e = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  l.en([p.x, p.y, p.z], [e.x, e.y, e.z], fn);
}

/** Bandera de EE. UU. plana en ejes locales (X a lo ancho, Y arriba, Z hacia fuera), de `ancho` m. */
function bandera(l: Lote, ancho: number): void {
  const alto = ancho * 0.6;
  const franja = alto / 13;
  l.pieza(new THREE.BoxGeometry(ancho, alto, 0.006), COLOR_LM.banderaBlanco);
  for (let k = 0; k < 7; k++) {
    l.pieza(new THREE.BoxGeometry(ancho, franja, 0.004), COLOR_LM.banderaRojo, { p: [0, alto / 2 - franja * (2 * k + 0.5), 0.004] });
  }
  l.pieza(new THREE.BoxGeometry(ancho * 0.4, franja * 7, 0.004), COLOR_LM.banderaAzul, { p: [-ancho * 0.3, alto / 2 - franja * 3.5, 0.007] });
}

// ---------------------------------------------------------------------------
// Etapa de descenso
// ---------------------------------------------------------------------------

function etapaDescenso(l: Lote, rnd: Rnd): void {
  const alto = TECHO_DESCENSO - BASE_DESCENSO;
  const nucleo = new THREE.CylinderGeometry(RADIO_OCTO - 0.02, RADIO_OCTO - 0.02, alto, 8);
  nucleo.rotateY(Math.PI / 8);
  l.pieza(nucleo, COLOR_LM.oro, { p: [0, BASE_DESCENSO + alto / 2, 0] });

  for (let k = 0; k < 8; k++) {
    const th = (k * Math.PI) / 4;
    const n = new THREE.Vector3(Math.cos(th), 0, Math.sin(th));
    const u = new THREE.Vector3(-Math.sin(th), 0, Math.cos(th));
    const v = new THREE.Vector3(0, 1, 0);
    const centro = n.clone().multiplyScalar(ANCHO_DESCENSO / 2).setY(BASE_DESCENSO + alto / 2);
    // Lámina dorada muy arrugada en toda la cara.
    manta(l, rnd, centro, u, v, n, 2 * MEDIA_CARA, alto, COLOR_LM.oro, 9, 8, 0.05);
    // Faja inferior de lámina, algo saliente, como el borde del escudo de la base.
    manta(l, rnd, centro.clone().addScaledVector(n, 0.03).setY(BASE_DESCENSO + 0.12), u, v, n, 2 * MEDIA_CARA + 0.02, 0.24, COLOR_LM.oro, 7, 2, 0.03);
    const esquina = k % 2 === 1;
    if (esquina) {
      // Rollo de manta negra a lo largo del borde alto de las caras de esquina.
      const a = centro.clone().addScaledVector(u, -MEDIA_CARA).addScaledVector(n, 0.07).setY(TECHO_DESCENSO - 0.04);
      const b = centro.clone().addScaledVector(u, MEDIA_CARA).addScaledVector(n, 0.07).setY(TECHO_DESCENSO - 0.04);
      l.pieza(tuboArrugado([a.x, a.y, a.z], [b.x, b.y, b.z], 0.1, rnd, 8, 4, 0.025), COLOR_LM.negro);
    } else {
      // Faldón negro colgando del borde alto (más largo en el frente, con la bandera y el rótulo).
      const frente = k === 6;
      const largo = frente ? 1.05 : 0.5;
      const ancho = frente ? 1.05 : 1.2;
      const o = centro.clone().addScaledVector(n, 0.06).setY(TECHO_DESCENSO - largo / 2);
      manta(l, rnd, frente ? o.clone().addScaledVector(u, -0.42) : o, u, v, n, ancho, largo, COLOR_LM.carbon, 5, 4, 0.03);
      if (frente) placaBandera(l, o.clone().addScaledVector(u, -0.42).addScaledVector(n, 0.05), n);
    }
    // Arista vertical entre caras.
    const ang = th + Math.PI / 8;
    const arista = new THREE.Vector3(Math.cos(ang) * RADIO_OCTO, 0, Math.sin(ang) * RADIO_OCTO);
    costura(l, arista.clone().setY(BASE_DESCENSO), arista.clone().setY(TECHO_DESCENSO), arista.clone().normalize(), COLOR_LM.oro, 0.06);
  }
  // Techo: manta negra arrugada alrededor de la etapa de ascenso. Base: lámina dorada.
  manta(l, rnd, new THREE.Vector3(0, TECHO_DESCENSO + 0.004, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), 3.4, 3.4, COLOR_LM.carbon, 8, 8, 0.03);
  manta(l, rnd, new THREE.Vector3(0, BASE_DESCENSO - 0.004, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -1, 0), 3.4, 3.4, COLOR_LM.oro, 7, 7, 0.04);

  // Tobera del motor de descenso: cilindro oscuro algo abocinado, con anillos de refuerzo.
  const altoTobera = 0.5;
  const tobera = new THREE.CylinderGeometry(0.5, 0.58, altoTobera, 14, 1, true);
  l.pieza(tobera, COLOR_LM.negro, { p: [0, BASE_DESCENSO - altoTobera / 2, 0], v: 0.06 });
  l.pieza(new THREE.CylinderGeometry(0.49, 0.57, altoTobera, 14, 1, true).scale(-1, 1, 1), COLOR_LM.negro, { p: [0, BASE_DESCENSO - altoTobera / 2, 0] });
  for (let k = 0; k <= 4; k++) {
    const t = k / 4;
    l.pieza(new THREE.TorusGeometry(0.5 + 0.08 * t + 0.008, 0.014, 3, 14), COLOR_LM.carbon, { p: [0, BASE_DESCENSO - t * altoTobera, 0], r: [Math.PI / 2, 0, 0] });
  }

  for (let i = 0; i < 4; i++) pata(l, i, rnd);
  mesa(l, rnd);
}

/** Bandera y rótulo "UNITED STATES" (dos renglones de letras en bloques) en el faldón del frente. */
function placaBandera(l: Lote, p: THREE.Vector3, n: THREE.Vector3): void {
  sobreCara(l, p.clone().setY(p.y + 0.22), n, () => bandera(l, 0.42));
  sobreCara(l, p.clone().setY(p.y - 0.17), n, () => {
    l.pieza(new THREE.BoxGeometry(0.42, 0.3, 0.006), COLOR_LM.banderaBlanco);
    for (const [y, letras] of [
      [0.07, 6],
      [-0.07, 6],
    ] as const) {
      for (let k = 0; k < letras; k++) l.pieza(new THREE.BoxGeometry(0.045, 0.09, 0.004), COLOR_LM.negro, { p: [-0.15 + k * 0.06, y, 0.005] });
    }
  });
}

/**
 * Pata `i` (0 = la delantera, hacia −Z; 1 hacia +X): voladizo en lo alto de la cara, puntal principal forrado de
 * lámina plateada con cintas doradas hasta el cruce y el vástago dorado hasta el plato, dos puntales secundarios
 * oscuros con herrajes plateados, armadura de despliegue y el plato dorado con su rótula.
 */
function pata(l: Lote, i: number, rnd: Rnd): void {
  const a = (i * Math.PI) / 2;
  const dir = new THREE.Vector3(Math.sin(a), 0, -Math.cos(a));
  const lado = new THREE.Vector3(dir.z, 0, -dir.x);
  const punto = (radial: number, y: number, lateral = 0): V3 => [dir.x * radial + lado.x * lateral, y, dir.z * radial + lado.z * lateral];
  const arriba = punto(ANCHO_DESCENSO / 2 + 0.2, TECHO_DESCENSO - 0.28);
  l.en(punto(ANCHO_DESCENSO / 2 + 0.08, TECHO_DESCENSO - 0.22), [0, -a, 0], () => {
    l.pieza(cajaBiselada(0.5, 0.26, 0.3, 0.04), COLOR_LM.oro, { v: 0.25 });
    l.pieza(new THREE.CylinderGeometry(0.06, 0.06, 0.56, 10), COLOR_LM.plata, { r: [0, 0, Math.PI / 2], p: [0, -0.06, -0.1] });
  });
  const pie = punto(RADIO_PIES, 0.3);
  const union = mezcla(pie, arriba, 0.42);
  // Puntal principal: forro plateado con cintas doradas, y el vástago dorado hasta el plato.
  l.pieza(tuboArrugado(arriba, union, 0.095, rnd, 10, 6, 0.016), COLOR_LM.plata, { v: 0.12 });
  for (let k = 1; k <= CINTAS_PUNTAL; k++) {
    const c = mezcla(union, arriba, k / (CINTAS_PUNTAL + 1));
    const d = mezcla(union, arriba, k / (CINTAS_PUNTAL + 1) + 0.025);
    l.pieza(tuboEntre(c, d, 0.104, 10), COLOR_LM.oro, { v: 0.25 });
  }
  l.pieza(tuboEntre(mezcla(union, arriba, 0.0), mezcla(union, arriba, 0.05), 0.11, 10), COLOR_LM.plata);
  l.pieza(tuboArrugado(union, pie, 0.08, rnd, 9, 4, 0.016), COLOR_LM.oro, { v: 0.25 });
  // Puntales secundarios oscuros con herrajes plateados en los extremos, y la armadura de despliegue.
  const medios: V3[] = [];
  for (const s of [-1, 1]) {
    const base = punto(ANCHO_DESCENSO / 2, BASE_DESCENSO + 0.1, s * (MEDIA_CARA - 0.06));
    const p0 = mezcla(base, union, 0.08);
    const p1 = mezcla(base, union, 0.92);
    l.pieza(tuboEntre(p0, p1, 0.05, 8), COLOR_LM.negro, { v: 0.05 });
    l.pieza(tuboEntre(base, p0, 0.035, 6), COLOR_LM.plata);
    l.pieza(tuboEntre(p1, union, 0.035, 6), COLOR_LM.plata);
    const medio = mezcla(base, union, 0.45);
    medios.push(medio);
    l.pieza(tuboEntre(punto(ANCHO_DESCENSO / 2, BASE_DESCENSO + 0.62, s * 0.34), medio, 0.03, 10), COLOR_LM.negro);
    l.pieza(tuboEntre(punto(ANCHO_DESCENSO / 2, BASE_DESCENSO + 0.06, s * 0.3), medio, 0.026, 10), COLOR_LM.negro);
    l.pieza(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 10), COLOR_LM.plata, { p: medio });
  }
  l.pieza(tuboEntre(medios[0], medios[1], 0.028, 10), COLOR_LM.negro);
  l.pieza(tuboEntre(punto(ANCHO_DESCENSO / 2, BASE_DESCENSO + 0.62, -0.34), punto(ANCHO_DESCENSO / 2, BASE_DESCENSO + 0.62, 0.34), 0.028, 10), COLOR_LM.negro);
  // Plato de apoyo: cuenco dorado de lámina arrugada con el borde levantado y la rótula arriba.
  const [px, , pz] = pie;
  const perfil = [
    [0, -0.04],
    [0.18, -0.04],
    [0.34, -0.01],
    [0.44, 0.06],
    [RADIO_PIE, 0.13],
    [RADIO_PIE - 0.02, 0.15],
    [0.36, 0.1],
    [0.18, 0.08],
    [0, 0.08],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const plato = arrugar(new THREE.LatheGeometry(perfil, 12), rnd, 0.02, (p) => {
    const r = Math.hypot(p.x, p.z);
    return r > 0.05 && r < RADIO_PIE - 0.03 ? new THREE.Vector3(0, 1, 0) : null;
  });
  l.pieza(plato, COLOR_LM.oro, { p: [px, 0, pz], v: 0.3 });
  l.pieza(new THREE.IcosahedronGeometry(0.1, 1), COLOR_LM.oro, { p: [px, 0.24, pz], v: 0.2 });

  if (i === 0) plataformaYEscalera(l, arriba, pie);
}

/** Plataforma de rejilla delante de la escotilla, con sus pasamanos, y escalera plateada sobre el puntal delantero. */
function plataformaYEscalera(l: Lote, arriba: V3, pie: V3): void {
  const y = TECHO_DESCENSO - 0.08;
  const z0 = -ANCHO_DESCENSO / 2;
  // Marco de la plataforma y piso de rejilla.
  for (const x of [-0.48, 0.48]) l.pieza(tuboEntre([x, y, z0], [x, y, z0 - 0.78], 0.02, 4), COLOR_LM.plata);
  l.pieza(tuboEntre([-0.48, y, z0 - 0.78], [0.48, y, z0 - 0.78], 0.02, 4), COLOR_LM.plata);
  for (let k = 0; k < 7; k++) l.pieza(new THREE.BoxGeometry(0.012, 0.025, 0.76), COLOR_LM.plata, { p: [-0.43 + k * 0.143, y, z0 - 0.39] });
  for (let k = 0; k < 5; k++) l.pieza(new THREE.BoxGeometry(0.95, 0.012, 0.012), COLOR_LM.plata, { p: [0, y + 0.006, z0 - 0.06 - k * 0.13] });
  for (const x of [-0.46, 0.46]) {
    l.pieza(tuboEntre([x, y, z0 - 0.76], [x, y + 0.85, z0 - 0.66], 0.014, 6), COLOR_LM.plata);
    l.pieza(tuboEntre([x, y + 0.85, z0 - 0.66], [x * 0.9, y + 1.0, z0 + 0.05], 0.014, 6), COLOR_LM.plata);
    l.pieza(tuboEntre([x, y + 0.42, z0 - 0.72], [x * 0.95, y + 0.52, z0], 0.01, 6), COLOR_LM.plata);
  }
  // Escalera: largueros paralelos al puntal, un poco por delante, y nueve peldaños.
  const eje = v3(pie).sub(v3(arriba));
  const largo = eje.length();
  eje.normalize();
  const delante = new THREE.Vector3(0, -eje.z, eje.y).normalize().multiplyScalar(0.15);
  const punto = (t: number, x: number): V3 => {
    const p = v3(arriba).addScaledVector(eje, t).add(delante);
    return [x, p.y, p.z];
  };
  const tFin = largo * ((arriba[1] - 0.95) / (arriba[1] - pie[1]));
  for (const x of [-0.24, 0.24]) {
    l.pieza(tuboEntre(punto(0, x), punto(tFin, x), 0.016, 6), COLOR_LM.plata);
    for (const t of [0.2, tFin * 0.5, tFin - 0.05]) {
      const p = punto(t, x);
      const q = v3(arriba).addScaledVector(eje, t);
      l.pieza(tuboEntre(p, [x * 0.3, q.y, q.z], 0.009, 5, false), COLOR_LM.plata);
    }
  }
  for (let k = 0; k < PELDANOS; k++) {
    const t = 0.12 + ((tFin - 0.2) * k) / (PELDANOS - 1);
    l.pieza(tuboEntre(punto(t, -0.24), punto(t, 0.24), 0.013, 6, false), COLOR_LM.plata);
  }
}

/** MESA abierto en el cuadrante 4 (+X, −Z), forrado de lámina plateada arrugada. // VERIFICAR: pose aproximada. */
function mesa(l: Lote, rnd: Rnd): void {
  const th = (7 * Math.PI) / 4;
  const n = new THREE.Vector3(Math.cos(th), 0, Math.sin(th));
  const bisagra = n.clone().multiplyScalar(ANCHO_DESCENSO / 2 + 0.05).setY(BASE_DESCENSO + 0.25);
  const giroCara = Math.atan2(n.x, n.z);
  l.en([bisagra.x, bisagra.y, bisagra.z], [0, giroCara, 0], () => {
    l.en([0, 0, 0], [1.9, 0, 0], () => {
      l.pieza(cajaBiselada(1.05, 1.2, 0.3, 0.03), COLOR_LM.plata, { p: [0, 0.6, -0.15] });
      manta(l, rnd, new THREE.Vector3(0, 0.6, 0.005), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), 1.0, 1.15, COLOR_LM.plata, 6, 6, 0.03);
      l.pieza(new THREE.BoxGeometry(1.08, 0.05, 0.34), COLOR_LM.negro, { p: [0, 1.2, -0.15] });
    });
    for (const x of [-0.5, 0.5]) l.pieza(tuboEntre([x, 0.9, -0.05], [x, -0.36, 1.1], 0.008, 4, false), COLOR_LM.negro);
  });
}

// ---------------------------------------------------------------------------
// Etapa de ascenso
// ---------------------------------------------------------------------------

function etapaAscenso(l: Lote, rnd: Rnd, haciaTierraLocal: THREE.Vector3): void {
  const y0 = TECHO_DESCENSO;
  const P = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y0 + y, z);

  // Cabina: poliedro con el frente facetado en carbón (escotilla abajo, ventanas en las facetas altas inclinadas).
  const cabina: THREE.Vector3[] = [];
  for (let k = 0; k < 8; k++) {
    const t = (k / 8) * Math.PI * 2 + Math.PI / 8;
    cabina.push(P(Math.cos(t) * 1.2, 1.35 + Math.sin(t) * 1.15, -0.35));
    cabina.push(P(Math.cos(t) * 1.12, 1.35 + Math.sin(t) * 1.05, -1.05));
  }
  cabina.push(P(-0.62, 0.18, -1.52), P(0.62, 0.18, -1.52), P(-0.66, 1.2, -1.52), P(0.66, 1.2, -1.52));
  cabina.push(P(-1.0, 1.55, -1.38), P(1.0, 1.55, -1.38), P(-0.48, 2.3, -1.22), P(0.48, 2.3, -1.22));
  const mallaCabina = casco(l, cabina, (c, n) => {
    if (n.z < -0.45) return COLOR_LM.carbon;
    if (c.y < y0 + 0.55) return COLOR_LM.carbon;
    return c.x < -0.2 || n.y > 0.6 ? COLOR_LM.crema : COLOR_LM.carbon;
  });
  ventanasYEscotilla(l, rnd, mallaCabina);

  // Sección media: caja de esquinas cortadas, crema arriba y a la izquierda, carbón abajo y a la derecha.
  casco(l, cajaChaflan([-1.18, y0 + 0.12, -0.5], [1.18, y0 + 2.28, 1.05], 0.28), (c, n) => {
    if (c.y < y0 + 0.5 || n.y < -0.5) return COLOR_LM.carbon;
    if (n.x > 0.6 && c.y < y0 + 1.5) return COLOR_LM.carbon;
    return COLOR_LM.crema;
  });
  // Bahía de equipos de popa: gran panel crema octagonal detrás, con su marco y el borde inferior oscuro.
  casco(l, cajaChaflan([-1.02, y0 + 0.3, 1.0], [1.02, y0 + 1.85, 1.7], 0.36), (c, n) => (n.y < -0.5 || c.y < y0 + 0.55 ? COLOR_LM.carbon : COLOR_LM.crema));
  // Tanques de propulsante en los costados: bultos facetados (oscuro a la derecha, crema a la izquierda).
  for (const s of [-1, 1]) {
    l.pieza(new THREE.IcosahedronGeometry(0.64, 1), s > 0 ? COLOR_LM.carbon : COLOR_LM.crema, { p: [s * 1.16, y0 + 0.95, 0.35], e: [0.6, 1, 1.05], v: 0.08 });
  }
  // Techo oscuro, túnel de acople con su aro y la escotilla superior.
  casco(l, cajaChaflan([-0.95, y0 + 2.2, -1.0], [0.95, y0 + 2.45, 0.85], 0.12), () => COLOR_LM.carbon);
  l.pieza(new THREE.CylinderGeometry(0.42, 0.46, ALTO_ASCENSO - 2.45, 12), COLOR_LM.crema, { p: [0, y0 + (ALTO_ASCENSO + 2.45) / 2, -0.15], v: 0.05 });
  l.pieza(new THREE.TorusGeometry(0.43, 0.03, 4, 12), COLOR_LM.plata, { p: [0, y0 + ALTO_ASCENSO, -0.15], r: [Math.PI / 2, 0, 0] });
  l.pieza(new THREE.CylinderGeometry(0.34, 0.34, 0.03, 12), COLOR_LM.carbon, { p: [0, y0 + ALTO_ASCENSO - 0.02, -0.15] });

  // Radar de encuentro: plato plateado pequeño en lo alto del frente, sobre su montura.
  l.pieza(cajaBiselada(0.34, 0.22, 0.34, 0.03), COLOR_LM.carbon, { p: [0.15, y0 + 2.55, -0.85] });
  l.en([0.15, y0 + 2.66, -0.9], [-0.7, 0, 0], () => {
    l.pieza(new THREE.CylinderGeometry(0.05, 0.05, 0.28, 8), COLOR_LM.plata, { p: [0, 0.14, 0] });
    const plato = [new THREE.Vector2(0.03, 0), new THREE.Vector2(0.18, 0.03), new THREE.Vector2(0.3, 0.1)];
    l.pieza(new THREE.LatheGeometry(plato, 14), COLOR_LM.plata, { p: [0, 0.28, 0] });
    l.pieza(new THREE.LatheGeometry([...plato].reverse(), 14), COLOR_LM.plata, { p: [0, 0.283, 0] });
    l.pieza(new THREE.CylinderGeometry(0.014, 0.014, 0.2, 6), COLOR_LM.negro, { p: [0, 0.38, 0] });
  });

  // Grupos de propulsores RCS en las cuatro esquinas, con su panel de lámina plateada detrás.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) rcs(l, rnd, sx, sz, y0);
  }

  // Antena de banda S orientable: brazo forrado de lámina plateada con cintas doradas y plato oscuro hacia la Tierra.
  const baseAntena: V3 = [0.75, y0 + 2.4, 0.45];
  const codo: V3 = [1.2, y0 + 2.75, 0.55];
  const cima: V3 = [1.45, y0 + 3.05, 0.6];
  l.pieza(tuboArrugado(baseAntena, codo, 0.06, rnd, 8, 4, 0.014), COLOR_LM.plata);
  l.pieza(tuboArrugado(codo, cima, 0.05, rnd, 8, 3, 0.012), COLOR_LM.plata);
  for (const t of [0.3, 0.7]) l.pieza(tuboEntre(mezcla(baseAntena, codo, t), mezcla(baseAntena, codo, t + 0.06), 0.068, 10), COLOR_LM.oro, { v: 0.25 });
  l.pieza(cajaBiselada(0.16, 0.16, 0.22, 0.02), COLOR_LM.negro, { p: cima });
  const orientacion = new THREE.Euler().setFromQuaternion(
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), haciaTierraLocal.clone().normalize()),
  );
  l.en(cima, [orientacion.x, orientacion.y, orientacion.z], () => {
    const plato = [new THREE.Vector2(0.03, 0.05), new THREE.Vector2(0.18, 0.08), new THREE.Vector2(0.33, 0.17)];
    l.pieza(new THREE.LatheGeometry(plato, 12), COLOR_LM.negro, { v: 0.05 });
    l.pieza(new THREE.LatheGeometry([...plato].reverse(), 12), COLOR_LM.carbon, { p: [0, 0.003, 0] });
    l.pieza(new THREE.CylinderGeometry(0.012, 0.012, 0.26, 6), COLOR_LM.plata, { p: [0, 0.18, 0] });
  });
  // Otro brazo forrado delante, a la izquierda, con la antena de EVA en la punta.
  const b0: V3 = [-0.5, y0 + 2.45, -0.6];
  const b1: V3 = [-1.05, y0 + 2.7, -0.75];
  l.pieza(tuboArrugado(b0, b1, 0.05, rnd, 8, 4, 0.012), COLOR_LM.plata);
  l.pieza(tuboEntre(mezcla(b0, b1, 0.5), mezcla(b0, b1, 0.57), 0.058, 10), COLOR_LM.oro, { v: 0.25 });
  l.pieza(tuboEntre(b1, [-1.12, y0 + 3.25, -0.8], 0.008, 6), COLOR_LM.plata);
  for (const [dx, dz] of [
    [0.18, 0],
    [0, 0.18],
  ] as const) {
    l.pieza(tuboEntre([-1.12 - dx, y0 + 3.05, -0.8 - dz], [-1.12 + dx, y0 + 3.05, -0.8 + dz], 0.006, 5), COLOR_LM.plata);
  }
  // Antenas VHF delgadas, hacia atrás.
  for (const s of [-1, 1]) {
    l.pieza(tuboEntre([s * 0.6, y0 + 2.45, 0.7], [s * 0.85, y0 + ALTO_ASCENSO + 0.55, 0.95], 0.009, 6), COLOR_LM.plata);
    l.pieza(new THREE.CylinderGeometry(0.035, 0.045, 0.07, 8), COLOR_LM.negro, { p: [s * 0.6, y0 + 2.46, 0.7] });
  }
}

/** Ventanas triangulares, escotilla abierta con su interior dorado y blanco de acople redondo en el frente. */
function ventanasYEscotilla(l: Lote, rnd: Rnd, cabina: THREE.Mesh): void {
  const y0 = TECHO_DESCENSO;
  const haciaAtras = new THREE.Vector3(0, 0, 1);
  // Escotilla en la cara plana baja del frente.
  const escotilla = enCara(cabina, new THREE.Vector3(0, y0 + 0.66, -3), haciaAtras);
  if (escotilla) {
    sobreCara(l, escotilla.p, escotilla.n, () => {
      l.pieza(cajaBiselada(0.9, 0.9, 0.06, 0.02), COLOR_LM.negro, { p: [0, 0, 0.01] });
      manta(l, rnd, new THREE.Vector3(0, 0, 0.045), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), 0.74, 0.74, COLOR_LM.oro, 6, 6, 0.02);
      l.pieza(new THREE.BoxGeometry(0.08, 0.86, 0.05), COLOR_LM.carbon, { p: [-0.44, 0, 0.06] });
    });
  }
  // Dos ventanas triangulares en las facetas altas.
  for (const s of [-1, 1]) {
    const cara = enCara(cabina, new THREE.Vector3(s * 0.58, y0 + 1.75, -3), haciaAtras);
    if (!cara) continue;
    sobreCara(l, cara.p, cara.n, () => {
      const m = new MallaLibre();
      const i = -s * 0.22;
      const e = s * 0.24;
      m.tri(new THREE.Vector3(i, 0.2, 0.012), new THREE.Vector3(e, 0.2, 0.012), new THREE.Vector3(i, -0.22, 0.012), new THREE.Vector3(0, 0, 1));
      l.pieza(m.geometria(), COLOR_LM.lente);
      for (const [a, b] of [
        [[i, 0.22], [e + s * 0.03, 0.22]],
        [[i, 0.22], [i, -0.26]],
        [[e + s * 0.03, 0.22], [i, -0.26]],
      ] as const) {
        l.pieza(tuboEntre([a[0], a[1], 0.014], [b[0], b[1], 0.014], 0.014, 4), COLOR_LM.costura);
      }
    });
  }
  // Blanco de acople: aro con dos remaches, sobre la escotilla, en el centro del frente.
  const blanco = enCara(cabina, new THREE.Vector3(0, y0 + 1.95, -3), haciaAtras);
  if (blanco) {
    sobreCara(l, blanco.p, blanco.n, () => {
      l.pieza(new THREE.TorusGeometry(0.085, 0.018, 4, 12), COLOR_LM.costura, { p: [0, 0, 0.012] });
      for (const x of [-0.2, 0.2]) l.pieza(new THREE.CylinderGeometry(0.022, 0.022, 0.02, 8), COLOR_LM.costura, { p: [x, 0.04, 0.01], r: [Math.PI / 2, 0, 0] });
    });
  }
}

/** Grupo de propulsores RCS en la esquina (sx, sz): soporte, caja, cuatro toberas plateadas y panel de lámina. */
function rcs(l: Lote, rnd: Rnd, sx: number, sz: number, y0: number): void {
  const p: V3 = [sx * 1.7, y0 + 1.85, sz * 1.05 - 0.15];
  // Panel de lámina plateada arrugada en el costado, detrás del grupo.
  manta(l, rnd, new THREE.Vector3(sx * 1.2, y0 + 1.85, p[2]), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(sx, 0, 0), 0.5, 0.7, COLOR_LM.plata, 4, 4, 0.025);
  for (const [dy, dz] of [
    [-0.12, 0],
    [0.1, 0.12],
    [0.1, -0.12],
  ] as const) {
    l.pieza(tuboEntre([sx * 1.2, y0 + 1.85 + dy, p[2] + dz], p, 0.025, 6, false), COLOR_LM.carbon);
  }
  l.en(p, [0, 0, 0], () => {
    l.pieza(cajaBiselada(0.24, 0.24, 0.24, 0.04), COLOR_LM.plata, { v: 0.06 });
    l.pieza(new THREE.BoxGeometry(0.27, 0.06, 0.27), COLOR_LM.carbon);
    for (const [dx, dy, dz, rx, rz] of [
      [0, 0.22, 0, 0, 0],
      [0, -0.22, 0, Math.PI, 0],
      [sx * 0.22, 0, 0, 0, -sx * (Math.PI / 2)],
      [0, 0, sz * 0.22, sz * (Math.PI / 2), 0],
    ] as const) {
      l.pieza(new THREE.CylinderGeometry(0.035, 0.085, 0.2, 8, 1, true), COLOR_LM.plata, { p: [dx, dy, dz], r: [rx, 0, rz] });
      l.pieza(new THREE.CylinderGeometry(0.083, 0.033, 0.195, 8, 1, true), COLOR_LM.negro, { p: [dx, dy, dz], r: [rx, 0, rz] });
    }
  });
}
