// Escena mínima para fotografiar el LRV en la Luna (solo desarrollo, no entra en el build).
// Usa las mismas piezas que el juego: crearEscenaLuna, colocarLRV, el render de dos pasadas y la cámara de 60°.
//
// Parámetros de la URL:
// - vista: "tres_cuartos" (por defecto), "lado", "frente" o "asiento" (ojos del comandante).
// - direccion: ángulo de dirección de las ruedas en grados (+ = derecha), como game/luna.ts. Por defecto 0.
// - avance: metros que rueda el LRV antes de la foto (para ver la rodadura). Por defecto 0.
// Cuando termina de dibujar, el título de la página pasa a "listo".

import * as THREE from 'three';
import { colocarLRV, crearEscenaLuna, crearPostprocesoLuna, EXPOSICION_LUNA, LEJANO_CAMARA_LUNA_M, ojosEnLRV } from '../../../src/visual/lunaEscena.ts';
import type { RuedasLRV } from '../../../src/visual/lrv.ts';
import { alturaLuna } from '../../../src/visual/lunaTerreno.ts';
import { LRV_ESTACIONADO } from '../../../src/visual/sitioApollo17.ts';

const params = new URLSearchParams(location.search);
const vista = params.get('vista') ?? 'tres_cuartos';
const direccion = Number(params.get('direccion') ?? 0);
const avance = Number(params.get('avance') ?? 0);

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
const lrv = luna.getObjectByName('lrv_placeholder')!;
const ruedas = lrv.userData.ruedas as RuedasLRV;
const { x, z, rumbo } = LRV_ESTACIONADO;
colocarLRV(lrv, x, z, rumbo);
// Las ruedas llegan al ángulo y ruedan `avance` metros, a 30 fotogramas por segundo.
const pasos = 60;
for (let i = 0; i < pasos; i++) ruedas.actualizar(direccion, avance / pasos, 1 / 30);

// Cámara: alrededor del LRV, en sus ejes (frente hacia −Z).
const enLRV = (lx: number, ly: number, lz: number): THREE.Vector3 => new THREE.Vector3(lx, ly, lz).applyMatrix4(lrv.matrixWorld);
lrv.updateMatrixWorld(true);
if (vista === 'asiento') {
  ojosEnLRV(lrv, camara.position);
  camara.lookAt(enLRV(-0.6, 0.2, -2.5));
} else {
  const lugar = vista === 'lado' ? enLRV(-4.2, 1.3, 0) : vista === 'frente' ? enLRV(0.6, 1.2, -4.2) : enLRV(-3.4, 1.9, -3.2);
  lugar.y = Math.max(lugar.y, alturaLuna(lugar.x, lugar.z) + 0.4);
  camara.position.copy(lugar);
  camara.lookAt(enLRV(0, 0.55, 0));
}
luna.userData.actualizar?.(camara);
const post = crearPostprocesoLuna(renderer, escena, camara);
post.ajustar(ANCHO, ALTO);
// Dos fotogramas: el primero prepara sombras y shaders.
post.render();
requestAnimationFrame(() => {
  post.render();
  document.title = 'listo';
});
