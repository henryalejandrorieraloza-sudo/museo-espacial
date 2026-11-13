// Cuenta triángulos, mallas y materiales del LRV y del LM, y da su caja envolvente, los nombres de los nodos y las
// constantes de anclaje que usa el juego (solo desarrollo).
import * as THREE from 'three';
import { BATALLA_LRV, BISAGRA_DELANTERA_LRV, OJOS_COMANDANTE, RUEDAS_LRV, VIA_LRV, crearLRVLuna } from '../../../src/visual/lrv.ts';
import { crearModuloLunar } from '../../../src/visual/moduloLunar.ts';

function contar(nombre: string, raiz: THREE.Object3D): string {
  let tri = 0;
  let mallas = 0;
  const materiales = new Set<THREE.Material>();
  const nodos: string[] = [];
  raiz.traverse((o) => {
    if (o.name) nodos.push(o.name);
    if (!(o instanceof THREE.Mesh)) return;
    mallas++;
    const g = o.geometry as THREE.BufferGeometry;
    tri += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => materiales.add(m));
  });
  raiz.updateMatrixWorld(true);
  const caja = new THREE.Box3().setFromObject(raiz);
  const t = caja.getSize(new THREE.Vector3());
  const f = (v: THREE.Vector3): string => `(${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`;
  return `${nombre}: ${tri} triángulos, ${mallas} mallas, ${materiales.size} materiales\n  caja ${f(caja.min)} → ${f(caja.max)}, tamaño ${f(t)}\n  nodos: ${nodos.join(', ')}`;
}

const dir = new THREE.Vector3(0.3, 0.8, -0.5);
const anclajes = `anclajes: OJOS_COMANDANTE ${JSON.stringify(OJOS_COMANDANTE)} BISAGRA ${JSON.stringify(BISAGRA_DELANTERA_LRV)} RUEDAS ${JSON.stringify(RUEDAS_LRV)} BATALLA ${BATALLA_LRV} VIA ${VIA_LRV}`;
document.getElementById('salida')!.textContent = [contar('LRV', crearLRVLuna(dir)), contar('LM', crearModuloLunar(dir)), anclajes].join('\n\n');
document.title = 'listo';
