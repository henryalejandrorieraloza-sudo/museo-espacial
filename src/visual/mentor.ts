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
  const gris = material(COLOR.gris, 0.5);

  // Cabeza (pivote en su base).
  const cabeza = new THREE.Group();
  cabeza.position.y = 0.64;
  const domo = malla(geometriaCabeza(), blanco);
  domo.name = 'domo';
  cabeza.add(domo);
  // Visor: óvalo negro grande de esquinas redondeadas, centrado y por debajo del centro; asoma por la frente plana.
  const visor = malla(geometriaVisor(), negro, [0, V.y, V.z]);
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
  // gesticula es el segundo de la pareja (se alterna con `invertir`) y el otro se queda en la pose neutra.
  const GRAD = Math.PI / 180;
  const NEUTRA = [-5, -15, -35, 0.5, 0.5, 0];
  const POSES = {
    // Reposo: brazos colgando, algo separados del collar.
    N: [NEUTRA, NEUTRA],
    // heroico: un brazo muy alto sobre el hombro, garra cerrada e inclinada un poco hacia delante.
    heroico: [NEUTRA, [6, -15, 90, 0.1, 0.15, 0]],
    // exacto: la garra casi en el collar (el brazo se pliega hacia dentro). El pulso corto se añade aparte.
    exacto: [NEUTRA, [-15, -80, 20, 0.1, 0.4, -150]],
    // directo: un brazo al frente y algo hacia fuera, garra abierta.
    directo: [NEUTRA, [5, -50, 0, 0.2, 1, 0]],
    // poderoso: un brazo doblado con la garra cerrada cerca del pecho (el cuerpo se inclina aparte).
    poderoso: [NEUTRA, [-20, -60, 50, 0.1, 0.15, -120]],
    // honesto: los dos brazos bajan y se abren un poco hacia fuera, garras abiertas.
    honesto: [[-20, 10, -30, 0.6, 1, 0], [-20, 10, -30, 0.6, 1, 0]],
    // cercano: los dos brazos se pliegan despacio hacia el cuerpo.
    cercano: [[-5, -60, 10, 0.2, 0.6, -80], [-5, -60, 10, 0.2, 0.6, -80]],
  } satisfies Record<string, [number[], number[]]>;
  type PoseId = keyof typeof POSES;
  interface DefGesto {
    pose: PoseId;
    /** Segundos de entrada, de mantenida y de salida hacia la pose neutra (todos con smoothstep). */
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
  const GESTOS: Record<CueNombre, DefGesto> = {
    heroico: { pose: 'heroico', entrada: 1, sosten: 1.5, salida: 1, ambos: false, inclina: 0, pulso: false },
    exacto: { pose: 'exacto', entrada: 1, sosten: 0.9, salida: 1, ambos: false, inclina: 0, pulso: true },
    directo: { pose: 'directo', entrada: 1, sosten: 1.2, salida: 1, ambos: false, inclina: 0, pulso: false },
    poderoso: { pose: 'poderoso', entrada: 1, sosten: 1.2, salida: 1, ambos: false, inclina: 4 * GRAD, pulso: false },
    honesto: { pose: 'honesto', entrada: 1, sosten: 1.5, salida: 1, ambos: true, inclina: 0, pulso: false },
    cercano: { pose: 'cercano', entrada: 1, sosten: 1.5, salida: 1, ambos: true, inclina: 0, pulso: false },
  };
  const PITCH_MIN = -20 * GRAD;
  const PITCH_MAX = 75 * GRAD;
  const YAW_MIN = -90 * GRAD;
  const YAW_MAX = 10 * GRAD;
  const MAX_FLEXION = 90 * GRAD;
  const limitar = (v: number, a: number, b: number): number => Math.min(Math.max(v, a), b);
  // Reparto de la flexión y de la curva lateral: más hacia la punta, para que el antebrazo se curve más que la parte alta.
  const sumaPesos = Array.from({ length: SEGMENTOS_BRAZO }, (_, i) => 0.5 + i / (SEGMENTOS_BRAZO - 1)).reduce((x, y) => x + y, 0);
  const pesoFlexion = Array.from({ length: SEGMENTOS_BRAZO }, (_, i) => (0.5 + i / (SEGMENTOS_BRAZO - 1)) / sumaPesos);
  const pesoOnda = Array.from({ length: SEGMENTOS_BRAZO }, (_, i) => (i / (SEGMENTOS_BRAZO - 1)) ** 1.5);

  // Mezclador de poses: 6 valores por brazo (2 brazos), sin crear objetos por fotograma.
  const N_VAL = 6;
  const desde = new Float32Array(2 * N_VAL);
  const hasta = new Float32Array(2 * N_VAL);
  const actual = new Float32Array(2 * N_VAL);
  function cargar(destino: Float32Array, id: PoseId, invertir: boolean): void {
    for (let k = 0; k < 2; k++) {
      const src = POSES[id][invertir ? 1 - k : k];
      for (let j = 0; j < N_VAL; j++) destino[k * N_VAL + j] = j === 3 || j === 4 ? src[j] : src[j] * GRAD;
    }
  }
  let estado: EstadoMentor = 'idle';
  let moviendo = false;
  let reloj = 0;
  let duracion = 1;
  cargar(actual, 'N', false);
  desde.set(actual);
  hasta.set(actual);

  /** Empieza a mover hacia la pose `id` (smoothstep, `dur` s) desde donde esté ahora: nunca salta. */
  function irAPose(id: PoseId, inv: boolean, dur: number): void {
    desde.set(actual);
    cargar(hasta, id, inv);
    moviendo = true;
    reloj = 0;
    duracion = dur;
  }

  // Gestos de orador. Solo uno a la vez: mientras uno está activo (entrada + mantenida + salida) los demás se descartan,
  // porque cada gesto empieza en su palabra y no podría empezar a media palabra más tarde. Máximo uno por frase.
  let activo: DefGesto | null = null;
  let tGesto = 0;
  let saliendo = false;
  let pulsoHecho = false;
  let gestoEnFrase = false;
  let alternar = false;
  let brazoGesto = 1;
  let inclinacion = 0;
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

  // Estado y animación (los llama `museo.ts`; no hay lógica de voz aquí).
  let habla = 0;
  let ultimo = 0;
  let faseOnda = 0;
  grupo.userData.setState = (nuevo: EstadoMentor): void => {
    if (nuevo === estado) return;
    estado = nuevo;
    if (nuevo === 'idle') {
      // Pausa o fin: el gesto en curso se abandona y los brazos vuelven a neutro en 1 s, sin saltar.
      activo = null;
      saliendo = false;
      gestoEnFrase = false;
      golpeT.fill(-1);
      irAPose('N', false, 1);
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
    // Con otro gesto en curso se descarta, salvo que ya haya vuelto a neutro en más de un 60 % de su salida.
    if (activo !== null && !(saliendo && tGesto >= activo.entrada + activo.sosten + activo.salida * 0.6)) return;
    const def = GESTOS[g];
    activo = def;
    tGesto = 0;
    saliendo = false;
    pulsoHecho = false;
    gestoEnFrase = true;
    const inv = !def.ambos && alternar;
    if (!def.ambos) alternar = !alternar;
    brazoGesto = inv ? 0 : 1;
    irAPose(def.pose, inv, def.entrada);
  };
  /** Amplitud real (0..1) del audio que suena; `null` devuelve los LED a su pulso propio. */
  grupo.userData.setAmplitud = (a: number | null): void => {
    amplitud = a;
  };
  grupo.userData.actualizar = (t: number): void => {
    const dt = Math.min(Math.max(t - ultimo, 0), 0.1);
    ultimo = t;
    habla += ((estado === 'speaking' ? 1 : 0) - habla) * (1 - Math.exp(-6 * dt));

    // Mezclador: lleva los ángulos de la pose anterior a la nueva con smoothstep.
    if (moviendo) {
      reloj += dt;
      const u = Math.min(reloj / duracion, 1);
      const suave = u * u * (3 - 2 * u);
      for (let i = 0; i < 2 * N_VAL; i++) actual[i] = desde[i] + (hasta[i] - desde[i]) * suave;
      if (u >= 1) moviendo = false;
    }
    // Línea de tiempo del gesto activo: entrada, mantenida (con el pulso de "exacto") y vuelta a neutro.
    if (activo) {
      tGesto += dt;
      if (activo.pulso && !pulsoHecho && tGesto >= activo.entrada) {
        pulsoHecho = true;
        golpe(brazoGesto, 15, 0.3);
      }
      if (!saliendo && tGesto >= activo.entrada + activo.sosten) {
        saliendo = true;
        irAPose('N', false, activo.salida);
      }
      if (saliendo && tGesto >= activo.entrada + activo.sosten + activo.salida) activo = null;
    }
    // Inclinación del cuerpo hacia delante (poderoso), suavizada.
    const objetivoInclina = activo && !saliendo ? activo.inclina : 0;
    inclinacion += (objetivoInclina - inclinacion) * (1 - Math.exp(-4 * dt));
    modelo.rotation.x = inclinacion;

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

    // Cuerpo: balanceo lento y suave desde la base (el flotado vertical lo hace museo.ts).
    modelo.rotation.z = Math.sin(t * 0.45) * 0.02;
    cabeza.rotation.z = Math.sin(t * 0.5 + 1) * 0.02;

    // Brazos: la pose manda; encima, solo una respiración de ≈1° con otra fase en cada articulación.
    faseOnda += dt * 0.5;
    const ondaRad = 1 * GRAD;
    brazos.forEach((b, k) => {
      const o = k * N_VAL;
      // El brazo izquierdo está espejado (scale.x = −1) antes de aplicar la rotación de la raíz: se invierten cabeceo y giro.
      const signo = k === 0 ? -1 : 1;
      b.raiz.rotation.y = signo * limitar(actual[o + 1], YAW_MIN, YAW_MAX);
      b.raiz.rotation.z = signo * limitar(actual[o], PITCH_MIN, PITCH_MAX);
      // Pulso (exacto): el brazo sube un poco y vuelve en ≈0,3 s.
      let extra = 0;
      if (golpeT[k] >= 0) {
        golpeT[k] += dt;
        const u = golpeT[k] / golpeDur[k];
        if (u >= 1) golpeT[k] = -1;
        else extra = golpeAmp[k] * Math.sin(Math.PI * u);
      }
      const flexion = Math.min(actual[o + 2] + extra, Math.max(actual[o + 2], MAX_FLEXION));
      const curvaS = actual[o + 3];
      const lateral = actual[o + 5];
      for (let i = 0; i < SEGMENTOS_BRAZO; i++) {
        const j = b.juntas[i];
        // La respiración crece hacia la punta: cerca del hombro quedaría acumulada y metería el brazo en la cabeza.
        const onda = ondaRad * pesoOnda[i];
        j.rotation.z = pesoFlexion[i] * flexion + curvaS * curvaBase[i] + onda * Math.sin(faseOnda + i * 0.55 + b.fase);
        j.rotation.y = pesoFlexion[i] * lateral + 0.5 * onda * Math.sin(faseOnda * 0.8 + i * 0.45 + b.fase + 1.7);
      }
      // Mano: gira muy despacio sobre la muñeca; la apertura de las aspas la fija la pose.
      b.giroMano += dt * 0.12;
      b.mano.rotation.z = b.giroMano;
      const cierre = 0.9 - actual[o + 4] * 0.78;
      b.pivotesAspa.forEach((p, n) => {
        p.rotation.x = cierre + 0.03 * Math.sin(t * 0.6 + b.fase + n * 2.1);
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
