import * as THREE from 'three';
import type { CueNombre } from '../audio/guion';

// Robot-mentor del museo (solo visual). Low poly con caras planas: cabeza de huevo blanca, visor negro con barras LED
// como ojos, collar, brazos de cadena de segmentos alternos negro/blanco con manos de tres aspas, cuerpo en cápsula y
// una rueda de goma negra. El origen es el centro del conjunto y el visor mira a +Z; `museo.ts` lo gira hacia el
// jugador y lo hace flotar. Altura total H ≈ 1 (ver las constantes de proporción).

export type EstadoMentor = 'idle' | 'speaking';
/** Gestos que la voz pide al mentor: las marcas del guion y el aviso de inicio de frase (que solo reinicia el límite de un gesto por frase). */
export type GestoMentor = CueNombre | 'inicioFrase';

const COLOR = {
  blanco: 0xf1f3f6,
  negro: 0x0b0c10,
  goma: 0x16161a,
  gris: 0x8a909a,
  led: [0x2bff7a, 0x2bff7a, 0x2bff7a, 0xffd23a, 0xffd23a, 0xff3b3b],
} as const;

const FILAS = 6;
const COLUMNAS_POR_OJO = 2;

// Brazos: cadena de SEGMENTOS_BRAZO cilindros de LADOS_BRAZO lados, con una articulación (pivote) entre cada par.
const SEGMENTOS_BRAZO = 12;
const LADOS_BRAZO = 8;
const LARGO_BRAZO = 0.47;
const RADIO_BRAZO = 0.035;
/** Amplitud (rad) de la curva en S fija del brazo, acumulada a lo largo de la cadena. */
const CURVA_S = 0.22;

/** Exponente del visor: < 1 convierte el elipsoide en un óvalo de esquinas redondeadas. */
const FORMA_VISOR = 0.75;
const V = { rx: 0.178, ry: 0.1, rz: 0.1, y: 0.14, z: 0.152 };

function material(color: number, rugosidad = 0.55): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: rugosidad, flatShading: true });
}

function malla(
  geometria: THREE.BufferGeometry,
  mat: THREE.Material,
  posicion: [number, number, number] = [0, 0, 0],
  giro: [number, number, number] = [0, 0, 0],
): THREE.Mesh {
  const m = new THREE.Mesh(geometria, mat);
  m.position.set(...posicion);
  m.rotation.set(...giro);
  return m;
}

/** Sólido de revolución a partir de un perfil (radio, altura) de abajo hacia arriba. */
function lathe(perfil: [number, number][], lados: number): THREE.LatheGeometry {
  return new THREE.LatheGeometry(perfil.map(([r, y]) => new THREE.Vector2(r, y)), lados);
}

/** Cabeza de huevo: ancho 0.55, alto 0.34, parte más ancha por encima del centro y frente más plana (z delantero ×0.82). */
const PERFIL_CABEZA: [number, number][] = [
  [0, 0], [0.1, 0], [0.18, 0.02], [0.23, 0.05], [0.263, 0.1], [0.275, 0.17], [0.268, 0.22], [0.245, 0.265],
  [0.205, 0.3], [0.15, 0.326], [0.09, 0.338], [0.04, 0.34], [0, 0.34],
];
function geometriaCabeza(): THREE.BufferGeometry {
  const g = lathe(PERFIL_CABEZA, 14);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    p.setZ(i, z > 0 ? z * 0.82 : z * 0.95);
  }
  return g;
}

/** Cuerpo: 0.45 de alto y 0.35 de ancho máximo; estrecho arriba, se abulta en la parte baja y se afina hacia la base. */
const PERFIL_CUERPO: [number, number][] = [
  [0, 0], [0.07, 0], [0.12, 0.025], [0.16, 0.06], [0.18, 0.11], [0.184, 0.17], [0.178, 0.23], [0.16, 0.3],
  [0.135, 0.36], [0.11, 0.41], [0.095, 0.445], [0.09, 0.45],
];

/** Neumático con esquinas redondeadas: perfil (radio, ancho) girado sobre el eje Z del modelo. */
const PERFIL_NEUMATICO: [number, number][] = [
  [0.04, -0.07], [0.07, -0.07], [0.082, -0.055], [0.085, -0.03], [0.085, 0.03], [0.082, 0.055], [0.07, 0.07], [0.04, 0.07],
];

/** Visor: esfera aplastada con esquinas redondeadas (superelipse). */
function geometriaVisor(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 14, 10);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    p.setXYZ(
      i,
      Math.sign(x) * Math.abs(x) ** FORMA_VISOR * V.rx,
      Math.sign(y) * Math.abs(y) ** FORMA_VISOR * V.ry,
      p.getZ(i) * V.rz,
    );
  }
  return g;
}

/** Altura (z local) de la superficie del visor en (x, y); inversa de `geometriaVisor`. */
function zVisor(x: number, y: number): number {
  const u = (Math.abs(x) / V.rx) ** (1 / FORMA_VISOR);
  const v = (Math.abs(y) / V.ry) ** (1 / FORMA_VISOR);
  return V.rz * Math.sqrt(Math.max(1 - u * u - v * v, 0));
}

/** Aspa de la mano: aleta plana extruida y afilada. Pivota sobre su base (y = 0). */
function geometriaAspa(): THREE.BufferGeometry {
  const f = new THREE.Shape();
  f.moveTo(-0.011, 0.012);
  f.lineTo(0.011, 0.012);
  f.lineTo(0.017, 0.05);
  f.lineTo(0, 0.07);
  f.lineTo(-0.017, 0.05);
  f.closePath();
  const g = new THREE.ExtrudeGeometry(f, { depth: 0.006, bevelEnabled: false });
  g.translate(0, 0, -0.003);
  return g;
}

// Resortes amortiguados de las articulaciones: ζ = 0,72 da un sobreimpulso de exp(−πζ/√(1−ζ²)) ≈ 3,8 % y un
// asentamiento al 2 % de 4/(ζ·ω) ≈ 0,75 s en la raíz (ω = 7,4 rad/s) y ≈ 0,84 s en la punta (ω = 6,6 rad/s).
const OMEGA_RAIZ = 7.4;
const OMEGA_PUNTA = 6.6;
const ZETA = 0.72;
/** Cada segmento sigue al anterior con este retraso (s): el brazo se dobla como un cable flexible. */
const RETRASO_JUNTA_S = 0.05;

/** Valor pseudoaleatorio estable en [−1, 1] para (semilla, entero). */
function azarEntero(semilla: number, i: number): number {
  let h = (Math.imul(i, 374761393) + Math.imul(semilla, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 2147483648 - 1;
}

/** Ruido suave 1D en [−1, 1] (dos octavas), distinto para cada semilla. No es periódico: no se repite en ningún bucle. */
function ruido(semilla: number, x: number): number {
  const una = (sem: number, v: number): number => {
    const i = Math.floor(v);
    const f = v - i;
    const u = f * f * (3 - 2 * f);
    return azarEntero(sem, i) * (1 - u) + azarEntero(sem, i + 1) * u;
  };
  return (una(semilla, x) + 0.5 * una(semilla + 101, x * 2.3)) / 1.5;
}

interface Brazo {
  raiz: THREE.Group;
  juntas: THREE.Group[];
  mano: THREE.Group;
  pivotesAspa: THREE.Group[];
  fase: number;
  giroMano: number;
}

/**
 * Brazo: cadena de segmentos cortos. Cada uno cuelga de un pivote hijo del anterior, así las rotaciones se acumulan y el
 * brazo ondula. La raíz mira hacia +X; el brazo izquierdo se espeja con scale.x = −1 para compartir la animación.
 */
function crearBrazo(
  lado: 1 | -1,
  geoSegmento: THREE.BufferGeometry,
  geoAspa: THREE.BufferGeometry,
  geoBuje: THREE.BufferGeometry,
  blanco: THREE.Material,
  negro: THREE.Material,
): Brazo {
  const raiz = new THREE.Group();
  raiz.position.set(lado * 0.13, 0.625, 0);
  raiz.scale.x = lado;
  // Primero cabeceo (z) y luego giro sobre la vertical (y): y positivo lleva el brazo hacia atrás, negativo hacia delante.
  raiz.rotation.order = 'YZX';
  const largo = LARGO_BRAZO / SEGMENTOS_BRAZO;
  const juntas: THREE.Group[] = [];
  let padre: THREE.Group = raiz;
  for (let i = 0; i < SEGMENTOS_BRAZO; i++) {
    const junta = new THREE.Group();
    junta.position.x = i === 0 ? 0 : largo;
    junta.add(malla(geoSegmento, i % 2 === 0 ? negro : blanco));
    padre.add(junta);
    juntas.push(junta);
    padre = junta;
  }
  // Mano: muñeca al final de la cadena, buje central y tres aspas inclinadas que se abren y cierran.
  const mano = new THREE.Group();
  mano.position.x = largo;
  mano.add(malla(geoBuje, blanco));
  const pivotesAspa: THREE.Group[] = [];
  for (let i = 0; i < 3; i++) {
    const pivote = new THREE.Group();
    pivote.rotation.z = (i * Math.PI * 2) / 3;
    pivote.add(malla(geoAspa, blanco));
    mano.add(pivote);
    pivotesAspa.push(pivote);
  }
  padre.add(mano);
  return { raiz, juntas, mano, pivotesAspa, fase: lado > 0 ? 0 : 2.1, giroMano: lado > 0 ? 0 : 1 };
}

export function crearMentor(): THREE.Object3D {
  const grupo = new THREE.Group();
  // Todo se construye con el suelo en y = 0 y altura ≈ 0.98; este grupo lo centra y es el que se mece en reposo.
  const modelo = new THREE.Group();
  modelo.position.y = -0.49;
  grupo.add(modelo);
  const blanco = material(COLOR.blanco, 0.4);
  const negro = material(COLOR.negro, 0.35);
  const goma = material(COLOR.goma, 0.95);
  // Cristal del visor: negro sin brillo especular. Con el negro brillante, la luz ámbar del museo dibujaba un rectángulo
  // grisáceo en la faceta central; el visor debe verse como cristal negro limpio con solo las barras LED.
  const vidrio = new THREE.MeshPhysicalMaterial({ color: 0x040508, roughness: 1, metalness: 0, specularIntensity: 0, flatShading: true });
  const gris = material(COLOR.gris, 0.5);

  // Cabeza (pivote en su base).
  const cabeza = new THREE.Group();
  cabeza.position.y = 0.64;
  const domo = malla(geometriaCabeza(), blanco);
  domo.name = 'domo';
  cabeza.add(domo);
  // Visor: óvalo negro grande de esquinas redondeadas, centrado y por debajo del centro; asoma por la frente plana.
  const visor = malla(geometriaVisor(), vidrio, [0, V.y, V.z]);
  visor.name = 'visor';
  cabeza.add(visor);

  // Ojos: dos grupos de barras LED (2 columnas x 6 segmentos) sobre la superficie del visor.
  const geoLed = new THREE.BoxGeometry(0.016, 0.02, 0.008);
  const columnas: THREE.MeshStandardMaterial[][] = [];
  const z0 = new THREE.Vector3(0, 0, 1);
  const e = 0.004;
  for (const lado of [-1, 1]) {
    for (let c = 0; c < COLUMNAS_POR_OJO; c++) {
      const x = lado * 0.075 + (c - 0.5) * 0.026;
      const mats: THREE.MeshStandardMaterial[] = [];
      for (let r = 0; r < FILAS; r++) {
        const y = (r - (FILAS - 1) / 2) * 0.026;
        const zl = zVisor(x, y) + 0.003;
        const n = new THREE.Vector3(
          -(zVisor(x + e, y) - zVisor(x - e, y)) / (2 * e),
          -(zVisor(x, y + e) - zVisor(x, y - e)) / (2 * e),
          1,
        ).normalize();
        const mat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: COLOR.led[r], emissiveIntensity: 1 });
        const led = malla(geoLed, mat, [x, V.y + y, V.z + zl]);
        led.quaternion.setFromUnitVectors(z0, n);
        cabeza.add(led);
        mats.push(mat);
      }
      columnas.push(mats);
    }
  }
  modelo.add(cabeza);

  // Collar (0.06 de alto): banda blanca fina y, debajo, banda negra acanalada.
  modelo.add(malla(new THREE.CylinderGeometry(0.13, 0.13, 0.03, 14), blanco, [0, 0.625, 0]));
  modelo.add(malla(new THREE.CylinderGeometry(0.1375, 0.1375, 0.03, 14), negro, [0, 0.595, 0]));
  const geoNervio = new THREE.CylinderGeometry(0.1425, 0.1425, 0.006, 14);
  for (const y of [0.585, 0.595, 0.605]) modelo.add(malla(geoNervio, negro, [0, y, 0]));

  // Cuerpo: cápsula blanca; delante, abrazando su parte baja, una rueda de goma negra con el disco hacia el frente.
  const pod = malla(lathe(PERFIL_CUERPO, 14), blanco, [0, 0.13, 0]);
  pod.name = 'pod';
  modelo.add(pod);
  const rueda = new THREE.Group();
  rueda.name = 'rueda';
  rueda.position.set(0, 0.085, 0.06);
  rueda.add(malla(lathe(PERFIL_NEUMATICO, 18), goma, [0, 0, 0], [Math.PI / 2, 0, 0]));
  rueda.add(malla(new THREE.CylinderGeometry(0.042, 0.042, 0.15, 8), gris, [0, 0, 0], [Math.PI / 2, 0, 0]));
  modelo.add(rueda);

  // Brazos (cadena animada) y manos.
  const geoSegmento = new THREE.CylinderGeometry(RADIO_BRAZO, RADIO_BRAZO, LARGO_BRAZO / SEGMENTOS_BRAZO, LADOS_BRAZO);
  geoSegmento.rotateZ(-Math.PI / 2);
  geoSegmento.translate(LARGO_BRAZO / SEGMENTOS_BRAZO / 2, 0, 0);
  const geoAspa = geometriaAspa();
  const geoBuje = new THREE.IcosahedronGeometry(0.022, 1);
  const brazos = [-1, 1].map((l) => crearBrazo(l as 1 | -1, geoSegmento, geoAspa, geoBuje, blanco, negro));
  brazos.forEach((b, k) => {
    b.raiz.name = k === 0 ? 'brazo_izq' : 'brazo_der';
    modelo.add(b.raiz);
  });
  // Curva en S fija: el ángulo acumulado sigue a·sin(2π·i/N); cada articulación aporta la diferencia.
  const curvaBase = Array.from({ length: SEGMENTOS_BRAZO }, (_, i) =>
    CURVA_S * (Math.sin((2 * Math.PI * (i + 1)) / SEGMENTOS_BRAZO) - Math.sin((2 * Math.PI * i) / SEGMENTOS_BRAZO)),
  );

  // Poses de los brazos: [izquierdo, derecho] con (cabeceo, giro, flexión total, peso de la curva en S, apertura de garra,
  // curva lateral total). Ángulos en grados; cabeceo + = arriba, giro − = hacia delante, flexión + = la cadena se curva
  // hacia arriba, lateral − = la cadena se curva hacia dentro (hacia el cuerpo). Se definen para el brazo con la cadena
  // hacia +X (el izquierdo está espejado), así que ambos usan las mismas reglas. En los gestos de un solo brazo, el que
  // gesticula es el segundo de la pareja (se alterna con `inv`) y el otro se queda en reposo.
  const GRAD = Math.PI / 180;
  /** Reposo con la caída por peso: los brazos cuelgan con el codo algo doblado, nunca rectos. */
  const REPOSO = [-35, -6, -50, 0.3, 0.5, -4];
  /** Cada gesto llega solo al 85 % de su extensión respecto al reposo (cabeceo, giro, flexión y curva lateral). */
  const ESCALA_GESTO = 0.85;
  /** Asimetría fija del reposo: los dos brazos nunca son imagen en espejo (cabeceo, giro, flexión en grados). */
  const ASIMETRIA = [
    [2, -3, 4],
    [0, 0, 0],
  ];
  const POSES = {
    N: [REPOSO, REPOSO],
    // heroico: un brazo muy alto sobre el hombro, garra cerrada e inclinada un poco hacia delante.
    heroico: [REPOSO, [6, -15, 90, 0.1, 0.15, 0]],
    // exacto: la garra casi en el collar (el brazo se pliega hacia dentro). El pulso corto se añade aparte.
    exacto: [REPOSO, [-15, -80, 20, 0.1, 0.4, -150]],
    // directo: un brazo al frente y algo hacia fuera, garra abierta.
    directo: [REPOSO, [5, -50, 0, 0.2, 1, 0]],
    // poderoso: un brazo doblado con la garra cerrada cerca del pecho (el cuerpo se inclina aparte).
    poderoso: [REPOSO, [-20, -60, 50, 0.1, 0.15, -120]],
    // honesto: los dos brazos bajan y se abren un poco hacia fuera, garras abiertas.
    honesto: [[-20, 10, -30, 0.6, 1, 0], [-20, 10, -30, 0.6, 1, 0]],
    // cercano: los dos brazos se pliegan despacio hacia el cuerpo.
    cercano: [[-5, -60, 10, 0.2, 0.6, -80], [-5, -60, 10, 0.2, 0.6, -80]],
  } satisfies Record<string, [number[], number[]]>;
  type PoseId = keyof typeof POSES;
  interface DefGesto {
    pose: PoseId;
    /** Segundos hasta que el gesto está formado, de mantenida y de salida hacia el reposo. */
    entrada: number;
    sosten: number;
    salida: number;
    /** Los dos brazos a la vez (si no, uno solo y se alterna cuál). */
    ambos: boolean;
    /** Inclinación del cuerpo hacia delante mientras se mantiene (rad). */
    inclina: number;
    /** Pulso corto del brazo (≈0,3 s) al llegar a la pose. */
    pulso: boolean;
  }
  // `entrada` cuenta la subida de los resortes y el retraso a lo largo de la cadena (≈0,6 s entre hombro y punta).
  const GESTOS: Record<CueNombre, DefGesto> = {
    heroico: { pose: 'heroico', entrada: 1.3, sosten: 1.5, salida: 1, ambos: false, inclina: 0, pulso: false },
    exacto: { pose: 'exacto', entrada: 1.3, sosten: 0.9, salida: 1, ambos: false, inclina: 0, pulso: true },
    directo: { pose: 'directo', entrada: 1.3, sosten: 1.2, salida: 1, ambos: false, inclina: 0, pulso: false },
    poderoso: { pose: 'poderoso', entrada: 1.3, sosten: 1.2, salida: 1, ambos: false, inclina: 4 * GRAD, pulso: false },
    honesto: { pose: 'honesto', entrada: 1.3, sosten: 1.5, salida: 1, ambos: true, inclina: 0, pulso: false },
    cercano: { pose: 'cercano', entrada: 1.3, sosten: 1.5, salida: 1, ambos: true, inclina: 0, pulso: false },
  };
  /** Anticipación: antes del gesto, el brazo va un poco al lado contrario durante este tiempo (s). */
  const ANTICIPACION_S = 0.18;
  const PITCH_MIN = -55 * GRAD;
  const PITCH_MAX = 75 * GRAD;
  const YAW_MIN = -90 * GRAD;
  const YAW_MAX = 10 * GRAD;
  const limitar = (v: number, a: number, b: number): number => Math.min(Math.max(v, a), b);
  // Reparto de la flexión y de la curva lateral: más hacia la punta, para que el antebrazo se curve más que la parte alta.
  const sumaPesos = Array.from({ length: SEGMENTOS_BRAZO }, (_, i) => 0.5 + i / (SEGMENTOS_BRAZO - 1)).reduce((x, y) => x + y, 0);
  const pesoFlexion = Array.from({ length: SEGMENTOS_BRAZO }, (_, i) => (0.5 + i / (SEGMENTOS_BRAZO - 1)) / sumaPesos);
  // Amplitud del micromovimiento por articulación: crece hacia la punta (cerca del hombro se acumularía en la cabeza).
  const pesoRuido = Array.from({ length: SEGMENTOS_BRAZO }, (_, i) => 0.5 + 0.5 * (i / (SEGMENTOS_BRAZO - 1)) ** 1.5);
  const RUIDO_Z = 2 * GRAD;
  const RUIDO_Y = 1.5 * GRAD;
  const FREC_RUIDO = 0.35;

  // Objetivos de pose: 6 valores por brazo (2 brazos). Los resortes siguen estos objetivos; no hay interpolación directa.
  const N_VAL = 6;
  const objPose = new Float32Array(2 * N_VAL);
  const objPrevio = new Float32Array(2 * N_VAL);
  const anticOff = new Float32Array(2 * N_VAL);
  const objEnvio = new Float32Array(2 * N_VAL);
  const restoRad = (j: number): number => (j === 3 || j === 4 ? REPOSO[j] : REPOSO[j] * GRAD);
  /** Rellena `destino` con la pose `id`: 85 % de extensión, asimetría fija, y en gestos de un brazo un 10 % de simpatía del otro. */
  function cargarObjetivo(destino: Float32Array, id: PoseId, inv: boolean, ambos: boolean, lider: number): void {
    for (let k = 0; k < 2; k++) {
      const src = POSES[id][inv ? 1 - k : k];
      for (let j = 0; j < N_VAL; j++) {
        if (j === 3 || j === 4) {
          destino[k * N_VAL + j] = src[j];
        } else {
          destino[k * N_VAL + j] = (REPOSO[j] + ESCALA_GESTO * (src[j] - REPOSO[j])) * GRAD;
        }
      }
      for (let j = 0; j < 3; j++) destino[k * N_VAL + j] += ASIMETRIA[k][j] * GRAD;
    }
    const otro = 1 - lider;
    for (const j of [0, 1, 2, 5]) {
      if (ambos) {
        // El que sigue llega a ≈92 % de la amplitud del que lidera.
        const r = restoRad(j);
        destino[otro * N_VAL + j] = r + 0.92 * (destino[otro * N_VAL + j] - r);
      } else {
        destino[otro * N_VAL + j] += 0.1 * (destino[lider * N_VAL + j] - destino[otro * N_VAL + j]);
      }
    }
  }
  cargarObjetivo(objPose, 'N', false, false, 1);
  objPrevio.set(objPose);

  // Historial de objetivos para el retraso a lo largo de la cadena: la articulación i sigue al objetivo con i·50 ms de retraso.
  const HN = 256;
  const histT = Float32Array.from({ length: HN }, (_, i) => -1e6 + i);
  const histV = new Float32Array(HN * 2 * N_VAL);
  for (let i = 0; i < HN; i++) histV.set(objPose, i * 2 * N_VAL);
  let histIdx = 0;
  /** Retraso extra de cada brazo (s): el que sigue llega después del que lidera. */
  const retrasoBrazo = new Float32Array(2);

  // Estado de los resortes (ángulo y velocidad) de cada articulación, de la raíz del hombro y de la apertura de garra.
  const zPos = new Float32Array(2 * SEGMENTOS_BRAZO);
  const zVel = new Float32Array(2 * SEGMENTOS_BRAZO);
  const yPos = new Float32Array(2 * SEGMENTOS_BRAZO);
  const yVel = new Float32Array(2 * SEGMENTOS_BRAZO);
  const rPos = new Float32Array(4); // [cabeceo izq, cabeceo der, giro izq, giro der]
  const rVel = new Float32Array(4);
  const garra = new Float32Array(2);
  for (let k = 0; k < 2; k++) {
    const o = k * N_VAL;
    rPos[k] = objPose[o];
    rPos[2 + k] = objPose[o + 1];
    garra[k] = objPose[o + 4];
    for (let i = 0; i < SEGMENTOS_BRAZO; i++) {
      zPos[k * SEGMENTOS_BRAZO + i] = pesoFlexion[i] * objPose[o + 2] + objPose[o + 3] * curvaBase[i];
      yPos[k * SEGMENTOS_BRAZO + i] = pesoFlexion[i] * objPose[o + 5];
    }
  }

  // Deriva del reposo: cada 4–7 s un brazo cambia a otro ángulo de reposo cercano (5–12° de diferencia, cabeceo y flexión),
  // suavizado durante 1,5–2,5 s; el otro brazo lo sigue 0,7–1,4 s después, así que nunca van a la vez.
  const DERIVA_MAX = 14 * GRAD;
  const derivaDe = new Float32Array(4); // [cabeceo izq, cabeceo der, flexión izq, flexión der] al empezar el tramo
  const derivaA = new Float32Array(4);
  const derivaT0 = new Float32Array(2);
  const derivaDur = new Float32Array(2).fill(2);
  const derivaProx = new Float32Array([2.5, 4.5]);
  const derivaSigue = [false, false];
  const pesoGesto = new Float32Array(2);
  let semillaDeriva = 12345;
  const azar = (): number => {
    semillaDeriva = (semillaDeriva + 0x6d2b79f5) | 0;
    let x = Math.imul(semillaDeriva ^ (semillaDeriva >>> 15), 1 | semillaDeriva);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const suave = (u: number): number => {
    const c = Math.min(Math.max(u, 0), 1);
    return c * c * (3 - 2 * c);
  };
  const derivaActual = (k: number, j: number, t: number): number =>
    derivaDe[2 * j + k] + (derivaA[2 * j + k] - derivaDe[2 * j + k]) * suave((t - derivaT0[k]) / derivaDur[k]);
  /** Nuevo ángulo de reposo del brazo k: 5–12° de diferencia, hacia el lado con más margen. */
  function nuevaDeriva(k: number, t: number): void {
    for (let j = 0; j < 2; j++) {
      const actual = derivaActual(k, j, t);
      derivaDe[2 * j + k] = actual;
      const delta = (5 + 7 * azar()) * GRAD * (j === 1 ? 0.8 : 1);
      const signo = actual > 0.4 * DERIVA_MAX ? -1 : actual < -0.4 * DERIVA_MAX ? 1 : azar() < 0.5 ? -1 : 1;
      derivaA[2 * j + k] = limitar(actual + signo * delta, -DERIVA_MAX, DERIVA_MAX);
    }
    derivaT0[k] = t;
    derivaDur[k] = 1.5 + azar();
  }

  let estado: EstadoMentor = 'idle';

  // Gestos de orador. Solo uno a la vez: mientras uno está activo (anticipación + entrada + mantenida + salida) los demás se
  // descartan, porque cada gesto empieza en su palabra y no podría empezar a media palabra más tarde. Máximo uno por frase.
  let activo: DefGesto | null = null;
  /** El gesto activo es de relleno (lo eligió el mentor, no el guion) y una marca del guion lo puede interrumpir. */
  let activoAuto = false;
  /** Tiempo del gesto: negativo durante la anticipación. */
  let tGesto = 0;
  let saliendo = false;
  let pulsoHecho = false;
  let gestoEnFrase = false;
  let alternar = false;
  let alternarAmbos = false;
  let brazoGesto = 1;
  let inclinacion = 0;
  let giroCabeza = 0;
  const golpeAmp = new Float32Array(2);
  const golpeDur = new Float32Array(2);
  const golpeT = new Float32Array(2).fill(-1);
  let amplitud: number | null = null;
  let amplitudSuave = 0;
  function golpe(brazo: number, grados: number, dur: number): void {
    golpeAmp[brazo] = grados * GRAD;
    golpeDur[brazo] = dur;
    golpeT[brazo] = 0;
  }
  function irAReposo(): void {
    retrasoBrazo.fill(0);
    cargarObjetivo(objPose, 'N', false, false, 1);
  }

  // Estado y animación (los llama `museo.ts`; no hay lógica de voz aquí).
  let habla = 0;
  let ultimo = 0;
  grupo.userData.setState = (nuevo: EstadoMentor): void => {
    if (nuevo === estado) return;
    estado = nuevo;
    if (nuevo === 'idle') {
      // Pausa o fin: el gesto en curso se abandona y los resortes llevan los brazos al reposo, sin saltar.
      activo = null;
      saliendo = false;
      gestoEnFrase = false;
      golpeT.fill(-1);
      irAReposo();
    }
  };
  /**
   * Gesto pedido por la voz: un cue ('heroico'…) o 'inicioFrase' (solo reinicia el límite de un gesto por frase).
   * Los cues solo cuentan mientras el mentor habla, sin otro gesto activo y sin otro ya hecho en esta frase.
   */
  grupo.userData.gesto = (g: GestoMentor): void => {
    if (g === 'inicioFrase') {
      gestoEnFrase = false;
      return;
    }
    if (estado !== 'speaking' || gestoEnFrase) return;
    // Con otro gesto en curso se descarta, salvo que sea uno de relleno o que ya haya vuelto al reposo en más de un 60 % de su salida.
    if (activo !== null && !activoAuto && !(saliendo && tGesto >= activo.entrada + activo.sosten + activo.salida * 0.6)) return;
    lanzar(g, false);
  };
  /** Gestos que usa el mentor por su cuenta mientras habla y la voz no le pide ninguno (heroico, el más teatral, casi no sale). */
  const GESTOS_AUTO: CueNombre[] = ['directo', 'honesto', 'exacto', 'cercano', 'directo', 'poderoso', 'honesto', 'heroico'];
  let ultimoAuto: CueNombre | null = null;
  let sinGesto = 0;
  let esperaAuto = 0.3;
  function lanzar(g: CueNombre, auto: boolean): void {
    const def = GESTOS[g];
    activo = def;
    activoAuto = auto;
    saliendo = false;
    pulsoHecho = false;
    // Los gestos de relleno no cuentan como "el gesto de la frase": una marca del guion siempre puede ir después.
    if (!auto) gestoEnFrase = true;
    let inv = false;
    if (def.ambos) {
      alternarAmbos = !alternarAmbos;
      brazoGesto = alternarAmbos ? 1 : 0;
    } else {
      inv = alternar;
      alternar = !alternar;
      brazoGesto = inv ? 0 : 1;
    }
    objPrevio.set(objPose);
    cargarObjetivo(objPose, def.pose, inv, def.ambos, brazoGesto);
    // Retraso del brazo que sigue (en gestos de un brazo, el otro acompaña apenas y más tarde).
    retrasoBrazo[brazoGesto] = 0;
    retrasoBrazo[1 - brazoGesto] = def.ambos ? 0.22 : 0.3;
    // Anticipación: contra el sentido del cambio, un 25 % de este (máx. 14° de flexión y 6° de cabeceo).
    anticOff.fill(0);
    for (let k = 0; k < 2; k++) {
      const o = k * N_VAL;
      anticOff[o] = -limitar(0.25 * (objPose[o] - objPrevio[o]), -6 * GRAD, 6 * GRAD);
      anticOff[o + 2] = -limitar(0.25 * (objPose[o + 2] - objPrevio[o + 2]), -14 * GRAD, 14 * GRAD);
    }
    tGesto = -ANTICIPACION_S;
  }
  /** Amplitud real (0..1) del audio que suena; `null` devuelve los LED a su pulso propio. */
  grupo.userData.setAmplitud = (a: number | null): void => {
    amplitud = a;
  };
  grupo.userData.actualizar = (t: number): void => {
    const dt = Math.min(Math.max(t - ultimo, 0), 0.1);
    ultimo = t;
    habla += ((estado === 'speaking' ? 1 : 0) - habla) * (1 - Math.exp(-6 * dt));

    // Mientras habla, gesticula sin parar: si no hay gesto, tras una pausa corta elige uno de relleno (nunca el mismo dos veces).
    if (estado === 'speaking' && activo === null) {
      sinGesto += dt;
      if (sinGesto >= esperaAuto) {
        let g = GESTOS_AUTO[Math.floor(azar() * GESTOS_AUTO.length) % GESTOS_AUTO.length];
        if (g === ultimoAuto) g = GESTOS_AUTO[(GESTOS_AUTO.indexOf(g) + 1) % GESTOS_AUTO.length];
        if (g === ultimoAuto) g = GESTOS_AUTO[(GESTOS_AUTO.indexOf(g) + 1) % GESTOS_AUTO.length];
        ultimoAuto = g;
        lanzar(g, true);
        sinGesto = 0;
        esperaAuto = 0.3 + 0.7 * azar();
      }
    } else {
      sinGesto = 0;
    }

    // Línea de tiempo del gesto activo: anticipación, formación, mantenida (con el pulso de "exacto") y vuelta al reposo.
    if (activo) {
      tGesto += dt;
      if (activo.pulso && !pulsoHecho && tGesto >= activo.entrada) {
        pulsoHecho = true;
        golpe(brazoGesto, 18, 0.3);
      }
      if (!saliendo && tGesto >= activo.entrada + activo.sosten) {
        saliendo = true;
        irAReposo();
      }
      if (saliendo && tGesto >= activo.entrada + activo.sosten + activo.salida) activo = null;
    }
    const anticipando = activo !== null && tGesto < 0;
    for (let i = 0; i < 2 * N_VAL; i++) objEnvio[i] = anticipando ? objPrevio[i] + anticOff[i] : objPose[i];
    // Deriva del reposo: se programa siempre (hable o no) y solo se aplica a los brazos que no están en un gesto.
    for (let k = 0; k < 2; k++) {
      if (t >= derivaProx[k]) {
        nuevaDeriva(k, t);
        if (derivaSigue[k]) {
          derivaSigue[k] = false;
          derivaProx[k] = t + 4 + 3 * azar();
        } else {
          derivaProx[k] = t + 4 + 3 * azar();
          derivaSigue[1 - k] = true;
          derivaProx[1 - k] = Math.min(derivaProx[1 - k], t + 0.7 + 0.7 * azar());
        }
      }
      const enGesto = activo !== null && !saliendo && (activo.ambos || k === brazoGesto) ? 1 : 0;
      pesoGesto[k] += (enGesto - pesoGesto[k]) * (1 - Math.exp(-3 * dt));
      objEnvio[k * N_VAL] += (1 - pesoGesto[k]) * derivaActual(k, 0, t);
      objEnvio[k * N_VAL + 2] += (1 - pesoGesto[k]) * derivaActual(k, 1, t);
    }
    histT[histIdx] = t;
    histV.set(objEnvio, histIdx * 2 * N_VAL);
    const nuevoIdx = histIdx;
    histIdx = (histIdx + 1) % HN;

    // Inclinación del cuerpo hacia delante (poderoso) y giro de la cabeza ≈5° hacia el lado del brazo que gesticula.
    const gesticulando = activo !== null && !saliendo;
    inclinacion += ((gesticulando ? activo!.inclina : 0) - inclinacion) * (1 - Math.exp(-4 * dt));
    modelo.rotation.x = inclinacion;
    const lado = activo !== null && !activo.ambos && gesticulando ? (brazoGesto === 1 ? 1 : -1) : 0;
    giroCabeza += (lado * 5 * GRAD - giroCabeza) * (1 - Math.exp(-3.5 * dt));
    cabeza.rotation.y = giroCabeza + 1 * GRAD * ruido(41, t * 0.2);

    if (amplitud !== null) amplitudSuave += (amplitud - amplitudSuave) * (1 - Math.exp(-(amplitud > amplitudSuave ? 30 : 10) * dt));
    // LED: reposo lento con parpadeo; al hablar, pulsos. Con audio real, el nivel sigue la amplitud medida.
    const parpadeo = t % 5 < 0.15 ? 0 : 1;
    columnas.forEach((mats, i) => {
      const reposo = 0.5 + 0.3 * Math.sin(t * 0.8 + i * 1.3);
      const hablando =
        amplitud === null
          ? 0.2 + 0.75 * Math.abs(Math.sin(t * 9 + i * 1.9) * Math.sin(t * 3.3 + i))
          : Math.min(1, 0.08 + 0.95 * amplitudSuave * (0.75 + 0.25 * Math.sin(t * 9 + i * 1.9)));
      const nivel = (reposo * (1 - habla) + hablando * habla) * FILAS;
      mats.forEach((m, r) => {
        const encendido = Math.min(Math.max(nivel - r, 0), 1);
        m.emissiveIntensity = (0.08 + 1.6 * encendido) * parpadeo;
      });
    });

    // Cuerpo: respiración lenta (≈1 cm de subida y bajada en un ciclo de 4 s) y un balanceo muy suave.
    modelo.position.y = -0.49 + 0.005 * Math.sin((2 * Math.PI * t) / 4);
    modelo.rotation.z = 0.014 * ruido(7, t * 0.12);
    cabeza.rotation.z = 0.02 * ruido(13, t * 0.15);

    // Brazos: cada articulación es un resorte amortiguado hacia el objetivo de pose (con retraso creciente por segmento),
    // más un micromovimiento de ruido suave con semilla propia por articulación.
    const pasos = Math.max(1, Math.ceil(dt / (1 / 90)));
    const h = dt / pasos;
    brazos.forEach((b, k) => {
      const o = k * N_VAL;
      const base = k * SEGMENTOS_BRAZO;
      const signo = k === 0 ? -1 : 1; // el brazo izquierdo está espejado (scale.x = −1): se invierten cabeceo y giro
      // Muestreo del historial hacia atrás: el retraso crece con i, así que un solo recorrido sirve para todas.
      let p = nuevoIdx;
      for (let i = 0; i < SEGMENTOS_BRAZO; i++) {
        const tq = t - retrasoBrazo[k] - i * RETRASO_JUNTA_S;
        for (let n = 0; n < HN && histT[p] > tq; n++) p = (p + HN - 1) % HN;
        const sig = (p + 1) % HN;
        const dtH = histT[sig] - histT[p];
        const f = histT[p] > tq || dtH <= 0 ? 0 : Math.min(Math.max((tq - histT[p]) / dtH, 0), 1);
        const vv = (j: number): number => histV[p * 2 * N_VAL + o + j] * (1 - f) + histV[sig * 2 * N_VAL + o + j] * f;
        const objZ = pesoFlexion[i] * vv(2) + vv(3) * curvaBase[i];
        const objY = pesoFlexion[i] * vv(5);
        const w = OMEGA_RAIZ + (OMEGA_PUNTA - OMEGA_RAIZ) * (i / (SEGMENTOS_BRAZO - 1));
        const kk = w * w;
        const cc = 2 * ZETA * w;
        const idx = base + i;
        for (let s = 0; s < pasos; s++) {
          zVel[idx] += (kk * (objZ - zPos[idx]) - cc * zVel[idx]) * h;
          zPos[idx] += zVel[idx] * h;
          yVel[idx] += (kk * (objY - yPos[idx]) - cc * yVel[idx]) * h;
          yPos[idx] += yVel[idx] * h;
        }
        const j = b.juntas[i];
        const semilla = 17 * k + 3 * i + 5;
        j.rotation.z = zPos[idx] + RUIDO_Z * pesoRuido[i] * ruido(semilla, t * FREC_RUIDO);
        j.rotation.y = yPos[idx] + RUIDO_Y * pesoRuido[i] * ruido(semilla + 1000, t * FREC_RUIDO * 0.8);
      }
      // Raíz del hombro (cabeceo y giro) con su resorte, sin retraso de cadena (solo el del brazo).
      {
        let q = nuevoIdx;
        const tq = t - retrasoBrazo[k];
        for (let n = 0; n < HN && histT[q] > tq; n++) q = (q + HN - 1) % HN;
        const sig = (q + 1) % HN;
        const dtH = histT[sig] - histT[q];
        const f = histT[q] > tq || dtH <= 0 ? 0 : Math.min(Math.max((tq - histT[q]) / dtH, 0), 1);
        const vv = (j: number): number => histV[q * 2 * N_VAL + o + j] * (1 - f) + histV[sig * 2 * N_VAL + o + j] * f;
        const kk = OMEGA_RAIZ * OMEGA_RAIZ;
        const cc = 2 * ZETA * OMEGA_RAIZ;
        for (let s = 0; s < pasos; s++) {
          rVel[k] += (kk * (vv(0) - rPos[k]) - cc * rVel[k]) * h;
          rPos[k] += rVel[k] * h;
          rVel[2 + k] += (kk * (vv(1) - rPos[2 + k]) - cc * rVel[2 + k]) * h;
          rPos[2 + k] += rVel[2 + k] * h;
        }
        garra[k] += (vv(4) - garra[k]) * (1 - Math.exp(-4 * dt));
      }
      b.raiz.rotation.y = signo * limitar(rPos[2 + k] + 0.8 * GRAD * ruido(70 + k, t * FREC_RUIDO), YAW_MIN, YAW_MAX);
      b.raiz.rotation.z = signo * limitar(rPos[k] + 0.8 * GRAD * ruido(80 + k, t * FREC_RUIDO), PITCH_MIN, PITCH_MAX);
      // Pulso (exacto): la mano sube y vuelve en ≈0,3 s, sumado a la salida de los resortes para que se note.
      if (golpeT[k] >= 0) {
        golpeT[k] += dt;
        const u = golpeT[k] / golpeDur[k];
        if (u >= 1) {
          golpeT[k] = -1;
        } else {
          const extra = golpeAmp[k] * Math.sin(Math.PI * u);
          for (let i = 0; i < SEGMENTOS_BRAZO; i++) b.juntas[i].rotation.z += pesoFlexion[i] * extra;
        }
      }
      // Mano: sin giro continuo; solo un balanceo mínimo de la muñeca. La apertura de las aspas la fija la pose.
      // Muñeca: el buje gira despacio a un lado y a otro (≈±20°, periodo de 8–10 s) y las aspas abren y cierran muy poco.
      b.mano.rotation.z = 0.05 * ruido(90 + k, t * 0.3);
      b.mano.rotation.x = 0.35 * Math.sin((2 * Math.PI * t) / (k === 0 ? 8.3 : 9.7) + 1.7 * k) + 0.06 * ruido(95 + k, t * 0.3);
      const cierre = 0.9 - garra[k] * 0.78;
      b.pivotesAspa.forEach((pv, n) => {
        pv.rotation.x = cierre + 0.07 * Math.sin((2 * Math.PI * t) / (5.5 + 0.7 * k) + 2.1 * n + k) + 0.02 * ruido(100 + 3 * k + n, t * 0.4);
      });
    });
  };

  // Libera geometrías y materiales (sin uso hoy: el mentor vive toda la sesión). Útil si algún día se reemplaza.
  grupo.userData.dispose = (): void => {
    const geos = new Set<THREE.BufferGeometry>();
    const mats = new Set<THREE.Material>();
    grupo.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      geos.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) mats.add(m);
    });
    geos.forEach((g) => g.dispose());
    mats.forEach((m) => m.dispose());
  };
  return grupo;
}
