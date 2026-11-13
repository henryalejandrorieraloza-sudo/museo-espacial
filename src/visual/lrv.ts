import * as THREE from 'three';
import { COLOR_LRV, Lote, METALES_LRV, MallaLibre, SUELO_LUNA, azar, cajaBiselada, parte, registrandoPartes, tuboEntre, type V3 } from './paleta';

// Lunar Roving Vehicle de Apollo 17 para la escena lunar, low poly facetado (caras planas, sin superficies suaves) y
// con muchos polígonos. Frente hacia −Z, origen en el suelo y centrado. Solo lleva lo que tenía el LRV real: chasis de
// perfiles de aluminio en tres secciones con piso de listones, ruedas de malla de acero con chevrones de titanio,
// guardabarros con extensiones, suspensión de doble horquilla, dos asientos de tubo y lona, mando en T, consola,
// baterías y electrónica, unidad de comunicaciones (LCRU), cámara de TV, antenas de alta y baja ganancia, cables y
// portaherramientas trasero. Sin techo ni puertas.
//
// Aspecto (referencias de Henry de 2026-11-12: modelo "Lunar Roving Vehicle from Apollo 15" de TurboSquid): ruedas
// de malla gris oscura con chevrones claros, aro con pernos y cubo blanco; guardabarros naranja caramelo con riel
// remachado y bandera; asientos de lona naranja con respaldo de cintas cruzadas; chasis blanco; consola blanca con
// panel beige; LCRU y cámara forradas de lámina dorada; paraguas de malla gris. Colores en COLOR_LRV (paleta.ts).
//
// Medidas (Wikipedia, "Lunar Roving Vehicle", a partir de la NASA y Boeing): largo 10 ft (3.05 m), batalla 7.5 ft
// (2.29 m), alto 3.6 ft (1.1 m); ruedas de 32 in (0.81 m) de diámetro y 9 in (0.23 m) de ancho. La NSSDC ("The
// Apollo Lunar Roving Vehicle") da lo mismo: bastidor de 3.1 m, batalla de 2.3 m, altura libre de 36 cm. ALSJ,
// "Apollo 17 TV reflections": el paraguas queda ~50 cm por encima de la cámara. Aproximado (// VERIFICAR): la vía, el
// diámetro del paraguas, el número de chevrones y la distribución de la consola.

/** Lote del LRV: la lámina dorada y las piezas de metal gris van con acabado metálico (brillan al Sol). */
function nuevoLote(): Lote {
  return new Lote(false, 'museo', METALES_LRV);
}

const RADIO_RUEDA = 0.4064;
const ANCHO_RUEDA = 0.2286;
/** Radio y ancho de la rueda (m): 32 in de diámetro y 9 in de ancho (Wikipedia, NSSDC). */
export const RADIO_RUEDA_LRV = RADIO_RUEDA;
export const ANCHO_RUEDA_LRV = ANCHO_RUEDA;
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
/**
 * Altura de la base de malla de los asientos tal como se dibujan, algo más baja que Y_ASIENTO. Y_ASIENTO sigue
 * fijando los ojos del comandante (OJOS_COMANDANTE) y el mando en T, para que la posición del jugador sentado y la
 * del agarre no cambien con el diseño de los asientos.
 */
const Y_BASE_ASIENTO = 0.57;

/** Bisagras entre la sección central del chasis y las secciones delantera y trasera (|z|, m). */
const Z_BISAGRA = 0.62;
/**
 * Altura del eje de plegado de cada sección sobre el bastidor (m). En el modelo las secciones se pliegan 180° sobre
 * la central; con el eje un poco por encima del bastidor, la delantera queda encima de los asientos plegados y la
 * trasera encima de la delantera, sin atravesarse. // VERIFICAR: geometría real de las bisagras (Boeing).
 */
const ALTURA_PLIEGUE_DELANTERO = 0.2;
const ALTURA_PLIEGUE_TRASERO = 0.34;
/** Bisagra delantera de la sección central, en ejes del LRV: es el punto sobre el que gira al salir de la bahía. */
export const BISAGRA_DELANTERA_LRV: V3 = [0, Y_BASTIDOR, -Z_BISAGRA];
/** Base del poste de la consola, sobre la que gira al bajarla. */
const BASE_CONSOLA: V3 = [0, Y_BASTIDOR + 0.02, -0.56];

/** Posición de los ojos del comandante sentado, en ejes del LRV (m). */
export const OJOS_COMANDANTE: V3 = [-X_ASIENTO, Y_ASIENTO + 0.82, Z_ASIENTO + 0.08];
/** Centros de las cuatro ruedas (x, z), para apoyar el LRV en el suelo. */
export const RUEDAS_LRV: readonly (readonly [number, number])[] = [
  [-VIA_LRV / 2, -BATALLA_LRV / 2],
  [VIA_LRV / 2, -BATALLA_LRV / 2],
  [-VIA_LRV / 2, BATALLA_LRV / 2],
  [VIA_LRV / 2, BATALLA_LRV / 2],
];


/**
 * Cuerdas de la malla por sentido (dos sentidos cruzados), en tramos a lo ancho. Es una densidad de dibujo: la malla
 * real tenía cientos de cuerdas de 0.84 mm (Wikipedia). Cada cuerda es una arista en relieve de cuatro caras.
 */
const CUERDAS_MALLA = 22;
const TRAMOS_MALLA = 3;
/** Ancho y relieve de cada cuerda dibujada (m): mucho más gruesas que las reales para que la rejilla se lea de lejos. */
const MEDIO_ANCHO_CUERDA = 0.008;
const RELIEVE_CUERDA = 0.005;
/** Chevrones alrededor de la rueda: anchos y claros, como en la referencia. // VERIFICAR: número real por rueda. */
const CHEVRONES_RUEDA = 18;
/** Lados de los polígonos de la rueda (aros, flanco y cubo): facetada, sin curvas suaves. */
const LADOS_RUEDA = 16;

const _d = new THREE.Vector3();
const _l = new THREE.Vector3();
const _f = new THREE.Vector3();

/** Punto de la banda de rodadura: `x` a lo ancho (eje de giro) y `a` el ángulo desde arriba (hacia +Z). */
function enBanda(x: number, a: number, r: number): THREE.Vector3 {
  return new THREE.Vector3(x, Math.cos(a) * r, Math.sin(a) * r);
}

function radial(a: number): THREE.Vector3 {
  return new THREE.Vector3(0, Math.cos(a), Math.sin(a));
}

/**
 * Malla de cuerdas tejidas en diagonal: cada cuerda cruza la banda girando 1.5 pasos, así las de un sentido se
 * cruzan con las del otro en los vértices de los tramos y dejan rombos abiertos que muestran el interior oscuro.
 */
function mallaRueda(): THREE.BufferGeometry {
  const m = new MallaLibre();
  const w = ANCHO_RUEDA / 2;
  const r = RADIO_RUEDA - 0.004;
  const paso = (Math.PI * 2) / CUERDAS_MALLA;
  const giro = 1.5 * paso;
  for (let i = 0; i < CUERDAS_MALLA; i++) {
    for (const sentido of [-1, 1]) {
      for (let k = 0; k < TRAMOS_MALLA; k++) {
        const t0 = k / TRAMOS_MALLA;
        const t1 = (k + 1) / TRAMOS_MALLA;
        const a0 = i * paso + sentido * t0 * giro;
        const a1 = i * paso + sentido * t1 * giro;
        const p0 = enBanda(-w + t0 * ANCHO_RUEDA, a0, r);
        const p1 = enBanda(-w + t1 * ANCHO_RUEDA, a1, r);
        const n0 = radial(a0);
        const n1 = radial(a1);
        _d.subVectors(p1, p0);
        _l.crossVectors(_d, _f.addVectors(n0, n1)).normalize().multiplyScalar(MEDIO_ANCHO_CUERDA);
        const cresta0 = p0.clone().addScaledVector(n0, RELIEVE_CUERDA);
        const cresta1 = p1.clone().addScaledVector(n1, RELIEVE_CUERDA);
        for (const s of [-1, 1]) {
          const b0 = p0.clone().addScaledVector(_l, s);
          const b1 = p1.clone().addScaledVector(_l, s);
          m.quad(b0, b1, cresta1, cresta0, _f.addVectors(n0, n1).addScaledVector(_l, s * 60));
        }
      }
    }
  }
  return m.geometria();
}

/** Placa en relieve sobre la banda, de p0 a p1 (puntos de la banda): cara de arriba, dos lados y la punta de p1. */
function placaBanda(m: MallaLibre, x0: number, a0: number, x1: number, a1: number, medio: number, alto: number): void {
  const r = RADIO_RUEDA;
  const p0 = enBanda(x0, a0, r);
  const p1 = enBanda(x1, a1, r);
  const n0 = radial(a0);
  const n1 = radial(a1);
  const d = new THREE.Vector3().subVectors(p1, p0);
  const l = new THREE.Vector3().crossVectors(d, new THREE.Vector3().addVectors(n0, n1)).normalize().multiplyScalar(medio);
  const v = (p: THREE.Vector3, n: THREE.Vector3, s: number, h: number): THREE.Vector3 => p.clone().addScaledVector(l, s).addScaledVector(n, h);
  const arriba = new THREE.Vector3().addVectors(n0, n1);
  m.quad(v(p0, n0, 1, alto), v(p1, n1, 1, alto), v(p1, n1, -1, alto), v(p0, n0, -1, alto), arriba);
  for (const s of [-1, 1]) {
    m.quad(v(p0, n0, s, 0), v(p1, n1, s, 0), v(p1, n1, s, alto), v(p0, n0, s, alto), l.clone().multiplyScalar(s));
  }
  m.quad(v(p1, n1, 1, 0), v(p1, n1, -1, 0), v(p1, n1, -1, alto), v(p1, n1, 1, alto), d);
}

/**
 * Chevrones de titanio en V sobre la malla, anchos y claros, cubriendo cerca de la mitad de la banda (NSSDC:
 * "Titanium chevrons covered 50% of the contact area"). La V apunta en el sentido de giro al avanzar.
 */
function chevronesRueda(): THREE.BufferGeometry {
  const m = new MallaLibre();
  const w = ANCHO_RUEDA / 2;
  for (let i = 0; i < CHEVRONES_RUEDA; i++) {
    const a = ((i + 0.5) / CHEVRONES_RUEDA) * Math.PI * 2;
    for (const s of [-1, 1]) placaBanda(m, 0, a, s * w * 1.02, a + 0.19, 0.024, 0.016);
  }
  return m.geometria();
}

/**
 * Rueda de malla que rueda, en ejes de la rueda (centro en el origen, eje de giro en X). `lado`: −1 a la izquierda
 * del LRV y +1 a la derecha (el buje mira hacia fuera). Banda de malla de alambre oscura con chevrones claros, flanco
 * de malla, aro de aluminio con pernos y cubo blanco en el centro, como en la referencia (NSSDC: "zinc coated woven
 * 0.083 cm diameter steel strands attached to the rim and discs of formed aluminum").
 */
function ruedaRodante(l: Lote, interior: Lote, lado: number): void {
  const w = ANCHO_RUEDA / 2;
  // Interior oscuro visto a través del tejido. Va en su lote, sin polvo, para que siga oscuro.
  interior.pieza(new THREE.CylinderGeometry(RADIO_RUEDA - 0.012, RADIO_RUEDA - 0.012, ANCHO_RUEDA * 0.97, LADOS_RUEDA, 1, true), COLOR_LRV.interiorRueda, { r: [0, 0, Math.PI / 2] });
  parte('malla', () => l.pieza(mallaRueda(), COLOR_LRV.rueda, { v: 0.12 }));
  parte('chevrones', () => l.pieza(chevronesRueda(), COLOR_LRV.chevron, { v: 0.08 }));
  for (const s of [-1, 1]) {
    const xf = s * (w - 0.004);
    // Flanco de malla: corona facetada del aro al disco, con nervios radiales.
    const flanco = new THREE.RingGeometry(0.25, RADIO_RUEDA - 0.004, LADOS_RUEDA, 2);
    l.pieza(flanco, COLOR_LRV.interiorRueda, { p: [xf, 0, 0], r: [0, s * (Math.PI / 2), 0], v: 0.1 });
    for (let k = 0; k < LADOS_RUEDA; k += 2) {
      const a = (k / LADOS_RUEDA) * Math.PI * 2;
      l.pieza(new THREE.BoxGeometry(0.006, 0.006, RADIO_RUEDA - 0.26), COLOR_LRV.rueda, {
        p: [xf + s * 0.003, Math.cos(a) * (RADIO_RUEDA + 0.25) * 0.5, Math.sin(a) * (RADIO_RUEDA + 0.25) * 0.5],
        r: [a + Math.PI / 2, 0, 0],
      });
    }
    // Aro exterior de la banda.
    l.pieza(new THREE.TorusGeometry(RADIO_RUEDA - 0.006, 0.009, 4, LADOS_RUEDA), COLOR_LRV.gris, { p: [xf, 0, 0], r: [0, Math.PI / 2, 0] });
  }
  // Por fuera: aro de aluminio con pernos, disco oscuro hundido y el cubo blanco.
  const xa = lado * (w + 0.006);
  l.pieza(new THREE.CylinderGeometry(0.25, 0.25, 0.026, LADOS_RUEDA, 1, true), COLOR_LRV.gris, { p: [xa, 0, 0], r: [0, 0, Math.PI / 2] });
  const corona = new THREE.RingGeometry(0.19, 0.25, LADOS_RUEDA, 1);
  l.pieza(corona, COLOR_LRV.gris, { p: [xa + lado * 0.013, 0, 0], r: [0, lado * (Math.PI / 2), 0], v: 0.05 });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    l.pieza(new THREE.BoxGeometry(0.012, 0.014, 0.014), COLOR_LRV.cubo, { p: [xa + lado * 0.018, Math.cos(a) * 0.22, Math.sin(a) * 0.22], r: [a, 0, 0] });
  }
  l.pieza(new THREE.CylinderGeometry(0.19, 0.19, 0.012, LADOS_RUEDA), COLOR_LRV.interiorRueda, { p: [xa - lado * 0.01, 0, 0], r: [0, 0, Math.PI / 2] });
  l.pieza(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 10), COLOR_LRV.cubo, { p: [xa + lado * 0.02, 0, 0], r: [0, 0, Math.PI / 2], v: 0.04 });
  l.pieza(new THREE.CylinderGeometry(0.05, 0.065, 0.025, 10), COLOR_LRV.cubo, { p: [xa + lado * 0.055, 0, 0], r: [0, 0, -lado * Math.PI / 2] });
}

/** Motor de tracción y caja armónica en el cubo, hacia dentro: giran con la dirección, pero no ruedan. */
function motorRueda(l: Lote, lado: number): void {
  const x = -lado * (ANCHO_RUEDA / 2 + 0.05);
  l.pieza(new THREE.CylinderGeometry(0.11, 0.11, 0.16, 10), COLOR_LRV.gris, { p: [x, 0, 0], r: [0, 0, Math.PI / 2], v: 0.06 });
  l.pieza(new THREE.CylinderGeometry(0.125, 0.125, 0.025, 10), COLOR_LRV.blanco, { p: [x + lado * 0.07, 0, 0], r: [0, 0, Math.PI / 2] });
  l.pieza(new THREE.CylinderGeometry(0.08, 0.1, 0.03, 12), COLOR_LRV.blanco, { p: [x - lado * 0.09, 0, 0], r: [0, 0, Math.PI / 2] });
  // Brazo de dirección del cubo, donde se unen los brazos de la suspensión.
  l.pieza(new THREE.BoxGeometry(0.05, 0.2, 0.07), COLOR_LRV.blanco, { p: [x - lado * 0.04, 0, 0] });
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
  const motor = nuevoLote();
  motorRueda(motor, lado);
  pivote.add(motor.construir());
  // El motor se empolva según su altura; la banda, entera (ver empolvar).
  empolvar(pivote, null);
  const buje = new THREE.Group();
  buje.name = `${pivote.name}_buje`;
  const banda = nuevoLote();
  const interior = nuevoLote();
  ruedaRodante(banda, interior, lado);
  buje.add(banda.construir());
  empolvar(buje, POLVO_RUEDA);
  buje.add(interior.construir());
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
 * Canal barrido a lo largo de un arco alrededor del eje de la rueda (eje X por (x, RADIO_RUEDA, z)), de a0 a a1 en
 * `n` tramos. `perfil`: polígono cerrado en (u, v), con u a lo ancho (X) y v la distancia al eje.
 */
function barridoArco(perfil: readonly (readonly [number, number])[], x: number, z: number, a0: number, a1: number, n: number): THREE.BufferGeometry {
  const m = new MallaLibre();
  let area = 0;
  for (let i = 0; i < perfil.length; i++) {
    const [u0, v0] = perfil[i];
    const [u1, v1] = perfil[(i + 1) % perfil.length];
    area += u0 * v1 - u1 * v0;
  }
  const signo = Math.sign(area);
  const punto = (u: number, v: number, a: number): THREE.Vector3 => new THREE.Vector3(x + u, RADIO_RUEDA + Math.cos(a) * v, z + Math.sin(a) * v);
  for (let k = 0; k < n; k++) {
    const b0 = a0 + ((a1 - a0) * k) / n;
    const b1 = a0 + ((a1 - a0) * (k + 1)) / n;
    const am = (b0 + b1) / 2;
    for (let i = 0; i < perfil.length; i++) {
      const [u0, v0] = perfil[i];
      const [u1, v1] = perfil[(i + 1) % perfil.length];
      const nu = signo * (v1 - v0);
      const nv = -signo * (u1 - u0);
      const fuera = new THREE.Vector3(nu, Math.cos(am) * nv, Math.sin(am) * nv);
      m.quad(punto(u0, v0, b0), punto(u1, v1, b0), punto(u1, v1, b1), punto(u0, v0, b1), fuera);
    }
  }
  return m.geometria();
}

/**
 * Perfil del guardabarros: concha abombada sobre la rueda (de labio a labio pasando por arriba), facetada en
 * `tramos` caras y de 1 cm de espesor. `medio`: medio ancho; `radio`: distancia al eje en los labios.
 */
function perfilConcha(medio: number, radio: number, tramos = 6): [number, number][] {
  const fuera: [number, number][] = [];
  const dentro: [number, number][] = [];
  for (let i = 0; i <= tramos; i++) {
    const f = -Math.PI / 2 + (Math.PI * i) / tramos;
    const u = Math.sin(f) * medio;
    const v = radio + Math.cos(f) * 0.085;
    fuera.push([u, v + 0.01]);
    dentro.push([u * 0.97, v]);
  }
  return [...fuera, ...dentro.reverse()];
}

/**
 * Bandera de EE. UU. sobre el costado de un guardabarros (como en la referencia): placa blanca, siete franjas rojas y
 * el cantón azul. `p`: centro en la cara de fuera; `a`: ángulo del arco; `fuera`: ±1 hacia fuera.
 */
function bandera(l: Lote, p: V3, a: number, fuera: number): void {
  const alto = 0.1;
  const largo = 0.17;
  const franja = alto / 13;
  // Ejes locales: X hacia fuera, Y radial (arriba de la bandera) y Z a lo largo del arco.
  l.en(p, [a, 0, 0], () => {
    l.pieza(new THREE.BoxGeometry(0.003, alto, largo), COLOR_LRV.banderaBlanco, { p: [fuera * 0.0015, 0, 0] });
    for (let k = 0; k < 7; k++) {
      l.pieza(new THREE.BoxGeometry(0.002, franja, largo), COLOR_LRV.banderaRojo, { p: [fuera * 0.003, alto / 2 - franja * (2 * k + 0.5), 0] });
    }
    l.pieza(new THREE.BoxGeometry(0.002, franja * 7, largo * 0.4), COLOR_LRV.banderaAzul, { p: [fuera * 0.0045, alto / 2 - franja * 3.5, -largo * 0.3] });
  });
}

/**
 * Guardabarros naranja sobre cada rueda: concha abombada que abraza la rueda, con las extensiones delante y detrás,
 * un riel oscuro remachado a lo largo y la bandera en el costado (NSSDC: "Dust guards were mounted above the
 * wheels"; Smithsonian, "Extension, Fender, Lunar Roving Vehicle, Apollo 17"). La parte fija va en `l`; cada
 * extensión, en su lote, porque corre sobre la parte fija al desplegar el LRV (ALSJ).
 */
function guardabarros(l: Lote, extDelante: Lote, extDetras: Lote, x: number, z: number): void {
  const radio = RADIO_RUEDA + 0.03;
  const medio = ANCHO_RUEDA / 2 + 0.045;
  const fuera = Math.sign(x);
  l.pieza(barridoArco(perfilConcha(medio, radio), x, z, -1.25, 1.25, 10), COLOR_LRV.naranja, { v: 0.06 });
  extDelante.pieza(barridoArco(perfilConcha(medio + 0.006, radio + 0.012), x, z, -1.65, -1.2, 3), COLOR_LRV.naranja, { v: 0.06 });
  extDetras.pieza(barridoArco(perfilConcha(medio + 0.006, radio + 0.012), x, z, 1.2, 1.65, 3), COLOR_LRV.naranja, { v: 0.06 });
  // Bordes de los labios, más oscuros.
  for (const s of [-1, 1]) {
    l.pieza(barridoArco(perfilRect(s * medio - 0.008, s * medio + 0.008, radio - 0.012, radio + 0.012), x, z, -1.25, 1.25, 10), COLOR_LRV.naranjaBorde);
  }
  // Riel oscuro remachado a lo largo del guardabarros, hacia dentro, por el que corren las extensiones.
  const ur = -fuera * medio * 0.45;
  const vr = radio + Math.cos(Math.asin(0.45)) * 0.085 + 0.012;
  l.pieza(barridoArco(perfilRect(ur - 0.014, ur + 0.014, vr - 0.004, vr + 0.006), x, z, -1.2, 1.2, 10), COLOR_LRV.negro);
  for (let k = 0; k <= 7; k++) {
    const a = -1.1 + (2.2 * k) / 7;
    l.pieza(new THREE.BoxGeometry(0.008, 0.008, 0.008), COLOR_LRV.cubo, { p: [x + ur, RADIO_RUEDA + Math.cos(a) * (vr + 0.008), z + Math.sin(a) * (vr + 0.008)], r: [a, 0, 0] });
  }
  // Bandera en el costado de fuera, abajo delante en las ruedas delanteras y abajo detrás en las traseras.
  const aBandera = z < 0 ? -0.95 : 0.95;
  bandera(l, [x + fuera * (medio + 0.004), RADIO_RUEDA + Math.cos(aBandera) * (radio + 0.03), z + Math.sin(aBandera) * (radio + 0.03)], aBandera, fuera);
  // Soporte del guardabarros al bastidor.
  const lado = Math.sign(x);
  l.pieza(tuboEntre([lado * MEDIO_ANCHO_BASTIDOR, Y_BASTIDOR + 0.05, z], [x - lado * 0.06, RADIO_RUEDA + radio + 0.03, z], 0.011, 4, false), COLOR_LRV.gris);
}

/** Rectángulo (u0..u1, v0..v1) como perfil cerrado para `barridoArco`. */
function perfilRect(u0: number, u1: number, v0: number, v1: number): [number, number][] {
  return [
    [u0, v0],
    [u1, v0],
    [u1, v1],
    [u0, v1],
  ];
}

/**
 * Suspensión de doble horquilla horizontal, con barras de torsión arriba y abajo y un amortiguador entre el
 * bastidor y la horquilla superior (Wikipedia, NSSDC). Del bastidor al brazo de dirección del cubo.
 */
function suspension(l: Lote, x: number, z: number): void {
  const lado = Math.sign(x);
  const cubo = lado * (Math.abs(x) - ANCHO_RUEDA / 2 - 0.1);
  for (const [y, apertura] of [
    [Y_BASTIDOR - 0.06, 0.28],
    [Y_BASTIDOR + 0.07, 0.2],
  ] as const) {
    for (const s of [-1, 1]) {
      l.pieza(tuboEntre([lado * MEDIO_ANCHO_BASTIDOR, y, z + s * apertura], [cubo, RADIO_RUEDA + (y - Y_BASTIDOR) * 0.5, z], 0.016, 6, false), COLOR_LRV.gris);
    }
    l.pieza(tuboEntre([lado * MEDIO_ANCHO_BASTIDOR, y, z - apertura - 0.04], [lado * MEDIO_ANCHO_BASTIDOR, y, z + apertura + 0.04], 0.022, 8), COLOR_LRV.gris);
  }
  const arriba: V3 = [lado * (MEDIO_ANCHO_BASTIDOR - 0.02), Y_BASTIDOR + 0.2, z + 0.12];
  const abajo: V3 = [(lado * MEDIO_ANCHO_BASTIDOR + cubo) / 2, Y_BASTIDOR + 0.04, z + 0.04];
  const medio: V3 = [(arriba[0] + abajo[0]) / 2, (arriba[1] + abajo[1]) / 2, (arriba[2] + abajo[2]) / 2];
  l.pieza(tuboEntre(arriba, medio, 0.022, 8), COLOR_LRV.blanco);
  l.pieza(tuboEntre(medio, abajo, 0.01, 6, false), COLOR_LRV.gris);
}

/** Lotes de las tres secciones del chasis: cada una se pliega por separado. */
interface Secciones {
  delantera: Lote;
  centro: Lote;
  trasera: Lote;
}

/** Sección del chasis a la que pertenece una pieza a la altura `z` (las bisagras son de la central). */
function seccionEn(s: Secciones, z: number): Lote {
  if (z < -Z_BISAGRA - 1e-6) return s.delantera;
  if (z > Z_BISAGRA + 1e-6) return s.trasera;
  return s.centro;
}

/** Tubo fino abierto (las tapas de un tubo de pocos centímetros no se ven). */
function varilla(l: Lote, a: V3, b: V3, radio: number, color: number = COLOR_LRV.gris, lados = 8): void {
  l.pieza(tuboEntre(a, b, radio, lados, false), color);
}

/** Perfil de sección cuadrada (cuatro caras) entre dos puntos, blanco como el chasis. */
function perfilCuadrado(l: Lote, a: V3, b: V3, medio: number, tapas = false): void {
  l.pieza(tuboEntre(a, b, medio * Math.SQRT2, 4, tapas), COLOR_LRV.blanco, { v: 0.04 });
}

/**
 * Bastidor de perfiles blancos de aluminio 2219, en tres secciones unidas por bisagras: el LRV viajaba plegado en el
 * LM (Wikipedia, NSSDC). Largueros con aligeramientos oscuros, piso de listones longitudinales y celosía lateral.
 */
function bastidor(s: Secciones): void {
  // La parte 'chasis' es la estructura (largueros, travesaños y celosía); el piso de listones va aparte.
  parte('chasis', () => bastidorPiezas(s));
  pisoListones(s);
}

function bastidorPiezas(s: Secciones): void {
  const l = s.centro;
  const w = MEDIO_ANCHO_BASTIDOR;
  const yAlto = Y_BASTIDOR + 0.12;
  for (const x of [-w, w]) {
    for (const [sec, z0, z1] of [
      [s.delantera, Z_FRENTE, -Z_BISAGRA],
      [l, -Z_BISAGRA, Z_BISAGRA],
      [s.trasera, Z_BISAGRA, Z_COLA],
    ] as const) {
      perfilCuadrado(sec, [x, Y_BASTIDOR, z0], [x, Y_BASTIDOR, z1], 0.025, true);
      // Aligeramientos oscuros en la cara de fuera del larguero.
      for (let z = z0 + 0.12; z < z1 - 0.08; z += 0.16) {
        sec.pieza(new THREE.BoxGeometry(0.004, 0.018, 0.04), COLOR_LRV.negro, { p: [x + Math.sign(x) * 0.026, Y_BASTIDOR, z] });
      }
    }
    perfilCuadrado(l, [x, yAlto, -Z_BISAGRA], [x, yAlto, Z_BISAGRA], 0.014);
    for (const z of [-0.62, -0.31, 0, 0.31, 0.62]) perfilCuadrado(l, [x, Y_BASTIDOR, z], [x, yAlto, z], 0.01);
    for (const [z0, z1] of [
      [-0.62, -0.31],
      [-0.31, 0],
      [0, 0.31],
      [0.31, 0.62],
    ] as const) {
      perfilCuadrado(l, [x, Y_BASTIDOR, z0], [x, yAlto, z1], 0.007);
    }
    for (const [sec, z0, z1] of [
      [s.delantera, Z_FRENTE + 0.04, -Z_BISAGRA - 0.04],
      [s.trasera, Z_BISAGRA + 0.04, Z_COLA - 0.04],
    ] as const) {
      perfilCuadrado(sec, [x, Y_BASTIDOR + 0.07, z0], [x, Y_BASTIDOR + 0.07, z1], 0.01);
      const zm = (z0 + z1) / 2;
      for (const z of [z0, zm, z1]) perfilCuadrado(sec, [x, Y_BASTIDOR, z], [x, Y_BASTIDOR + 0.07, z], 0.008);
    }
    for (const z of [-Z_BISAGRA, Z_BISAGRA]) {
      l.pieza(new THREE.CylinderGeometry(0.032, 0.032, 0.08, 12), COLOR_LRV.gris, { p: [x, Y_BASTIDOR, z], r: [0, 0, Math.PI / 2] });
      l.pieza(new THREE.BoxGeometry(0.045, 0.065, 0.09), COLOR_LRV.blanco, { p: [x, Y_BASTIDOR + 0.03, z] });
    }
  }
  for (const z of [Z_FRENTE, -1.05, -Z_BISAGRA, 0, Z_BISAGRA, 1.05, Z_COLA]) {
    perfilCuadrado(seccionEn(s, z), [-w, Y_BASTIDOR, z], [w, Y_BASTIDOR, z], 0.016, Math.abs(z) > 1.4);
  }
}

/** Piso de listones longitudinales en las tres secciones, con un travesaño de apoyo. */
function pisoListones(s: Secciones): void {
  const l = s.centro;
  const w = MEDIO_ANCHO_BASTIDOR;
  for (const [sec, z0, z1] of [
    [s.delantera, Z_FRENTE + 0.02, -Z_BISAGRA - 0.02],
    [l, -Z_BISAGRA + 0.02, Z_BISAGRA - 0.02],
    [s.trasera, Z_BISAGRA + 0.02, Z_COLA - 0.02],
  ] as const) {
    for (let k = 0; k < 10; k++) {
      const x = -w + 0.06 + ((2 * w - 0.12) * k) / 9;
      sec.pieza(new THREE.BoxGeometry(0.035, 0.012, z1 - z0), COLOR_LRV.blanco, { p: [x, Y_BASTIDOR + 0.018, (z0 + z1) / 2], v: 0.04 });
    }
  }
}

/**
 * Dos asientos plegables de tubo de aluminio (NSSDC: "two side-by-side foldable seats made of tubular aluminum with
 * nylon webbing"): base de lona naranja tensada en el marco y respaldo de cintas naranjas cruzadas, como en la
 * referencia, con asidero exterior, reposapiés y el reposabrazos central. Cada asiento y cada reposapiés va en su
 * lote (`asiento[i]`, `reposapies[i]`, izquierda primero), porque viajaban plegados.
 */
function asientos(centro: Lote, asiento: readonly Lote[], reposapies: readonly Lote[]): void {
  [-X_ASIENTO, X_ASIENTO].forEach((x, i) => {
    const l = asiento[i];
    parte('asientos', () => asientoPiezas(l, x));
    // Reposapiés delante del asiento, en la parte delantera de la sección central.
    const pie = reposapies[i];
    pie.pieza(cajaBiselada(0.34, 0.012, 0.16, 0.004), COLOR_LRV.blanco, { p: [x, Y_BASTIDOR + 0.1, -0.5], r: [0.45, 0, 0] });
    for (const sx of [-1, 1]) varilla(pie, [x + sx * 0.16, Y_BASTIDOR + 0.03, -0.44], [x + sx * 0.16, Y_BASTIDOR + 0.1, -0.5], 0.007, COLOR_LRV.gris, 6);
  });
  // Reposabrazos central naranja sobre su caja blanca, con el mando en T delante.
  centro.pieza(cajaBiselada(0.11, 0.14, 0.42, 0.02), COLOR_LRV.blanco, { p: [0, Y_ASIENTO + 0.03, Z_ASIENTO + 0.05], v: 0.04 });
  centro.pieza(cajaBiselada(0.1, 0.035, 0.36, 0.012), COLOR_LRV.naranja, { p: [0, Y_ASIENTO + 0.12, Z_ASIENTO + 0.08] });
  varilla(centro, [0, Y_BASTIDOR + 0.12, Z_ASIENTO + 0.05], [0, Y_ASIENTO - 0.04, Z_ASIENTO + 0.05], 0.014);
}

/** Un asiento (base de lona, marco, respaldo de cintas, asidero y cinturón) centrado en `x`, en el lote `l`. */
function asientoPiezas(l: Lote, x: number): void {
  const y = Y_BASE_ASIENTO;
  const exterior = Math.sign(x);
  // Base: lona naranja algo inclinada hacia atrás, con las patas del marco al bastidor.
  l.pieza(new THREE.BoxGeometry(0.42, 0.014, 0.4), COLOR_LRV.naranja, { p: [x, y, Z_ASIENTO], r: [0.06, 0, 0], v: 0.05 });
  for (const sx of [-1, 1]) {
    const xs = x + sx * 0.22;
    varilla(l, [xs, y, Z_ASIENTO - 0.21], [xs, y + 0.03, Z_ASIENTO + 0.21], 0.011);
    for (const sz of [-1, 1]) varilla(l, [xs, Y_BASTIDOR + 0.12, Z_ASIENTO + sz * 0.18], [xs, y + 0.015 * sz, Z_ASIENTO + sz * 0.18], 0.011);
  }
  // Travesaño delantero curvado en tres tramos.
  varilla(l, [x - 0.22, y, Z_ASIENTO - 0.21], [x - 0.16, y - 0.02, Z_ASIENTO - 0.24], 0.011);
  varilla(l, [x - 0.16, y - 0.02, Z_ASIENTO - 0.24], [x + 0.16, y - 0.02, Z_ASIENTO - 0.24], 0.011);
  varilla(l, [x + 0.16, y - 0.02, Z_ASIENTO - 0.24], [x + 0.22, y, Z_ASIENTO - 0.21], 0.011);
  // Respaldo: marco de tubo y cintas naranjas cruzadas (tres horizontales y dos verticales).
  l.en([x, y + 0.22, Z_ASIENTO + 0.25], [-0.22, 0, 0], () => {
    for (const sx of [-1, 1]) varilla(l, [sx * 0.21, -0.22, 0], [sx * 0.21, 0.22, 0], 0.011);
    varilla(l, [-0.21, 0.22, 0], [0.21, 0.22, 0], 0.011);
    for (const v of [-0.12, 0.0, 0.12]) l.pieza(new THREE.BoxGeometry(0.42, 0.055, 0.008), COLOR_LRV.naranja, { p: [0, v, 0], v: 0.06 });
    for (const u of [-0.08, 0.08]) l.pieza(new THREE.BoxGeometry(0.055, 0.4, 0.008), COLOR_LRV.naranja, { p: [u, 0, 0.006], v: 0.06 });
  });
  // Asidero exterior: arco de tubo junto al asiento, para subir y bajar.
  const xa = x + exterior * 0.27;
  const asidero: V3[] = [
    [xa, Y_BASTIDOR + 0.12, Z_ASIENTO - 0.22],
    [xa + exterior * 0.03, y + 0.14, Z_ASIENTO - 0.16],
    [xa + exterior * 0.03, y + 0.16, Z_ASIENTO + 0.12],
    [xa, Y_BASTIDOR + 0.12, Z_ASIENTO + 0.2],
  ];
  for (let k = 0; k < asidero.length - 1; k++) varilla(l, asidero[k], asidero[k + 1], 0.012);
  // Cinturón con su hebilla.
  l.pieza(new THREE.BoxGeometry(0.04, 0.006, 0.42), COLOR_LRV.naranjaBorde, { p: [x, y + 0.014, Z_ASIENTO], r: [0, 0.6, 0] });
  l.pieza(new THREE.BoxGeometry(0.05, 0.012, 0.035), COLOR_LRV.gris, { p: [x, y + 0.02, Z_ASIENTO], r: [0, 0.6, 0] });
}

/** Base del mando en T (ejes del LRV), entre los asientos. */
const BASE_MANDO: V3 = [0, Y_ASIENTO + 0.1, Z_ASIENTO - 0.2];
/** Punto sobre el que pivota la palanca del mando en T: lo alto de su fuelle gris. */
export const PIVOTE_MANDO_LRV: V3 = [0, BASE_MANDO[1] + 0.06, BASE_MANDO[2] - 0.005];

/**
 * Mando en T entre los asientos (a la derecha del comandante): la base en `l` y la palanca en `palanca` (cuelga de su
 * pivote, para poder inclinarla), y consola de control y presentación, en `consola` (gira sobre su base al desplegar
 * el LRV): carcasa blanca inclinada, panel beige de instrumentos con la esfera de rumbo, medidores e interruptores, y
 * dos empuñaduras negras a los lados, como en la referencia.
 */
function mandos(l: Lote, palanca: Lote, consola: Lote): void {
  const base = BASE_MANDO;
  const cima: V3 = [0, Y_ASIENTO + 0.32, Z_ASIENTO - 0.24];
  l.pieza(cajaBiselada(0.11, 0.07, 0.13, 0.015), COLOR_LRV.blanco, { p: base });
  l.pieza(new THREE.CylinderGeometry(0.03, 0.045, 0.06, 12), COLOR_LRV.gris, { p: [0, base[1] + 0.06, base[2] - 0.005] });
  parte('mando', () => {
    palanca.pieza(tuboEntre(base, cima, 0.016, 8, false), COLOR_LRV.blanco);
    palanca.pieza(tuboEntre([-0.075, cima[1], cima[2]], [0.075, cima[1], cima[2]], 0.018, 8), COLOR_LRV.blanco);
    palanca.pieza(new THREE.BoxGeometry(0.02, 0.015, 0.02), COLOR_LRV.negro, { p: [0, cima[1] + 0.02, cima[2]] });
  });
  parte('consola', () => consolaPiezas(consola));
}

/**
 * Grupos de interruptores de la fila de abajo del panel, de izquierda a derecha (columnas de 0 a 7). En el panel real
 * hay interruptores de potencia de tracción (DRIVE POWER), de dirección (STEERING) y de habilitar la tracción (DRIVE
 * ENABLE). // VERIFICAR: qué columnas ocupa cada grupo en el panel real (la distribución del panel es aproximada).
 */
const GRUPOS_INTERRUPTORES: readonly { parte: string; columnas: readonly number[] }[] = [
  { parte: 'panelPotencia', columnas: [0, 1, 2] },
  { parte: 'panelDireccion', columnas: [3, 4, 5] },
  { parte: 'panelHabilitar', columnas: [6, 7] },
];

function consolaPiezas(l: Lote): void {
  varilla(l, BASE_CONSOLA, [0, 0.98, -0.62], 0.024, COLOR_LRV.gris, 10);
  for (const s of [-1, 1]) varilla(l, [s * 0.12, Y_BASTIDOR + 0.02, -0.5], [s * 0.05, 0.9, -0.6], 0.01, COLOR_LRV.gris, 6);
  l.en([0, 1.05, -0.63], [-0.3, 0, 0], () => {
    // Carcasa blanca facetada, más ancha atrás.
    l.pieza(cajaBiselada(0.44, 0.36, 0.12, 0.03), COLOR_LRV.blanco, { p: [0, 0, -0.04], v: 0.04 });
    // Panel beige con los instrumentos, hacia el conductor.
    l.pieza(new THREE.BoxGeometry(0.38, 0.3, 0.012), COLOR_LRV.panel, { p: [0, 0, 0.026] });
    l.pieza(new THREE.CylinderGeometry(0.06, 0.06, 0.01, 16), COLOR_LRV.banderaBlanco, { p: [-0.09, 0.07, 0.034], r: [Math.PI / 2, 0, 0] });
    l.pieza(new THREE.TorusGeometry(0.062, 0.008, 4, 16), COLOR_LRV.negro, { p: [-0.09, 0.07, 0.038] });
    l.pieza(new THREE.BoxGeometry(0.004, 0.05, 0.004), COLOR_LRV.negro, { p: [-0.09, 0.08, 0.04], r: [0, 0, 0.5] });
    l.pieza(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 12), COLOR_LRV.negro, { p: [0.08, 0.1, 0.034], r: [Math.PI / 2, 0, 0] });
    for (const x of [0.03, 0.13]) l.pieza(new THREE.BoxGeometry(0.035, 0.08, 0.01), COLOR_LRV.negro, { p: [x, -0.01, 0.034] });
    for (let fila = 0; fila < 2; fila++) {
      for (let k = 0; k < 8; k++) {
        const pieza = (): void => l.pieza(new THREE.BoxGeometry(0.01, 0.01, 0.022), COLOR_LRV.negro, { p: [-0.14 + k * 0.04, -0.09 - fila * 0.04, 0.04], r: [0.4, 0, 0] });
        const grupo = GRUPOS_INTERRUPTORES.find((g) => g.columnas.includes(k));
        if (fila === 1 && grupo) parte(grupo.parte, pieza);
        else pieza();
      }
    }
    // Empuñaduras negras a los lados del panel.
    for (const s of [-1, 1]) {
      varilla(l, [s * 0.24, -0.12, 0.02], [s * 0.24, 0.05, 0.02], 0.012, COLOR_LRV.gris, 8);
      l.pieza(new THREE.CylinderGeometry(0.022, 0.022, 0.12, 10), COLOR_LRV.negro, { p: [s * 0.24, 0.12, 0.02] });
    }
    // Dispositivo de sombra solar encima del panel.
    l.pieza(new THREE.BoxGeometry(0.08, 0.04, 0.05), COLOR_LRV.blanco, { p: [0, 0.2, -0.02] });
    l.pieza(new THREE.BoxGeometry(0.004, 0.05, 0.004), COLOR_LRV.negro, { p: [0, 0.235, -0.02] });
  });
}

/** Cable entre dos puntos, con una comba hacia abajo de `comba` metros. */
function cable(l: Lote, a: V3, b: V3, comba: number, color: number = COLOR_LRV.gris): void {
  const tramos = 6;
  let previo = a;
  for (let i = 1; i <= tramos; i++) {
    const t = i / tramos;
    const actual: V3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - comba * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t];
    l.pieza(tuboEntre(previo, actual, 0.007, 5, false), color);
    previo = actual;
  }
}

/** Caja forrada de manta blanca con dos cinchas negras alrededor, como las baterías y la electrónica. */
function cajaCinchada(l: Lote, p: V3, ancho: number, alto: number, fondo: number): void {
  l.pieza(cajaBiselada(ancho, alto, fondo, 0.02), COLOR_LRV.blanco, { p, v: 0.06 });
  for (const f of [-0.28, 0.28]) {
    l.pieza(new THREE.BoxGeometry(0.035, alto + 0.008, fondo + 0.008), COLOR_LRV.negro, { p: [p[0] + f * ancho, p[1], p[2]] });
  }
}

/** Caja forrada de lámina dorada arrugada (LCRU, cámara): caja base y una capa de facetas abultadas encima, opaca (con
 * acabado metálico destellaba por encima del umbral del bloom). */
function cajaDorada(l: Lote, p: V3, ancho: number, alto: number, fondo: number, semilla: number): void {
  l.pieza(cajaBiselada(ancho, alto, fondo, 0.012), COLOR_LRV.oro, { p });
  const forro = new THREE.BoxGeometry(ancho + 0.01, alto + 0.01, fondo + 0.01, 3, 2, 3);
  const rnd = azar(semilla);
  const pos = forro.getAttribute('position');
  const hechos = new Map<string, [number, number, number]>();
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    let d = hechos.get(k);
    if (!d) {
      d = [(rnd() - 0.5) * 0.02, (rnd() - 0.5) * 0.02, (rnd() - 0.5) * 0.02];
      hechos.set(k, d);
    }
    pos.setXYZ(i, pos.getX(i) + d[0], pos.getY(i) + d[1], pos.getZ(i) + d[2]);
  }
  l.pieza(forro, COLOR_LRV.oro, { p, v: 0.35 });
}

/** Diámetro del plato de la antena de alta ganancia (m). // VERIFICAR: ~0.9 m (3 ft) según fotos; sin cifra oficial. */
const RADIO_ANTENA_ALTA = 0.46;
/** Varillas del paraguas de la antena de alta ganancia. */
const NERVADURAS_ANTENA = 16;

/**
 * Sección delantera: baterías y electrónica (en `l`, viajaban en el LRV plegado), y LCRU, cámara de TV y antenas
 * (en `carga.delantera`). Sección trasera: portaherramientas con sus cajas y las pinzas (en `carga.trasera`). La
 * carga se montó después del despliegue (ALSJ, "Loading the Rover").
 */
function equipos(l: Lote, carga: { delantera: Lote; trasera: Lote }, haciaTierraLocal: THREE.Vector3): void {
  const y = Y_BASTIDOR + 0.02;
  // Dos baterías de plata-zinc de 36 V con su manta blanca y cinchas negras, y la electrónica de mando delante.
  parte('baterias', () => {
    for (const x of [-0.28, 0.28]) cajaCinchada(l, [x, y + 0.1, -0.92], 0.44, 0.18, 0.42);
  });
  cajaCinchada(l, [0, y + 0.08, -1.3], 0.9, 0.13, 0.3);
  cable(l, [0.02, 0.95, -0.6], [0.1, y + 0.15, -1.15], 0.08);
  cable(l, [-0.28, y + 0.2, -0.72], [-0.18, y + 0.14, -1.16], 0.03);
  cable(l, [0.28, y + 0.2, -0.72], [0.2, y + 0.14, -1.16], 0.03);
  // Lo que sigue se montó en la Luna, después del despliegue.
  l = carga.delantera;
  // Unidad de comunicaciones (LCRU) forrada de lámina dorada, con su asa y su panel de mando.
  parte('mylar', () => cajaDorada(l, [0, y + 0.3, -1.38], 0.56, 0.24, 0.36, 41));
  l.pieza(tuboEntre([-0.2, y + 0.45, -1.56], [0.2, y + 0.45, -1.56], 0.01, 6), COLOR_LRV.gris);
  l.pieza(new THREE.BoxGeometry(0.3, 0.12, 0.012), COLOR_LRV.negro, { p: [0.08, y + 0.3, -1.565] });
  // Cámara de televisión en color (GCTA) forrada de lámina dorada, sobre su pedestal dorado y la unidad de control
  // blanca, mirando hacia delante.
  parte('camaraTV', () => {
    parte('mylar', () => cajaDorada(l, [0.1, y + 0.62, -1.42], 0.12, 0.26, 0.12, 43));
    l.pieza(cajaBiselada(0.14, 0.1, 0.12, 0.012), COLOR_LRV.blanco, { p: [0.1, y + 0.5, -1.42] });
    parte('mylar', () => cajaDorada(l, [0.1, y + 0.82, -1.46], 0.14, 0.13, 0.3, 47));
    l.pieza(new THREE.CylinderGeometry(0.035, 0.04, 0.07, 12), COLOR_LRV.negro, { p: [0.1, y + 0.82, -1.64], r: [Math.PI / 2, 0, 0] });
    l.pieza(new THREE.CylinderGeometry(0.028, 0.028, 0.004, 12), COLOR_LRV.lente, { p: [0.1, y + 0.82, -1.676], r: [Math.PI / 2, 0, 0] });
  });
  cable(l, [0.16, y + 0.5, -1.36], [0.2, y + 0.38, -1.25], 0.03);
  cable(l, [0.04, y + 0.5, -1.36], [-0.1, y + 0.42, -1.25], 0.03);
  // Antena de alta ganancia: paraguas de malla gris con varillas, cubo dentado y la varilla de apuntado que lo
  // atraviesa, en un mástil plateado; apunta a la Tierra con el LRV estacionado. El centro del paraguas queda ~50 cm
  // por encima de la cámara (ALSJ, "TV reflections", Apollo 17).
  const cimaMastil: V3 = [-0.3, 1.7, -1.3];
  parte('antenaAlta', () => antenaAlta(l, y, cimaMastil, haciaTierraLocal));
  // Antena de baja ganancia: tubo blanco con su corona perforada en un mástil curvo, con la empuñadura negra.
  parte('antenaBaja', () => antenaBaja(l, y));
  cable(l, [-0.15, y + 0.42, -1.25], [-0.3, y + 0.62, -1.3], 0.04);
  cable(l, [0.15, y + 0.42, -1.25], [0.31, y + 0.62, -1.32], 0.04);
  // Portaherramientas trasero: bastidor blanco perforado con las cajas de muestras y las pinzas de pie.
  portaherramientas(carga.trasera, y);
}

/** Antena de alta ganancia en su mástil, con el paraguas hacia `haciaTierraLocal`. */
function antenaAlta(l: Lote, y: number, cimaMastil: V3, haciaTierraLocal: THREE.Vector3): void {
  varilla(l, [-0.3, y + 0.3, -1.3], cimaMastil, 0.014, COLOR_LRV.gris, 10);
  const giro = new THREE.Euler().setFromQuaternion(
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), haciaTierraLocal.clone().normalize()),
  );
  l.en(cimaMastil, [giro.x, giro.y, giro.z], () => {
    const fondo = 0.12;
    const radios = [0.04, 0.18, 0.32, RADIO_ANTENA_ALTA];
    const perfil = radios.map((r) => new THREE.Vector2(r, fondo * (r / RADIO_ANTENA_ALTA) ** 2));
    // Malla en gajos entre las varillas: un polígono de NERVADURAS_ANTENA lados (facetado, como el real).
    l.pieza(new THREE.LatheGeometry(perfil, NERVADURAS_ANTENA), COLOR_LRV.grisMalla, { m: 'rejilla' });
    for (let k = 0; k < NERVADURAS_ANTENA; k++) {
      const a = (k / NERVADURAS_ANTENA) * Math.PI * 2;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      for (let j = 0; j < perfil.length - 1; j++) {
        const p0 = perfil[j];
        const p1 = perfil[j + 1];
        varilla(l, [c * p0.x, p0.y + 0.003, sn * p0.x], [c * p1.x, p1.y + 0.003, sn * p1.x], 0.005, COLOR_LRV.gris, 4);
      }
    }
    // Cubo dentado en el centro y la varilla de apuntado con su alimentador.
    l.pieza(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 12), COLOR_LRV.negro, { p: [0, 0.01, 0] });
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      l.pieza(new THREE.BoxGeometry(0.03, 0.035, 0.03), COLOR_LRV.negro, { p: [Math.cos(a) * 0.08, 0.01, Math.sin(a) * 0.08], r: [0, -a, 0] });
    }
    varilla(l, [0, -0.35, 0], [0, 0.36, 0], 0.012, COLOR_LRV.gris, 8);
    l.pieza(new THREE.CylinderGeometry(0.04, 0.03, 0.05, 10), COLOR_LRV.gris, { p: [0, 0.36, 0] });
    l.pieza(new THREE.CylinderGeometry(0.02, 0.02, 0.1, 8), COLOR_LRV.negro, { p: [0, -0.38, 0] });
  });
}

function antenaBaja(l: Lote, y: number): void {
  const p0: V3 = [0.3, y + 0.35, -1.32];
  const p1: V3 = [0.32, 1.25, -1.34];
  const p2: V3 = [0.42, 1.45, -1.3];
  varilla(l, p0, p1, 0.012, COLOR_LRV.gris, 8);
  varilla(l, p1, p2, 0.012, COLOR_LRV.gris, 8);
  l.en(p2, [0.3, 0, -0.7], () => {
    l.pieza(new THREE.CylinderGeometry(0.035, 0.035, 0.28, 12), COLOR_LRV.blanco, { p: [0, 0.1, 0] });
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      l.pieza(new THREE.BoxGeometry(0.03, 0.06, 0.012), COLOR_LRV.blanco, { p: [Math.cos(a) * 0.085, 0.02, Math.sin(a) * 0.085], r: [0, -a + Math.PI / 2, 0] });
    }
    l.pieza(new THREE.TorusGeometry(0.085, 0.006, 3, 14), COLOR_LRV.blanco, { p: [0, 0.055, 0], r: [Math.PI / 2, 0, 0] });
    l.pieza(new THREE.TorusGeometry(0.085, 0.006, 3, 14), COLOR_LRV.blanco, { p: [0, -0.015, 0], r: [Math.PI / 2, 0, 0] });
    varilla(l, [0, -0.02, 0], [0.18, -0.2, 0], 0.008, COLOR_LRV.gris, 6);
    l.pieza(new THREE.CylinderGeometry(0.015, 0.015, 0.12, 8), COLOR_LRV.negro, { p: [0.22, -0.25, 0], r: [0, 0, 0.75] });
  });
}

function portaherramientas(l: Lote, y: number): void {
  const zp = 1.2;
  l.pieza(cajaBiselada(1.0, 0.5, 0.56, 0.02), COLOR_LRV.blanco, { p: [0, y + 0.3, zp], v: 0.04 });
  for (let k = 0; k < 4; k++) {
    l.pieza(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 12), COLOR_LRV.negro, { p: [-0.33 + k * 0.22, y + 0.556, zp + 0.12], v: 0.02 });
    l.pieza(new THREE.CylinderGeometry(0.04, 0.04, 0.012, 10), COLOR_LRV.negro, { p: [-0.33 + k * 0.22, y + 0.3, zp - 0.282], r: [Math.PI / 2, 0, 0] });
  }
  for (const x of [-0.25, 0.25]) l.pieza(cajaBiselada(0.4, 0.22, 0.42, 0.03), COLOR_LRV.blanco, { p: [x, y + 0.66, zp + 0.02], v: 0.08 });
  for (const x of [-0.5, 0.5]) varilla(l, [x, y + 0.05, zp - 0.28], [x, y + 0.8, zp - 0.28], 0.014, COLOR_LRV.blanco, 6);
  varilla(l, [-0.5, y + 0.8, zp - 0.28], [0.5, y + 0.8, zp - 0.28], 0.014, COLOR_LRV.blanco, 6);
  // Pinzas (dos), de pie a la izquierda del portaherramientas, con su soporte.
  for (const dz of [-0.06, 0.06]) {
    const xt = -0.42;
    varilla(l, [xt, y + 0.35, zp + dz + 0.2], [xt, y + 1.2, zp + dz + 0.2], 0.012, COLOR_LRV.gris, 8);
    for (const s of [-1, 1]) varilla(l, [xt + s * 0.012, y + 1.2, zp + dz + 0.2], [xt + s * 0.03, y + 1.32, zp + dz + 0.2], 0.008, COLOR_LRV.gris, 6);
    l.pieza(new THREE.CylinderGeometry(0.02, 0.02, 0.08, 8), COLOR_LRV.negro, { p: [xt, y + 0.9, zp + dz + 0.2] });
  }
  l.pieza(new THREE.BoxGeometry(0.08, 0.1, 0.22), COLOR_LRV.blanco, { p: [-0.42, y + 0.6, zp + 0.2] });
}

/** Color del polvo lunar que se pega a la parte baja del LRV: el gris del regolito. */
const COLOR_POLVO = new THREE.Color(SUELO_LUNA.gris);
/** Altura (m) hasta la que llega el polvo en el bastidor y los guardabarros, y cuánto tiñe (0–1) en lo más bajo. */
const ALTURA_POLVO_M = 0.75;
const POLVO_MAX = 0.55;
/**
 * Polvo en la malla de las ruedas: uniforme, porque la rueda gira y todo su contorno toca el suelo. Poco, para que la
 * malla se vea gris oscura con los chevrones claros, como en la referencia.
 */
const POLVO_RUEDA = 0.08;

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

/**
 * Cuánto está plegada cada parte del LRV: 0 = como en la superficie, listo para conducir; 1 = como viajaba en la
 * bahía del LM. La carga es al revés: 0 = sin montar (oculta), 1 = montada.
 */
export interface PosePlegadoLRV {
  /** Secciones del chasis: 1 = plegadas 180° sobre la central (ALSJ: "folded back onto ... the center section"). */
  delantera: number;
  trasera: number;
  /** Ruedas, con su suspensión y guardabarros: 1 = plegadas contra su sección ("the wheels ... are folded onto those"). */
  ruedasDelanteras: number;
  ruedasTraseras: number;
  /** Extensiones de los guardabarros: 1 = recogidas sobre la parte fija. */
  guardabarros: number;
  /** Asientos: 1 = plegados planos sobre el chasis ("folded flat onto the chassis, held down with Velcro"). */
  asientos: number;
  /** Consola: 1 = recogida. */
  consola: number;
  /** Reposapiés: 1 = abatidos sobre el suelo del chasis. */
  reposapies: number;
  /** LCRU, cámara de TV y antenas (sección delantera), y geopallet (sección trasera). */
  cargaDelantera: number;
  cargaTrasera: number;
}

/** El LRV listo para conducir, con todo montado: es como lo usa la misión. */
export const POSE_DESPLEGADO: Readonly<PosePlegadoLRV> = {
  delantera: 0,
  trasera: 0,
  ruedasDelanteras: 0,
  ruedasTraseras: 0,
  guardabarros: 0,
  asientos: 0,
  consola: 0,
  reposapies: 0,
  cargaDelantera: 1,
  cargaTrasera: 1,
};

/** El LRV como viajaba en la bahía del LM. */
export const POSE_PLEGADO: Readonly<PosePlegadoLRV> = {
  delantera: 1,
  trasera: 1,
  ruedasDelanteras: 1,
  ruedasTraseras: 1,
  guardabarros: 1,
  asientos: 1,
  consola: 1,
  reposapies: 1,
  cargaDelantera: 0,
  cargaTrasera: 0,
};

/** Plegado del LRV. Se guarda en `userData.plegado` del grupo del LRV. */
export interface PlegadoLRV {
  aplicar(pose: Readonly<PosePlegadoLRV>): void;
}

/** Giro de las extensiones de los guardabarros al recogerlas (rad, alrededor del eje de la rueda). */
const GIRO_EXTENSION_RECOGIDA = 0.45;
/** Altura que conservan los asientos plegados (fracción de la desplegada). */
const ESCALA_ASIENTO_PLEGADO = 0.08;
/**
 * Giro de la consola recogida (rad, hacia atrás sobre los asientos). // VERIFICAR: el ALSJ dice que viajaba en ángulo
 * recto con el chasis central, entre las secciones plegadas; en este modelo se abate hacia atrás para no atravesar
 * la sección delantera plegada.
 */
const GIRO_CONSOLA_RECOGIDA = 1.35;
/** Giro de los reposapiés abatidos (rad, hacia delante). */
const GIRO_REPOSAPIES_ABATIDO = -0.95;
/** La carga aparece bajando desde esta altura (m) mientras se monta. */
const ALTURA_MONTAJE_CARGA = 0.45;

/**
 * Pivote en `punto` (ejes del LRV) cuyo contenido se construye también en ejes del LRV: girado a 0, todo queda
 * exactamente donde estaba.
 */
function pivoteEn(punto: V3, nombre: string): { pivote: THREE.Group; contenido: THREE.Group } {
  const pivote = new THREE.Group();
  pivote.name = nombre;
  pivote.position.set(...punto);
  const contenido = new THREE.Group();
  contenido.position.set(-punto[0], -punto[1], -punto[2]);
  pivote.add(contenido);
  return { pivote, contenido };
}

/** Construye un lote y lo empolva en ejes del LRV (antes de colgarlo de un pivote). */
function construirEmpolvado(l: Lote): THREE.Group {
  const g = l.construir();
  empolvar(g, null);
  return g;
}

/**
 * Construye el LRV. `haciaTierraLocal`: dirección de la Tierra en ejes del LRV, para su antena de alta ganancia.
 * Las piezas que se movían al desplegarlo cuelgan de pivotes (`userData.plegado`); a POSE_DESPLEGADO el modelo es
 * el mismo que se conduce. La palanca del mando en T cuelga del pivote `mando_T`.
 *
 * `conPartes`: registra las piezas con nombre (chasis, malla, chevrones, asientos, mando, consola, interruptores,
 * baterías, Mylar, cámara de TV y antenas) en `userData.partes` de cada lote, para resaltarlas (presentación del LRV).
 * No cambia el aspecto del modelo.
 */
export function crearLRVLuna(haciaTierraLocal: THREE.Vector3, conPartes = false): THREE.Group {
  return conPartes ? registrandoPartes(() => construirLRV(haciaTierraLocal)) : construirLRV(haciaTierraLocal);
}

function construirLRV(haciaTierraLocal: THREE.Vector3): THREE.Group {
  const secciones: Secciones = { delantera: nuevoLote(), centro: nuevoLote(), trasera: nuevoLote() };
  const carga = { delantera: nuevoLote(), trasera: nuevoLote() };
  const consola = nuevoLote();
  const palanca = nuevoLote();
  const asiento = [nuevoLote(), nuevoLote()];
  const reposapies = [nuevoLote(), nuevoLote()];
  bastidor(secciones);
  asientos(secciones.centro, asiento, reposapies);
  mandos(secciones.centro, palanca, consola);
  equipos(secciones.delantera, carga, haciaTierraLocal);

  const grupo = new THREE.Group();
  grupo.add(construirEmpolvado(secciones.centro));
  const pivMando = pivoteEn(PIVOTE_MANDO_LRV, 'mando_T');
  pivMando.contenido.add(construirEmpolvado(palanca));
  grupo.add(pivMando.pivote);
  const pivConsola = pivoteEn(BASE_CONSOLA, 'consola');
  pivConsola.contenido.add(construirEmpolvado(consola));
  grupo.add(pivConsola.pivote);
  const pivAsientos = [-X_ASIENTO, X_ASIENTO].map((x, i) => {
    const p = pivoteEn([x, Y_BASTIDOR + 0.12, Z_ASIENTO], i === 0 ? 'asiento_comandante' : 'asiento_piloto');
    p.contenido.add(construirEmpolvado(asiento[i]));
    grupo.add(p.pivote);
    return p.pivote;
  });
  const pivReposapies = [-X_ASIENTO, X_ASIENTO].map((x, i) => {
    const p = pivoteEn([x, Y_BASTIDOR + 0.03, -0.44], `reposapies_${i === 0 ? 'izquierdo' : 'derecho'}`);
    p.contenido.add(construirEmpolvado(reposapies[i]));
    grupo.add(p.pivote);
    return p.pivote;
  });

  // Secciones delantera y trasera, con su carga (que se monta al final y aparece bajando).
  const delantera = pivoteEn([0, Y_BASTIDOR + ALTURA_PLIEGUE_DELANTERO, -Z_BISAGRA], 'seccion_delantera');
  const trasera = pivoteEn([0, Y_BASTIDOR + ALTURA_PLIEGUE_TRASERO, Z_BISAGRA], 'seccion_trasera');
  delantera.contenido.add(construirEmpolvado(secciones.delantera));
  trasera.contenido.add(construirEmpolvado(secciones.trasera));
  const cargaDelantera = new THREE.Group();
  cargaDelantera.name = 'carga_delantera';
  cargaDelantera.add(construirEmpolvado(carga.delantera));
  delantera.contenido.add(cargaDelantera);
  const cargaTrasera = new THREE.Group();
  cargaTrasera.name = 'carga_trasera';
  cargaTrasera.add(construirEmpolvado(carga.trasera));
  trasera.contenido.add(cargaTrasera);
  grupo.add(delantera.pivote, trasera.pivote);

  // Cada rueda va aparte (no en el lote) para poder girarla y hacerla rodar. Con su suspensión y su guardabarros,
  // se pliega sobre el larguero de su sección. Los guardabarros van fijos al bastidor.
  // // VERIFICAR: si en el LRV giraban con la rueda.
  const ruedas: RuedaModelo[] = [];
  const pliegues: { pivote: THREE.Group; lado: number; delantera: boolean }[] = [];
  const extensiones: { pivote: THREE.Group; signo: number }[] = [];
  for (const [x, z] of RUEDAS_LRV) {
    const lado = Math.sign(x);
    const esDelantera = z < 0;
    const nombre = `pliegue_rueda_${esDelantera ? 'delantera' : 'trasera'}_${lado < 0 ? 'izquierda' : 'derecha'}`;
    const pliegue = pivoteEn([lado * MEDIO_ANCHO_BASTIDOR, Y_BASTIDOR, z], nombre);
    const brazo = nuevoLote();
    const extDelante = nuevoLote();
    const extDetras = nuevoLote();
    guardabarros(brazo, extDelante, extDetras, x, z);
    suspension(brazo, x, z);
    pliegue.contenido.add(construirEmpolvado(brazo));
    for (const [lote, signo] of [
      [extDelante, 1],
      [extDetras, -1],
    ] as const) {
      const ext = pivoteEn([x, RADIO_RUEDA, z], `${nombre}_extension`);
      ext.contenido.add(construirEmpolvado(lote));
      pliegue.contenido.add(ext.pivote);
      extensiones.push({ pivote: ext.pivote, signo });
    }
    const rueda = crearRueda(x, z);
    pliegue.contenido.add(rueda.pivote);
    ruedas.push(rueda);
    (esDelantera ? delantera : trasera).contenido.add(pliegue.pivote);
    pliegues.push({ pivote: pliegue.pivote, lado, delantera: esDelantera });
  }
  grupo.userData.ruedas = crearAnimacionRuedas(ruedas);

  const plegado: PlegadoLRV = {
    aplicar(p) {
      // La delantera se pliega hacia arriba y atrás (−Z → +Y → +Z): giro positivo en X. La trasera, al revés.
      delantera.pivote.rotation.x = Math.PI * p.delantera;
      trasera.pivote.rotation.x = -Math.PI * p.trasera;
      // Cada rueda gira sobre su larguero hacia abajo y hacia dentro, bajo su sección: con la sección plegada sobre
      // la central, las ruedas quedan por fuera, hacia el LM ("with the wheels inward toward the spacecraft").
      for (const r of pliegues) {
        const f = r.delantera ? p.ruedasDelanteras : p.ruedasTraseras;
        r.pivote.rotation.z = -r.lado * (Math.PI / 2) * f;
      }
      for (const e of extensiones) e.pivote.rotation.x = e.signo * GIRO_EXTENSION_RECOGIDA * p.guardabarros;
      for (const a of pivAsientos) a.scale.y = THREE.MathUtils.lerp(1, ESCALA_ASIENTO_PLEGADO, p.asientos);
      pivConsola.pivote.rotation.x = GIRO_CONSOLA_RECOGIDA * p.consola;
      for (const r of pivReposapies) r.rotation.x = GIRO_REPOSAPIES_ABATIDO * p.reposapies;
      for (const [g, f] of [
        [cargaDelantera, p.cargaDelantera],
        [cargaTrasera, p.cargaTrasera],
      ] as const) {
        g.visible = f > 0;
        g.position.y = ALTURA_MONTAJE_CARGA * (1 - f);
      }
    },
  };
  grupo.userData.plegado = plegado;
  grupo.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  return grupo;
}
