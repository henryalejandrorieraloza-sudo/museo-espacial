import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { Postproceso } from './ambiente';
import { CAPA_LEJOS, DIRECCION_SOL, DIRECCION_TIERRA, crearCielo } from './cielo';
import { BATALLA_LRV, OJOS_COMANDANTE, RUEDAS_LRV, VIA_LRV, crearLRVLuna } from './lrv';
import { alturaLuna, crearMacizos, crearSuelo } from './lunaTerreno';
import { crearModuloLunar } from './moduloLunar';
import { SUELO_LUNA, geometriaRoca, tinte } from './paleta';
import { crearMaterialRoca } from './regolito';
import { LM, LRV_ESTACIONADO, ROCA_ESTACION1 } from './sitioApollo17';

// Escena lunar de Apollo 17 en Taurus-Littrow (SPEC 8): LM Challenger, LRV estacionado, roca de la estación 1 con el
// halo azul celeste, suelo con curvatura, macizos, Sol, Tierra y estrellas. El LM y el LRV siguen el lenguaje del
// museo (low poly, caras facetadas, lotes de paleta.ts); el suelo busca parecerse a las fotos de Apollo 17 (relieve
// suave, regolito con grano y muchas rocas; ver lunaTerreno.ts y regolito.ts). Luz de la Luna: sin atmósfera, cielo
// negro, sin niebla y sombras duras. No hay figuras humanas ni mentor (SPEC 11: en las misiones el mentor es solo voz).
//
// Render en dos pasadas: primero lo lejano (cielo y macizos, capa CAPA_LEJOS) con planos de recorte de decenas de
// km, y encima lo cercano (suelo, LM, LRV, roca y manos) con su propio búfer de profundidad. Así el suelo de 3 km
// y los macizos a 10 km conviven sin perder precisión de profundidad cerca de la cámara.

/** Sol: luz direccional casi blanca (la luz real del Sol fuera de la atmósfera es blanca), con sombras duras. */
const COLOR_SOL = 0xfff6ec;
const INTENSIDAD_SOL = 9;
/**
 * Relleno de las sombras. En la Luna el cielo es negro: la única luz en la sombra es la que rebota en el suelo
 * iluminado, gris y desde abajo. Por eso las sombras de las fotos son muy oscuras pero no negras del todo.
 */
const COLOR_RELLENO_CIELO = 0x2c2c30;
const COLOR_RELLENO_SUELO = 0x75736e;
const INTENSIDAD_RELLENO = 0.5;
/**
 * Relleno extra solo para el relieve lejano (pasada CAPA_LEJOS): las laderas de los macizos a la sombra reciben la
 * luz que rebota en el valle y en las laderas al sol, de kilómetros de extensión. Sin él se verían negras, como
 * agujeros en la montaña.
 */
const COLOR_RELLENO_LEJOS_CIELO = 0x8a8884;
const COLOR_RELLENO_LEJOS_SUELO = 0x9a9893;
const INTENSIDAD_RELLENO_LEJOS = 1.6;
/** Exposición del tone mapping en la Luna. */
export const EXPOSICION_LUNA = 1.0;
/**
 * Bloom por umbral: solo florece el disco solar (luminancia ~5). El umbral es más alto que en el museo porque aquí
 * el Sol es intenso y las piezas blancas o metálicas al sol llegan a ~2.2; con 1.2 brillarían como si emitieran luz.
 */
const BLOOM_FUERZA = 0.3;
const BLOOM_RADIO = 0.2;
const BLOOM_UMBRAL = 3.0;
const PIXELES_MAXIMOS = 1.25;
/** Halo azul celeste (SPEC 10): color y brillo constantes, sin iluminación ni bloom (no ilumina nada alrededor). */
const COLOR_HALO = 0x87ceeb;
const BRILLO_HALO = 1.3;
const RADIO_HALO = 0.75;
/** Sombras: caja de ±LADO_SOMBRA_M alrededor del jugador, con mapa de TAMANO_MAPA_SOMBRA píxeles. */
const LADO_SOMBRA_M = 36;
const TAMANO_MAPA_SOMBRA = 2048;
/** Plano lejano de la cámara cercana (m): un poco más que el disco de terreno. */
export const LEJANO_CAMARA_LUNA_M = 3600;
/** Planos de la cámara de lo lejano (m). */
const CERCANO_LEJOS_M = 40;
const LEJANO_LEJOS_M = 90_000;

const EJE_Y = new THREE.Vector3(0, 1, 0);

/** Dirección del mundo expresada en los ejes de un objeto cuyo frente (−Z) mira al azimut dado. */
function enEjesDe(direccion: THREE.Vector3, azimutFrente: number): THREE.Vector3 {
  return direccion.clone().applyAxisAngle(EJE_Y, THREE.MathUtils.degToRad(azimutFrente));
}

/** Roca de la estación 1 (~0.9 m, sin identificar como muestra concreta) con el halo azul celeste. */
function crearRocaConHalo(): THREE.Group {
  const grupo = new THREE.Group();
  grupo.name = 'roca_placeholder';
  const material = crearMaterialRoca();
  material.color.setHex(SUELO_LUNA.brecha);
  const roca = new THREE.Mesh(geometriaRoca(31, 1), material);
  roca.position.y = 0.22;
  roca.scale.set(0.5, 0.32, 0.42);
  roca.rotation.set(0.2, 0.7, 0.1);
  roca.castShadow = true;
  roca.receiveShadow = true;
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(RADIO_HALO, RADIO_HALO + 0.05, 48),
    new THREE.MeshBasicMaterial({ color: tinte(COLOR_HALO, BRILLO_HALO), side: THREE.DoubleSide }),
  );
  halo.name = 'halo_roca';
  halo.position.y = 0.3;
  grupo.add(roca, halo);
  grupo.position.set(ROCA_ESTACION1.x, alturaLuna(ROCA_ESTACION1.x, ROCA_ESTACION1.z), ROCA_ESTACION1.z);
  return grupo;
}

const _e = new THREE.Euler();
const _p = new THREE.Vector3();

/**
 * Apoya el LRV en el suelo: altura media de las ruedas, cabeceo y balanceo según el terreno bajo cada rueda.
 * `rumboGrados`: 0 = norte (−Z), positivo = a la derecha (igual que el azimut).
 */
export function colocarLRV(lrv: THREE.Object3D, x: number, z: number, rumboGrados: number): void {
  const giro = -THREE.MathUtils.degToRad(rumboGrados);
  const s = Math.sin(giro);
  const c = Math.cos(giro);
  const alturas = RUEDAS_LRV.map(([rx, rz]) => alturaLuna(x + rx * c + rz * s, z - rx * s + rz * c));
  const [di, dd, ti, td] = alturas;
  const cabeceo = Math.atan2((di + dd - ti - td) / 2, BATALLA_LRV);
  const balanceo = Math.atan2((dd + td - di - ti) / 2, VIA_LRV);
  lrv.position.set(x, (di + dd + ti + td) / 4, z);
  lrv.rotation.copy(_e.set(cabeceo, giro, balanceo, 'YXZ'));
}

/** Posición de los ojos del comandante sentado en el LRV, en el mundo. */
export function ojosEnLRV(lrv: THREE.Object3D, destino: THREE.Vector3): THREE.Vector3 {
  lrv.updateMatrixWorld();
  return destino.set(...OJOS_COMANDANTE).applyMatrix4(lrv.matrixWorld);
}

/** Toda la escena lunar. La cámara del museo la recorre; `userData.actualizar(camara)` mueve cielo y sombras. */
export function crearEscenaLuna(): THREE.Group {
  const grupo = new THREE.Group();

  // Luces: sol ámbar con sombras (ilumina también lo lejano) y relleno púrpura suave.
  const sol = new THREE.DirectionalLight(COLOR_SOL, INTENSIDAD_SOL);
  sol.castShadow = true;
  sol.shadow.mapSize.set(TAMANO_MAPA_SOMBRA, TAMANO_MAPA_SOMBRA);
  const camSombra = sol.shadow.camera;
  camSombra.left = -LADO_SOMBRA_M;
  camSombra.right = LADO_SOMBRA_M;
  camSombra.top = LADO_SOMBRA_M;
  camSombra.bottom = -LADO_SOMBRA_M;
  camSombra.near = 1;
  camSombra.far = 600;
  sol.shadow.bias = -0.0004;
  sol.shadow.normalBias = 0.04;
  const relleno = new THREE.HemisphereLight(COLOR_RELLENO_CIELO, COLOR_RELLENO_SUELO, INTENSIDAD_RELLENO);
  for (const luz of [sol, relleno]) luz.layers.enable(CAPA_LEJOS);
  // Las luces se filtran por las capas de la cámara: esta solo existe en la pasada de lo lejano.
  const rellenoLejos = new THREE.HemisphereLight(COLOR_RELLENO_LEJOS_CIELO, COLOR_RELLENO_LEJOS_SUELO, INTENSIDAD_RELLENO_LEJOS);
  rellenoLejos.layers.set(CAPA_LEJOS);
  grupo.add(sol, sol.target, relleno, rellenoLejos);

  const lm = crearModuloLunar(enEjesDe(DIRECCION_TIERRA, LM.azimutFrente));
  lm.position.set(LM.x, alturaLuna(LM.x, LM.z), LM.z);
  lm.rotation.y = -THREE.MathUtils.degToRad(LM.azimutFrente);

  const lrv = new THREE.Group();
  lrv.name = 'lrv_placeholder';
  const modeloLRV = crearLRVLuna(enEjesDe(DIRECCION_TIERRA, LRV_ESTACIONADO.rumbo));
  lrv.add(modeloLRV);
  // La animación de las ruedas (dirección y rodadura) y el plegado quedan a mano en el grupo que mueve la escena.
  // Al entrar en la escena, visual/despliegueLRV.ts lo pliega en la bahía del LM.
  lrv.userData.ruedas = modeloLRV.userData.ruedas;
  lrv.userData.plegado = modeloLRV.userData.plegado;
  colocarLRV(lrv, LRV_ESTACIONADO.x, LRV_ESTACIONADO.z, LRV_ESTACIONADO.rumbo);

  const cielo = crearCielo();
  grupo.add(crearSuelo(), crearMacizos(), cielo, lm, lrv, crearRocaConHalo());

  // La caja de sombras sigue al jugador, un poco por delante de él, y se ajusta a la rejilla de texels del mapa
  // para que los bordes de las sombras no tiemblen al caminar.
  const derecha = new THREE.Vector3().crossVectors(DIRECCION_SOL, EJE_Y).normalize();
  const arriba = new THREE.Vector3().crossVectors(derecha, DIRECCION_SOL).normalize();
  const texel = (2 * LADO_SOMBRA_M) / TAMANO_MAPA_SOMBRA;
  const adelante = new THREE.Vector3();
  grupo.userData.actualizar = (camara: THREE.Camera): void => {
    cielo.position.copy(camara.position);
    camara.getWorldDirection(adelante).setY(0).normalize();
    _p.copy(camara.position).addScaledVector(adelante, LADO_SOMBRA_M * 0.4);
    _p.y = alturaLuna(_p.x, _p.z);
    const u = Math.round(_p.dot(derecha) / texel) * texel;
    const v = Math.round(_p.dot(arriba) / texel) * texel;
    const w = _p.dot(DIRECCION_SOL);
    sol.target.position.copy(derecha).multiplyScalar(u).addScaledVector(arriba, v).addScaledVector(DIRECCION_SOL, w);
    sol.position.copy(sol.target.position).addScaledVector(DIRECCION_SOL, 300);
    sol.target.updateMatrixWorld();
  };
  return grupo;
}

/** Render de la Luna: lo lejano, lo cercano encima (profundidad limpia), bloom por umbral y tone mapping. */
export function crearPostprocesoLuna(renderer: THREE.WebGLRenderer, escena: THREE.Scene, camara: THREE.PerspectiveCamera): Postproceso {
  const pixeles = Math.min(window.devicePixelRatio, PIXELES_MAXIMOS);
  const camLejos = new THREE.PerspectiveCamera(camara.fov, camara.aspect, CERCANO_LEJOS_M, LEJANO_LEJOS_M);
  camLejos.layers.set(CAPA_LEJOS);
  const destino = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 2 });
  const composer = new EffectComposer(renderer, destino);
  composer.setPixelRatio(pixeles);
  composer.addPass(new RenderPass(escena, camLejos));
  const cerca = new RenderPass(escena, camara);
  cerca.clear = false;
  cerca.clearDepth = true;
  composer.addPass(cerca);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), BLOOM_FUERZA, BLOOM_RADIO, BLOOM_UMBRAL);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  return {
    render: () => {
      camLejos.position.copy(camara.position);
      camLejos.quaternion.copy(camara.quaternion);
      if (camLejos.aspect !== camara.aspect || camLejos.fov !== camara.fov) {
        camLejos.aspect = camara.aspect;
        camLejos.fov = camara.fov;
        camLejos.updateProjectionMatrix();
      }
      composer.render();
    },
    ajustar: (ancho, alto) => {
      composer.setSize(ancho, alto);
      bloom.setSize((ancho * pixeles) / 2, (alto * pixeles) / 2);
    },
  };
}

