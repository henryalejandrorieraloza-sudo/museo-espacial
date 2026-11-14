import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from '../tracking/assets';
import { EXPOSICION, crearAmbienteMuseo, crearPostproceso, type AmbienteMuseo } from './ambiente';
import {
  ALTURA_CENTRO_EXHIBICION,
  LADO_VITRINA,
  RADIO_CAMINABLE,
  RADIO_MOSTRADOR,
  RADIO_PEANA_COHETE,
  crearInstalacionHolograma,
  crearRotonda,
} from './arquitectura';
import { ESCENAS, MODELOS, type ConfigModelo } from './config';
import type { PosturaCaminata } from '../game/balanceo';
import { EXPOSICION_LUNA, LEJANO_CAMARA_LUNA_M, aplicarRecogidaSueloNaranja, colocarLRV, crearEscenaLuna, crearPostprocesoLuna, ojosEnLRV } from './lunaEscena';
import type { RuedasLRV } from './lrv';
import { crearMentor, type EstadoMentor, type GestoMentor } from './mentor';
import { alturaLuna, crearHundimientoSuelo } from './lunaTerreno';
import { DURACION_DESPLIEGUE_LRV_S } from './despliegueApollo17';
import { crearDespliegueLRV, type DespliegueVisualLRV } from './despliegueLRV';
import { crearManos, type ManoDetectada, type ManosAvatar, type OpcionesManos } from './manos';
import { ARQ } from './paleta';
import { crearLRVExhibicion, crearPerseveranceExhibicion } from './props';
import {
  LLEGADA,
  LM,
  LRV_DESPEGUE,
  RADIO_LRV_M,
  RADIO_OBSTACULO_LM_M,
  RADIO_OBSTACULO_LRV_M,
  ROCA_ESTACION1,
  azimutEntre,
  enAzimut,
} from './sitioApollo17';
import { crearDespegueLM, type DespegueLM, type EstadoDespegueVisual } from './despegueLM';
import { crearHuellasLRV, type HuellasLRV } from './huellasLRV';
import { crearPresentacionVisual, type EstadoPresentacionVisual, type PosicionMarca, type PresentacionVisual } from './presentacionLRV';

// Toda la parte visual del museo (Three.js). La lógica de juego solo llama a `visual.museo`.
// Convención de ejes: X a la derecha, Y arriba (metros), −Z hacia donde mira la cámara al inicio.
// Estilo del museo: ver spec-visual-museo.md. La sala y sus objetos están en arquitectura.ts y props.ts, y las luces,
// la niebla, el fondo y el bloom en ambiente.ts. La escena lunar (Apollo 17) está en lunaEscena.ts y sus módulos;
// la de Marte, en este archivo, conserva su aspecto provisional.

/** Altura de los ojos del jugador (m). */
const ALTURA_OJOS = 1.6;
/** Posición inicial del jugador: frente a las vitrinas, mirando a −Z hacia el centro de la rotonda. */
const INICIO = { x: 0, z: 11 };
/**
 * Al bajarse del LRV, el jugador queda de pie a la izquierda del asiento del comandante, a esta distancia del
 * centro del LRV (m): justo fuera de RADIO_OBSTACULO_LRV_M, para no rebotar contra él al dar el primer paso.
 */
const DISTANCIA_BAJADA_LRV_M = RADIO_OBSTACULO_LRV_M + 0.3;
/** Límite de movimiento en Marte (m, por eje). En el museo manda RADIO_CAMINABLE y en la Luna, RADIO_LRV_M. */
const LIMITE_MISION_X_Z = 7.4;
/** Plano lejano de la cámara en el museo y en Marte (m). En la Luna se amplía a LEJANO_CAMARA_LUNA_M. */
const LEJANO_CAMARA_M = 100;
/** Sentado en el LRV, cuánto puede girar la vista a cada lado del rumbo (rad). */
const LIMITE_MIRADA_LRV = THREE.MathUtils.degToRad(100);
/** Cabeceo máximo de la vista hacia arriba o abajo (rad, 35°). */
const LIMITE_CABECEO = THREE.MathUtils.degToRad(35);

/** Centro de cada vitrina de artefacto (base sobre el suelo). A unos 9 m del inicio y a 9 m entre sí. */
const POSICION_VITRINA: Record<string, { x: number; z: number }> = {
  vitrina_lrv: { x: -4.5, z: 3 },
  vitrina_perseverance: { x: 4.5, z: 3 },
};
/** Punto al que apunta el rayo: el centro del holograma. */
const ALTURA_PUNTO_VITRINA = ALTURA_CENTRO_EXHIBICION;
/** Distancia mínima entre el jugador y el borde de un mostrador (m). */
const MARGEN_JUGADOR = 0.35;
/** Altura fija del robot-mentor (m): no sube ni baja ni flota. */
const ALTURA_MENTOR = 1.3;
/**
 * El mentor flota delante del jugador, a unos 2 m y un poco a la derecha del centro de la pantalla, para no tapar las vitrinas. Si ahí hay una vitrina, una pared o la
 * peana del cohete, se acerca al jugador hasta quedar libre (no menos de DISTANCIA_MIN_MENTOR).
 */
const DISTANCIA_MENTOR = 2.0;
const DISTANCIA_MIN_MENTOR = 1.4;
/** Desplazamiento a la derecha del eje de la mirada (m). A 2 m son unos 8° de la vista. */
const LADO_MENTOR = 0.3;
/** Margen del mentor alrededor de las vitrinas, el cohete central y la pared (m). */
const MARGEN_MENTOR = 0.5;
/**
 * Resorte amortiguado con el que el mentor alcanza su sitio: frecuencia (rad/s) y amortiguación. Con ζ < 1 se pasa un
 * poco y vuelve, como un dron; con ω ≈ 3,5 el retraso al girar o caminar es de unas décimas de segundo.
 */
const OMEGA_SEGUIR_MENTOR = 3.5;
const ZETA_SEGUIR_MENTOR = 0.8;
/** Inclinación del cuerpo hacia donde se mueve (rad por m/s) y su tope (rad). */
const INCLINA_MENTOR = 0.07;
const INCLINA_MAX_MENTOR = 0.2;
/** Ángulo máximo entre el rayo y la vitrina para considerar que la apunta. */
const TOLERANCIA_RAD = THREE.MathUtils.degToRad(12);

/** Colores del mentor, el halo y las escenas de misión. La paleta del museo está en paleta.ts. */
const COLOR = {
  /** Acento de Perseverance en la escena de Marte. */
  acentoPerseverance: 0xff8a3d,
  cieloLuna: 0x000000,
  rueda: 0x3a3a3a,
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
/** Punto de llegada del jugador en Marte: 4 m delante del origen, mirando a −Z. La de la Luna está en sitioApollo17.ts. */
const LLEGADA_ESCENA = { x: 0, z: 4 };

type Constructor = () => THREE.Object3D;

/** Placeholders generados en código. Las claves son las rutas "placeholder:…" de config.ts. */
const PLACEHOLDERS: Record<string, Constructor> = {
  'placeholder:sala': crearRotonda,
  'placeholder:vitrina_lrv': () => crearInstalacionHolograma(crearLRVExhibicion, 'luna', ARQ.cian, -2.5),
  'placeholder:vitrina_perseverance': () => crearInstalacionHolograma(crearPerseveranceExhibicion, 'marte', ARQ.ambar, 2.5, 0.85),
  'placeholder:mentor': crearMentor,
  'placeholder:escena_luna': crearEscenaLuna,
  'placeholder:escena_marte': crearEscenaMarte,
};

/** Material mate con caras planas (look low poly). Sin texturas. */
function material(color: number, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true, ...extra });
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

/** Suelo plano grande (60 × 60 m) a nivel del suelo. */
function crearSuelo(color: number): THREE.Mesh {
  const suelo = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), material(color));
  suelo.rotation.x = -Math.PI / 2;
  return suelo;
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
let mentor: THREE.Object3D | null = null;
/** Velocidad horizontal del mentor (m/s) en su resorte de seguimiento. La altura nunca cambia. */
const velocidadMentor = new THREE.Vector3();
/** Yaw de la cámara (rad): giro lateral con la inclinación de la cabeza. */
let yaw = 0;
/** Cabeceo de la cámara (rad): mirar arriba (+) o abajo (−) con el cabeceo de la cabeza. Limitado a ±LIMITE_CABECEO. */
let cabeceo = 0;
/**
 * Postura de la caminata (desplazamiento lateral, subida y bajada, inclinación), solo visual: se suma a la cámara,
 * no a `posicion`. Así la posición del jugador, el raycast por rayo y las misiones no lo ven (game/balanceo.ts).
 */
let balanceo: PosturaCaminata = { lateralM: 0, verticalM: 0, rollGrados: 0 };
let posicion = new THREE.Vector3(INICIO.x, ALTURA_OJOS, INICIO.z);
/** Escena three.js compartida por el museo y las escenas de misión (se muestra una a la vez). */
let escenaPrincipal: THREE.Scene | null = null;
let haloRoca: THREE.Object3D | null = null;
/** Escena de misión activa, o null en el museo. */
let escenaActual: Escena | null = null;
/** En la Luna: el jugador va sentado en el LRV (la cámara va con el asiento). */
let sentadoLRV = false;
/** Sentado en el LRV: giro de la vista respecto al rumbo del vehículo (rad). */
let miradaLRV = 0;
/** LRV de la escena lunar y su rumbo actual (°), para apoyar la cámara y esquivarlo a pie. */
let lrvLuna: THREE.Object3D | null = null;
let rumboLRV = 0;
/** Ruedas del LRV (dirección y rodadura) y la última posición del LRV, para saber cuánto avanzó. */
let ruedasLRV: RuedasLRV | null = null;
let posicionPreviaLRV: { x: number; z: number } | null = null;
/** Animación del despliegue del LRV desde la bahía del LM (despliegueLRV.ts). */
let despliegueLRV: DespliegueVisualLRV | null = null;
/** Suelo naranja de la estación 1 (roca_placeholder) y la función que hunde el terreno bajo él (lunaTerreno.ts). */
let rocaLuna: THREE.Object3D | null = null;
let hundirSueloLuna: ((progreso: number) => void) | null = null;
/** Último progreso de la recogida aplicado a la escena (-1 = sin aplicar): evita reescribir la malla cada fotograma. */
let progresoRecogidaLuna = -1;
/** El LRV ya está desplegado: hasta entonces lo coloca la animación, no la misión. */
let lrvDesplegado = true;
/** Render de la Luna (dos pasadas y bloom). */
let postLuna: { render(): void; ajustar(ancho: number, alto: number): void } | null = null;
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
/** Presentación del LRV (presentacionLRV.ts): se crea la primera vez que se entra y se reutiliza. */
let presentacion: PresentacionVisual | null = null;
/** true mientras se ve la presentación: se dibuja ella en vez del museo o la misión. */
let enPresentacion = false;
/** Cinemática del despegue del LM (despegueLM.ts), o null si no se pudo montar. */
let despegue: DespegueLM | null = null;
/** true mientras se ve la cinemática: la cámara la lleva ella, no el jugador. */
let enDespegue = false;
/** El LRV ya se movió a su sitio de filmación (se hace con la pantalla en negro, no a la vista). */
let lrvAparcadoDespegue = false;
/** Huellas de las ruedas del LRV en la Luna: las que deja al conducir y el camino hasta donde filma el despegue. */
let huellasLuna: HuellasLRV | null = null;
/** Puntos por cinta de huellas en la Luna (a 0.25 m, 1.5 km de recorrido) y su separación. */
const MAX_PUNTOS_HUELLAS_LUNA = 6000;
const SEPARACION_HUELLAS_LUNA_M = 0.25;
/** Campo de visión de la cámara del jugador (°). La cinemática lo cambia y se restaura al salir de ella. */
const CAMPO_VISION_JUGADOR = 60;
/** Tamaño de la vista (px), para la presentación cuando se crea. */
let anchoVista = 1;
let altoVista = 1;

function vitrinaAim(id: string): THREE.Vector3 {
  const p = POSICION_VITRINA[id];
  if (!p) throw new Error(`Vitrina desconocida: ${id}`);
  return new THREE.Vector3(p.x, ALTURA_PUNTO_VITRINA, p.z);
}

function actualizarCamara(): void {
  // Durante la cinemática del despegue la cámara la coloca despegueLM.ts.
  if (!camara || enDespegue) return;
  camara.position.copy(posicion);
  // El balanceo solo se aplica en el museo y a pie en la Luna (juego.ts decide cuándo hay caminata).
  const conBalanceo = enMuseo || escenaActual === 'luna';
  if (conBalanceo) {
    camara.position.addScaledVector(derecha(), balanceo.lateralM);
    camara.position.y += balanceo.verticalM;
  }
  camara.rotation.set(cabeceo, yaw, conBalanceo ? THREE.MathUtils.degToRad(balanceo.rollGrados) : 0, 'YXZ');
}

/** Fija la postura de la caminata para este fotograma. Solo se aplica en el museo y a pie en la Luna. */
function fijarBalanceo(postura: PosturaCaminata): void {
  balanceo = postura;
  actualizarCamara();
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

  const camaraNueva = new THREE.PerspectiveCamera(CAMPO_VISION_JUGADOR, 1, 0.1, LEJANO_CAMARA_M);
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
  // Sombras proyectadas: solo el sol de la Luna las proyecta; las luces del museo no (spec-visual-museo.md §1).
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = EXPOSICION;

  // Luces de Marte: las de siempre, con luz plana y sin sombras. La Luna lleva sus propias luces (lunaEscena.ts).
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
  // Suelo naranja: la mancha y los fragmentos (roca_placeholder) y el terreno que se hunde al recoger la muestra.
  rocaLuna = nodos.get('escena_luna')?.getObjectByName('roca_placeholder') ?? null;
  const terrenoLuna = nodos.get('escena_luna')?.getObjectByName('terreno_luna');
  hundirSueloLuna = terrenoLuna instanceof THREE.Mesh ? crearHundimientoSuelo(terrenoLuna, ROCA_ESTACION1.x, ROCA_ESTACION1.z) : null;
  progresoRecogidaLuna = -1;
  lrvLuna = nodos.get('escena_luna')?.getObjectByName('lrv_placeholder') ?? null;
  ruedasLRV = (lrvLuna?.userData.ruedas as RuedasLRV | undefined) ?? null;
  despliegueLRV = lrvLuna ? crearDespliegueLRV(lrvLuna) : null;
  const escenaLuna = nodos.get('escena_luna');
  if (escenaLuna) {
    huellasLuna = crearHuellasLRV(alturaLuna, MAX_PUNTOS_HUELLAS_LUNA, SEPARACION_HUELLAS_LUNA_M);
    escenaLuna.add(huellasLuna.grupo);
    // Si la cinemática no se puede montar, el juego sigue sin ella (juego.ts pasa directo al modo libre).
    try {
      despegue = crearDespegueLM(escenaLuna);
    } catch (err) {
      console.error('No se pudo montar la cinemática del despegue', err);
      despegue = null;
    }
  }
  postLuna = crearPostprocesoLuna(renderer, escenaNueva, camaraNueva);

  // Colocación: las vitrinas en su posición; el mentor y el halo se mueven en tiempo de juego.
  for (const id of Object.keys(POSICION_VITRINA)) {
    const obj = nodos.get(id);
    const p = POSICION_VITRINA[id];
    if (obj) obj.position.set(p.x, 0, p.z);
  }
  mentor = nodos.get('mentor') ?? null;
  // El mentor acompaña al jugador desde el inicio del museo (no solo al señalar una vitrina).
  mentorAparece();

  const resize = (): void => {
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    renderer.setSize(width, height, false);
    post.ajustar(width, height);
    postLuna?.ajustar(width, height);
    presentacion?.ajustar(width, height);
    anchoVista = width;
    altoVista = height;
    camaraNueva.aspect = width / height;
    camaraNueva.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(container);
  resize();

  const reloj = new THREE.Clock();
  let tPrevio = 0;
  renderer.setAnimationLoop(() => {
    const t = reloj.getElapsedTime();
    const dt = Math.min(t - tPrevio, 0.1);
    tPrevio = t;
    if (enPresentacion && presentacion) {
      presentacion.render();
      return;
    }
    // El robot sigue al jugador (cerca del centro de la pantalla, con retraso de resorte), a altura fija, y siempre gira hacia él.
    if (mentor?.visible) {
      if (enMuseo) seguirMentor(dt);
      mentor.position.y = ALTURA_MENTOR;
      mentor.lookAt(posicion.x, mentor.position.y, posicion.z);
      if (enMuseo) inclinarMentor();
      mentor.userData.actualizar?.(t);
    }
    // El halo de la roca siempre se gira hacia el jugador para que se vea como anillo.
    if (haloRoca?.visible) haloRoca.lookAt(camaraNueva.position);
    if (enMuseo) {
      ambiente.actualizar(t);
      nodos.get('museo')?.userData.actualizar?.(t);
      // Los hologramas de las exhibiciones giran y parpadean.
      for (const id of Object.keys(POSICION_VITRINA)) nodos.get(id)?.userData.actualizar?.(t);
      post.render();
    } else if (escenaActual === 'luna' && postLuna) {
      nodos.get('escena_luna')?.userData.actualizar?.(camaraNueva);
      postLuna.render();
    } else {
      renderer.render(escenaNueva, camaraNueva);
    }
  });
}

/** Opacidad del fundido a negro: 0 = sin fundido, 1 = negro total. */
function fundido(opacidad: number): void {
  if (fundidoEl) fundidoEl.style.opacity = String(THREE.MathUtils.clamp(opacidad, 0, 1));
}

/** Oculta o muestra todo el museo (vitrinas, sala y mentor). */
function mostrarMuseo(visible: boolean): void {
  for (const modelo of MODELOS) {
    const obj = nodos.get(modelo.id);
    if (obj) obj.visible = visible;
  }
  if (mentor) mentor.visible = false;
}

/**
 * Alterna el aspecto de cada lugar: luces, niebla, fondo, tone mapping y plano lejano de la cámara.
 * Museo y Luna usan tone mapping ACES con bloom; Marte conserva su luz plana sin tone mapping.
 */
function activarAmbiente(lugar: 'museo' | Escena): void {
  const activo = lugar === 'museo';
  enMuseo = activo;
  escenaActual = activo ? null : lugar;
  if (lucesMision) lucesMision.visible = lugar === 'marte';
  if (rendererPrincipal) {
    rendererPrincipal.toneMapping = lugar === 'marte' ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    rendererPrincipal.toneMappingExposure = lugar === 'luna' ? EXPOSICION_LUNA : EXPOSICION;
  }
  if (camara) {
    camara.far = lugar === 'luna' ? LEJANO_CAMARA_LUNA_M : LEJANO_CAMARA_M;
    camara.updateProjectionMatrix();
  }
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
  enPresentacion = false;
  guardadaMuseo = { posicion: posicion.clone(), yaw, cabeceo };
  mostrarMuseo(false);
  activarAmbiente(escena);
  const escenaObj = nodos.get(NODO_ESCENA[escena]);
  if (escenaObj) escenaObj.visible = true;
  // En la Luna, el fondo lo borra la primera pasada (lo lejano): un color de fondo forzaría otro borrado en la
  // segunda pasada y taparía el cielo y los macizos.
  escenaPrincipal.background = escena === 'luna' ? null : new THREE.Color(FONDO_ESCENA[escena]);
  cabeceo = 0;
  sentadoLRV = false;
  miradaLRV = 0;
  ruedasLRV?.reiniciar();
  posicionPreviaLRV = null;
  salirDespegue();
  if (escena === 'luna') {
    // Cada visita empieza igual: LM entero, sin huellas, y el LRV plegado en la bahía del LM, como viajó (despliegueLRV.ts).
    despegue?.reiniciar();
    huellasLuna?.vaciar();
    poseDespliegueLRV(0, 0);
    // Llegada junto al LM y al LRV, de pie, mirando hacia los dos (sitioApollo17.ts).
    posicion = new THREE.Vector3(LLEGADA.x, alturaLuna(LLEGADA.x, LLEGADA.z) + ALTURA_OJOS, LLEGADA.z);
    yaw = -THREE.MathUtils.degToRad(LLEGADA.azimutMirada);
  } else {
    posicion = new THREE.Vector3(LLEGADA_ESCENA.x, ALTURA_OJOS, LLEGADA_ESCENA.z);
    yaw = 0;
  }
  actualizarCamara();
}

/** Vuelve del escenario al museo, en la misma posición y con el mismo giro en que se salió. */
function volverAlMuseo(): void {
  if (!escenaPrincipal) return;
  enPresentacion = false;
  for (const escena of ESCENAS) {
    const obj = nodos.get(escena.id);
    if (obj) obj.visible = false;
  }
  salirDespegue();
  mostrarMuseo(true);
  activarAmbiente('museo');
  sentadoLRV = false;
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
 * Mueve la cámara.
 * - dx: giro en grados alrededor de la vertical. Positivo = a la derecha del jugador.
 * - dy: avance en metros hacia donde mira el jugador. Negativo = retroceso.
 * - dCabeceo: cabeceo en grados. Positivo = mirar arriba. El ángulo se limita a ±LIMITE_CABECEO_GRADOS.
 * - dLateral: paso lateral en metros. Positivo = a la derecha del jugador (solo con teclado).
 * La posición se limita a la rotonda en el museo y al área de siempre en las misiones.
 */
function moverCamara(dx: number, dy: number, dCabeceo = 0, dLateral = 0): void {
  cabeceo = THREE.MathUtils.clamp(cabeceo + THREE.MathUtils.degToRad(dCabeceo), -LIMITE_CABECEO, LIMITE_CABECEO);
  if (escenaActual === 'luna') {
    moverEnLuna(dx, dy, dLateral);
    return;
  }
  yaw -= THREE.MathUtils.degToRad(dx);
  if (dy !== 0 || dLateral !== 0) {
    posicion.addScaledVector(adelante(), dy);
    posicion.addScaledVector(derecha(), dLateral);
    if (enMuseo) {
      // Entre la pared y la peana del cohete central. Al limitar solo el radio, el jugador se desliza por el borde.
      const radio = Math.hypot(posicion.x, posicion.z) || 1;
      const limitado = THREE.MathUtils.clamp(radio, RADIO_PEANA_COHETE, RADIO_CAMINABLE);
      posicion.x *= limitado / radio;
      posicion.z *= limitado / radio;
      // Los mostradores de las vitrinas tampoco se atraviesan: el jugador se desliza por su borde.
      for (const v of Object.values(POSICION_VITRINA)) {
        const ox = posicion.x - v.x;
        const oz = posicion.z - v.z;
        const d = Math.hypot(ox, oz);
        const minimo = RADIO_MOSTRADOR + MARGEN_JUGADOR;
        if (d < minimo && d > 1e-6) {
          posicion.x = v.x + (ox / d) * minimo;
          posicion.z = v.z + (oz / d) * minimo;
        }
      }
    } else {
      posicion.x = THREE.MathUtils.clamp(posicion.x, -LIMITE_MISION_X_Z, LIMITE_MISION_X_Z);
      posicion.z = THREE.MathUtils.clamp(posicion.z, -LIMITE_MISION_X_Z, LIMITE_MISION_X_Z);
    }
  }
  actualizarCamara();
}

/**
 * Movimiento en la Luna. A pie: gira, camina sobre el suelo (con la curvatura), sin atravesar el LM ni el LRV y
 * dentro de RADIO_LRV_M (el mismo límite que el LRV). Sentado en el LRV: el giro mueve solo la vista, hasta ±100° del rumbo; el avance lo
 * gestiona la misión (game/luna.ts) y llega por actualizarLuna.
 */
function moverEnLuna(dx: number, dy: number, dLateral: number): void {
  if (sentadoLRV) {
    miradaLRV = THREE.MathUtils.clamp(miradaLRV - THREE.MathUtils.degToRad(dx), -LIMITE_MIRADA_LRV, LIMITE_MIRADA_LRV);
    yaw = -THREE.MathUtils.degToRad(rumboLRV) + miradaLRV;
    actualizarCamara();
    return;
  }
  yaw -= THREE.MathUtils.degToRad(dx);
  posicion.addScaledVector(adelante(), dy);
  posicion.addScaledVector(derecha(), dLateral);
  const apartar = (cx: number, cz: number, radio: number): void => {
    const ex = posicion.x - cx;
    const ez = posicion.z - cz;
    const d = Math.hypot(ex, ez);
    if (d < radio && d > 1e-6) {
      posicion.x = cx + (ex / d) * radio;
      posicion.z = cz + (ez / d) * radio;
    }
  };
  apartar(LM.x, LM.z, RADIO_OBSTACULO_LM_M);
  if (lrvLuna) apartar(lrvLuna.position.x, lrvLuna.position.z, RADIO_OBSTACULO_LRV_M);
  const radio = Math.hypot(posicion.x - LM.x, posicion.z - LM.z);
  if (radio > RADIO_LRV_M) {
    posicion.x = LM.x + ((posicion.x - LM.x) / radio) * RADIO_LRV_M;
    posicion.z = LM.z + ((posicion.z - LM.z) / radio) * RADIO_LRV_M;
  }
  posicion.y = alturaLuna(posicion.x, posicion.z) + ALTURA_OJOS;
  actualizarCamara();
}

/** Posición del jugador en el suelo (m). En la Luna, la usa la misión para saber si está junto al LRV. */
function posicionJugador(): { x: number; z: number } {
  return { x: posicion.x, z: posicion.z };
}

/** Cambia el estado visual del mentor (LED y brazos). Hoy nadie lo llama: queda listo para enlazarlo con la voz. */
function mentorEstado(estado: EstadoMentor): void {
  mentor?.userData.setState?.(estado);
}

/** Pide un gesto al mentor (cue del guion, inicio de frase…). Lo usa la sincronía con la voz. */
function mentorGesto(gesto: GestoMentor): void {
  mentor?.userData.gesto?.(gesto);
}

/** Amplitud real (0..1) del audio del mentor para los LED; `null` = pulso propio. */
function mentorAmplitud(amplitud: number | null): void {
  mentor?.userData.setAmplitud?.(amplitud);
}

/** ¿Puede estar el mentor en (x, z)? Dentro de la rotonda, fuera de la peana del cohete y de las vitrinas (que son cubos). */
function sitioLibreMentor(x: number, z: number): boolean {
  const radio = Math.hypot(x, z);
  if (radio < RADIO_PEANA_COHETE || radio > RADIO_CAMINABLE - MARGEN_MENTOR) return false;
  const medio = LADO_VITRINA / 2 + MARGEN_MENTOR;
  return !Object.values(POSICION_VITRINA).some((v) => Math.abs(x - v.x) < medio && Math.abs(z - v.z) < medio);
}

/**
 * Sitio del mentor: delante del jugador y un poco a su derecha, a altura fija. Si el sitio está ocupado, se acerca al
 * jugador hasta encontrar uno libre.
 */
function posicionMentor(): { x: number; z: number } {
  const dir = adelante();
  const der = derecha();
  let d = DISTANCIA_MENTOR;
  const en = (dist: number): { x: number; z: number } => ({
    x: posicion.x + dir.x * dist + der.x * LADO_MENTOR,
    z: posicion.z + dir.z * dist + der.z * LADO_MENTOR,
  });
  while (d > DISTANCIA_MIN_MENTOR && !sitioLibreMentor(en(d).x, en(d).z)) d -= 0.1;
  return en(d);
}

/** Mueve al mentor hacia su sitio con un resorte amortiguado (aceleración suave, sin seguir la cámara a tirones). */
function seguirMentor(dt: number): void {
  if (!mentor || dt <= 0) return;
  const objetivo = posicionMentor();
  const k = OMEGA_SEGUIR_MENTOR * OMEGA_SEGUIR_MENTOR;
  const c = 2 * ZETA_SEGUIR_MENTOR * OMEGA_SEGUIR_MENTOR;
  const pasos = Math.ceil(dt / (1 / 120));
  const h = dt / pasos;
  for (let i = 0; i < pasos; i++) {
    velocidadMentor.x += (k * (objetivo.x - mentor.position.x) - c * velocidadMentor.x) * h;
    velocidadMentor.z += (k * (objetivo.z - mentor.position.z) - c * velocidadMentor.z) * h;
    mentor.position.x += velocidadMentor.x * h;
    mentor.position.z += velocidadMentor.z * h;
  }
}

const cuaternioInverso = new THREE.Quaternion();
const velocidadLocal = new THREE.Vector3();

/** Inclina al mentor hacia donde se mueve (como un dron): hacia delante al acelerar, de lado al desplazarse. */
function inclinarMentor(): void {
  if (!mentor) return;
  cuaternioInverso.copy(mentor.quaternion).invert();
  velocidadLocal.copy(velocidadMentor).applyQuaternion(cuaternioInverso);
  mentor.rotateX(THREE.MathUtils.clamp(velocidadLocal.z * INCLINA_MENTOR, -INCLINA_MAX_MENTOR, INCLINA_MAX_MENTOR));
  mentor.rotateZ(THREE.MathUtils.clamp(-velocidadLocal.x * INCLINA_MENTOR, -INCLINA_MAX_MENTOR, INCLINA_MAX_MENTOR));
}

/** Coloca al mentor en su sitio de golpe (al empezar y al volver al museo). Después lo sigue el bucle. */
function mentorAparece(): void {
  if (!mentor) return;
  const pos = posicionMentor();
  velocidadMentor.set(0, 0, 0);
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
 * Misión lunar (SPEC 8): apoya el LRV en el suelo con su posición y rumbo, y muestra u oculta el halo de la roca
 * (SPEC 10: visible hasta recoger la muestra).
 * Sentado, la cámara va en el asiento del comandante (a la izquierda; el mando en T le queda a la derecha) y mira
 * hacia el rumbo más el giro de la vista. `rumboGrados` sigue la convención de game/luna.ts: 0 = norte (−Z),
 * positivo = derecha.
 */
function actualizarLuna(estado: {
  x: number;
  z: number;
  rumboGrados: number;
  /** Ángulo de dirección de las ruedas (°, + = derecha). */
  direccionGrados: number;
  /** Duración del fotograma (s), para la rodadura de las ruedas. */
  dtS: number;
  sentado: boolean;
  haloVisible: boolean;
}): void {
  rumboLRV = estado.rumboGrados;
  const rad = THREE.MathUtils.degToRad(estado.rumboGrados);
  // Mientras se despliega, el LRV lo coloca la animación (poseDespliegueLRV) y no se puede subir a él.
  if (lrvDesplegado) {
    // Metros que avanzó el LRV en su rumbo desde el fotograma anterior (negativos al retroceder).
    const previa = posicionPreviaLRV;
    const avanceM = previa ? (estado.x - previa.x) * Math.sin(rad) - (estado.z - previa.z) * Math.cos(rad) : 0;
    posicionPreviaLRV = { x: estado.x, z: estado.z };
    ruedasLRV?.actualizar(estado.direccionGrados, avanceM, estado.dtS);
    if (lrvLuna) colocarLRV(lrvLuna, estado.x, estado.z, estado.rumboGrados);
    huellasLuna?.anadir(estado.x, estado.z, -rad);
  }
  if (haloRoca) haloRoca.visible = estado.haloVisible;
  if (estado.sentado && lrvLuna) {
    if (!sentadoLRV) miradaLRV = 0;
    ojosEnLRV(lrvLuna, posicion);
    yaw = -THREE.MathUtils.degToRad(estado.rumboGrados) + miradaLRV;
    actualizarCamara();
  } else if (sentadoLRV && lrvLuna) {
    // Se acaba de bajar: de pie junto al asiento del comandante (a la izquierda), mirando hacia donde miraba.
    // Si ese punto quedara fuera de RADIO_LRV_M (el LRV puede estar en el borde), se prueba el otro lado y, si no,
    // un paso hacia el LM: así no se empuja al jugador de vuelta al bajarse.
    const izquierda = new THREE.Vector3(-Math.cos(rad), 0, -Math.sin(rad)).multiplyScalar(DISTANCIA_BAJADA_LRV_M);
    const hacia = new THREE.Vector3(LM.x - estado.x, 0, LM.z - estado.z).normalize().multiplyScalar(DISTANCIA_BAJADA_LRV_M);
    const dentro = (d: THREE.Vector3): boolean => Math.hypot(estado.x + d.x - LM.x, estado.z + d.z - LM.z) <= RADIO_LRV_M;
    const lado = [izquierda, izquierda.clone().negate()].find(dentro) ?? hacia;
    posicion.set(estado.x + lado.x, 0, estado.z + lado.z);
    posicion.y = alturaLuna(posicion.x, posicion.z) + ALTURA_OJOS;
    // Ya a pie: moverEnLuna aparta al jugador del LM si hiciera falta y lo deja dentro del radio a pie.
    sentadoLRV = false;
    moverEnLuna(0, 0, 0);
  }
  sentadoLRV = estado.sentado;
}

/**
 * Despliegue del LRV (misión lunar): deja el LRV en la pose del segundo `tiempoS` de la animación (0 = plegado en la
 * bahía del LM; DURACION_DESPLIEGUE_LRV_S = estacionado y listo, donde lo coloca la misión). `dtS` hace rodar las
 * ruedas en la prueba de manejo.
 */
function poseDespliegueLRV(tiempoS: number, dtS: number): void {
  lrvDesplegado = tiempoS >= DURACION_DESPLIEGUE_LRV_S;
  despliegueLRV?.aplicar(tiempoS, dtS);
  // Al terminar, la misión toma el relevo desde la posición estacionada, sin un salto en la rodadura.
  if (lrvDesplegado) posicionPreviaLRV = null;
}

/**
 * Recogida de la muestra del suelo naranja (game/sueloNaranja.ts): `progreso` 0 = intacto, 1 = retirado y hundido.
 * Solo toca la escena cuando cambia el progreso.
 */
function recogerSueloNaranja(progreso: number): void {
  const p = THREE.MathUtils.clamp(progreso, 0, 1);
  if (p === progresoRecogidaLuna) return;
  progresoRecogidaLuna = p;
  hundirSueloLuna?.(p);
  if (rocaLuna) aplicarRecogidaSueloNaranja(rocaLuna, p);
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

/**
 * Pasa a la presentación del LRV: oculta el museo (el jugador conserva su sitio, que guarda `entrarEscena` al abrir la
 * misión) y dibuja la escena de la presentación. Devuelve false si no se pudo montar: entonces se sigue sin ella.
 */
function entrarPresentacion(): boolean {
  if (!rendererPrincipal) return false;
  try {
    presentacion ??= crearPresentacionVisual(rendererPrincipal);
    presentacion.reiniciar();
    presentacion.ajustar(anchoVista, altoVista);
  } catch (err) {
    console.error('No se pudo montar la presentación del LRV', err);
    presentacion = null;
    return false;
  }
  mostrarMuseo(false);
  rendererPrincipal.toneMapping = THREE.ACESFilmicToneMapping;
  rendererPrincipal.toneMappingExposure = EXPOSICION_LUNA;
  enPresentacion = true;
  return true;
}

/** Un fotograma de la presentación. Devuelve la posición en pantalla de las piezas de cada marca del tramo. */
function actualizarPresentacion(estado: EstadoPresentacionVisual): PosicionMarca[] {
  if (!enPresentacion || !presentacion) return [];
  return presentacion.actualizar(estado);
}

/** Corta la cinemática del despegue si estaba en marcha (al cambiar de escena) y devuelve la cámara al jugador. */
function salirDespegue(): void {
  if (!enDespegue) return;
  despegue?.terminar();
  enDespegue = false;
  if (camara) {
    camara.fov = CAMPO_VISION_JUGADOR;
    camara.updateProjectionMatrix();
  }
}

/** Huellas de un camino suave (curva de Bézier) del LRV entre dos poses: sale con su rumbo y llega con el otro. */
function huellasCamino(desde: { x: number; z: number; rumbo: number }, hasta: { x: number; z: number; rumbo: number }): void {
  if (!huellasLuna) return;
  const largo = Math.hypot(hasta.x - desde.x, hasta.z - desde.z);
  if (largo < SEPARACION_HUELLAS_LUNA_M) return;
  const dir = (rumbo: number): [number, number] => {
    const r = THREE.MathUtils.degToRad(rumbo);
    return [Math.sin(r), -Math.cos(r)];
  };
  const [ax, az] = dir(desde.rumbo);
  const [bx, bz] = dir(hasta.rumbo);
  const p0 = [desde.x, desde.z];
  const p1 = [desde.x + (ax * largo) / 3, desde.z + (az * largo) / 3];
  const p2 = [hasta.x - (bx * largo) / 3, hasta.z - (bz * largo) / 3];
  const p3 = [hasta.x, hasta.z];
  const n = Math.ceil(largo / SEPARACION_HUELLAS_LUNA_M);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    const punto = (k: number): number => u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k];
    const tangente = (k: number): number => 3 * u * u * (p1[k] - p0[k]) + 6 * u * t * (p2[k] - p1[k]) + 3 * t * t * (p3[k] - p2[k]);
    huellasLuna.anadir(punto(0), punto(1), -Math.atan2(tangente(0), -tangente(1)));
  }
}

/** Mueve el LRV a donde filmó el despegue (LRV_DESPEGUE), con las huellas del camino desde donde estaba. */
function aparcarLRVDespegue(): void {
  lrvAparcadoDespegue = true;
  if (!lrvLuna) return;
  huellasCamino({ x: lrvLuna.position.x, z: lrvLuna.position.z, rumbo: rumboLRV }, LRV_DESPEGUE);
  rumboLRV = LRV_DESPEGUE.rumbo;
  ruedasLRV?.reiniciar();
  colocarLRV(lrvLuna, LRV_DESPEGUE.x, LRV_DESPEGUE.z, LRV_DESPEGUE.rumbo);
  posicionPreviaLRV = { x: LRV_DESPEGUE.x, z: LRV_DESPEGUE.z };
}

/**
 * Empieza la cinemática del despegue (game/cinematicaDespegue.ts): desde aquí la cámara la lleva la cinemática. El LRV
 * se mueve a su sitio de filmación en la primera toma, ya con la pantalla en negro. Devuelve false si no hay
 * cinemática (fuera de la Luna o sin escena): entonces juego.ts pasa directo al modo libre.
 */
function iniciarDespegue(): boolean {
  if (!despegue || !camara || escenaActual !== 'luna') return false;
  enDespegue = true;
  lrvAparcadoDespegue = false;
  sentadoLRV = false;
  if (haloRoca) haloRoca.visible = false;
  manosAvatar?.ocultar();
  despegue.preparar();
  return true;
}

/** Un fotograma de la cinemática. Sin toma (la pausa inicial), la cámara se queda donde estaba el jugador. */
function actualizarDespegue(estado: EstadoDespegueVisual): void {
  if (!enDespegue || !despegue || !camara || !estado.toma) return;
  if (!lrvAparcadoDespegue) aparcarLRVDespegue();
  despegue.aplicar(estado, camara);
}

/**
 * Fin de la cinemática (o se omitió), con la pantalla en negro: el módulo de ascenso ya se fue y la escena queda en
 * modo libre. El jugador aparece de pie detrás del LRV, a su izquierda, mirando hacia la etapa de descenso.
 */
function terminarDespegue(): void {
  if (!enDespegue) return;
  if (!lrvAparcadoDespegue) aparcarLRVDespegue();
  salirDespegue();
  const pie = enAzimut(LRV_DESPEGUE.rumbo + 180 + 30, 5, LRV_DESPEGUE);
  posicion.set(pie.x, alturaLuna(pie.x, pie.z) + ALTURA_OJOS, pie.z);
  yaw = -THREE.MathUtils.degToRad(azimutEntre(pie, LM));
  cabeceo = 0;
  sentadoLRV = false;
  moverEnLuna(0, 0, 0);
}

/** Oculta las dos manos del avatar, por ejemplo si el seguimiento se ha perdido (SPEC 6). */
function ocultarManos(): void {
  manosAvatar?.ocultar();
}

export const visual = {
  museo: {
    iniciar,
    actualizarLuna,
    poseDespliegueLRV,
    recogerSueloNaranja,
    actualizarManos,
    ocultarManos,
    mostrarVitrina,
    moverCamara,
    fijarBalanceo,
    posicionJugador,
    mentorAparece,
    mentorEstado,
    mentorGesto,
    mentorAmplitud,
    vitrinaEnDireccion,
    vitrinaEnPantalla,
    entrarEscena,
    volverAlMuseo,
    entrarPresentacion,
    actualizarPresentacion,
    iniciarDespegue,
    actualizarDespegue,
    terminarDespegue,
    fundido,
  },
};
