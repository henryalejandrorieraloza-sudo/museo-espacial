import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from '../tracking/assets';
import { ESCENAS, MODELOS, type ConfigModelo } from './config';

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
  /** Halo azul celeste de las misiones (SPEC 10): color constante, sin iluminación. */
  haloCeleste: 0x87ceeb,
  sueloLuna: 0xd4d4d4,
  cieloLuna: 0x000000,
  lrv: 0xe6e6e6,
  roca: 0x6b6b6b,
  sueloMarte: 0x9c4a2a,
  cieloMarte: 0xd9e8f2,
  perseverance: 0xd8a070,
} as const;

/** Escenas de misión disponibles. Coinciden con `Mision` de src/game/museo.ts. */
export type Escena = 'luna' | 'marte';
const NODO_ESCENA: Record<Escena, string> = { luna: 'escena_luna', marte: 'escena_marte' };
const FONDO_ESCENA: Record<Escena, number> = { luna: COLOR.cieloLuna, marte: COLOR.cieloMarte };
/** Punto de llegada del jugador en cada escena: 4 m delante del origen, mirando a −Z. */
const LLEGADA_ESCENA = { x: 0, z: 4 };

type Constructor = () => THREE.Object3D;

/** Placeholders generados en código. Las claves son las rutas "placeholder:…" de config.ts. */
const PLACEHOLDERS: Record<string, Constructor> = {
  'placeholder:sala': crearSala,
  'placeholder:vitrina': crearVitrina,
  'placeholder:mentor': crearMentor,
  'placeholder:anillo': crearAnillo,
  'placeholder:escena_luna': crearEscenaLuna,
  'placeholder:escena_marte': crearEscenaMarte,
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

/** Suelo plano grande (60 × 60 m) a nivel del suelo. */
function crearSuelo(color: number): THREE.Mesh {
  const suelo = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), material(color));
  suelo.rotation.x = -Math.PI / 2;
  return suelo;
}

/** Roca placeholder: caja gris de 0.8 m con el halo azul celeste (anillo de 0.6 m de radio) alrededor. */
function crearRoca(): THREE.Object3D {
  const grupo = new THREE.Group();
  const roca = caja(0.8, 0.8, 0.8, COLOR.roca);
  roca.position.y = 0.4;
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.6, 0.64, 48),
    new THREE.MeshBasicMaterial({ color: COLOR.haloCeleste, side: THREE.DoubleSide }),
  );
  halo.name = 'halo_roca';
  halo.position.y = 0.4;
  grupo.add(roca, halo);
  return grupo;
}

/** Escena lunar: suelo gris claro, un cubo para el LRV y una roca con halo. Cielo negro (fondo de la escena). */
function crearEscenaLuna(): THREE.Object3D {
  const grupo = new THREE.Group();
  const lrv = caja(1.5, 1.5, 1.5, COLOR.lrv);
  lrv.name = 'lrv_placeholder';
  lrv.position.set(0, 0.75, -4);
  const roca = crearRoca();
  roca.name = 'roca_placeholder';
  roca.position.set(2.5, 0, -3);
  grupo.add(crearSuelo(COLOR.sueloLuna), lrv, roca);
  return grupo;
}

/** Escena marciana: suelo rojizo y un cubo para Perseverance. Cielo claro (fondo de la escena). */
function crearEscenaMarte(): THREE.Object3D {
  const grupo = new THREE.Group();
  const perseverance = caja(1.5, 1.5, 1.5, COLOR.perseverance);
  perseverance.name = 'perseverance_placeholder';
  perseverance.position.set(0, 0.75, -4);
  grupo.add(crearSuelo(COLOR.sueloMarte), perseverance);
  return grupo;
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
/** Escena three.js compartida por el museo y las escenas de misión (se muestra una a la vez). */
let escenaPrincipal: THREE.Scene | null = null;
let haloRoca: THREE.Object3D | null = null;
/** Posición y giro del jugador en el museo, guardados mientras está en una escena. */
let guardadaMuseo: { posicion: THREE.Vector3; yaw: number } | null = null;
/** Capa negra de fundido (DOM encima del canvas). */
let fundidoEl: HTMLDivElement | null = null;

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
  escenaPrincipal = escenaNueva;

  const camaraNueva = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  camara = camaraNueva;
  actualizarCamara();

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  fundidoEl = document.createElement('div');
  fundidoEl.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:100;';
  document.body.appendChild(fundidoEl);

  escenaNueva.add(new THREE.AmbientLight(0xffffff, 1.2));
  const sol = new THREE.DirectionalLight(0xffffff, 1.5);
  sol.position.set(4, 8, 5);
  escenaNueva.add(sol);

  // Museo y escenas de misión se cargan juntos; las escenas empiezan ocultas.
  const todos = [...MODELOS, ...ESCENAS];
  const objetos = await Promise.all(todos.map(cargar));
  for (const [i, objeto] of objetos.entries()) {
    const modelo = todos[i];
    nodos.set(modelo.id, objeto);
    escenaNueva.add(objeto);
  }
  for (const escena of ESCENAS) {
    const obj = nodos.get(escena.id);
    if (obj) obj.visible = false;
  }
  haloRoca = nodos.get('escena_luna')?.getObjectByName('halo_roca') ?? null;

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
    if (haloRoca?.visible) haloRoca.lookAt(camaraNueva.position);
    renderer.render(escenaNueva, camaraNueva);
  });
}

/** Opacidad del fundido a negro: 0 = sin fundido, 1 = negro total. */
function fundido(opacidad: number): void {
  if (fundidoEl) fundidoEl.style.opacity = String(THREE.MathUtils.clamp(opacidad, 0, 1));
}

/** Oculta o muestra todo el museo (vitrinas, sala y mentor). El halo se oculta siempre. */
function mostrarMuseo(visible: boolean): void {
  for (const modelo of MODELOS) {
    const obj = nodos.get(modelo.id);
    if (obj) obj.visible = visible;
  }
  if (halo) halo.visible = false;
  haloEn = null;
  if (mentor) mentor.visible = false;
}

/**
 * Cambia a la escena de misión: oculta el museo, muestra su escena, pone el fondo y lleva al
 * jugador a su punto de llegada. Guarda su posición en el museo para volver a ella.
 */
function entrarEscena(escena: Escena): void {
  if (!escenaPrincipal) return;
  guardadaMuseo = { posicion: posicion.clone(), yaw };
  mostrarMuseo(false);
  const escenaObj = nodos.get(NODO_ESCENA[escena]);
  if (escenaObj) escenaObj.visible = true;
  escenaPrincipal.background = new THREE.Color(FONDO_ESCENA[escena]);
  posicion = new THREE.Vector3(LLEGADA_ESCENA.x, ALTURA_OJOS, LLEGADA_ESCENA.z);
  yaw = 0;
  actualizarCamara();
}

/** Vuelve del escenario al museo, en la misma posición y con el mismo giro en que se salió. */
function volverAlMuseo(): void {
  if (!escenaPrincipal) return;
  for (const escena of ESCENAS) {
    const obj = nodos.get(escena.id);
    if (obj) obj.visible = false;
  }
  mostrarMuseo(true);
  escenaPrincipal.background = new THREE.Color(COLOR.fondo);
  if (guardadaMuseo) {
    posicion = guardadaMuseo.posicion;
    yaw = guardadaMuseo.yaw;
    guardadaMuseo = null;
  }
  actualizarCamara();
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

/**
 * Qué vitrina está bajo un punto de la pantalla (cursor). `xNorm` e `yNorm` van de 0 a 1,
 * con (0, 0) arriba a la izquierda. Usa un rayo desde la cámara contra los modelos de vitrina.
 * Devuelve el id de la vitrina o null.
 */
function vitrinaEnPantalla(xNorm: number, yNorm: number): string | null {
  if (!camara) return null;
  camara.updateMatrixWorld();
  raycaster.setFromCamera(new THREE.Vector2(xNorm * 2 - 1, -(yNorm * 2 - 1)), camara);
  const vitrinas = Object.keys(POSICION_VITRINA)
    .map((id) => nodos.get(id))
    .filter((obj): obj is THREE.Object3D => obj !== undefined);
  const primero = raycaster.intersectObjects(vitrinas, true)[0];
  if (!primero) return null;
  // El impacto cae en una malla hija: subimos hasta el grupo que tiene el id de la vitrina.
  let nodo: THREE.Object3D | null = primero.object;
  while (nodo && !Object.hasOwn(POSICION_VITRINA, nodo.name)) nodo = nodo.parent;
  return nodo ? nodo.name : null;
}

const raycaster = new THREE.Raycaster();

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
    vitrinaEnPantalla,
    entrarEscena,
    volverAlMuseo,
    fundido,
  },
};
