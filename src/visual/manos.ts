// Manos del avatar en primera persona (SPEC 5.5 y 8.1): replican la mano real con sus gestos.
// Se dibujan como guantes de traje espacial low poly (guante.ts, spec-visual-museo §9).
// Cuelgan de la cámara de la escena, que está en la webcam.
// Pérdida momentánea: la mano se queda en su última posición. Solo desaparece tras `tiempoOcultarS` sin detección.
// Los puntos ocultos se estiman con un modelo anatómico, no se copian de un fotograma anterior.

import * as THREE from 'three';
import { estimarPuntosOcultos, puntosManoMundo, type PuntoMano, type Vec3, type VistaCamara } from './manosGeometria.ts';
import { ajustarMano, type TablaLimites } from './manoModelo.ts';
import { crearGeometriasGuante, type GeometriasGuante } from './guante.ts';
import type { PuntoMundo } from '../tracking/tracker';

/** Segmentos de cada dedo (punto inicial → final): tres por dedo. El pulgar empieza en su CMC (punto 1). */
const SEGMENTOS: readonly (readonly [number, number])[] = [
  [1, 2], [2, 3], [3, 4],
  [5, 6], [6, 7], [7, 8],
  [9, 10], [10, 11], [11, 12],
  [13, 14], [14, 15], [15, 16],
  [17, 18], [18, 19], [19, 20],
];
/** Grosor extra del primer segmento del pulgar (eminencia tenar del guante). Los demás segmentos, 1. */
const GROSOR_BASE_PULGAR = 1.3;
/** Articulaciones con fuelle: [articulación, punto siguiente]. Nudillos, PIP y DIP de cada dedo; MCP e IP del pulgar. */
const FUELLES: readonly (readonly [number, number])[] = [
  [2, 3], [3, 4],
  [5, 6], [6, 7], [7, 8],
  [9, 10], [10, 11], [11, 12],
  [13, 14], [14, 15], [15, 16],
  [17, 18], [18, 19], [19, 20],
];
/** Nudillos: su fuelle se orienta con la palma de entrada (el punto anterior en la cadena es lateral). */
const NUDILLOS: ReadonlySet<number> = new Set([5, 9, 13, 17]);
/** Puntas de los dedos: [punta, articulación anterior]. */
const PUNTAS: readonly (readonly [number, number])[] = [[4, 3], [8, 7], [12, 11], [16, 15], [20, 19]];
/** Duración (s) del deslizamiento cuando la mano reaparece cerca de donde estaba. */
const DURACION_DESLIZAR_S = 0.15;

export interface ManoDetectada {
  label: 'Left' | 'Right' | 'Unknown';
  landmarks: PuntoMano[];
  worldLandmarks: PuntoMundo[];
  /** Confianza de la lateralidad (0–1) según MediaPipe. Se usa como peso de todos los puntos en el ajuste. */
  score: number | null;
}

/** Opciones de colocación que vienen del jugador (Opciones). */
export interface OpcionesManos {
  /** Separación total entre manos (m). */
  separacion: number;
  /** Ajustar un modelo articulado a los landmarks (manoModelo.ts). Apagado, la mano se reconstruye como antes. */
  ajuste: boolean;
  /** Topes de las articulaciones, en grados. */
  limites: TablaLimites;
  /** Momento actual (s), para contar el tiempo sin detección. */
  ahoraS: number;
  /** Segundos sin detección antes de que la mano desaparezca. */
  tiempoOcultarS: number;
  /** Salto (m, en la escena) por debajo del cual la mano reaparece deslizándose en vez de saltar. */
  umbralSaltoM: number;
}

export interface ManosAvatar {
  /** Objeto a colgar de la cámara. */
  objeto: THREE.Group;
  /**
   * Coloca cada mano según las manos detectadas en este fotograma.
   * `opciones.separacion` (m): separación total entre manos; cada una se desplaza la mitad hacia su lado en x.
   */
  actualizar(manos: ManoDetectada[], vista: VistaCamara, opciones: OpcionesManos): void;
  ocultar(): void;
}

interface ManoVisual {
  grupo: THREE.Group;
  /** Puño rígido en la muñeca. Es el primer hijo del grupo y su posición es la de la muñeca. */
  puno: THREE.Mesh;
  /** Palma: se orienta con la muñeca y se escala al ancho y largo de la palma. */
  palma: THREE.Mesh;
  segmentos: THREE.InstancedMesh;
  fuelles: THREE.InstancedMesh;
  puntas: THREE.InstancedMesh;
  /** Parámetros del modelo ajustados en el fotograma anterior (null si no hay ajuste). */
  pose: Float64Array | null;
  /** Momento (s) de la última detección válida. null si nunca se ha detectado o si la mano ya se ocultó por tiempo. */
  ultimaDeteccionS: number | null;
  /** Últimos puntos dibujados. Se conservan al ocultarse, para comparar con la reaparición. */
  ultimosPuntos: Vec3[] | null;
  /** Deslizamiento de reaparición: desde qué puntos y cuándo empezó. */
  deslizar: { desde: Vec3[]; inicioS: number } | null;
}

const distancia = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const mezclar = (a: Vec3, b: Vec3, t: number): Vec3 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
});

export function crearManos(): ManosAvatar {
  const raiz = new THREE.Group();
  // Geometría del guante: se crea una vez. Cada fotograma solo cambia transformaciones (spec-visual-museo §9).
  const geo: GeometriasGuante = crearGeometriasGuante();

  const instancias = (g: THREE.BufferGeometry, n: number): THREE.InstancedMesh => {
    const malla = new THREE.InstancedMesh(g, geo.material, n);
    malla.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Las instancias se mueven cada fotograma: la esfera envolvente de la geometría base no sirve para recortar.
    malla.frustumCulled = false;
    return malla;
  };

  const crearMano = (lado: 'Left' | 'Right'): ManoVisual => {
    const grupo = new THREE.Group();
    // Parche en el dorso. Con z = x × y (sistemaPalma), en el modelo de manoModelo.ts la cara palmar de la mano
    // izquierda queda en +z, así que su dorso está en −z; la derecha está reflejada y su dorso queda en +z.
    const puno = new THREE.Mesh(lado === 'Left' ? geo.punoDorsoNegativo : geo.punoDorsoPositivo, geo.material);
    const palma = new THREE.Mesh(geo.palma, geo.material);
    const segmentos = instancias(geo.segmento, SEGMENTOS.length);
    const fuelles = instancias(geo.fuelle, FUELLES.length);
    const puntas = instancias(geo.punta, PUNTAS.length);
    // El puño va primero: es el nodo de la muñeca.
    grupo.add(puno, palma, segmentos, fuelles, puntas);
    grupo.visible = false;
    raiz.add(grupo);
    return { grupo, puno, palma, segmentos, fuelles, puntas, pose: null, ultimaDeteccionS: null, ultimosPuntos: null, deslizar: null };
  };

  const manos: Record<'Left' | 'Right', ManoVisual> = { Left: crearMano('Left'), Right: crearMano('Right') };

  // Vectores y matrices reutilizados: el dibujo de cada fotograma no reserva memoria nueva.
  const ejeX = new THREE.Vector3();
  const ejeY = new THREE.Vector3();
  const ejeZ = new THREE.Vector3();
  const centro = new THREE.Vector3();
  const va = new THREE.Vector3();
  const vb = new THREE.Vector3();
  const entrada = new THREE.Vector3();
  const salida = new THREE.Vector3();
  const escalaV = new THREE.Vector3();
  const matriz = new THREE.Matrix4();
  const rotacion = new THREE.Matrix4();
  const v = (p: Vec3, destino: THREE.Vector3): THREE.Vector3 => destino.set(p.x, p.y, p.z);

  /**
   * Sistema de la palma: y de la muñeca al centro de los nudillos, x del índice al meñique, z = x × y.
   * Devuelve el ancho (índice a meñique) y el largo (muñeca a nudillos) de la palma, o null si es degenerada.
   */
  const sistemaPalma = (puntos: Vec3[]): { ancho: number; largo: number } | null => {
    centro.set(0, 0, 0);
    for (const i of [5, 9, 13, 17]) centro.add(v(puntos[i], va));
    centro.multiplyScalar(0.25);
    ejeY.copy(centro).sub(v(puntos[0], va));
    const largo = ejeY.length();
    if (largo < 1e-6) return null;
    ejeY.divideScalar(largo);
    ejeX.copy(v(puntos[17], va)).sub(v(puntos[5], vb));
    const ancho = ejeX.length();
    ejeX.addScaledVector(ejeY, -ejeX.dot(ejeY));
    if (ejeX.lengthSq() < 1e-12) return null;
    ejeX.normalize();
    ejeZ.crossVectors(ejeX, ejeY);
    return { ancho, largo };
  };

  /**
   * Orientación de una pieza a lo largo de `dir` (unitario). El giro alrededor del eje sigue el ancho de la palma,
   * así las caras planas de todos los dedos quedan alineadas.
   */
  const orientar = (dir: THREE.Vector3): THREE.Matrix4 => {
    va.copy(ejeX).addScaledVector(dir, -ejeX.dot(dir));
    if (va.lengthSq() < 1e-10) va.copy(ejeZ).addScaledVector(dir, -ejeZ.dot(dir));
    va.normalize();
    vb.crossVectors(va, dir);
    return rotacion.makeBasis(va, dir, vb);
  };

  const ocultarMano = (mano: ManoVisual): void => {
    mano.grupo.visible = false;
  };

  /** Puntos de la mano en la escena para este fotograma, o null si no se puede dibujar. Actualiza la pose ajustada. */
  const calcularPuntos = (mano: ManoVisual, detectada: ManoDetectada, vista: VistaCamara, opciones: OpcionesManos): Vec3[] | null => {
    // Los puntos no válidos se estiman con la anatomía de la mano (no se copian de un fotograma anterior).
    let mundo = estimarPuntosOcultos(detectada.worldLandmarks);
    if (opciones.ajuste && mundo) {
      // Ajuste del modelo articulado: la pose sale de los landmarks, con límites anatómicos (SPEC 5.5).
      const confianza = detectada.worldLandmarks.map(() => detectada.score ?? 1);
      const ajuste = ajustarMano(
        { puntos: detectada.worldLandmarks, confianza, lado: detectada.label },
        mano.pose,
        opciones.limites,
      );
      mano.pose = ajuste ? ajuste.parametros : null;
      if (ajuste) mundo = ajuste.puntos;
    } else {
      mano.pose = null;
    }
    return mundo ? puntosManoMundo(detectada.landmarks, mundo, vista) : null;
  };

  /** Viste la mano con el guante en estos puntos: solo cambian posiciones, giros y escalas de las piezas. */
  const dibujar = (mano: ManoVisual, puntos: Vec3[]): void => {
    mano.grupo.visible = true;
    const muneca = puntos[0];
    // El puño sigue a la muñeca aunque la palma sea degenerada (así la posición de la mano nunca se pierde).
    mano.puno.position.set(muneca.x, muneca.y, muneca.z);
    const palma = sistemaPalma(puntos);
    if (!palma) return;

    rotacion.makeBasis(ejeX, ejeY, ejeZ);
    mano.puno.quaternion.setFromRotationMatrix(rotacion);
    mano.palma.position.copy(mano.puno.position);
    mano.palma.quaternion.copy(mano.puno.quaternion);
    // Palma en unidades de ancho y largo; su grosor (z) va en metros y no cambia.
    mano.palma.scale.set(palma.ancho, palma.largo, 1);

    // Segmentos: de una articulación a la siguiente, estirados a lo largo del hueso. El radio no cambia.
    SEGMENTOS.forEach(([a, b], k) => {
      salida.copy(v(puntos[b], vb)).sub(v(puntos[a], va));
      const largo = salida.length();
      if (largo < 1e-6) {
        mano.segmentos.setMatrixAt(k, matriz.makeScale(0, 0, 0));
        return;
      }
      salida.divideScalar(largo);
      const grosor = k === 0 ? GROSOR_BASE_PULGAR : 1;
      matriz.copy(orientar(salida)).scale(escalaV.set(grosor, largo, grosor));
      matriz.setPosition(puntos[a].x, puntos[a].y, puntos[a].z);
      mano.segmentos.setMatrixAt(k, matriz);
    });
    mano.segmentos.instanceMatrix.needsUpdate = true;

    // Fuelles: centrados en la articulación y orientados según la bisectriz del doblez.
    FUELLES.forEach(([j, siguiente], k) => {
      salida.copy(v(puntos[siguiente], vb)).sub(v(puntos[j], va)).normalize();
      if (NUDILLOS.has(j)) entrada.copy(ejeY);
      else entrada.copy(v(puntos[j], va)).sub(v(puntos[j - 1], vb)).normalize();
      entrada.add(salida);
      if (entrada.lengthSq() < 1e-10) entrada.copy(salida);
      entrada.normalize();
      matriz.copy(orientar(entrada)).setPosition(puntos[j].x, puntos[j].y, puntos[j].z);
      mano.fuelles.setMatrixAt(k, matriz);
    });
    mano.fuelles.instanceMatrix.needsUpdate = true;

    // Puntas: terminan en el landmark de la punta y miran en la dirección del último segmento.
    PUNTAS.forEach(([punta, anterior], k) => {
      salida.copy(v(puntos[punta], vb)).sub(v(puntos[anterior], va));
      if (salida.lengthSq() < 1e-12) salida.copy(ejeY);
      salida.normalize();
      matriz.copy(orientar(salida)).setPosition(puntos[punta].x, puntos[punta].y, puntos[punta].z);
      mano.puntas.setMatrixAt(k, matriz);
    });
    mano.puntas.instanceMatrix.needsUpdate = true;
  };

  return {
    objeto: raiz,
    actualizar(detectadas, vista, opciones) {
      for (const lado of ['Left', 'Right'] as const) {
        const mano = manos[lado];
        // Solo se desplaza la posición en x de la mano; su tamaño y forma no cambian.
        mano.grupo.position.x = (lado === 'Left' ? -1 : 1) * (opciones.separacion / 2);
        const detectada = detectadas.find((d) => d.label === lado);
        const puntos = detectada ? calcularPuntos(mano, detectada, vista, opciones) : null;

        if (!puntos) {
          // Sin detección válida: la mano se queda en su última posición hasta `tiempoOcultarS`; después desaparece.
          const dentroDelTiempo =
            mano.ultimaDeteccionS !== null && opciones.ahoraS - mano.ultimaDeteccionS <= opciones.tiempoOcultarS;
          if (!dentroDelTiempo) {
            ocultarMano(mano);
            mano.pose = null;
            mano.ultimaDeteccionS = null;
            mano.deslizar = null;
          }
          continue;
        }

        // Reaparición tras ocultarse: aparece donde la detecta la cámara. Solo se desliza si el salto es menor al umbral.
        if (mano.ultimaDeteccionS === null) {
          const previos = mano.ultimosPuntos;
          const salto = previos ? distancia(previos[0], puntos[0]) : Infinity;
          mano.deslizar = previos && salto < opciones.umbralSaltoM ? { desde: previos, inicioS: opciones.ahoraS } : null;
        }
        mano.ultimaDeteccionS = opciones.ahoraS;

        let dibujo = puntos;
        if (mano.deslizar) {
          const t = Math.min(1, (opciones.ahoraS - mano.deslizar.inicioS) / DURACION_DESLIZAR_S);
          dibujo = puntos.map((p, i) => mezclar(mano.deslizar!.desde[i], p, t));
          if (t >= 1) mano.deslizar = null;
        }
        mano.ultimosPuntos = puntos;
        dibujar(mano, dibujo);
      }
    },
    ocultar() {
      for (const mano of [manos.Left, manos.Right]) {
        ocultarMano(mano);
        mano.pose = null;
        mano.ultimaDeteccionS = null;
        mano.deslizar = null;
      }
    },
  };
}
