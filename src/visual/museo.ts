import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from '../tracking/assets';
import { MODELOS, type ConfigModelo } from './config';

// Toda la parte visual del museo (Three.js). La lógica de juego solo llama a `visual.museo`.
// Convención de ejes: X a la derecha, Y arriba (metros), −Z hacia donde mira la cámara al inicio.

/** Altura de los ojos del jugador (m). */
const ALTURA_OJOS = 1.6;
/** Posición inicial del jugador: frente a las vitrinas, mirando a −Z. */
const INICIO = { x: 0, z: 5 };
/** Sala cuadrada de 16 m; el jugador no puede salir de ella. */
const LADO_SALA = 16;
const ALTURA_PAREDES = 4;
const GROSOR_PARED = 0.3;
const LIMITE_X_Z = LADO_SALA / 2 - 0.6;

/** Centro de cada vitrina (base sobre el suelo). Separadas 8 m (SPEC: mínimo 4 m). */
const POSICION_VITRINA: Record<string, { x: number; z: number }> = {
  vitrina_lrv: { x: -4, z: -4 },
  vitrina_perseverance: { x: 4, z: -4 },
};
/** Punto al que apunta el rayo: el centro del cubo (1 m sobre el pedestal de 0.5 m). */
const ALTURA_PUNTO_VITRINA = 1.0;
/** Altura del halo: encima de la vitrina (su borde superior está a 1.5 m). */
const ALTURA_HALO = 2.2;
/** Ángulo máximo entre el rayo y la vitrina para considerar que la apunta. */
const TOLERANCIA_RAD = THREE.MathUtils.degToRad(12);

const COLOR = {
  fondo: 0x1b1d22,
  suelo: 0x808080,
  pared: 0x5a5e66,
  vitrina: 0xffffff,
  pedestal: 0x9a9a9a,
  mentor: 0x2f6fd6,
  halo: 0xffd60a,
} as const;

type Constructor = () => THREE.Object3D;

/** Placeholders generados en código. Las claves son las rutas "placeholder:…" de config.ts. */
const PLACEHOLDERS: Record<string, Constructor> = {
  'placeholder:sala': crearSala,
  'placeholder:vitrina': crearVitrina,
  'placeholder:mentor': crearMentor,
  'placeholder:anillo': crearAnillo,
};

function material(color: number, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });
}

function caja(ancho: number, alto: number, fondo: number, color: number): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(ancho, alto, fondo), material(color));
}

/** Suelo plano gris y cuatro paredes de caja. Sin texturas. */
function crearSala(): THREE.Object3D {
  const grupo = new THREE.Group();
  const suelo = new THREE.Mesh(new THREE.PlaneGeometry(LADO_SALA, LADO_SALA), material(COLOR.suelo));
  suelo.rotation.x = -Math.PI / 2;
  grupo.add(suelo);

  const mitad = LADO_SALA / 2;
  const largo = LADO_SALA + GROSOR_PARED;
  // [x, z, ancho, fondo] de cada pared (norte, sur, oeste, este).
  const paredes: [number, number, number, number][] = [
    [0, -mitad, largo, GROSOR_PARED],
    [0, mitad, largo, GROSOR_PARED],
    [-mitad, 0, GROSOR_PARED, largo],
    [mitad, 0, GROSOR_PARED, largo],
  ];
  for (const [x, z, ancho, fondo] of paredes) {
    const pared = caja(ancho, ALTURA_PAREDES, fondo, COLOR.pared);
    pared.position.set(x, ALTURA_PAREDES / 2, z);
    grupo.add(pared);
  }
  return grupo;
}

/** Pedestal de 0.5 m y cubo blanco de 1 × 1 × 1 m encima. Origen en el suelo, centrado. */
function crearVitrina(): THREE.Object3D {
  const grupo = new THREE.Group();
  const pedestal = caja(1.2, 0.5, 1.2, COLOR.pedestal);
  pedestal.position.y = 0.25;
  const cubo = caja(1, 1, 1, COLOR.vitrina);
  cubo.position.y = 0.5 + 0.5;
  grupo.add(pedestal, cubo);
  return grupo;
}

/** Cilindro azul de 0.4 m de diámetro y 1.6 m de alto, con la base en el suelo. */
function crearMentor(): THREE.Object3D {
  const malla = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.6, 24), material(COLOR.mentor));
  malla.position.y = 0.8;
  return malla;
}

/** Anillo amarillo delgado de 0.6 m de radio, en el plano XY (su normal apunta a +Z). */
function crearAnillo(): THREE.Object3D {
  const malla = new THREE.Mesh(
    new THREE.RingGeometry(0.6, 0.64, 48),
    new THREE.MeshBasicMaterial({ color: COLOR.halo, side: THREE.DoubleSide }),
  );
  return malla;
}

const gltf = new GLTFLoader();

/** Crea el modelo de una entrada de config: placeholder en código o .glb. */
async function cargar(modelo: ConfigModelo): Promise<THREE.Object3D> {
  let objeto: THREE.Object3D;
  if (modelo.ruta.startsWith('placeholder:')) {
    const constructor = PLACEHOLDERS[modelo.ruta];
    if (!constructor) throw new Error(`Placeholder desconocido: ${modelo.ruta}`);
    objeto = constructor();
  } else {
    const archivo = await gltf.loadAsync(assetUrl(modelo.ruta));
    objeto = archivo.scene;
  }
  objeto.name = modelo.nodo;
  objeto.scale.setScalar(modelo.escala);
  return objeto;
}

// ---------------------------------------------------------------------------
// Estado del módulo
// ---------------------------------------------------------------------------

const nodos = new Map<string, THREE.Object3D>();
let camara: THREE.PerspectiveCamera | null = null;
let halo: THREE.Object3D | null = null;
/** Vitrina a la que está anclado el halo; null si el halo está oculto. */
let haloEn: string | null = null;
let mentor: THREE.Object3D | null = null;
/** Yaw de la cámara (rad). La cabeza siempre mira al frente: no hay pitch. */
let yaw = 0;
let posicion = new THREE.Vector3(INICIO.x, ALTURA_OJOS, INICIO.z);

function vitrinaAim(id: string): THREE.Vector3 {
  const p = POSICION_VITRINA[id];
  if (!p) throw new Error(`Vitrina desconocida: ${id}`);
  return new THREE.Vector3(p.x, ALTURA_PUNTO_VITRINA, p.z);
}

function actualizarCamara(): void {
  if (!camara) return;
  camara.position.copy(posicion);
  camara.rotation.set(0, yaw, 0, 'YXZ');
}

/** Vector hacia donde mira el jugador, en el plano horizontal. */
function adelante(): THREE.Vector3 {
  return new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
}

// ---------------------------------------------------------------------------
// API pública: visual.museo
// ---------------------------------------------------------------------------

/**
 * Crea la escena dentro de `container` y arranca el render. Hay que llamarla una vez.
 * Resuelve cuando todos los modelos están listos.
 */
async function iniciar(container: HTMLElement): Promise<void> {
  const escenaNueva = new THREE.Scene();
  escenaNueva.background = new THREE.Color(COLOR.fondo);

  const camaraNueva = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  camara = camaraNueva;
  actualizarCamara();

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  escenaNueva.add(new THREE.AmbientLight(0xffffff, 1.2));
  const sol = new THREE.DirectionalLight(0xffffff, 1.5);
  sol.position.set(4, 8, 5);
  escenaNueva.add(sol);

  const objetos = await Promise.all(MODELOS.map(cargar));
  for (const [i, objeto] of objetos.entries()) {
    const modelo = MODELOS[i];
    nodos.set(modelo.id, objeto);
    escenaNueva.add(objeto);
  }

  // Colocación: las vitrinas en su posición; el mentor y el halo se mueven en tiempo de juego.
  for (const id of Object.keys(POSICION_VITRINA)) {
    const obj = nodos.get(id);
    const p = POSICION_VITRINA[id];
    if (obj) obj.position.set(p.x, 0, p.z);
  }
  halo = nodos.get('halo_senalar') ?? null;
  if (halo) halo.visible = false;
  mentor = nodos.get('mentor') ?? null;
  if (mentor) mentor.visible = false;

  const resize = (): void => {
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    renderer.setSize(width, height, false);
    camaraNueva.aspect = width / height;
    camaraNueva.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(container);
  resize();

  renderer.setAnimationLoop(() => {
    // El halo siempre se gira hacia el jugador para que se vea como anillo.
    if (halo?.visible) halo.lookAt(camaraNueva.position);
    renderer.render(escenaNueva, camaraNueva);
  });
}

/** Hace visible la vitrina `id` (todas empiezan visibles). */
function mostrarVitrina(id: string): void {
  const obj = nodos.get(id);
  if (obj) obj.visible = true;
}

/**
 * Resalta (o quita el resaltado de) una vitrina con el halo amarillo.
 * Solo hay un halo: resaltar otra vitrina lo mueve.
 */
function resaltarVitrina(id: string, activa: boolean): void {
  if (!halo) return;
  if (activa) {
    halo.position.copy(vitrinaAim(id)).setY(ALTURA_HALO);
    halo.visible = true;
    haloEn = id;
  } else if (haloEn === id) {
    halo.visible = false;
    haloEn = null;
  }
}

/**
 * Mueve la cámara.
 * - dx: giro en grados alrededor de la vertical. Positivo = a la derecha del jugador.
 * - dy: avance en metros hacia donde mira el jugador. Negativo = retroceso.
 * La posición se limita a la sala.
 */
function moverCamara(dx: number, dy: number): void {
  yaw -= THREE.MathUtils.degToRad(dx);
  if (dy !== 0) {
    posicion.addScaledVector(adelante(), dy);
    posicion.x = THREE.MathUtils.clamp(posicion.x, -LIMITE_X_Z, LIMITE_X_Z);
    posicion.z = THREE.MathUtils.clamp(posicion.z, -LIMITE_X_Z, LIMITE_X_Z);
  }
  actualizarCamara();
}

/** Hace aparecer al mentor junto al jugador, a su derecha y un poco delante. */
function mentorAparece(): void {
  if (!mentor) return;
  const derecha = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const pos = posicion.clone().addScaledVector(derecha, 1.0).addScaledVector(adelante(), 1.2);
  mentor.position.set(pos.x, 0, pos.z);
  mentor.lookAt(posicion.x, 0, posicion.z);
  mentor.visible = true;
}

/**
 * Qué vitrina apunta un rayo. `direccion` va en coordenadas de la cámara:
 * x a la derecha del jugador, y arriba, z negativa hacia delante. No hace falta normalizarla.
 * Devuelve el id de la vitrina más cercana al rayo dentro de la tolerancia, o null.
 */
function vitrinaEnDireccion(direccion: { x: number; y: number; z: number }): string | null {
  const rayo = new THREE.Vector3(direccion.x, direccion.y, direccion.z);
  if (rayo.lengthSq() === 0) return null;
  rayo.normalize();
  // La cámara solo gira en yaw, así que basta con aplicar su orientación.
  const rayoMundo = rayo.applyQuaternion(camaraOrientacion());

  let mejor: string | null = null;
  let mejorAngulo = TOLERANCIA_RAD;
  for (const id of Object.keys(POSICION_VITRINA)) {
    const hacia = vitrinaAim(id).sub(posicion).normalize();
    const angulo = rayoMundo.angleTo(hacia);
    if (angulo <= mejorAngulo) {
      mejorAngulo = angulo;
      mejor = id;
    }
  }
  return mejor;
}

function camaraOrientacion(): THREE.Quaternion {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0, 'YXZ'));
}

export const visual = {
  museo: {
    iniciar,
    mostrarVitrina,
    resaltarVitrina,
    moverCamara,
    mentorAparece,
    vitrinaEnDireccion,
  },
};
