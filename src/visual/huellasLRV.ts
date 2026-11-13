import * as THREE from 'three';
import { ANCHO_RUEDA_LRV, VIA_LRV } from './lrv';

// Huellas de las ruedas del LRV: una cinta oscura por lado que crece mientras el LRV avanza. La usan la presentación
// del LRV (presentacionLRV.ts, escena del mando) y la escena lunar (las rodadas que deja el jugador y las que se ven
// desde el módulo de ascenso en la cinemática del despegue). Cada una pasa la altura de su propio suelo.

export interface HuellasLRV {
  grupo: THREE.Group;
  /** Borra todas las huellas. */
  vaciar(): void;
  /** Añade un punto con el centro del LRV en (x, z) y su `rumbo` (rad, + = hacia la izquierda, como rotation.y). */
  poner(x: number, z: number, rumbo: number): void;
  /** Igual que `poner`, pero solo si el LRV se movió al menos la separación mínima desde el último punto. */
  anadir(x: number, z: number, rumbo: number): void;
}

/**
 * `altura(x, z)`: altura del suelo en ese punto (m). `maxPuntos`: puntos por cinta (al llenarse, deja de crecer).
 * `separacionM`: distancia mínima entre puntos para `anadir`.
 */
export function crearHuellasLRV(altura: (x: number, z: number) => number, maxPuntos: number, separacionM: number): HuellasLRV {
  const grupo = new THREE.Group();
  grupo.name = 'huellas_dinamicas';
  const material = new THREE.MeshStandardMaterial({
    color: 0x4e4c48,
    transparent: true,
    opacity: 0.7,
    roughness: 1,
    metalness: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  });
  const medio = ANCHO_RUEDA_LRV / 2;
  interface Cinta {
    lado: number;
    pos: Float32Array;
    geo: THREE.BufferGeometry;
    n: number;
  }
  const cintas: Cinta[] = [-1, 1].map((lado) => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(maxPuntos * 2 * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    const indices: number[] = [];
    for (let k = 0; k < maxPuntos - 1; k++) {
      const a = k * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(indices);
    geo.setDrawRange(0, 0);
    const malla = new THREE.Mesh(geo, material);
    malla.frustumCulled = false;
    malla.receiveShadow = true;
    grupo.add(malla);
    return { lado, pos, geo, n: 0 };
  });
  let ultimo: [number, number] | null = null;
  const poner = (x: number, z: number, rumbo: number): void => {
    const c = Math.cos(rumbo);
    const sn = Math.sin(rumbo);
    for (const cinta of cintas) {
      if (cinta.n >= maxPuntos) continue;
      // Centro de la rueda de ese lado y eje lateral (la derecha del LRV).
      const cx = x + cinta.lado * (VIA_LRV / 2) * c;
      const cz = z - cinta.lado * (VIA_LRV / 2) * sn;
      for (const s of [-1, 1]) {
        const px = cx + s * medio * c;
        const pz = cz - s * medio * sn;
        const k = (cinta.n * 2 + (s < 0 ? 0 : 1)) * 3;
        cinta.pos[k] = px;
        cinta.pos[k + 1] = altura(px, pz) + 0.02;
        cinta.pos[k + 2] = pz;
      }
      cinta.n++;
      cinta.geo.setDrawRange(0, Math.max(0, cinta.n - 1) * 6);
      cinta.geo.attributes.position.needsUpdate = true;
    }
    ultimo = [x, z];
  };
  return {
    grupo,
    vaciar() {
      for (const cinta of cintas) {
        cinta.n = 0;
        cinta.geo.setDrawRange(0, 0);
      }
      ultimo = null;
    },
    poner,
    anadir(x, z, rumbo) {
      if (ultimo && Math.hypot(x - ultimo[0], z - ultimo[1]) < separacionM) return;
      poner(x, z, rumbo);
    },
  };
}
