import * as THREE from 'three';
import { HIST, Lote, cajaBiselada, tuboEntre, type V3 } from './paleta';

// Lunar Roving Vehicle de Apollo 17 para la escena lunar, low poly. Frente hacia −Z, origen en el suelo y centrado.
// Solo lleva lo que tenía el LRV real: chasis de tubo de aluminio en tres secciones, ruedas de malla de acero con
// chevrones de titanio, guardabarros de fibra, dos asientos de tubo y red, mando en T entre los asientos, consola,
// baterías en la sección delantera, unidad de comunicaciones (LCRU), cámara de TV, antenas y portaherramientas.
// Sin techo ni puertas.
//
// Medidas (Wikipedia, "Lunar Roving Vehicle", a partir de la NASA y Boeing): largo 10 ft (3.05 m), batalla 7.5 ft
// (2.29 m), alto 3.6 ft (1.1 m); ruedas de 32 in (0.81 m) de diámetro y 9 in (0.23 m) de ancho, malla de cuerdas de
// acero cincado con chevrones de titanio sobre el 50 % del área de contacto; mando en T entre los dos asientos.

const RADIO_RUEDA = 0.4064;
const ANCHO_RUEDA = 0.2286;
export const BATALLA_LRV = 2.286;
/** Vía (distancia entre ruedas de un mismo eje). // VERIFICAR: 6 ft (1.83 m) según varias fuentes; no está en Wikipedia. */
export const VIA_LRV = 1.83;
/** Altura del bastidor (m). // VERIFICAR: altura libre de 14 in (0.36 m) bajo el chasis. */
const Y_BASTIDOR = 0.42;
const MEDIO_ANCHO_BASTIDOR = 0.57;
const Z_FRENTE = -1.52;
const Z_COLA = 1.52;
/** Asientos: el comandante, que conducía, a la izquierda (−X); el mando queda a su derecha. */
const X_ASIENTO = 0.31;
const Y_ASIENTO = 0.62;
const Z_ASIENTO = 0.15;

/** Posición de los ojos del comandante sentado, en ejes del LRV (m). */
export const OJOS_COMANDANTE: V3 = [-X_ASIENTO, Y_ASIENTO + 0.82, Z_ASIENTO + 0.08];
/** Centros de las cuatro ruedas (x, z), para apoyar el LRV en el suelo. */
export const RUEDAS_LRV: readonly (readonly [number, number])[] = [
  [-VIA_LRV / 2, -BATALLA_LRV / 2],
  [VIA_LRV / 2, -BATALLA_LRV / 2],
  [-VIA_LRV / 2, BATALLA_LRV / 2],
  [VIA_LRV / 2, BATALLA_LRV / 2],
];


/** Rueda de malla: banda tejida con chevrones en V, buje de aluminio y el interior oscuro visto a través de la malla. */
function rueda(l: Lote, x: number, z: number): void {
  const lado = Math.sign(x);
  l.en([x, RADIO_RUEDA, z], [0, 0, 0], () => {
    // Banda de malla: las tapas se ven oscuras, como el bastidor interior visto a través del tejido.
    const banda = new THREE.CylinderGeometry(RADIO_RUEDA, RADIO_RUEDA, ANCHO_RUEDA, 20);
    l.pieza(banda, (c) => (Math.abs(c.y) > ANCHO_RUEDA / 2 - 0.001 ? HIST.consola : HIST.malla), { r: [0, 0, Math.PI / 2], v: 0.22 });
    // Chevrones de titanio: dos placas en V por paso, cubriendo la mitad de la banda.
    const pasos = 18;
    for (let i = 0; i < pasos; i++) {
      const a = (i / pasos) * Math.PI * 2;
      for (const s of [-1, 1]) {
        l.en([0, Math.cos(a) * (RADIO_RUEDA + 0.006), Math.sin(a) * (RADIO_RUEDA + 0.006)], [a, 0, 0], () => {
          l.pieza(new THREE.BoxGeometry(ANCHO_RUEDA * 0.52, 0.008, 0.035), HIST.chevron, { p: [s * ANCHO_RUEDA * 0.24, 0, 0], r: [0, s * 0.5, 0] });
        });
      }
    }
    // Buje de aluminio repujado y motor de tracción en el cubo.
    l.pieza(new THREE.CylinderGeometry(0.15, 0.17, 0.04, 10), HIST.aluminio, { p: [lado * (ANCHO_RUEDA / 2 + 0.01), 0, 0], r: [0, 0, Math.PI / 2] });
    l.pieza(new THREE.CylinderGeometry(0.11, 0.11, 0.16, 8), HIST.plateado, { p: [-lado * (ANCHO_RUEDA / 2 + 0.05), 0, 0], r: [0, 0, Math.PI / 2] });
  });
}

/** Guardabarros de fibra: arco de placas sobre la rueda, con extensiones delante y detrás. */
function guardabarros(l: Lote, x: number, z: number): void {
  const radio = RADIO_RUEDA + 0.075;
  const tramos = 7;
  const desde = -1.15;
  const hasta = 1.15;
  const paso = (hasta - desde) / tramos;
  for (let i = 0; i < tramos; i++) {
    const a = desde + paso * (i + 0.5);
    const largo = 2 * radio * Math.sin(paso / 2) + 0.01;
    l.pieza(new THREE.BoxGeometry(ANCHO_RUEDA + 0.08, 0.012, largo), HIST.guardabarros, {
      p: [x, RADIO_RUEDA + Math.cos(a) * radio, z + Math.sin(a) * radio],
      r: [a, 0, 0],
      v: 0.06,
    });
  }
}

/** Suspensión de doble brazo: del bastidor al cubo de la rueda. */
function suspension(l: Lote, x: number, z: number): void {
  const lado = Math.sign(x);
  const cubo = lado * (Math.abs(x) - ANCHO_RUEDA / 2 - 0.08);
  for (const [y, apertura] of [
    [Y_BASTIDOR - 0.05, 0.28],
    [Y_BASTIDOR + 0.08, 0.2],
  ] as const) {
    for (const s of [-1, 1]) {
      l.pieza(tuboEntre([lado * MEDIO_ANCHO_BASTIDOR, y, z + s * apertura], [cubo, RADIO_RUEDA + (y - Y_BASTIDOR) * 0.4, z], 0.017, 5), HIST.aluminio);
    }
  }
  // Barra de torsión a lo largo del bastidor.
  l.pieza(tuboEntre([lado * MEDIO_ANCHO_BASTIDOR, Y_BASTIDOR - 0.05, z - 0.3], [lado * MEDIO_ANCHO_BASTIDOR, Y_BASTIDOR - 0.05, z + 0.3], 0.025, 6), HIST.plateado);
}

/** Bastidor de tubo en tres secciones (delantera, central y trasera), con travesaños y suelo en la central. */
function bastidor(l: Lote): void {
  const w = MEDIO_ANCHO_BASTIDOR;
  for (const x of [-w, w]) {
    l.pieza(tuboEntre([x, Y_BASTIDOR, Z_FRENTE], [x, Y_BASTIDOR, Z_COLA], 0.026, 6), HIST.aluminio);
    l.pieza(tuboEntre([x, Y_BASTIDOR + 0.12, -0.62], [x, Y_BASTIDOR + 0.12, 0.62], 0.02, 6), HIST.aluminio);
    for (const z of [-0.62, 0, 0.62]) l.pieza(tuboEntre([x, Y_BASTIDOR, z], [x, Y_BASTIDOR + 0.12, z], 0.016, 5), HIST.aluminio);
  }
  for (const z of [Z_FRENTE, -1.05, -0.62, 0, 0.62, 1.05, Z_COLA]) {
    l.pieza(tuboEntre([-w, Y_BASTIDOR, z], [w, Y_BASTIDOR, z], 0.02, 6), HIST.aluminio);
  }
  // Suelo de la sección central, de paneles de aluminio con nervios.
  l.pieza(cajaBiselada(2 * w - 0.04, 0.02, 1.2, 0.005), HIST.aluminio, { p: [0, Y_BASTIDOR + 0.02, 0], v: 0.05 });
  for (const x of [-0.4, -0.2, 0, 0.2, 0.4]) {
    l.pieza(new THREE.BoxGeometry(0.02, 0.015, 1.18), HIST.plateado, { p: [x, Y_BASTIDOR + 0.035, 0] });
  }
}

/** Dos asientos plegables de tubo con red, reposapiés y el reposabrazos central. */
function asientos(l: Lote): void {
  for (const x of [-X_ASIENTO, X_ASIENTO]) {
    // Red del asiento y del respaldo.
    l.pieza(cajaBiselada(0.44, 0.03, 0.42, 0.01), HIST.asiento, { p: [x, Y_ASIENTO, Z_ASIENTO], v: 0.05 });
    l.pieza(cajaBiselada(0.44, 0.46, 0.03, 0.01), HIST.asiento, { p: [x, Y_ASIENTO + 0.26, Z_ASIENTO + 0.25], r: [-0.25, 0, 0], v: 0.05 });
    // Marco de tubo.
    for (const s of [-1, 1]) {
      const xs = x + s * 0.22;
      l.pieza(tuboEntre([xs, Y_BASTIDOR + 0.12, Z_ASIENTO - 0.2], [xs, Y_ASIENTO, Z_ASIENTO - 0.2], 0.012, 5), HIST.aluminio);
      l.pieza(tuboEntre([xs, Y_ASIENTO, Z_ASIENTO - 0.21], [xs, Y_ASIENTO, Z_ASIENTO + 0.21], 0.012, 5), HIST.aluminio);
      l.pieza(tuboEntre([xs, Y_BASTIDOR + 0.12, Z_ASIENTO + 0.22], [xs, Y_ASIENTO + 0.5, Z_ASIENTO + 0.36], 0.012, 5), HIST.aluminio);
    }
    // Cinturón: una cinta cruzada sobre el asiento.
    l.pieza(new THREE.BoxGeometry(0.05, 0.006, 0.44), HIST.antena, { p: [x, Y_ASIENTO + 0.02, Z_ASIENTO], r: [0, 0.6, 0] });
    // Reposapiés delante del asiento, en la parte delantera de la sección central.
    l.pieza(cajaBiselada(0.34, 0.015, 0.16, 0.005), HIST.aluminio, { p: [x, Y_BASTIDOR + 0.1, -0.5], r: [0.45, 0, 0] });
  }
  // Reposabrazos central.
  l.pieza(cajaBiselada(0.08, 0.05, 0.4, 0.01), HIST.asiento, { p: [0, Y_ASIENTO + 0.15, Z_ASIENTO + 0.05] });
  l.pieza(tuboEntre([0, Y_BASTIDOR + 0.12, Z_ASIENTO + 0.05], [0, Y_ASIENTO + 0.13, Z_ASIENTO + 0.05], 0.014, 5), HIST.aluminio);
}

/** Mando en T entre los asientos (a la derecha del comandante) y consola de control y presentación. */
function mandos(l: Lote): void {
  // Mando en T: palanca vertical y empuñadura transversal, delante del reposabrazos.
  const base: V3 = [0, Y_ASIENTO + 0.1, Z_ASIENTO - 0.2];
  const cima: V3 = [0, Y_ASIENTO + 0.32, Z_ASIENTO - 0.24];
  l.pieza(cajaBiselada(0.1, 0.06, 0.12, 0.01), HIST.consola, { p: base });
  l.pieza(tuboEntre(base, cima, 0.014, 6), HIST.negro);
  l.pieza(tuboEntre([-0.075, cima[1], cima[2]], [0.075, cima[1], cima[2]], 0.016, 6), HIST.negro);
  // Consola sobre un poste, inclinada hacia el conductor.
  l.pieza(tuboEntre([0, Y_BASTIDOR + 0.02, -0.56], [0, 0.98, -0.62], 0.022, 6), HIST.aluminio);
  l.en([0, 1.05, -0.63], [-0.3, 0, 0], () => {
    l.pieza(cajaBiselada(0.4, 0.3, 0.06, 0.012), HIST.consola);
    // Indicadores: esferas y medidores claros sobre el panel.
    for (const [x, y] of [
      [-0.11, 0.06],
      [0.0, 0.07],
      [0.11, 0.06],
      [-0.1, -0.07],
      [0.1, -0.07],
    ] as const) {
      l.pieza(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 8), HIST.antena, { p: [x, y, 0.035], r: [Math.PI / 2, 0, 0] });
    }
    // Dispositivo de sombra solar para la navegación, encima del panel.
    l.pieza(new THREE.BoxGeometry(0.08, 0.04, 0.05), HIST.aluminio, { p: [0, 0.17, 0] });
  });
}

/** Sección delantera: baterías, electrónica, LCRU, cámara de TV y antenas. Sección trasera: portaherramientas. */
function equipos(l: Lote, haciaTierraLocal: THREE.Vector3): void {
  const y = Y_BASTIDOR + 0.02;
  // Dos baterías de plata-zinc bajo sus cubiertas, en la sección delantera. // VERIFICAR: color de las cubiertas.
  for (const x of [-0.28, 0.28]) {
    l.pieza(cajaBiselada(0.44, 0.17, 0.42, 0.015), HIST.plateado, { p: [x, y + 0.09, -0.92] });
    l.pieza(cajaBiselada(0.46, 0.02, 0.44, 0.006), HIST.cubierta, { p: [x, y + 0.19, -0.92] });
  }
  // Electrónica de mando (DCE) y unidad de procesado de señales (SPU).
  l.pieza(cajaBiselada(0.9, 0.12, 0.3, 0.015), HIST.aluminio, { p: [0, y + 0.07, -1.3] });
  // Unidad de comunicaciones (LCRU) delante.
  l.pieza(cajaBiselada(0.48, 0.3, 0.28, 0.02), HIST.antena, { p: [0, y + 0.3, -1.38] });
  // Cámara de televisión en color sobre su mástil, mirando hacia delante.
  l.pieza(tuboEntre([0, y + 0.45, -1.4], [0, 1.18, -1.44], 0.016, 5), HIST.aluminio);
  l.pieza(cajaBiselada(0.14, 0.14, 0.3, 0.015), HIST.antena, { p: [0, 1.26, -1.46] });
  l.pieza(new THREE.CylinderGeometry(0.035, 0.05, 0.09, 8), HIST.lente, { p: [0, 1.26, -1.65], r: [Math.PI / 2, 0, 0] });
  // Antena de alta ganancia (paraguas de malla) en su mástil, apuntando a la Tierra con el LRV estacionado.
  const cimaMastil: V3 = [-0.3, 1.62, -1.3];
  l.pieza(tuboEntre([-0.3, y + 0.3, -1.3], cimaMastil, 0.016, 5), HIST.aluminio);
  const giro = new THREE.Euler().setFromQuaternion(
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), haciaTierraLocal.clone().normalize()),
  );
  l.en(cimaMastil, [giro.x, giro.y, giro.z], () => {
    // Cono cerrado con el vértice hacia el mástil: la tapa hace de cara cóncava del plato.
    l.pieza(new THREE.ConeGeometry(0.46, 0.17, 12), HIST.antena, { p: [0, 0.09, 0], r: [Math.PI, 0, 0], v: 0.05 });
    l.pieza(new THREE.CylinderGeometry(0.01, 0.01, 0.3, 4), HIST.lente, { p: [0, 0.2, 0] });
  });
  // Antena de baja ganancia, helicoidal, en el lado derecho.
  l.pieza(tuboEntre([0.3, y + 0.35, -1.32], [0.3, 1.55, -1.36], 0.022, 6), HIST.antena);
  // Portaherramientas trasero: bandeja con bolsas de muestras y mangos de herramientas (pinzas, pala, rastrillo).
  l.pieza(cajaBiselada(0.95, 0.28, 0.5, 0.02), HIST.aluminio, { p: [0, y + 0.18, 1.18] });
  l.pieza(cajaBiselada(0.4, 0.22, 0.25, 0.02), HIST.asiento, { p: [-0.22, y + 0.42, 1.12] });
  for (const [x, inclinacion] of [
    [0.1, 0.15],
    [0.25, 0.25],
    [0.38, 0.1],
  ] as const) {
    l.pieza(tuboEntre([x, y + 0.2, 1.35], [x, y + 0.95, 1.35 + inclinacion], 0.012, 5), HIST.aluminio);
  }
}

/** Construye el LRV. `haciaTierraLocal`: dirección de la Tierra en ejes del LRV, para su antena de alta ganancia. */
export function crearLRVLuna(haciaTierraLocal: THREE.Vector3): THREE.Group {
  const l = new Lote(false);
  bastidor(l);
  for (const [x, z] of RUEDAS_LRV) {
    rueda(l, x, z);
    guardabarros(l, x, z);
    suspension(l, x, z);
  }
  asientos(l);
  mandos(l);
  equipos(l, haciaTierraLocal);
  const grupo = l.construir();
  grupo.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  return grupo;
}
