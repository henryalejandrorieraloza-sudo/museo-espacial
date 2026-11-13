// Sitio de aterrizaje de Apollo 17 en Taurus-Littrow: posiciones de la escena lunar y datos verificados.
// Sin Three.js a propósito: lo comparten la escena (visual/lunaEscena.ts) y la lógica de la misión (game/luna.ts).
//
// Ejes de la escena: +X = este, −Z = norte, +Y = arriba, en metros. Origen: centro del LM Challenger, sobre el suelo.
// Azimut: grados desde el norte hacia el este (convención del ALSJ). El rumbo del LRV en game/luna.ts usa la misma
// convención (0 = −Z = norte, positivo = a la derecha), así que rumbo y azimut son el mismo número.
//
// Fuentes:
// - ALSJ, "Sun and Earth: Altitudes and Azimuths" (Scotti y Fjeld): https://www.nasa.gov/history/alsj/alsj-EarthSun_AltAz.html
// - ALSJ, Apollo 17 Image Library (rumbo y distancia del navegador del LRV, posición final del LRV vista por LRO).
// - ALSJ, "Geology Station 1 near Steno Crater" (a17.sta1.html): parada a ~150 m de Steno, cráter fresco de ~20 m.
// - LROC (ASU), imagen 417 "Just Another Crater?": Shorty, 110 m de diámetro, ~7 km al oeste del LM.

/** Radio medio de la Luna (m). */
export const RADIO_LUNA_M = 1_737_400;
/** Altura de los ojos del jugador de pie (m). Igual que ALTURA_OJOS en visual/museo.ts. */
export const ALTURA_OJOS_M = 1.6;

export interface PuntoSuelo {
  x: number;
  z: number;
}

/** Punto a `distancia` metros del origen (o de `desde`) en la dirección `azimut` (°). */
export function enAzimut(azimut: number, distancia: number, desde: PuntoSuelo = { x: 0, z: 0 }): PuntoSuelo {
  const a = (azimut * Math.PI) / 180;
  return { x: desde.x + Math.sin(a) * distancia, z: desde.z - Math.cos(a) * distancia };
}

/** Azimut (°, 0–360) de `b` visto desde `a`. */
export function azimutEntre(a: PuntoSuelo, b: PuntoSuelo): number {
  const g = (Math.atan2(b.x - a.x, -(b.z - a.z)) * 180) / Math.PI;
  return (g + 360) % 360;
}

/**
 * LRV estacionado junto al LM, recién desplegado (la escena es 1 h después del inicio de la EVA-1).
 * // VERIFICAR: no hay una posición publicada para este momento; se coloca a ~9 m del LM, fuera de las patas.
 */
const POSICION_LRV: PuntoSuelo = { x: 7, z: 5 };

/** Llegada del jugador: a ~13 m del LRV y del LM, mirando casi de frente al LRV (azimut 198°) con el LM a la vista. */
export const LLEGADA = { x: 11, z: -7, azimutMirada: 205 } as const;

/** Origen de la escena: centro del LM. */
const ORIGEN_LM = { x: 0, z: 0 } as const;

/**
 * Azimut (°) desde el LM hacia la llegada del jugador. La bahía del LRV mira hacia aquí (el LRV sale hacia el
 * jugador). Decisión de juego: se sacrifica la orientación del LM tras el aterrizaje (ver LM).
 */
export const AZIMUT_BAHIA_LRV = azimutEntre(ORIGEN_LM, LLEGADA);

/** La bahía de equipos está a este ángulo del frente del LM, hacia la izquierda (en Apollo 17: frente 270°, bahía 225°). */
const DESVIO_BAHIA_RESPECTO_FRENTE_LM = 45;

/**
 * LM Challenger. Sitio del ALSJ: 20.1653° N, 30.7658° E.
 * El frente (escotilla, plataforma y escalera de la pata 1) se deriva de la bahía, que apunta a la llegada del
 * jugador: el frente queda a DESVIO_BAHIA_RESPECTO_FRENTE_LM grados de la bahía. Original del ALSJ: frente al oeste
 * (270°), bahía a 225°. // VERIFICAR: la orientación real del LM tras el aterrizaje; el juego la cambia a propósito.
 */
export const LM = { x: 0, z: 0, azimutFrente: AZIMUT_BAHIA_LRV + DESVIO_BAHIA_RESPECTO_FRENTE_LM } as const;

/**
/**
 * Estación 1. Real: a 1.11 km del transmisor SEP con rumbo de vuelta 346° (navegador del LRV, ALSJ), es decir,
 * hacia el azimut ~166°, y a ~150 m del borde de Steno. Allí tomaron muestras en un cráter fresco de ~20 m de
 * diámetro y 3–4 m de profundidad, con bloques en el borde.
 *
 * SIMPLIFICACIÓN INTERACTIVA (no es la geografía real): en el juego, ese cráter y la roca con halo están a ~45 m
 * del LRV en esa dirección, para no conducir 1 km. Steno sí se dibuja en su sitio aproximado, más lejos.
 */
export const ESTACION1_CRATER = { ...enAzimut(168, 42, POSICION_LRV), diametro: 20, profundidad: 3.5 } as const;
/**
 * Suelo naranja de la estación 1 con el halo azul celeste (antes una roca): en el borde suroeste del cráter compacto,
 * a ~48 m del LRV (la roca estaba a ~32 m). El nombre se conserva por las referencias de la lógica del juego.
 */
export const ROCA_ESTACION1 = enAzimut(230, 11.5, ESTACION1_CRATER);

/** El LRV aparca apuntando a la roca (~174°, hacia el sur): se llega con solo avanzar recto. */
export const LRV_ESTACIONADO = { ...POSICION_LRV, rumbo: azimutEntre(POSICION_LRV, ROCA_ESTACION1) } as const;

/**
 * Steno: ~520–600 m de diámetro (Wikipedia: 520 m; Apollo 17 Preliminary Science Report: ~600 m).
 * Centro estimado: estación 1 (1.11 km a ~166°) más ~150 m hasta el borde y el radio, hacia el sureste.
 * // VERIFICAR: posición del centro y profundidad (se usa d/D = 0.15, típica de un cráter simple degradado).
 */
export const STENO = { ...enAzimut(159, 1500), diametro: 560, profundidad: 84 } as const;

/**
 * Shorty (estación 4, suelo naranja): 110 m de diámetro, ~14 m de profundidad, ~7 km al oeste del LM (LROC).
 * Queda más allá del horizonte (~2.4 km a la altura de los ojos), así que desde el LM no se ve. Además, el suelo
 * naranja no estaba a la vista: Schmitt lo descubrió bajo la capa gris al cavar una zanja en el borde.
 * // VERIFICAR: azimut exacto (oeste-suroeste).
 */
export const SHORTY = { ...enAzimut(255, 7000), diametro: 110, profundidad: 14 } as const;

/** Posición final del LRV al terminar la EVA-3 (sombra vista por LRO): 128 m del LM, azimut 112°. No se usa en la escena. */
export const LRV_FINAL_EVA3 = enAzimut(112, 128);

/**
 * Macizos y relieve lejano. Se dibujan en su azimut, más allá del horizonte. Altura sobre el fondo del valle (m).
 * - Macizo Sur: ~2.3 km de altura y ~7 km de base (LROC).
 * - Family Mountain: "colina de un kilómetro de altura" que bloquea en parte la salida del valle (ALSJ, a17.site).
 * - Escarpe Lee-Lincoln: hasta ~80 m de altura, entre los macizos norte y sur, al oeste (ALSJ).
 * - Estación 6, al pie del Macizo Norte: a 3.5 km del LM (ALSJ).
 * Las alturas sin fuente directa y todas las distancias de la base van marcadas // VERIFICAR.
 */
export interface Macizo {
  nombre: string;
  /** Azimut de inicio y fin (°), en sentido horario. */
  azimutDesde: number;
  azimutHasta: number;
  /** Distancia del LM al pie y a la cima (m). */
  distanciaPie: number;
  distanciaCima: number;
  /** Altura de la cima sobre el valle (m). */
  altura: number;
  semilla: number;
}

export const MACIZOS: readonly Macizo[] = [
  // VERIFICAR: altura del Macizo Norte (~2 km) y sus azimuts. Pie a 3.5 km (estación 6, ALSJ).
  { nombre: 'Macizo Norte', azimutDesde: 312, azimutHasta: 392, distanciaPie: 3500, distanciaCima: 6000, altura: 2000, semilla: 11 },
  // VERIFICAR: altura, azimuts y distancias de las Colinas Esculpidas.
  { nombre: 'Colinas Esculpidas', azimutDesde: 30, azimutHasta: 86, distanciaPie: 4500, distanciaCima: 7500, altura: 1300, semilla: 23 },
  // VERIFICAR: altura, azimuts y distancias del Macizo Este. Se aleja del Sol (azimut 96.8°, altura 15.7°) para no taparlo.
  { nombre: 'Macizo Este', azimutDesde: 104, azimutHasta: 152, distanciaPie: 7000, distanciaCima: 10500, altura: 2000, semilla: 37 },
  // Altura de ~2.3 km (LROC). VERIFICAR: azimuts y distancia del pie.
  { nombre: 'Macizo Sur', azimutDesde: 172, azimutHasta: 250, distanciaPie: 5000, distanciaCima: 7600, altura: 2300, semilla: 41 },
  // Altura de ~1 km (ALSJ). VERIFICAR: azimuts y distancia.
  { nombre: 'Family Mountain', azimutDesde: 274, azimutHasta: 302, distanciaPie: 6500, distanciaCima: 8500, altura: 1000, semilla: 53 },
  // Escarpe Lee-Lincoln, ~80 m (ALSJ). VERIFICAR: azimuts y distancia.
  { nombre: 'Escarpe Lee-Lincoln', azimutDesde: 238, azimutHasta: 330, distanciaPie: 4200, distanciaCima: 4700, altura: 80, semilla: 67 },
];

/**
 * Radio alrededor del LM (m) en el que se puede conducir el LRV y caminar a pie: el mismo límite para los dos.
 * El detalle del suelo se concentra cerca del LM. Decisión de juego.
 */
export const RADIO_LRV_M = 260;

/** Obstáculos circulares para el jugador a pie (m): el LM (etapa de descenso) y el LRV cuando no va sentado. */
export const RADIO_OBSTACULO_LM_M = 2.6;
export const RADIO_OBSTACULO_LRV_M = 1.7;
