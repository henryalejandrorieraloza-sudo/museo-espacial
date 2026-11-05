import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { Lote, azar, geometriaRoca, tinte } from './paleta';

// Ambiente del museo: luces, niebla, nebulosa, asteroides, astro de fondo y bloom.
// Nada de esto se aplica en las misiones: museo.ts lo activa solo mientras se está en el museo.

/** Niebla púrpura: da profundidad sin tapar la sala. */
const COLOR_NIEBLA = 0x2a1458;
const DENSIDAD_NIEBLA = 0.016;
/** Bloom: solo florece lo que supera el umbral, es decir, los materiales emisivos del lote. */
const BLOOM_FUERZA = 0.3;
const BLOOM_RADIO = 0.5;
const BLOOM_UMBRAL = 1.2;
export const EXPOSICION = 1.0;
/** Tope de resolución del museo: el bloom y el antialias a resolución Retina competirían con el seguimiento. */
const PIXELES_MAXIMOS = 1.25;
/** Dirección del sol visible por los ventanales (hacia él). */
const POSICION_SOL = new THREE.Vector3(-40, 23, -46);

export interface AmbienteMuseo {
  /** Luces y fondo espacial. Se oculta en las misiones. */
  grupo: THREE.Group;
  /** Luz neutra de corto alcance que va con la cámara: mantiene las manos en su color y legibles. */
  luzManos: THREE.PointLight;
  fondo: THREE.Texture;
  niebla: THREE.FogExp2;
  actualizar(t: number): void;
}

export interface Postproceso {
  render(): void;
  ajustar(ancho: number, alto: number): void;
}

const NEBULOSA_VS = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const NEBULOSA_FS = /* glsl */ `
  varying vec3 vDir;
  uniform vec3 dirSol;
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float ruido(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 6; i++) {
      v += a * ruido(p);
      p = p * 2.03 + vec3(11.3, 4.1, 7.7);
      a *= 0.5;
    }
    return v;
  }
  void main() {
    vec3 d = normalize(vDir);
    vec3 desvio = vec3(fbm(d * 1.7 + 3.1), fbm(d * 1.7 + 9.2), fbm(d * 1.7 + 17.4));
    float a = fbm(d * 2.1 + desvio * 2.2);
    float b = fbm(d * 3.4 - desvio * 1.6 + 21.0);
    vec3 color = vec3(0.012, 0.007, 0.05);
    // Púrpura y verde en grandes regiones, con azul profundo en la transición.
    float region = smoothstep(0.4, 0.6, fbm(d * 1.25 + 5.3));
    vec3 tono = mix(vec3(0.012, 0.24, 0.14), vec3(0.26, 0.018, 0.56), region);
    color += tono * pow(smoothstep(0.44, 0.74, a), 1.8) * 1.5;
    color += vec3(0.03, 0.05, 0.3) * smoothstep(0.3, 0.7, b * a * 1.9) * 0.5;
    // Resplandor cálido alrededor del sol.
    float sol = max(dot(d, dirSol), 0.0);
    color += vec3(1.0, 0.3, 0.04) * pow(sol, 40.0) * 0.32 * (0.35 + a);
    // Estrellas: una por celda, con brillo variable.
    vec3 celda = floor(d * 240.0);
    float h = hash(celda);
    if (h > 0.982) {
      vec3 centro = (celda + 0.5) / 240.0;
      float dist = length(d - normalize(centro));
      color += vec3(0.9, 0.92, 1.0) * smoothstep(0.0018, 0.0003, dist) * (h - 0.982) * 55.0;
    }
    gl_FragColor = vec4(color, 1.0);
  }
`;

/** Pinta la nebulosa una sola vez en un cubemap: en tiempo de juego el fondo no cuesta casi nada. */
function hornearNebulosa(renderer: THREE.WebGLRenderer): THREE.Texture {
  const destino = new THREE.WebGLCubeRenderTarget(1024, { type: THREE.HalfFloatType });
  const camaraCubo = new THREE.CubeCamera(0.1, 10, destino);
  const temporal = new THREE.Scene();
  const geometria = new THREE.SphereGeometry(5, 32, 16);
  const material = new THREE.ShaderMaterial({
    vertexShader: NEBULOSA_VS,
    fragmentShader: NEBULOSA_FS,
    side: THREE.BackSide,
    uniforms: { dirSol: { value: POSICION_SOL.clone().normalize() } },
  });
  temporal.add(new THREE.Mesh(geometria, material));
  camaraCubo.update(renderer, temporal);
  geometria.dispose();
  material.dispose();
  return destino.texture;
}

/** Cinturón de asteroides con InstancedMesh: tres formas, muchas copias. */
function crearAsteroides(): THREE.Group {
  const grupo = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.85, metalness: 0.15, fog: false });
  const colores = [0xc9913f, 0xe0b35a, 0x7a5a48, 0x5d4c6e, 0x3f8f7c, 0xa0693f];
  const rnd = azar(42);
  const matriz = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const color = new THREE.Color();
  for (const [semilla, cantidad] of [
    [3, 70],
    [5, 60],
    [11, 50],
  ] as const) {
    const instancias = new THREE.InstancedMesh(geometriaRoca(semilla, 1), material, cantidad);
    for (let i = 0; i < cantidad; i++) {
      const angulo = rnd() * Math.PI * 2;
      const radio = 31 + rnd() * 41;
      const y = 3 + rnd() * 42;
      // Muchas piedras pequeñas y pocas grandes.
      const tam = 0.3 + Math.pow(rnd(), 3) * 3.1;
      e.set(rnd() * 6, rnd() * 6, rnd() * 6);
      q.setFromEuler(e);
      matriz.compose(
        new THREE.Vector3(Math.cos(angulo) * radio, y, Math.sin(angulo) * radio),
        q,
        new THREE.Vector3(tam * (0.8 + rnd() * 0.5), tam * (0.7 + rnd() * 0.4), tam),
      );
      instancias.setMatrixAt(i, matriz);
      instancias.setColorAt(i, color.setHex(colores[Math.floor(rnd() * colores.length)]));
    }
    instancias.frustumCulled = false;
    grupo.add(instancias);
  }
  return grupo;
}

/** Sol y gigante gaseosa de fondo. Son decoración del espacio exterior, no representan astros concretos. */
function crearAstros(): THREE.Group {
  const l = new Lote(false);
  l.emisiva(new THREE.IcosahedronGeometry(4.2, 2), 0xffb860, 4, { p: POSICION_SOL.toArray(), v: 0.15 });
  const halo = new THREE.CircleGeometry(21, 32);
  const anillo = (p: THREE.Vector3): THREE.Color => tinte(0xff6a20, Math.pow(Math.max(0, 1 - p.length() / 21), 3.4) * 0.24);
  const q = new THREE.Object3D();
  q.position.copy(POSICION_SOL);
  q.lookAt(0, 0, 0);
  l.aditiva(halo, anillo, { p: POSICION_SOL.toArray(), r: [q.rotation.x, q.rotation.y, q.rotation.z] });

  const posGigante: [number, number, number] = [46, 28, -50];
  const bandas = (c: THREE.Vector3): number => {
    const fila = Math.floor((c.y + 10) * 0.65);
    return [0xd98a48, 0xe9b873, 0xb9603a, 0xf0cf98][fila % 4];
  };
  l.pieza(new THREE.IcosahedronGeometry(9, 3), bandas, { p: posGigante, r: [0.3, 0, 0.25], v: 0.1 });
  l.pieza(new THREE.TorusGeometry(15, 2.6, 2, 40), 0x9d6a8c, { p: posGigante, r: [Math.PI / 2 + 0.3, 0.25, 0], e: [1, 1, 0.08], v: 0.25 });
  return l.construir();
}

export function crearAmbienteMuseo(renderer: THREE.WebGLRenderer, camara: THREE.Camera): AmbienteMuseo {
  const grupo = new THREE.Group();

  // Luz principal ámbar. Va en diagonal desde atrás del jugador para que caliente lo que mira;
  // el sol visible por los ventanales queda en otra dirección a propósito (licencia artística).
  const principal = new THREE.DirectionalLight(0xffb566, 1.9);
  principal.position.set(-7, 10, 6);
  // Relleno púrpura: nunca deja una cara en negro.
  const relleno = new THREE.HemisphereLight(0xd090ff, 0x5a2a78, 1.05);
  // Contorno cian desde el lado contrario.
  const contorno = new THREE.DirectionalLight(0x5fe4ff, 0.28);
  contorno.position.set(8, 3, -7);
  grupo.add(principal, relleno, contorno);

  const luzManos = new THREE.PointLight(0xfff0dc, 1.9, 2.2, 1.4);
  luzManos.position.set(0, 0.25, 0.15);
  camara.add(luzManos);

  const asteroides = crearAsteroides();
  grupo.add(asteroides, crearAstros());

  return {
    grupo,
    luzManos,
    fondo: hornearNebulosa(renderer),
    niebla: new THREE.FogExp2(COLOR_NIEBLA, DENSIDAD_NIEBLA),
    actualizar(t) {
      asteroides.rotation.y = t * 0.006;
    },
  };
}

/** Render del museo: escena en HDR, bloom por umbral y tone mapping al final. */
export function crearPostproceso(renderer: THREE.WebGLRenderer, escena: THREE.Scene, camara: THREE.Camera): Postproceso {
  const pixeles = Math.min(window.devicePixelRatio, PIXELES_MAXIMOS);
  const destino = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 2 });
  const composer = new EffectComposer(renderer, destino);
  composer.setPixelRatio(pixeles);
  composer.addPass(new RenderPass(escena, camara));
  // El bloom va a un cuarto de resolución: es un resplandor suave y así cuesta mucho menos.
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), BLOOM_FUERZA, BLOOM_RADIO, BLOOM_UMBRAL);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  return {
    render: () => composer.render(),
    ajustar: (ancho, alto) => {
      composer.setSize(ancho, alto);
      bloom.setSize((ancho * pixeles) / 2, (alto * pixeles) / 2);
    },
  };
}
