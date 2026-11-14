import * as THREE from 'three';
import { ARQ, Lote, azar, cajaBiselada, segmentoAnillo, tinte, tuboEntre, type ColorCara, type V3 } from './paleta';
import { crearHolograma } from './holograma';
import {
  crearAtlasV541,
  crearCaja,
  crearConsola,
  crearMuestraRoca,
  crearSaturnV,
  crearTorre,
  crearTrajeApollo,
} from './props';

// Arquitectura del museo: sala circular oscura de 32 m, como las referencias de Henry de 2026-11-14. Paredes negras
// y lisas, techo negro sin luces, suelo pulido con órbitas de luz, una cascada de planetas luminosos colgando de la
// cúpula y un Saturn V en el centro. Los objetos expuestos (vitrinas, trajes, cohetes, consolas) no cambian.
// Pedidos de Henry (2026-11-14): el techo no lleva luces ni focos; las paredes son negras y no llevan nada (ni
// pantallas, ni carteles, ni puertas, ni zócalo); la base del Saturn V central no lleva luz; y la jerarquía de luces es
// esta: las de los objetos expuestos (hologramas, anillos, vitrinas, cápsulas) son las más intensas, y los planetas
// colgantes (como los de su foto de referencia, una cascada de planetas luminosos) brillan con suavidad y alumbran
// solo un poco. Todo lo demás queda en penumbra.
// Convención: X a la derecha, Y arriba, −Z hacia donde mira el jugador al inicio.

/** Colores de la sala oscura. Solo arquitectura: los objetos siguen con ARQ y HIST (paleta.ts). */
const SALA = {
  /** Paredes: negro puro. */
  pared: 0x000000,
  zocalo: 0x0b0d18,
  marco: 0x151929,
  suelo: 0x080912,
  sueloClaro: 0x0b0c17,
  sueloBase: 0x030308,
  techo: 0x040509,
  /** Pasamanos, cables y postes. */
  metal: 0x9aa0b4,
  /** Órbitas dibujadas en el suelo. */
  linea: 0xb8c2ff,
} as const;

const RADIO_PARED = 16;
const LADOS = 24;
const ANCHO_BAHIA = 2 * RADIO_PARED * Math.tan(Math.PI / LADOS);
const PASO_ANGULO = (Math.PI * 2) / LADOS;
/** Hasta dónde puede caminar el jugador, medido desde el centro. */
export const RADIO_CAMINABLE = 15;
/** Radio de la peana del cohete central: está en el camino recto desde el inicio y no se puede atravesar. */
export const RADIO_PEANA_COHETE = 3.3;

/** Techo perimetral (falso techo) y su borde interior (m). */
const ALTURA_TECHO_BAJO = 7.4;
const RADIO_TECHO_BAJO = 12.6;
const ALTURA_CORNISA = 11.6;
const RADIO_CUPULA = 16.1;
/** Altura de la cúpula negra sobre la cornisa. */
const ALZADO_CUPULA = 9.6;

/** Saturn V del centro a escala 1:10 (11.06 m): el modelo de props.ts es 1:13 (8.5 m). */
const ESCALA_COHETE = 13 / 10;
/** Altura de la mesa sobre la que se apoya el cohete (m). */
const ALTURA_MESA_COHETE = 0.98;

/** Lado del volumen de una exhibición (m): cabe el holograma girando (el LRV mide unos 3.1 m de largo). */
export const LADO_VITRINA = 4.0;
/** Altura de la cabeza del pedestal, donde está el emisor (m). */
export const ALTURA_PEDESTAL = 0.85;
/** Altura a la que flota la base de los hologramas (m). */
export const ALTURA_HOLOGRAMA = 1.45;
/** Altura del punto de apuntado de un holograma de artefacto: su centro aproximado (m). */
export const ALTURA_CENTRO_EXHIBICION = 2.2;

/**
 * Jerarquía de las luces puntuales de la sala (pedido de Henry, 2026-11-14): las de los objetos expuestos son las más
 * intensas (la de cada vitrina, sobre su holograma, y la de las cápsulas de los trajes) y las de los planetas
 * colgantes son tenues, lo justo para alumbrar un poco el cohete y el suelo (`INTENSIDAD_LUZ_PLANETA`, más abajo).
 */
const INTENSIDAD_LUZ_VITRINA = 11;
const INTENSIDAD_LUZ_TRAJES = 20;

/** Coloca `fn` en el sistema local de una cara de la pared: X a lo largo (sentido de giro creciente), +Z hacia el centro, origen en el suelo. */
function enPared(l: Lote, angulo: number, radio: number, fn: () => void): void {
  const giro = Math.atan2(-Math.cos(angulo), -Math.sin(angulo));
  l.en([Math.cos(angulo) * radio, 0, Math.sin(angulo) * radio], [0, giro, 0], fn);
}

/** Degradado vertical de luz falsa: `abajo` en y0 y `arriba` en y1. */
function degradado(hex: number, abajo: number, arriba: number, altura: number): (p: THREE.Vector3) => THREE.Color {
  return (p) => tinte(hex, THREE.MathUtils.lerp(abajo, arriba, THREE.MathUtils.clamp(p.y / altura + 0.5, 0, 1)));
}

/** Charco de luz sobre el suelo, centrado en (x, z). */
function charco(l: Lote, x: number, z: number, radio: number, hex: number, intensidad: number): void {
  l.aditiva(
    new THREE.CircleGeometry(radio, 28),
    (p) => tinte(hex, Math.pow(Math.max(0, 1 - p.length() / radio), 2) * intensidad * 0.4),
    { p: [x, 0.035, z], r: [-Math.PI / 2, 0, 0] },
  );
}

const _mezcla = new THREE.Color();
const _otro = new THREE.Color();
/** Mezcla dos colores hex (t de 0 a 1). */
function mezcla(a: number, b: number, t: number): number {
  return _mezcla.setHex(a).lerp(_otro.setHex(b), THREE.MathUtils.clamp(t, 0, 1)).getHex();
}

// ---------------------------------------------------------------------------
// Suelo
// ---------------------------------------------------------------------------

/** Radios de las órbitas dibujadas en el suelo, alrededor del cohete (m). */
const ORBITAS_SUELO = [4.4, 5.9, 7.6, 9.6, 11.8, 14.0] as const;

function crearSuelo(l: Lote): void {
  l.pieza(new THREE.CylinderGeometry(RADIO_PARED + 0.4, RADIO_PARED + 0.4, 0.1, LADOS), SALA.sueloBase, { p: [0, -0.06, 0] });

  // Losas radiales oscuras, casi del mismo tono: el suelo pulido de las referencias.
  const anillos: [number, number, number][] = [
    [2.9, 6.45, 16],
    [6.55, 9.95, 24],
    [10.05, 12.95, 32],
    [13.05, RADIO_PARED, 24],
  ];
  for (const [ri, [r0, r1, n]] of anillos.entries()) {
    const paso = (Math.PI * 2) / n;
    for (let i = 0; i < n; i++) {
      const hueco = 0.012 / r0;
      const color = (i + ri) % 2 === 0 ? SALA.suelo : SALA.sueloClaro;
      l.pieza(segmentoAnillo(r0, r1, i * paso + hueco, (i + 1) * paso - hueco, -0.02, 0.02), color);
    }
  }

  // Órbitas de luz fina, cada una con un planeta marcado como un aro y su rótulo (barras sin texto real).
  const rnd = azar(77);
  for (const [k, r] of ORBITAS_SUELO.entries()) {
    const n = Math.round(r * 9);
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      l.emisiva(segmentoAnillo(r - 0.018, r + 0.018, a0, a0 + (Math.PI * 2) / n, 0.02, 0.026), SALA.linea, k % 2 ? 0.55 : 0.75);
    }
    const a = 0.6 + k * 2.4 + rnd() * 0.6;
    const [x, z] = [Math.cos(a) * r, Math.sin(a) * r];
    l.emisiva(new THREE.TorusGeometry(0.26, 0.014, 3, 20), SALA.linea, 0.8, { p: [x, 0.03, z], r: [Math.PI / 2, 0, 0] });
    l.emisiva(new THREE.CircleGeometry(0.1, 12), SALA.linea, 0.6, { p: [x, 0.031, z], r: [-Math.PI / 2, 0, 0] });
    l.en([x, 0.031, z], [-Math.PI / 2, 0, -a], () => renglon(l, 0.7, -0.45, 0.06, SALA.linea, 0.5, rnd, 0));
  }
}

// ---------------------------------------------------------------------------
// Paredes: negras y lisas, sin nada encima
// ---------------------------------------------------------------------------

/**
 * Las 24 caras de la pared: cajas negras sin pantallas, carteles, rótulos, puertas ni zócalo (pedido de Henry,
 * 2026-11-14). Siguen siendo sólidas para que no se vea el fondo del cielo por detrás.
 */
function crearParedes(l: Lote): void {
  for (let i = 0; i < LADOS; i++) {
    enPared(l, i * PASO_ANGULO + PASO_ANGULO / 2, RADIO_PARED, () => {
      l.emisiva(new THREE.BoxGeometry(ANCHO_BAHIA + 0.06, ALTURA_CORNISA, 0.3), SALA.pared, 1, { p: [0, ALTURA_CORNISA / 2, -0.15] });
    });
  }
}

// ---------------------------------------------------------------------------
// Techo: falso techo perimetral y cúpula negra, sin luces
// ---------------------------------------------------------------------------

/** Altura de la cúpula a una distancia `r` del centro (m). */
function alturaCupula(r: number): number {
  return ALTURA_CORNISA + ALZADO_CUPULA * Math.sqrt(Math.max(0, 1 - (r / RADIO_CUPULA) ** 2));
}

function crearTecho(l: Lote): void {
  for (let i = 0; i < LADOS; i++) {
    const a0 = i * PASO_ANGULO;
    const a1 = a0 + PASO_ANGULO;
    // Falso techo perimetral, con un faldón en el borde interior. Sin focos ni líneas de luz.
    l.emisiva(segmentoAnillo(RADIO_TECHO_BAJO, RADIO_PARED + 0.1, a0, a1, ALTURA_TECHO_BAJO, ALTURA_TECHO_BAJO + 0.2), SALA.techo, 1, { v: 0.4 });
    l.emisiva(segmentoAnillo(RADIO_TECHO_BAJO, RADIO_TECHO_BAJO + 0.12, a0, a1, ALTURA_TECHO_BAJO - 0.25, ALTURA_TECHO_BAJO + 1.1), SALA.marco, 0.7);
    // Cornisa de la cúpula.
    l.emisiva(segmentoAnillo(14.9, RADIO_PARED + 0.2, a0, a1, ALTURA_CORNISA - 0.3, ALTURA_CORNISA), SALA.techo);
  }

  // Cúpula negra facetada: el techo alto de la sala. Sin luces y sin iluminar: con las luces de la sala se veía gris.
  const boveda = new THREE.SphereGeometry(RADIO_CUPULA, LADOS, 7, 0, Math.PI * 2, 0, Math.PI / 2);
  boveda.scale(1, ALZADO_CUPULA / RADIO_CUPULA, 1);
  const noIndexada = boveda.toNonIndexed();
  // Por dentro: se invierte el orden de los vértices de cada triángulo.
  const pos = noIndexada.getAttribute('position');
  for (let i = 0; i < pos.count; i += 3) {
    const [x, y, z] = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    pos.setXYZ(i, pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2));
    pos.setXYZ(i + 2, x, y, z);
  }
  l.emisiva(noIndexada, SALA.techo, 1, { p: [0, ALTURA_CORNISA, 0], v: 0.5 });
}

// ---------------------------------------------------------------------------
// Planetas colgantes
// ---------------------------------------------------------------------------

interface PlanetaColgante {
  radio: number;
  posicion: V3;
  /** Color según la dirección de la cara desde el centro (vector unitario). */
  color: (d: THREE.Vector3) => number;
  /** Inclinación del eje (rad). */
  inclinacion: number;
  detalle: number;
  /** Anillos (radios interior y exterior relativos al planeta) y sus colores. */
  anillos?: { r0: number; r1: number; color: number }[];
  /** Si el planeta alumbra la sala: color e intensidad de su luz puntual, invisible, en el centro del planeta. */
  luz?: { color: number; intensidad: number };
}

/** Bandas horizontales según la latitud. */
const bandas = (colores: readonly number[], n: number) => (d: THREE.Vector3): number =>
  colores[Math.floor(THREE.MathUtils.clamp((d.y + 1) / 2, 0, 0.999) * n) % colores.length];

/**
 * El sistema solar colgado del techo: los planetas y la Luna, con su color aproximado y la inclinación real del eje en
 * los anillos de Saturno (26.7°). Tamaños y posiciones no están a escala: son la decoración de la sala. Entre ellos
 * cuelga además una cascada de planetas decorativos inventados (`crearCascada`).
 */
const PLANETAS_SISTEMA_SOLAR: readonly PlanetaColgante[] = [
  {
    // Luna: tierras altas claras y mares oscuros.
    radio: 2.2,
    posicion: [-7.2, 12.4, -6.6],
    inclinacion: 0.1,
    detalle: 3,
    color: (d) => {
      if (Math.sin(d.x * 23) * Math.sin(d.y * 19) * Math.sin(d.z * 21) > 0.3) return 0x87847e;
      return Math.sin(d.x * 4.6 + d.y * 2.8) + Math.sin(d.z * 3.9 - d.y * 5.2) > 0.75 ? 0x5e5c59 : 0xaaa7a1;
    },
  },
  {
    radio: 1.9,
    posicion: [7.6, 13.4, -5.2],
    inclinacion: 0.466,
    detalle: 3,
    color: bandas([0xe5cf9b, 0xd9bb80, 0xefe0b8, 0xc9a86a, 0xe8d4a4], 11),
    anillos: [
      { r0: 1.24, r1: 1.95, color: 0xd6c096 },
      { r0: 2.02, r1: 2.3, color: 0xb39a72 },
    ],
  },
  {
    // Júpiter con la Gran Mancha Roja en el hemisferio sur.
    radio: 2.5,
    posicion: [2.4, 14.6, -11.2],
    inclinacion: 0.05,
    detalle: 3,
    color: (d) => {
      if (Math.hypot(d.x - 0.8, (d.y + 0.36) * 1.7, d.z - 0.45) < 0.2) return 0xb4502e;
      return bandas([0xd8a878, 0xeed6b0, 0xb5764a, 0xe6c295, 0xc98d5a], 13)(d);
    },
  },
  { radio: 1.3, posicion: [10.6, 10.6, 3.4], inclinacion: 0.49, detalle: 2, color: bandas([0x3f5fd0, 0x4a6ee0, 0x3a56c0], 7) },
  { radio: 1.35, posicion: [-10.6, 10.4, 2.6], inclinacion: 1.71, detalle: 2, color: () => 0x9fd8dc },
  {
    // Tierra: océanos, continentes, nubes y casquetes.
    radio: 0.8,
    posicion: [-3.6, 9.9, -4.6],
    inclinacion: 0.41,
    detalle: 2,
    color: (d) => {
      if (Math.abs(d.y) > 0.86) return 0xeef4f8;
      if (Math.sin(d.x * 9 + d.z * 7 + d.y * 4) > 0.86) return 0xeef4f8;
      return Math.sin(d.x * 5.5) + Math.sin(d.z * 4.8 + d.y * 3.5) > 0.45 ? 0x4d8f47 : 0x2467c6;
    },
  },
  {
    radio: 0.55,
    posicion: [3.9, 9.5, -3.9],
    inclinacion: 0.44,
    detalle: 2,
    color: (d) => (d.y > 0.85 ? 0xefe7dc : Math.sin(d.x * 7 + d.z * 4) > 0.35 ? 0x7f3a22 : 0xc1502e),
  },
  { radio: 0.75, posicion: [-6.6, 9.4, 8.0], inclinacion: 0.05, detalle: 2, color: bandas([0xe6c58a, 0xd9b679, 0xeacf98], 6) },
  { radio: 0.38, posicion: [5.6, 9.6, 8.4], inclinacion: 0, detalle: 2, color: (d) => (Math.sin(d.x * 13) * Math.sin(d.z * 11) > 0.3 ? 0x7e7266 : 0x9a8c7c) },
];

/** Hacia dónde cae la luz horneada en los planetas: desde abajo y desde el lado del jugador al empezar. */
const LUZ_PLANETAS = new THREE.Vector3(0.25, -0.55, 0.8).normalize();
/**
 * Brillo de los planetas: suave, para que las luces de los objetos expuestos sean siempre las más intensas. Cada cara
 * lleva su color casi entero (0–1, donde 1 es el color del planeta), con algo más de brillo en el lado que da al
 * resplandor del suelo, y `INTENSIDAD_PLANETA` lo multiplica: por debajo de 1 los planetas no florecen con el bloom,
 * que queda para los objetos. Cada planeta lleva además un halo tenue de su color (`ESCALA_HALO` veces su diámetro y
 * `FUERZA_HALO` de intensidad), y el más grande de algunos estilos alumbra la sala con una luz puntual de su color,
 * apenas perceptible: lo justo para teñir un poco el cohete y el suelo (`INTENSIDAD_LUZ_PLANETA` por metro de radio).
 */
const BRILLO_PLANETA_SOMBRA = 0.7;
const BRILLO_PLANETA_LUZ = 0.3;
const BRILLO_ANILLO_PLANETA = 0.85;
const INTENSIDAD_PLANETA = 0.7;
const ESCALA_HALO = 2.3;
const FUERZA_HALO = 0.14;
const INTENSIDAD_LUZ_PLANETA = 4;
/** Cuántos planetas decorativos se intentan colgar además de los del sistema solar: los que chocan con algo se descartan (cuelgan unos 33). */
const PLANETAS_DECORATIVOS = 48;

// Cascada de planetas decorativos ------------------------------------------

/** Ruido suave de senos sobre la esfera (−1 a 1): remolinos y manchas sin texturas. */
function remolino(d: THREE.Vector3, fase: number): number {
  return (
    Math.sin(d.x * 5 + d.y * 3 + fase) * 0.5 +
    Math.sin(d.y * 9 - d.z * 4 + fase * 1.7) * 0.3 +
    Math.sin(d.z * 13 + d.x * 7 - fase) * 0.2
  );
}

type ColorPlaneta = PlanetaColgante['color'];

/** Gigante gaseoso: bandas por latitud con ondulación. */
const gigante = (paleta: readonly number[]) => (fase: number, rnd: () => number): ColorPlaneta => {
  const franjas = 7 + Math.floor(rnd() * 6);
  return (d) => paleta[Math.floor(THREE.MathUtils.clamp((d.y + 0.1 * remolino(d, fase) + 1) / 2, 0, 0.999) * franjas) % paleta.length];
};
/** Mundo de hielo: remolinos blancos sobre azul. */
const hielo = (fase: number): ColorPlaneta => (d) => mezcla(0x2a63d8, 0xeaf4ff, THREE.MathUtils.smoothstep(remolino(d, fase), 0, 0.55));
/** Mundo de lava: amarillos y naranjas que hierven sobre rojo oscuro. */
const lava = (fase: number): ColorPlaneta => (d) => {
  const r = remolino(d, fase);
  return r > 0.45 ? 0xffe27a : r > 0.05 ? 0xff9a2e : r > -0.35 ? 0xe85a14 : 0x9c2a0c;
};
/** Mundo rocoso, de tierras claras y llanuras oscuras como la Luna. */
const roca = (fase: number): ColorPlaneta => (d) => {
  if (Math.sin(d.x * 23 + fase) * Math.sin(d.y * 19) * Math.sin(d.z * 21) > 0.3) return 0x8c8780;
  return remolino(d, fase) > 0.35 ? 0x5e5c59 : 0xaaa7a1;
};
/** Mundo de océanos turquesa y continentes violeta, con nubes y casquetes blancos: no se parece a la Tierra. */
const oceano = (fase: number): ColorPlaneta => (d) => {
  if (Math.abs(d.y) > 0.88 || remolino(d, fase + 2) > 0.62) return 0xeef4f8;
  return remolino(d, fase) > 0.3 ? 0x7a4fb8 : 0x1fa6b8;
};
/** Mundo apagado, casi negro azulado, como las esferas oscuras de la referencia: da contraste a los luminosos. */
const oscuro = (fase: number): ColorPlaneta => (d) => mezcla(0x0a0f22, 0x2b3768, THREE.MathUtils.smoothstep(remolino(d, fase), -0.2, 0.6));

/** Un estilo de planeta decorativo: cómo se colorea, si lleva anillos y qué luz da. */
interface EstiloDecorativo {
  /** Peso en el sorteo. */
  peso: number;
  /** Función de color, con una fase al azar para que no salgan dos iguales. */
  color: (fase: number, rnd: () => number) => ColorPlaneta;
  /** Colores de los dos anillos (el ancho y el fino), si puede llevarlos. */
  anillos?: readonly [number, number];
  /** Color de la luz que da el más grande de su estilo. */
  luz?: number;
}

const ESTILOS_DECORATIVOS: readonly EstiloDecorativo[] = [
  { peso: 3, color: gigante([0xe8e2cf, 0xb7c7e0, 0xf3ead2, 0x9db4d8, 0xe9dcc0]), anillos: [0xd9d2bc, 0xa8b8d0] },
  { peso: 2, color: gigante([0x2f4fd0, 0x3f64e0, 0x2a43b0, 0x5a7ef0]) },
  { peso: 2, color: gigante([0x7fd6d0, 0x5bb5c4, 0x9be3dc, 0x4a98b0]) },
  { peso: 2, color: gigante([0x8a5fd0, 0xb48be8, 0x6b46b8, 0xcaa6f0]), anillos: [0xcaa6f0, 0x8a5fd0], luz: 0xa070ff },
  { peso: 2, color: gigante([0xd98a6a, 0xf0b898, 0xb8654a, 0xe8a888]) },
  { peso: 3, color: hielo, luz: 0x4a86ff },
  { peso: 3, color: lava, luz: 0xff9a40 },
  { peso: 3, color: roca },
  { peso: 2, color: oceano },
  { peso: 3, color: oscuro },
];

/** Posiciones (x, z) de las tres vitrinas, las de `POSICION_VITRINA` en museo.ts: sus aros y cables llegan a 8.05 m. */
const VITRINAS_XZ: readonly (readonly [number, number])[] = [
  [-4.5, 3],
  [4.5, 3],
  [0, -10.5],
];
/** Peanas de los cohetes del fondo (Saturn V y Atlas V a 1:13): el más alto llega a unos 9.8 m. */
const COHETES_FONDO_XZ: readonly (readonly [number, number])[] = [
  [-6.5, -9],
  [6.5, -9],
];

interface Ocupado {
  x: number;
  y: number;
  z: number;
  r: number;
}

/** Hasta dónde llega un planeta desde su centro: su radio o, si lleva anillos, el de su anillo exterior (m). */
function alcance(p: PlanetaColgante): number {
  return p.radio * Math.max(1, ...(p.anillos ?? []).map((a) => a.r1));
}

/** ¿Cabe un planeta de alcance `r` en (x, y, z) sin chocar con nada de la sala ni con los que ya cuelgan? */
function cabe(x: number, y: number, z: number, r: number, ocupados: readonly Ocupado[]): boolean {
  const rh = Math.hypot(x, z);
  // Lejos del cohete central, de la pared y de la cúpula, y por encima de la cabeza del jugador.
  if (rh - r < 1.8 || rh + r > 14.2 || y - r < 6.6 || y + r > alturaCupula(rh + r) - 0.9) return false;
  // Lejos de los aros y cables de las vitrinas y de los cohetes del fondo.
  if (y - r < 8.8 && VITRINAS_XZ.some(([vx, vz]) => Math.hypot(x - vx, z - vz) < 3.4 + r)) return false;
  if (y - r < 10.4 && COHETES_FONDO_XZ.some(([cx, cz]) => Math.hypot(x - cx, z - cz) < 2.4 + r)) return false;
  // No se tocan entre sí, y el cable del de abajo no atraviesa al de arriba.
  return ocupados.every((o) => {
    const dh = Math.hypot(x - o.x, z - o.z);
    return Math.hypot(dh, y - o.y) > r + o.r + 0.7 && dh > (y > o.y ? r : o.r) + 0.15;
  });
}

/**
 * La cascada de planetas decorativos (inventados: no representan cuerpos reales), como la de la foto de referencia de
 * Henry. Cuelgan en una espiral que se ensancha hacia arriba alrededor del cohete: los pequeños abajo y los grandes
 * cerca de la cúpula. Las posiciones salen de un generador con semilla, así la sala se ve igual en cada carga.
 */
function crearCascada(fijos: readonly PlanetaColgante[]): PlanetaColgante[] {
  const rnd = azar(1114);
  const ocupados: Ocupado[] = fijos.map((p) => ({ x: p.posicion[0], y: p.posicion[1], z: p.posicion[2], r: alcance(p) }));
  const pesoTotal = ESTILOS_DECORATIVOS.reduce((suma, e) => suma + e.peso, 0);
  const hechos: { planeta: PlanetaColgante; estilo: EstiloDecorativo }[] = [];

  for (let k = 0; k < PLANETAS_DECORATIVOS; k++) {
    for (let intento = 0; intento < 160; intento++) {
      const u = (k + rnd()) / PLANETAS_DECORATIVOS; // 0 abajo, 1 arriba
      const radio = THREE.MathUtils.lerp(0.32, 2.0, u ** 0.9) * (0.75 + rnd() * 0.5);
      const angulo = u * Math.PI * 5.2 + (rnd() - 0.5) * 1.4;
      const distancia = THREE.MathUtils.lerp(4.0, 11.0, u) + (rnd() - 0.5) * 2.8;
      const x = Math.cos(angulo) * distancia;
      const z = Math.sin(angulo) * distancia - 1;
      const y = THREE.MathUtils.lerp(7.6, 16.8, u) + (rnd() - 0.5) * 2.0;

      let sorteo = rnd() * pesoTotal;
      const estilo = ESTILOS_DECORATIVOS.find((e) => (sorteo -= e.peso) < 0) ?? ESTILOS_DECORATIVOS[0];
      const anillos = estilo.anillos && radio > 0.8 && rnd() < 0.6 ? estilo.anillos : undefined;
      const planeta: PlanetaColgante = {
        radio,
        posicion: [x, y, z],
        inclinacion: (rnd() - 0.5) * 1.2,
        detalle: radio > 1.3 ? 3 : radio > 0.55 ? 2 : 1,
        color: estilo.color(rnd() * 6.3, rnd),
        ...(anillos ? { anillos: [{ r0: 1.3, r1: 1.9, color: anillos[0] }, { r0: 1.98, r1: 2.2, color: anillos[1] }] } : {}),
      };
      if (!cabe(x, y, z, alcance(planeta), ocupados)) continue;
      hechos.push({ planeta, estilo });
      ocupados.push({ x, y, z, r: alcance(planeta) });
      break;
    }
  }

  // El más grande de cada estilo con luz alumbra la sala con su color.
  for (const estilo of ESTILOS_DECORATIVOS) {
    if (estilo.luz === undefined) continue;
    const mayor = hechos.filter((h) => h.estilo === estilo).sort((a, b) => b.planeta.radio - a.planeta.radio)[0];
    if (mayor) mayor.planeta.luz = { color: estilo.luz, intensidad: INTENSIDAD_LUZ_PLANETA * mayor.planeta.radio };
  }
  return hechos.map((h) => h.planeta);
}

// Halos ---------------------------------------------------------------------

/** Direcciones de una esfera facetada, para promediar el color de un planeta. */
const MUESTRAS_ESFERA = new THREE.IcosahedronGeometry(1, 2).getAttribute('position');

/** Color medio de un planeta (promedio de su color en esas direcciones): el de su halo. */
function colorMedio(p: PlanetaColgante): THREE.Color {
  const d = new THREE.Vector3();
  const c = new THREE.Color();
  let [r, g, b] = [0, 0, 0];
  for (let i = 0; i < MUESTRAS_ESFERA.count; i++) {
    c.setHex(p.color(d.fromBufferAttribute(MUESTRAS_ESFERA, i).normalize()));
    r += c.r;
    g += c.g;
    b += c.b;
  }
  const n = MUESTRAS_ESFERA.count;
  return c.setRGB(r / n, g / n, b / n);
}

// El centro y el tamaño de cada halo salen de la matriz de su instancia, y su color, del color de la instancia. El
// cuadrado se abre en el plano de la vista, así que siempre mira a la cámara, y se apaga hacia el borde.
const HALO_VS = /* glsl */ `
  varying vec2 vPos;
  varying vec3 vTinte;
  void main() {
    vPos = position.xy * 2.0;
    #ifdef USE_INSTANCING_COLOR
      vTinte = instanceColor;
    #else
      vTinte = vec3(1.0);
    #endif
    vec4 centro = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    centro.xy += position.xy * length(instanceMatrix[0].xyz);
    gl_Position = projectionMatrix * centro;
  }
`;
const HALO_FS = /* glsl */ `
  varying vec2 vPos;
  varying vec3 vTinte;
  void main() {
    float a = max(0.0, 1.0 - length(vPos));
    gl_FragColor = vec4(vTinte * a * a, 1.0);
  }
`;

/**
 * Los halos de todos los planetas, en una sola malla instanciada (una llamada de dibujo): un resplandor aditivo del
 * color de cada planeta. El planeta tapa el centro de su halo, así que solo se ve el contorno.
 */
function crearHalos(planetas: readonly PlanetaColgante[]): THREE.InstancedMesh {
  const material = new THREE.ShaderMaterial({
    vertexShader: HALO_VS,
    fragmentShader: HALO_FS,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const malla = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), material, planetas.length);
  const matriz = new THREE.Matrix4();
  const sinGiro = new THREE.Quaternion();
  for (const [i, p] of planetas.entries()) {
    const lado = p.radio * 2 * ESCALA_HALO;
    malla.setMatrixAt(i, matriz.compose(new THREE.Vector3(...p.posicion), sinGiro, new THREE.Vector3(lado, lado, lado)));
    malla.setColorAt(i, colorMedio(p).multiplyScalar(FUERZA_HALO));
  }
  // La malla tiene que dibujarse siempre: el cuadrado se abre en el espacio de la vista, no en el del objeto.
  malla.frustumCulled = false;
  return malla;
}

/**
 * Los planetas colgantes (el sistema solar y la cascada decorativa), en un lote. El resplandor va horneado en el color
 * de cada cara, así que son emisivos y no dependen de las luces de la sala. No giran. Los halos y las luces de color
 * de los más grandes van aparte, en el mismo grupo.
 */
function crearPlanetasColgantes(): THREE.Group {
  const planetas = [...PLANETAS_SISTEMA_SOLAR, ...crearCascada(PLANETAS_SISTEMA_SOLAR)];
  const l = new Lote(false);
  const d = new THREE.Vector3();
  const iluminado = (hex: number, brillo: number): number => mezcla(0x000000, hex, brillo);
  for (const p of planetas) {
    const [x, y, z] = p.posicion;
    const r = Math.hypot(x, z);
    // Cable fino hasta la cúpula.
    l.pieza(tuboEntre([x, y + p.radio * 0.98, z], [x, alturaCupula(r) - 0.05, z], 0.012, 4, false), SALA.metal);
    // La luz, en los ejes del planeta inclinado: hacia la luz es el sentido contrario a LUZ_PLANETAS.
    const haciaLuz = LUZ_PLANETAS.clone().negate().applyEuler(new THREE.Euler(0, 0, -p.inclinacion));
    l.en([x, y, z], [0, 0, p.inclinacion], () => {
      l.emisiva(
        new THREE.IcosahedronGeometry(p.radio, p.detalle),
        (c) => {
          d.copy(c).normalize();
          return iluminado(p.color(d), BRILLO_PLANETA_SOMBRA + BRILLO_PLANETA_LUZ * Math.max(0, d.dot(haciaLuz)) ** 0.8);
        },
        INTENSIDAD_PLANETA,
        { v: 0.1 },
      );
      for (const anillo of p.anillos ?? []) {
        for (const giroAnillo of [-Math.PI / 2, Math.PI / 2]) {
          l.emisiva(new THREE.RingGeometry(p.radio * anillo.r0, p.radio * anillo.r1, 40), iluminado(anillo.color, BRILLO_ANILLO_PLANETA), INTENSIDAD_PLANETA, { r: [giroAnillo, 0, 0], v: 0.15 });
        }
      }
    });
  }
  const grupo = l.construir();
  grupo.add(crearHalos(planetas));
  for (const p of planetas) {
    if (!p.luz) continue;
    const luz = new THREE.PointLight(p.luz.color, p.luz.intensidad, 28, 1.6);
    luz.position.set(...p.posicion);
    grupo.add(luz);
  }
  return grupo;
}

// ---------------------------------------------------------------------------
// Cohete central
// ---------------------------------------------------------------------------

/**
 * Saturn V en el centro de la sala, como en la segunda referencia: peana negra de dos escalones, barandilla de cristal
 * y mesa de lanzamiento oscura. La base no lleva luz (pedido de Henry, 2026-11-14): ni anillos LED ni resplandor en el
 * suelo, y el cohete solo recibe la luz de los planetas colgantes.
 */
function crearCoheteCentral(l: Lote): void {
  l.pieza(new THREE.CylinderGeometry(2.95, 3.0, 0.5, 32), SALA.zocalo, { p: [0, 0.25, 0] });
  l.pieza(new THREE.CylinderGeometry(1.95, 2.05, 0.3, 24), SALA.marco, { p: [0, 0.65, 0] });

  // Barandilla de cristal con postes y pasamanos de metal.
  const rB = 2.82;
  const [yB0, yB1] = [0.5, 1.45];
  l.vidrio(new THREE.CylinderGeometry(rB, rB, yB1 - yB0, 32, 1, true), { p: [0, (yB0 + yB1) / 2, 0] });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    l.pieza(tuboEntre([Math.cos(a) * rB, yB0, Math.sin(a) * rB], [Math.cos(a) * rB, yB1 + 0.03, Math.sin(a) * rB], 0.022, 6), SALA.metal);
  }
  l.pieza(new THREE.TorusGeometry(rB, 0.03, 6, 48), SALA.metal, { p: [0, yB1 + 0.03, 0], r: [Math.PI / 2, 0, 0] });

  // Mesa de lanzamiento: placa oscura con cuatro soportes donde se apoya el cohete.
  l.pieza(cajaBiselada(1.9, 0.18, 1.9, 0.03), SALA.marco, { p: [0, ALTURA_MESA_COHETE - 0.09, 0] });
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i / 4) * Math.PI * 2;
    l.pieza(cajaBiselada(0.22, 0.3, 0.22, 0.02), SALA.zocalo, { p: [Math.cos(a) * 0.62, ALTURA_MESA_COHETE + 0.1, Math.sin(a) * 0.62] });
  }
  l.en([0, ALTURA_MESA_COHETE, 0], [0, Math.PI / 4, 0], () => crearSaturnV(l), [ESCALA_COHETE, ESCALA_COHETE, ESCALA_COHETE]);
}

// ---------------------------------------------------------------------------
// Pedestales con holograma y expositores
// ---------------------------------------------------------------------------

interface OpcionesPedestal {
  /** Radio del fuste (m). */
  radio: number;
  /** Altura de la cara superior, donde va el emisor (m). */
  altura: number;
  acento: number;
  /** Altura a la que flota la base del holograma (m). */
  alturaHolograma: number;
  /** Radio del haz donde llega al holograma (m). */
  radioHaz: number;
}

/**
 * Pedestal de proyector: fuste octogonal con un emisor en lo alto, anillos de color y un haz de luz que sube hasta el
 * holograma. El objeto no está aquí: lo añade quien llama (crearHolograma) sobre la altura `alturaHolograma`.
 */
function pedestalEnLote(l: Lote, o: OpcionesPedestal): void {
  const { radio: r, altura: h, acento, alturaHolograma: hh, radioHaz } = o;
  const octavo = Math.PI / 8;

  l.pieza(new THREE.CylinderGeometry(r * 1.45, r * 1.6, h * 0.1, 8), ARQ.ladrillo, { p: [0, h * 0.05, 0], r: [0, octavo, 0] });
  l.pieza(new THREE.CylinderGeometry(r * 0.88, r * 1.12, h * 0.74, 8), ARQ.violeta, { p: [0, h * 0.47, 0], r: [0, octavo, 0] });
  l.pieza(new THREE.CylinderGeometry(r * 1.12, r * 0.92, h * 0.1, 8), ARQ.purpura, { p: [0, h * 0.89, 0], r: [0, octavo, 0] });
  // Cabeza del proyector: aro oscuro con el emisor hundido en el centro.
  l.pieza(new THREE.CylinderGeometry(r * 1.12, r * 1.12, h * 0.03, 8), ARQ.oscuro, { p: [0, h * 0.965, 0], r: [0, octavo, 0] });
  l.pieza(new THREE.CylinderGeometry(r * 0.74, r * 0.74, h * 0.02, 16), ARQ.indigo, { p: [0, h * 0.99, 0] });
  l.emisiva(new THREE.TorusGeometry(r * 0.8, r * 0.025, 4, 24), acento, 2.6, { p: [0, h * 0.99, 0], r: [Math.PI / 2, 0, 0] });
  l.emisiva(new THREE.TorusGeometry(r * 0.46, r * 0.02, 4, 20), ARQ.cian, 2.8, { p: [0, h * 0.995, 0], r: [Math.PI / 2, 0, 0] });
  l.emisiva(new THREE.CylinderGeometry(r * 0.18, r * 0.18, h * 0.01, 12), 0xcff6ff, 3.2, { p: [0, h * 0.998, 0] });
  // Cuatro lentes del emisor alrededor, mirando hacia arriba.
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i / 4) * Math.PI * 2;
    l.emisiva(new THREE.BoxGeometry(r * 0.12, r * 0.05, r * 0.12), ARQ.cian, 3, { p: [Math.cos(a) * r * 0.62, h * 1.0, Math.sin(a) * r * 0.62], r: [0, -a, 0] });
  }
  // Franja luminosa del fuste y anillo de color en el suelo.
  l.emisiva(new THREE.TorusGeometry(r * 0.99, r * 0.018, 4, 24), acento, 2.2, { p: [0, h * 0.84, 0], r: [Math.PI / 2, 0, 0] });
  l.emisiva(new THREE.TorusGeometry(r * 1.9, r * 0.02, 4, 28), acento, 2.2, { p: [0, 0.04, 0], r: [Math.PI / 2, 0, 0] });
  charco(l, 0, 0, r * 3.2, acento, 0.34);

  // Haz del proyector: un tronco de cono casi transparente que se abre desde el emisor hasta el holograma.
  const largo = hh - h;
  l.aditiva(new THREE.CylinderGeometry(radioHaz, r * 0.5, largo, 28, 1, true), degradado(ARQ.cian, 0.004, 0.04, largo), { p: [0, h + largo / 2, 0] });
  // Plataforma de luz donde se apoya el holograma: disco tenue y aro fino.
  l.aditiva(new THREE.CircleGeometry(radioHaz, 32), (p) => tinte(ARQ.cian, 0.03 * Math.pow(Math.max(0, 1 - p.length() / radioHaz), 0.6)), {
    p: [0, hh + 0.01, 0],
    r: [-Math.PI / 2, 0, 0],
  });
  l.emisiva(new THREE.TorusGeometry(radioHaz, radioHaz * 0.008, 4, 40), ARQ.cian, 1.6, { p: [0, hh + 0.01, 0], r: [Math.PI / 2, 0, 0] });
}

// ---------------------------------------------------------------------------
// Instalación de artefacto: mostrador circular con paneles, holograma, corona de imágenes y anillo colgante
// ---------------------------------------------------------------------------

/** Mundo que muestran las imágenes de una instalación: donde trabajó el artefacto. */
export type TemaInstalacion = 'luna' | 'marte' | 'saturno';

interface ColoresTema {
  cielo: number;
  cieloBajo: number;
  suelo: number;
  sueloLejos: number;
  roca: number;
  /** Disco pequeño en el cielo de algunas imágenes (la Tierra vista desde la Luna); null si no hay. */
  astro: number | null;
  /** Si algunas imágenes llevan un vehículo blanco en el suelo (en Titán no hubo ninguno). */
  vehiculo: boolean;
}

/** Colores aproximados de cada mundo. Las imágenes son paisajes genéricos, no fotos ni lugares concretos. */
const TEMAS: Record<TemaInstalacion, ColoresTema> = {
  luna: { cielo: 0x04050a, cieloBajo: 0x090b12, suelo: 0x8f8c86, sueloLejos: 0x6c6a66, roca: 0x4a4845, astro: 0x3d7fd6, vehiculo: true },
  marte: { cielo: 0xc29870, cieloBajo: 0xd8b48c, suelo: 0xa4532c, sueloLejos: 0x7f3d22, roca: 0x5a2a18, astro: null, vehiculo: true },
  // Titán, donde se posó Huygens: neblina naranja y suelo pardo con guijarros claros de hielo.
  saturno: { cielo: 0xb5743a, cieloBajo: 0xcf9152, suelo: 0x7a5530, sueloLejos: 0x5f4328, roca: 0xb9a084, astro: null, vehiculo: false },
};

/** Radio exterior del mostrador (m). El jugador no puede atravesarlo. */
export const RADIO_MOSTRADOR = 2.0;
/** Lados del mostrador y de la corona de imágenes: un panel por cara. */
const LADOS_MOSTRADOR = 12;
const PASO_MOSTRADOR = (Math.PI * 2) / LADOS_MOSTRADOR;
/** Radio interior del tablero inclinado y alturas de sus bordes (m). */
const RADIO_TABLERO = 1.56;
const Y_TABLERO_DENTRO = 1.02;
const Y_TABLERO_FUERA = 0.85;
/** Corona de imágenes sobre el holograma (m). */
const RADIO_CORONA = 1.72;
const Y_CORONA = [3.4, 3.9] as const;
/** Anillo colgante del techo (m). */
const RADIO_ANILLO = 2.9;
const Y_ANILLO = 4.3;
/** Hasta dónde suben los cables (m). */
const Y_CABLES = 8.05;

/**
 * Paisaje de una imagen (plano de `ancho` × `alto` centrado en el origen): cielo, horizonte con lomas, suelo con
 * rocas y, en algunas, un vehículo blanco o un astro. Una cara por triángulo, como el resto del museo.
 */
function paisaje(tema: ColoresTema, k: number, ancho: number, alto: number): ColorCara {
  const rnd = azar(101 + k * 17);
  const fase = rnd() * 6.3;
  const base = 0.38 + rnd() * 0.14;
  const astro = tema.astro !== null && k % 3 === 0 ? { u: 0.2 + rnd() * 0.6, v: 0.78 } : null;
  const vehiculo = tema.vehiculo && k % 4 === 1 ? 0.3 + rnd() * 0.4 : null;
  return (c) => {
    const u = c.x / ancho + 0.5;
    const v = c.y / alto + 0.5;
    const horizonte = base + 0.07 * Math.sin(u * 5.5 + fase) + 0.04 * Math.sin(u * 13 + fase * 2);
    if (v > horizonte) {
      if (astro && Math.hypot((u - astro.u) * (ancho / alto), v - astro.v) < 0.09) return tema.astro ?? tema.cielo;
      return v < horizonte + 0.14 ? tema.cieloBajo : tema.cielo;
    }
    if (vehiculo !== null && Math.abs(u - vehiculo) < 0.11 && v > horizonte - 0.24 && v < horizonte - 0.08) return 0xdedad0;
    if (v > horizonte - 0.1) return tema.sueloLejos;
    return Math.sin(u * 31 + fase) * Math.sin(v * 23 - fase) > 0.55 ? tema.roca : tema.suelo;
  };
}

/** Una fila de "palabras" (barras finas) que llena `ancho`, centrada en x = 0, a la altura `y` del plano local. */
function renglon(l: Lote, ancho: number, y: number, alto: number, color: number, intensidad: number, rnd: () => number, z: number): void {
  let x = -ancho / 2;
  while (x < ancho / 2 - alto) {
    const largo = Math.min(alto * (1.2 + rnd() * 3.5), ancho / 2 - x);
    l.emisiva(new THREE.PlaneGeometry(largo, alto), color, intensidad, { p: [x + largo / 2, y, z] });
    x += largo + alto * 0.7;
  }
}

/** Coloca `fn` mirando hacia fuera en la cara `i` de un polígono de `lados` (su +Z apunta hacia fuera). */
function enCara(l: Lote, i: number, lados: number, fn: () => void, haciaDentro = false): void {
  const angulo = (i + 0.5) * ((Math.PI * 2) / lados);
  // segmentoAnillo usa (cos a, sin a): el centro de la cara mira a (cos a, 0, sin a), y el giro Y lleva +Z ahí.
  l.en([0, 0, 0], [0, Math.PI / 2 - angulo + (haciaDentro ? Math.PI : 0), 0], fn);
}

/** Panel gráfico de una cara del tablero (plano local XY, +Z hacia fuera). Claro u oscuro alternos. */
function panelTablero(l: Lote, i: number, tema: ColoresTema, acento: number, ancho: number, alto: number): void {
  const rnd = azar(31 + i * 7);
  const claro = i % 2 === 0;
  l.emisiva(new THREE.PlaneGeometry(ancho, alto), claro ? 0xe2e5ee : 0x1b2350, claro ? 0.85 : 1, { p: [0, 0, 0.004] });
  const texto = claro ? 0x2a2f45 : 0xc9d3f0;
  const z = 0.008;
  // Titular con el color de acento, imagen a un lado y texto al otro.
  l.emisiva(new THREE.PlaneGeometry(ancho * 0.55, alto * 0.08), acento, 1.1, { p: [-ancho * 0.18, alto * 0.38, z] });
  const izquierda = i % 3 !== 1;
  const xImagen = (izquierda ? -1 : 1) * ancho * 0.24;
  const [w, h] = [ancho * 0.42, alto * 0.5];
  l.emisiva(new THREE.PlaneGeometry(w, h, 8, 5), paisaje(tema, i + 40, w, h), 1, { p: [xImagen, -alto * 0.05, z] });
  for (let fila = 0; fila < 5; fila++) {
    l.en([-xImagen, alto * (0.17 - fila * 0.1), 0], [0, 0, 0], () => renglon(l, ancho * 0.4, 0, alto * 0.035, texto, 1, rnd, z));
  }
  renglon(l, ancho * 0.9, -alto * 0.4, alto * 0.03, texto, 1, rnd, z);
}

/**
 * Mostrador circular (como los de los acuarios y museos de ciencias): falda oscura con ondas, tablero inclinado con
 * paneles gráficos hacia fuera y un cuenco en el centro, de donde sale el emisor del holograma.
 */
function mostradorEnLote(l: Lote, tema: ColoresTema, acento: number): void {
  const n = LADOS_MOSTRADOR;
  const rFalda = [1.66, 1.96] as const;
  const yFalda = [0.08, Y_TABLERO_FUERA] as const;

  // Zócalo, falda y tablero. Las caras de CylinderGeometry caen en los mismos ángulos que las de segmentoAnillo.
  l.pieza(new THREE.CylinderGeometry(1.6, 1.62, 0.08, n), ARQ.oscuro, { p: [0, 0.04, 0] });
  l.pieza(new THREE.CylinderGeometry(rFalda[1], rFalda[0], yFalda[1] - yFalda[0], n, 1, true), ARQ.indigo, {
    p: [0, (yFalda[0] + yFalda[1]) / 2, 0],
  });
  l.pieza(new THREE.CylinderGeometry(RADIO_TABLERO, RADIO_MOSTRADOR, Y_TABLERO_DENTRO - Y_TABLERO_FUERA, n, 1, true), ARQ.oscuro, {
    p: [0, (Y_TABLERO_DENTRO + Y_TABLERO_FUERA) / 2, 0],
  });
  for (let i = 0; i < n; i++) {
    const a0 = i * PASO_MOSTRADOR;
    const a1 = a0 + PASO_MOSTRADOR;
    // Borde de luz del tablero, canto de madera del cuenco y su pared interior.
    l.emisiva(segmentoAnillo(RADIO_MOSTRADOR - 0.005, RADIO_MOSTRADOR + 0.02, a0, a1, Y_TABLERO_FUERA - 0.025, Y_TABLERO_FUERA), acento, 2.2);
    l.pieza(segmentoAnillo(RADIO_TABLERO - 0.1, RADIO_TABLERO + 0.03, a0, a1, 0.5, Y_TABLERO_DENTRO + 0.04), ARQ.cobre);
  }
  l.pieza(new THREE.CylinderGeometry(RADIO_TABLERO - 0.08, RADIO_TABLERO - 0.08, 0.04, n), ARQ.oscuro, { p: [0, 0.52, 0] });

  const cos = Math.cos(PASO_MOSTRADOR / 2);
  const sin = Math.sin(PASO_MOSTRADOR / 2);
  // Tablero: medidas de cada cara plana (apotemas y pendiente).
  const apoDentro = RADIO_TABLERO * cos;
  const apoFuera = RADIO_MOSTRADOR * cos;
  const subida = Y_TABLERO_DENTRO - Y_TABLERO_FUERA;
  const pendiente = Math.atan2(subida, apoFuera - apoDentro);
  const largoTablero = Math.hypot(subida, apoFuera - apoDentro);
  const anchoPanel = 2 * RADIO_TABLERO * sin * 0.92;
  // Falda: se abre hacia arriba.
  const apoFalda = [rFalda[0] * cos, rFalda[1] * cos] as const;
  const vuelo = Math.atan2(apoFalda[1] - apoFalda[0], yFalda[1] - yFalda[0]);
  const largoFalda = Math.hypot(apoFalda[1] - apoFalda[0], yFalda[1] - yFalda[0]);

  for (let i = 0; i < n; i++) {
    enCara(l, i, n, () => {
      // Panel sobre la cara inclinada: +Y local sube hacia el centro y +Z es la normal (fuera y arriba).
      l.en([0, (Y_TABLERO_DENTRO + Y_TABLERO_FUERA) / 2, (apoDentro + apoFuera) / 2], [pendiente - Math.PI / 2, 0, 0], () =>
        panelTablero(l, i, tema, acento, anchoPanel, largoTablero * 0.84),
      );
      // Ondas de cobre en la falda, continuas de una cara a la siguiente.
      l.en([0, (yFalda[0] + yFalda[1]) / 2, (apoFalda[0] + apoFalda[1]) / 2], [vuelo, 0, 0], () => {
        for (const [fila, y0] of [-0.24, -0.02, 0.2].entries()) {
          const pasos = 10;
          const anchoAqui = 2 * (rFalda[0] + ((y0 / largoFalda + 0.5) * (rFalda[1] - rFalda[0]))) * sin;
          const punto = (k: number): V3 => {
            const u = k / pasos;
            const x = (u - 0.5) * anchoAqui;
            const fase = (i + u) * Math.PI * 0.9 + fila * 1.3;
            return [x, y0 + 0.07 * Math.sin(fase) + 0.025 * Math.sin(fase * 2.3), 0.012];
          };
          for (let k = 0; k < pasos; k++) l.pieza(tuboEntre(punto(k), punto(k + 1), 0.011, 4), fila === 1 ? ARQ.lila : ARQ.cobre);
        }
      });
    });
  }
  // Luz de acento en el suelo alrededor del mostrador.
  l.emisiva(new THREE.TorusGeometry(RADIO_MOSTRADOR + 0.18, 0.02, 4, 48), acento, 2.2, { p: [0, 0.03, 0], r: [Math.PI / 2, 0, 0] });
  charco(l, 0, 0, RADIO_MOSTRADOR + 1.4, acento, 0.32);
}

/** Corona de imágenes que cuelga sobre el holograma: doce pantallas con paisajes del mundo del artefacto. */
function coronaEnLote(l: Lote, tema: ColoresTema): void {
  const n = LADOS_MOSTRADOR;
  const [y0, y1] = Y_CORONA;
  const apotema = RADIO_CORONA * Math.cos(PASO_MOSTRADOR / 2);
  const ancho = 2 * RADIO_CORONA * Math.sin(PASO_MOSTRADOR / 2) * 0.94;
  const alto = (y1 - y0) * 0.88;
  for (let i = 0; i < n; i++) {
    const a0 = i * PASO_MOSTRADOR;
    l.pieza(segmentoAnillo(RADIO_CORONA - 0.06, RADIO_CORONA, a0, a0 + PASO_MOSTRADOR, y0, y1), ARQ.oscuro);
    enCara(l, i, n, () => {
      l.emisiva(new THREE.PlaneGeometry(ancho, alto, 10, 6), paisaje(tema, i, ancho, alto), 1, { p: [0, (y0 + y1) / 2, apotema + 0.005] });
    });
  }
  // Sin bordes de luz: las pantallas se recortan solas sobre la banda oscura.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const [x, z] = [Math.cos(a) * (RADIO_CORONA - 0.03), Math.sin(a) * (RADIO_CORONA - 0.03)];
    l.pieza(tuboEntre([x, y1, z], [x, Y_CABLES, z], 0.008, 4, false), ARQ.oscuro);
  }
}

/** Anillo colgante: banda oscura con rótulo claro, banda clara tenue con rótulo oscuro y un filete de color. Sin LED por debajo. */
function anilloColganteEnLote(l: Lote, acento: number): void {
  const n = 24;
  const paso = (Math.PI * 2) / n;
  const r = RADIO_ANILLO;
  const grueso = 0.06;
  const y = Y_ANILLO;
  const cos = Math.cos(paso / 2);
  const rnd = azar(53);
  for (let i = 0; i < n; i++) {
    const a0 = i * paso;
    const a1 = a0 + paso;
    l.pieza(segmentoAnillo(r - 0.42, r, a0, a1, y, y + 0.06), ARQ.oscuro);
    l.emisiva(segmentoAnillo(r - grueso, r, a0, a1, y + 0.06, y + 0.32), 0xe6eaf2, 0.16);
    l.pieza(segmentoAnillo(r - grueso, r, a0, a1, y + 0.32, y + 0.7), ARQ.indigo);
    l.emisiva(segmentoAnillo(r - grueso - 0.002, r + 0.002, a0, a1, y + 0.315, y + 0.335), acento, 1.1);
    // Rótulos por fuera (lado cercano) y por dentro (lado lejano). Barras sin texto real.
    const ancho = 2 * r * Math.sin(paso / 2) * 0.98;
    for (const [dentro, apo] of [
      [false, r * cos + 0.004],
      [true, -(r - grueso) * cos + 0.004],
    ] as const) {
      enCara(l, i, n, () => {
        if (i % 6 !== 5) renglon(l, ancho, y + 0.19, 0.075, 0x1d2550, 1, rnd, apo);
        if (i % 3 !== 2) renglon(l, ancho, y + 0.52, 0.11, 0xdfe6ff, 1.05, rnd, apo);
      }, dentro);
    }
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + paso / 2;
    const [x, z] = [Math.cos(a) * (r - grueso / 2), Math.sin(a) * (r - grueso / 2)];
    l.pieza(tuboEntre([x, y + 0.7, z], [x, Y_CABLES, z], 0.008, 4, false), ARQ.oscuro);
  }
}

/**
 * Instalación de un artefacto seleccionable: mostrador circular con paneles, el artefacto como holograma azul que
 * flota sobre el centro y gira despacio, una corona de imágenes encima y un anillo colgante con rótulos y LED. El
 * cursor solo prueba contra un volumen invisible. `userData.actualizar(t)` anima el holograma.
 */
export function crearInstalacionHolograma(
  contenido: (l: Lote) => void,
  tema: TemaInstalacion,
  acento: number,
  giro: number,
  escala = 1,
): THREE.Object3D {
  const colores = TEMAS[tema];
  const l = new Lote();
  mostradorEnLote(l, colores, acento);
  pedestalEnLote(l, { radio: 0.42, altura: Y_TABLERO_DENTRO, acento, alturaHolograma: ALTURA_HOLOGRAMA, radioHaz: 1.15 });
  coronaEnLote(l, colores);
  anilloColganteEnLote(l, acento);
  const grupo = l.construir();
  grupo.traverse((objeto) => {
    objeto.raycast = () => {};
  });

  const holograma = crearHolograma(contenido, { giro, escala });
  holograma.position.y = ALTURA_HOLOGRAMA;
  grupo.add(holograma);
  grupo.userData.actualizar = holograma.userData.actualizar;

  // Luz azul sobre el holograma: tiñe el suelo y el mostrador, sin iluminar el modelo (que es luz pura).
  const luz = new THREE.PointLight(0x62c8ff, INTENSIDAD_LUZ_VITRINA, LADO_VITRINA * 2.5, 1.7);
  luz.position.set(0, ALTURA_HOLOGRAMA + 0.4, 0);
  grupo.add(luz);

  const alto = ALTURA_HOLOGRAMA + 2.2;
  const volumen = new THREE.Mesh(
    new THREE.BoxGeometry(LADO_VITRINA, alto, LADO_VITRINA),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  volumen.position.y = alto / 2;
  grupo.add(volumen);
  return grupo;
}

/** Cápsula de cristal con un traje vacío dentro. */
function capsula(l: Lote, comandante: boolean, acento: number): void {
  const alto = 2.5;
  const radio = 0.82;
  l.pieza(new THREE.CylinderGeometry(radio + 0.2, radio + 0.3, 0.3, 12), ARQ.violeta, { p: [0, 0.15, 0] });
  l.pieza(new THREE.CylinderGeometry(radio + 0.3, radio + 0.3, 0.04, 12), ARQ.cobre, { p: [0, 0.31, 0] });
  l.emisiva(new THREE.TorusGeometry(radio + 0.08, 0.02, 4, 16), acento, 3, { p: [0, 0.34, 0], r: [Math.PI / 2, 0, 0] });
  l.vidrio(new THREE.CylinderGeometry(radio, radio, alto, 12, 1, true), { p: [0, 0.33 + alto / 2, 0] });
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i / 4) * Math.PI * 2;
    l.pieza(new THREE.BoxGeometry(0.1, alto, 0.1), ARQ.oscuro, { p: [Math.cos(a) * (radio + 0.02), 0.33 + alto / 2, Math.sin(a) * (radio + 0.02)], r: [0, -a, 0] });
    l.emisiva(new THREE.BoxGeometry(0.02, alto, 0.02), ARQ.cian, 2.4, { p: [Math.cos(a) * (radio - 0.05), 0.33 + alto / 2, Math.sin(a) * (radio - 0.05)] });
  }
  l.pieza(new THREE.CylinderGeometry(radio * 0.82, radio + 0.14, 0.3, 12), ARQ.purpura, { p: [0, 0.33 + alto + 0.15, 0] });
  l.emisiva(new THREE.CylinderGeometry(radio * 0.6, radio * 0.6, 0.02, 12), acento, 1.4, { p: [0, 0.33 + alto - 0.01, 0] });
  l.aditiva(new THREE.CylinderGeometry(radio - 0.02, radio - 0.02, alto, 12, 1, true), degradado(acento, 0.035, 0.008, alto), { p: [0, 0.33 + alto / 2, 0] });
  charco(l, 0, 0, 2.3, acento, 0.28);
  l.en([0, 0.33, 0], [0, 0, 0], () => crearTrajeApollo(l, comandante));
}

/** Peana con un cohete a escala, anillo de color y torre de servicio de cobre. */
function expositorCohete(l: Lote, cohete: () => void, altura: number, acento: number): void {
  l.pieza(new THREE.CylinderGeometry(1.25, 1.4, 0.34, 10), ARQ.ladrillo, { p: [0, 0.17, 0] });
  l.pieza(new THREE.CylinderGeometry(1.0, 1.08, 0.3, 10), ARQ.violeta, { p: [0, 0.49, 0] });
  l.emisiva(new THREE.TorusGeometry(1.2, 0.022, 4, 24), acento, 3, { p: [0, 0.36, 0], r: [Math.PI / 2, 0, 0] });
  l.emisiva(new THREE.TorusGeometry(1.55, 0.026, 4, 24), acento, 3, { p: [0, 0.04, 0], r: [Math.PI / 2, 0, 0] });
  charco(l, 0, 0, 3.6, acento, 0.32);
  // La torre va detrás, sin tocar el cohete: es mobiliario del museo, no una réplica de la torre real.
  const x = -0.95;
  const z = -0.72;
  for (const [dx, dz] of [
    [-0.15, -0.15],
    [0.15, -0.15],
    [0.15, 0.15],
    [-0.15, 0.15],
  ]) {
    l.pieza(tuboEntre([x + dx, 0.34, z + dz], [x + dx, altura + 0.3, z + dz], 0.018, 4), ARQ.cobre);
  }
  for (let y = 0.8; y < altura + 0.3; y += 0.7) {
    l.pieza(new THREE.BoxGeometry(0.34, 0.03, 0.34), ARQ.ladrillo, { p: [x, y, z] });
  }
  l.emisiva(new THREE.IcosahedronGeometry(0.035, 0), ARQ.ladrilloClaro, 4, { p: [x, altura + 0.34, z] });
  l.en([0, 0.64, 0], [0, 0, 0], cohete);
}

/** Globo facetado sobre peana. */
function expositorGlobo(l: Lote, radio: number, color: ColorCara, acento: number): void {
  l.pieza(new THREE.CylinderGeometry(0.62, 0.74, 0.28, 8), ARQ.ladrillo, { p: [0, 0.14, 0] });
  l.pieza(new THREE.CylinderGeometry(0.38, 0.52, 0.72, 8), ARQ.violeta, { p: [0, 0.64, 0] });
  l.pieza(new THREE.CylinderGeometry(0.46, 0.38, 0.1, 8), ARQ.cobre, { p: [0, 1.05, 0] });
  l.emisiva(new THREE.TorusGeometry(0.56, 0.018, 4, 16), acento, 3, { p: [0, 1.08, 0], r: [Math.PI / 2, 0, 0] });
  l.emisiva(new THREE.TorusGeometry(0.86, 0.018, 4, 20), acento, 3, { p: [0, 0.04, 0], r: [Math.PI / 2, 0, 0] });
  charco(l, 0, 0, 1.9, acento, 0.3);
  l.pieza(new THREE.IcosahedronGeometry(radio, 2), color, { p: [0, 1.14 + radio, 0], v: 0.16 });
}

/** Coloca `fn` en (x, z), girado para mirar hacia el centro de la sala (su +Z apunta al centro). */
function mirandoAlCentro(l: Lote, x: number, z: number, fn: () => void): void {
  l.en([x, 0, z], [0, Math.atan2(-x, -z), 0], fn);
}

/** La sala completa con su decoración. Lo seleccionable (vitrinas de artefacto) va aparte, en sus propios nodos. */
export function crearRotonda(): THREE.Object3D {
  const l = new Lote();
  crearSuelo(l);
  crearParedes(l);
  crearTecho(l);
  crearCoheteCentral(l);

  // Cohetes reales a la misma escala 1:13, al fondo de la sala.
  l.en([-6.5, 0, -9], [0, 0.5, 0], () => expositorCohete(l, () => crearSaturnV(l), 9.1, ARQ.violeta));
  l.en([6.5, 0, -9], [0, -0.5, 0], () => expositorCohete(l, () => crearAtlasV541(l), 5.1, ARQ.ambar));

  // Globos de los dos mundos de las misiones, con colores aproximados a los reales.
  l.en([-9.4, 0, 6.3], [0, 0, 0], () =>
    expositorGlobo(l, 0.72, (c) => (Math.sin(c.x * 6.1 + c.y * 3.2) + Math.sin(c.z * 5.3 - c.y * 4.1) > 0.8 ? 0x6e6a66 : 0xa8a49c), ARQ.cian),
  );
  l.en([9.4, 0, 6.3], [0, 0, 0], () =>
    expositorGlobo(l, 0.62, (c) => (c.y > 0.5 ? 0xefe7dc : Math.sin(c.x * 7 + c.z * 4) > 0.35 ? 0x7f3a22 : 0xc1502e), ARQ.ambar),
  );

  // Trajes de Apollo 17 en cápsulas: el del comandante lleva franjas rojas. Sin figuras humanas (spec visual §4).
  mirandoAlCentro(l, 10.1, -3.4, () => capsula(l, true, ARQ.cian));
  mirandoAlCentro(l, 11.1, 0.6, () => capsula(l, false, ARQ.ambar));

  // Laboratorio: consolas en arco al oeste y al sur.
  mirandoAlCentro(l, -11.1, -2.2, () => crearConsola(l, 1));
  mirandoAlCentro(l, -10.1, -5.6, () => crearConsola(l, 2));
  mirandoAlCentro(l, -8.2, 10.1, () => crearConsola(l, 3));
  mirandoAlCentro(l, -11.0, 7.5, () => crearConsola(l, 4));

  // Muestras de roca en pedestales pequeños, como hologramas. No son seleccionables.
  const muestras: { objeto: THREE.Object3D; x: number; z: number }[] = [];
  for (const [x, z, semilla, color, acento, giro] of [
    [-2.9, -5.4, 4, 0x8a857c, ARQ.cian, 0],
    [2.9, -5.4, 8, 0x8c4a30, ARQ.ambar, 1.7],
  ] as const) {
    l.en([x, 0, z], [0, 0, 0], () => {
      pedestalEnLote(l, { radio: 0.3, altura: 0.8, acento, alturaHolograma: 1.2, radioHaz: 0.5 });
    });
    muestras.push({ objeto: crearHolograma((lote) => crearMuestraRoca(lote, semilla, color), { giro }), x, z });
  }

  // Equipo y torre de comunicaciones cerca de la pared sureste.
  l.en([10.2, 0, 9.0], [0, 0, 0], () => crearTorre(l));
  const cajas: [number, number, number, number, number][] = [
    [8.0, 11.3, 0.6, ARQ.ladrillo, ARQ.cian],
    [6.6, 12.2, 0.2, ARQ.purpura, ARQ.ambar],
    [13.2, 5.6, 1.1, ARQ.cobre, ARQ.cian],
    [-13.6, 3.3, -1.3, ARQ.ladrillo, ARQ.ambar],
    [-13.4, -7.1, -0.5, ARQ.purpura, ARQ.cian],
    [12.6, -7.7, 0.9, ARQ.ladrillo, ARQ.ambar],
  ];
  for (const [x, z, giro, color, acento] of cajas) {
    l.en([x, 0, z], [0, giro, 0], () => crearCaja(l, color, acento));
  }

  const grupo = l.construir();
  const hologramas = muestras.map(({ objeto, x, z }) => {
    objeto.position.set(x, 1.2, z);
    grupo.add(objeto);
    return objeto;
  });
  // Luz neutra compartida por las dos cápsulas, para que los trajes se vean blancos.
  const luzTrajes = new THREE.PointLight(0xffffff, INTENSIDAD_LUZ_TRAJES, 7, 1.7);
  luzTrajes.position.set(9.7, 2.9, -1.2);
  grupo.add(crearPlanetasColgantes(), luzTrajes);
  grupo.userData.actualizar = (t: number): void => {
    for (const h of hologramas) h.userData.actualizar(t);
  };
  return grupo;
}
