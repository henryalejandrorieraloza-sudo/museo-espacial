import * as THREE from 'three';
import { ARQ, HIST, Lote, cajaBiselada, geometriaRoca, placaChaflan, tinte, tuboEntre, type V3 } from './paleta';

// Objetos del museo, construidos en un Lote. Origen en el suelo y centrados.
// Los objetos históricos usan formas simplificadas y proporciones aproximadas a partir de datos públicos;
// no son planos oficiales (ver MODELS.md). Los colores vienen de HIST, no de la paleta de la arquitectura.

const giroX = Math.PI / 2;

/** Rueda con el eje en X. Los tacos giran alrededor del eje. */
function rueda(l: Lote, p: V3, radio: number, ancho: number, cuerpo: number, taco: number, tacos: number): void {
  l.en(p, [0, 0, 0], () => {
    l.pieza(new THREE.CylinderGeometry(radio, radio, ancho, 14), cuerpo, { r: [0, 0, giroX] });
    l.pieza(new THREE.CylinderGeometry(radio * 0.42, radio * 0.42, ancho * 1.08, 8), HIST.negro, { r: [0, 0, giroX] });
    for (let i = 0; i < tacos; i++) {
      const a = (i / tacos) * Math.PI * 2;
      l.pieza(new THREE.BoxGeometry(ancho * 0.86, radio * 0.05, radio * 0.09), taco, {
        p: [0, Math.cos(a) * (radio + 0.004), Math.sin(a) * (radio + 0.004)],
        r: [a, 0, 0],
      });
    }
  });
}

/**
 * Lunar Roving Vehicle de Apollo 17. Frente hacia −Z.
 * Unos 3.1 m de largo, chasis en tres secciones, cuatro ruedas de malla con chevrones, dos asientos,
 * mando en T entre ellos, antena parabólica, antena helicoidal y cámara de televisión.
 */
export function crearLRVExhibicion(l: Lote): void {
  const y = 0.53;
  l.pieza(cajaBiselada(1.16, 0.1, 1.2, 0.02), HIST.aluminio, { p: [0, y, 0] });
  l.pieza(cajaBiselada(1.16, 0.26, 0.78, 0.03), HIST.aluminio, { p: [0, y + 0.06, -1.0] });
  l.pieza(cajaBiselada(1.1, 0.08, 0.76, 0.02), HIST.aluminio, { p: [0, y, 0.98] });
  // Cubiertas de las baterías sobre la sección delantera.
  for (const x of [-0.29, 0.29]) {
    l.pieza(cajaBiselada(0.48, 0.04, 0.6, 0.012), HIST.cubierta, { p: [x, y + 0.21, -1.02] });
  }

  // Ruedas, guardabarros y brazos de suspensión.
  for (const x of [-0.92, 0.92]) {
    for (const z of [-1.15, 1.15]) {
      rueda(l, [x, 0.41, z], 0.41, 0.23, HIST.malla, HIST.chevron, 14);
      l.pieza(tuboEntre([Math.sign(x) * 0.56, y, z * 0.72], [x * 0.85, 0.41, z], 0.022), HIST.aluminio);
      l.pieza(tuboEntre([Math.sign(x) * 0.56, y + 0.12, z * 0.82], [x * 0.85, 0.41, z], 0.018), HIST.aluminio);
      for (let k = -2; k <= 2; k++) {
        const a = (k / 2) * 0.85;
        l.pieza(new THREE.BoxGeometry(0.27, 0.012, 0.21), HIST.asiento, {
          p: [x, 0.41 + Math.cos(a) * 0.47, z + Math.sin(a) * 0.47],
          r: [a, 0, 0],
        });
      }
    }
  }

  // Dos asientos plegables de tubo y red, con reposapiés.
  for (const x of [-0.29, 0.29]) {
    l.pieza(cajaBiselada(0.46, 0.05, 0.46, 0.012), HIST.asiento, { p: [x, y + 0.13, 0.12] });
    l.pieza(cajaBiselada(0.46, 0.48, 0.05, 0.012), HIST.asiento, { p: [x, y + 0.36, 0.38], r: [-0.2, 0, 0] });
    for (const lado of [-0.23, 0.23]) {
      l.pieza(tuboEntre([x + lado, y + 0.05, 0.38], [x + lado, y + 0.6, 0.48], 0.012, 5), HIST.aluminio);
      l.pieza(tuboEntre([x + lado, y + 0.05, -0.12], [x + lado, y + 0.13, 0.36], 0.012, 5), HIST.aluminio);
    }
    l.pieza(new THREE.BoxGeometry(0.34, 0.015, 0.14), HIST.aluminio, { p: [x, y + 0.08, -0.5], r: [0.4, 0, 0] });
  }

  // Mando en T y consola de control entre los asientos.
  l.pieza(tuboEntre([0, y + 0.05, 0.02], [0, y + 0.34, -0.06], 0.02), HIST.negro);
  l.pieza(tuboEntre([-0.08, y + 0.35, -0.06], [0.08, y + 0.35, -0.06], 0.014), HIST.negro);
  l.pieza(tuboEntre([0, y + 0.05, -0.42], [0, y + 0.42, -0.42], 0.02), HIST.aluminio);
  l.pieza(cajaBiselada(0.34, 0.26, 0.06, 0.012), HIST.negro, { p: [0, y + 0.56, -0.44], r: [0.25, 0, 0] });

  // Antena parabólica en mástil, helicoidal y cámara de televisión.
  l.pieza(tuboEntre([-0.28, y + 0.2, -0.95], [-0.28, 1.72, -0.95], 0.015), HIST.aluminio);
  // Plato de malla, tipo paraguas: se orienta hacia delante, con nervios y un alimentador en el centro.
  l.en([-0.28, 1.76, -0.95], [2.2, 0, 0], () => {
    l.pieza(new THREE.ConeGeometry(0.46, 0.17, 12), HIST.antena);
    l.pieza(new THREE.CylinderGeometry(0.34, 0.34, 0.006, 12), HIST.aluminio, { p: [0, -0.09, 0] });
    for (let i = 0; i < 6; i++) {
      l.pieza(new THREE.BoxGeometry(0.9, 0.008, 0.012), HIST.lente, { p: [0, -0.095, 0], r: [0, (i / 6) * Math.PI, 0] });
    }
    l.pieza(new THREE.CylinderGeometry(0.012, 0.012, 0.26, 5), HIST.lente, { p: [0, -0.21, 0] });
  });
  l.pieza(tuboEntre([0.28, y + 0.2, -0.95], [0.28, 1.55, -0.95], 0.014), HIST.antena);
  l.pieza(tuboEntre([0, y + 0.2, -1.2], [0, 1.2, -1.2], 0.014), HIST.aluminio);
  l.pieza(cajaBiselada(0.13, 0.13, 0.28, 0.012), HIST.aluminio, { p: [0, 1.26, -1.22] });
  l.pieza(new THREE.CylinderGeometry(0.035, 0.05, 0.08, 8), HIST.lente, { p: [0, 1.26, -1.38], r: [giroX, 0, 0] });
  // Unidad de comunicaciones y portaherramientas trasero.
  l.pieza(cajaBiselada(0.42, 0.2, 0.3, 0.02), HIST.cubierta, { p: [0.24, y + 0.3, -0.92] });
  l.pieza(cajaBiselada(0.9, 0.34, 0.5, 0.025), HIST.aluminio, { p: [0, y + 0.22, 1.08] });
}

/**
 * Perseverance (Mars 2020). Frente hacia −Z. Unos 3 m de largo, 2.7 m de ancho y 2.2 m de alto.
 * Seis ruedas con suspensión de balancín, mástil con cámaras, brazo con torreta,
 * generador radioisotópico (MMRTG) atrás y antena de alta ganancia en la cubierta.
 */
export function crearPerseveranceExhibicion(l: Lote): void {
  const yCuerpo = 0.93;
  l.pieza(cajaBiselada(1.55, 0.5, 1.95, 0.04), HIST.blancoRover, { p: [0, yCuerpo, 0] });
  l.pieza(cajaBiselada(1.62, 0.06, 2.02, 0.015), HIST.aluminio, { p: [0, yCuerpo + 0.27, 0] });
  // Placas y detalles sobre el cuerpo.
  for (const [x, z, w, f] of [
    [-0.4, -0.4, 0.5, 0.55],
    [0.35, 0.15, 0.6, 0.7],
    [-0.42, 0.45, 0.46, 0.5],
  ] as const) {
    l.pieza(cajaBiselada(w, 0.1, f, 0.015), HIST.blancoRover, { p: [x, yCuerpo + 0.33, z] });
  }

  // Seis ruedas, balancín y bogie a cada lado.
  for (const lado of [-1, 1]) {
    const x = lado * 1.18;
    for (const z of [-1.05, 0.02, 1.02]) {
      rueda(l, [x, 0.265, z], 0.265, 0.34, HIST.ruedaRover, HIST.aluminio, 16);
    }
    const eje: V3 = [lado * 0.92, 0.82, 0.05];
    const rodilla: V3 = [x, 0.55, 0.52];
    l.pieza(tuboEntre(eje, [x, 0.42, -1.05], 0.038), HIST.aluminio);
    l.pieza(tuboEntre(eje, rodilla, 0.038), HIST.aluminio);
    l.pieza(tuboEntre(rodilla, [x, 0.42, 0.02], 0.03), HIST.aluminio);
    l.pieza(tuboEntre(rodilla, [x, 0.42, 1.02], 0.03), HIST.aluminio);
    l.pieza(tuboEntre([lado * 0.76, 0.86, 0.05], eje, 0.05), HIST.aluminio);
  }

  // Mástil con Mastcam-Z y SuperCam.
  const baseMastil: V3 = [0.45, yCuerpo + 0.27, -0.72];
  const cima: V3 = [0.45, 2.02, -0.72];
  l.pieza(tuboEntre(baseMastil, cima, 0.055, 8), HIST.blancoRover);
  l.en(cima, [0, 0, 0], () => {
    l.pieza(cajaBiselada(0.42, 0.16, 0.2, 0.02), HIST.blancoRover, { p: [0, 0.03, 0] });
    l.pieza(cajaBiselada(0.22, 0.24, 0.3, 0.025), HIST.blancoRover, { p: [0, 0.18, 0.02] });
    l.pieza(new THREE.CylinderGeometry(0.075, 0.09, 0.05, 12), HIST.lente, { p: [0, 0.18, -0.15], r: [giroX, 0, 0] });
    for (const x of [-0.14, 0.14]) {
      l.pieza(new THREE.CylinderGeometry(0.038, 0.045, 0.05, 8), HIST.lente, { p: [x, 0.03, -0.11], r: [giroX, 0, 0] });
    }
  });

  // Brazo robótico plegado por delante, con la torreta y la broca.
  const hombro: V3 = [-0.62, yCuerpo + 0.05, -1.04];
  const codo: V3 = [0.5, yCuerpo + 0.02, -1.24];
  const muneca: V3 = [-0.25, yCuerpo - 0.12, -1.38];
  l.pieza(new THREE.CylinderGeometry(0.09, 0.09, 0.14, 8), HIST.blancoRover, { p: hombro, r: [giroX, 0, 0] });
  l.pieza(tuboEntre(hombro, codo, 0.05, 8), HIST.blancoRover);
  l.pieza(new THREE.CylinderGeometry(0.08, 0.08, 0.12, 8), HIST.aluminio, { p: codo, r: [giroX, 0, 0] });
  l.pieza(tuboEntre(codo, muneca, 0.042, 8), HIST.blancoRover);
  l.en(muneca, [0, 0, 0], () => {
    l.pieza(cajaBiselada(0.36, 0.3, 0.3, 0.03), HIST.aluminio);
    l.pieza(tuboEntre([0.04, -0.14, 0], [0.04, -0.42, 0], 0.025, 8), HIST.lente);
    l.pieza(cajaBiselada(0.16, 0.14, 0.14, 0.015), HIST.blancoRover, { p: [-0.2, 0.05, -0.08] });
    l.pieza(cajaBiselada(0.12, 0.16, 0.14, 0.015), HIST.generador, { p: [0.2, 0.04, -0.08] });
  });
  // Carrusel de brocas bajo el frente.
  l.pieza(new THREE.CylinderGeometry(0.28, 0.32, 0.14, 12), HIST.aluminio, { p: [0, 0.65, -0.8] });

  // Antena de alta ganancia (disco hexagonal) y antena UHF en la cubierta trasera.
  l.pieza(tuboEntre([-0.45, yCuerpo + 0.3, 0.6], [-0.45, yCuerpo + 0.5, 0.6], 0.03), HIST.aluminio);
  l.pieza(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 6), HIST.antena, { p: [-0.45, yCuerpo + 0.55, 0.6], r: [0.7, 0, 0.2] });
  l.pieza(new THREE.CylinderGeometry(0.09, 0.11, 0.2, 8), HIST.antena, { p: [0.45, yCuerpo + 0.4, 0.7] });

  // Generador radioisotópico atrás, inclinado, con aletas.
  l.en([0, yCuerpo + 0.1, 1.24], [-0.75, 0, 0], () => {
    l.pieza(new THREE.CylinderGeometry(0.2, 0.2, 0.66, 10), HIST.generador);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      l.pieza(new THREE.BoxGeometry(0.03, 0.6, 0.14), HIST.generador, {
        p: [Math.cos(a) * 0.26, 0, Math.sin(a) * 0.26],
        r: [0, -a, 0],
      });
    }
  });
}

/**
 * Cuerpo cilíndrico envuelto en manta térmica: el radio ondula un poco con el ángulo y la altura, como la manta
 * arrugada de Cassini. La onda depende de la posición (no del índice), así la costura del cilindro queda cerrada.
 */
function envueltaMLI(radioAbajo: number, radioArriba: number, alto: number, semilla: number): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(radioArriba, radioAbajo, alto, 16, 6);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-4) continue;
    const a = Math.atan2(z, x);
    const onda =
      1 + 0.05 * Math.sin(a * 3 + y * 4.1 + semilla) + 0.035 * Math.sin(a * 7 - y * 9.3 + semilla * 2.3);
    pos.setX(i, x * onda);
    pos.setZ(i, z * onda);
  }
  return geo;
}

/** Generador radioisotópico (GPHS-RTG): cilindro de 1.14 m y 0.42 m de diámetro con aletas. Eje en Y, centrado. */
function generadorCassini(l: Lote): void {
  l.pieza(new THREE.CylinderGeometry(0.15, 0.15, 1.14, 8), HIST.generador);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    l.pieza(new THREE.BoxGeometry(0.02, 1.0, 0.13), HIST.generador, { p: [Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2], r: [0, -a, 0] });
  }
  for (const y of [-0.6, 0.6]) l.pieza(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 8), HIST.aluminio, { p: [0, y, 0] });
}

/**
 * Cassini-Huygens (NASA, ESA y ASI), tumbada: el eje principal va en horizontal (antena de alta ganancia hacia −X)
 * y el brazo del magnetómetro apunta hacia arriba, como en la vista frontal del modelo 3D de NASA. Así el holograma
 * cabe entre el tablero y la corona al girar. Origen en el borde inferior de la antena, centrado en el eje.
 *
 * Medidas aproximadas: 6.8 m de alto, antena de 4 m, brazo del magnetómetro de 11 m, sonda Huygens de 2.7 m de
 * diámetro a un lado y tres generadores radioisotópicos abajo. Las tres antenas de ondas de radio (RPWS) miden
 * 10 m en la nave real; aquí van acortadas a 3.2 m para no atravesar la vitrina.
 */
export function crearCassiniExhibicion(l: Lote): void {
  // Sistema propio de la nave: +Y es su eje (de los motores a la antena), +X el lado del brazo y +Z el de las cámaras.
  // El giro lleva +X de la nave a +Y del mundo y su eje Y a −X; el centro del eje queda en x = 0.
  l.en([3.4, 2.0, 0], [0, 0, Math.PI / 2], () => {
    // Motores principales (dos toberas) bajo la cubierta negra.
    for (const x of [-0.28, 0.28]) {
      l.pieza(new THREE.CylinderGeometry(0.08, 0.2, 0.42, 10), HIST.plateado, { p: [x, 0.22, 0] });
    }
    l.pieza(new THREE.CylinderGeometry(0.62, 0.78, 0.5, 14), HIST.negro, { p: [0, 0.65, 0] });
    l.pieza(new THREE.SphereGeometry(0.62, 14, 5, 0, Math.PI * 2, 0, Math.PI / 2), HIST.negro, { p: [0, 0.9, 0] });

    // Módulo inferior con los tres generadores, inclinados hacia fuera y abajo.
    l.pieza(new THREE.CylinderGeometry(0.95, 0.85, 0.4, 12), HIST.mli, { p: [0, 1.1, 0] });
    for (const a of [Math.PI / 3, Math.PI, (5 * Math.PI) / 3]) {
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      l.pieza(tuboEntre([dx * 0.8, 1.15, dz * 0.8], [dx * 1.2, 1.0, dz * 1.2], 0.04, 6), HIST.aluminio);
      l.en([dx * 1.55, 0.78, dz * 1.55], [0, -a, 0], () => {
        l.en([0, 0, 0], [0, 0, 1.0], () => generadorCassini(l));
      });
    }

    // Módulo de propulsión: dos tanques apilados envueltos en manta dorada.
    l.pieza(envueltaMLI(1.0, 0.86, 1.5, 1.3), HIST.mli, { p: [0, 2.05, 0] });
    l.pieza(envueltaMLI(0.86, 1.0, 1.5, 4.1), HIST.mli, { p: [0, 3.55, 0] });

    // Bus de electrónica de doce bahías, con algunas placas claras.
    l.pieza(new THREE.CylinderGeometry(1.05, 1.05, 0.62, 12), HIST.mli, { p: [0, 4.62, 0] });
    for (let i = 0; i < 12; i += 2) {
      const a = ((i + 0.5) / 12) * Math.PI * 2;
      l.pieza(cajaBiselada(0.38, 0.32, 0.04, 0.01), HIST.aluminio, {
        p: [Math.cos(a) * 1.04, 4.62, Math.sin(a) * 1.04],
        r: [0, Math.PI / 2 - a, 0],
      });
    }

    // Antena de alta ganancia: plato de 4 m con costillas por detrás, subreflector sobre trípode y antena de baja
    // ganancia encima.
    const yPlato = 5.0;
    const perfil: THREE.Vector2[] = [];
    for (let k = 0; k <= 8; k++) {
      const r = (k / 8) * 2.0;
      perfil.push(new THREE.Vector2(r, yPlato + 0.48 * (r / 2.0) ** 2));
    }
    l.pieza(new THREE.LatheGeometry(perfil, 24), HIST.antenaCassini);
    l.pieza(new THREE.CylinderGeometry(0.55, 0.7, 0.2, 12), HIST.antenaCassini, { p: [0, yPlato - 0.06, 0] });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const [c, s] = [Math.cos(a), Math.sin(a)];
      l.pieza(tuboEntre([c * 0.6, yPlato - 0.08, s * 0.6], [c * 1.95, yPlato + 0.42, s * 1.95], 0.025, 4), HIST.antenaCassini);
    }
    const ySub = 6.45;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
      l.pieza(tuboEntre([Math.cos(a) * 1.25, yPlato + 0.2, Math.sin(a) * 1.25], [Math.cos(a) * 0.2, ySub, Math.sin(a) * 0.2], 0.02, 4), HIST.aluminio);
    }
    l.pieza(new THREE.CylinderGeometry(0.34, 0.2, 0.1, 12), HIST.aluminio, { p: [0, ySub, 0] });
    l.pieza(new THREE.ConeGeometry(0.12, 0.3, 10), HIST.aluminio, { p: [0, ySub + 0.2, 0] });
    l.pieza(new THREE.CylinderGeometry(0.16, 0.22, 0.32, 10), HIST.aluminio, { p: [0, yPlato + 0.2, 0] });

    // Sonda Huygens a un lado (−Z): escudo térmico cónico de 2.7 m hacia fuera y cubierta trasera hacia la nave.
    l.en([0, 2.75, -1.05], [-Math.PI / 2, 0, 0], () => {
      l.pieza(new THREE.CylinderGeometry(1.35, 0.75, 0.32, 16), HIST.mli, { p: [0, 0.16, 0] });
      l.pieza(new THREE.CylinderGeometry(0.2, 1.35, 0.42, 16), HIST.mli, { p: [0, 0.53, 0] });
      l.pieza(new THREE.CylinderGeometry(1.38, 1.38, 0.05, 16), HIST.aluminio, { p: [0, 0.33, 0] });
    });

    // Plataforma de teledetección (+Z): cámaras de ángulo estrecho y ancho y otros instrumentos.
    l.en([0, 3.6, 1.1], [0, 0, 0], () => {
      l.pieza(cajaBiselada(1.3, 1.5, 0.4, 0.03), HIST.mli);
      l.pieza(new THREE.CylinderGeometry(0.16, 0.16, 0.9, 10), HIST.negro, { p: [-0.35, 0, 0.32] });
      l.pieza(new THREE.CylinderGeometry(0.11, 0.11, 0.6, 10), HIST.negro, { p: [0.05, 0.1, 0.3] });
      l.pieza(cajaBiselada(0.36, 0.5, 0.36, 0.02), HIST.aluminio, { p: [0.4, -0.2, 0.34] });
      l.pieza(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 10), HIST.lente, { p: [-0.35, 0.47, 0.32] });
    });
    // Analizador de polvo cósmico: tambor en el lado del brazo.
    l.pieza(new THREE.CylinderGeometry(0.28, 0.28, 0.3, 12), HIST.aluminio, { p: [0.95, 3.7, 0.65], r: [0, 0, Math.PI / 2] });

    // Brazo del magnetómetro (11 m), de sección cuadrada, con un sensor a mitad y otro en la punta.
    const yBrazo = 4.55;
    l.pieza(cajaBiselada(5.3, 0.16, 0.16, 0.02), HIST.mli, { p: [1.05 + 2.65, yBrazo, 0] });
    l.pieza(new THREE.CylinderGeometry(0.1, 0.1, 0.32, 8), HIST.aluminio, { p: [6.55, yBrazo, 0], r: [0, 0, Math.PI / 2] });
    l.pieza(cajaBiselada(5.3, 0.16, 0.16, 0.02), HIST.mli, { p: [6.75 + 2.65, yBrazo, 0] });
    l.pieza(new THREE.CylinderGeometry(0.11, 0.11, 0.28, 8), HIST.aluminio, { p: [12.15, yBrazo, 0], r: [0, 0, Math.PI / 2] });

    // Antenas de ondas de radio y plasma (RPWS): tres varillas finas en abanico (acortadas, ver arriba).
    for (const d of [
      [0.5, -0.12, 0.86],
      [0.5, -0.12, -0.86],
      [-0.3, -0.2, 0.93],
    ] as const) {
      const largo = 3.2;
      const desde: V3 = [d[0] * 0.95, 4.1, d[2] * 0.95];
      l.pieza(tuboEntre(desde, [desde[0] + d[0] * largo, desde[1] + d[1] * largo, desde[2] + d[2] * largo], 0.018, 4), HIST.aluminio);
    }
  });
}

/**
 * Traje A7LB de Apollo, vacío. Mira hacia +Z y mide unos 1.85 m.
 * `comandante`: franjas rojas en brazos, piernas y casco (Apollo 17: las del comandante).
 */
export function crearTrajeApollo(l: Lote, comandante: boolean): void {
  const blanco = HIST.traje;
  for (const lado of [-1, 1]) {
    const x = lado * 0.13;
    // Bota lunar, pierna y fuelle de la rodilla.
    l.pieza(cajaBiselada(0.17, 0.05, 0.32, 0.012), HIST.suela, { p: [x, 0.025, 0.03] });
    l.pieza(cajaBiselada(0.16, 0.14, 0.3, 0.03), blanco, { p: [x, 0.12, 0.03] });
    l.pieza(tuboEntre([x, 0.18, 0], [x, 0.48, 0], 0.08, 8), blanco);
    for (let i = 0; i < 3; i++) {
      l.pieza(new THREE.CylinderGeometry(0.092, 0.092, 0.03, 8), blanco, { p: [x, 0.5 + i * 0.04, 0] });
    }
    l.pieza(tuboEntre([x, 0.6, 0], [x * 0.92, 0.88, 0], 0.095, 8), blanco);
    if (comandante) {
      l.pieza(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 8), HIST.franjaRoja, { p: [x, 0.74, 0] });
      l.pieza(new THREE.CylinderGeometry(0.086, 0.086, 0.05, 8), HIST.franjaRoja, { p: [x, 0.36, 0] });
    }

    // Brazo con fuelles en hombro y codo.
    const hombro: V3 = [lado * 0.27, 1.38, 0];
    const codo: V3 = [lado * 0.34, 1.08, 0.02];
    const muneca: V3 = [lado * 0.36, 0.82, 0.08];
    l.pieza(new THREE.IcosahedronGeometry(0.1, 1), blanco, { p: hombro });
    l.pieza(tuboEntre(hombro, codo, 0.07, 8), blanco);
    l.pieza(new THREE.IcosahedronGeometry(0.08, 0), blanco, { p: codo });
    l.pieza(tuboEntre(codo, muneca, 0.062, 8), blanco);
    if (comandante) {
      l.pieza(tuboEntre([lado * 0.3, 1.24, 0.01], [lado * 0.31, 1.18, 0.012], 0.076, 8), HIST.franjaRoja);
      l.pieza(tuboEntre([lado * 0.35, 0.98, 0.04], [lado * 0.352, 0.93, 0.05], 0.068, 8), HIST.franjaRoja);
    }
    // Conector de muñeca y guante.
    l.pieza(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 8), HIST.aluminio, { p: muneca });
    l.pieza(cajaBiselada(0.09, 0.15, 0.1, 0.02), HIST.guante, { p: [lado * 0.365, 0.73, 0.09] });
  }

  // Torso y cadera.
  l.pieza(new THREE.CylinderGeometry(0.17, 0.16, 0.22, 8), blanco, { p: [0, 0.96, 0], e: [1, 1, 0.8] });
  l.pieza(new THREE.CylinderGeometry(0.23, 0.17, 0.46, 8), blanco, { p: [0, 1.28, 0], e: [1, 1, 0.76] });

  // Unidad de control en el pecho y conectores azul y rojo.
  l.pieza(cajaBiselada(0.22, 0.13, 0.09, 0.015), HIST.aluminio, { p: [0, 1.3, 0.2] });
  l.pieza(cajaBiselada(0.16, 0.05, 0.02, 0.005), HIST.negro, { p: [0, 1.31, 0.25] });
  for (const [x, y, color] of [
    [-0.13, 1.15, HIST.conectorAzul],
    [0.13, 1.15, HIST.conectorAzul],
    [-0.1, 1.08, HIST.franjaRoja],
    [0.1, 1.08, HIST.franjaRoja],
  ] as const) {
    l.pieza(new THREE.CylinderGeometry(0.028, 0.028, 0.03, 8), color, { p: [x, y, 0.16], r: [giroX, 0, 0] });
  }

  // Mochila de soporte vital (PLSS) con la unidad de oxígeno encima (OPS).
  l.pieza(cajaBiselada(0.44, 0.62, 0.2, 0.03), blanco, { p: [0, 1.25, -0.27] });
  l.pieza(cajaBiselada(0.4, 0.18, 0.2, 0.03), blanco, { p: [0, 1.65, -0.27] });
  for (const y of [1.1, 1.25, 1.4]) {
    l.pieza(new THREE.BoxGeometry(0.42, 0.012, 0.21), HIST.aluminio, { p: [0, y, -0.27] });
  }

  // Aro del cuello, casco con cubierta exterior y visor dorado.
  l.pieza(new THREE.CylinderGeometry(0.13, 0.14, 0.05, 12), HIST.aluminio, { p: [0, 1.52, 0.01] });
  l.pieza(new THREE.IcosahedronGeometry(0.165, 2), blanco, { p: [0, 1.68, 0.02] });
  l.pieza(new THREE.SphereGeometry(0.17, 10, 6, Math.PI * 0.2, Math.PI * 0.6, Math.PI * 0.28, Math.PI * 0.36), HIST.visor, {
    p: [0, 1.68, 0.02],
  });
  if (comandante) {
    for (const phi of [Math.PI / 2, (Math.PI * 3) / 2]) {
      l.pieza(new THREE.SphereGeometry(0.168, 2, 5, phi - 0.16, 0.32, 0, Math.PI * 0.42), HIST.franjaRoja, { p: [0, 1.68, 0.02] });
    }
  }
}

/**
 * Saturn V, el cohete de Apollo 17, a escala 1:13 (8.5 m). Blanco con el patrón negro de balanceo.
 * Etapas S-IC, S-II y S-IVB, módulo de servicio, módulo de mando y torre de escape.
 */
export function crearSaturnV(l: Lote): void {
  const tramo = (rArriba: number, rAbajo: number, y0: number, y1: number, color: number | ((c: THREE.Vector3) => number), lados = 16): void => {
    l.pieza(new THREE.CylinderGeometry(rArriba, rAbajo, y1 - y0, lados), color, { p: [0, (y0 + y1) / 2, 0] });
  };
  const r = 0.39;
  // S-IC: paneles negros alternos en la mitad inferior.
  const patron = (c: THREE.Vector3): number => {
    const sector = Math.floor(((Math.atan2(c.z, c.x) + Math.PI) / (Math.PI * 2)) * 4);
    return sector % 2 === 0 && c.y < 0.1 ? HIST.negro : HIST.blancoCohete;
  };
  // Cinco motores F-1.
  for (const [x, z] of [
    [0, 0],
    [0.2, 0.2],
    [-0.2, 0.2],
    [0.2, -0.2],
    [-0.2, -0.2],
  ]) {
    l.pieza(new THREE.CylinderGeometry(0.05, 0.14, 0.32, 10), HIST.negro, { p: [x, 0.16, z] });
  }
  tramo(r, r, 0.28, 3.35, patron);
  tramo(r + 0.015, r + 0.015, 0.34, 0.48, HIST.negro);
  tramo(r + 0.015, r + 0.015, 3.25, 3.35, HIST.negro);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i / 4) * Math.PI * 2;
    l.en([Math.cos(a) * r, 0.42, Math.sin(a) * r], [0, -a, 0], () => {
      l.pieza(new THREE.BoxGeometry(0.34, 0.4, 0.02), HIST.blancoCohete, { p: [0.14, 0, 0], r: [0, 0, 0.35] });
    });
  }
  tramo(r, r, 3.35, 5.27, HIST.blancoCohete);
  tramo(r + 0.012, r + 0.012, 3.35, 3.44, HIST.negro);
  tramo(0.255, r, 5.27, 5.6, HIST.blancoCohete);
  tramo(0.255, 0.255, 5.6, 6.75, HIST.blancoCohete);
  tramo(0.262, 0.262, 5.6, 5.88, HIST.negro, 16);
  tramo(0.2, 0.255, 6.75, 7.25, HIST.blancoCohete);
  tramo(0.2, 0.2, 7.25, 7.55, HIST.plateado);
  tramo(0.03, 0.2, 7.55, 7.82, HIST.plateado);
  l.pieza(tuboEntre([0, 7.82, 0], [0, 8.2, 0], 0.018, 5), HIST.negro);
  tramo(0.022, 0.03, 8.2, 8.5, HIST.blancoCohete, 8);
}

/** Atlas V 541, el cohete de Perseverance, a la misma escala 1:13 (4.48 m). Etapa salmón, cuatro aceleradores y cofia blanca. */
export function crearAtlasV541(l: Lote): void {
  const tramo = (rArriba: number, rAbajo: number, y0: number, y1: number, color: number, lados = 14): void => {
    l.pieza(new THREE.CylinderGeometry(rArriba, rAbajo, y1 - y0, lados), color, { p: [0, (y0 + y1) / 2, 0] });
  };
  for (const x of [-0.05, 0.05]) {
    l.pieza(new THREE.CylinderGeometry(0.025, 0.05, 0.09, 8), HIST.negro, { p: [x, 0.045, 0] });
  }
  tramo(0.147, 0.147, 0.08, 2.6, HIST.salmon);
  tramo(0.208, 0.147, 2.6, 2.88, HIST.blancoCohete);
  tramo(0.208, 0.208, 2.88, 3.85, HIST.blancoCohete);
  tramo(0.1, 0.208, 3.85, 4.32, HIST.blancoCohete);
  tramo(0.015, 0.1, 4.32, 4.48, HIST.blancoCohete);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i / 4) * Math.PI * 2;
    const [x, z] = [Math.cos(a) * 0.21, Math.sin(a) * 0.21];
    l.pieza(new THREE.CylinderGeometry(0.03, 0.05, 0.06, 8), HIST.negro, { p: [x, 0.09, z] });
    l.pieza(new THREE.CylinderGeometry(0.06, 0.06, 1.5, 8), HIST.blancoCohete, { p: [x, 0.87, z] });
    l.pieza(new THREE.ConeGeometry(0.06, 0.14, 8), HIST.blancoCohete, { p: [x, 1.69, z] });
  }
}

/** Consola de laboratorio con mesa inclinada, botones, teclado, pantalla y un holograma abstracto. Mira hacia +Z. */
export function crearConsola(l: Lote, semilla: number): void {
  l.pieza(cajaBiselada(1.9, 0.08, 0.5, 0.02), ARQ.oscuro, { p: [0, 0.04, -0.04] });
  l.pieza(cajaBiselada(1.76, 0.72, 0.62, 0.03), ARQ.purpura, { p: [0, 0.44, -0.08] });
  l.pieza(placaChaflan(1.5, 0.5, 0.03, 0.06), ARQ.indigo, { p: [0, 0.44, 0.24] });
  for (const x of [-0.55, 0, 0.55]) {
    l.pieza(new THREE.BoxGeometry(0.34, 0.03, 0.02), ARQ.oscuro, { p: [x, 0.3, 0.26] });
    l.pieza(new THREE.BoxGeometry(0.34, 0.03, 0.02), ARQ.oscuro, { p: [x, 0.37, 0.26] });
  }
  l.emisiva(new THREE.BoxGeometry(1.5, 0.02, 0.02), ARQ.cian, 2.4, { p: [0, 0.74, 0.21] });

  // Mesa de mandos inclinada hacia el jugador.
  l.en([0, 0.86, -0.02], [0.5, 0, 0], () => {
    l.pieza(cajaBiselada(1.9, 0.09, 0.66, 0.025), ARQ.lila);
    l.pieza(cajaBiselada(1.72, 0.03, 0.5, 0.01), ARQ.oscuro, { p: [0, 0.055, 0] });
    l.pieza(cajaBiselada(0.6, 0.02, 0.26, 0.006), ARQ.indigo, { p: [0, 0.075, 0.08] });
    for (let i = 0; i < 12; i++) {
      for (let k = 0; k < 3; k++) {
        const geo = new THREE.BoxGeometry(0.035, 0.012, 0.035);
        const p: V3 = [-0.24 + i * 0.044, 0.09, k * 0.05];
        if ((i + k * 12 + semilla) % 5 === 0) l.emisiva(geo, ARQ.ambar, 2.2, { p });
        else l.pieza(geo, ARQ.lila, { p });
      }
    }
    const coloresBoton = [ARQ.cian, ARQ.ambar, ARQ.ladrilloClaro, ARQ.magenta];
    for (const lado of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        l.emisiva(new THREE.CylinderGeometry(0.03, 0.03, 0.018, 8), coloresBoton[(i + semilla) % 4], 2, {
          p: [lado * (0.46 + (i % 2) * 0.12), 0.075, -0.1 + Math.floor(i / 2) * 0.14],
        });
      }
    }
    l.emisiva(new THREE.BoxGeometry(0.46, 0.012, 0.14), ARQ.cian, 1.1, { p: [0, 0.075, -0.16] });
  });

  // Pantalla física y holograma: gráficas sin datos reales (no representan ninguna medición).
  l.pieza(placaChaflan(1.3, 0.76, 0.05, 0.08), ARQ.oscuro, { p: [0, 1.56, -0.3], r: [-0.1, 0, 0] });
  l.pieza(tuboEntre([0, 1.1, -0.34], [0, 1.28, -0.34], 0.04), ARQ.cobre);
  l.en([0, 1.56, -0.27], [-0.1, 0, 0], () => {
    l.emisiva(new THREE.PlaneGeometry(1.14, 0.6), 0x0a3a58, 1);
    for (let i = 0; i < 9; i++) {
      const alto = 0.1 + ((i * 37 + semilla * 13) % 10) * 0.035;
      l.emisiva(new THREE.PlaneGeometry(0.05, alto), ARQ.cian, 1.7, { p: [-0.48 + i * 0.07, -0.22 + alto / 2, 0.005] });
    }
    for (let i = 0; i < 5; i++) {
      l.emisiva(new THREE.PlaneGeometry(0.34 - (i % 2) * 0.1, 0.02), ARQ.cian, 1.5, { p: [0.33, 0.2 - i * 0.07, 0.005] });
    }
  });
  const holograma = (lado: number): void => {
    const altura = 0.54;
    l.en([lado * 1.0, 1.42, 0.05], [0, -lado * 0.35, 0], () => {
      l.aditiva(new THREE.PlaneGeometry(0.62, altura), () => tinte(ARQ.cian, 0.09));
      for (const y of [altura / 2, -altura / 2]) {
        l.emisiva(new THREE.PlaneGeometry(0.62, 0.012), ARQ.cian, 2.2, { p: [0, y, 0.002] });
      }
      for (const x of [0.31, -0.31]) {
        l.emisiva(new THREE.PlaneGeometry(0.012, altura), ARQ.cian, 2.2, { p: [x, 0, 0.002] });
      }
      l.emisiva(new THREE.RingGeometry(0.1, 0.116, 16), ARQ.cian, 1.8, { p: [-0.12, 0.03, 0.002] });
      for (let i = 0; i < 4; i++) {
        l.emisiva(new THREE.PlaneGeometry(0.2 - i * 0.02, 0.012), ARQ.cian, 1.5, { p: [0.14, 0.13 - i * 0.07, 0.002] });
      }
    });
  };
  holograma(-1);
  holograma(1);

  // Silla vacía delante de la consola.
  l.en([0, 0, 1.08], [0, Math.PI, 0], () => {
    l.pieza(new THREE.CylinderGeometry(0.28, 0.33, 0.06, 8), ARQ.oscuro, { p: [0, 0.03, 0] });
    l.pieza(tuboEntre([0, 0.05, 0], [0, 0.46, 0], 0.04), ARQ.cobre);
    l.pieza(cajaBiselada(0.56, 0.12, 0.54, 0.03), ARQ.ladrillo, { p: [0, 0.52, 0] });
    l.pieza(cajaBiselada(0.56, 0.72, 0.13, 0.03), ARQ.ladrillo, { p: [0, 0.92, -0.26], r: [-0.14, 0, 0] });
    for (const x of [-0.32, 0.32]) {
      l.pieza(cajaBiselada(0.08, 0.05, 0.42, 0.012), ARQ.cobre, { p: [x, 0.74, 0] });
      l.pieza(tuboEntre([x, 0.58, -0.05], [x, 0.74, -0.05], 0.018, 5), ARQ.cobre);
    }
  });
}

/** Caja de equipo con esquinas biseladas y una tira de luz. */
export function crearCaja(l: Lote, color: number, acento: number): void {
  l.pieza(cajaBiselada(1.1, 0.55, 0.7, 0.05), color, { p: [0, 0.3, 0] });
  l.pieza(cajaBiselada(1.14, 0.08, 0.74, 0.015), ARQ.oscuro, { p: [0, 0.42, 0] });
  for (const x of [-0.4, 0.4]) {
    l.pieza(cajaBiselada(0.1, 0.56, 0.74, 0.012), ARQ.cobre, { p: [x, 0.3, 0] });
  }
  l.emisiva(new THREE.BoxGeometry(0.34, 0.03, 0.01), acento, 2.2, { p: [0, 0.2, 0.355] });
}

/** Torre de comunicaciones de la sala (decoración): celosía de cobre con un plato. */
export function crearTorre(l: Lote): void {
  const alto = 4.3;
  const patas: [number, number][] = [
    [-0.45, -0.45],
    [0.45, -0.45],
    [0.45, 0.45],
    [-0.45, 0.45],
  ];
  l.pieza(cajaBiselada(1.5, 0.2, 1.5, 0.05), ARQ.purpura, { p: [0, 0.1, 0] });
  for (const [x, z] of patas) {
    l.pieza(tuboEntre([x, 0.2, z], [x * 0.45, alto, z * 0.45], 0.04), ARQ.cobre);
  }
  const niveles = 5;
  for (let i = 0; i <= niveles; i++) {
    const f = i / niveles;
    const y = 0.2 + f * (alto - 0.2);
    const e = 1 - 0.55 * f;
    for (let k = 0; k < 4; k++) {
      const [x0, z0] = patas[k];
      const [x1, z1] = patas[(k + 1) % 4];
      l.pieza(tuboEntre([x0 * e, y, z0 * e], [x1 * e, y, z1 * e], 0.018, 4), ARQ.ladrillo);
      if (i < niveles) {
        const yN = 0.2 + ((i + 1) / niveles) * (alto - 0.2);
        const eN = 1 - 0.55 * ((i + 1) / niveles);
        l.pieza(tuboEntre([x0 * e, y, z0 * e], [x1 * eN, yN, z1 * eN], 0.012, 4), ARQ.ladrillo);
      }
    }
  }
  l.pieza(tuboEntre([0, alto, 0], [0, alto + 0.3, 0], 0.03), ARQ.lila);
  l.pieza(new THREE.ConeGeometry(0.46, 0.2, 12), ARQ.dorado, { p: [0.18, 3.1, 0.2], r: [2.5, 0, 0.5] });
  l.emisiva(new THREE.IcosahedronGeometry(0.05, 0), ARQ.ladrilloClaro, 4, { p: [0, alto + 0.33, 0] });
}

/** Muestra de roca facetada. No se presenta como ninguna muestra concreta del catálogo (SPEC §8.6). */
export function crearMuestraRoca(l: Lote, semilla: number, color: number): void {
  l.pieza(geometriaRoca(semilla, 1), color, { p: [0, 0.3, 0], e: [0.34, 0.24, 0.3], v: 0.3 });
}
