// Lógica del museo (SPEC 7). No importa Three.js ni modelos: todo lo visual va por visual.museo.
// El que maneja esta clase (src/game/juego.ts) le pasa las entradas de cada fotograma, llama a
// `tick` en cada vuelta del bucle para el fundido, y escucha los eventos para mostrar textos y voz.

import { visual, type Escena } from '../visual/museo';

/** Segundos que el rayo debe tocar una vitrina para seleccionarla (SPEC 5.3, 7.2). */
export const SEGUNDOS_SENALAR = 1.5;
/** Duración del fundido a negro (s): la mitad oscurece, la mitad aclara. */
export const DURACION_FUNDIDO_S = 1.0;
export type VitrinaId = 'vitrina_lrv' | 'vitrina_perseverance' | 'vitrina_cassini';
export type Mision = Escena;

/**
 * Misión de cada vitrina. Con null, la vitrina solo tiene la explicación del mentor: al terminar se deselecciona
 * sola y se puede elegir otra (Cassini aún no tiene escena).
 */
const MISION_DE: Record<VitrinaId, Mision | null> = {
  vitrina_lrv: 'luna',
  vitrina_perseverance: 'marte',
  vitrina_cassini: null,
};

/**
 * Vitrinas con presentación antes de la misión: al entrar se ve la animación del LRV (game/presentacionLRV.ts) y,
 * al terminar, se pasa a la misión igual que antes.
 */
const CON_PRESENTACION: ReadonlySet<VitrinaId> = new Set(['vitrina_lrv']);

export function esVitrina(id: string | null): id is VitrinaId {
  return id !== null && id in MISION_DE;
}

export type Pantalla = { tipo: 'museo' } | { tipo: 'presentacion'; mision: Mision } | { tipo: 'mision'; mision: Mision };

export type EventoMuseo =
  | { tipo: 'vitrinaSeleccionada'; id: VitrinaId }
  /** `explicada`: la vitrina no tiene misión y el mentor ya terminó; la voz y el subtítulo acaban solos. */
  | { tipo: 'vitrinaDeseleccionada'; id: VitrinaId; explicada: boolean }
  /** El mentor terminó de hablar de esta vitrina: ya se puede aplaudir para entrar. */
  | { tipo: 'listoParaEntrar'; id: VitrinaId }
  /** Empieza la presentación previa a la misión. `visible`: false si la escena 3D no se pudo montar. */
  | { tipo: 'presentacionAbierta'; mision: Mision; visible: boolean }
  | { tipo: 'misionAbierta'; mision: Mision }
  | { tipo: 'regresoMuseo' };

/**
 * Fase de la vitrina seleccionada (SPEC 7.2):
 * - `hablando`: el mentor explica la vitrina; aplaudir o pulsar espacio no hace nada.
 * - `listo`: el mentor ya terminó; aplaudir o pulsar espacio entra a la escena.
 */
type Fase = 'hablando' | 'listo';

/** Entrada de un fotograma de juego, ya traducida a acciones de museo. */
export interface EntradaMuseo {
  /** Instante actual (s), para medir los 1.5 s de señalar. */
  ahoraS: number;
  /** Giro de la vista en grados para este fotograma (+ = derecha). */
  giroGrados: number;
  /** Cabeceo de la vista en grados para este fotograma (+ = arriba). */
  cabeceoGrados: number;
  /** Metros que avanza el jugador en este fotograma (ya calculados por la fuente de entrada). Negativo = atrás. */
  metros: number;
  /** Metros de paso lateral en este fotograma (+ = derecha). Solo con teclado; con la cámara es 0. */
  lateralMetros: number;
  /** Vitrina bajo el cursor (o apuntada por el rayo) ahora mismo, o null. */
  apuntando: string | null;
  /** True si hubo un aplauso o se pulsó la barra espaciadora en este fotograma. */
  accion: boolean;
}

type Oyente = (evento: EventoMuseo) => void;

/** Fundido en curso. `cambio` se ejecuta una vez, a mitad del fundido (con la pantalla en negro). */
interface Transicion {
  /** Instante de inicio (s); null hasta el primer `tick`. */
  inicioS: number | null;
  cambio: () => void;
  cambiado: boolean;
}

export class Museo {
  private pantallaActual: Pantalla = { tipo: 'museo' };
  private seleccionada: VitrinaId | null = null;
  /** Fase de la vitrina seleccionada; null si no hay ninguna seleccionada. */
  private fase: Fase | null = null;
  private candidata: VitrinaId | null = null;
  /**
   * Vitrina sin misión que el mentor acaba de explicar: no se vuelve a seleccionar hasta que el rayo o el cursor
   * salgan de ella (si no, seguir señalándola repetiría la explicación).
   */
  private recienExplicada: VitrinaId | null = null;
  private inicioCandidata = 0;
  /** Tiempo del último fotograma procesado: sirve para calcular el progreso de la selección. */
  private ultimoAhoraS = 0;
  private transicion: Transicion | null = null;
  private readonly oyentes: Oyente[] = [];

  /** Pantalla actual: el museo o una escena de misión. */
  get pantalla(): Pantalla {
    return this.pantallaActual;
  }

  /** Hay un fundido en curso: no se procesan entradas. */
  get enTransicion(): boolean {
    return this.transicion !== null;
  }

  /** Vitrina seleccionada (con halo) o null. */
  get vitrinaSeleccionada(): VitrinaId | null {
    return this.seleccionada;
  }

  onEvento(oyente: Oyente): void {
    this.oyentes.push(oyente);
  }

  /**
   * Avanza el fundido a negro (1 s en total). Se llama en cada vuelta del bucle, con o sin
   * fotograma nuevo, porque el fundido tiene su propio reloj.
   */
  tick(ahoraS: number): void {
    const t = this.transicion;
    if (!t) return;
    t.inicioS ??= ahoraS;
    const progreso = (ahoraS - t.inicioS) / DURACION_FUNDIDO_S;
    if (progreso >= 1) {
      visual.museo.fundido(0);
      this.transicion = null;
      return;
    }
    if (progreso >= 0.5 && !t.cambiado) {
      t.cambiado = true;
      t.cambio();
    }
    visual.museo.fundido(Math.min(progreso, 1 - progreso) * 2);
  }

  /** Llenado (0–1) del tiempo de señalar la vitrina apuntada. 0 si no se apunta a ninguna o ya hay una seleccionada. */
  get progresoSenalar(): number {
    if (this.candidata === null || this.seleccionada !== null) return 0;
    return Math.min(1, Math.max(0, (this.ultimoAhoraS - this.inicioCandidata) / SEGUNDOS_SENALAR));
  }

  /** Procesa un fotograma. Solo mueve la cámara y señala mientras se está en el museo. */
  actualizar(entrada: EntradaMuseo): void {
    this.ultimoAhoraS = entrada.ahoraS;
    // Durante un fundido no hay entradas: evita disparos dobles y movimiento a mitad de transición.
    if (this.transicion) return;

    if (this.pantallaActual.tipo === 'mision') {
      if (entrada.accion) this.volver();
      return;
    }
    // Durante la presentación no hay entradas: ni mover la cámara, ni aplaudir. Solo Enter la salta (juego.ts).
    if (this.pantallaActual.tipo === 'presentacion') return;

    // Con una vitrina seleccionada, el flujo (explicación, aviso y entrada) no lo interrumpe nada (SPEC 7.2):
    // ni el cursor, ni la cabeza, ni la caminata, ni perder el seguimiento. La selección no cambia hasta entrar.
    if (this.seleccionada !== null) {
      // Aplauso o espacio: entra solo cuando el mentor ya terminó. Mientras habla, no hace nada.
      // No se comprueba dónde está el jugador ni hacia dónde mira.
      const mision = MISION_DE[this.seleccionada];
      if (entrada.accion && this.fase === 'listo' && mision !== null) {
        const id = this.seleccionada;
        this.iniciarTransicion(() => (CON_PRESENTACION.has(id) ? this.abrirPresentacion(mision) : this.abrirMision(mision)));
        return;
      }
      visual.museo.moverCamara(entrada.giroGrados, entrada.metros, entrada.cabeceoGrados, entrada.lateralMetros);
      return;
    }

    visual.museo.moverCamara(entrada.giroGrados, entrada.metros, entrada.cabeceoGrados, entrada.lateralMetros);

    let apuntada = esVitrina(entrada.apuntando) ? entrada.apuntando : null;
    if (apuntada === this.recienExplicada) apuntada = null;
    else this.recienExplicada = null;
    if (apuntada !== this.candidata) {
      this.candidata = apuntada;
      this.inicioCandidata = entrada.ahoraS;
    }
    if (this.candidata !== null && entrada.ahoraS - this.inicioCandidata >= SEGUNDOS_SENALAR) {
      this.seleccionar(this.candidata);
    }
  }

  /** Vuelve del escenario al museo (botón o aplauso). Con fundido; el mentor aparece al terminar. */
  volver(): void {
    if (this.transicion || this.pantallaActual.tipo !== 'mision') return;
    this.iniciarTransicion(() => this.completarVolver());
  }

  /**
   * Fin de la presentación (terminó o se saltó y ya se dijo "Estás listo para la misión"): entra a la misión con el
   * fundido de siempre, como si se hubiera aplaudido sin presentación.
   */
  terminarPresentacion(): void {
    if (this.transicion || this.pantallaActual.tipo !== 'presentacion') return;
    const { mision } = this.pantallaActual;
    this.iniciarTransicion(() => this.abrirMision(mision));
  }

  /**
   * Entra a una misión directamente desde el museo, sin vitrina ni presentación, con el fundido de siempre. Lo usa
   * juego.ts para reanudar la cinemática del despegue después de recargar la página.
   */
  abrirMisionDirecta(mision: Mision): void {
    if (this.transicion || this.pantallaActual.tipo !== 'museo') return;
    this.iniciarTransicion(() => this.abrirMision(mision));
  }

  private iniciarTransicion(cambio: () => void): void {
    this.transicion = { inicioS: null, cambio, cambiado: false };
  }

  /**
   * Fin de voz del mentor para la vitrina `id` (lo llama juego.ts al terminar la explicación).
   * Si la vitrina sigue seleccionada, se habilita entrar con el aplauso o la barra espaciadora.
   */
  terminoVoz(id: VitrinaId): void {
    if (this.seleccionada !== id || this.fase !== 'hablando') return;
    if (MISION_DE[id] === null) {
      this.recienExplicada = id;
      this.candidata = null;
      this.deseleccionar(true);
      return;
    }
    this.fase = 'listo';
    this.emitir({ tipo: 'listoParaEntrar', id });
  }

  private seleccionar(id: VitrinaId): void {
    this.seleccionada = id;
    this.fase = 'hablando';
    this.emitir({ tipo: 'vitrinaSeleccionada', id });
  }

  /** Solo se llama al abrir la misión: durante el flujo de una vitrina nunca se deselecciona. */
  private deseleccionar(explicada = false): void {
    if (this.seleccionada === null) return;
    const id = this.seleccionada;
    this.seleccionada = null;
    this.fase = null;
    this.emitir({ tipo: 'vitrinaDeseleccionada', id, explicada });
  }

  /** La vitrina sigue seleccionada durante la presentación; se deselecciona al abrir la misión. */
  private abrirPresentacion(mision: Mision): void {
    this.candidata = null;
    this.pantallaActual = { tipo: 'presentacion', mision };
    const visible = visual.museo.entrarPresentacion();
    this.emitir({ tipo: 'presentacionAbierta', mision, visible });
  }

  private abrirMision(mision: Mision): void {
    this.deseleccionar();
    this.candidata = null;
    this.pantallaActual = { tipo: 'mision', mision };
    visual.museo.entrarEscena(mision);
    this.emitir({ tipo: 'misionAbierta', mision });
  }

  private completarVolver(): void {
    this.pantallaActual = { tipo: 'museo' };
    this.candidata = null;
    visual.museo.volverAlMuseo();
    visual.museo.mentorAparece();
    this.emitir({ tipo: 'regresoMuseo' });
  }

  private emitir(evento: EventoMuseo): void {
    for (const oyente of this.oyentes) oyente(evento);
  }
}
