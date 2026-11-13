// Cinemática final de la misión lunar: el despegue del LM visto por la cámara de TV del LRV y desde el propio módulo
// de ascenso, y el LRV que se queda solo. Lógica pura, sin Three.js ni DOM (salvo localStorage para reanudar): recorre
// la línea de tiempo de cinematicaDespegue.json y dice, en cada instante, qué toma se ve, qué textos, cuánto negro hay
// y cuánto lleva volando el módulo de ascenso. La escena está en visual/despegueLM.ts, la capa de pantalla en
// ui/cinematicaUi.ts, y juego.ts lo une.
//
// Datos históricos (ALSJ, Apollo 17, "Return to Orbit"): el LRV quedó aparcado al este del LM y su cámara de TV la
// manejaba desde Houston Ed Fendell, que la inclinó hacia arriba para seguir al módulo de ascenso. Al encender el
// motor de ascenso, el módulo despega en el acto (no hay espera en la plataforma): por eso la ignición y el despegue
// son el mismo instante de la línea de tiempo.
//
// Cada texto en pantalla lo lee también el mentor (la misma voz del museo). Como la voz puede durar más que su hueco en
// la línea de tiempo, la cinemática se detiene justo antes de que el texto empiece a desvanecerse y espera a que la
// frase termine (como la presentación del LRV). Si la voz nunca avisa, sigue sola pasados `esperaVozMaxS` segundos.

import LINEA from './cinematicaDespegue.json' with { type: 'json' };
import type { ClaveTexto } from '../i18n';

export type IdTomaDespegue = 'exteriorLRV' | 'camaraTV' | 'seguimientoTV' | 'ventanaLM' | 'finalLRV';
/** Aspecto de la imagen: `tv` = transmisión de los años 70; `pelicula` = cámara de cine de la ventana del LM. */
export type EstiloToma = 'limpio' | 'tv' | 'pelicula';

export interface TomaDespegue {
  id: IdTomaDespegue;
  desdeS: number;
  hastaS: number;
  estilo: EstiloToma;
}

export interface TextoDespegue {
  clave: ClaveTexto;
  desdeS: number;
  hastaS: number;
  /** Duración (s) de la entrada y de la salida. */
  fundidoS: number;
}

/** Tramo de fundido a negro: la opacidad va de `de` a `a` entre `desdeS` y `hastaS`. */
export interface TramoFundido {
  desdeS: number;
  hastaS: number;
  de: number;
  a: number;
}

export interface LineaTiempoDespegue {
  /** Instante en que la escena pasa al modo libre (con la pantalla en negro). */
  libreS: number;
  /** Fin de todo (después del fundido de salida). */
  duracionS: number;
  tomas: readonly TomaDespegue[];
  textos: readonly TextoDespegue[];
  fundidos: readonly TramoFundido[];
  /** Encendido del motor de ascenso, que es también el despegue. */
  ignicionS: number;
  /** Retraso con el que la cámara de TV sigue al módulo (el operador estaba a 1.3 s de luz, más su reacción). */
  seguimientoRetrasoS: number;
  /** Toma desde el módulo: qué tramo del vuelo se ve (s desde el despegue), repartido a lo largo de la toma. */
  ventanaLM: { vueloDesdeS: number; vueloHastaS: number };
  /** Bajada del Sol (°) en el plano final, para alargar la sombra del LRV. Recurso visual, no dato histórico. */
  solFinal: { desdeS: number; hastaS: number; bajadaGrados: number };
  /** Lo más que la cinemática espera parada a que termine la voz de un texto (red por si la voz no avisa). */
  esperaVozMaxS: number;
}

export const LINEA_DESPEGUE = LINEA as LineaTiempoDespegue;

/** Clave de localStorage para reanudar tras recargar. Subir la versión si cambia lo que se guarda. */
export const CLAVE_PROGRESO_DESPEGUE = 'museo-espacial:cinematica-despegue:v1';
/** Cada cuánto (s) se guarda el progreso mientras corre. */
const INTERVALO_GUARDADO_S = 0.5;

export type EventoCinematica =
  /** Empieza una toma nueva. */
  | { tipo: 'toma'; toma: TomaDespegue }
  /** Aparece un texto: el mentor lo lee. Al terminar la voz hay que llamar a `vozTermino(clave)`. */
  | { tipo: 'texto'; clave: ClaveTexto }
  /** La pantalla está en negro y la escena pasa al modo libre (también al saltar). */
  | { tipo: 'libre' }
  /** Terminó el fundido de salida: la cinemática ya no dibuja nada. */
  | { tipo: 'fin' };

/** Estado de un instante, para la escena y la capa de pantalla. */
export interface EstadoDespegue {
  tiempoS: number;
  /** Toma activa, o null en la pausa inicial y después del modo libre. */
  toma: TomaDespegue | null;
  /** Segundos desde el inicio de la toma y progreso (0–1) dentro de ella. */
  tiempoTomaS: number;
  progresoToma: number;
  /** Segundos de vuelo del módulo de ascenso (negativo antes del despegue). En la toma desde el módulo, el de su tramo. */
  vueloS: number;
  /** Bajada del Sol (°) en este instante. */
  bajadaSolGrados: number;
  /** 0–1: en el seguimiento, la cámara de TV se sobreexpone hasta que el módulo es solo un punto de luz. */
  sobreexposicion: number;
  /** Retraso (s) con el que la cámara de TV sigue al módulo (de la línea de tiempo). */
  retrasoSeguimientoS: number;
}

const suave = (x: number): number => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};

/** Opacidad del negro en `tiempoS`: el último tramo que ya empezó manda; antes de todos, 0. */
export function fundidoEn(fundidos: readonly TramoFundido[], tiempoS: number): number {
  let valor = 0;
  for (const f of fundidos) {
    if (tiempoS < f.desdeS) break;
    const d = f.hastaS - f.desdeS;
    valor = d <= 0 ? f.a : f.de + (f.a - f.de) * Math.min(1, (tiempoS - f.desdeS) / d);
  }
  return valor;
}

/** Opacidad (0–1) de un texto en `tiempoS`, con entrada y salida suaves. */
export function opacidadTexto(texto: TextoDespegue, tiempoS: number): number {
  if (tiempoS <= texto.desdeS || tiempoS >= texto.hastaS) return 0;
  const f = Math.max(1e-3, texto.fundidoS);
  return Math.min(suave((tiempoS - texto.desdeS) / f), suave((texto.hastaS - tiempoS) / f));
}

/** Toma activa en `tiempoS`, o null. */
export function tomaEn(linea: LineaTiempoDespegue, tiempoS: number): TomaDespegue | null {
  if (tiempoS >= linea.libreS) return null;
  return linea.tomas.find((t) => tiempoS >= t.desdeS && tiempoS < t.hastaS) ?? null;
}

/** Estado completo de la cinemática en `tiempoS`. Función pura: sirve igual al reanudar en mitad. */
export function estadoEn(linea: LineaTiempoDespegue, tiempoS: number): EstadoDespegue {
  const toma = tomaEn(linea, tiempoS);
  const tiempoTomaS = toma ? tiempoS - toma.desdeS : 0;
  const progresoToma = toma ? Math.min(1, tiempoTomaS / Math.max(1e-3, toma.hastaS - toma.desdeS)) : 0;
  let vueloS = tiempoS - linea.ignicionS;
  if (toma?.id === 'ventanaLM') {
    const { vueloDesdeS, vueloHastaS } = linea.ventanaLM;
    vueloS = vueloDesdeS + (vueloHastaS - vueloDesdeS) * progresoToma;
  }
  const { desdeS, hastaS, bajadaGrados } = linea.solFinal;
  const bajadaSolGrados = tiempoS >= linea.libreS ? 0 : bajadaGrados * suave((tiempoS - desdeS) / Math.max(1e-3, hastaS - desdeS));
  const sobreexposicion = toma?.id === 'seguimientoTV' ? suave(progresoToma * 1.15) : 0;
  return { tiempoS, toma, tiempoTomaS, progresoToma, vueloS, bajadaSolGrados, sobreexposicion, retrasoSeguimientoS: linea.seguimientoRetrasoS };
}

/** Lee el progreso guardado (s), o null si no hay ninguna cinemática a medias. */
export function cargarProgresoDespegue(): number | null {
  try {
    const crudo = localStorage.getItem(CLAVE_PROGRESO_DESPEGUE);
    if (!crudo) return null;
    const dato = JSON.parse(crudo) as { tiempoS?: unknown };
    return typeof dato.tiempoS === 'number' && Number.isFinite(dato.tiempoS) && dato.tiempoS >= 0 ? dato.tiempoS : null;
  } catch {
    return null;
  }
}

function guardarProgreso(tiempoS: number): void {
  try {
    localStorage.setItem(CLAVE_PROGRESO_DESPEGUE, JSON.stringify({ tiempoS }));
  } catch {
    // Sin localStorage, la cinemática no se reanuda al recargar; sigue igual.
  }
}

export function borrarProgresoDespegue(): void {
  try {
    localStorage.removeItem(CLAVE_PROGRESO_DESPEGUE);
  } catch {
    // Nada que borrar.
  }
}

export class CinematicaDespegue {
  private t: number;
  private tomaPrevia: TomaDespegue | null = null;
  private libreEmitido: boolean;
  private finEmitido = false;
  private ultimoGuardadoS = -Infinity;
  private readonly linea: LineaTiempoDespegue;
  /** Guarda el progreso en localStorage para reanudar al recargar. */
  private readonly persistir: boolean;
  /** Textos ya leídos (o que quedaron atrás al reanudar u omitir). */
  private readonly dichos = new Set<ClaveTexto>();
  /** Texto cuya voz aún suena, y cuánto lleva la cinemática parada esperándola. */
  private vozPendiente: TextoDespegue | null = null;
  private esperaS = 0;

  /**
   * `tiempoInicialS`: para reanudar después de recargar (lo guardado con cargarProgresoDespegue). Por defecto, desde 0.
   * Si ya pasó del modo libre, la cinemática empieza en negro y solo hace el fundido de salida.
   */
  constructor(tiempoInicialS = 0, linea: LineaTiempoDespegue = LINEA_DESPEGUE, persistir = true) {
    this.linea = linea;
    this.persistir = persistir;
    this.t = Math.max(0, Math.min(tiempoInicialS, linea.libreS));
    this.libreEmitido = false;
    // Al reanudar, los textos que ya pasaron no se vuelven a leer; el que está en pantalla, sí.
    for (const texto of linea.textos) if (this.t >= texto.hastaS - texto.fundidoS) this.dichos.add(texto.clave);
  }

  /** La cinemática está parada esperando a que termine la voz de un texto. */
  get esperandoVoz(): boolean {
    return this.vozPendiente !== null && this.t >= this.limiteVoz(this.vozPendiente);
  }

  /** La voz del texto `clave` terminó: la cinemática sigue. */
  vozTermino(clave: ClaveTexto): void {
    if (this.vozPendiente?.clave === clave) this.liberarVoz();
  }

  /** Instante en que el texto empieza a desvanecerse: ahí se espera a la voz. */
  private limiteVoz(texto: TextoDespegue): number {
    return texto.hastaS - texto.fundidoS;
  }

  private liberarVoz(): void {
    this.vozPendiente = null;
    this.esperaS = 0;
  }

  get tiempoS(): number {
    return this.t;
  }

  get estado(): EstadoDespegue {
    return estadoEn(this.linea, this.t);
  }

  /** Opacidad del negro (0–1). */
  get fundido(): number {
    return fundidoEn(this.linea.fundidos, this.t);
  }

  /** Textos visibles con su opacidad. */
  get textos(): { clave: ClaveTexto; opacidad: number }[] {
    return this.linea.textos
      .map((texto) => ({ clave: texto.clave, opacidad: opacidadTexto(texto, this.t) }))
      .filter((texto) => texto.opacidad > 0.001);
  }

  /** Ya pasó al modo libre: solo queda el fundido de salida (y no se puede omitir). */
  get enModoLibre(): boolean {
    return this.libreEmitido;
  }

  get terminada(): boolean {
    return this.finEmitido;
  }

  /** Omitir: salta al modo libre (pantalla en negro) y deja solo el fundido de salida. */
  saltar(): EventoCinematica[] {
    if (this.libreEmitido) return [];
    this.t = this.linea.libreS;
    this.liberarVoz();
    for (const texto of this.linea.textos) this.dichos.add(texto.clave);
    return this.avanzarEventos();
  }

  /** Avanza `dtS` segundos y devuelve los eventos ocurridos. */
  actualizar(dtS: number): EventoCinematica[] {
    if (this.finEmitido) return [];
    const dt = Math.max(0, dtS);
    let siguiente = Math.min(this.linea.duracionS, this.t + dt);
    const pendiente = this.vozPendiente;
    if (pendiente) {
      const limite = this.limiteVoz(pendiente);
      if (siguiente > limite) {
        // Parada justo antes del desvanecido del texto, hasta que la voz termine (o se agote la espera).
        this.esperaS += siguiente - Math.max(this.t, limite);
        if (this.esperaS >= this.linea.esperaVozMaxS) this.liberarVoz();
        else siguiente = Math.max(this.t, limite);
      }
    }
    this.t = siguiente;
    return this.avanzarEventos();
  }

  private avanzarEventos(): EventoCinematica[] {
    const eventos: EventoCinematica[] = [];
    const toma = tomaEn(this.linea, this.t);
    if (toma && toma !== this.tomaPrevia) eventos.push({ tipo: 'toma', toma });
    this.tomaPrevia = toma;
    for (const texto of this.linea.textos) {
      if (this.dichos.has(texto.clave) || this.t < texto.desdeS || this.t >= this.limiteVoz(texto)) continue;
      this.dichos.add(texto.clave);
      this.vozPendiente = texto;
      this.esperaS = 0;
      eventos.push({ tipo: 'texto', clave: texto.clave });
    }
    if (!this.libreEmitido && this.t >= this.linea.libreS) {
      this.libreEmitido = true;
      if (this.persistir) borrarProgresoDespegue();
      eventos.push({ tipo: 'libre' });
    } else if (!this.libreEmitido && this.persistir && this.t - this.ultimoGuardadoS >= INTERVALO_GUARDADO_S) {
      this.ultimoGuardadoS = this.t;
      guardarProgreso(this.t);
    }
    if (!this.finEmitido && this.t >= this.linea.duracionS) {
      this.finEmitido = true;
      eventos.push({ tipo: 'fin' });
    }
    return eventos;
  }
}
