import * as THREE from 'three';
import { HIST, Lote, SUELO_LUNA, cajaBiselada, tuboEntre, type V3 } from './paleta';

// Lunar Roving Vehicle de Apollo 17 para la escena lunar, low poly. Frente hacia −Z, origen en el suelo y centrado.
// Solo lleva lo que tenía el LRV real: chasis de tubo de aluminio en tres secciones, ruedas de malla de acero con
// chevrones de titanio, guardabarros de fibra, dos asientos de tubo y red, mando en T entre los asientos, consola,
// baterías en la sección delantera, unidad de comunicaciones (LCRU), cámara de TV, antenas y portaherramientas.
// Sin techo ni puertas.
//
// Medidas (Wikipedia, "Lunar Roving Vehicle", a partir de la NASA y Boeing): largo 10 ft (3.05 m), batalla 7.5 ft
// (2.29 m), alto 3.6 ft (1.1 m); ruedas de 32 in (0.81 m) de diámetro y 9 in (0.23 m) de ancho, malla de cuerdas de
// acero cincado con chevrones de titanio sobre el 50 % del área de contacto; mando en T entre los dos asientos.
// La NSSDC ("The Apollo Lunar Roving Vehicle") da lo mismo: bastidor de 3.1 m, batalla de 2.3 m, altura máxima de
// 1.14 m, altura libre de 36 cm y ruedas de 81.8 × 23 cm con un bastidor de tope interior de 64.8 cm.

const RADIO_RUEDA = 0.4064;
const ANCHO_RUEDA = 0.2286;
export const BATALLA_LRV = 2.286;
/** Vía (distancia entre ruedas de un mismo eje). // VERIFICAR: 6 ft (1.83 m) según varias fuentes; no está en Wikipedia. */
export const VIA_LRV = 1.83;
/** Altura del bastidor (m). // VERIFICAR: altura libre de 14 in (0.36 m) bajo el chasis. */
const Y_BASTIDOR = 0.42;
const MEDIO_ANCHO_BASTIDOR = 0.57;
const Z_FRENTE = -1.52;
const Z_COLA = 1.52;
/** Asientos: el comandante, que conducía, a la izquierda (−X); el mando queda a su derecha. */
const X_ASIENTO = 0.31;
const Y_ASIENTO = 0.62;
const Z_ASIENTO = 0.15;

/** Posición de los ojos del comandante sentado, en ejes del LRV (m). */
export const OJOS_COMANDANTE: V3 = [-X_ASIENTO, Y_ASIENTO + 0.82, Z_ASIENTO + 0.08];
/** Centros de las cuatro ruedas (x, z), para apoyar el LRV en el suelo. */
export const RUEDAS_LRV: readonly (readonly [number, number])[] = [
  [-VIA_LRV / 2, -BATALLA_LRV / 2],
  [VIA_LRV / 2, -BATALLA_LRV / 2],
  [-VIA_LRV / 2, BATALLA_LRV / 2],
  [VIA_LRV / 2, BATALLA_LRV / 2],
];


/** Diámetro del bastidor interior de tope (bump stop) de la rueda: 64.8 cm (NSSDC). Se ve oscuro a través de la malla. */
const RADIO_TOPE_RUEDA = 0.324;
/** Cuerdas de la malla por sentido (dos sentidos cruzados). Es una densidad de dibujo, no el número real de cuerdas. */
const CUERDAS_MALLA = 30;
/** Chevrones alrededor de la rueda. // VERIFICAR: número real de chevrones por rueda. */
const CHEVRONES_RUEDA = 18;

/**
 * Rueda de malla que rueda, en ejes de la rueda (centro en el origen, eje de giro en X). `lado`: −1 a la izquierda
 * del LRV y +1 a la derecha (el buje mira hacia fuera). Malla de cuerdas de acero cincado tejidas en diagonal,
 * chevrones de titanio en V sobre la mitad de la banda, aros y discos de aluminio a los lados y el bastidor de tope
 * por dentro (NSSDC: "zinc coated woven 0.083 cm diameter steel strands attached to the rim and discs of formed
 * aluminum… Titanium chevrons covered 50% of the contact area").
 */
function ruedaRodante(l: Lote, lado: number): void {
  const w = ANCHO_RUEDA / 2;
  // Banda: el interior oscuro (bastidor de tope y sombra) visto a través del tejido, con las tapas oscuras.
  const banda = new THREE.CylinderGeometry(RADIO_RUEDA, RADIO_RUEDA, ANCHO_RUEDA, 36, 1, true);
  l.pieza(banda, HIST.malla, { r: [0, 0, Math.PI / 2], v: 0.18 });
  l.pieza(new THREE.CylinderGeometry(RADIO_TOPE_RUEDA, RADIO_TOPE_RUEDA, ANCHO_RUEDA * 0.8, 24), HIST.consola, { r: [0, 0, Math.PI / 2] });
  // Malla: cuerdas en los dos sentidos diagonales, cada una en tres tramos que siguen la curva de la banda.
  const radioMalla = RADIO_RUEDA + 0.003;
  const punto = (x: number, a: number): V3 => [x, Math.cos(a) * radioMalla, Math.sin(a) * radioMalla];
  const giroCuerda = ANCHO_RUEDA / RADIO_RUEDA;
  for (let i = 0; i < CUERDAS_MALLA; i++) {
    const a0 = (i / CUERDAS_MALLA) * Math.PI * 2;
    for (const sentido of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const t0 = k / 3;
        const t1 = (k + 1) / 3;
        l.pieza(
          tuboEntre(punto(-w + t0 * ANCHO_RUEDA, a0 + sentido * t0 * giroCuerda), punto(-w + t1 * ANCHO_RUEDA, a0 + sentido * t1 * giroCuerda), 0.0035, 3),
          HIST.mallaHilo,
        );
      }
    }
  }
  // Chevrones de titanio: dos placas en V por paso, cubriendo la mitad de la banda.
  for (let i = 0; i < CHEVRONES_RUEDA; i++) {
    const a = (i / CHEVRONES_RUEDA) * Math.PI * 2;
    for (const s of [-1, 1]) {
      l.en([0, Math.cos(a) * (RADIO_RUEDA + 0.008), Math.sin(a) * (RADIO_RUEDA + 0.008)], [a, 0, 0], () => {
        l.pieza(cajaBiselada(ANCHO_RUEDA * 0.52, 0.007, 0.034, 0.002), HIST.chevron, { p: [s * ANCHO_RUEDA * 0.24, 0, 0], r: [0, s * 0.5, 0] });
      });
    }
  }
  // Aros de aluminio a cada lado de la malla y disco repujado del buje, hacia fuera.
  for (const s of [-1, 1]) {
    l.pieza(new THREE.TorusGeometry(RADIO_RUEDA - 0.004, 0.009, 4, 36), HIST.aluminio, { p: [s * w, 0, 0], r: [0, Math.PI / 2, 0] });
  }
  l.pieza(new THREE.CylinderGeometry(0.15, 0.2, 0.035, 18), HIST.aluminio, { p: [lado * (w + 0.008), 0, 0], r: [0, 0, -lado * Math.PI / 2] });
  l.pieza(new THREE.CylinderGeometry(0.06, 0.08, 0.03, 12), HIST.plateado, { p: [lado * (w + 0.035), 0, 0], r: [0, 0, -lado * Math.PI / 2] });
  // Nervios del disco, para que se vea el giro de la rueda.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    l.pieza(new THREE.BoxGeometry(0.012, 0.012, 0.13), HIST.plateado, {
      p: [lado * (w + 0.027), Math.cos(a) * 0.12, Math.sin(a) * 0.12],
      r: [a + Math.PI / 2, 0, 0],
    });
  }
}

/** Motor de tracción y caja armónica en el cubo, hacia dentro: giran con la dirección, pero no ruedan. */
function motorRueda(l: Lote, lado: number): void {
  const x = -lado * (ANCHO_RUEDA / 2 + 0.05);
  l.pieza(new THREE.CylinderGeometry(0.11, 0.11, 0.16, 16), HIST.plateado, { p: [x, 0, 0], r: [0, 0, Math.PI / 2], v: 0.06 });
  l.pieza(new THREE.CylinderGeometry(0.125, 0.125, 0.025, 16), HIST.aluminio, { p: [x + lado * 0.07, 0, 0], r: [0, 0, Math.PI / 2] });
  l.pieza(new THREE.CylinderGeometry(0.08, 0.1, 0.03, 12), HIST.aluminio, { p: [x - lado * 0.09, 0, 0], r: [0, 0, Math.PI / 2] });
}

/** Una rueda del LRV en el modelo: el pivote gira con la dirección (eje Y) y el buje rueda (eje X). */
interface RuedaModelo {
  pivote: THREE.Group;
  buje: THREE.Group;
}

function crearRueda(x: number, z: number): RuedaModelo {
  const lado = Math.sign(x);
  const pivote = new THREE.Group();
  pivote.name = `rueda_${z < 0 ? 'delantera' : 'trasera'}_${lado < 0 ? 'izquierda' : 'derecha'}`;
  pivote.position.set(x, RADIO_RUEDA, z);
  const motor = new Lote(false);
  motorRueda(motor, lado);
  pivote.add(motor.construir());
  // El motor se empolva según su altura; la banda, entera (ver empolvar).
  empolvar(pivote, null);
  const buje = new THREE.Group();
  buje.name = `${pivote.name}_buje`;
  const banda = new Lote(false);
  ruedaRodante(banda, lado);
  buje.add(banda.construir());
  empolvar(buje, POLVO_RUEDA);
  pivote.add(buje);
  return { pivote, buje };
}

/**
 * Dirección de las cuatro ruedas. En el LRV las dos parejas eran direccionables y, en el modo normal, giraban en
 * sentidos opuestos, con un radio de giro de 3.1 m; también se podía desacoplar una pareja y girar solo con la otra
 * (NSSDC, "The Apollo Lunar Roving Vehicle": "Both sets of wheels would turn in opposite directions, giving a
 * steering radius of 3.1 meters... or could be decoupled so only one set would be used for steering").
 * 'doble': delanteras y traseras en sentidos opuestos (el modo normal). 'delantera': solo las delanteras.
 */
export type ModoDireccionLRV = 'doble' | 'delantera';
export const MODO_DIRECCION_LRV: ModoDireccionLRV = 'doble';
/** Tiempo (s) con el que las ruedas siguen el ángulo de dirección y con el que dejan de rodar al detenerse. */
const SUAVIZADO_DIRECCION_S = 0.12;
const SUAVIZADO_RODADURA_S = 0.2;

/**
 * Ángulo de cada rueda (rad, + = hacia la derecha del LRV) en el orden de RUEDAS_LRV (delantera izquierda,
 * delantera derecha, trasera izquierda, trasera derecha), con geometría de Ackermann: la rueda interior gira
 * `direccionGrados` y la exterior menos, para que las cuatro apunten al mismo centro de giro.
 */
export function angulosRuedas(direccionGrados: number, modo: ModoDireccionLRV = MODO_DIRECCION_LRV): [number, number, number, number] {
  const d = THREE.MathUtils.degToRad(Math.abs(direccionGrados));
  if (d < 1e-4) return [0, 0, 0, 0];
  const signo = Math.sign(direccionGrados);
  // Distancia del centro de giro a la línea media del LRV, y a lo largo de ella, desde el eje que no gira.
  const brazo = modo === 'doble' ? BATALLA_LRV / 2 : BATALLA_LRV;
  const centro = brazo / Math.tan(d) + VIA_LRV / 2;
  const exterior = Math.atan(brazo / (centro + VIA_LRV / 2));
  // A la derecha, las ruedas interiores son las de la derecha.
  const izquierda = signo > 0 ? exterior : d;
  const derecha = signo > 0 ? d : exterior;
  const trasera = modo === 'doble' ? -1 : 0;
  return [signo * izquierda, signo * derecha, trasera * signo * izquierda, trasera * signo * derecha];
}

/** Animación de las ruedas del LRV: dirección y rodadura. Se guarda en `userData.ruedas` del grupo del LRV. */
export interface RuedasLRV {
  /**
   * `direccionGrados`: ángulo de dirección (+ = derecha, ver game/luna.ts). `avanceM`: metros que avanzó el LRV en
   * este fotograma (negativos al retroceder). Las ruedas giran hacia el ángulo y ruedan con la velocidad, suavizadas.
   */
  actualizar(direccionGrados: number, avanceM: number, dtS: number): void;
  /** Ruedas rectas y paradas (al entrar en la escena). */
  reiniciar(): void;
}

function crearAnimacionRuedas(ruedas: RuedaModelo[]): RuedasLRV {
  const angulos = [0, 0, 0, 0];
  let velocidad = 0;
  let rodadura = 0;
  const aplicar = (): void => {
    ruedas.forEach((r, i) => {
      // El frente del LRV es −Z: girar hacia la derecha es un giro negativo alrededor de Y.
      r.pivote.rotation.y = -angulos[i];
      // Al avanzar (hacia −Z), la parte de arriba de la rueda va hacia delante: giro negativo alrededor de X.
      r.buje.rotation.x = rodadura;
    });
  };
  return {
    actualizar(direccionGrados, avanceM, dtS) {
      if (dtS <= 0) return;
      const objetivo = angulosRuedas(direccionGrados);
      const fd = 1 - Math.exp(-dtS / SUAVIZADO_DIRECCION_S);
      for (let i = 0; i < 4; i++) angulos[i] += (objetivo[i] - angulos[i]) * fd;
      // La velocidad de rodadura sigue a la del LRV y, al detenerse, baja hasta cero en unas décimas de segundo.
      velocidad += (avanceM / dtS - velocidad) * (1 - Math.exp(-dtS / SUAVIZADO_RODADURA_S));
      if (Math.abs(velocidad) < 1e-4 && avanceM === 0) velocidad = 0;
      rodadura = (rodadura - (velocidad * dtS) / RADIO_RUEDA) % (Math.PI * 2);
      aplicar();
    },
    reiniciar() {
      angulos.fill(0);
      velocidad = 0;
      rodadura = 0;
      aplicar();
    },
  };
}

/**
 * Guardabarros de fibra de vidrio con resina epoxi sobre cada rueda, con las extensiones delante y detrás y un
 * borde de refuerzo (NSSDC: "Dust guards were mounted above the wheels"; Smithsonian, "Extension, Fender, Lunar
 * Roving Vehicle, Apollo 17").
 */
function guardabarros(l: Lote, x: number, z: number): void {
  const radio = RADIO_RUEDA + 0.075;
  const ancho = ANCHO_RUEDA + 0.08;
  // Guardabarros fijo (de −1.0 a 1.0 rad) y extensiones (hasta ±1.45 rad), en tramos que siguen el arco.
  const tramos: [number, number, number][] = [
    [-1.45, -1.0, 3],
    [-1.0, 1.0, 10],
    [1.0, 1.45, 3],
  ];
  for (const [desde, hasta, n] of tramos) {
    const paso = (hasta - desde) / n;
    for (let i = 0; i < n; i++) {
      const a = desde + paso * (i + 0.5);
      const largo = 2 * radio * Math.sin(paso / 2) + 0.006;
      const extension = Math.abs(a) > 1.0;
      const r = extension ? radio + 0.006 : radio;
      const centro: V3 = [x, RADIO_RUEDA + Math.cos(a) * r, z + Math.sin(a) * r];
      l.pieza(new THREE.BoxGeometry(extension ? ancho - 0.01 : ancho, 0.01, largo), HIST.guardabarros, { p: centro, r: [a, 0, 0], v: 0.05 });
      // Borde de refuerzo a cada lado.
      for (const s of [-1, 1]) {
        l.pieza(new THREE.BoxGeometry(0.012, 0.03, largo), HIST.guardabarros, {
          p: [x + (s * ancho) / 2, RADIO_RUEDA + Math.cos(a) * (r - 0.012), z + Math.sin(a) * (r - 0.012)],
          r: [a, 0, 0],
        });
      }
    }
  }
  // Soporte del guardabarros al bastidor.
  const lado = Math.sign(x);
  l.pieza(tuboEntre([lado * MEDIO_ANCHO_BASTIDOR, Y_BASTIDOR + 0.05, z], [x - lado * 0.06, RADIO_RUEDA + radio - 0.02, z], 0.012, 6), HIST.aluminio);
}

/** Suspensión de doble brazo: del bastidor al cubo de la rueda. */
function suspension(l: Lote, x: number, z: number): void {
  const lado = Math.sign(x);
  const cubo = lado * (Math.abs(x) - ANCHO_RUEDA / 2 - 0.08);
  for (const [y, apertura] of [
    [Y_BASTIDOR - 0.05, 0.28],
    [Y_BASTIDOR + 0.08, 0.2],
  ] as const) {
    for (const s of [-1, 1]) {
      l.pieza(tuboEntre([lado * MEDIO_ANCHO_BASTIDOR, y, z + s * apertura], [cubo, RADIO_RUEDA + (y - Y_BASTIDOR) * 0.4, z], 0.017, 5), HIST.aluminio);
    }
  }
  // Barra de torsión a lo largo del bastidor.
  l.pieza(tuboEntre([lado * MEDIO_ANCHO_BASTIDOR, Y_BASTIDOR - 0.05, z - 0.3], [lado * MEDIO_ANCHO_BASTIDOR, Y_BASTIDOR - 0.05, z + 0.3], 0.025, 6), HIST.plateado);
}

/**
 * Bastidor de tubo de aluminio en tres secciones (delantera, central y trasera) unidas por bisagras: el LRV viajaba
 * plegado en el LM. Travesaños y suelo de paneles con nervios en la sección central.
 */
function bastidor(l: Lote): void {
  const w = MEDIO_ANCHO_BASTIDOR;
  for (const x of [-w, w]) {
    l.pieza(tuboEntre([x, Y_BASTIDOR, Z_FRENTE], [x, Y_BASTIDOR, Z_COLA], 0.026, 8), HIST.aluminio);
    l.pieza(tuboEntre([x, Y_BASTIDOR + 0.12, -0.62], [x, Y_BASTIDOR + 0.12, 0.62], 0.02, 8), HIST.aluminio);
    for (const z of [-0.62, -0.31, 0, 0.31, 0.62]) l.pieza(tuboEntre([x, Y_BASTIDOR, z], [x, Y_BASTIDOR + 0.12, z], 0.014, 6), HIST.aluminio);
    // Diagonales de la sección central.
    for (const [z0, z1] of [
      [-0.62, -0.31],
      [0, 0.31],
    ] as const) {
      l.pieza(tuboEntre([x, Y_BASTIDOR, z0], [x, Y_BASTIDOR + 0.12, z1], 0.01, 5), HIST.aluminio);
    }
    // Bisagras entre las secciones.
    for (const z of [-0.62, 0.62]) {
      l.pieza(new THREE.CylinderGeometry(0.035, 0.035, 0.07, 10), HIST.plateado, { p: [x, Y_BASTIDOR, z], r: [0, 0, Math.PI / 2] });
      l.pieza(cajaBiselada(0.05, 0.06, 0.09, 0.006), HIST.aluminio, { p: [x, Y_BASTIDOR + 0.03, z] });
    }
  }
  for (const z of [Z_FRENTE, -1.05, -0.62, 0, 0.62, 1.05, Z_COLA]) {
    l.pieza(tuboEntre([-w, Y_BASTIDOR, z], [w, Y_BASTIDOR, z], 0.02, 8), HIST.aluminio);
  }
  // Suelo de la sección central, de paneles de aluminio con nervios.
  l.pieza(cajaBiselada(2 * w - 0.04, 0.02, 1.2, 0.005), HIST.aluminio, { p: [0, Y_BASTIDOR + 0.02, 0], v: 0.05 });
  for (const x of [-0.4, -0.2, 0, 0.2, 0.4]) {
    l.pieza(new THREE.BoxGeometry(0.02, 0.015, 1.18), HIST.plateado, { p: [x, Y_BASTIDOR + 0.035, 0] });
  }
  for (const z of [-0.3, 0.3]) {
    l.pieza(new THREE.BoxGeometry(2 * w - 0.06, 0.012, 0.02), HIST.plateado, { p: [0, Y_BASTIDOR + 0.033, z] });
  }
}

/**
 * Dos asientos plegables de tubo de aluminio con cintas de nailon (NSSDC: "two side-by-side foldable seats made of
 * tubular aluminum with nylon webbing"), cinturón, reposapiés y el reposabrazos central.
 */
function asientos(l: Lote): void {
  for (const x of [-X_ASIENTO, X_ASIENTO]) {
    // Cintas del asiento y del respaldo, tejidas: longitudinales y transversales, con el marco visible entre ellas.
    for (let k = 0; k < 5; k++) {
      const u = -0.18 + k * 0.09;
      l.pieza(new THREE.BoxGeometry(0.06, 0.012, 0.42), HIST.asiento, { p: [x + u, Y_ASIENTO, Z_ASIENTO], v: 0.04 });
    }
    for (let k = 0; k < 4; k++) {
      const v = -0.15 + k * 0.1;
      l.pieza(new THREE.BoxGeometry(0.44, 0.008, 0.05), HIST.asiento, { p: [x, Y_ASIENTO + 0.009, Z_ASIENTO + v], v: 0.04 });
    }
    l.en([x, Y_ASIENTO + 0.26, Z_ASIENTO + 0.25], [-0.25, 0, 0], () => {
      for (let k = 0; k < 5; k++) {
        l.pieza(new THREE.BoxGeometry(0.06, 0.46, 0.012), HIST.asiento, { p: [-0.18 + k * 0.09, 0, 0], v: 0.04 });
      }
      for (let k = 0; k < 4; k++) {
        l.pieza(new THREE.BoxGeometry(0.44, 0.05, 0.008), HIST.asiento, { p: [0, -0.15 + k * 0.1, 0.009], v: 0.04 });
      }
    });
    // Marco de tubo.
    for (const s of [-1, 1]) {
      const xs = x + s * 0.22;
      l.pieza(tuboEntre([xs, Y_BASTIDOR + 0.12, Z_ASIENTO - 0.2], [xs, Y_ASIENTO, Z_ASIENTO - 0.2], 0.012, 6), HIST.aluminio);
      l.pieza(tuboEntre([xs, Y_ASIENTO, Z_ASIENTO - 0.21], [xs, Y_ASIENTO, Z_ASIENTO + 0.21], 0.012, 6), HIST.aluminio);
      l.pieza(tuboEntre([xs, Y_BASTIDOR + 0.12, Z_ASIENTO + 0.22], [xs, Y_ASIENTO + 0.5, Z_ASIENTO + 0.36], 0.012, 6), HIST.aluminio);
    }
    l.pieza(tuboEntre([x - 0.22, Y_ASIENTO, Z_ASIENTO - 0.21], [x + 0.22, Y_ASIENTO, Z_ASIENTO - 0.21], 0.012, 6), HIST.aluminio);
    l.pieza(tuboEntre([x - 0.22, Y_ASIENTO + 0.5, Z_ASIENTO + 0.36], [x + 0.22, Y_ASIENTO + 0.5, Z_ASIENTO + 0.36], 0.012, 6), HIST.aluminio);
    // Cinturón: una cinta cruzada sobre el asiento, con su hebilla.
    l.pieza(new THREE.BoxGeometry(0.05, 0.006, 0.44), HIST.antena, { p: [x, Y_ASIENTO + 0.02, Z_ASIENTO], r: [0, 0.6, 0] });
    l.pieza(cajaBiselada(0.06, 0.012, 0.04, 0.003), HIST.plateado, { p: [x, Y_ASIENTO + 0.026, Z_ASIENTO], r: [0, 0.6, 0] });
    // Reposapiés delante del asiento, en la parte delantera de la sección central.
    l.pieza(cajaBiselada(0.34, 0.015, 0.16, 0.005), HIST.aluminio, { p: [x, Y_BASTIDOR + 0.1, -0.5], r: [0.45, 0, 0] });
    for (const s of [-1, 1]) {
      l.pieza(tuboEntre([x + s * 0.16, Y_BASTIDOR + 0.03, -0.44], [x + s * 0.16, Y_BASTIDOR + 0.1, -0.5], 0.008, 5), HIST.aluminio);
    }
  }
  // Reposabrazos central.
  l.pieza(cajaBiselada(0.08, 0.05, 0.4, 0.01), HIST.asiento, { p: [0, Y_ASIENTO + 0.15, Z_ASIENTO + 0.05] });
  l.pieza(tuboEntre([0, Y_BASTIDOR + 0.12, Z_ASIENTO + 0.05], [0, Y_ASIENTO + 0.13, Z_ASIENTO + 0.05], 0.014, 6), HIST.aluminio);
}

/** Mando en T entre los asientos (a la derecha del comandante) y consola de control y presentación. */
function mandos(l: Lote): void {
  // Mando en T: base con fuelle, palanca vertical y empuñadura transversal, delante del reposabrazos.
  const base: V3 = [0, Y_ASIENTO + 0.1, Z_ASIENTO - 0.2];
  const cima: V3 = [0, Y_ASIENTO + 0.32, Z_ASIENTO - 0.24];
  l.pieza(cajaBiselada(0.1, 0.06, 0.12, 0.01), HIST.consola, { p: base });
  l.pieza(new THREE.CylinderGeometry(0.022, 0.035, 0.06, 10), HIST.negro, { p: [0, base[1] + 0.06, base[2] - 0.005] });
  l.pieza(tuboEntre(base, cima, 0.014, 8), HIST.negro);
  l.pieza(tuboEntre([-0.075, cima[1], cima[2]], [0.075, cima[1], cima[2]], 0.016, 8), HIST.negro);
  for (const s of [-1, 1]) {
    l.pieza(new THREE.CylinderGeometry(0.02, 0.02, 0.035, 8), HIST.consola, { p: [s * 0.06, cima[1], cima[2]], r: [0, 0, Math.PI / 2] });
  }
  // Consola sobre un poste, inclinada hacia el conductor.
  l.pieza(tuboEntre([0, Y_BASTIDOR + 0.02, -0.56], [0, 0.98, -0.62], 0.022, 8), HIST.aluminio);
  l.en([0, 1.05, -0.63], [-0.3, 0, 0], () => {
    l.pieza(cajaBiselada(0.4, 0.3, 0.06, 0.012), HIST.consola);
    l.pieza(cajaBiselada(0.42, 0.32, 0.02, 0.006), HIST.aluminio, { p: [0, 0, -0.035] });
    // Indicadores: esferas y medidores claros sobre el panel, con su bisel.
    for (const [x, y] of [
      [-0.11, 0.06],
      [0.0, 0.07],
      [0.11, 0.06],
      [-0.1, -0.07],
      [0.1, -0.07],
    ] as const) {
      l.pieza(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 12), HIST.antena, { p: [x, y, 0.035], r: [Math.PI / 2, 0, 0] });
      l.pieza(new THREE.TorusGeometry(0.032, 0.005, 4, 12), HIST.plateado, { p: [x, y, 0.04] });
    }
    // Fila de interruptores y disyuntores en la parte baja del panel.
    for (let k = 0; k < 7; k++) {
      l.pieza(new THREE.BoxGeometry(0.012, 0.012, 0.025), HIST.plateado, { p: [-0.12 + k * 0.04, -0.125, 0.04], r: [0.4, 0, 0] });
    }
    // Dispositivo de sombra solar para la navegación, encima del panel.
    l.pieza(new THREE.BoxGeometry(0.08, 0.04, 0.05), HIST.aluminio, { p: [0, 0.17, 0] });
    l.pieza(new THREE.BoxGeometry(0.004, 0.05, 0.004), HIST.negro, { p: [0, 0.205, 0] });
  });
}

/** Cable entre dos puntos, con una comba hacia abajo de `comba` metros. */
function cable(l: Lote, a: V3, b: V3, comba: number, color: number = HIST.negro): void {
  const tramos = 6;
  let previo = a;
  for (let i = 1; i <= tramos; i++) {
    const t = i / tramos;
    const actual: V3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - comba * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t];
    l.pieza(tuboEntre(previo, actual, 0.006, 4), color);
    previo = actual;
  }
}

/**
 * Sección delantera: baterías, electrónica, LCRU, cámara de TV y antenas. Sección trasera: portaherramientas.
 * Las mantas térmicas (MLI) van forradas de beta cloth blanco (HIST.mantaLRV).
 */
function equipos(l: Lote, haciaTierraLocal: THREE.Vector3): void {
  const y = Y_BASTIDOR + 0.02;
  // Dos baterías de plata-zinc con su manta térmica, bajo sus cubiertas antipolvo. // VERIFICAR: color de las cubiertas.
  for (const x of [-0.28, 0.28]) {
    l.pieza(cajaBiselada(0.44, 0.17, 0.42, 0.015), HIST.mantaLRV, { p: [x, y + 0.09, -0.92], v: 0.06 });
    for (const dz of [-0.12, 0, 0.12]) {
      l.pieza(new THREE.BoxGeometry(0.446, 0.004, 0.006), HIST.antena, { p: [x, y + 0.13, -0.92 + dz] });
    }
    l.pieza(cajaBiselada(0.46, 0.02, 0.44, 0.006), HIST.cubierta, { p: [x, y + 0.19, -0.92] });
    l.pieza(new THREE.CylinderGeometry(0.008, 0.008, 0.44, 6), HIST.plateado, { p: [x, y + 0.19, -0.7], r: [0, 0, Math.PI / 2] });
  }
  // Electrónica de mando (DCE) y unidad de procesado de señales (SPU), con su manta térmica.
  l.pieza(cajaBiselada(0.9, 0.12, 0.3, 0.015), HIST.mantaLRV, { p: [0, y + 0.07, -1.3], v: 0.05 });
  l.pieza(cajaBiselada(0.3, 0.02, 0.2, 0.004), HIST.plateado, { p: [-0.25, y + 0.14, -1.3] });
  // Unidad de comunicaciones (LCRU) delante, con manta térmica y espejos de radiador arriba.
  l.pieza(cajaBiselada(0.48, 0.3, 0.28, 0.02), HIST.mantaLRV, { p: [0, y + 0.3, -1.38], v: 0.05 });
  l.pieza(cajaBiselada(0.4, 0.012, 0.22, 0.004), HIST.plateado, { p: [0, y + 0.456, -1.38] });
  for (const dx of [-0.1, 0, 0.1]) {
    l.pieza(new THREE.BoxGeometry(0.004, 0.003, 0.22), HIST.antena, { p: [dx, y + 0.463, -1.38] });
  }
  // Cámara de televisión en color (GCTA) sobre su unidad de control (TCU) y su mástil, mirando hacia delante.
  l.pieza(tuboEntre([0, y + 0.45, -1.4], [0, 1.1, -1.44], 0.016, 8), HIST.aluminio);
  l.pieza(cajaBiselada(0.12, 0.07, 0.12, 0.01), HIST.mantaLRV, { p: [0, 1.14, -1.45] });
  l.pieza(cajaBiselada(0.14, 0.14, 0.3, 0.015), HIST.antena, { p: [0, 1.26, -1.46] });
  l.pieza(new THREE.CylinderGeometry(0.035, 0.05, 0.09, 12), HIST.lente, { p: [0, 1.26, -1.65], r: [Math.PI / 2, 0, 0] });
  // Parasol de la lente.
  l.pieza(new THREE.CylinderGeometry(0.06, 0.052, 0.05, 12, 1, true), HIST.negro, { p: [0, 1.26, -1.71], r: [Math.PI / 2, 0, 0] });
  // Antena de alta ganancia (paraguas de malla con varillas) en su mástil, apuntando a la Tierra con el LRV estacionado.
  const cimaMastil: V3 = [-0.3, 1.62, -1.3];
  l.pieza(tuboEntre([-0.3, y + 0.3, -1.3], cimaMastil, 0.016, 8), HIST.aluminio);
  const giro = new THREE.Euler().setFromQuaternion(
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), haciaTierraLocal.clone().normalize()),
  );
  l.en(cimaMastil, [giro.x, giro.y, giro.z], () => {
    // Cono cerrado con el vértice hacia el mástil: la tapa hace de cara cóncava del plato.
    l.pieza(new THREE.ConeGeometry(0.46, 0.17, 24), HIST.antena, { p: [0, 0.09, 0], r: [Math.PI, 0, 0], v: 0.05 });
    // Varillas del paraguas, del vértice al borde.
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      l.pieza(tuboEntre([0, 0.005, 0], [Math.cos(a) * 0.465, 0.18, Math.sin(a) * 0.465], 0.006, 4), HIST.plateado);
    }
    l.pieza(new THREE.CylinderGeometry(0.01, 0.01, 0.3, 6), HIST.lente, { p: [0, 0.2, 0] });
  });
  // Antena de baja ganancia, helicoidal, en el lado derecho: varilla con la hélice enrollada.
  const baseBaja: V3 = [0.3, y + 0.35, -1.32];
  const cimaBaja: V3 = [0.3, 1.55, -1.36];
  l.pieza(tuboEntre(baseBaja, cimaBaja, 0.014, 6), HIST.antena);
  const vueltas = 10;
  const pasosHelice = vueltas * 8;
  let previo: V3 | null = null;
  for (let k = 0; k <= pasosHelice; k++) {
    const t = k / pasosHelice;
    const a = t * vueltas * Math.PI * 2;
    const yh = 1.1 + t * 0.42;
    const zh = baseBaja[2] + (cimaBaja[2] - baseBaja[2]) * ((yh - baseBaja[1]) / (cimaBaja[1] - baseBaja[1]));
    const actual: V3 = [0.3 + Math.cos(a) * 0.03, yh, zh + Math.sin(a) * 0.03];
    if (previo) l.pieza(tuboEntre(previo, actual, 0.004, 3), HIST.antena);
    previo = actual;
  }
  // Cables de la LCRU a las antenas y a la cámara, y de la consola a la electrónica delantera.
  cable(l, [-0.15, y + 0.42, -1.25], [-0.3, y + 0.62, -1.3], 0.04);
  cable(l, [0.15, y + 0.42, -1.25], [0.3, y + 0.62, -1.32], 0.04);
  cable(l, [0.05, y + 0.45, -1.3], [0.03, 1.12, -1.4], 0.03);
  cable(l, [0.02, 0.95, -0.6], [0.1, y + 0.14, -1.15], 0.08);
  // Portaherramientas trasero: bandeja con bolsas de muestras y herramientas (pinzas, pala y rastrillo).
  l.pieza(cajaBiselada(0.95, 0.28, 0.5, 0.02), HIST.aluminio, { p: [0, y + 0.18, 1.18] });
  for (const dx of [-0.3, 0, 0.3]) {
    l.pieza(new THREE.BoxGeometry(0.012, 0.26, 0.505), HIST.plateado, { p: [dx, y + 0.18, 1.18] });
  }
  // Bolsas de muestras en su dispensador.
  l.pieza(cajaBiselada(0.4, 0.22, 0.25, 0.02), HIST.asiento, { p: [-0.22, y + 0.42, 1.12] });
  for (let k = 0; k < 4; k++) {
    l.pieza(cajaBiselada(0.08, 0.1, 0.03, 0.006), HIST.antena, { p: [-0.37 + k * 0.1, y + 0.58, 1.06], r: [-0.15, 0, 0] });
  }
  // Mangos de las herramientas con su pieza: pinzas, pala y rastrillo.
  const herramientas: [number, number][] = [
    [0.1, 0.15],
    [0.25, 0.25],
    [0.38, 0.1],
  ];
  for (const [x, inclinacion] of herramientas) {
    l.pieza(tuboEntre([x, y + 0.2, 1.35], [x, y + 0.95, 1.35 + inclinacion], 0.012, 6), HIST.aluminio);
    l.pieza(new THREE.CylinderGeometry(0.018, 0.018, 0.05, 8), HIST.negro, { p: [x, y + 0.36, 1.35 + inclinacion * 0.2] });
  }
  // Pinzas: dos brazos cerrados abajo.
  for (const s of [-1, 1]) {
    l.pieza(tuboEntre([0.1 + s * 0.008, y + 0.2, 1.35], [0.1 + s * 0.02, y + 0.12, 1.34], 0.006, 4), HIST.plateado);
  }
  // Pala: hoja plana.
  l.pieza(cajaBiselada(0.08, 0.1, 0.012, 0.003), HIST.plateado, { p: [0.25, y + 0.15, 1.35] });
  // Rastrillo: travesaño con púas.
  l.pieza(new THREE.BoxGeometry(0.12, 0.012, 0.012), HIST.plateado, { p: [0.38, y + 0.18, 1.35] });
  for (let k = 0; k < 6; k++) {
    l.pieza(new THREE.BoxGeometry(0.005, 0.05, 0.005), HIST.plateado, { p: [0.33 + k * 0.02, y + 0.15, 1.35] });
  }
}

/** Color del polvo lunar que se pega a la parte baja del LRV: el gris del regolito. */
const COLOR_POLVO = new THREE.Color(SUELO_LUNA.gris);
/** Altura (m) hasta la que llega el polvo en el bastidor y los guardabarros, y cuánto tiñe (0–1) en lo más bajo. */
const ALTURA_POLVO_M = 0.75;
const POLVO_MAX = 0.55;
/** Polvo en la malla de las ruedas: uniforme, porque la rueda gira y todo su contorno toca el suelo. */
const POLVO_RUEDA = 0.3;

const _v = new THREE.Vector3();

/**
 * Empolva los colores de las mallas de `raiz` (en ejes del LRV): mucho abajo y nada por encima de ALTURA_POLVO_M,
 * o una cantidad fija si `uniforme` no es null.
 */
function empolvar(raiz: THREE.Object3D, uniforme: number | null): void {
  raiz.updateMatrixWorld(true);
  raiz.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const pos = o.geometry.getAttribute('position');
    const col = o.geometry.getAttribute('color');
    if (!col) return;
    for (let i = 0; i < pos.count; i++) {
      const y = _v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).y;
      const f = uniforme ?? POLVO_MAX * THREE.MathUtils.clamp(1 - y / ALTURA_POLVO_M, 0, 1) ** 1.5;
      if (f <= 0) continue;
      col.setXYZ(
        i,
        THREE.MathUtils.lerp(col.getX(i), COLOR_POLVO.r, f),
        THREE.MathUtils.lerp(col.getY(i), COLOR_POLVO.g, f),
        THREE.MathUtils.lerp(col.getZ(i), COLOR_POLVO.b, f),
      );
    }
    col.needsUpdate = true;
  });
}

/** Construye el LRV. `haciaTierraLocal`: dirección de la Tierra en ejes del LRV, para su antena de alta ganancia. */
export function crearLRVLuna(haciaTierraLocal: THREE.Vector3): THREE.Group {
  const l = new Lote(false);
  bastidor(l);
  // Los guardabarros van fijos al bastidor. // VERIFICAR: si en el LRV giraban con la rueda.
  for (const [x, z] of RUEDAS_LRV) {
    guardabarros(l, x, z);
    suspension(l, x, z);
  }
  asientos(l);
  mandos(l);
  equipos(l, haciaTierraLocal);
  const grupo = l.construir();
  empolvar(grupo, null);
  // Cada rueda va aparte (no en el lote) para poder girarla y hacerla rodar.
  const ruedas = RUEDAS_LRV.map(([x, z]) => crearRueda(x, z));
  for (const r of ruedas) grupo.add(r.pivote);
  grupo.userData.ruedas = crearAnimacionRuedas(ruedas);
  grupo.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  return grupo;
}
