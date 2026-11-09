import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from '../tracking/assets';
import { EXPOSICION, crearAmbienteMuseo, crearPostproceso, type AmbienteMuseo } from './ambiente';
import { ALTURA_PEDESTAL, LADO_VITRINA, RADIO_CAMINABLE, RADIO_PROYECTOR, crearRotonda, crearVitrinaArtefacto } from './arquitectura';
import { ESCENAS, MODELOS, type ConfigModelo } from './config';
import { crearManos, type ManoDetectada, type ManosAvatar, type OpcionesManos } from './manos';
import { ARQ } from './paleta';
import { crearLRVExhibicion, crearPerseveranceExhibicion } from './props';

// Toda la parte visual del museo (Three.js). La lógica de juego solo llama a `visual.museo`.
// Convención de ejes: X a la derecha, Y arriba (metros), −Z hacia donde mira la cámara al inicio.
// Estilo del museo: ver spec-visual-museo.md. La sala y sus objetos están en arquitectura.ts y props.ts, y las luces,
// la niebla, el fondo y el bloom en ambiente.ts. Las escenas de misión de este archivo conservan su propio aspecto.

/** Altura de los ojos del jugador (m). */
const ALTURA_OJOS = 1.6;
/** Posición inicial del jugador: frente a las vitrinas, mirando a −Z hacia el centro de la rotonda. */
const INICIO = { x: 0, z: 11 };
/** Límite de movimiento en las misiones (m, por eje). En el museo manda RADIO_CAMINABLE. */
const LIMITE_MISION_X_Z = 7.4;
/** Cabeceo máximo de la vista hacia arriba o abajo (rad, 35°). */
const LIMITE_CABECEO = THREE.MathUtils.degToRad(35);

/** Centro de cada vitrina de artefacto (base sobre el suelo). A unos 9 m del inicio y a 9 m entre sí. */
const POSICION_VITRINA: Record<string, { x: number; z: number }> = {
  vitrina_lrv: { x: -4.5, z: 3 },
  vitrina_perseverance: { x: 4.5, z: 3 },
};
/** Punto al que apunta el rayo: el centro del cubo. */
const ALTURA_PUNTO_VITRINA = ALTURA_PEDESTAL + LADO_VITRINA / 2;
/** Altura del halo: encima del borde superior del cubo. */
const ALTURA_HALO = ALTURA_PEDESTAL + LADO_VITRINA + 0.5;
/** Altura media del robot-mentor (m) y amplitud del flotado (m). */
const ALTURA_MENTOR = 1.3;
const AMPLITUD_FLOTADO = 0.06;
const VELOCIDAD_FLOTADO = 1.6;
/** Ángulo máximo entre el rayo y la vitrina para considerar que la apunta. */
const TOLERANCIA_RAD = THREE.MathUtils.degToRad(12);

/** Colores del mentor, el halo y las escenas de misión. La paleta del museo está en paleta.ts. */
const COLOR = {
  /** Robot-mentor: todo azul, visor oscuro, ojos y sonrisa claros (spec §5). */
  mentor: 0x2f6fd6,
  mentorVisor: 0x14213d,
  mentorOjos: 0xcfefff,
  halo: 0xffd60a,
  /** Halo azul celeste de las misiones (SPEC 10): color constante, sin iluminación. */
  haloCeleste: 0x87ceeb,
  /** Acentos del LRV y Perseverance en las escenas de misión. */
  acentoLRV: 0x2ee6d6,
  acentoPerseverance: 0xff8a3d,
  sueloLuna: 0xcfd2d6,
  cieloLuna: 0x000000,
  lrv: 0xc9ccd1,
  rueda: 0x3a3a3a,
  roca: 0x8d99ae,
  sueloMarte: 0x9c4a2a,
  cieloMarte: 0xd9e8f2,
  /** Perseverance: cuerpo blanco y capa térmica dorada. */
  blanco: 0xeeeeee,
  dorado: 0xc8a24a,
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
  'placeholder:sala': crearRotonda,
  'placeholder:vitrina_lrv': () => crearVitrinaArtefacto(crearLRVExhibicion, ARQ.cian, -2.5),
  'placeholder:vitrina_perseverance': () => crearVitrinaArtefacto(crearPerseveranceExhibicion, ARQ.ambar, 2.5),
  'placeholder:mentor': crearMentor,
  'placeholder:anillo': crearAnillo,
  'placeholder:escena_luna': crearEscenaLuna,
  'placeholder:escena_marte': crearEscenaMarte,
};

/** Material mate con caras planas (look low poly). Sin texturas. */
function material(color: number, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true, ...extra });
}

/** Material sin iluminación: para luces emisivas y anillos de color constante. */
function materialBasico(color: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color });
}

function caja(ancho: number, alto: number, fondo: number, color: number): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(ancho, alto, fondo), material(color));
}

/** Malla de una figura geométrica con posición y giro en radianes (x, y, z). */
function malla(
  geometria: THREE.BufferGeometry,
  color: number,
  posicion: [number, number, number] = [0, 0, 0],
  giro: [number, number, number] = [0, 0, 0],
): THREE.Mesh {
  const objeto = new THREE.Mesh(geometria, material(color));
  objeto.position.set(...posicion);
  objeto.rotation.set(...giro);
  return objeto;
}

/** Figura de color sólido, sin iluminación (anillos de luz, luces interiores). */
function mallaBasica(
  geometria: THREE.BufferGeometry,
  color: number,
  posicion: [number, number, number] = [0, 0, 0],
  giro: [number, number, number] = [0, 0, 0],
): THREE.Mesh {
  const objeto = new THREE.Mesh(geometria, materialBasico(color));
  objeto.position.set(...posicion);
  objeto.rotation.set(...giro);
  return objeto;
}

/**
 * Robot-mentor compacto: cuerpo facetado azul, visor oscuro con ojos y sonrisa fijos, brazos cortos y sin piernas.
 * El origen es el centro del cuerpo. Mira hacia +Z (el visor); `actualizarMentor` lo gira hacia el jugador.
 */
function crearMentor(): THREE.Object3D {
  const grupo = new THREE.Group();
  const cuerpo = malla(new THREE.IcosahedronGeometry(0.3, 1), COLOR.mentor);
  cuerpo.scale.set(1, 1.15, 1);
  grupo.add(cuerpo);
  // Visor oscuro sobre la cara, con ojos y sonrisa claros.
  grupo.add(malla(new THREE.BoxGeometry(0.42, 0.24, 0.06), COLOR.mentorVisor, [0, 0.04, 0.28]));
  for (const x of [-0.1, 0.1]) {
    grupo.add(mallaBasica(new THREE.SphereGeometry(0.035, 6, 4), COLOR.mentorOjos, [x, 0.07, 0.33]));
  }
  grupo.add(mallaBasica(new THREE.TorusGeometry(0.07, 0.012, 4, 10, Math.PI), COLOR.mentorOjos, [0, -0.03, 0.33], [0, 0, Math.PI]));
  // Brazos cortos a los lados.
  for (const x of [-0.36, 0.36]) {
    grupo.add(malla(new THREE.CylinderGeometry(0.07, 0.07, 0.3, 6), COLOR.mentor, [x, -0.05, 0], [0, 0, Math.PI / 2]));
  }
  return grupo;
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

/**
 * Roca facetada (dodecaedro aplanado, ~0.8 m) con el halo azul celeste (anillo de 0.6 m de radio) alrededor.
 */
function crearRoca(): THREE.Object3D {
  const grupo = new THREE.Group();
  const roca = malla(new THREE.DodecahedronGeometry(0.42, 0), COLOR.roca, [0, 0.28, 0], [0.3, 0.5, 0]);
  roca.scale.y = 0.75;
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.6, 0.64, 48),
    new THREE.MeshBasicMaterial({ color: COLOR.haloCeleste, side: THREE.DoubleSide }),
  );
  halo.name = 'halo_roca';
  halo.position.y = 0.4;
  grupo.add(roca, halo);
  return grupo;
}

/**
 * LRV aproximado, sin medidas oficiales: chasis plano, asiento, antena y cuatro ruedas de cilindro.
 * Origen en el suelo, centrado. Forma simplificada: ver src/visual/MODELS.md.
 */
function crearLRV(acento: number = COLOR.acentoLRV): THREE.Object3D {
  const grupo = new THREE.Group();
  grupo.name = 'lrv_placeholder';
  const chasis = caja(1.2, 0.1, 1.8, COLOR.lrv);
  chasis.position.y = 0.6;
  const asiento = caja(0.5, 0.25, 0.5, COLOR.rueda);
  asiento.position.set(0, 0.85, 0);
  const antena = malla(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 6), COLOR.lrv, [0.4, 1.0, -0.5]);
  // Antena de alta ganancia: plato de color de acento sobre la antena.
  const plato = malla(new THREE.ConeGeometry(0.18, 0.08, 8), acento, [0.4, 1.42, -0.5], [Math.PI / 2, 0, 0]);
  // Paneles de color de acento a los lados del chasis y una caja de electrónica.
  const panelIzq = caja(0.04, 0.22, 1.2, acento);
  panelIzq.position.set(-0.62, 0.7, 0);
  const panelDer = caja(0.04, 0.22, 1.2, acento);
  panelDer.position.set(0.62, 0.7, 0);
  const electronica = caja(0.35, 0.2, 0.3, COLOR.rueda);
  electronica.position.set(-0.3, 0.7, -0.5);
  grupo.add(chasis, asiento, antena, plato, panelIzq, panelDer, electronica);
  // Ruedas: cilindros girados para que el eje quede a lo ancho.
  for (const [x, z] of [[-0.75, -0.8], [0.75, -0.8], [-0.75, 0.8], [0.75, 0.8]]) {
    grupo.add(malla(new THREE.CylinderGeometry(0.35, 0.35, 0.15, 10), COLOR.rueda, [x, 0.35, z], [0, 0, Math.PI / 2]));
  }
  return grupo;
}

/**
 * Perseverance aproximado, sin medidas oficiales: cuerpo blanco con capa dorada, seis ruedas,
 * mástil con cámara, generador (RTG) y brazo. Origen en el suelo, centrado. Forma simplificada: ver MODELS.md.
 */
function crearPerseverance(acento: number = COLOR.acentoPerseverance): THREE.Object3D {
  const grupo = new THREE.Group();
  grupo.name = 'perseverance_placeholder';
  const cuerpo = caja(1.3, 0.5, 1.0, COLOR.blanco);
  cuerpo.position.y = 0.75;
  const capa = caja(1.1, 0.06, 0.9, COLOR.dorado);
  capa.position.y = 1.03;
  // Franja de acento en el frente del cuerpo, para distinguirlo del LRV.
  const franja = caja(1.32, 0.08, 0.1, acento);
  franja.position.set(0, 0.75, 0.5);
  grupo.add(franja);
  const rtg = malla(new THREE.CylinderGeometry(0.2, 0.2, 0.6, 8), COLOR.dorado, [0, 0.8, 0.75], [Math.PI / 2, 0, 0]);
  const mastil = malla(new THREE.CylinderGeometry(0.04, 0.04, 0.85, 6), COLOR.blanco, [0.35, 1.42, -0.2]);
  const camara = malla(new THREE.IcosahedronGeometry(0.1, 0), COLOR.blanco, [0.35, 1.92, -0.2]);
  const brazo = malla(new THREE.CylinderGeometry(0.035, 0.035, 0.9, 6), COLOR.blanco, [-0.35, 0.45, -0.85], [Math.PI / 2, 0, 0]);
  grupo.add(cuerpo, capa, rtg, mastil, camara, brazo);
  for (const x of [-0.75, 0.75]) {
    for (const z of [-0.5, 0, 0.5]) {
      grupo.add(malla(new THREE.CylinderGeometry(0.25, 0.25, 0.15, 10), COLOR.rueda, [x, 0.25, z], [0, 0, Math.PI / 2]));
    }
  }
  return grupo;
}

/** Escena lunar: suelo gris claro, LRV aproximado y una roca con halo. Cielo negro (fondo de la escena). */
function crearEscenaLuna(): THREE.Object3D {
  const grupo = new THREE.Group();
  const lrv = crearLRV();
  lrv.position.set(0, 0, -4);
  const roca = crearRoca();
  roca.name = 'roca_placeholder';
  roca.position.set(2.5, 0, -3);
  grupo.add(crearSuelo(COLOR.sueloLuna), lrv, roca);
  return grupo;
}

/** Escena marciana: suelo rojizo y Perseverance aproximado. Cielo claro (fondo de la escena). */
function crearEscenaMarte(): THREE.Object3D {
  const grupo = new THREE.Group();
  const perseverance = crearPerseverance();
  perseverance.position.set(0, 0, -4);
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
/** Manos del avatar, colgadas de la cámara (SPEC 5.5). */
let manosAvatar: ManosAvatar | null = null;
let halo: THREE.Object3D | null = null;
/** Vitrina a la que está anclado el halo; null si el halo está oculto. */
let haloEn: string | null = null;
let mentor: THREE.Object3D | null = null;
/** Yaw de la cámara (rad): giro lateral con la inclinación de la cabeza. */
let yaw = 0;
/** Cabeceo de la cámara (rad): mirar arriba (+) o abajo (−) con el cabeceo de la cabeza. Limitado a ±LIMITE_CABECEO. */
let cabeceo = 0;
let posicion = new THREE.Vector3(INICIO.x, ALTURA_OJOS, INICIO.z);
/** Escena three.js compartida por el museo y las escenas de misión (se muestra una a la vez). */
let escenaPrincipal: THREE.Scene | null = null;
let haloRoca: THREE.Object3D | null = null;
/** Posición y giro del jugador en el museo, guardados mientras está en una escena. */
let guardadaMuseo: { posicion: THREE.Vector3; yaw: number; cabeceo: number } | null = null;
/** Capa negra de fundido (DOM encima del canvas). */
let fundidoEl: HTMLDivElement | null = null;
/** Renderer y luces de las misiones: se alternan con el ambiente del museo al entrar y salir. */
let rendererPrincipal: THREE.WebGLRenderer | null = null;
let lucesMision: THREE.Group | null = null;
let ambienteMuseo: AmbienteMuseo | null = null;
/** true mientras el jugador está en el museo; false en una escena de misión. */
let enMuseo = true;

function vitrinaAim(id: string): THREE.Vector3 {
  const p = POSICION_VITRINA[id];
  if (!p) throw new Error(`Vitrina desconocida: ${id}`);
  return new THREE.Vector3(p.x, ALTURA_PUNTO_VITRINA, p.z);
}

function actualizarCamara(): void {
  if (!camara) return;
  camara.position.copy(posicion);
  camara.rotation.set(cabeceo, yaw, 0, 'YXZ');
}

/** Vector hacia donde mira el jugador, en el plano horizontal. */
function adelante(): THREE.Vector3 {
  return new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
}

/** Vector a la derecha del jugador, en el plano horizontal. */
function derecha(): THREE.Vector3 {
  return new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
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
  escenaPrincipal = escenaNueva;

  const camaraNueva = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  camara = camaraNueva;
  actualizarCamara();
  // Las manos cuelgan de la cámara, así que siempre están en primera persona. La cámara debe estar en la escena para que sus hijos se dibujen.
  manosAvatar = crearManos();
  camaraNueva.add(manosAvatar.objeto);
  escenaNueva.add(camaraNueva);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  fundidoEl = document.createElement('div');
  fundidoEl.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:100;';
  document.body.appendChild(fundidoEl);

  rendererPrincipal = renderer;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = EXPOSICION;

  // Luces de las misiones: las de siempre, con luz plana y sin sombras. Solo se encienden en una escena de misión.
  const luces = new THREE.Group();
  luces.add(new THREE.HemisphereLight(0xffffff, 0x8a929c, 1.6));
  const sol = new THREE.DirectionalLight(0xffffff, 1.0);
  sol.position.set(4, 8, 5);
  luces.add(sol);
  luces.visible = false;
  lucesMision = luces;
  escenaNueva.add(luces);

  // Ambiente del museo: luces, niebla, nebulosa, asteroides y bloom.
  const ambiente = crearAmbienteMuseo(renderer, camaraNueva);
  ambienteMuseo = ambiente;
  escenaNueva.add(ambiente.grupo);
  escenaNueva.background = ambiente.fondo;
  escenaNueva.fog = ambiente.niebla;
  const post = crearPostproceso(renderer, escenaNueva, camaraNueva);

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
    post.ajustar(width, height);
    camaraNueva.aspect = width / height;
    camaraNueva.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(container);
  resize();

  const reloj = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const t = reloj.getElapsedTime();
    // El robot flota (sube y baja suave) y siempre gira hacia el jugador.
    if (mentor?.visible) {
      mentor.position.y = ALTURA_MENTOR + Math.sin(t * VELOCIDAD_FLOTADO) * AMPLITUD_FLOTADO;
      mentor.lookAt(posicion.x, mentor.position.y, posicion.z);
    }
    // El halo siempre se gira hacia el jugador para que se vea como anillo.
    if (halo?.visible) halo.lookAt(camaraNueva.position);
    if (haloRoca?.visible) haloRoca.lookAt(camaraNueva.position);
    if (enMuseo) {
      ambiente.actualizar(t);
      nodos.get('museo')?.userData.actualizar?.(t);
      post.render();
    } else {
      renderer.render(escenaNueva, camaraNueva);
    }
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

/** Alterna entre el ambiente del museo y el aspecto de las misiones: luces, niebla, fondo, tone mapping y bloom. */
function activarAmbienteMuseo(activo: boolean): void {
  enMuseo = activo;
  if (lucesMision) lucesMision.visible = !activo;
  if (rendererPrincipal) rendererPrincipal.toneMapping = activo ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
  if (!ambienteMuseo || !escenaPrincipal) return;
  ambienteMuseo.grupo.visible = activo;
  ambienteMuseo.luzManos.visible = activo;
  escenaPrincipal.fog = activo ? ambienteMuseo.niebla : null;
  if (activo) escenaPrincipal.background = ambienteMuseo.fondo;
}

/**
 * Cambia a la escena de misión: oculta el museo, muestra su escena, pone el fondo y lleva al
 * jugador a su punto de llegada. Guarda su posición en el museo para volver a ella.
 */
function entrarEscena(escena: Escena): void {
  if (!escenaPrincipal) return;
  guardadaMuseo = { posicion: posicion.clone(), yaw, cabeceo };
  mostrarMuseo(false);
  activarAmbienteMuseo(false);
  const escenaObj = nodos.get(NODO_ESCENA[escena]);
  if (escenaObj) escenaObj.visible = true;
  escenaPrincipal.background = new THREE.Color(FONDO_ESCENA[escena]);
  posicion = new THREE.Vector3(LLEGADA_ESCENA.x, ALTURA_OJOS, LLEGADA_ESCENA.z);
  yaw = 0;
  cabeceo = 0;
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
  activarAmbienteMuseo(true);
  if (guardadaMuseo) {
    posicion = guardadaMuseo.posicion;
    yaw = guardadaMuseo.yaw;
    cabeceo = guardadaMuseo.cabeceo;
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
 * - dCabeceo: cabeceo en grados. Positivo = mirar arriba. El ángulo se limita a ±LIMITE_CABECEO_GRADOS.
 * - dLateral: paso lateral en metros. Positivo = a la derecha del jugador (solo con teclado).
 * La posición se limita a la rotonda en el museo y al área de siempre en las misiones.
 */
function moverCamara(dx: number, dy: number, dCabeceo = 0, dLateral = 0): void {
  yaw -= THREE.MathUtils.degToRad(dx);
  cabeceo = THREE.MathUtils.clamp(cabeceo + THREE.MathUtils.degToRad(dCabeceo), -LIMITE_CABECEO, LIMITE_CABECEO);
  if (dy !== 0 || dLateral !== 0) {
    posicion.addScaledVector(adelante(), dy);
    posicion.addScaledVector(derecha(), dLateral);
    if (enMuseo) {
      // Entre la pared y el proyector central. Al limitar solo el radio, el jugador se desliza por el borde.
      const radio = Math.hypot(posicion.x, posicion.z) || 1;
      const limitado = THREE.MathUtils.clamp(radio, RADIO_PROYECTOR, RADIO_CAMINABLE);
      posicion.x *= limitado / radio;
      posicion.z *= limitado / radio;
    } else {
      posicion.x = THREE.MathUtils.clamp(posicion.x, -LIMITE_MISION_X_Z, LIMITE_MISION_X_Z);
      posicion.z = THREE.MathUtils.clamp(posicion.z, -LIMITE_MISION_X_Z, LIMITE_MISION_X_Z);
    }
  }
  actualizarCamara();
}

/** Hace aparecer al mentor junto al jugador, a su derecha y un poco delante. El flotado lo anima el bucle. */
function mentorAparece(): void {
  if (!mentor) return;
  const pos = posicion.clone().addScaledVector(derecha(), 1.0).addScaledVector(adelante(), 1.2);
  mentor.position.set(pos.x, ALTURA_MENTOR, pos.z);
  mentor.lookAt(posicion.x, ALTURA_MENTOR, posicion.z);
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
  // La cámara gira en yaw y en cabeceo: el rayo se expresa en su orientación completa.
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
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(cabeceo, yaw, 0, 'YXZ'));
}

/**
 * Misión lunar (SPEC 8): coloca el LRV en la escena lunar y resalta la roca. Si el jugador está sentado,
 * la cámara va con el asiento (misma primera persona, en la posición del LRV). `rumboGrados` sigue la convención
 * de game/luna.ts: 0 = hacia −Z, positivo = derecha.
 */
function actualizarLuna(estado: {
  x: number;
  z: number;
  rumboGrados: number;
  sentado: boolean;
  rocaResaltada: boolean;
}): void {
  const rad = THREE.MathUtils.degToRad(estado.rumboGrados);
  const lrv = nodos.get('escena_luna')?.getObjectByName('lrv_placeholder');
  if (lrv) {
    lrv.position.set(estado.x, 0, estado.z);
    lrv.rotation.y = -rad;
  }
  if (haloRoca) haloRoca.visible = estado.rocaResaltada;
  if (estado.sentado) {
    posicion = new THREE.Vector3(estado.x, ALTURA_OJOS, estado.z);
    yaw = -rad;
    actualizarCamara();
  }
}

/** Coloca las manos del avatar según las manos detectadas en este fotograma (SPEC 5.5). */
function actualizarManos(manos: ManoDetectada[], w: number, h: number, escala: number, opciones: OpcionesManos): void {
  if (!camara) return;
  manosAvatar?.actualizar(
    manos,
    {
      ancho: w,
      alto: h,
      aspectoEscena: camara.aspect,
      fovVertical: THREE.MathUtils.degToRad(camara.fov),
      escala,
    },
    opciones,
  );
}

/** Oculta las dos manos del avatar, por ejemplo si el seguimiento se ha perdido (SPEC 6). */
function ocultarManos(): void {
  manosAvatar?.ocultar();
}

export const visual = {
  museo: {
    iniciar,
    actualizarLuna,
    actualizarManos,
    ocultarManos,
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
