import * as THREE from 'three';
import { ARQ, Lote, azar, cajaBiselada, placaChaflan, segmentoAnillo, tinte, tuboEntre, type ColorCara, type V3 } from './paleta';
import {
  crearAtlasV541,
  crearCaja,
  crearConsola,
  crearMuestraRoca,
  crearSaturnV,
  crearTorre,
  crearTrajeApollo,
} from './props';

// Arquitectura del museo: rotonda de 32 m con pasarela, ventanales, cúpula de planetario y vitrinas.
// Convención: X a la derecha, Y arriba, −Z hacia donde mira el jugador al inicio.

const RADIO_PARED = 16;
const LADOS = 24;
const ANCHO_BAHIA = 2 * RADIO_PARED * Math.tan(Math.PI / LADOS);
const PASO_ANGULO = (Math.PI * 2) / LADOS;
/** Hasta dónde puede caminar el jugador, medido desde el centro. */
export const RADIO_CAMINABLE = 15;
/** Radio del proyector central: está en el camino recto desde el inicio y no se puede atravesar. */
export const RADIO_PROYECTOR = 3.3;

const ALTURA_PASARELA = 5.2;
const RADIO_PASARELA = 12.6;
const VENTANA_Y0 = 5.7;
const VENTANA_Y1 = 10.5;
const ALTURA_CORNISA = 11.6;
const RADIO_CUPULA = 16.1;
/** Altura de la cúpula sobre la cornisa: mantiene el planetario dentro de lo que se ve al mirar 35° arriba. */
const ALZADO_CUPULA = 9.6;
/** Altura del plano de las órbitas del planetario. */
const ALTURA_ORBITAS = 8.9;

/** Lado del cubo de cristal de una vitrina de artefacto (m): cabe el rover a tamaño real. */
export const LADO_VITRINA = 3.5;
export const ALTURA_PEDESTAL = 0.6;

/** Coloca `fn` en el sistema local de una cara de la pared: X a lo largo, +Z hacia el centro, origen en el suelo. */
function enPared(l: Lote, angulo: number, radio: number, fn: () => void): void {
  const giro = Math.atan2(-Math.cos(angulo), -Math.sin(angulo));
  l.en([Math.cos(angulo) * radio, 0, Math.sin(angulo) * radio], [0, giro, 0], fn);
}

/** Degradado vertical de luz falsa: `abajo` en y0 y `arriba` en y1. */
function degradado(hex: number, abajo: number, arriba: number, altura: number): (p: THREE.Vector3) => THREE.Color {
  return (p) => tinte(hex, THREE.MathUtils.lerp(abajo, arriba, THREE.MathUtils.clamp(p.y / altura + 0.5, 0, 1)));
}

/** Charco de luz sobre el suelo, centrado en (x, z). */
function charco(l: Lote, x: number, z: number, radio: number, hex: number, intensidad: number): void {
  l.aditiva(
    new THREE.CircleGeometry(radio, 28),
    (p) => tinte(hex, Math.pow(Math.max(0, 1 - p.length() / radio), 2) * intensidad * 0.4),
    { p: [x, 0.035, z], r: [-Math.PI / 2, 0, 0] },
  );
}

// ---------------------------------------------------------------------------
// Suelo
// ---------------------------------------------------------------------------

function crearSuelo(l: Lote): void {
  l.pieza(new THREE.CylinderGeometry(RADIO_PARED + 0.4, RADIO_PARED + 0.4, 0.1, LADOS), ARQ.sueloBase, { p: [0, -0.06, 0] });

  // Losas radiales separadas: la junta deja ver la base oscura, como las costuras entre placas de las referencias.
  const anillos: [number, number, number][] = [
    [3.05, 6.45, 16],
    [6.55, 9.95, 24],
    [10.05, 12.95, 32],
    [13.05, RADIO_PARED, 24],
  ];
  for (const [ri, [r0, r1, n]] of anillos.entries()) {
    const paso = (Math.PI * 2) / n;
    for (let i = 0; i < n; i++) {
      const hueco = 0.03 / r0;
      const color = (i + ri) % 2 === 0 ? ARQ.suelo : ARQ.sueloClaro;
      l.pieza(segmentoAnillo(r0, r1, i * paso + hueco, (i + 1) * paso - hueco, -0.02, 0.02), color);
    }
  }

  // Rejillas alrededor del proyector, con lamas oscuras.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    l.en([Math.cos(a) * 4.7, 0.022, Math.sin(a) * 4.7], [0, -a, 0], () => {
      l.pieza(new THREE.BoxGeometry(1.5, 0.01, 1.7), ARQ.oscuro);
      for (let k = 0; k < 8; k++) {
        l.pieza(new THREE.BoxGeometry(1.34, 0.02, 0.09), ARQ.indigo, { p: [0, 0.01, -0.68 + k * 0.195] });
      }
    });
  }

  // Líneas de luz: anillos en el suelo y radios que llevan la mirada al centro.
  for (const [r, hex, intensidad] of [
    [6.5, ARQ.cian, 1.7],
    [13, ARQ.ambar, 1.9],
  ] as const) {
    for (let i = 0; i < LADOS; i++) {
      const a0 = i * PASO_ANGULO + 0.03;
      l.emisiva(segmentoAnillo(r - 0.03, r + 0.03, a0, a0 + PASO_ANGULO - 0.06, 0.02, 0.028), hex, intensidad);
    }
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    l.emisiva(segmentoAnillo(6.6, 12.9, a - 0.002, a + 0.002, 0.02, 0.026), ARQ.lila, 0.8);
  }
}

// ---------------------------------------------------------------------------
// Paredes
// ---------------------------------------------------------------------------

type TipoBahia = 'paneles' | 'ventilacion' | 'pantalla' | 'puerta';

/** Reparte tipos alrededor de la sala. Empieza en +X y gira hacia +Z. Hay puertas en sur y norte. */
function tipoDeBahia(i: number): TipoBahia {
  if (i === 5 || i === 6 || i === 17 || i === 18) return 'puerta';
  if (i % 4 === 1) return 'ventilacion';
  if (i % 4 === 3) return 'pantalla';
  return 'paneles';
}

function panelesInferiores(l: Lote, i: number): void {
  const ancho = (ANCHO_BAHIA - 1.1) / 2;
  for (const [fila, y] of [1.72, 3.42].entries()) {
    for (const [col, x] of [-ancho / 2 - 0.04, ancho / 2 + 0.04].entries()) {
      const color = (i + fila + col) % 3 === 0 ? ARQ.violeta : ARQ.purpura;
      l.pieza(placaChaflan(ancho, 1.56, 0.14, 0.16), color, { p: [x, y, 0.1] });
      l.pieza(placaChaflan(ancho * 0.68, 0.92, 0.05, 0.1), ARQ.indigo, { p: [x, y, 0.19] });
    }
  }
  l.emisiva(new THREE.BoxGeometry(0.22, 0.05, 0.02), ARQ.cian, 2.4, { p: [-ancho / 2 - 0.04, 4.06, 0.19] });
}

function ventilacion(l: Lote): void {
  l.pieza(placaChaflan(3.1, 3.3, 0.16, 0.26), ARQ.cobre, { p: [0, 2.58, 0.1] });
  l.pieza(placaChaflan(2.8, 3.0, 0.06, 0.2), ARQ.oscuro, { p: [0, 2.58, 0.2] });
  for (let k = 0; k < 12; k++) {
    l.pieza(new THREE.BoxGeometry(2.56, 0.13, 0.03), ARQ.purpura, { p: [0, 1.4 + k * 0.215, 0.26], r: [0.6, 0, 0] });
  }
}

function pantalla(l: Lote, i: number): void {
  l.pieza(placaChaflan(3.1, 3.3, 0.14, 0.26), ARQ.purpura, { p: [0, 2.58, 0.1] });
  l.pieza(placaChaflan(2.74, 2.1, 0.05, 0.16), ARQ.oscuro, { p: [0, 2.84, 0.2] });
  l.emisiva(new THREE.PlaneGeometry(2.46, 1.84), 0x07304a, 1, { p: [0, 2.84, 0.232] });
  // Gráficas abstractas: no muestran datos reales.
  for (let k = 0; k < 14; k++) {
    const alto = 0.18 + ((k * 29 + i * 17) % 11) * 0.09;
    l.emisiva(new THREE.PlaneGeometry(0.1, alto), ARQ.cian, 1.5, { p: [-1.06 + k * 0.095, 2.1 + alto / 2, 0.238] });
  }
  for (let k = 0; k < 7; k++) {
    l.emisiva(new THREE.PlaneGeometry(0.72 - (k % 2) * 0.24, 0.035), ARQ.cian, 1.4, { p: [0.6, 3.52 - k * 0.15, 0.238] });
  }
  for (let k = 0; k < 3; k++) {
    l.pieza(cajaBiselada(0.28, 0.2, 0.08, 0.02), [ARQ.ladrillo, ARQ.cobre, ARQ.dorado][k], { p: [-0.5 + k * 0.5, 1.3, 0.2] });
  }
}

function puerta(l: Lote): void {
  l.pieza(placaChaflan(3.5, 4.3, 0.22, 0.44), ARQ.cobre, { p: [0, 2.15, 0.14] });
  l.pieza(placaChaflan(3.08, 3.92, 0.12, 0.34), ARQ.oscuro, { p: [0, 2.03, 0.22] });
  for (const lado of [-1, 1]) {
    l.pieza(placaChaflan(1.34, 3.56, 0.1, 0.24), ARQ.violeta, { p: [lado * 0.71, 1.93, 0.29] });
    l.pieza(placaChaflan(0.76, 1.3, 0.05, 0.14), ARQ.indigo, { p: [lado * 0.7, 2.5, 0.35] });
    l.pieza(cajaBiselada(0.1, 0.5, 0.06, 0.012), ARQ.dorado, { p: [lado * 0.14, 1.6, 0.36] });
    l.emisiva(new THREE.BoxGeometry(0.05, 2.8, 0.03), ARQ.ambar, 2.4, { p: [lado * 1.66, 1.8, 0.3] });
  }
  // Franjas de seguridad ámbar en el umbral.
  for (let k = 0; k < 9; k++) {
    l.pieza(new THREE.BoxGeometry(0.2, 0.012, 0.75), k % 2 ? ARQ.oscuro : ARQ.dorado, { p: [-1.6 + k * 0.4, 0.03, 0.7], r: [0, 0.5, 0] });
  }
}

/** Una cara de la pared: parte baja según su tipo y ventanal arriba. */
function bahia(l: Lote, i: number): void {
  const a = i * PASO_ANGULO + PASO_ANGULO / 2;
  enPared(l, a, RADIO_PARED, () => {
    // Fondo oscuro: las juntas entre placas muestran este color.
    l.pieza(new THREE.BoxGeometry(ANCHO_BAHIA + 0.06, ALTURA_PASARELA + 0.6, 0.3), ARQ.fondoPared, { p: [0, (ALTURA_PASARELA + 0.6) / 2, -0.15] });
    l.pieza(new THREE.BoxGeometry(ANCHO_BAHIA + 0.06, ALTURA_CORNISA - VENTANA_Y1, 0.3), ARQ.fondoPared, { p: [0, (ALTURA_CORNISA + VENTANA_Y1) / 2, -0.15] });

    const tipo = tipoDeBahia(i);
    if (tipo !== 'puerta') {
      // Zócalo de ladrillo con remate de cobre.
      for (const x of [-ANCHO_BAHIA / 4, ANCHO_BAHIA / 4]) {
        l.pieza(cajaBiselada(ANCHO_BAHIA / 2 - 0.08, 0.72, 0.24, 0.04), ARQ.ladrillo, { p: [x, 0.38, 0.12] });
      }
      l.pieza(new THREE.BoxGeometry(ANCHO_BAHIA, 0.06, 0.28), ARQ.cobre, { p: [0, 0.78, 0.12] });
    }
    if (tipo === 'paneles') panelesInferiores(l, i);
    if (tipo === 'ventilacion') ventilacion(l);
    if (tipo === 'pantalla') pantalla(l, i);
    if (tipo === 'puerta') puerta(l);

    // Tuberías que recorren la pared bajo la pasarela, con abrazaderas.
    l.pieza(new THREE.CylinderGeometry(0.075, 0.075, ANCHO_BAHIA + 0.04, 6), ARQ.cobre, { p: [0, 4.56, 0.16], r: [0, 0, Math.PI / 2] });
    l.pieza(new THREE.CylinderGeometry(0.05, 0.05, ANCHO_BAHIA + 0.04, 6), ARQ.ladrilloClaro, { p: [0, 4.74, 0.14], r: [0, 0, Math.PI / 2] });
    for (const x of [-1.2, 1.2]) {
      l.pieza(new THREE.BoxGeometry(0.1, 0.34, 0.22), ARQ.oscuro, { p: [x, 4.64, 0.14] });
    }
    // Tira de luz bajo la pasarela y resplandor sobre la pared.
    l.emisiva(new THREE.BoxGeometry(ANCHO_BAHIA - 1.2, 0.05, 0.05), ARQ.cian, 2.6, { p: [0, 4.9, 0.32] });
    l.aditiva(new THREE.PlaneGeometry(ANCHO_BAHIA - 0.9, 1.5), degradado(ARQ.cian, 0, 0.05, 1.5), { p: [0, 4.15, 0.33] });
    // Luz cálida rasante desde el suelo (como los focos ámbar de las referencias).
    if (i % 2 === 0) {
      l.emisiva(new THREE.BoxGeometry(1.5, 0.05, 0.12), ARQ.ambar, 2.8, { p: [0, 0.82, 0.3] });
      l.aditiva(new THREE.PlaneGeometry(2.6, 1.6), degradado(ARQ.ambar, 0.1, 0, 1.6), { p: [0, 1.6, 0.34] });
      l.aditiva(new THREE.PlaneGeometry(2.6, 1.3), degradado(ARQ.ambar, 0, 0.06, 1.3), { p: [0, 0.15, 1.0], r: [-Math.PI / 2, 0, 0] });
    }

    // Ventanal: cristal, marco de esquinas cortadas, parteluces y línea de luz.
    const altoV = VENTANA_Y1 - VENTANA_Y0;
    const anchoV = ANCHO_BAHIA - 0.72;
    const yV = (VENTANA_Y0 + VENTANA_Y1) / 2;
    l.vidrio(new THREE.PlaneGeometry(anchoV, altoV), { p: [0, yV, -0.1] });
    for (const y of [VENTANA_Y0, VENTANA_Y1]) {
      l.pieza(cajaBiselada(anchoV + 0.2, 0.26, 0.42, 0.04), ARQ.violeta, { p: [0, y, 0] });
    }
    for (const x of [-anchoV / 2, anchoV / 2]) {
      l.pieza(cajaBiselada(0.26, altoV + 0.1, 0.42, 0.04), ARQ.violeta, { p: [x, yV, 0] });
    }
    for (const [x, y, g] of [
      [-1, 1, -1],
      [1, 1, 1],
      [-1, -1, 1],
      [1, -1, -1],
    ] as const) {
      l.pieza(new THREE.BoxGeometry(0.8, 0.2, 0.3), ARQ.lila, {
        p: [(x * anchoV) / 2 - x * 0.25, yV + (y * altoV) / 2 - y * 0.25, 0.08],
        r: [0, 0, (g * Math.PI) / 4],
      });
    }
    l.pieza(new THREE.BoxGeometry(0.09, altoV, 0.14), ARQ.purpura, { p: [0, yV, -0.04] });
    l.pieza(new THREE.BoxGeometry(anchoV, 0.09, 0.14), ARQ.purpura, { p: [0, 8.9, -0.04] });
    l.emisiva(new THREE.BoxGeometry(anchoV - 0.5, 0.035, 0.035), ARQ.cian, 2.4, { p: [0, VENTANA_Y0 + 0.15, 0.22] });
    l.emisiva(new THREE.BoxGeometry(anchoV - 0.5, 0.035, 0.035), ARQ.dorado, 2.1, { p: [0, VENTANA_Y1 - 0.15, 0.22] });
  });

  // Pilastra entre dos caras: atraviesa suelo, pasarela y ventanal.
  const b = i * PASO_ANGULO;
  enPared(l, b, RADIO_PARED - 0.05, () => {
    l.pieza(placaChaflan(1.0, ALTURA_PASARELA, 0.7, 0.14), ARQ.violeta, { p: [0, ALTURA_PASARELA / 2, 0.25] });
    l.pieza(placaChaflan(0.74, ALTURA_CORNISA - ALTURA_PASARELA, 0.6, 0.12), ARQ.purpura, { p: [0, (ALTURA_PASARELA + ALTURA_CORNISA) / 2, 0.2] });
    for (const y of [0.1, 4.82, ALTURA_PASARELA + 0.2, ALTURA_CORNISA - 0.2]) {
      l.pieza(cajaBiselada(1.1, 0.2, 0.84, 0.03), y > 5 ? ARQ.cobre : ARQ.ladrillo, { p: [0, y, 0.26] });
    }
    l.emisiva(new THREE.BoxGeometry(0.1, 1.7, 0.03), i % 2 === 0 ? ARQ.ambar : ARQ.cian, 2.2, { p: [0, 2.6, 0.62] });
    l.pieza(new THREE.BoxGeometry(0.26, 2.0, 0.03), ARQ.oscuro, { p: [0, 2.6, 0.6] });
    // Tubo vertical con codos.
    l.pieza(tuboEntre([0.46, 0.2, 0.42], [0.46, 4.5, 0.42], 0.045), ARQ.cobre);
    l.pieza(tuboEntre([0.46, 4.5, 0.42], [0.46, 4.55, 0.2], 0.045), ARQ.cobre);
  });
}

// ---------------------------------------------------------------------------
// Pasarela
// ---------------------------------------------------------------------------

function crearPasarela(l: Lote): void {
  const y = ALTURA_PASARELA;
  for (let i = 0; i < LADOS; i++) {
    const a0 = i * PASO_ANGULO;
    const a1 = a0 + PASO_ANGULO;
    const h = 0.012;
    // Cubierta en dos placas separadas, cara inferior y canto de ladrillo y cobre.
    l.pieza(segmentoAnillo(RADIO_PASARELA + 0.1, 14.2, a0 + h, a1 - h, y - 0.1, y), ARQ.violeta);
    l.pieza(segmentoAnillo(14.25, RADIO_PARED - 0.1, a0 + h, a1 - h, y - 0.1, y), ARQ.purpura);
    l.pieza(segmentoAnillo(RADIO_PASARELA + 0.15, RADIO_PARED - 0.1, a0, a1, y - 0.4, y - 0.1), ARQ.indigo);
    l.pieza(segmentoAnillo(RADIO_PASARELA, RADIO_PASARELA + 0.26, a0, a1, y - 0.56, y + 0.1), ARQ.ladrillo);
    l.pieza(segmentoAnillo(RADIO_PASARELA - 0.03, RADIO_PASARELA + 0.02, a0 + 0.012, a1 - 0.012, y - 0.42, y - 0.02), ARQ.cobre);
    // Línea de luz en el canto y plafones bajo la pasarela.
    l.emisiva(segmentoAnillo(RADIO_PASARELA - 0.05, RADIO_PASARELA - 0.02, a0 + 0.03, a1 - 0.03, y - 0.28, y - 0.2), ARQ.cian, 2.7);
    l.emisiva(segmentoAnillo(13.7, 14.1, a0 + 0.08, a1 - 0.08, y - 0.44, y - 0.4), ARQ.dorado, 1.7);

    // Barandilla: postes, pasamanos y una tira de luz.
    for (const a of [a0, a0 + PASO_ANGULO / 2]) {
      const x = Math.cos(a) * (RADIO_PASARELA + 0.12);
      const z = Math.sin(a) * (RADIO_PASARELA + 0.12);
      l.pieza(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 4), ARQ.cobre, { p: [x, y + 0.55, z] });
    }
    l.pieza(segmentoAnillo(RADIO_PASARELA + 0.08, RADIO_PASARELA + 0.16, a0, a1, y + 1.08, y + 1.14), ARQ.cobre);
    l.pieza(segmentoAnillo(RADIO_PASARELA + 0.1, RADIO_PASARELA + 0.14, a0, a1, y + 0.58, y + 0.62), ARQ.ladrilloClaro);
    l.emisiva(segmentoAnillo(RADIO_PASARELA + 0.09, RADIO_PASARELA + 0.15, a0 + 0.015, a1 - 0.015, y + 1.05, y + 1.07), ARQ.cian, 2.2);
  }

  // Columnas de apoyo desde el suelo: la pasarela no flota (spec visual §6).
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + PASO_ANGULO / 2;
    const [x, z] = [Math.cos(a) * (RADIO_PASARELA + 0.35), Math.sin(a) * (RADIO_PASARELA + 0.35)];
    l.pieza(new THREE.CylinderGeometry(0.28, 0.3, y - 0.3, 8), ARQ.violeta, { p: [x, (y - 0.3) / 2, z], r: [0, a, 0] });
    l.pieza(new THREE.CylinderGeometry(0.46, 0.56, 0.32, 8), ARQ.ladrillo, { p: [x, 0.16, z], r: [0, a, 0] });
    l.pieza(new THREE.CylinderGeometry(0.34, 0.34, 0.14, 8), ARQ.cobre, { p: [x, 0.92, z], r: [0, a, 0] });
    l.pieza(new THREE.CylinderGeometry(0.34, 0.34, 0.14, 8), ARQ.cobre, { p: [x, y - 0.8, z], r: [0, a, 0] });
    l.pieza(new THREE.CylinderGeometry(0.5, 0.3, 0.38, 8), ARQ.purpura, { p: [x, y - 0.52, z], r: [0, a, 0] });
    l.emisiva(new THREE.TorusGeometry(0.34, 0.02, 4, 8), ARQ.ambar, 2.4, { p: [x, 0.36, z], r: [Math.PI / 2, 0, 0] });
    charco(l, x, z, 2.2, ARQ.ambar, 0.2);
  }
}

// ---------------------------------------------------------------------------
// Cúpula del planetario
// ---------------------------------------------------------------------------

/** Punto de la cúpula para un azimut y una elevación (0 = cornisa, π/2 = cima). */
function puntoCupula(azimut: number, elevacion: number, radio = RADIO_CUPULA): V3 {
  return [
    Math.cos(azimut) * Math.cos(elevacion) * radio,
    ALTURA_CORNISA + Math.sin(elevacion) * ALZADO_CUPULA * (radio / RADIO_CUPULA),
    Math.sin(azimut) * Math.cos(elevacion) * radio,
  ];
}

function crearCupula(l: Lote): void {
  // Cornisa escalonada.
  for (let i = 0; i < LADOS; i++) {
    const a0 = i * PASO_ANGULO;
    const a1 = a0 + PASO_ANGULO;
    l.pieza(segmentoAnillo(14.9, RADIO_PARED + 0.2, a0, a1, ALTURA_CORNISA - 0.3, ALTURA_CORNISA), ARQ.cobre);
    l.pieza(segmentoAnillo(15.2, RADIO_PARED + 0.2, a0, a1, ALTURA_CORNISA - 0.6, ALTURA_CORNISA - 0.3), ARQ.ladrillo);
    l.emisiva(segmentoAnillo(14.86, 14.92, a0 + 0.02, a1 - 0.02, ALTURA_CORNISA - 0.2, ALTURA_CORNISA - 0.12), ARQ.dorado, 3);
  }

  // Bóveda facetada, sin iluminar: es la pantalla del planetario. Cuanto más alto, más azul.
  const boveda = new THREE.SphereGeometry(RADIO_CUPULA, LADOS, 7, 0, Math.PI * 2, 0, Math.PI / 2);
  boveda.scale(1, ALZADO_CUPULA / RADIO_CUPULA, 1);
  const noIndexada = boveda.toNonIndexed();
  // Por dentro: se invierte el orden de los vértices de cada triángulo.
  const pos = noIndexada.getAttribute('position');
  for (let i = 0; i < pos.count; i += 3) {
    const [x, y, z] = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    pos.setXYZ(i, pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2));
    pos.setXYZ(i + 2, x, y, z);
  }
  const colorBoveda: ColorCara = (c) => (c.y > 6.5 ? 0x2c2a8a : c.y > 3 ? 0x2c1c7e : 0x2b1468);
  l.emisiva(noIndexada, colorBoveda, 0.2, { p: [0, ALTURA_CORNISA, 0], v: 0.55 });

  // Nervios de luz y paralelos.
  const elevaciones = [0, 0.3, 0.6, 0.9, 1.15, 1.34];
  for (let i = 0; i < 12; i++) {
    const az = (i / 12) * Math.PI * 2;
    for (let k = 0; k < elevaciones.length - 1; k++) {
      l.emisiva(tuboEntre(puntoCupula(az, elevaciones[k], RADIO_CUPULA - 0.1), puntoCupula(az, elevaciones[k + 1], RADIO_CUPULA - 0.1), 0.022, 4), i % 2 ? ARQ.cian : ARQ.magenta, 0.55);
    }
  }
  for (const [elevacion, hex] of [
    [0.6, ARQ.lila],
    [1.15, ARQ.cian],
    [1.34, ARQ.dorado],
  ] as const) {
    const n = 24;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      l.emisiva(tuboEntre(puntoCupula(a0, elevacion, RADIO_CUPULA - 0.1), puntoCupula(a1, elevacion, RADIO_CUPULA - 0.1), 0.022, 4), hex, 0.75);
    }
  }
}

/** Estrellas de la bóveda. Son decorativas: no reproducen ninguna constelación real. */
function crearEstrellasCupula(): THREE.Points {
  const rnd = azar(99);
  const n = 1400;
  const posiciones = new Float32Array(n * 3);
  const colores = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const az = rnd() * Math.PI * 2;
    const el = Math.asin(rnd() * 0.97);
    const p = puntoCupula(az, el, RADIO_CUPULA - 0.2);
    posiciones.set(p, i * 3);
    const brillo = 0.7 + Math.pow(rnd(), 4) * 3.2;
    const calor = rnd();
    colores.set([brillo, brillo * (0.86 + calor * 0.12), brillo * (1.05 - calor * 0.3)], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(posiciones, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colores, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.11, vertexColors: true, fog: false, sizeAttenuation: true }));
}

interface Planeta {
  radio: number;
  orbita: number;
  /** Velocidad en vueltas por minuto: rápidas por dentro, lentas por fuera (no a escala). */
  vuelta: number;
  fase: number;
  color: ColorCara;
  anillo?: boolean;
}

/** Bandas horizontales según la altura de la cara. */
const bandas = (radio: number, colores: readonly number[], n: number): ColorCara => (c) => {
  const f = THREE.MathUtils.clamp((c.y + radio) / (2 * radio), 0, 0.999);
  return colores[Math.floor(f * n) % colores.length];
};

/** Los ocho planetas, en su orden real y con su color aproximado. Tamaños y órbitas no están a escala. */
const PLANETAS: readonly Planeta[] = [
  { radio: 0.18, orbita: 2.4, vuelta: 0.9, fase: 0.4, color: 0x9a8c7c },
  { radio: 0.27, orbita: 3.1, vuelta: 0.6, fase: 2.2, color: 0xe6c58a },
  {
    radio: 0.3,
    orbita: 3.9,
    vuelta: 0.45,
    fase: 4.1,
    color: (c) => {
      if (Math.abs(c.y) > 0.25) return 0xeef4f8;
      return Math.sin(c.x * 22) + Math.sin(c.z * 19 + c.y * 12) > 0.45 ? 0x4d8f47 : 0x2467c6;
    },
  },
  { radio: 0.22, orbita: 4.7, vuelta: 0.34, fase: 5.5, color: (c) => (c.y > 0.17 ? 0xefe7dc : 0xc1502e) },
  { radio: 0.72, orbita: 5.9, vuelta: 0.2, fase: 1.1, color: bandas(0.72, [0xd8a878, 0xeed6b0, 0xb5764a, 0xe6c295], 9) },
  { radio: 0.58, orbita: 7.05, vuelta: 0.13, fase: 3.2, color: bandas(0.58, [0xe5cf9b, 0xd9bb80, 0xefe0b8], 7), anillo: true },
  { radio: 0.4, orbita: 8.0, vuelta: 0.09, fase: 0.2, color: 0x9fd8dc },
  { radio: 0.38, orbita: 8.75, vuelta: 0.07, fase: 2.7, color: 0x3f5fd0 },
];

function crearSistemaSolar(): { objeto: THREE.Group; actualizar: (t: number) => void } {
  const raiz = new THREE.Group();
  raiz.position.y = ALTURA_ORBITAS;

  const fijo = new Lote();
  // Sol central, varilla hasta la cima de la cúpula y órbitas.
  fijo.emisiva(new THREE.IcosahedronGeometry(0.95, 2), 0xffb347, 3.2, { v: 0.25 });
  fijo.pieza(tuboEntre([0, 1, 0], [0, ALTURA_CORNISA + ALZADO_CUPULA - ALTURA_ORBITAS, 0], 0.07), ARQ.cobre);
  for (const planeta of PLANETAS) {
    const r = planeta.orbita;
    const n = 64;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      fijo.emisiva(segmentoAnillo(r - 0.012, r + 0.012, a, a + (Math.PI * 2) / n, -0.008, 0.008), 0xd9a6ff, 0.3);
    }
  }
  raiz.add(fijo.construir());

  const brazos: { objeto: THREE.Group; planeta: Planeta }[] = [];
  for (const [i, planeta] of PLANETAS.entries()) {
    const l = new Lote();
    l.pieza(new THREE.BoxGeometry(planeta.orbita, 0.022, 0.022), i % 2 ? ARQ.cobre : ARQ.ladrillo, { p: [planeta.orbita / 2, 0, 0] });
    l.en([planeta.orbita, 0, 0], [0.2, 0, 0.12], () => {
      l.pieza(new THREE.IcosahedronGeometry(planeta.radio, 2), planeta.color, { v: 0.14 });
      if (planeta.anillo) {
        l.pieza(new THREE.RingGeometry(planeta.radio * 1.3, planeta.radio * 2.05, 24), 0xcdb58c, { r: [-Math.PI / 2, 0, 0], v: 0.2 });
        l.pieza(new THREE.RingGeometry(planeta.radio * 1.3, planeta.radio * 2.05, 24), 0xcdb58c, { r: [Math.PI / 2, 0, 0], v: 0.2 });
      }
    });
    const objeto = l.construir();
    objeto.rotation.y = planeta.fase;
    raiz.add(objeto);
    brazos.push({ objeto, planeta });
  }

  return {
    objeto: raiz,
    actualizar(t) {
      for (const { objeto, planeta } of brazos) {
        objeto.rotation.y = planeta.fase + (t / 60) * planeta.vuelta * Math.PI * 2;
      }
    },
  };
}

/** Proyector del planetario en el centro de la sala, con su cono de luz hacia el sol. */
function crearProyector(l: Lote): void {
  l.pieza(new THREE.CylinderGeometry(2.95, 3.05, 0.2, 16), ARQ.purpura, { p: [0, 0.1, 0] });
  l.pieza(new THREE.CylinderGeometry(2.3, 2.5, 0.28, 16), ARQ.violeta, { p: [0, 0.34, 0] });
  l.pieza(new THREE.CylinderGeometry(1.5, 1.7, 0.3, 12), ARQ.ladrillo, { p: [0, 0.62, 0] });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const a1 = a + Math.PI / 8;
    l.emisiva(segmentoAnillo(2.76, 2.86, a + 0.02, a1 - 0.02, 0.2, 0.22), ARQ.cian, 2.8);
    l.emisiva(segmentoAnillo(2.1, 2.16, a + 0.02, a1 - 0.02, 0.48, 0.5), ARQ.ambar, 2.6);
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    l.pieza(tuboEntre([Math.cos(a) * 1.2, 0.7, Math.sin(a) * 1.2], [Math.cos(a) * 0.3, 2.6, Math.sin(a) * 0.3], 0.045), ARQ.cobre);
  }
  l.pieza(new THREE.CylinderGeometry(0.26, 0.42, 2.0, 8), ARQ.purpura, { p: [0, 1.7, 0] });
  l.pieza(new THREE.CylinderGeometry(0.5, 0.34, 0.26, 8), ARQ.cobre, { p: [0, 2.74, 0] });
  // Esfera de proyección, facetada y con lentes.
  l.pieza(new THREE.IcosahedronGeometry(0.72, 1), ARQ.indigo, { p: [0, 3.5, 0] });
  const lentes = new THREE.IcosahedronGeometry(0.73, 0).getAttribute('position');
  const puntos = new Set<string>();
  for (let i = 0; i < lentes.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(lentes, i);
    const clave = v.toArray().map((n) => n.toFixed(2)).join();
    if (puntos.has(clave)) continue;
    puntos.add(clave);
    l.emisiva(new THREE.IcosahedronGeometry(0.06, 0), ARQ.cian, 2.4, { p: [v.x, 3.5 + v.y, v.z] });
  }
  // Cono de luz volumétrica falsa, de la esfera al sol.
  const alto = ALTURA_ORBITAS - 4.2 - 0.9;
  l.aditiva(new THREE.CylinderGeometry(1.25, 0.65, alto, 12, 1, true), degradado(ARQ.cian, 0.045, 0.005, alto), { p: [0, 4.2 + alto / 2, 0] });
  charco(l, 0, 0, 6.8, ARQ.cian, 0.2);
}

// ---------------------------------------------------------------------------
// Vitrinas y expositores
// ---------------------------------------------------------------------------

interface OpcionesVitrina {
  lado: number;
  alturaPedestal: number;
  acento: number;
  contenido: () => void;
  /** Giro del contenido dentro del cubo. */
  giro?: number;
}

/** Vitrina: pedestal octogonal, anillo de color, cubo de cristal con bordes cian, techo y luz interior. */
function vitrinaEnLote(l: Lote, o: OpcionesVitrina): void {
  const { lado, alturaPedestal: h, acento } = o;
  const radio = lado * 0.76;
  const y1 = h + lado;
  const c = lado / 2;
  const grosor = lado * 0.008;

  l.pieza(new THREE.CylinderGeometry(radio * 1.08, radio * 1.14, h * 0.32, 8), ARQ.ladrillo, { p: [0, h * 0.16, 0], r: [0, Math.PI / 8, 0] });
  l.pieza(new THREE.CylinderGeometry(radio * 0.98, radio * 1.02, h * 0.68, 8), ARQ.violeta, { p: [0, h * 0.66, 0], r: [0, Math.PI / 8, 0] });
  l.pieza(new THREE.BoxGeometry(lado * 1.02, h * 0.1, lado * 1.02), ARQ.indigo, { p: [0, h * 0.97, 0] });
  // Anillo de color en el pedestal y en el suelo.
  l.emisiva(new THREE.TorusGeometry(radio * 1.0, lado * 0.006, 4, 24), acento, 2.2, { p: [0, h * 1.0, 0], r: [Math.PI / 2, 0, 0] });
  l.emisiva(new THREE.TorusGeometry(radio * 1.22, lado * 0.007, 4, 24), acento, 2.2, { p: [0, 0.04, 0], r: [Math.PI / 2, 0, 0] });
  charco(l, 0, 0, radio * 2.2, acento, 0.34);

  // Cubo de cristal.
  l.vidrio(new THREE.BoxGeometry(lado, lado, lado), { p: [0, h + c, 0] });
  // Bordes cian: doce aristas emisivas sobre un marco oscuro.
  for (const [x, z] of [
    [-c, -c],
    [c, -c],
    [c, c],
    [-c, c],
  ]) {
    l.pieza(new THREE.BoxGeometry(grosor * 3, lado, grosor * 3), ARQ.oscuro, { p: [x, h + c, z] });
    l.emisiva(new THREE.BoxGeometry(grosor, lado, grosor), ARQ.cian, 2.4, { p: [x * 1.01, h + c, z * 1.01] });
  }
  for (const y of [h + 0.02, y1]) {
    for (const s of [-1, 1]) {
      l.emisiva(new THREE.BoxGeometry(lado, grosor, grosor), ARQ.cian, 2.4, { p: [0, y, s * c * 1.01] });
      l.emisiva(new THREE.BoxGeometry(grosor, grosor, lado), ARQ.cian, 2.4, { p: [s * c * 1.01, y, 0] });
    }
  }
  // Techo de la vitrina con plafón del color de acento.
  l.pieza(cajaBiselada(lado * 1.04, lado * 0.05, lado * 1.04, lado * 0.012), ARQ.purpura, { p: [0, y1 + lado * 0.03, 0] });
  l.emisiva(new THREE.BoxGeometry(lado * 0.3, lado * 0.008, lado * 0.3), acento, 0.8, { p: [0, y1 - lado * 0.004, 0] });
  // Resplandor interior: luz falsa que sube desde el pedestal.
  for (let i = 0; i < 4; i++) {
    const g = (i / 4) * Math.PI * 2;
    l.en([0, h + c, 0], [0, g, 0], () => {
      l.aditiva(new THREE.PlaneGeometry(lado * 0.98, lado * 0.98), degradado(acento, 0.035, 0.004, lado * 0.98), { p: [0, 0, c * 0.97] });
    });
  }

  l.en([0, h + 0.04, 0], [0, o.giro ?? 0, 0], o.contenido);
}

/**
 * Vitrina de un artefacto seleccionable. La luz interior es casi blanca para que el artefacto muestre su color
 * real; el acento va en los anillos. El cursor solo prueba contra un volumen invisible.
 */
export function crearVitrinaArtefacto(contenido: (l: Lote) => void, acento: number, giro: number): THREE.Object3D {
  const l = new Lote();
  vitrinaEnLote(l, {
    lado: LADO_VITRINA,
    alturaPedestal: ALTURA_PEDESTAL,
    acento,
    contenido: () => contenido(l),
    giro,
  });
  const grupo = l.construir();
  grupo.traverse((objeto) => {
    objeto.raycast = () => {};
  });

  const luz = new THREE.PointLight(0xffffff, 8, LADO_VITRINA * 2.3, 1.7);
  // Adelantada hacia el lado por el que llega el jugador, para iluminar la cara que ve.
  luz.position.set(0, ALTURA_PEDESTAL + LADO_VITRINA * 0.72, LADO_VITRINA * 0.42);
  grupo.add(luz);

  const alto = ALTURA_PEDESTAL + LADO_VITRINA;
  const volumen = new THREE.Mesh(
    new THREE.BoxGeometry(LADO_VITRINA, alto, LADO_VITRINA),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  volumen.position.y = alto / 2;
  grupo.add(volumen);
  return grupo;
}

/** Cápsula de cristal con un traje vacío dentro. */
function capsula(l: Lote, comandante: boolean, acento: number): void {
  const alto = 2.5;
  const radio = 0.82;
  l.pieza(new THREE.CylinderGeometry(radio + 0.2, radio + 0.3, 0.3, 12), ARQ.violeta, { p: [0, 0.15, 0] });
  l.pieza(new THREE.CylinderGeometry(radio + 0.3, radio + 0.3, 0.04, 12), ARQ.cobre, { p: [0, 0.31, 0] });
  l.emisiva(new THREE.TorusGeometry(radio + 0.08, 0.02, 4, 16), acento, 3, { p: [0, 0.34, 0], r: [Math.PI / 2, 0, 0] });
  l.vidrio(new THREE.CylinderGeometry(radio, radio, alto, 12, 1, true), { p: [0, 0.33 + alto / 2, 0] });
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i / 4) * Math.PI * 2;
    l.pieza(new THREE.BoxGeometry(0.1, alto, 0.1), ARQ.oscuro, { p: [Math.cos(a) * (radio + 0.02), 0.33 + alto / 2, Math.sin(a) * (radio + 0.02)], r: [0, -a, 0] });
    l.emisiva(new THREE.BoxGeometry(0.02, alto, 0.02), ARQ.cian, 2.4, { p: [Math.cos(a) * (radio - 0.05), 0.33 + alto / 2, Math.sin(a) * (radio - 0.05)] });
  }
  l.pieza(new THREE.CylinderGeometry(radio * 0.82, radio + 0.14, 0.3, 12), ARQ.purpura, { p: [0, 0.33 + alto + 0.15, 0] });
  l.emisiva(new THREE.CylinderGeometry(radio * 0.6, radio * 0.6, 0.02, 12), acento, 1.4, { p: [0, 0.33 + alto - 0.01, 0] });
  l.aditiva(new THREE.CylinderGeometry(radio - 0.02, radio - 0.02, alto, 12, 1, true), degradado(acento, 0.035, 0.008, alto), { p: [0, 0.33 + alto / 2, 0] });
  charco(l, 0, 0, 2.3, acento, 0.28);
  l.en([0, 0.33, 0], [0, 0, 0], () => crearTrajeApollo(l, comandante));
}

/** Peana con un cohete a escala, anillo de color y torre de servicio de cobre. */
function expositorCohete(l: Lote, cohete: () => void, altura: number, acento: number): void {
  l.pieza(new THREE.CylinderGeometry(1.25, 1.4, 0.34, 10), ARQ.ladrillo, { p: [0, 0.17, 0] });
  l.pieza(new THREE.CylinderGeometry(1.0, 1.08, 0.3, 10), ARQ.violeta, { p: [0, 0.49, 0] });
  l.emisiva(new THREE.TorusGeometry(1.2, 0.022, 4, 24), acento, 3, { p: [0, 0.36, 0], r: [Math.PI / 2, 0, 0] });
  l.emisiva(new THREE.TorusGeometry(1.55, 0.026, 4, 24), acento, 3, { p: [0, 0.04, 0], r: [Math.PI / 2, 0, 0] });
  charco(l, 0, 0, 3.6, acento, 0.32);
  // La torre va detrás, sin tocar el cohete: es mobiliario del museo, no una réplica de la torre real.
  const x = -0.95;
  const z = -0.72;
  for (const [dx, dz] of [
    [-0.15, -0.15],
    [0.15, -0.15],
    [0.15, 0.15],
    [-0.15, 0.15],
  ]) {
    l.pieza(tuboEntre([x + dx, 0.34, z + dz], [x + dx, altura + 0.3, z + dz], 0.018, 4), ARQ.cobre);
  }
  for (let y = 0.8; y < altura + 0.3; y += 0.7) {
    l.pieza(new THREE.BoxGeometry(0.34, 0.03, 0.34), ARQ.ladrillo, { p: [x, y, z] });
  }
  l.emisiva(new THREE.IcosahedronGeometry(0.035, 0), ARQ.ladrilloClaro, 4, { p: [x, altura + 0.34, z] });
  l.en([0, 0.64, 0], [0, 0, 0], cohete);
}

/** Globo facetado sobre peana. */
function expositorGlobo(l: Lote, radio: number, color: ColorCara, acento: number): void {
  l.pieza(new THREE.CylinderGeometry(0.62, 0.74, 0.28, 8), ARQ.ladrillo, { p: [0, 0.14, 0] });
  l.pieza(new THREE.CylinderGeometry(0.38, 0.52, 0.72, 8), ARQ.violeta, { p: [0, 0.64, 0] });
  l.pieza(new THREE.CylinderGeometry(0.46, 0.38, 0.1, 8), ARQ.cobre, { p: [0, 1.05, 0] });
  l.emisiva(new THREE.TorusGeometry(0.56, 0.018, 4, 16), acento, 3, { p: [0, 1.08, 0], r: [Math.PI / 2, 0, 0] });
  l.emisiva(new THREE.TorusGeometry(0.86, 0.018, 4, 20), acento, 3, { p: [0, 0.04, 0], r: [Math.PI / 2, 0, 0] });
  charco(l, 0, 0, 1.9, acento, 0.3);
  l.pieza(new THREE.IcosahedronGeometry(radio, 2), color, { p: [0, 1.14 + radio, 0], v: 0.16 });
}

/** Coloca `fn` en (x, z), girado para mirar hacia el centro de la sala (su +Z apunta al centro). */
function mirandoAlCentro(l: Lote, x: number, z: number, fn: () => void): void {
  l.en([x, 0, z], [0, Math.atan2(-x, -z), 0], fn);
}

/** Haces de luz cálida que entran por los ventanales del oeste. */
function crearHaces(l: Lote): void {
  for (const a of [Math.PI * 0.93, Math.PI * 1.07, Math.PI * 1.21, Math.PI * 0.79, Math.PI * 1.35]) {
    const desde = new THREE.Vector3(Math.cos(a) * 15.5, 9.6, Math.sin(a) * 15.5);
    const hasta = new THREE.Vector3(Math.cos(a) * 7, 0.02, Math.sin(a) * 7);
    const largo = desde.distanceTo(hasta);
    const medio = desde.clone().add(hasta).multiplyScalar(0.5);
    const q = new THREE.Object3D();
    q.position.copy(medio);
    q.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), desde.clone().sub(hasta).normalize());
    l.aditiva(new THREE.PlaneGeometry(2.6, largo), degradado(ARQ.ambar, 0.002, 0.035, largo), {
      p: medio.toArray(),
      r: [q.rotation.x, q.rotation.y, q.rotation.z],
    });
  }
}

/** La sala completa con su decoración. Lo seleccionable (vitrinas de artefacto) va aparte, en sus propios nodos. */
export function crearRotonda(): THREE.Object3D {
  const l = new Lote();
  crearSuelo(l);
  for (let i = 0; i < LADOS; i++) bahia(l, i);
  crearPasarela(l);
  crearCupula(l);
  crearProyector(l);
  crearHaces(l);

  // Cohetes reales a la misma escala 1:13, al fondo de la sala.
  l.en([-6.5, 0, -9], [0, 0.5, 0], () => expositorCohete(l, () => crearSaturnV(l), 9.1, ARQ.violeta));
  l.en([6.5, 0, -9], [0, -0.5, 0], () => expositorCohete(l, () => crearAtlasV541(l), 5.1, ARQ.ambar));

  // Globos de los dos mundos de las misiones, con colores aproximados a los reales.
  l.en([-9.4, 0, 6.3], [0, 0, 0], () =>
    expositorGlobo(l, 0.72, (c) => (Math.sin(c.x * 6.1 + c.y * 3.2) + Math.sin(c.z * 5.3 - c.y * 4.1) > 0.8 ? 0x6e6a66 : 0xa8a49c), ARQ.cian),
  );
  l.en([9.4, 0, 6.3], [0, 0, 0], () =>
    expositorGlobo(l, 0.62, (c) => (c.y > 0.5 ? 0xefe7dc : Math.sin(c.x * 7 + c.z * 4) > 0.35 ? 0x7f3a22 : 0xc1502e), ARQ.ambar),
  );

  // Trajes de Apollo 17 en cápsulas: el del comandante lleva franjas rojas. Sin figuras humanas (spec visual §4).
  mirandoAlCentro(l, 10.1, -3.4, () => capsula(l, true, ARQ.cian));
  mirandoAlCentro(l, 11.1, 0.6, () => capsula(l, false, ARQ.ambar));

  // Laboratorio: consolas en arco al oeste y al sur.
  mirandoAlCentro(l, -11.1, -2.2, () => crearConsola(l, 1));
  mirandoAlCentro(l, -10.1, -5.6, () => crearConsola(l, 2));
  mirandoAlCentro(l, -8.2, 10.1, () => crearConsola(l, 3));
  mirandoAlCentro(l, -11.0, 7.5, () => crearConsola(l, 4));

  // Muestras de roca en vitrinas pequeñas. No son seleccionables.
  for (const [x, z, semilla, color, acento] of [
    [-2.9, -5.4, 4, 0x8a857c, ARQ.cian],
    [2.9, -5.4, 8, 0x8c4a30, ARQ.ambar],
  ] as const) {
    l.en([x, 0, z], [0, 0, 0], () => {
      vitrinaEnLote(l, {
        lado: 1.0,
        alturaPedestal: 0.85,
        acento,
        contenido: () => crearMuestraRoca(l, semilla, color),
      });
    });
  }

  // Equipo y torre de comunicaciones cerca de la pared sureste.
  l.en([10.2, 0, 9.0], [0, 0, 0], () => crearTorre(l));
  const cajas: [number, number, number, number, number][] = [
    [8.0, 11.3, 0.6, ARQ.ladrillo, ARQ.cian],
    [6.6, 12.2, 0.2, ARQ.purpura, ARQ.ambar],
    [13.2, 5.6, 1.1, ARQ.cobre, ARQ.cian],
    [-13.6, 3.3, -1.3, ARQ.ladrillo, ARQ.ambar],
    [-13.4, -7.1, -0.5, ARQ.purpura, ARQ.cian],
    [12.6, -7.7, 0.9, ARQ.ladrillo, ARQ.ambar],
  ];
  for (const [x, z, giro, color, acento] of cajas) {
    l.en([x, 0, z], [0, giro, 0], () => crearCaja(l, color, acento));
  }

  const grupo = l.construir();
  const sistemaSolar = crearSistemaSolar();
  // Luz neutra compartida por las dos cápsulas, para que los trajes se vean blancos.
  const luzTrajes = new THREE.PointLight(0xffffff, 12, 6, 1.7);
  luzTrajes.position.set(9.7, 2.9, -1.2);
  grupo.add(crearEstrellasCupula(), sistemaSolar.objeto, luzTrajes);
  grupo.userData.actualizar = sistemaSolar.actualizar;
  return grupo;
}
