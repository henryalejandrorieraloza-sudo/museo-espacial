import * as THREE from 'three';
import { alturaLuna } from './lunaTerreno';
import { BASE_ASCENSO_Y, CENTRO_ASCENSO_Y } from './moduloLunar';
import { COLOR_LM, Lote } from './paleta';
import { crearTrajeApollo } from './props';
import { BANDERA, LM, LRV_DESPEGUE, azimutEntre, enAzimut } from './sitioApollo17';

// Cinemática final de la misión lunar (línea de tiempo y lógica en game/cinematicaDespegue.ts): el despegue del módulo
// de ascenso del Challenger visto por la cámara de TV del LRV, el vuelo visto desde el módulo y el LRV solo en el
// valle. Usa la misma escena lunar del juego (lunaEscena.ts): su LM, su LRV, su terreno y su Sol. Aquí solo se añade
// lo que falta: la llama y los restos que lanza el motor, la bandera, los dos astronautas antes de subir y las tomas.
//
// Datos y fuentes:
// - Wikipedia, "Apollo Lunar Module": motor de ascenso (APS) de 15.6 kN y etapa de ascenso de unos 4.7 t con
//   combustible: ~3.3 m/s² de empuje, frente a 1.62 m/s² de gravedad lunar.
// - ALSJ, Apollo 17 "Return to Orbit": el LRV quedó aparcado al este del LM (posición final vista por LRO en
//   sitioApollo17.ts) y su cámara, manejada desde Houston, siguió el despegue hacia arriba. En la imagen se ve sobre
//   todo una lluvia de trozos de manta térmica que salen despedidos de la etapa de descenso.
// - El motor de ascenso quemaba hidracina y tetróxido de nitrógeno: su llama en el vacío es casi transparente. Por eso
//   aquí la llama es tenue y lo que brilla es el reflejo sobreexpuesto de la cámara, no un chorro de fuego.
// Aproximado (// VERIFICAR): unos 10 s de subida vertical y luego un giro de ~52° hacia el oeste (dirección de la
// órbita). Los tiempos de la cinemática están acortados y no son los de la misión.

/** Empuje del motor de ascenso entre la masa de la etapa (m/s²). */
const ACELERACION_EMPUJE = 3.3;
const GRAVEDAD_LUNA = 1.62;
/** Subida vertical (s) antes de inclinarse. // VERIFICAR */
const SUBIDA_VERTICAL_S = 10;
/** Tiempo (s) que tarda en inclinarse. */
const DURACION_GIRO_S = 3;
/** Inclinación respecto a la vertical tras el giro (°). // VERIFICAR */
const INCLINACION_GRADOS = 52;
/** Rumbo del vuelo (azimut, °): hacia el oeste, como la órbita del módulo de mando. // VERIFICAR */
const RUMBO_VUELO_GRADOS = 270;
const PASO_TRAYECTORIA_S = 1 / 60;
const VUELO_MAXIMO_S = 45;

/** Tomas de la cámara, en ejes del LRV (frente −Z, derecha +X, arriba +Y; origen en el suelo, en el centro). */
type V3 = readonly [number, number, number];
const CENTRO_LRV: V3 = [0, 0.6, 0];
/** Objetivo de la cámara de TV (lámina dorada, mirando hacia delante): ver lrv.ts, `camaraTV`. */
const CAMARA_TV: V3 = [0.1, 1.24, -1.5];
/** Punto de vista de la cámara de TV: justo delante de su objetivo. */
const OJO_CAMARA_TV: V3 = [0.1, 1.24, -1.76];
/** Campo de visión de la cámara de TV (°): con el zoom cerrado, el LM ocupa un tercio de la imagen a 128 m. */
const FOV_TV = 11;
/** Altura (m sobre el suelo del LM) a la que mira la cámara de TV antes del despegue: entre las dos etapas. */
const MIRA_LM_Y = 3.6;

/** Estado que llega de game/cinematicaDespegue.ts (EstadoDespegue): sin importar la lógica desde aquí. */
export interface EstadoDespegueVisual {
  toma: { id: string } | null;
  progresoToma: number;
  vueloS: number;
  bajadaSolGrados: number;
  /** 0–1: la cámara de TV pierde detalle y el módulo queda como un punto de luz. */
  sobreexposicion: number;
  /** Retraso (s) con el que la cámara de TV sigue al módulo. */
  retrasoSeguimientoS: number;
}

export interface DespegueLM {
  /** Deja todo como antes del despegue: módulo de ascenso en su sitio, sin bandera ni astronautas ni restos. */
  reiniciar(): void;
  /** Empieza la cinemática: aparece la bandera (y los astronautas en la primera toma). */
  preparar(): void;
  /** Coloca el módulo, los restos y la cámara para este instante. */
  aplicar(estado: EstadoDespegueVisual, camara: THREE.PerspectiveCamera): void;
  /** Modo libre: el módulo de ascenso ya se fue; quedan la etapa de descenso, la bandera, el LRV y sus huellas. */
  terminar(): void;
}

const suave = (x: number): number => {
  const c = THREE.MathUtils.clamp(x, 0, 1);
  return c * c * (3 - 2 * c);
};

// ---------------------------------------------------------------------------
// Trayectoria del módulo de ascenso
// ---------------------------------------------------------------------------

interface Trayectoria {
  /** Desplazamiento (m, mundo) desde su sitio en el `vueloS` dado; antes del despegue, cero. */
  desplazamiento(vueloS: number, destino: THREE.Vector3): THREE.Vector3;
  /** Inclinación (rad) respecto a la vertical, hacia el rumbo del vuelo. */
  inclinacion(vueloS: number): number;
}

function crearTrayectoria(): Trayectoria {
  const pasos = Math.ceil(VUELO_MAXIMO_S / PASO_TRAYECTORIA_S) + 1;
  const pos = new Float32Array(pasos * 3);
  const rumbo = THREE.MathUtils.degToRad(RUMBO_VUELO_GRADOS);
  const hx = Math.sin(rumbo);
  const hz = -Math.cos(rumbo);
  const incl = (t: number): number =>
    t < SUBIDA_VERTICAL_S ? 0 : THREE.MathUtils.degToRad(INCLINACION_GRADOS) * suave((t - SUBIDA_VERTICAL_S) / DURACION_GIRO_S);
  let px = 0;
  let py = 0;
  let pz = 0;
  let vx = 0;
  let vy = 0;
  let vz = 0;
  for (let i = 0; i < pasos; i++) {
    pos[i * 3] = px;
    pos[i * 3 + 1] = py;
    pos[i * 3 + 2] = pz;
    const a = incl(i * PASO_TRAYECTORIA_S);
    const ah = ACELERACION_EMPUJE * Math.sin(a);
    vx += ah * hx * PASO_TRAYECTORIA_S;
    vz += ah * hz * PASO_TRAYECTORIA_S;
    vy += (ACELERACION_EMPUJE * Math.cos(a) - GRAVEDAD_LUNA) * PASO_TRAYECTORIA_S;
    px += vx * PASO_TRAYECTORIA_S;
    py += vy * PASO_TRAYECTORIA_S;
    pz += vz * PASO_TRAYECTORIA_S;
  }
  return {
    desplazamiento(vueloS, destino) {
      if (vueloS <= 0) return destino.set(0, 0, 0);
      const f = Math.min(vueloS, VUELO_MAXIMO_S) / PASO_TRAYECTORIA_S;
      const i = Math.min(Math.floor(f), pasos - 2);
      const k = f - i;
      const a = i * 3;
      const b = a + 3;
      return destino.set(
        pos[a] + (pos[b] - pos[a]) * k,
        pos[a + 1] + (pos[b + 1] - pos[a + 1]) * k,
        pos[a + 2] + (pos[b + 2] - pos[a + 2]) * k,
      );
    },
    inclinacion: (vueloS) => (vueloS <= 0 ? 0 : incl(vueloS)),
  };
}

// ---------------------------------------------------------------------------
// Llama, brillo y restos
// ---------------------------------------------------------------------------

/** Mancha redonda con borde suave, para los brillos y las partículas. */
function texturaBrillo(): THREE.Texture {
  const lado = 64;
  const lienzo = document.createElement('canvas');
  lienzo.width = lado;
  lienzo.height = lado;
  const ctx = lienzo.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(lado / 2, lado / 2, 0, lado / 2, lado / 2, lado / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.75)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.18)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, lado, lado);
  }
  const textura = new THREE.CanvasTexture(lienzo);
  textura.colorSpace = THREE.SRGBColorSpace;
  return textura;
}

interface Particulas {
  puntos: THREE.Points;
  material: THREE.PointsMaterial;
  tamanoM: number;
  colocar(vueloS: number): void;
}

/**
 * Partículas balísticas (sin aire: suben y caen en parábola, sin nube que flote). Cada una sale en un instante, con
 * una velocidad, y se queda donde cae. Se calculan con el tiempo de vuelo, así que se pueden rebobinar y reanudar.
 */
function crearParticulas(
  cantidad: number,
  semilla: number,
  textura: THREE.Texture,
  tamanoM: number,
  opacidad: number,
  origen: (rnd: () => number) => THREE.Vector3,
  velocidad: (rnd: () => number, origen: THREE.Vector3) => THREE.Vector3,
  salidaMaxS: number,
  colores: readonly number[],
): Particulas {
  let s = semilla;
  const rnd = (): number => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  const o: THREE.Vector3[] = [];
  const v: THREE.Vector3[] = [];
  const salida: number[] = [];
  const caida: number[] = [];
  const suelo: number[] = [];
  const col = new Float32Array(cantidad * 3);
  const color = new THREE.Color();
  for (let i = 0; i < cantidad; i++) {
    const p = origen(rnd);
    const vel = velocidad(rnd, p);
    o.push(p);
    v.push(vel);
    salida.push(rnd() * salidaMaxS);
    // Instante en que vuelve al suelo: el suelo donde cae, con la altura del sitio de salida como aproximación.
    const sueloSalida = alturaLuna(p.x, p.z) + 0.02;
    const dy = p.y - sueloSalida;
    const tc = (vel.y + Math.sqrt(Math.max(0, vel.y * vel.y + 2 * GRAVEDAD_LUNA * dy))) / GRAVEDAD_LUNA;
    caida.push(tc);
    suelo.push(alturaLuna(p.x + vel.x * tc, p.z + vel.z * tc) + 0.03);
    color.setHex(colores[Math.floor(rnd() * colores.length)]);
    col.set([color.r, color.g, color.b], i * 3);
  }
  const posiciones = new Float32Array(cantidad * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(posiciones, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const material = new THREE.PointsMaterial({
    size: tamanoM,
    map: textura,
    vertexColors: true,
    transparent: true,
    opacity: opacidad,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const puntos = new THREE.Points(geo, material);
  puntos.frustumCulled = false;
  puntos.visible = false;
  return {
    puntos,
    material,
    tamanoM,
    colocar(vueloS) {
      for (let i = 0; i < cantidad; i++) {
        const t = Math.min(Math.max(0, vueloS - salida[i]), caida[i]);
        const k = i * 3;
        if (vueloS < salida[i]) {
          // Aún no ha salido: escondida dentro de la etapa de descenso.
          posiciones[k] = o[i].x;
          posiciones[k + 1] = o[i].y - 0.5;
          posiciones[k + 2] = o[i].z;
          continue;
        }
        posiciones[k] = o[i].x + v[i].x * t;
        posiciones[k + 2] = o[i].z + v[i].z * t;
        posiciones[k + 1] = t >= caida[i] ? suelo[i] : o[i].y + v[i].y * t - 0.5 * GRAVEDAD_LUNA * t * t;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

/** Llama del motor de ascenso: cono abierto, aditivo y tenue (ver la nota de la cabecera), con un núcleo más claro. */
function crearLlama(): THREE.Group {
  const grupo = new THREE.Group();
  grupo.name = 'llama_ascenso';
  const capas: [number, number, number, number, number][] = [
    // radio arriba, radio abajo, largo, color, opacidad
    [0.32, 1.5, 3.0, 0xffb070, 0.07],
    [0.22, 0.55, 1.4, 0xbfd8ff, 0.18],
  ];
  for (const [ra, rb, largo, color, opacidad] of capas) {
    const geo = new THREE.CylinderGeometry(ra, rb, largo, 24, 1, true);
    geo.translate(0, -largo / 2, 0);
    const malla = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(color).multiplyScalar(2),
        transparent: true,
        opacity: opacidad,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    malla.userData.opacidad = opacidad;
    grupo.add(malla);
  }
  grupo.position.y = BASE_ASCENSO_Y - CENTRO_ASCENSO_Y;
  grupo.visible = false;
  return grupo;
}

// ---------------------------------------------------------------------------
// Bandera y astronautas
// ---------------------------------------------------------------------------

/**
 * Bandera de EE. UU. de las misiones Apollo: tela de 3 × 5 pies (0.91 × 1.52 m) colgada de una barra horizontal, en un
 * mástil de aluminio. Mira hacia `haciaAzimut`. // VERIFICAR: altura exacta del mástil (aquí ~2.3 m).
 */
function crearBandera(haciaAzimut: number): THREE.Group {
  const l = new Lote(false, 'museo');
  const alto = 0.91;
  const ancho = 1.52;
  const cima = 2.3;
  l.pieza(new THREE.CylinderGeometry(0.016, 0.016, cima + 0.25, 8), COLOR_LM.plata, { p: [-ancho / 2, (cima - 0.25) / 2, 0] });
  l.pieza(new THREE.CylinderGeometry(0.012, 0.012, ancho, 8), COLOR_LM.plata, { p: [0, cima, 0], r: [0, 0, Math.PI / 2] });
  const y = cima - alto / 2 - 0.02;
  l.pieza(new THREE.BoxGeometry(ancho, alto, 0.006), COLOR_LM.banderaBlanco, { p: [0, y, 0] });
  const franja = alto / 13;
  for (let k = 0; k < 7; k++) {
    for (const lado of [-1, 1]) {
      l.pieza(new THREE.BoxGeometry(ancho, franja, 0.004), COLOR_LM.banderaRojo, { p: [0, y + alto / 2 - franja * (2 * k + 0.5), lado * 0.004] });
    }
  }
  for (const lado of [-1, 1]) {
    l.pieza(new THREE.BoxGeometry(ancho * 0.4, franja * 7, 0.004), COLOR_LM.banderaAzul, { p: [-ancho * 0.3, y + alto / 2 - franja * 3.5, lado * 0.007] });
  }
  const grupo = l.construir();
  grupo.name = 'bandera_eeuu';
  grupo.position.set(BANDERA.x, alturaLuna(BANDERA.x, BANDERA.z), BANDERA.z);
  // El frente de la tela (+Z local) mira al azimut pedido.
  grupo.rotation.y = Math.PI - THREE.MathUtils.degToRad(haciaAzimut);
  grupo.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  grupo.visible = false;
  return grupo;
}

/**
 * Cernan y Schmitt junto a la escalera, antes de subir al LM: el traje A7LB vacío de las vitrinas del museo
 * (props.ts), de pie. Solo se ven en la primera toma: al encender el motor ya están dentro.
 */
function crearAstronautas(azimutCamara: number): THREE.Group {
  const l = new Lote(false, 'museo');
  const pie = enAzimut(LM.azimutFrente, 6.3);
  const lateral = THREE.MathUtils.degToRad(LM.azimutFrente + 90);
  // Los dos miran hacia la cámara del LRV (+Z del traje).
  const giro = Math.PI - THREE.MathUtils.degToRad(azimutCamara);
  for (const [lado, comandante] of [
    [-0.9, true],
    [0.8, false],
  ] as const) {
    const x = pie.x + Math.sin(lateral) * lado;
    const z = pie.z - Math.cos(lateral) * lado;
    l.en([x, alturaLuna(x, z), z], [0, giro + lado * 0.3, 0], () => crearTrajeApollo(l, comandante));
  }
  const grupo = l.construir();
  grupo.name = 'astronautas_despegue';
  grupo.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  grupo.visible = false;
  return grupo;
}

// ---------------------------------------------------------------------------
// Cinemática
// ---------------------------------------------------------------------------

/** Punto en ejes del LRV a `dist` de `mira`, con azimut `az` (0 = delante, +90 = a la derecha) y elevación `el` (°). */
function orbita(az: number, el: number, dist: number, mira: V3): V3 {
  const a = THREE.MathUtils.degToRad(az);
  const e = THREE.MathUtils.degToRad(el);
  return [mira[0] + dist * Math.sin(a) * Math.cos(e), mira[1] + dist * Math.sin(e), mira[2] - dist * Math.cos(a) * Math.cos(e)];
}

/**
 * Monta la cinemática en la escena lunar (`escenaLuna`, el grupo de lunaEscena.ts). Si falta el LM, su etapa de
 * ascenso o el LRV, devuelve null y el juego sigue sin cinemática.
 */
export function crearDespegueLM(escenaLuna: THREE.Object3D): DespegueLM | null {
  const lm = escenaLuna.getObjectByName('lm_challenger');
  const ascenso = escenaLuna.getObjectByName('lm_ascenso');
  const lrv = escenaLuna.getObjectByName('lrv_placeholder');
  if (!lm || !ascenso || !lrv) return null;

  const grupo = new THREE.Group();
  grupo.name = 'despegue_lm';
  escenaLuna.add(grupo);
  const trayectoria = crearTrayectoria();
  const textura = texturaBrillo();
  const rumboVuelo = THREE.MathUtils.degToRad(RUMBO_VUELO_GRADOS);
  const ejeInclinacion = new THREE.Vector3(0, 1, 0).cross(new THREE.Vector3(Math.sin(rumboVuelo), 0, -Math.cos(rumboVuelo))).normalize();

  const sueloLM = alturaLuna(LM.x, LM.z);
  const centroReposo = new THREE.Vector3(LM.x, sueloLM + CENTRO_ASCENSO_Y, LM.z);
  const miraTV = new THREE.Vector3(LM.x, sueloLM + MIRA_LM_Y, LM.z);
  const quatLM = new THREE.Quaternion();

  const llama = crearLlama();
  ascenso.add(llama);
  // Brillo del motor: sobreexpone la cámara (florece con el bloom de la Luna, que solo pasa de luminancia 3).
  const brilloMotor = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: textura, color: new THREE.Color(1, 0.92, 0.8).multiplyScalar(7), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
  );
  brilloMotor.position.y = BASE_ASCENSO_Y - CENTRO_ASCENSO_Y - 0.3;
  brilloMotor.scale.setScalar(3.2);
  brilloMotor.visible = false;
  ascenso.add(brilloMotor);
  // Punto de luz: con la cámara sobreexpuesta, el módulo lejano se ve como una mancha blanca de tamaño fijo en pantalla.
  const punto = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: textura, color: new THREE.Color(1, 1, 0.95).multiplyScalar(6), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, sizeAttenuation: false }),
  );
  punto.visible = false;
  ascenso.add(punto);

  // Restos: trozos de manta térmica dorada y plateada que el chorro arranca de la etapa de descenso, y algo de polvo.
  const origenRestos = (rnd: () => number): THREE.Vector3 => {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * 1.7;
    return new THREE.Vector3(LM.x + Math.cos(a) * r, sueloLM + BASE_ASCENSO_Y - 0.1 + rnd() * 0.3, LM.z + Math.sin(a) * r);
  };
  const restos = crearParticulas(
    480,
    1972,
    textura,
    0.16,
    1,
    origenRestos,
    (rnd, p) => {
      const h = new THREE.Vector3(p.x - LM.x, 0, p.z - LM.z).normalize();
      const rapidez = 4 + rnd() ** 1.5 * 16;
      return h.multiplyScalar(rapidez).setY(1 + rnd() * 11);
    },
    2.2,
    [0xd8a640, 0xf2d27a, 0xc9ccd0, 0xe8e8e8, 0x3a3836],
  );
  const polvo = crearParticulas(
    520,
    1214,
    textura,
    0.42,
    0.5,
    (rnd) => {
      const a = rnd() * Math.PI * 2;
      const r = 2.2 + rnd() * 2.6;
      const x = LM.x + Math.cos(a) * r;
      const z = LM.z + Math.sin(a) * r;
      return new THREE.Vector3(x, alturaLuna(x, z) + 0.05, z);
    },
    (rnd, p) => new THREE.Vector3(p.x - LM.x, 0, p.z - LM.z).normalize().multiplyScalar(5 + rnd() * 18).setY(0.4 + rnd() * 3),
    1.4,
    [0x9a9893, 0x85837e, 0xaaa8a2],
  );
  grupo.add(restos.puntos, polvo.puntos);

  const bandera = crearBandera(azimutEntre(BANDERA, LRV_DESPEGUE));
  const astronautas = crearAstronautas(azimutEntre(enAzimut(LM.azimutFrente, 6.3), LRV_DESPEGUE));
  grupo.add(bandera, astronautas);

  const _a = new THREE.Vector3();
  const _b = new THREE.Vector3();
  const _c = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  const curva = new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]);

  const enLRV = (p: V3, destino: THREE.Vector3): THREE.Vector3 => destino.set(p[0], p[1], p[2]).applyMatrix4(lrv.matrixWorld);

  /** Pone el módulo de ascenso a `vueloS` segundos del despegue (en su sitio si es ≤ 0). Devuelve su centro (mundo). */
  const colocarAscenso = (vueloS: number, destino: THREE.Vector3): THREE.Vector3 => {
    trayectoria.desplazamiento(vueloS, destino).add(centroReposo);
    lm.updateMatrixWorld();
    ascenso.position.copy(lm.worldToLocal(_c.copy(destino)));
    lm.getWorldQuaternion(quatLM);
    _q.setFromAxisAngle(ejeInclinacion, trayectoria.inclinacion(vueloS));
    ascenso.quaternion.copy(quatLM.clone().invert().multiply(_q).multiply(quatLM));
    return destino;
  };

  const fijarCamara = (camara: THREE.PerspectiveCamera, pos: THREE.Vector3, mira: THREE.Vector3, fov: number, alabeo = 0): void => {
    camara.position.copy(pos);
    camara.up.set(0, 1, 0);
    camara.lookAt(mira);
    if (alabeo !== 0) camara.rotateZ(alabeo);
    if (camara.fov !== fov) {
      camara.fov = fov;
      camara.updateProjectionMatrix();
    }
  };

  const sombras = (centro: THREE.Vector3 | null, lado?: number): void => {
    escenaLuna.userData.fijarSombras?.(centro, lado);
  };

  const reiniciar = (): void => {
    ascenso.visible = true;
    ascenso.position.set(0, CENTRO_ASCENSO_Y, 0);
    ascenso.quaternion.identity();
    llama.visible = false;
    brilloMotor.visible = false;
    punto.visible = false;
    restos.puntos.visible = false;
    polvo.puntos.visible = false;
    bandera.visible = false;
    astronautas.visible = false;
    sombras(null);
    escenaLuna.userData.bajarSol?.(0);
  };

  return {
    reiniciar,
    preparar() {
      reiniciar();
      bandera.visible = true;
    },
    aplicar(estado, camara) {
      const id = estado.toma?.id ?? null;
      lrv.updateMatrixWorld(true);
      const vuelo = estado.vueloS;
      const centro = colocarAscenso(vuelo, _a);
      const ardiendo = vuelo >= 0;
      // Desde dentro del módulo no se ve el propio módulo; los demás planos sí.
      ascenso.visible = id !== 'ventanaLM' && id !== 'finalLRV';
      astronautas.visible = id === 'exteriorLRV' || (id === null && vuelo < -2);
      llama.visible = ardiendo && ascenso.visible;
      const parpadeo = 0.82 + 0.18 * Math.sin(vuelo * 53) * Math.sin(vuelo * 17.3 + 1);
      for (const capa of llama.children) {
        const m = (capa as THREE.Mesh).material as THREE.MeshBasicMaterial;
        m.opacity = (capa.userData.opacidad as number) * parpadeo;
      }
      brilloMotor.visible = llama.visible;
      brilloMotor.material.opacity = THREE.MathUtils.clamp(vuelo * 3, 0, 1) * parpadeo;
      punto.visible = id === 'seguimientoTV' && estado.sobreexposicion > 0.02;
      punto.material.opacity = estado.sobreexposicion;
      for (const p of [restos, polvo]) {
        p.puntos.visible = ardiendo && id !== null && id !== 'finalLRV';
        if (p.puntos.visible) p.colocar(vuelo);
      }
      // El polvo no flota (no hay aire): se ve mientras vuela y se apaga al posarse.
      polvo.material.opacity = 0.5 * (1 - suave((vuelo - 2.5) / 3));
      escenaLuna.userData.bajarSol?.(estado.bajadaSolGrados);

      const p = estado.progresoToma;
      let fov = 40;
      if (id === 'exteriorLRV') {
        // Acercamiento al LRV y a su cámara de TV (como en las referencias); después la cámara se aparta por el costado
        // derecho, por fuera de las antenas, y mira hacia el LM, donde los astronautas esperan junto a la escalera.
        const u = suave(p);
        const k0 = orbita(52, 14, 7.5, CENTRO_LRV);
        const k1 = orbita(40, 5, 1.7, CAMARA_TV);
        const k2: V3 = [0.95, 1.5, -1.0];
        enLRV(k0, curva.points[0]);
        enLRV(k1, curva.points[1]);
        enLRV(k2, curva.points[2]);
        curva.getPoint(u, _b);
        if (u < 0.5) {
          enLRV(CENTRO_LRV, _c).lerp(enLRV(CAMARA_TV, new THREE.Vector3()), suave(u * 2));
          fov = THREE.MathUtils.lerp(40, 34, suave(u * 2));
        } else {
          enLRV(CAMARA_TV, _c).lerp(miraTV, suave((u - 0.5) * 2));
          fov = THREE.MathUtils.lerp(34, 22, suave((u - 0.5) * 2));
        }
        fijarCamara(camara, _b, _c, fov);
        sombras(enLRV(CENTRO_LRV, new THREE.Vector3()));
      } else if (id === 'camaraTV' || id === 'seguimientoTV') {
        // La cámara de TV: fija en el LM; después, el operador la inclina para seguir al módulo con algo de retraso.
        enLRV(OJO_CAMARA_TV, _b);
        _c.copy(miraTV);
        if (id === 'seguimientoTV') _c.add(trayectoria.desplazamiento(vuelo - estado.retrasoSeguimientoS, new THREE.Vector3()));
        fijarCamara(camara, _b, _c, FOV_TV);
        // El punto de luz ocupa una fracción fija de la altura de la pantalla.
        punto.scale.setScalar(0.09 * 2 * Math.tan(THREE.MathUtils.degToRad(FOV_TV / 2)) * (0.4 + estado.sobreexposicion));
        sombras(miraTV.clone().setY(sueloLM));
      } else if (id === 'ventanaLM') {
        // Desde la ventana del módulo, mirando hacia abajo y hacia atrás (hacia el LRV) mientras el suelo se aleja: primero
        // la bandera cerca del LM y, al subir, el LRV solo con sus huellas.
        const lrvPos = enLRV(CENTRO_LRV, new THREE.Vector3());
        const atras = new THREE.Vector3(lrvPos.x - centro.x, 0, lrvPos.z - centro.z).normalize();
        _b.copy(centro).addScaledVector(atras, 1.7).add(new THREE.Vector3(0, -0.9, 0));
        const u = suave(p);
        const mira = new THREE.Vector3(BANDERA.x, 0, BANDERA.z).lerp(lrvPos, THREE.MathUtils.lerp(0.3, 0.72, u));
        mira.y = alturaLuna(mira.x, mira.z);
        // Vibración leve del módulo.
        const alabeo = 0.012 * Math.sin(vuelo * 23) + 0.006 * Math.sin(vuelo * 41);
        fijarCamara(camara, _b, mira, THREE.MathUtils.lerp(32, 26, u), alabeo);
        sombras(new THREE.Vector3(LM.x, sueloLM, LM.z).lerp(lrvPos, 0.5), 90);
      } else if (id === 'finalLRV') {
        // El LRV solo: la cámara se eleva despacio sobre él, con el Sol a la espalda y la etapa de descenso al fondo.
        const u = suave(p);
        enLRV(orbita(THREE.MathUtils.lerp(150, 165, u), THREE.MathUtils.lerp(7, 24, u), THREE.MathUtils.lerp(7.5, 19, u), CENTRO_LRV), _b);
        enLRV([0, 0.4, THREE.MathUtils.lerp(-1, -10, u)], _c);
        fijarCamara(camara, _b, _c, 40);
        sombras(enLRV([0, 0, -12], new THREE.Vector3()), 48);
      }
      // Tamaño real de las partículas con cualquier zoom: PointsMaterial no tiene en cuenta el campo de visión.
      const escalaFov = 1 / Math.tan(THREE.MathUtils.degToRad(camara.fov / 2));
      for (const q of [restos, polvo]) q.material.size = q.tamanoM * escalaFov;
    },
    terminar() {
      // El módulo de ascenso ya está en órbita: se esconde. Los restos caídos y el polvo, también.
      ascenso.visible = false;
      llama.visible = false;
      brilloMotor.visible = false;
      punto.visible = false;
      restos.puntos.visible = false;
      polvo.puntos.visible = false;
      astronautas.visible = false;
      bandera.visible = true;
      sombras(null);
      escenaLuna.userData.bajarSol?.(0);
    },
  };
}
