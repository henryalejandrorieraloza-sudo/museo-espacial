import * as THREE from 'three';
import { HIST, Lote, cajaBiselada, tuboEntre, type V3 } from './paleta';

// Módulo lunar Challenger (LM-12) de Apollo 17, low poly. Frente (escotilla, plataforma y escalera) hacia −Z.
// Origen en el suelo, en el centro del módulo.
//
// Medidas (Wikipedia, "Apollo Lunar Module", a partir de los datos de Grumman y la NASA):
// - Etapa de ascenso: 2.83 m de alto, 4.29 m de ancho y 4.04 m de fondo.
// - Etapa de descenso: 3.23 m de alto; 4.22 m de ancho y fondo sin el tren; 9.45 m de pata a pata con el tren abierto.
// - Altura total con el tren extendido: ~7.0 m.
// - La pata 1 (delantera) lleva la plataforma ("porch") y la escalera; las sondas de contacto de 1.7 m solo iban en
//   las patas 2, 3 y 4, y se doblaban al posarse, por eso no se dibujan.
// El reparto de las piezas de la etapa de ascenso (cabina, tanques, propulsores, antenas) es aproximado:
// // VERIFICAR contra los planos de Grumman si se quiere más detalle.

/** Etapa de descenso: ancho entre caras opuestas del octógono (m) y altura de su cuerpo. */
const ANCHO_DESCENSO = 4.22;
const BASE_DESCENSO = 1.55;
const TECHO_DESCENSO = 3.2;
/** Distancia del centro a cada pie (m): 9.45 m de punta a punta menos el radio del pie. */
const RADIO_PIES = 4.25;
/** Pie de cada pata: plato de ~0.94 m de diámetro. // VERIFICAR: 37 pulgadas según la mayoría de fuentes. */
const RADIO_PIE = 0.47;
/** Altura de la etapa de ascenso (m). */
const ALTO_ASCENSO = 2.83;

/** Construye el LM. `haciaTierraLocal` orienta la antena de banda S orientable hacia la Tierra (en ejes del LM). */
export function crearModuloLunar(haciaTierraLocal: THREE.Vector3): THREE.Group {
  const l = new Lote(false);
  etapaDescenso(l);
  etapaAscenso(l, haciaTierraLocal);
  const grupo = l.construir();
  grupo.name = 'lm_challenger';
  grupo.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  return grupo;
}

function etapaDescenso(l: Lote): void {
  const alto = TECHO_DESCENSO - BASE_DESCENSO;
  // Octógono con las caras largas hacia los ejes (las patas salen del centro de cada cara).
  const radioOcto = ANCHO_DESCENSO / 2 / Math.cos(Math.PI / 8);
  const cuerpo = new THREE.CylinderGeometry(radioOcto, radioOcto, alto, 8);
  cuerpo.rotateY(Math.PI / 8);
  // Mantas de Kapton: ámbar en las caras de los ejes, ámbar oscuro y amarillo en las esquinas; base negra y techo plata.
  const colorCara = (c: THREE.Vector3): number => {
    if (c.y > alto / 2 - 0.01) return HIST.plateado;
    if (c.y < -alto / 2 + 0.01) return HIST.negro;
    // Cara del octógono (0–7): las pares miran a los ejes; las esquinas alternan ámbar oscuro y amarillo.
    const cara = (Math.round(Math.atan2(c.z, c.x) / (Math.PI / 4)) + 8) % 8;
    if (cara % 2 === 0) return HIST.kaptonAmbar;
    return cara % 4 === 1 ? HIST.kaptonOscuro : HIST.kaptonAmarillo;
  };
  l.pieza(cuerpo, colorCara, { p: [0, BASE_DESCENSO + alto / 2, 0], v: 0.28 });
  // Paneles sueltos de manta sobre las caras: el aspecto arrugado del Kapton.
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const d = ANCHO_DESCENSO / 2 + 0.03;
    for (const [dx, dy, w, h, color] of [
      [-0.55, 0.25, 0.9, 0.8, HIST.kaptonAmarillo],
      [0.6, -0.2, 0.8, 0.9, HIST.kaptonOscuro],
      [0, -0.55, 1.6, 0.35, HIST.negro],
    ] as const) {
      l.en([Math.sin(a) * d, BASE_DESCENSO + alto / 2, Math.cos(a) * d], [0, a, 0], () => {
        l.pieza(cajaBiselada(w, h, 0.05, 0.015), color, { p: [dx, dy, 0], v: 0.3 });
      });
    }
  }
  // Tobera del motor de descenso, bajo el cuerpo.
  l.pieza(new THREE.CylinderGeometry(0.42, 0.78, 0.95, 12, 1, true), HIST.toberaDescenso, { p: [0, BASE_DESCENSO - 0.47, 0] });
  l.pieza(new THREE.CylinderGeometry(0.6, 0.6, 0.12, 12), HIST.negro, { p: [0, BASE_DESCENSO - 0.03, 0] });

  // Cuatro patas: puntal principal, dos puntales secundarios y pie. La pata 1 (delantera) mira a −Z.
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const dir = new THREE.Vector3(Math.sin(a), 0, -Math.cos(a));
    const lado = new THREE.Vector3(dir.z, 0, -dir.x);
    const punto = (radial: number, y: number, lateral = 0): V3 => [
      dir.x * radial + lado.x * lateral,
      y,
      dir.z * radial + lado.z * lateral,
    ];
    const arriba = punto(ANCHO_DESCENSO / 2 - 0.15, TECHO_DESCENSO - 0.25);
    const pie = punto(RADIO_PIES, 0.32);
    l.pieza(tuboEntre(arriba, pie, 0.085, 8), HIST.kaptonAmbar, { v: 0.2 });
    // Amortiguador: tramo más grueso junto al pie.
    const medioPie: V3 = [pie[0] + (arriba[0] - pie[0]) * 0.3, pie[1] + (arriba[1] - pie[1]) * 0.3, pie[2] + (arriba[2] - pie[2]) * 0.3];
    l.pieza(tuboEntre(pie, medioPie, 0.065, 8), HIST.plateado);
    const union: V3 = [pie[0] + (arriba[0] - pie[0]) * 0.42, pie[1] + (arriba[1] - pie[1]) * 0.42, pie[2] + (arriba[2] - pie[2]) * 0.42];
    for (const s of [-1, 1]) {
      l.pieza(tuboEntre(punto(ANCHO_DESCENSO / 2 - 0.1, BASE_DESCENSO + 0.1, s * 1.0), union, 0.04, 6), HIST.plateado);
      l.pieza(tuboEntre(punto(ANCHO_DESCENSO / 2 - 0.1, BASE_DESCENSO + 0.9, s * 1.05), union, 0.03, 6), HIST.aluminio);
    }
    // Pie: plato poco profundo, algo hundido en el regolito.
    l.pieza(new THREE.CylinderGeometry(RADIO_PIE, RADIO_PIE * 0.72, 0.2, 12), HIST.plateado, { p: [pie[0], 0.06, pie[2]], v: 0.1 });
    l.pieza(new THREE.CylinderGeometry(0.1, 0.1, 0.16, 8), HIST.aluminio, { p: [pie[0], 0.22, pie[2]] });

    if (i === 0) plataformaYEscalera(l, arriba, pie);
  }
}

/** Plataforma ("porch") delante de la escotilla y escalera sobre el puntal de la pata delantera. */
function plataformaYEscalera(l: Lote, arriba: V3, pie: V3): void {
  const yPlataforma = TECHO_DESCENSO - 0.12;
  l.pieza(cajaBiselada(0.95, 0.05, 0.8, 0.01), HIST.aluminio, { p: [0, yPlataforma, -ANCHO_DESCENSO / 2 - 0.35] });
  for (const x of [-0.46, 0.46]) {
    l.pieza(tuboEntre([x, yPlataforma, -ANCHO_DESCENSO / 2], [x, yPlataforma + 0.75, -ANCHO_DESCENSO / 2 - 0.55], 0.015, 5), HIST.aluminio);
  }
  // Escalera: dos largueros paralelos al puntal, un poco por delante, y peldaños cada ~23 cm.
  const eje = new THREE.Vector3(...pie).sub(new THREE.Vector3(...arriba));
  const largo = eje.length();
  eje.normalize();
  const delante = new THREE.Vector3(0, -eje.z, eje.y).normalize().multiplyScalar(0.13);
  const punto = (t: number, x: number): V3 => {
    const p = new THREE.Vector3(...arriba).addScaledVector(eje, t).add(delante);
    return [x, p.y, p.z];
  };
  // El último peldaño queda alto sobre el pie: el tren se comprimió menos de lo previsto (Wikipedia, ALSJ).
  const tFin = (arriba[1] - 0.95) / (arriba[1] - pie[1]);
  for (const x of [-0.24, 0.24]) l.pieza(tuboEntre(punto(0, x), punto(largo * tFin, x), 0.018, 5), HIST.aluminio);
  for (let t = 0.12; t < largo * tFin; t += 0.3) {
    l.pieza(tuboEntre(punto(t, -0.24), punto(t, 0.24), 0.014, 5), HIST.aluminio);
  }
}

function etapaAscenso(l: Lote, haciaTierraLocal: THREE.Vector3): void {
  const y0 = TECHO_DESCENSO;
  // Cabina: cilindro de 2.34 m de diámetro con el eje hacia delante, y la cara frontal con ventanas y escotilla.
  // La cara frontal es un prisma facetado que se estrecha hacia arriba, con las ventanas en los chaflanes.
  l.pieza(new THREE.CylinderGeometry(1.17, 1.17, 1.15, 10), HIST.ascensoGris, { p: [0, y0 + 1.3, -0.85], r: [Math.PI / 2, 0, 0], v: 0.08 });
  l.pieza(new THREE.CylinderGeometry(0.85, 1.12, 0.3, 6), HIST.ascensoGris, { p: [0, y0 + 1.25, -1.42], r: [Math.PI / 2, Math.PI / 6, 0], e: [1, 1, 1.05], v: 0.1 });
  // Escotilla delantera (cuadrada, ~0.81 m) sobre la plataforma.
  l.pieza(cajaBiselada(0.82, 0.82, 0.05, 0.02), HIST.plateado, { p: [0, y0 + 0.62, -1.53] });
  l.pieza(new THREE.BoxGeometry(0.16, 0.04, 0.05), HIST.negro, { p: [0.25, y0 + 0.62, -1.57] });
  // Dos ventanas triangulares inclinadas.
  for (const s of [-1, 1]) {
    const ventana = new THREE.CylinderGeometry(0.42, 0.42, 0.04, 3);
    l.pieza(ventana, HIST.lente, { p: [s * 0.52, y0 + 1.72, -1.5], r: [Math.PI / 2 - 0.35, 0, s * 0.5 + Math.PI] });
  }
  // Sección media, bahía de equipos de popa y parte alta oscura alrededor del túnel de acople.
  l.pieza(cajaBiselada(2.7, 1.95, 1.55, 0.06), HIST.ascensoGris, { p: [0, y0 + 1.15, 0.3], v: 0.08 });
  // Bahía de equipos de popa: bastidor gris con depósitos y cajas de equipo oscuros.
  l.pieza(cajaBiselada(2.1, 1.25, 0.6, 0.05), HIST.ascensoGris, { p: [0, y0 + 1.0, 1.3], v: 0.08 });
  for (const x of [-0.6, 0.6]) {
    l.pieza(new THREE.CylinderGeometry(0.24, 0.24, 1.0, 8), HIST.plateado, { p: [x, y0 + 1.0, 1.72], v: 0.08 });
  }
  l.pieza(cajaBiselada(0.7, 0.5, 0.35, 0.03), HIST.ascensoOscuro, { p: [0, y0 + 0.75, 1.72] });
  l.pieza(cajaBiselada(0.7, 0.35, 0.3, 0.03), HIST.kaptonAmbar, { p: [0, y0 + 1.35, 1.7], v: 0.2 });
  l.pieza(cajaBiselada(1.9, 0.4, 1.9, 0.05), HIST.ascensoOscuro, { p: [0, y0 + 2.25, -0.1], v: 0.12 });
  // Túnel de acople y radar de encuentro delante.
  l.pieza(new THREE.CylinderGeometry(0.42, 0.45, 0.4, 10), HIST.ascensoGris, { p: [0, y0 + 2.6, -0.2] });
  l.en([0, y0 + 2.45, -1.15], [-0.6, 0, 0], () => {
    l.pieza(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 6), HIST.aluminio, { p: [0, 0.15, 0] });
    l.pieza(new THREE.ConeGeometry(0.32, 0.12, 10), HIST.plateado, { p: [0, 0.34, 0], r: [Math.PI, 0, 0] });
  });
  // Tanques de propulsante a los lados (oxidante a la izquierda y combustible a la derecha), en bultos redondeados.
  for (const s of [-1, 1]) {
    l.pieza(new THREE.IcosahedronGeometry(0.66, 1), HIST.ascensoGris, { p: [s * 1.38, y0 + 0.95, 0.35], e: [0.85, 1, 1.05], v: 0.1 });
  }
  // Cuatro grupos de propulsores RCS en las esquinas: bloque con cuatro toberas.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const p: V3 = [sx * 1.68, y0 + 1.85, sz * 1.15 - 0.15];
      l.pieza(tuboEntre([sx * 1.25, y0 + 1.75, p[2]], p, 0.04, 5), HIST.aluminio);
      l.en(p, [0, 0, 0], () => {
        l.pieza(cajaBiselada(0.22, 0.22, 0.22, 0.02), HIST.plateado);
        for (const [dx, dy, dz, rx, rz] of [
          [0, 0.18, 0, 0, 0],
          [0, -0.18, 0, Math.PI, 0],
          [sx * 0.18, 0, 0, 0, -sx * (Math.PI / 2)],
          [0, 0, sz * 0.18, sz * (Math.PI / 2), 0],
        ] as const) {
          l.pieza(new THREE.CylinderGeometry(0.035, 0.065, 0.14, 6), HIST.negro, { p: [dx, dy, dz], r: [rx, 0, rz] });
        }
      });
    }
  }
  // Antena de banda S orientable, apuntando a la Tierra (era la que enlazaba con Houston).
  const baseAntena: V3 = [1.05, y0 + 2.35, 0.2];
  const cima: V3 = [1.3, y0 + 3.05, 0.2];
  l.pieza(tuboEntre(baseAntena, cima, 0.035, 6), HIST.aluminio);
  const orientacion = new THREE.Euler().setFromQuaternion(
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), haciaTierraLocal.clone().normalize()),
  );
  l.en(cima, [orientacion.x, orientacion.y, orientacion.z], () => {
    l.pieza(new THREE.ConeGeometry(0.33, 0.12, 12), HIST.antena, { p: [0, 0.06, 0], r: [Math.PI, 0, 0] });
    l.pieza(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 5), HIST.negro, { p: [0, 0.14, 0] });
  });
  // Antenas VHF.
  for (const s of [-1, 1]) {
    l.pieza(tuboEntre([s * 0.75, y0 + 2.45, 0.9], [s * 0.95, y0 + ALTO_ASCENSO + 0.5, 1.1], 0.012, 4), HIST.antena);
  }
}
