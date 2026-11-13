// Escena para fotografiar el LRV y el LM en la Luna (solo desarrollo, no entra en el build).
// Usa las mismas piezas que el juego: crearEscenaLuna, el render de dos pasadas y la cámara de 60°.
//
// Parámetro `vista`: "llegada" (cámara del jugador al entrar en la misión, LLEGADA a 1.6 m), "lrv" (tres cuartos de
// cerca), "rueda" (rueda delantera izquierda), "lm" (tres cuartos del LM), "lm_frente" (escalera y escotilla) o
// "lm_cerca" (pata y etapa de ascenso); "lrv_frente", "lrv_lado", "lm_lado" y "lm_abajo"; "lm_sol", "lm_sol_cerca" y "pata_sol", desde el lado iluminado. Cuando termina de dibujar, el título de la página pasa a "listo".

import * as THREE from 'three';
import { crearEscenaLuna, crearPostprocesoLuna, EXPOSICION_LUNA, LEJANO_CAMARA_LUNA_M } from '../../../src/visual/lunaEscena.ts';
import { alturaLuna } from '../../../src/visual/lunaTerreno.ts';
import { LLEGADA } from '../../../src/visual/sitioApollo17.ts';
import { crearDespliegueLRV } from '../../../src/visual/despliegueLRV.ts';
import { DURACION_DESPLIEGUE_LRV_S } from '../../../src/visual/despliegueApollo17.ts';

const vista = new URLSearchParams(location.search).get('vista') ?? 'llegada';
const ANCHO = 1280;
const ALTO = 720;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(ANCHO, ALTO);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = EXPOSICION_LUNA;
document.body.appendChild(renderer.domElement);

const escena = new THREE.Scene();
const camara = new THREE.PerspectiveCamera(60, ANCHO / ALTO, 0.05, LEJANO_CAMARA_LUNA_M);
const luna = crearEscenaLuna();
escena.add(luna);
escena.updateMatrixWorld(true);
const lrv = luna.getObjectByName('lrv_placeholder')!;
const lm = luna.getObjectByName('lm_challenger')!;
// `despliegue`: fracción (0–1) del despliegue del LRV desde la bahía del LM; sin él, el LRV queda estacionado.
const despliegue = new URLSearchParams(location.search).get('despliegue');
if (despliegue !== null) {
  crearDespliegueLRV(lrv).aplicar(Number(despliegue) * DURACION_DESPLIEGUE_LRV_S, 0);
  escena.updateMatrixWorld(true);
}
const en = (o: THREE.Object3D, x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z).applyMatrix4(o.matrixWorld);

const colocar = (lugar: THREE.Vector3, objetivo: THREE.Vector3): void => {
  lugar.y = Math.max(lugar.y, alturaLuna(lugar.x, lugar.z) + 0.3);
  camara.position.copy(lugar);
  camara.lookAt(objetivo);
};

if (vista === 'llegada') {
  const a = THREE.MathUtils.degToRad(LLEGADA.azimutMirada);
  camara.position.set(LLEGADA.x, alturaLuna(LLEGADA.x, LLEGADA.z) + 1.6, LLEGADA.z);
  camara.lookAt(camara.position.clone().add(new THREE.Vector3(Math.sin(a), -0.08, -Math.cos(a))));
} else if (vista === 'lrv') colocar(en(lrv, -3.0, 1.7, -2.8), en(lrv, 0, 0.6, 0));
else if (vista === 'lrv_frente') colocar(en(lrv, 0.8, 1.3, -4.6), en(lrv, 0, 0.6, 0));
else if (vista === 'lrv_lado') colocar(en(lrv, -4.6, 1.2, 0.2), en(lrv, 0, 0.6, 0));
else if (vista === 'lm_lado') colocar(en(lm, 9.5, 3.0, 2.5), en(lm, 0, 3.0, 0));
else if (vista === 'lm_ascenso') colocar(en(lm, 1.2, 4.8, -5.2), en(lm, 0, 4.4, -1.0));
else if (vista === 'lm_abajo') colocar(en(lm, 3.2, 0.5, 5.2), en(lm, 0, 2.0, 0));
else if (vista === 'lrv_atras') colocar(en(lrv, 2.6, 1.9, 3.2), en(lrv, 0, 0.6, 0));
else if (vista === 'rueda') colocar(en(lrv, -1.9, 0.7, -2.0), en(lrv, -0.92, 0.42, -1.14));
else if (vista === 'lm') colocar(en(lm, -9, 3.2, -10), en(lm, 0, 3.2, 0));
else if (vista === 'lm_frente') colocar(en(lm, 1.5, 2.6, -8.5), en(lm, 0, 3.0, 0));
else if (vista === 'lm_cerca') colocar(en(lm, 5.5, 2.2, -5.5), en(lm, 1.8, 2.6, -1.5));
// Desde el este (detrás del LM, +Z): es el lado que ilumina el Sol de la mañana.
else if (vista === 'bahia') colocar(en(lm, -7.5, 3.5, -4.5), en(lm, -1.6, 2.2, -1.6));
else if (vista === 'lm_sol') colocar(en(lm, 7.5, 3.0, 9.5), en(lm, 0, 3.2, 0));
else if (vista === 'lm_sol_cerca') colocar(en(lm, 4.2, 4.6, 5.2), en(lm, 0.6, 4.4, 0.3));
else if (vista === 'pata_sol') colocar(en(lm, 2.0, 1.4, 6.8), en(lm, 0, 1.2, 3.6));

// `luz=frente`: luz extra desde delante de la cámara, solo para revisar formas que el Sol deja a contraluz.
if (new URLSearchParams(location.search).get('luz') === 'frente') {
  const luz = new THREE.DirectionalLight(0xffffff, 2.5);
  luz.position.copy(camara.position).add(new THREE.Vector3(0, 2, 0));
  luz.target.position.copy(lm.getWorldPosition(new THREE.Vector3()));
  luna.add(luz, luz.target);
}
luna.userData.actualizar?.(camara);
const post = crearPostprocesoLuna(renderer, escena, camara);
post.ajustar(ANCHO, ALTO);
post.render();
requestAnimationFrame(() => {
  post.render();
  document.title = 'listo';
});
