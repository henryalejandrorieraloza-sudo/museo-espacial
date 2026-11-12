// Manos del avatar en primera persona (SPEC 5.5 y 8.1): replican la mano real con sus gestos.
// Se dibujan como guantes de traje espacial low poly (guante.ts, spec-visual-museo §9).
// Cuelgan de la cámara de la escena, que está en la webcam.
// Pérdida momentánea: la mano se queda en su última posición. Solo desaparece tras `tiempoOcultarS` sin detección.
// Los puntos ocultos se estiman con un modelo anatómico, no se copian de un fotograma anterior.

import * as THREE from 'three';
import { estimarPuntosOcultos, puntosManoMundo, type PuntoMano, type Vec3, type VistaCamara } from './manosGeometria.ts';
import { ajustarMano, type TablaLimites } from './manoModelo.ts';
import {
  actualizarDedos,
  actualizarPalma,
  actualizarTenar,
  anilloDedo,
  crearGeometriasGuante,
  RADIO_SEGMENTO,
  type GeometriasGuante,
} from './guante.ts';
import type { PuntoMundo } from '../tracking/tracker';

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
  /** Palma: geometría dinámica en el espacio del grupo (ver actualizarPalma). */
  palma: THREE.Mesh;
  /** z del dorso de la mano (+1 o −1). */
  ladoDorso: 1 | -1;
  /** Cuña tenar: de la muñeca a la base del pulgar. */
  tenar: THREE.Mesh;
  /** Los cinco dedos en un solo tubo cerrado por dedo (ver actualizarDedos). */
  dedos: THREE.Mesh;
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

  const crearMano = (lado: 'Left' | 'Right'): ManoVisual => {
    const grupo = new THREE.Group();
    // Parche en el dorso. Con z = x × y (sistemaPalma), en el modelo de manoModelo.ts la cara palmar de la mano
    // izquierda queda en +z, así que su dorso está en −z; la derecha está reflejada y su dorso queda en +z.
    const piezas = lado === 'Left' ? geo.dorsoNegativo : geo.dorsoPositivo;
    const puno = new THREE.Mesh(piezas.puno, geo.material);
    const palma = new THREE.Mesh(piezas.palma.clone(), geo.material);
    palma.frustumCulled = false;
    const tenar = new THREE.Mesh(geo.tenar.clone(), geo.material);
    tenar.frustumCulled = false;
    const dedos = new THREE.Mesh(piezas.dedos.clone(), geo.material);
    dedos.frustumCulled = false;
    // El puño va primero: es el nodo de la muñeca.
    grupo.add(puno, palma, tenar, dedos);
    grupo.visible = false;
    raiz.add(grupo);
    return { grupo, puno, palma, ladoDorso: lado === 'Left' ? -1 : 1, tenar, dedos, pose: null, ultimaDeteccionS: null, ultimosPuntos: null, deslizar: null };
  };

  const manos: Record<'Left' | 'Right', ManoVisual> = { Left: crearMano('Left'), Right: crearMano('Right') };

  // Vectores y matrices reutilizados: el dibujo de cada fotograma no reserva memoria nueva.
  const ejeX = new THREE.Vector3();
  const ejeY = new THREE.Vector3();
  const ejeZ = new THREE.Vector3();
  const mcpTmp = [0, 1, 2, 3].map(() => new THREE.Vector3());
  const puntosV = Array.from({ length: 21 }, () => new THREE.Vector3());
  const centro = new THREE.Vector3();
  const va = new THREE.Vector3();
  const vb = new THREE.Vector3();
  const dirPulgar = new THREE.Vector3();
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
    // Palma: sus vértices se escriben en el espacio del grupo (sin transformación). El borde superior pasa por los
    // 4 MCP reales, que no se mueven: ahí nace cada dedo.
    const posPalma = mano.palma.geometry.getAttribute('position') as THREE.BufferAttribute;
    actualizarPalma(
      posPalma.array as Float32Array,
      mano.ladoDorso,
      v(muneca, vb),
      ejeX,
      ejeY,
      ejeZ,
      palma.ancho,
      palma.largo,
      [5, 9, 13, 17].map((j, k) => v(puntos[j], mcpTmp[k])),
    );
    posPalma.needsUpdate = true;

    // Los 21 puntos como vectores (los MCP y la muñeca no se mueven después de esto).
    puntos.forEach((q, i) => puntosV[i].set(q.x, q.y, q.z));

    // Cuña tenar: de la muñeca al anillo base del pulgar. Ese anillo es el primer anillo del tubo del pulgar (mismos
    // vértices): se calcula con la misma función y las mismas entradas.
    dirPulgar.subVectors(puntosV[3], puntosV[2]);
    if (dirPulgar.lengthSq() > 1e-12) {
      dirPulgar.normalize();
      const anillo = anilloDedo(puntosV[2], dirPulgar, null, RADIO_SEGMENTO[2], ejeX);
      const pos = mano.tenar.geometry.getAttribute('position') as THREE.BufferAttribute;
      actualizarTenar(pos.array as Float32Array, puntosV[0], ejeX, ejeZ, anillo);
      pos.needsUpdate = true;
      mano.tenar.visible = true;
    } else {
      mano.tenar.visible = false;
    }

    // Dedos: un tubo cerrado por dedo, desde su MCP, con anillos compartidos en cada unión.
    const posDedos = mano.dedos.geometry.getAttribute('position') as THREE.BufferAttribute;
    actualizarDedos(posDedos.array as Float32Array, puntosV, ejeX);
    posDedos.needsUpdate = true;
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
