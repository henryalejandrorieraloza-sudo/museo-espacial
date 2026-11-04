// Manos del avatar en primera persona (SPEC 5.5 y 8.1): replican la mano real con sus gestos.
// Cuelgan de la cámara de la escena, que está en la webcam.
// Pérdida momentánea: la mano se queda en su última posición. Solo desaparece tras `tiempoOcultarS` sin detección.
// Los puntos ocultos se estiman con un modelo anatómico, no se copian de un fotograma anterior.

import * as THREE from 'three';
import {
  CONEXIONES_MANO,
  HAND_BONE_RADIUS,
  escalaHueso,
  estimarPuntosOcultos,
  puntosManoMundo,
  type PuntoMano,
  type Vec3,
  type VistaCamara,
} from './manosGeometria.ts';
import { ajustarMano, type TablaLimites } from './manoModelo.ts';
import type { PuntoMundo } from '../tracking/tracker';

/** Color de piel (la misma tonalidad que la cabeza del mentor en museo.ts). */
const COLOR_PIEL = 0xe8d2b8;
const ARTICULACIONES = 21;
const ARRIBA = new THREE.Vector3(0, 1, 0);
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
  articulaciones: THREE.Mesh[];
  huesos: THREE.Mesh[];
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
  const material = new THREE.MeshStandardMaterial({ color: COLOR_PIEL, roughness: 0.9, flatShading: true });
  // Radio fijo (HAND_BONE_RADIUS) para articulaciones y huesos: grosor uniforme en todos los dedos.
  const geoArticulacion = new THREE.IcosahedronGeometry(HAND_BONE_RADIUS, 0);
  // Cilindro de altura 1 a lo largo de Y: se estira en longitud y se gira para unir dos puntos. Su radio no cambia.
  const geoHueso = new THREE.CylinderGeometry(HAND_BONE_RADIUS, HAND_BONE_RADIUS, 1, 6);

  const crearMano = (): ManoVisual => {
    const grupo = new THREE.Group();
    const articulaciones = Array.from({ length: ARTICULACIONES }, () => {
      const malla = new THREE.Mesh(geoArticulacion, material);
      grupo.add(malla);
      return malla;
    });
    const huesos = CONEXIONES_MANO.map(() => {
      const malla = new THREE.Mesh(geoHueso, material);
      grupo.add(malla);
      return malla;
    });
    grupo.visible = false;
    raiz.add(grupo);
    return { grupo, articulaciones, huesos, pose: null, ultimaDeteccionS: null, ultimosPuntos: null, deslizar: null };
  };

  const manos: Record<'Left' | 'Right', ManoVisual> = { Left: crearMano(), Right: crearMano() };
  const direccion = new THREE.Vector3();

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

  /** Dibuja la mano con estos puntos: articulaciones en su posición y huesos entre ellas. */
  const dibujar = (mano: ManoVisual, puntos: Vec3[]): void => {
    mano.grupo.visible = true;
    puntos.forEach((p, i) => mano.articulaciones[i].position.set(p.x, p.y, p.z));
    CONEXIONES_MANO.forEach(([a, b], k) => {
      const pa = puntos[a];
      const pb = puntos[b];
      direccion.set(pb.x - pa.x, pb.y - pa.y, pb.z - pa.z);
      const largo = direccion.length();
      const hueso = mano.huesos[k];
      hueso.position.set((pa.x + pb.x) / 2, (pa.y + pb.y) / 2, (pa.z + pb.z) / 2);
      if (largo < 1e-6) {
        hueso.scale.set(0, 0, 0);
        return;
      }
      hueso.quaternion.setFromUnitVectors(ARRIBA, direccion.normalize());
      const e = escalaHueso(largo);
      hueso.scale.set(e.x, e.y, e.z);
    });
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
