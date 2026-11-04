// Lógica del museo (SPEC 7). No importa Three.js ni modelos: todo lo visual va por visual.museo.
// El que maneja esta clase (src/game/juego.ts) le pasa las entradas de cada fotograma y escucha
// los eventos para mostrar textos, voz y la pantalla de misión.

import { visual } from '../visual/museo';

/** Segundos que el rayo debe tocar una vitrina para seleccionarla (SPEC 5.3, 7.2). */
export const SEGUNDOS_SENALAR = 1.5;
/** Metros que avanza el jugador por cada paso (una alternancia de piernas). Valor provisional. */
export const METROS_POR_PASO = 0.6;

export type VitrinaId = 'vitrina_lrv' | 'vitrina_perseverance';
export type Mision = 'luna' | 'marte';

const MISION_DE: Record<VitrinaId, Mision> = {
  vitrina_lrv: 'luna',
  vitrina_perseverance: 'marte',
};

export function esVitrina(id: string | null): id is VitrinaId {
  return id !== null && id in MISION_DE;
}

export type Pantalla = { tipo: 'museo' } | { tipo: 'mision'; mision: Mision };

export type EventoMuseo =
  | { tipo: 'vitrinaSeleccionada'; id: VitrinaId }
  | { tipo: 'misionAbierta'; mision: Mision }
  | { tipo: 'regresoMuseo' };

/** Entrada de un fotograma de juego, ya traducida a acciones de museo. */
export interface EntradaMuseo {
  /** Instante actual (s), para medir los 1.5 s de señalar. */
  ahoraS: number;
  /** Giro de la vista en grados para este fotograma (+ = derecha). */
  giroGrados: number;
  /** Pasos nuevos desde el fotograma anterior. */
  pasos: number;
  /** Vitrina que apunta el rayo ahora mismo, o null. */
  apuntando: string | null;
  /** True si hubo un aplauso o se pulsó la barra espaciadora en este fotograma. */
  accion: boolean;
}

type Oyente = (evento: EventoMuseo) => void;

export class Museo {
  private pantallaActual: Pantalla = { tipo: 'museo' };
  private seleccionada: VitrinaId | null = null;
  private candidata: VitrinaId | null = null;
  private inicioCandidata = 0;
  private readonly oyentes: Oyente[] = [];

  /** Pantalla actual: el museo o una misión (que todavía no existe). */
  get pantalla(): Pantalla {
    return this.pantallaActual;
  }

  /** Vitrina seleccionada (con halo) o null. */
  get vitrinaSeleccionada(): VitrinaId | null {
    return this.seleccionada;
  }

  onEvento(oyente: Oyente): void {
    this.oyentes.push(oyente);
  }

  /** Procesa un fotograma. Solo mueve la cámara y señala mientras se está en el museo. */
  actualizar(entrada: EntradaMuseo): void {
    if (this.pantallaActual.tipo === 'mision') {
      if (entrada.accion) this.volver();
      return;
    }

    visual.museo.moverCamara(entrada.giroGrados, entrada.pasos * METROS_POR_PASO);

    const apuntada = esVitrina(entrada.apuntando) ? entrada.apuntando : null;
    if (apuntada !== this.candidata) {
      this.candidata = apuntada;
      this.inicioCandidata = entrada.ahoraS;
    }
    if (
      this.candidata !== null &&
      this.candidata !== this.seleccionada &&
      entrada.ahoraS - this.inicioCandidata >= SEGUNDOS_SENALAR
    ) {
      this.seleccionar(this.candidata);
    }

    if (entrada.accion && this.seleccionada !== null) {
      this.abrirMision(MISION_DE[this.seleccionada]);
    }
  }

  /** Vuelve del juego de misión al museo (botón o aplauso). El mentor aparece junto al jugador. */
  volver(): void {
    if (this.pantallaActual.tipo !== 'mision') return;
    this.pantallaActual = { tipo: 'museo' };
    if (this.seleccionada !== null) visual.museo.resaltarVitrina(this.seleccionada, false);
    this.seleccionada = null;
    this.candidata = null;
    visual.museo.mentorAparece();
    this.emitir({ tipo: 'regresoMuseo' });
  }

  private seleccionar(id: VitrinaId): void {
    if (this.seleccionada !== null) visual.museo.resaltarVitrina(this.seleccionada, false);
    this.seleccionada = id;
    visual.museo.resaltarVitrina(id, true);
    visual.museo.mentorAparece();
    this.emitir({ tipo: 'vitrinaSeleccionada', id });
  }

  private abrirMision(mision: Mision): void {
    this.pantallaActual = { tipo: 'mision', mision };
    this.emitir({ tipo: 'misionAbierta', mision });
  }

  private emitir(evento: EventoMuseo): void {
    for (const oyente of this.oyentes) oyente(evento);
  }
}
