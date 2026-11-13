// Despliegue del LRV de Apollo 17 desde el módulo lunar: la secuencia real y su versión acortada para el juego.
// Sin Three.js a propósito: lo comparten la lógica (game/despliegueLRV.ts) y la animación (visual/despliegueLRV.ts).
//
// Fuentes:
// - ALSJ, Apollo 17, "Rover Deployment" (a17.lrvdep.html, comentario de Eric M. Jones a partir del Rover Handbook,
//   las listas de comprobación y el vídeo del despliegue de Apollo 15). De ahí salen los tiempos GET, los ángulos
//   (4°, 15°, 45°, 73° y ~30°) y el cuadrante suroeste.
// - ALSJ, Apollo 17, "Loading the Rover" (a17.lrvload.html): la LCRU, las antenas, la cámara de TV y el geopallet
//   se montaron después del despliegue y de la prueba de manejo.
// - NSSDC, "The Apollo Lunar Roving Vehicle": chasis en tres secciones plegado en la bahía del cuadrante 1 con la
//   parte de abajo hacia fuera; poleas, carretes con freno, cuerdas y cintas de tela.
//
// En la misión real, de soltar el carro (117:26:29) a la prueba de manejo (117:47:50) pasaron unos 21 minutos, y la
// carga del equipo llevó bastante más. El juego lo acorta a DURACION_DESPLIEGUE_LRV_S segundos, con las mismas fases
// y en el mismo orden.

/** Fases del despliegue, en orden. */
export type FaseDespliegueLRV =
  /** 117:26:29. Schmitt, desde la escalera, tira de la anilla en D: la parte de arriba del carro se separa ~4°. */
  | 'liberacion'
  /** 117:27:10–117:27:43. Cernan tira de la cinta derecha y el carro gira hacia fuera sobre su extremo de abajo. */
  | 'inclinacion'
  /** 117:27:43–117:27:50. A 45°: el chasis trasero cae y se traba, las ruedas traseras saltan y el delantero gira 45°. */
  | 'chasisTrasero'
  /** 117:28:15–117:29:02. Ruedas traseras al suelo; a 73° se abre el delantero y se traban las ruedas delanteras. */
  | 'bajadaTrasera'
  /** 117:30:52–117:32:00. Con la cinta izquierda, Schmitt baja el frente hasta que las ruedas delanteras tocan el suelo. */
  | 'bajadaDelantera'
  /** 117:33:19–117:34:21. Sacan los pasadores, sueltan la silla ("saddle"), lo apartan y lo alinean hacia el este. */
  | 'retiro'
  /** 117:34:24–117:41:47. Guardabarros extendidos, asientos levantados, consola bajada y reposapiés arriba. */
  | 'preparacion'
  /** 117:46–117:48. Encendido y prueba de manejo de Cernan alrededor del LM. */
  | 'pruebaManejo'
  /** Después de la prueba ("Loading the Rover"): LCRU, antenas, cámara de TV y geopallet con las herramientas. */
  | 'carga';

/**
 * Duración de cada fase en el juego (s). Son decisiones de ritmo, no datos: la suma (44.5 s) cabe en los 30–45 s
 * pedidos. Las fases que en la realidad fueron rápidas (la caída del chasis trasero a 45°) son también las cortas.
 * El mentor cuenta el despliegue en seis frases (game/juego.ts), cada una con tiempo para terminar.
 */
export const FASES_DESPLIEGUE_LRV: readonly { readonly fase: FaseDespliegueLRV; readonly duracionS: number }[] = [
  { fase: 'liberacion', duracionS: 2 },
  { fase: 'inclinacion', duracionS: 5 },
  { fase: 'chasisTrasero', duracionS: 2.5 },
  { fase: 'bajadaTrasera', duracionS: 6 },
  { fase: 'bajadaDelantera', duracionS: 4.5 },
  { fase: 'retiro', duracionS: 3 },
  { fase: 'preparacion', duracionS: 5.5 },
  { fase: 'pruebaManejo', duracionS: 11.5 },
  { fase: 'carga', duracionS: 4.5 },
];

/** Duración total del despliegue en el juego (s). */
export const DURACION_DESPLIEGUE_LRV_S = FASES_DESPLIEGUE_LRV.reduce((suma, f) => suma + f.duracionS, 0);

/**
 * Bahía del LRV: azimut desde el LM (°) hacia la llegada del jugador. Se define en sitioApollo17.ts, junto al frente
 * del LM que se deriva de él.
 */
export { AZIMUT_BAHIA_LRV } from './sitioApollo17';


/** Ángulos de giro del chasis central desde su posición guardada (°), según el ALSJ. */
export const GIRO_LIBERACION_GRADOS = 4;
/** A partir de aquí las "walking hinges" desplazan el eje de giro hacia fuera y el carro sale de la bahía. */
export const GIRO_BISAGRAS_ANDANTES_GRADOS = 15;
/** Aquí cae el chasis trasero, saltan las ruedas traseras y el delantero gira 45°. */
export const GIRO_CHASIS_TRASERO_GRADOS = 45;
/** Aquí el chasis delantero empieza a abrirse otra vez. */
export const GIRO_CHASIS_DELANTERO_GRADOS = 73;
/** Con las ruedas traseras en el suelo, el carro cuelga a ~30° del suelo: 90° + 30° desde la vertical. */
export const GIRO_COLGADO_GRADOS = 120;

/** Fase en curso a los `tiempoS` segundos del despliegue y su avance (0–1). Después del final, la última con 1. */
export function faseDespliegueEn(tiempoS: number): { fase: FaseDespliegueLRV; indice: number; avance: number } {
  let inicio = 0;
  for (let i = 0; i < FASES_DESPLIEGUE_LRV.length; i++) {
    const { fase, duracionS } = FASES_DESPLIEGUE_LRV[i];
    if (tiempoS < inicio + duracionS) return { fase, indice: i, avance: Math.max(0, (tiempoS - inicio) / duracionS) };
    inicio += duracionS;
  }
  const ultima = FASES_DESPLIEGUE_LRV.length - 1;
  return { fase: FASES_DESPLIEGUE_LRV[ultima].fase, indice: ultima, avance: 1 };
}
