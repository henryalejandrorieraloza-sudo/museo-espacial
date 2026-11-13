// Muestras de color con la luz de la escena lunar (solo desarrollo, no entra en el build). Sirve para calibrar los
// colores de material del LRV y del LM: cada parche es una placa de 0.32 m de cara a la cámara, a 3 m, con el Sol a
// ~35° por detrás de la cámara, como una cara bien iluminada de los modelos.
//
// Parámetros: `c` = colores de material separados por comas (hex sin #); `m` = acabado de cada uno ("o" opaco,
// "m" metal, "s" satinado, "r" rejilla). Rejilla de 6 columnas: el parche i queda centrado en el píxel
// (640 + (i % 6 − 2.5) · 87.3, 360 − (1.5 − ⌊i / 6⌋) · 87.3) de una captura de 1280 × 720.

import * as THREE from 'three';
import { DIRECCION_SOL } from '../../../src/visual/cielo.ts';
import { crearEscenaLuna, crearPostprocesoLuna, EXPOSICION_LUNA, LEJANO_CAMARA_LUNA_M } from '../../../src/visual/lunaEscena.ts';
import { alturaLuna } from '../../../src/visual/lunaTerreno.ts';
import { Lote } from '../../../src/visual/paleta.ts';

const params = new URLSearchParams(location.search);
const colores = (params.get('c') ?? 'ffffff').split(',').map((h) => parseInt(h, 16));
const acabados = (params.get('m') ?? '').split(',');
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

// Lejos del LM y del LRV, mirando de espaldas al Sol con 35° de desvío.
const solPlano = new THREE.Vector3(DIRECCION_SOL.x, 0, DIRECCION_SOL.z).normalize();
const haciaCamara = solPlano.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(35));
const x = -40;
const z = 30;
camara.position.set(x, alturaLuna(x, z) + 1.6, z);
camara.lookAt(camara.position.clone().sub(haciaCamara));
camara.updateMatrixWorld(true);

const PASO = 0.42;
const lote = new Lote(false);
const acabado = { m: 'metal', s: 'satinado', r: 'rejilla' } as const;
colores.forEach((color, i) => {
  const m = acabado[acabados[i] as keyof typeof acabado];
  lote.pieza(new THREE.BoxGeometry(0.32, 0.32, 0.02), color, { p: [((i % 6) - 2.5) * PASO, (1.5 - Math.floor(i / 6)) * PASO, -3], ...(m ? { m } : {}) });
});
const muestras = lote.construir();
muestras.position.copy(camara.position);
muestras.quaternion.copy(camara.quaternion);
luna.add(muestras);

luna.userData.actualizar?.(camara);
const post = crearPostprocesoLuna(renderer, escena, camara);
post.ajustar(ANCHO, ALTO);
post.render();
requestAnimationFrame(() => {
  post.render();
  document.title = 'listo';
});
