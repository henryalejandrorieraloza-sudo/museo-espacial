import * as THREE from 'three';
import { DIRECCION_MAX_GRADOS } from '../game/luna';
import {
  AZIMUT_BAHIA_LRV,
  DURACION_DESPLIEGUE_LRV_S,
  GIRO_BISAGRAS_ANDANTES_GRADOS,
  GIRO_CHASIS_DELANTERO_GRADOS,
  GIRO_CHASIS_TRASERO_GRADOS,
  GIRO_COLGADO_GRADOS,
  GIRO_LIBERACION_GRADOS,
  FASES_DESPLIEGUE_LRV,
  faseDespliegueEn,
  type FaseDespliegueLRV,
} from './despliegueApollo17';
import {
  BATALLA_LRV,
  BISAGRA_DELANTERA_LRV,
  POSE_DESPLEGADO,
  POSE_PLEGADO,
  VIA_LRV,
  type PlegadoLRV,
  type PosePlegadoLRV,
  type RuedasLRV,
} from './lrv';
import { colocarLRV } from './lunaEscena';
import { alturaLuna } from './lunaTerreno';
import { LM, LRV_ESTACIONADO, type PuntoSuelo } from './sitioApollo17';

// Animación del despliegue del LRV desde la bahía del LM (fases y fuentes en despliegueApollo17.ts). Es una función
// del tiempo: `aplicar(t)` deja el LRV en la pose del segundo `t`, así que se puede saltar a cualquier instante.
// t = 0 es el LRV guardado en la bahía; t = DURACION_DESPLIEGUE_LRV_S, el LRV estacionado en LRV_ESTACIONADO, listo
// para conducir y con la misma pose que le da la misión.
//
// Movimiento del chasis central, tal como lo cuenta el ALSJ: guardado en vertical con la parte de abajo hacia fuera,
// la sección trasera arriba y la delantera abajo, gira hacia fuera sobre su extremo delantero (el de abajo); las
// bisagras andantes llevan ese eje hacia fuera a partir de 15°; a ~120° (colgando a ~30° del suelo) las ruedas
// traseras tocan el suelo, y luego baja el frente hasta quedar apoyado. Las distancias en el LM y la trayectoria de
// la prueba de manejo son del modelo, no de una fuente.

/**
 * Distancia horizontal (m) del centro del LM a la bisagra delantera del LRV guardado. La parte de abajo del chasis
 * central queda justo por fuera de las mantas de la etapa de descenso (4.22 m de ancho, moduloLunar.ts), y el resto
 * del LRV plegado, dentro de la bahía. // VERIFICAR: medidas de la bahía del cuadrante 1.
 */
const RADIO_BISAGRA_GUARDADO_M = 2.224;
/** Altura (m) de esa bisagra sobre la base del LM: el LRV plegado ocupa casi toda la etapa de descenso. */
const ALTURA_BISAGRA_GUARDADO_M = 1.7;
/** Cuánto llevan las bisagras andantes el eje hacia fuera y hacia arriba (m), de 15° a 45°. */
const SALIDA_BISAGRAS_ANDANTES_M = 0.55;
const SUBIDA_BISAGRAS_ANDANTES_M = 0.05;
/** Plegado de la sección delantera tras girar 45° (ALSJ: "the forward chassis section rotates 45 degrees"). */
const PLIEGUE_DELANTERO_TRAS_45 = 0.75;
/** Ruedas delanteras: se traban al final de la bajada trasera, desde este giro del chasis (°). */
const GIRO_RUEDAS_DELANTERAS_GRADOS = 95;
/** Retiro: lo apartan unos pies del LM ("move the Rover out a few feet") y lo alinean hacia el este. */
const SEPARACION_RETIRO_M = 0.9;
const RUMBO_RETIRO = 95;
/** Altura (m) a la que lo levantan a mano al apartarlo. */
const ELEVACION_RETIRO_M = 0.12;
/**
 * Prueba de manejo: de la posición de preparación a LRV_ESTACIONADO. El recorrido exacto no está publicado: aquí el LRV
 * se aparta del LM marcha atrás (NSSDC: "ready to back away from the LM"), sale en curva cerrada a la izquierda, da
 * una vuelta amplia por fuera del LM y acaba en LRV_ESTACIONADO apuntando a la roca. Los parámetros salen de una
 * búsqueda en scratchpad (no en el juego) sobre la huella real del modelo: el centro del LRV a ≥ 3.0 m del centro del
 * LM (etapa de descenso de radio ~2.3 m) y a ≥ 1.9 m de cada pie (4.25 m del centro, radio 0.47 m). Todas las curvas
 * tienen al menos el radio de giro del LRV (3.1 m, NSSDC). Los dos rectos de avance se calculan para terminar justo en
 * LRV_ESTACIONADO, y con estos valores salen positivos (sin recorte).
 */
const RECTO_ATRAS_M = 0;
/** Marcha atrás: el morro gira de RUMBO_RETIRO hacia el sureste. */
const CURVA_ATRAS_GRADOS = 20;
const RADIO_ATRAS_M = 3.2;
/** Salida: curva cerrada a la izquierda, alrededor de la pata del frente. */
const CURVA_SALIDA_GRADOS = -150;
const RADIO_SALIDA_M = 3.2;
/** Vuelta amplia a la izquierda hasta el rumbo de LRV_ESTACIONADO. */
const RADIO_BUCLE_M = 8;
const RECTO_FINAL_M = 0;
/** Fracción de la fase de prueba que dura la marcha atrás: va despacio y para antes de cambiar de sentido. */
const FRACCION_MARCHA_ATRAS = 0.22;
/** Fracción del avance en que acelera y en que frena (perfil trapezoidal de velocidad). */
const FRACCION_ACELERACION = 0.15;

const EJE_X = new THREE.Vector3(1, 0, 0);
const EJE_Y = new THREE.Vector3(0, 1, 0);
const ORDEN = new Map<FaseDespliegueLRV, number>(FASES_DESPLIEGUE_LRV.map((f, i) => [f.fase, i]));

const limitar01 = (v: number): number => Math.min(1, Math.max(0, v));
/** Avance de `v` entre `desde` y `hasta`, entre 0 y 1. */
const tramo = (v: number, desde: number, hasta: number): number => limitar01((v - desde) / (hasta - desde));
/** Arranque y parada suaves. */
const suave = (u: number): number => u * u * (3 - 2 * u);
/** Diferencia de rumbos (°) en el sentido más corto, entre −180 y 180. */
const difRumbo = (a: number, b: number): number => ((((b - a) % 360) + 540) % 360) - 180;

/**
 * Avance con perfil trapezoidal: acelera en la fracción `a` del tiempo, sigue a velocidad constante y frena en la
 * misma fracción al final. Devuelve la fracción del recorrido (0–1) a la fracción `u` del tiempo.
 */
function trapecio(u: number, a: number): number {
  const v = 1 / (1 - a);
  if (u < a) return (v * u * u) / (2 * a);
  if (u > 1 - a) return 1 - (v * (1 - u) * (1 - u)) / (2 * a);
  return v * (u - a / 2);
}

/** Dirección horizontal del azimut (°): 0 = −Z (norte), 90 = +X (este). */
const direccionAzimut = (azimut: number): PuntoSuelo => {
  const a = THREE.MathUtils.degToRad(azimut);
  return { x: Math.sin(a), z: -Math.cos(a) };
};

/** Tramo de una maniobra: recto (m) o curva con cambio de rumbo (°, + = derecha) y radio (m). */
type Tramo = { recto: number } | { curva: number; radio: number };

/** Punto de una maniobra muestreada: recorrido desde su inicio (m), posición, rumbo (°) y curvatura (rad/m, + = derecha). */
interface PuntoManiobra {
  s: number;
  x: number;
  z: number;
  rumbo: number;
  curvatura: number;
}

/** Paso de muestreo de las maniobras (m). */
const PASO_MANIOBRA_M = 0.05;

/**
 * Recorre los tramos desde `inicio` con rumbo `rumbo`. `atras`: marcha atrás (se avanza hacia rumbo + 180°; el rumbo
 * del LRV es el del morro). Devuelve los puntos muestreados, con el primero en s = 0.
 */
function trazarManiobra(inicio: PuntoSuelo, rumbo: number, tramos: readonly Tramo[], atras: boolean): PuntoManiobra[] {
  const puntos: PuntoManiobra[] = [{ s: 0, x: inicio.x, z: inicio.z, rumbo, curvatura: 0 }];
  let { x, z } = inicio;
  let r = rumbo;
  let s = 0;
  for (const t of tramos) {
    const largo = 'recto' in t ? t.recto : THREE.MathUtils.degToRad(Math.abs(t.curva)) * t.radio;
    if (largo <= 0) continue;
    const n = Math.max(1, Math.ceil(largo / PASO_MANIOBRA_M));
    const ds = largo / n;
    const dRumbo = 'recto' in t ? 0 : t.curva / n;
    const curvatura = THREE.MathUtils.degToRad(dRumbo) / ds;
    for (let i = 0; i < n; i++) {
      // Punto medio del paso: así las curvas quedan cerradas aunque el paso sea grande.
      const d = direccionAzimut(r + dRumbo / 2 + (atras ? 180 : 0));
      x += d.x * ds;
      z += d.z * ds;
      r += dRumbo;
      s += ds;
      puntos.push({ s, x, z, rumbo: r, curvatura });
    }
  }
  puntos[0].curvatura = puntos[1]?.curvatura ?? 0;
  return puntos;
}

/** Punto de la maniobra a `s` metros de su inicio, interpolado entre las muestras. */
function enManiobra(puntos: readonly PuntoManiobra[], s: number): PuntoManiobra {
  const ultimo = puntos[puntos.length - 1];
  if (s >= ultimo.s) return ultimo;
  if (s <= 0) return puntos[0];
  let lo = 0;
  let hi = puntos.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (puntos[m].s <= s) lo = m;
    else hi = m;
  }
  const a = puntos[lo];
  const b = puntos[hi];
  const f = (s - a.s) / (b.s - a.s);
  return {
    s,
    x: THREE.MathUtils.lerp(a.x, b.x, f),
    z: THREE.MathUtils.lerp(a.z, b.z, f),
    rumbo: a.rumbo + (b.rumbo - a.rumbo) * f,
    curvatura: b.curvatura,
  };
}

/** Ángulo de la rueda interior (°) para seguir una curvatura (rad/m) con la dirección doble del LRV (Ackermann). */
function direccionParaCurvatura(curvatura: number): number {
  if (Math.abs(curvatura) < 1e-4) return 0;
  const radio = 1 / Math.abs(curvatura);
  const angulo = THREE.MathUtils.radToDeg(Math.atan(BATALLA_LRV / 2 / Math.max(0.1, radio - VIA_LRV / 2)));
  return Math.sign(curvatura) * Math.min(DIRECCION_MAX_GRADOS, angulo);
}

/** Pose del grupo raíz del LRV en el mundo. */
interface PoseRaiz {
  posicion: THREE.Vector3;
  giro: THREE.Quaternion;
}

export interface DespliegueVisualLRV {
  /** Deja el LRV en la pose del segundo `tiempoS` del despliegue. `dtS`: tiempo desde la llamada anterior. */
  aplicar(tiempoS: number, dtS: number): void;
}

export function crearDespliegueLRV(lrv: THREE.Object3D): DespliegueVisualLRV {
  const plegado = lrv.userData.plegado as PlegadoLRV | undefined;
  const ruedas = lrv.userData.ruedas as RuedasLRV | undefined;

  const fuera = new THREE.Vector3(Math.sin(THREE.MathUtils.degToRad(AZIMUT_BAHIA_LRV)), 0, -Math.cos(THREE.MathUtils.degToRad(AZIMUT_BAHIA_LRV)));
  // Guardado y recién desplegado, el morro mira al LM: la silla ("saddle") lo sujetaba por delante.
  const rumboHaciaLM = (AZIMUT_BAHIA_LRV + 180) % 360;
  const giroRumbo = new THREE.Quaternion().setFromAxisAngle(EJE_Y, -THREE.MathUtils.degToRad(rumboHaciaLM));
  const bisagra = new THREE.Vector3(...BISAGRA_DELANTERA_LRV);
  /** Punto de apoyo de las ruedas traseras (en el centro del eje), en ejes del LRV. */
  const apoyoTrasero = new THREE.Vector3(0, 0, BATALLA_LRV / 2);
  const yLM = alturaLuna(LM.x, LM.z);
  const auxiliar = new THREE.Object3D();
  const _v = new THREE.Vector3();

  /** Orientación con el chasis central girado `giroGrados` desde la vertical (0 = guardado; 90 = horizontal). */
  const orientacion = (giroGrados: number, destino: THREE.Quaternion): THREE.Quaternion =>
    destino.setFromAxisAngle(EJE_X, THREE.MathUtils.degToRad(giroGrados - 90)).premultiply(giroRumbo);

  /** Eje de giro (bisagra delantera) sin la bajada final: dentro de la bahía y luego desplazado por las bisagras andantes. */
  const ejeEnBahia = (giroGrados: number, destino: THREE.Vector3): THREE.Vector3 => {
    const salida = suave(tramo(giroGrados, GIRO_BISAGRAS_ANDANTES_GRADOS, GIRO_CHASIS_TRASERO_GRADOS));
    const r = RADIO_BISAGRA_GUARDADO_M + SALIDA_BISAGRAS_ANDANTES_M * salida;
    return destino.set(LM.x + fuera.x * r, yLM + ALTURA_BISAGRA_GUARDADO_M + SUBIDA_BISAGRAS_ANDANTES_M * salida, LM.z + fuera.z * r);
  };

  // Colgado a ~30°, con las ruedas traseras en el suelo: de ahí sale la altura final del eje y el punto de apoyo.
  const ejeFinal = ejeEnBahia(GIRO_COLGADO_GRADOS, new THREE.Vector3());
  const hastaApoyo = apoyoTrasero.clone().sub(bisagra).applyQuaternion(orientacion(GIRO_COLGADO_GRADOS, new THREE.Quaternion()));
  const apoyo = ejeFinal.clone().add(hastaApoyo);
  apoyo.y = alturaLuna(apoyo.x, apoyo.z);
  ejeFinal.y = apoyo.y - hastaApoyo.y;
  const alturaEjeTras45 = ejeEnBahia(GIRO_CHASIS_TRASERO_GRADOS, new THREE.Vector3()).y;
  // Recién desplegado, en el suelo; luego, apartado y alineado para la preparación.
  const desplegado: PuntoSuelo = { x: apoyo.x - fuera.x * (BATALLA_LRV / 2), z: apoyo.z - fuera.z * (BATALLA_LRV / 2) };
  const preparacion: PuntoSuelo = { x: desplegado.x + fuera.x * SEPARACION_RETIRO_M, z: desplegado.z + fuera.z * SEPARACION_RETIRO_M };

  // Prueba de manejo: marcha atrás y avance. Los dos rectos del avance (s1 y s2) se despejan para que termine justo
  // en LRV_ESTACIONADO, con su rumbo: las curvas desplazan lo mismo sea cual sea la longitud de los rectos.
  const atras = trazarManiobra(preparacion, RUMBO_RETIRO, [{ recto: RECTO_ATRAS_M }, { curva: CURVA_ATRAS_GRADOS, radio: RADIO_ATRAS_M }], true);
  const finAtras = atras[atras.length - 1];
  const rumboSalida = finAtras.rumbo;
  const rumboEste = rumboSalida + CURVA_SALIDA_GRADOS;
  // Bucle a la izquierda (negativo) hasta el rumbo final.
  const bucle = ((((LRV_ESTACIONADO.rumbo - rumboEste) % 360) + 360) % 360) - 360;
  const tramosAvance = (s1: number, s2: number): Tramo[] => [
    { recto: s1 },
    { curva: CURVA_SALIDA_GRADOS, radio: RADIO_SALIDA_M },
    { recto: s2 },
    { curva: bucle, radio: RADIO_BUCLE_M },
    { recto: RECTO_FINAL_M },
  ];
  const sinRectos = trazarManiobra(finAtras, rumboSalida, tramosAvance(0, 0), false);
  const finSinRectos = sinRectos[sinRectos.length - 1];
  const d1 = direccionAzimut(rumboSalida);
  const d2 = direccionAzimut(rumboEste);
  const faltaX = LRV_ESTACIONADO.x - finSinRectos.x;
  const faltaZ = LRV_ESTACIONADO.z - finSinRectos.z;
  const det = d1.x * d2.z - d2.x * d1.z;
  const s1 = Math.max(0, (faltaX * d2.z - d2.x * faltaZ) / det);
  const s2 = Math.max(0, (d1.x * faltaZ - faltaX * d1.z) / det);
  const avance = trazarManiobra(finAtras, rumboSalida, tramosAvance(s1, s2), false);
  const largoAtras = finAtras.s;
  const largoAvance = avance[avance.length - 1].s;

  const enSuelo = (x: number, z: number, rumbo: number, destino: PoseRaiz): PoseRaiz => {
    colocarLRV(auxiliar, x, z, rumbo);
    destino.posicion.copy(auxiliar.position);
    destino.giro.copy(auxiliar.quaternion);
    return destino;
  };

  /** Colgando de la bahía, con el chasis central girado `giro` (°): el eje es la bisagra delantera. */
  const colgando = (giro: number, destino: PoseRaiz): PoseRaiz => {
    orientacion(giro, destino.giro);
    ejeEnBahia(giro, destino.posicion);
    if (giro > GIRO_CHASIS_TRASERO_GRADOS) {
      // La silla y los tubos telescópicos bajan el morro mientras las ruedas traseras van hacia el suelo.
      destino.posicion.y = THREE.MathUtils.lerp(alturaEjeTras45, ejeFinal.y, tramo(giro, GIRO_CHASIS_TRASERO_GRADOS, GIRO_COLGADO_GRADOS));
    }
    destino.posicion.sub(_v.copy(bisagra).applyQuaternion(destino.giro));
    return destino;
  };

  const pose: PoseRaiz = { posicion: new THREE.Vector3(), giro: new THREE.Quaternion() };
  const poseB: PoseRaiz = { posicion: new THREE.Vector3(), giro: new THREE.Quaternion() };
  const piezas: PosePlegadoLRV = { ...POSE_PLEGADO };
  /** Posición en el recorrido de la prueba de manejo en la llamada anterior (m), para hacer rodar las ruedas. */
  let recorridoPrevioM: number | null = null;

  /** Pose del LRV y de sus piezas en el segundo `t`. Devuelve la dirección y el avance de la prueba de manejo. */
  const calcular = (t: number): { direccionGrados: number; recorridoM: number | null } => {
    Object.assign(piezas, POSE_PLEGADO);
    if (t >= DURACION_DESPLIEGUE_LRV_S) {
      Object.assign(piezas, POSE_DESPLEGADO);
      enSuelo(LRV_ESTACIONADO.x, LRV_ESTACIONADO.z, LRV_ESTACIONADO.rumbo, pose);
      return { direccionGrados: 0, recorridoM: null };
    }
    const { fase, indice, avance: u } = faseDespliegueEn(Math.max(0, t));
    const hecha = (f: FaseDespliegueLRV): boolean => indice > (ORDEN.get(f) ?? 0);
    // Lo que ya pasó en fases anteriores queda hecho.
    if (hecha('chasisTrasero')) {
      piezas.trasera = 0;
      piezas.ruedasTraseras = 0;
      piezas.delantera = PLIEGUE_DELANTERO_TRAS_45;
    }
    if (hecha('bajadaTrasera')) {
      piezas.delantera = 0;
      piezas.ruedasDelanteras = 0;
    }
    if (hecha('preparacion')) {
      piezas.guardabarros = 0;
      piezas.asientos = 0;
      piezas.consola = 0;
      piezas.reposapies = 0;
    }
    let direccionGrados = 0;
    let recorridoM: number | null = null;
    switch (fase) {
      case 'liberacion':
        // La anilla suelta el carro y su parte de arriba se separa unos 4°.
        colgando(GIRO_LIBERACION_GRADOS * suave(u), pose);
        break;
      case 'inclinacion':
        colgando(THREE.MathUtils.lerp(GIRO_LIBERACION_GRADOS, GIRO_CHASIS_TRASERO_GRADOS, suave(u)), pose);
        break;
      case 'chasisTrasero': {
        // A 45°, en rápida sucesión: cae el chasis trasero, saltan sus ruedas y el delantero gira 45°.
        colgando(GIRO_CHASIS_TRASERO_GRADOS, pose);
        const caida = suave(tramo(u, 0, 0.6));
        piezas.trasera = 1 - caida;
        piezas.delantera = 1 - (1 - PLIEGUE_DELANTERO_TRAS_45) * caida;
        piezas.ruedasTraseras = 1 - suave(tramo(u, 0.35, 0.85));
        break;
      }
      case 'bajadaTrasera': {
        const giro = THREE.MathUtils.lerp(GIRO_CHASIS_TRASERO_GRADOS, GIRO_COLGADO_GRADOS, suave(u));
        colgando(giro, pose);
        // A 73° el delantero vuelve a abrirse; al salir del todo, se traban sus ruedas.
        piezas.delantera = PLIEGUE_DELANTERO_TRAS_45 * (1 - tramo(giro, GIRO_CHASIS_DELANTERO_GRADOS, GIRO_COLGADO_GRADOS));
        piezas.ruedasDelanteras = 1 - suave(tramo(giro, GIRO_RUEDAS_DELANTERAS_GRADOS, GIRO_COLGADO_GRADOS));
        break;
      }
      case 'bajadaDelantera': {
        // Gira sobre las ruedas traseras hasta apoyar el frente y, al final, se asienta en el terreno.
        const giro = THREE.MathUtils.lerp(GIRO_COLGADO_GRADOS, 90, suave(u));
        orientacion(giro, pose.giro);
        pose.posicion.copy(apoyo).sub(_v.copy(apoyoTrasero).applyQuaternion(pose.giro));
        const asiento = suave(tramo(u, 0.7, 1));
        if (asiento > 0) {
          enSuelo(desplegado.x, desplegado.z, rumboHaciaLM, poseB);
          pose.posicion.lerp(poseB.posicion, asiento);
          pose.giro.slerp(poseB.giro, asiento);
        }
        break;
      }
      case 'retiro': {
        // Sueltan la silla, lo levantan un poco, lo apartan del LM y lo giran hacia el este.
        const e = suave(u);
        const x = THREE.MathUtils.lerp(desplegado.x, preparacion.x, e);
        const z = THREE.MathUtils.lerp(desplegado.z, preparacion.z, e);
        enSuelo(x, z, rumboHaciaLM + difRumbo(rumboHaciaLM, RUMBO_RETIRO) * e, pose);
        pose.posicion.y += Math.sin(Math.PI * e) * ELEVACION_RETIRO_M;
        break;
      }
      case 'preparacion':
        enSuelo(preparacion.x, preparacion.z, RUMBO_RETIRO, pose);
        piezas.guardabarros = 1 - suave(tramo(u, 0, 0.33));
        piezas.asientos = 1 - suave(tramo(u, 0.33, 0.66));
        piezas.consola = 1 - suave(tramo(u, 0.66, 1));
        piezas.reposapies = piezas.consola;
        break;
      case 'pruebaManejo': {
        // Marcha atrás despacio, parada, y avance con aceleración y frenado. `recorridoM` es el cuentakilómetros con
        // signo (baja al retroceder), para que las ruedas rueden hacia atrás.
        let p: PuntoManiobra;
        if (u < FRACCION_MARCHA_ATRAS) {
          p = enManiobra(atras, suave(u / FRACCION_MARCHA_ATRAS) * largoAtras);
          recorridoM = -p.s;
          // Marcha atrás, el morro gira hacia el lado contrario al de las ruedas.
          direccionGrados = -direccionParaCurvatura(p.curvatura);
        } else {
          const f = trapecio((u - FRACCION_MARCHA_ATRAS) / (1 - FRACCION_MARCHA_ATRAS), FRACCION_ACELERACION);
          p = enManiobra(avance, f * largoAvance);
          recorridoM = -largoAtras + p.s;
          direccionGrados = direccionParaCurvatura(p.curvatura);
        }
        enSuelo(p.x, p.z, p.rumbo, pose);
        break;
      }
      case 'carga':
        enSuelo(LRV_ESTACIONADO.x, LRV_ESTACIONADO.z, LRV_ESTACIONADO.rumbo, pose);
        piezas.cargaDelantera = suave(tramo(u, 0, 0.5));
        piezas.cargaTrasera = suave(tramo(u, 0.5, 1));
        break;
    }
    return { direccionGrados, recorridoM };
  };

  return {
    aplicar(tiempoS, dtS) {
      const { direccionGrados, recorridoM } = calcular(tiempoS);
      lrv.position.copy(pose.posicion);
      lrv.quaternion.copy(pose.giro);
      plegado?.aplicar(piezas);
      if (tiempoS <= 0) {
        ruedas?.reiniciar();
        recorridoPrevioM = null;
        return;
      }
      const avanceM = recorridoM !== null && recorridoPrevioM !== null ? recorridoM - recorridoPrevioM : 0;
      recorridoPrevioM = recorridoM;
      ruedas?.actualizar(direccionGrados, avanceM, dtS);
    },
  };
}
